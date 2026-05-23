function buildSelectedWordsSet(selectedFiles, uploadedFiles) {
  const wordsSet = new Set();
  if (!selectedFiles || !uploadedFiles || selectedFiles.length === 0) return wordsSet;

  selectedFiles.forEach((fileIndex) => {
    const fileInfo = uploadedFiles[fileIndex];
    if (!fileInfo || !fileInfo.content) return;
    fileInfo.content
      .split('\n')
      .map((w) => w.trim().toLowerCase())
      .forEach((word) => {
        if (word) wordsSet.add(word);
      });
  });
  return wordsSet;
}

function updateHighlightModeStateFromStorage(result) {
  const highlightToggle = result && result.highlightToggle;
  const selectedFiles = (result && result.selectedFiles) || [];
  const uploadedFiles = (result && result.uploadedFiles) || [];

  let mode = 'none';
  let wordsSet = null;

  if (highlightToggle) {
    mode = 'all';
  } else if (selectedFiles.length > 0) {
    mode = 'selected';
    wordsSet = buildSelectedWordsSet(selectedFiles, uploadedFiles);
  }

  highlightModeState = {
    ready: true,
    mode,
    wordsSet,
    selectedFilesCount: selectedFiles.length,
    uploadedFilesCount: uploadedFiles.length
  };
  return highlightModeState;
}

function hasActiveHighlightMode(modeState = highlightModeState) {
  if (!modeState || !modeState.ready) return false;
  if (modeState.mode === 'all') return true;
  return modeState.mode === 'selected' && modeState.wordsSet && modeState.wordsSet.size > 0;
}

function stopHighlightObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (shadowRootObservers.size > 0) {
    shadowRootObservers.forEach((shadowObserver) => shadowObserver.disconnect());
    shadowRootObservers.clear();
  }
  pendingMutationRecords = [];
  mutationFramePending = false;
}

function syncHighlightRuntimeForMode(modeState = highlightModeState) {
  if (!siteEnabled || !hasActiveHighlightMode(modeState)) {
    stopHighlightObserver();
    removeGlobalHoverListeners();
    return;
  }

  setupObserver();
  addGlobalHoverListeners();
}

function clearHighlightRefreshQueue() {
  if (highlightRefreshTimer) {
    clearTimeout(highlightRefreshTimer);
  }
  highlightRefreshTimer = null;
  highlightRefreshQueued = false;
  highlightRefreshInProgress = false;
}

function scheduleHighlightRefresh(delay = FULL_HIGHLIGHT_REFRESH_DEBOUNCE_MS) {
  if (!siteEnabled) return;
  if (highlightRefreshTimer) return;

  highlightRefreshTimer = setTimeout(() => {
    highlightRefreshTimer = null;
    updateHighlights();
  }, delay);
}

function schedulePendingMutationProcessing() {
  if (!hasActiveHighlightMode()) {
    pendingMutationRecords = [];
    return;
  }

  if (mutationFramePending) return;
  mutationFramePending = true;

  requestAnimationFrame(() => {
    mutationFramePending = false;
    if (!siteEnabled || !hasActiveHighlightMode()) {
      pendingMutationRecords = [];
      return;
    }

    const records = pendingMutationRecords;
    pendingMutationRecords = [];
    if (!records || records.length === 0) return;

    if (!shouldRefreshHighlightsForMutations(records)) return;
    processMutationsIncrementally(records);
  });
}

function queueMutationRecords(mutations) {
  if (!mutations || mutations.length === 0) return;
  if (!hasActiveHighlightMode()) return;

  const relevantMutations = [];
  for (const mutation of mutations) {
    if (isMutationRelevantForHighlights(mutation)) {
      relevantMutations.push(mutation);
    }
  }
  if (relevantMutations.length === 0) return;

  pendingMutationRecords.push(...relevantMutations);
  schedulePendingMutationProcessing();
}

function createMutationProcessingContext() {
  return {
    textNodesToRefresh: new Set(),
    rootsToProcess: new Set()
  };
}

function collectCharacterDataMutation(mutation, context) {
  const target = mutation.target;
  if (target && target.nodeType === Node.TEXT_NODE && !shouldIgnoreMutationNode(target)) {
    context.textNodesToRefresh.add(target);
  }
}

