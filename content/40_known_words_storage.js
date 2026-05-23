
function addToKnownWords(word) {
  const lowercaseWord = word.toLowerCase();
  if (!knownWords.has(lowercaseWord)) {
    knownWords.add(lowercaseWord);

    hidePopup();
    removeHighlightForWord(lowercaseWord);

    // Refresh the sidebar immediately when it exists; iframe contexts do not own sidebar UI.
    renderWordList();

    // 延迟保存，避免立即触发存储变化监听器
    setTimeout(() => {
      saveKnownWords((success) => {
        if (!success) {
          knownWords.delete(lowercaseWord);
          console.error('Known word was not added because sync storage did not commit.');
          reHighlightWord(lowercaseWord);
          renderWordList();
        }
      });
    }, ADD_KNOWN_WORD_SAVE_DELAY_MS);
  }
}

function getKnownWordsChunkIndex(key) {
  if (!key || !key.startsWith(STORAGE_KEY_PREFIX)) return null;
  const index = Number(key.slice(STORAGE_KEY_PREFIX.length));
  return Number.isInteger(index) && index >= 0 ? index : null;
}

// This block owns the sync chunk contract used across extension versions.
function getKnownWordStorageKeys(items, predicate = () => true) {
  return Object.keys(items || {}).filter((key) => {
    const chunkIndex = getKnownWordsChunkIndex(key);
    return chunkIndex !== null && predicate(chunkIndex, key);
  });
}

function chunkKnownWords(words) {
  const chunks = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE) {
    chunks.push(words.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

function beginKnownWordsSyncWrite() {
  knownWordsSyncWriteDepth += 1;
}

function finishKnownWordsSyncWrite() {
  setTimeout(() => {
    knownWordsSyncWriteDepth = Math.max(0, knownWordsSyncWriteDepth - 1);
  }, KNOWN_WORDS_SYNC_SUPPRESS_DELAY_MS);
}

function isKnownWordsSyncWriteInProgress() {
  return knownWordsSyncWriteDepth > 0;
}

function completeStorageOperation(callback, success = true) {
  if (callback) callback(success);
}

function flushKnownWordsSaveCallbacks(success) {
  const callbacks = knownWordsSaveCallbacks;
  knownWordsSaveCallbacks = [];
  callbacks.forEach((callback) => completeStorageOperation(callback, success));
}

function setKnownWordsMetadata(wordCount, chunkCount, callback, options = {}) {
  const metadata = {
    knownWordsCount: wordCount,
    knownWordsChunkCount: chunkCount
  };
  if (options.commit !== false) {
    metadata.knownWordsUpdated = Date.now();
  }

  chrome.storage.sync.set(metadata, () => {
    if (chrome.runtime.lastError) {
      console.error(`Error saving known words metadata: ${chrome.runtime.lastError.message}`);
      completeStorageOperation(callback, false);
      return;
    }
    completeStorageOperation(callback, true);
  });
}

function writeKnownWordChunks(chunks, wordCount, onComplete) {
  const saveBatch = (index) => {
    if (index >= chunks.length) {
      completeStorageOperation(onComplete, true);
      return;
    }

    chrome.storage.sync.set({ [`${STORAGE_KEY_PREFIX}${index}`]: chunks[index] }, () => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        if (errorMsg.includes('quota') || errorMsg.includes('QUOTA_BYTES')) {
          console.error(
            `Storage quota exceeded. Word count: ${wordCount}. ` +
              'Please export and reduce word list.'
          );
        } else {
          console.error(`Error saving known words: ${errorMsg}`);
        }
        completeStorageOperation(onComplete, false);
        return;
      }
      setTimeout(() => saveBatch(index + 1), STORAGE_SAVE_BATCH_DELAY_MS);
    });
  };

  saveBatch(0);
}

function removeKeysThen(keysToRemove, callback) {
  if (!keysToRemove || keysToRemove.length === 0) {
    completeStorageOperation(callback, true);
    return;
  }

  chrome.storage.sync.remove(keysToRemove, () => {
    if (chrome.runtime.lastError) {
      console.error(`Error removing known word keys: ${chrome.runtime.lastError.message}`);
      completeStorageOperation(callback, false);
      return;
    }
    completeStorageOperation(callback, true);
  });
}

