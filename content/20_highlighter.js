function getSelectedWordsCacheKey(selectedFiles, uploadedFiles) {
  const fileSignature = uploadedFiles
    .map((fileInfo) =>
      fileInfo
        ? `${fileInfo.name}|${fileInfo.lastModified}|${fileInfo.content ? fileInfo.content.length : 0}`
        : ''
    )
    .join(';');
  return `${selectedFiles.join(',')}#${fileSignature}`;
}

function parseVocabularyWords(content) {
  return (content || '')
    .split('\n')
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
}

function buildSelectedWordsSet(selectedFiles, uploadedFiles) {
  if (!selectedFiles || !uploadedFiles || selectedFiles.length === 0) return new Set();

  const cacheKey = getSelectedWordsCacheKey(selectedFiles, uploadedFiles);
  if (selectedWordsSetCache.key === cacheKey) return selectedWordsSetCache.wordsSet;

  const wordsSet = new Set();
  selectedFiles.forEach((fileIndex) => {
    const fileInfo = uploadedFiles[fileIndex];
    if (!fileInfo || !fileInfo.content) return;
    parseVocabularyWords(fileInfo.content).forEach((word) => wordsSet.add(word));
  });
  selectedWordsSetCache = { key: cacheKey, wordsSet };
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

    // Records were already filtered by queueMutationRecords.
    const records = pendingMutationRecords;
    pendingMutationRecords = [];
    if (!records || records.length === 0) return;

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
    rootsToProcess: new Set(),
    rootsToClear: new Set()
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

  // A page-wide subtree is too expensive to clear and rescan synchronously.
  if (target === document.body || target === document.documentElement) {
    scheduleHighlightRefresh();
    return;
  }

  context.rootsToProcess.add(target);
  context.rootsToClear.add(target);
}