function collectAttributeMutation(mutation, context) {
  const attributeName = mutation.attributeName || '';
  if (!VISIBILITY_ATTRIBUTE_NAMES.has(attributeName)) return;

  const target = mutation.target;
  if (!target || target.nodeType !== Node.ELEMENT_NODE || shouldIgnoreMutationNode(target)) return;

  observeOpenShadowRoots(target);
  clearHighlightsInSubtreeAndOpenShadowRoots(target);
  context.rootsToProcess.add(target);
}

function collectChildListMutation(mutation, context) {
  mutation.removedNodes.forEach((node) => {
    disconnectShadowRootObserversInSubtree(node);
    if (shouldIgnoreMutationNode(node)) return;
    clearHighlightsInSubtreeAndOpenShadowRoots(node);
  });

  mutation.addedNodes.forEach((node) => {
    if (shouldIgnoreMutationNode(node)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      context.textNodesToRefresh.add(node);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      observeOpenShadowRoots(node);
      context.rootsToProcess.add(node);
    }
  });
}

function collectIncrementalHighlightWork(mutations) {
  const context = createMutationProcessingContext();

  for (const mutation of mutations) {
    if (!mutation) continue;
    if (mutation.type === 'characterData') {
      collectCharacterDataMutation(mutation, context);
    } else if (mutation.type === 'attributes') {
      collectAttributeMutation(mutation, context);
    } else if (mutation.type === 'childList') {
      collectChildListMutation(mutation, context);
    }
  }

  return context;
}

function refreshMutatedTextNodes(textNodes, wordsSet, visibilityCache) {
  textNodes.forEach((textNode) => {
    clearHighlightsForTextNode(textNode);
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !textNode.isConnected) return;
    const parentElement = textNode.parentElement;
    if (!parentElement || !shouldProcessNode(parentElement) || isInWordPopup(parentElement)) return;
    highlightWordsInTextNode(textNode, wordsSet, visibilityCache);
  });
}

function getConnectedTopLevelRoots(rootsToProcess) {
  const rootList = Array.from(rootsToProcess).filter((root) => {
    return root && root.nodeType === Node.ELEMENT_NODE && root.isConnected;
  });

  return rootList.filter((root) => {
    return !rootList.some((other) => other !== root && other.contains && other.contains(root));
  });
}

function refreshMutatedRoots(rootsToProcess, wordsSet, visibilityCache) {
  getConnectedTopLevelRoots(rootsToProcess).forEach((root) => {
    if (shouldIgnoreMutationNode(root)) return;
    observeOpenShadowRoots(root);
    processRootAndOpenShadowRoots(root, wordsSet, { visibilityCache });
  });
}

function shouldUseFullHighlightRefresh(mutations) {
  return !highlightModeState.ready || mutations.length > MAX_INCREMENTAL_MUTATIONS;
}

// Mutation work is split into collect/apply phases so the observer path stays cheap.
function processMutationsIncrementally(mutations) {
  if (shouldUseFullHighlightRefresh(mutations)) {
    scheduleHighlightRefresh();
    return;
  }

  if (!hasActiveHighlightMode()) return;

  const wordsSet = highlightModeState.mode === 'selected' ? highlightModeState.wordsSet : null;
  const visibilityCache = new WeakMap();
  const work = collectIncrementalHighlightWork(mutations);

  refreshMutatedTextNodes(work.textNodesToRefresh, wordsSet, visibilityCache);
  refreshMutatedRoots(work.rootsToProcess, wordsSet, visibilityCache);
}

function setupObserver() {
  if (observer) return;
  if (!siteEnabled || !hasActiveHighlightMode()) return;
  observer = new MutationObserver((mutations) => {
    queueMutationRecords(mutations);
  });
  observer.observe(document.body, OBSERVER_OPTIONS);
  observeOpenShadowRoots(document.body);
}

function disableSiteFeatures() {
  siteEnabled = false;
  cleanup();
  clearAllHighlights();
  highlightModeState = {
    ready: false,
    mode: 'none',
    wordsSet: null,
    selectedFilesCount: 0,
    uploadedFilesCount: 0
  };
  removeTextSelectionListeners();
  removeGlobalHoverListeners();
  removeDomContentLoadedListener();
  if (activePopup) {
    hidePopup();
  }
  if (selectionIcon) {
    hideSelectionIcon();
  }
}

