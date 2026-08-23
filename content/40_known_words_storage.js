
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
  const suffix = key.slice(STORAGE_KEY_PREFIX.length);
  // Number('') and Number(' ') are 0, so require an explicit digit suffix.
  if (!/^\d+$/.test(suffix)) return null;
  return Number(suffix);
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
    if (success) pushKnownWordsToStoreweb(snapshot);

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

function storewebRequest(body, callback) {
  chrome.runtime.sendMessage({ action: 'storewebKnownWords', body }, (response) => {
    if (chrome.runtime.lastError) {
      callback({ error: chrome.runtime.lastError.message });
      return;
    }
    callback(response || { error: 'No response from the extension background' });
  });
}

function isSameWordSet(left, right) {
  if (left.size !== right.size) return false;
  for (const word of left) {
    if (!right.has(word)) return false;
  }
  return true;
}

// 服务端是这条路径上的真相来源。只有内容真的变了才回写 chrome.storage.sync，否则每开一个
// 标签页都要烧掉一轮 sync 写配额（每小时 1800 次，一次全量保存就是几十次）。
function adoptStorewebWords(words) {
  storewebPushedWords = new Set(words);

  const serverWords = new Set(words);
  // 导入的词表里可能有 "well-known"、"don't" 这类 storeWeb 存不下的词形。它们从来没进过
  // 服务端那份列表，所以覆盖时要原样留着，否则一次对账就把它们抹了。
  knownWords.forEach((word) => {
    if (!STOREWEB_WORD_PATTERN.test(word)) serverWords.add(word);
  });
  if (isSameWordSet(serverWords, knownWords)) return;

  knownWords = serverWords;
  renderWordList();
  saveKnownWords();
  if (siteEnabled) updateHighlights();
}

// storeWeb 的 API 一次只收一个 remove，所以多词删除退化成 clear + 全量重推。
function buildStorewebPushBody(target) {
  const adds = [];
  target.forEach((word) => {
    if (!storewebPushedWords.has(word)) adds.push(word);
  });
  const removes = [];
  storewebPushedWords.forEach((word) => {
    if (!target.has(word)) removes.push(word);
  });

  if (removes.length === 0) return adds.length > 0 ? { add: adds } : null;
  if (removes.length === 1) return { remove: removes[0], add: adds };
  return { clear: true, add: Array.from(target) };
}

function pushKnownWordsToStoreweb(snapshot) {
  if (!storewebSyncEnabled || !storewebPushedWords) return;

  // 筛掉服务端不认的词形，它们留在本地，不会让整次请求 400。
  const target = new Set(snapshot.filter((word) => STOREWEB_WORD_PATTERN.test(word)));
  const body = buildStorewebPushBody(target);
  if (!body) return;

  storewebRequest(body, (response) => {
    if (response.error) {
      // 基线不动：下次保存会把这次没推上去的差异一起重算出来补上。
      console.error(`storeWeb sync: push failed (${response.error}).`);
      return;
    }
    storewebPushedWords = new Set(response.words);
  });
}

function refreshKnownWordsFromStoreweb() {
  storewebRequest(null, (response) => {
    if (response.error) {
      console.error(`storeWeb sync: load failed (${response.error}); keeping the local copy.`);
      return;
    }
    adoptStorewebWords(response.words);
  });
}

// 开启同步时的首次对账：两边取并集再回推，任何一边的词都不会被对方的旧副本抹掉。
function mergeKnownWordsWithStoreweb(onDone) {
  storewebRequest(null, (response) => {
    if (response.error) {
      onDone(response.error);
      return;
    }

    const serverWords = new Set(response.words);
    const localOnly = [];
    knownWords.forEach((word) => {
      if (!serverWords.has(word) && STOREWEB_WORD_PATTERN.test(word)) localOnly.push(word);
    });

    if (localOnly.length === 0) {
      adoptStorewebWords(response.words);
      onDone(null, response.words.length);
      return;
    }

    storewebRequest({ add: localOnly }, (pushed) => {
      if (pushed.error) {
        onDone(pushed.error);
        return;
      }
      adoptStorewebWords(pushed.words);
      onDone(null, pushed.words.length);
    });
  });
}

// 先用本地副本点亮页面，再跟服务端对账：storeWeb 不可达时高亮照常工作，而且首屏不必
// 等一个网络往返。
function loadKnownWords(callback) {
  loadKnownWordsFromSyncStorage(() => {
    if (callback) callback();
    if (storewebSyncEnabled) refreshKnownWordsFromStoreweb();
  });
}

function getSortedKnownWordChunkKeys(items) {
  return getKnownWordStorageKeys(items).sort((a, b) => {
    return getKnownWordsChunkIndex(a) - getKnownWordsChunkIndex(b);
  });
}

function getNonNegativeIntegerMetadata(items, key) {
  const count = items ? Number(items[key]) : NaN;
  return Number.isInteger(count) && count >= 0 ? count : null;
}

function getKnownWordsMetadataCount(items) {
  return getNonNegativeIntegerMetadata(items, 'knownWordsCount');
}

function getKnownWordsMetadataChunkCount(items) {
  return getNonNegativeIntegerMetadata(items, 'knownWordsChunkCount');
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
      () => loadKnownWordsFromSyncStorage(retry.callback, retry.retryCount + 1),
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

function loadKnownWordsFromSyncStorage(callback, retryCount = 0) {
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
      removeKeysThen(staleChunkKeys);

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
  const sitePermission = isTopLevelFrame() ? sidebarById('sitePermission') : null;

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

  // 只读本地副本：sync 里的变化要么是别的标签页写的，要么就是它刚从 storeWeb 拉回来的，
  // 再跑一次 storeWeb 请求只是让每个标签页多打一个来回。
  const refreshKnownWordsFromStorage = debounce(() => {
    loadKnownWordsFromSyncStorage(() => {
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

      if (Object.prototype.hasOwnProperty.call(changes, 'popupFont')) {
        applyPopupFont(changes.popupFont.newValue || '');
        return;
      }

      if (Object.prototype.hasOwnProperty.call(changes, 'storewebSyncEnabled')) {
        storewebSyncEnabled = Boolean(changes.storewebSyncEnabled.newValue);
        // 关掉再开的地址可能变了，基线跟着作废，重新拉取才敢再推送。
        storewebPushedWords = null;
        if (storewebSyncEnabled) refreshKnownWordsFromStoreweb();
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

  // loadKnownWords 要先知道同步开关，否则它会跳过 storeWeb 那一轮对账。
  chrome.storage.local.get(['popupFont', 'storewebSyncEnabled'], (result) => {
    if (!hasChromeStorageLastError('Error loading popup font')) {
      popupFontFamily = result.popupFont || '';
      storewebSyncEnabled = Boolean(result.storewebSyncEnabled);
    }

    loadKnownWords(() => {
      if (isTopLevelFrame()) {
        createSidebar();
      }
      getCurrentSitePermission().then((isEnabled) => {
        if (isEnabled) {
          enableSiteFeatures();
        } else {
          disableSiteFeatures();
        }
      });
    });
  });

  // 设置存储变化监听器，用于跨页面和跨设备同步已知单词状态
  setupStorageChangedListener();
}