function persistKnownWordsSnapshot(knownWordsArray, callback) {
  beginKnownWordsSyncWrite();
  const completeSave = (success = true) => {
    finishKnownWordsSyncWrite();
    completeStorageOperation(callback, success);
  };

  try {
    if (knownWordsArray.length === 0) {
      chrome.storage.sync.get(null, (items) => {
        if (chrome.runtime.lastError) {
          console.error(
            `Error reading existing known word chunks: ${chrome.runtime.lastError.message}`
          );
          completeSave(false);
          return;
        }
        const staleChunkKeys = getKnownWordStorageKeys(items);
        removeKeysThen(staleChunkKeys, (removed) => {
          if (!removed) {
            completeSave(false);
            return;
          }
          setKnownWordsMetadata(0, 0, completeSave);
        });
      });
      return;
    }

    const chunks = chunkKnownWords(knownWordsArray);

    chrome.storage.sync.get(null, (items) => {
      if (chrome.runtime.lastError) {
        console.error(
          `Error reading existing known word chunks: ${chrome.runtime.lastError.message}`
        );
        completeSave(false);
        return;
      }

      const staleChunkKeys = getKnownWordStorageKeys(items, (chunkIndex) => {
        return chunkIndex >= chunks.length;
      });

      const finishSave = (chunksSaved) => {
        if (!chunksSaved) {
          completeSave(false);
          return;
        }
        removeKeysThen(staleChunkKeys, (removed) => {
          if (!removed) {
            completeSave(false);
            return;
          }
          setKnownWordsMetadata(knownWordsArray.length, chunks.length, completeSave);
        });
      };

      writeKnownWordChunks(chunks, knownWordsArray.length, finishSave);
    });
  } catch (error) {
    console.error('Error saving known words:', error);
    completeSave(false);
  }
}

function runKnownWordsSave() {
  knownWordsSaveInProgress = true;
  const snapshot = Array.from(knownWords);

  persistKnownWordsSnapshot(snapshot, (success) => {
    if (knownWordsSaveQueued) {
      knownWordsSaveQueued = false;
      runKnownWordsSave();
      return;
    }

    knownWordsSaveInProgress = false;
    flushKnownWordsSaveCallbacks(success);
  });
}

function saveKnownWords(callback) {
  if (callback) knownWordsSaveCallbacks.push(callback);

  if (knownWordsSaveInProgress) {
    knownWordsSaveQueued = true;
    return;
  }

  runKnownWordsSave();
}

function getSortedKnownWordChunkKeys(items) {
  return getKnownWordStorageKeys(items).sort((a, b) => {
    return getKnownWordsChunkIndex(a) - getKnownWordsChunkIndex(b);
  });
}

function getKnownWordsMetadataCount(items) {
  const count = items ? Number(items.knownWordsCount) : NaN;
  return Number.isInteger(count) && count >= 0 ? count : null;
}

function getKnownWordsMetadataChunkCount(items) {
  const count = items ? Number(items.knownWordsChunkCount) : NaN;
  return Number.isInteger(count) && count >= 0 ? count : null;
}

function readKnownWordsFromChunks(result, chunkKeys, totalWords) {
  const loadedWords = [];
  chunkKeys.forEach((key) => {
    const chunk = result[key] || [];
    if (Array.isArray(chunk)) {
      loadedWords.push(...chunk);
    }
  });
  if (totalWords > 0 && loadedWords.length > totalWords) {
    loadedWords.length = totalWords;
  }
  return loadedWords;
}

function reconcileLoadedKnownWordsCount(loadedWords, totalWords, chunkKeys, expectedChunks, retry) {
  const mismatch = Math.abs(loadedWords.length - totalWords);
  if (mismatch <= WORD_COUNT_MISMATCH_WARNING_THRESHOLD) return false;

  if (chunkKeys.length < expectedChunks && retry.retryCount < STORAGE_LOAD_MAX_RETRIES) {
    setTimeout(
      () => loadKnownWords(retry.callback, retry.retryCount + 1),
      STORAGE_LOAD_RETRY_DELAY_MS
    );
    return true;
  }

  if (loadedWords.length <= totalWords) {
    console.warn(`Word count mismatch! Expected: ${totalWords}, Loaded: ${loadedWords.length}`);
  }
  setKnownWordsMetadata(loadedWords.length, chunkKeys.length, null, { commit: false });
  return false;
}