function enableSiteFeatures() {
  if (siteEnabled) return;
  siteEnabled = true;
  initializeHighlighter();
  initializeTextSelection();
  ensureDomContentLoadedListener();
  updateHighlights();
}

// DOM processing functions
function toLowerString(value) {
  if (typeof value === 'string') return value.toLowerCase();
  if (value === null || value === undefined) return '';
  if (typeof value.baseVal === 'string') return value.baseVal.toLowerCase();
  if (typeof value.toString === 'function') return value.toString().toLowerCase();
  return '';
}

function getElementClassName(element) {
  if (!element) return '';
  if (typeof element.className === 'string') return element.className;
  if (element.className && typeof element.className.baseVal === 'string')
    return element.className.baseVal;
  return '';
}

function isLikelyEditorContainer(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

  if (typeof element.matches === 'function') {
    try {
      if (element.matches(RICH_EDITOR_CONTEXT.rootSelector)) return true;
    } catch (error) {
      // Ignore invalid selector edge cases from host pages.
    }
  }

  const tagName = element.tagName;
  if (tagName === 'TEXTAREA') return true;

  const elementId = toLowerString(element.id);
  const elementName = toLowerString(element.getAttribute('name'));
  const className = toLowerString(getElementClassName(element));

  const joinedHints = `${elementId} ${elementName} ${className}`;
  if (RICH_EDITOR_CONTEXT.hints.some((hint) => joinedHints.includes(hint))) return true;

  if (tagName === 'IFRAME') {
    if (RICH_EDITOR_CONTEXT.iframeHints.some((hint) => joinedHints.includes(hint))) return true;
  }

  if (className) {
    if (className.includes('editor')) {
      const role = element.getAttribute('role');
      if (role === 'textbox' || element.isContentEditable) return true;
    }
  }

  const role = element.getAttribute('role');
  if (role === 'textbox') return true;
  if (element.getAttribute('aria-multiline') === 'true') return true;
  if (element.isContentEditable) return true;

  return false;
}

function isInRichEditorContext(node) {
  let current = node;
  if (current && current.nodeType !== Node.ELEMENT_NODE) {
    current = current.parentElement;
  }
  while (current && current !== document.body && current !== document.documentElement) {
    if (isLikelyEditorContainer(current)) return true;
    current = current.parentElement;
  }
  if (current && isLikelyEditorContainer(current)) return true;
  return false;
}

function shouldSkipRichEditorContext(node) {
  return isInRichEditorContext(node) && !isEditorPlaceholderContext(node);
}

function shouldProcessNode(node) {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    !['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'SELECT'].includes(node.nodeName) &&
    !node.isContentEditable &&
    !isExtensionUiNode(node) &&
    !isPartOfSidebar(node) &&
    !shouldSkipRichEditorContext(node) &&
    !isInHighChurnTextContext(node)
  );
}

function isPartOfSidebar(node) {
  let currentNode = node;
  while (currentNode) {
    if (
      currentNode.nodeType === Node.ELEMENT_NODE &&
      currentNode.classList &&
      (currentNode.classList.contains('hlw-word-sidebar') ||
        currentNode.classList.contains('clipboard-history-sidebar'))
    ) {
      return true;
    }
    if (currentNode === document.body || currentNode === document.documentElement) break;
    currentNode = getComposedParent(currentNode);
  }
  return false;
}

function processAllTextNodes(root, wordsSet = null, options = {}) {
  if (!siteEnabled) return 0;
  if (!root) return 0;
  if (isInHighChurnTextContext(root)) return 0;
  let highlightedRanges = 0;
  let scannedTextNodes = 0;
  const visibilityCache = options.visibilityCache || null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentNode;
      if (
        parent &&
        shouldProcessNode(parent) &&
        node.textContent.trim() &&
        !isInWordPopup(parent)
      ) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_REJECT;
    }
  });
  let node;
  while ((node = walker.nextNode())) {
    scannedTextNodes += 1;
    if (scannedTextNodes > MAX_TEXT_NODES_PER_HIGHLIGHT_PASS) break;
    if (highlightRangeCount >= MAX_HIGHLIGHT_RANGES) break;
    highlightedRanges += highlightWordsInTextNode(node, wordsSet, visibilityCache);
  }
  return highlightedRanges;
}