function collectChildListMutation(mutation, context) {
  mutation.removedNodes.forEach((node) => {
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

function refreshMutatedTextNodes(textNodes, wordsSet, passCache) {
  textNodes.forEach((textNode) => {
    clearHighlightsForTextNode(textNode);
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !textNode.isConnected) return;
    highlightWordsInTextNode(textNode, wordsSet, passCache);
  });
}

function getConnectedTopLevelRoots(rootsToProcess) {
  const rootSet = new Set();
  rootsToProcess.forEach((root) => {
    if (root && root.nodeType === Node.ELEMENT_NODE && root.isConnected) rootSet.add(root);
  });

  const topLevelRoots = [];
  rootSet.forEach((root) => {
    let ancestor = root.parentElement;
    while (ancestor && !rootSet.has(ancestor)) {
      ancestor = ancestor.parentElement;
    }
    if (!ancestor) topLevelRoots.push(root);
  });
  return topLevelRoots;
}

function rootNeedsHighlightClear(root, rootsToClear) {
  if (!rootsToClear || rootsToClear.size === 0) return false;
  if (rootsToClear.has(root)) return true;
  for (const clearTarget of rootsToClear) {
    if (root.contains && root.contains(clearTarget)) return true;
  }
  return false;
}

function refreshMutatedRoots(work, wordsSet, passCache) {
  getConnectedTopLevelRoots(work.rootsToProcess).forEach((root) => {
    if (shouldIgnoreMutationNode(root)) return;
    if (rootNeedsHighlightClear(root, work.rootsToClear)) {
      clearHighlightsInSubtreeAndOpenShadowRoots(root);
    }
    processRootAndOpenShadowRoots(root, wordsSet, { passCache, observeShadowRoots: true });
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
  const passCache = createHighlightPassCache();
  const work = collectIncrementalHighlightWork(mutations);

  pruneDisconnectedShadowRootObservers();
  refreshMutatedTextNodes(work.textNodesToRefresh, wordsSet, passCache);
  refreshMutatedRoots(work, wordsSet, passCache);
}

function setupObserver() {
  if (observer) return;
  if (!siteEnabled || !hasActiveHighlightMode()) return;
  observer = new MutationObserver((mutations) => {
    queueMutationRecords(mutations);
  });
  observer.observe(document.body, OBSERVER_OPTIONS);
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

// Ancestor-chain checks are expensive, so one pass shares the verdicts per element.
function createHighlightPassCache() {
  return {
    processable: new WeakMap(),
    visibility: new WeakMap()
  };
}

function isElementProcessableForHighlight(element, passCache = null) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
  const cache = passCache ? passCache.processable : null;
  if (cache && cache.has(element)) return cache.get(element);
  const processable = shouldProcessNode(element) && !isInWordPopup(element);
  if (cache) cache.set(element, processable);
  return processable;
}

const SIDEBAR_CLASS_NAMES = ['hlw-word-sidebar', 'clipboard-history-sidebar'];
const WORD_POPUP_CLASS_NAMES = ['hlw-word-popup', 'hlw-word-popup-host'];

function isPartOfSidebar(node) {
  return isNodeWithinAnyClass(node, SIDEBAR_CLASS_NAMES);
}

function processAllTextNodes(root, wordsSet = null, options = {}) {
  if (!siteEnabled) return 0;
  if (!root) return 0;
  if (isInHighChurnTextContext(root)) return 0;
  let highlightedRanges = 0;
  let scannedTextNodes = 0;
  const passCache = options.passCache || null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
      if (isElementProcessableForHighlight(node.parentNode, passCache)) {
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
    highlightedRanges += highlightWordsInTextNode(node, wordsSet, passCache);
  }
  return highlightedRanges;
}

function isInWordPopup(node) {
  return isNodeWithinAnyClass(node, WORD_POPUP_CLASS_NAMES);
}

function isElementVisibleForHighlight(element, passCache = null) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
  if (element.closest('[hidden]')) return false;

  // checkVisibility already covers the whole ancestor chain, so one call suffices.
  if (typeof element.checkVisibility === 'function') {
    let visible = null;
    try {
      visible = element.checkVisibility({
        checkOpacity: false,
        checkVisibilityCSS: true
      });
    } catch (error) {
      // Fall back to computed style checks.
    }
    if (visible === true) return true;
    if (visible === false) {
      // display:contents elements report as hidden even when their text renders.
      const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
      if (!style || style.display !== 'contents') return false;
      if (element === document.body || element === document.documentElement) return true;
      const parent = element.parentElement;
      return parent ? isElementVisibleForHighlightCached(parent, passCache) : true;
    }
  }

  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const style = window.getComputedStyle ? window.getComputedStyle(current) : null;
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

// One geometry read per text node instead of one per candidate word.
function textNodeHasRenderableText(textNode) {
  const nodeRange = document.createRange();
  try {
    nodeRange.selectNodeContents(textNode);
  } catch (error) {
    return false;
  }
  return hasRenderableGlyphRect(nodeRange);
}

function addRangeToTextNodeIndex(textNode, word, range) {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
  let entries = textNodeRangeIndex.get(textNode);
  if (!entries) {
    entries = new Map();
    textNodeRangeIndex.set(textNode, entries);
  }
  entries.set(range, word);
}

function removeRangeFromTextNodeIndex(textNode, range) {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
  const entries = textNodeRangeIndex.get(textNode);
  if (!entries) return;
  entries.delete(range);
  if (entries.size === 0) {
    textNodeRangeIndex.delete(textNode);
  }
}

function removeRangeFromWordHighlights(word, range) {
  const ranges = highlights.get(word);
  if (!ranges) return;
  ranges.delete(range);
  if (ranges.size === 0) {
    highlights.delete(word);
  }
}

function clearHighlightsForTextNode(textNode) {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return 0;
  const entries = textNodeRangeIndex.get(textNode);
  if (!entries || entries.size === 0) return 0;
  let removed = 0;

  entries.forEach((word, range) => {
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
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null;
  return textNodeRangeIndex.get(textNode) || null;
}

function isElementVisibleForHighlightCached(element, passCache = null) {
  const cache = passCache ? passCache.visibility : null;
  if (!cache || !element) {
    return isElementVisibleForHighlight(element, passCache);
  }
  if (cache.has(element)) {
    return cache.get(element);
  }
  const visible = isElementVisibleForHighlight(element, passCache);
  cache.set(element, visible);
  return visible;
}

function highlightWordsInTextNode(textNode, wordsSet = null, passCache = null) {
  if (!siteEnabled) return 0;
  if (!unknownHL) return 0;
  if (!textNode || !textNode.textContent.trim()) return 0;
  if (highlightRangeCount >= MAX_HIGHLIGHT_RANGES) return 0;
  const parentElement = textNode.parentElement;
  if (!isElementProcessableForHighlight(parentElement, passCache)) return 0;

  // Match words before any geometry read: regex work is cheap, while the
  // visibility/rect checks force layout, so skip them for nodes with no hits.
  const text = textNode.textContent;
  const matches = [];
  ENGLISH_WORD_PATTERN.lastIndex = 0;
  let match;
  while ((match = ENGLISH_WORD_PATTERN.exec(text)) !== null) {
    const word = match[0].toLowerCase();
    const shouldHighlight = wordsSet
      ? wordsSet.has(word) && !knownWords.has(word)
      : !knownWords.has(word);
    if (shouldHighlight) {
      matches.push({ word, index: match.index });
    }
  }
  if (matches.length === 0) return 0;

  if (HIGHLIGHT_VISIBLE_ONLY) {
    if (!isElementVisibleForHighlightCached(parentElement, passCache)) return 0;
    if (!textNodeHasRenderableText(textNode)) return 0;
  }

  let addedCount = 0;
  for (const { word, index } of matches) {
    if (highlightRangeCount >= MAX_HIGHLIGHT_RANGES) break;
    const range = new Range();
    range.setStart(textNode, index);
    range.setEnd(textNode, index + word.length);
    unknownHL.add(range);
    let wordRanges = highlights.get(word);
    if (!wordRanges) {
      wordRanges = new Set();
      highlights.set(word, wordRanges);
    }
    wordRanges.add(range);
    addRangeToTextNodeIndex(textNode, word, range);
    highlightRangeCount += 1;
    addedCount += 1;
  }

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
    highlightRangeCount = Math.max(0, highlightRangeCount - ranges.size);
    highlights.delete(lowercaseWord);
  }
}

function reHighlightWord(word) {
  if (!siteEnabled) return;
  removeHighlightForWord(word);
  processRootAndOpenShadowRoots(document.body, new Set([word.toLowerCase()]), {
    passCache: createHighlightPassCache()
  });
}

function clearAllHighlights() {
  highlights.clear();
  textNodeRangeIndex = new WeakMap();
  highlightRangeCount = 0;
  if (unknownHL) {
    unknownHL.clear();
  }
}

// Orphaned content scripts cannot read storage; the last known mode is enough
// to keep highlighting working until the page reloads.
function refreshHighlightsFromCachedMode() {
  if (!siteEnabled || !highlightModeState.ready) return;
  try {
    clearAllHighlights();
    if (hasActiveHighlightMode()) {
      const wordsSet = highlightModeState.mode === 'selected' ? highlightModeState.wordsSet : null;
      processRootAndOpenShadowRoots(document.body, wordsSet, {
        passCache: createHighlightPassCache(),
        observeShadowRoots: true
      });
    }
  } catch (error) {
    console.error('Error refreshing highlights from cached mode:', error);
  }
}

function updateHighlights() {
  try {
    if (extensionContextInvalidated || !isExtensionContextValid()) {
      handleExtensionContextInvalidated();
      refreshHighlightsFromCachedMode();
      return;
    }
    if (!siteEnabled) return;
    if (highlightRefreshInProgress) {
      // Recover if the pending storage callback never returned (e.g. the
      // extension reloaded mid-flight); otherwise queue as usual.
      if (Date.now() - highlightRefreshStartedAt < HIGHLIGHT_REFRESH_STUCK_MS) {
        highlightRefreshQueued = true;
        return;
      }
    }

    highlightRefreshInProgress = true;
    highlightRefreshStartedAt = Date.now();

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
          if (extensionContextInvalidated) refreshHighlightsFromCachedMode();
          return;
        }

        try {
          clearAllHighlights();
          const modeState = updateHighlightModeStateFromStorage(result);
          syncHighlightRuntimeForMode(modeState);

          if (hasActiveHighlightMode(modeState)) {
            pruneDisconnectedShadowRootObservers();
            const wordsSet = modeState.mode === 'selected' ? modeState.wordsSet : null;
            processRootAndOpenShadowRoots(document.body, wordsSet, {
              passCache: createHighlightPassCache(),
              observeShadowRoots: true
            });
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
      refreshHighlightsFromCachedMode();
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