function loadKnownWords(callback, retryCount = 0) {
  try {
    chrome.storage.sync.get(null, (result) => {
      if (chrome.runtime.lastError) {
        console.error(`Error loading known words: ${chrome.runtime.lastError.message}`);
        if (callback) callback();
        return;
      }

      const allChunkKeys = getSortedKnownWordChunkKeys(result);
      const storedWordCount = getKnownWordsMetadataCount(result);
      const storedChunkCount = getKnownWordsMetadataChunkCount(result);
      const hasChunkData = allChunkKeys.length > 0;
      const hasMissingWordCount = storedWordCount === null && hasChunkData;
      const hasMissingChunkCount = storedChunkCount === null && hasChunkData;
      const hasMissingMetadata = hasMissingWordCount || hasMissingChunkCount;
      const totalWords = storedWordCount === null ? 0 : storedWordCount;
      const expectedChunks = hasMissingWordCount
        ? allChunkKeys.length
        : storedChunkCount === null
          ? Math.ceil(totalWords / CHUNK_SIZE)
          : storedChunkCount;
      const chunkKeys = allChunkKeys.filter((key) => getKnownWordsChunkIndex(key) < expectedChunks);
      const staleChunkKeys = hasMissingWordCount
        ? []
        : allChunkKeys.filter((key) => getKnownWordsChunkIndex(key) >= expectedChunks);
      if (staleChunkKeys.length > 0) {
        chrome.storage.sync.remove(staleChunkKeys);
      }

      const loadedWords = readKnownWordsFromChunks(result, chunkKeys, totalWords);

      if (hasMissingMetadata) {
        setKnownWordsMetadata(loadedWords.length, chunkKeys.length, null, { commit: false });
      }

      if (
        !hasMissingMetadata &&
        reconcileLoadedKnownWordsCount(loadedWords, totalWords, chunkKeys, expectedChunks, {
          callback,
          retryCount
        })
      ) {
        return;
      }

      const newKnownWords = new Set(loadedWords.map((word) => word.toLowerCase()));
      // Update knownWords set
      knownWords = newKnownWords;

      // Update the sidebar word list if it's open
      if (sidebarOpen) {
        renderWordList();
      }

      if (callback) callback();
    });
  } catch (error) {
    console.error('Error loading known words:', error);
    if (callback) callback();
  }
}

function cleanup() {
  stopHighlightObserver();
  clearHighlightRefreshQueue();
}

function applyCurrentSitePermission(disabledSites = []) {
  const currentHost = window.location.hostname;
  const isEnabled = !disabledSites.includes(currentHost);
  const sitePermission = isTopLevelFrame() ? document.getElementById('sitePermission') : null;

  if (sitePermission) {
    sitePermission.checked = isEnabled;
  }

  if (isEnabled) {
    enableSiteFeatures();
  } else {
    disableSiteFeatures();
  }
}

function hasLocalHighlightSettingsChange(changes) {
  return (
    Object.prototype.hasOwnProperty.call(changes, 'highlightToggle') ||
    Object.prototype.hasOwnProperty.call(changes, 'selectedFiles') ||
    Object.prototype.hasOwnProperty.call(changes, 'uploadedFiles')
  );
}

function setupStorageChangedListener() {
  if (storageChangedListener) return;

  const refreshKnownWordsFromStorage = debounce(() => {
    loadKnownWords(() => {
      if (siteEnabled) {
        updateHighlights();
      }
    });
  }, 100);

  storageChangedListener = (changes, namespace) => {
    if (namespace === 'local') {
      if (Object.prototype.hasOwnProperty.call(changes, 'disabledSites')) {
        applyCurrentSitePermission(changes.disabledSites.newValue || []);
        return;
      }

      if (hasLocalHighlightSettingsChange(changes) && siteEnabled) {
        updateHighlights();
      }
      return;
    }

    if (namespace !== 'sync') return;

    const hasCommittedKnownWordsUpdate =
      Object.prototype.hasOwnProperty.call(changes, 'knownWordsUpdated') &&
      changes.knownWordsUpdated &&
      changes.knownWordsUpdated.newValue !== undefined;

    if (hasCommittedKnownWordsUpdate && !isKnownWordsSyncWriteInProgress()) {
      // 当已知单词相关存储发生变化时，重新加载已知单词
      refreshKnownWordsFromStorage();
    }
  };

  chrome.storage.onChanged.addListener(storageChangedListener);
}

function removeStorageChangedListener() {
  if (!storageChangedListener) return;

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.removeListener(storageChangedListener);
  }
  storageChangedListener = null;
}

function initialize() {
  if (!isExtensionContextValid()) {
    return;
  }
  cleanup();
  initializeHighlighter();

  loadKnownWords(() => {
    if (isTopLevelFrame()) {
      createSidebar();
      renderWordList();
    }
    getCurrentSitePermission().then((isEnabled) => {
      if (isEnabled) {
        enableSiteFeatures();
      } else {
        disableSiteFeatures();
      }
    });
  });

  // 设置存储变化监听器，用于跨页面和跨设备同步已知单词状态
  setupStorageChangedListener();
}