function isInWordPopup(node) {
  let current = node;
  while (current) {
    if (
      current.nodeType === Node.ELEMENT_NODE &&
      current.classList &&
      (current.classList.contains('hlw-word-popup') ||
        current.classList.contains('hlw-word-popup-host'))
    ) {
      return true;
    }
    if (current === document.body || current === document.documentElement) break;
    current = getComposedParent(current);
  }
  return false;
}

function isElementVisibleForHighlight(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
  if (element.closest('[hidden]')) return false;

  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const style = window.getComputedStyle ? window.getComputedStyle(current) : null;

    if (typeof current.checkVisibility === 'function') {
      try {
        if (
          !current.checkVisibility({
            checkOpacity: false,
            checkVisibilityCSS: true
          })
        ) {
          if (!style || style.display !== 'contents') {
            return false;
          }
        }
      } catch (error) {
        // Fall back to computed style checks.
      }
    }

    if (style) {
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }

    if (current === document.body || current === document.documentElement) {
      break;
    }
    current = current.parentElement;
  }

  return true;
}

function hasRenderableGlyphRect(range) {
  if (!range) return false;
  const rects = range.getClientRects();
  if (!rects || rects.length === 0) return false;
  for (const rect of rects) {
    if (rect.width > 0 && rect.height > 0) {
      return true;
    }
  }
  return false;
}

function addRangeToTextNodeIndex(textNode, word, range) {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
  let entries = textNodeRangeIndex.get(textNode);
  if (!entries) {
    entries = [];
    textNodeRangeIndex.set(textNode, entries);
  }
  entries.push({ word, range });
}

function removeRangeFromTextNodeIndex(textNode, range) {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
  const entries = textNodeRangeIndex.get(textNode);
  if (!entries || entries.length === 0) return;
  const nextEntries = entries.filter((entry) => entry.range !== range);
  if (nextEntries.length === 0) {
    textNodeRangeIndex.delete(textNode);
    return;
  }
  textNodeRangeIndex.set(textNode, nextEntries);
}

function removeRangeFromWordHighlights(word, range) {
  const ranges = highlights.get(word);
  if (!ranges || ranges.length === 0) return;
  const nextRanges = ranges.filter((item) => item !== range);
  if (nextRanges.length === 0) {
    highlights.delete(word);
    return;
  }
  highlights.set(word, nextRanges);
}

function clearHighlightsForTextNode(textNode) {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return 0;
  const entries = textNodeRangeIndex.get(textNode);
  if (!entries || entries.length === 0) return 0;
  let removed = 0;

  entries.forEach(({ word, range }) => {
    if (unknownHL) unknownHL.delete(range);
    removeRangeFromWordHighlights(word, range);
    removed += 1;
  });

  textNodeRangeIndex.delete(textNode);
  highlightRangeCount = Math.max(0, highlightRangeCount - removed);
  return removed;
}

function clearHighlightsInSubtree(node) {
  if (!node) return 0;

  if (node.nodeType === Node.TEXT_NODE) {
    return clearHighlightsForTextNode(node);
  }

  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return 0;
  }

  let removed = 0;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
  let textNode;
  while ((textNode = walker.nextNode())) {
    removed += clearHighlightsForTextNode(textNode);
  }
  return removed;
}

function getTextNodeHighlightEntries(textNode) {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return [];
  return textNodeRangeIndex.get(textNode) || [];
}

function isElementVisibleForHighlightCached(element, visibilityCache = null) {
  if (!visibilityCache || !element) {
    return isElementVisibleForHighlight(element);
  }
  if (visibilityCache.has(element)) {
    return visibilityCache.get(element);
  }
  const visible = isElementVisibleForHighlight(element);
  visibilityCache.set(element, visible);
  return visible;
}

function highlightWordsInTextNode(textNode, wordsSet = null, visibilityCache = null) {
  if (!siteEnabled) return 0;
  if (!unknownHL) return 0;
  if (!textNode || !textNode.textContent.trim()) return 0;
  if (highlightRangeCount >= MAX_HIGHLIGHT_RANGES) return 0;
  const parentElement = textNode.parentElement;
  if (isInWordPopup(textNode.parentNode)) return 0;
  if (shouldSkipRichEditorContext(parentElement)) return 0;
  if (isInHighChurnTextContext(parentElement)) return 0;
  if (HIGHLIGHT_VISIBLE_ONLY && !isElementVisibleForHighlightCached(parentElement, visibilityCache))
    return 0;
  const text = textNode.textContent;
  let addedCount = 0;
  ENGLISH_WORD_PATTERN.lastIndex = 0;

  let match;
  while ((match = ENGLISH_WORD_PATTERN.exec(text)) !== null) {
    if (highlightRangeCount >= MAX_HIGHLIGHT_RANGES) break;
    const word = match[0].toLowerCase();
    const shouldHighlight = wordsSet
      ? wordsSet.has(word) && !knownWords.has(word)
      : !knownWords.has(word);
    if (shouldHighlight) {
      const range = new Range();
      range.setStart(textNode, match.index);
      range.setEnd(textNode, match.index + word.length);
      if (HIGHLIGHT_VISIBLE_ONLY && !hasRenderableGlyphRect(range)) {
        continue;
      }
      unknownHL.add(range);
      if (!highlights.has(word)) highlights.set(word, []);
      highlights.get(word).push(range);
      addRangeToTextNodeIndex(textNode, word, range);
      highlightRangeCount += 1;
      addedCount += 1;
    }
  }

  ENGLISH_WORD_PATTERN.lastIndex = 0;
  return addedCount;
}

function removeHighlightForWord(word) {
  const lowercaseWord = word.toLowerCase();
  const ranges = highlights.get(lowercaseWord);
  if (ranges) {
    ranges.forEach((range) => {
      if (unknownHL) unknownHL.delete(range);
      removeRangeFromTextNodeIndex(range.startContainer, range);
    });
    highlightRangeCount = Math.max(0, highlightRangeCount - ranges.length);
    highlights.delete(lowercaseWord);
  }
}

function reHighlightWord(word) {
  if (!siteEnabled) return;
  removeHighlightForWord(word);
  processRootAndOpenShadowRoots(document.body, new Set([word.toLowerCase()]));
}

function clearAllHighlights() {
  highlights.clear();
  textNodeRangeIndex = new WeakMap();
  highlightRangeCount = 0;
  if (unknownHL) {
    unknownHL.clear();
  }
}

function updateHighlights() {
  try {
    if (extensionContextInvalidated || !isExtensionContextValid()) {
      handleExtensionContextInvalidated();
      return;
    }
    if (!siteEnabled) return;
    if (highlightRefreshInProgress) {
      highlightRefreshQueued = true;
      return;
    }

    highlightRefreshInProgress = true;

    const finishRefresh = () => {
      highlightRefreshInProgress = false;
      if (highlightRefreshQueued && siteEnabled) {
        highlightRefreshQueued = false;
        scheduleHighlightRefresh();
      }
    };

    chrome.storage.local.get(
      ['highlightToggle', 'selectedFiles', 'uploadedFiles'],
      function (result) {
        if (hasChromeStorageLastError('Error loading highlight settings') || !siteEnabled) {
          finishRefresh();
          return;
        }

        try {
          clearAllHighlights();
          const modeState = updateHighlightModeStateFromStorage(result);
          syncHighlightRuntimeForMode(modeState);

          if (modeState.mode === 'all') {
            processRootAndOpenShadowRoots(document.body);
          } else if (hasActiveHighlightMode(modeState) && modeState.mode === 'selected') {
            processRootAndOpenShadowRoots(document.body, modeState.wordsSet);
          }
        } catch (error) {
          console.error('Error refreshing highlights:', error);
        } finally {
          finishRefresh();
        }
      }
    );
  } catch (e) {
    highlightRefreshInProgress = false;
    if (isExtensionContextInvalidatedError(e)) {
      handleExtensionContextInvalidated();
      return;
    }
    console.error('Error in updateHighlights:', e);
  }
}

function hasChromeStorageLastError(action) {
  if (extensionContextInvalidated || !isExtensionContextValid()) {
    handleExtensionContextInvalidated();
    return true;
  }
  if (!chrome.runtime.lastError) return false;
  console.error(`${action}: ${chrome.runtime.lastError.message}`);
  return true;
}
