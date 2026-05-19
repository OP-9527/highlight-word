// Central configuration keeps timing, storage, and UI limits visible during refactors.
const CACHE_EXPIRATION_TIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MAX_TRANSLATION_CACHE_SIZE = 500;
const HIGHLIGHT_VISIBLE_ONLY = true;
const POPUP_HIDE_DELAY_MS = 300;
const POPUP_VIEWPORT_GAP_PX = 10;
const POPUP_Z_INDEX = '9999';
const HOVER_SAMPLE_MIN_INTERVAL_MS = 20;
const HOVER_MOVE_MIN_DISTANCE_PX = 2;
const MAX_POINT_CANDIDATE_ELEMENTS = 8;
const MAX_ELEMENT_CONTEXT_ANCESTOR_DEPTH = 3;
const MAX_TEXT_NODES_PER_ELEMENT_CONTEXT = 80;
const MAX_HIGHLIGHT_RANGES = 12000;
const MAX_TEXT_NODES_PER_HIGHLIGHT_PASS = 4500;
const FULL_HIGHLIGHT_REFRESH_DEBOUNCE_MS = 250;
const MAX_INCREMENTAL_MUTATIONS = 1200;
const STORAGE_KEY_PREFIX = 'knownWords_';
// chrome.storage.sync has an 8KB per-item limit, so known words stay chunked.
const CHUNK_SIZE = 200;
const STORAGE_SAVE_BATCH_DELAY_MS = 50;
const STORAGE_CLEAR_BATCH_SIZE = 100;
const STORAGE_CLEAR_BATCH_DELAY_MS = 200;
const KNOWN_WORDS_SYNC_SUPPRESS_DELAY_MS = 200;
const ADD_KNOWN_WORD_SAVE_DELAY_MS = 100;
const STORAGE_LOAD_RETRY_DELAY_MS = 300;
const STORAGE_LOAD_MAX_RETRIES = 3;
const WORD_COUNT_MISMATCH_WARNING_THRESHOLD = 10;
const DEFAULT_POINT_HIT_FONT_SIZE_PX = 14;
const POINT_HIT_MIN_INSET_X_PX = 1;
const POINT_HIT_MAX_INSET_X_PX = 4;
const POINT_HIT_WIDTH_INSET_RATIO = 0.08;
const POINT_HIT_MIN_HEIGHT_PX = 10;
const POINT_HIT_FONT_HEIGHT_RATIO = 1.05;
const POINT_HIT_MIN_INSET_Y_PX = 2;
const SELECTION_CHECK_DELAY_MS = 100;
const SELECTION_DOUBLE_CLICK_DELAY_MS = 50;
const SELECTION_ICON_SIZE_PX = 24;
const SELECTION_ICON_IMAGE_SIZE_PX = 16;
const SELECTION_ICON_OFFSET_X_PX = 5;
const SELECTION_ICON_OFFSET_Y_PX = -12;
const SELECTION_ICON_Z_INDEX = '100000';
const SELECTION_ICON_FALLBACK_FONT_SIZE_PX = 12;
const SELECTION_ICON_BACKGROUND = 'rgb(33, 150, 243)';

// Runtime state
let highlights = new Map();
let knownWords = new Set();
let activePopup = null;
let popupHideTimer = null;
let translationCache = new Map();
let currentTranslationController = null;
let knownWordsSyncWriteDepth = 0;
let selectionIcon = null;
let selectionTimeout = null;
let isMouseDown = false;
let popupStylesText = null;
let popupStylesPromise = null;
let currentPopupRequestId = 0;
const HIGH_CHURN_TEXT_CONTAINER_SELECTOR = [
  'video',
  'audio',
  'canvas',
  '[aria-live="polite"]',
  '[aria-live="assertive"]'
].join(',');
const STATIC_INTERACTIVE_TEXT_SELECTOR = [
  'a[href]',
  'button',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
  'nav'
].join(',');
const TWITTER_EDITOR_PLACEHOLDER_SELECTOR = [
  '.public-DraftEditorPlaceholder-root',
  '.public-DraftEditorPlaceholder-inner'
].join(',');
const YOUTUBE_HIGH_CHURN_TEXT_CONTAINER_SELECTOR = [
  'ytd-player',
  '#player',
  '#movie_player',
  '.html5-video-player',
  '.ytp-chrome-bottom',
  '.ytp-tooltip',
  'tp-yt-paper-tooltip',
  'ytd-miniplayer',
  'ytd-live-chat-frame',
  'yt-live-chat-app',
  '#chat',
  '#chatframe'
].join(',');
const YOUTUBE_CAPTION_TEXT_CONTAINER_SELECTOR = [
  '.ytp-caption-window-container',
  '.caption-window',
  '.ytp-caption-segment-container',
  '.ytp-caption-segment'
].join(',');
const YOUTUBE_LIVE_CHAT_TEXT_CONTAINER_SELECTOR = [
  'yt-live-chat-text-message-renderer',
  'yt-live-chat-paid-message-renderer',
  'yt-live-chat-paid-sticker-renderer',
  'yt-live-chat-membership-item-renderer',
  'yt-live-chat-viewer-engagement-message-renderer',
  '#message',
  '#author-name'
].join(',');
const LINKEDIN_READABLE_DYNAMIC_TEXT_SELECTOR = [
  '.artdeco-carousel',
  '.org-jobs-recently-posted-jobs-module',
  '.jobs-company__box',
  '.jobs-search-results-list',
  '.job-card-container',
  '.jobs-unified-top-card',
  '.base-card',
  '.base-search-card',
  '[class*="job-card"]',
  '[class*="jobs-company"]',
  '[class*="jobs-search"]',
  '[class*="org-jobs"]',
  '[class*="recently-posted-jobs"]',
  '[data-test-id*="job"]'
].join(',');
const RICH_EDITOR_ROOT_SELECTOR = [
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
  '[aria-multiline="true"]',
  '[data-lexical-editor="true"]',
  '[data-slate-editor="true"]',
  '[data-editor]',
  '.ProseMirror',
  '.ql-editor',
  '.DraftEditor-root',
  '.public-DraftEditor-content',
  '.notion-page-content',
  '.notion-selectable',
  '.monaco-editor',
  '.CodeMirror',
  '.cm-editor',
  '.ace_editor',
  '.kix-appview-editor',
  '.kix-page',
  '.kix-canvas-tile-content',
  '.docs-texteventtarget-iframe',
  '.docs-texteventtarget',
  '.ck-editor__editable',
  '.fr-element',
  '.tox-edit-area',
  '.note-editor',
  '.rich-text-editor',
  '.RichTextEditor',
  '.lexical-editor',
  '.slate-editor',
  '.prosemirror-editor'
].join(',');
let sidebarOpen = false;
const ENGLISH_WORD_PATTERN = /\b[a-zA-Z]{2,}\b/g;
let unknownHL;
let observer = null;
let shadowRootObservers = new Map();
let siteEnabled = false;
let domContentLoadedHandler = null;
let globalHoverListenersAdded = false;
let storageChangedListener = null;
let highlightRefreshTimer = null;
let highlightRefreshInProgress = false;
let highlightRefreshQueued = false;
let highlightRangeCount = 0;
const VISIBILITY_ATTRIBUTE_NAMES = new Set([
  'class',
  'style',
  'hidden',
  'aria-hidden',
  'open',
  'inert',
  'aria-expanded',
  'data-state'
]);
const OBSERVER_OPTIONS = {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: Array.from(VISIBILITY_ATTRIBUTE_NAMES)
};

let textNodeRangeIndex = new WeakMap();
let pendingMutationRecords = [];
let mutationFramePending = false;
let highlightModeState = {
  ready: false,
  mode: 'none', // 'all' | 'selected' | 'none'
  wordsSet: null,
  selectedFilesCount: 0,
  uploadedFilesCount: 0
};

// 防抖函数，防止高频触发
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function initializeHighlighter() {
  if (window.CSS && CSS.highlights) {
    unknownHL = new Highlight();
    CSS.highlights.set('wh-unknown', unknownHL);
  }
}

function removeTextSelectionListeners() {
  document.removeEventListener('mousedown', handleMouseDown);
  document.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('selectionchange', handleSelectionChange);
  document.removeEventListener('dblclick', handleDoubleClick);
  document.removeEventListener('click', handleDocumentClick);
}

function addGlobalHoverListeners() {
  if (globalHoverListenersAdded) return;
  document.addEventListener('mousemove', handleMouseMove, { passive: true });
  document.addEventListener('mouseleave', scheduleHidePopup, { passive: true });
  globalHoverListenersAdded = true;
}

function removeGlobalHoverListeners() {
  if (!globalHoverListenersAdded) return;
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseleave', scheduleHidePopup);
  globalHoverListenersAdded = false;
}

function ensureDomContentLoadedListener() {
  if (domContentLoadedHandler) return;
  domContentLoadedHandler = () => {
    if (!siteEnabled) return;
    chrome.storage.local.get(['highlightToggle', 'selectedFiles'], function (result) {
      if (result.highlightToggle || (result.selectedFiles && result.selectedFiles.length > 0)) {
        requestAnimationFrame(() => {
          updateHighlights();
        });
      }
    });
  };
  document.addEventListener('DOMContentLoaded', domContentLoadedHandler);
  if (document.readyState !== 'loading') {
    domContentLoadedHandler();
  }
}

function removeDomContentLoadedListener() {
  if (!domContentLoadedHandler) return;
  document.removeEventListener('DOMContentLoaded', domContentLoadedHandler);
  domContentLoadedHandler = null;
}

function getComposedParent(node) {
  if (!node) return null;
  if (node.parentNode) return node.parentNode;
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && node.host) return node.host;
  const root = typeof node.getRootNode === 'function' ? node.getRootNode() : null;
  if (root && root !== node && root.host) return root.host;
  return null;
}

function collectRootAndOpenShadowRoots(root) {
  if (!root) return [];
  const queue = [root];
  const collected = [];
  const visited = new Set();

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const current = queue[queueIndex];
    if (!current || visited.has(current)) continue;
    visited.add(current);

    if (
      current.nodeType === Node.ELEMENT_NODE ||
      current.nodeType === Node.DOCUMENT_FRAGMENT_NODE ||
      current.nodeType === Node.DOCUMENT_NODE
    ) {
      collected.push(current);
    }

    if (current.nodeType === Node.ELEMENT_NODE && current.shadowRoot) {
      queue.push(current.shadowRoot);
    }

    if (
      current.nodeType !== Node.ELEMENT_NODE &&
      current.nodeType !== Node.DOCUMENT_FRAGMENT_NODE &&
      current.nodeType !== Node.DOCUMENT_NODE
    ) {
      continue;
    }

    const walker = document.createTreeWalker(current, NodeFilter.SHOW_ELEMENT, null);
    let element;
    while ((element = walker.nextNode())) {
      if (element.shadowRoot) {
        queue.push(element.shadowRoot);
      }
    }
  }

  return collected;
}

function processRootAndOpenShadowRoots(root, wordsSet = null, options = {}) {
  let highlightedRanges = 0;
  if (isInHighChurnTextContext(root)) return highlightedRanges;

  collectRootAndOpenShadowRoots(root).forEach((processRoot) => {
    if (isInHighChurnTextContext(processRoot)) return;
    highlightedRanges += processAllTextNodes(processRoot, wordsSet, options);
  });
  return highlightedRanges;
}

function clearHighlightsInSubtreeAndOpenShadowRoots(root) {
  if (!root) return 0;
  if (
    root.nodeType !== Node.ELEMENT_NODE &&
    root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE &&
    root.nodeType !== Node.DOCUMENT_NODE
  ) {
    return clearHighlightsInSubtree(root);
  }
  let removed = 0;
  collectRootAndOpenShadowRoots(root).forEach((processRoot) => {
    removed += clearHighlightsInSubtree(processRoot);
  });
  return removed;
}

function ensureShadowRootObserver(shadowRoot) {
  if (!shadowRoot || shadowRootObservers.has(shadowRoot)) return;
  if (shadowRoot.host && isInHighChurnTextContext(shadowRoot.host)) return;

  const shadowObserver = new MutationObserver((mutations) => {
    queueMutationRecords(mutations);
  });
  shadowObserver.observe(shadowRoot, OBSERVER_OPTIONS);
  shadowRootObservers.set(shadowRoot, shadowObserver);
}

function disconnectShadowRootObserver(shadowRoot) {
  const shadowObserver = shadowRootObservers.get(shadowRoot);
  if (!shadowObserver) return;
  shadowObserver.disconnect();
  shadowRootObservers.delete(shadowRoot);
}

function disconnectShadowRootObserversInSubtree(root) {
  if (!root || shadowRootObservers.size === 0) return;
  collectRootAndOpenShadowRoots(root).forEach((processRoot) => {
    if (processRoot && processRoot.nodeType === Node.DOCUMENT_FRAGMENT_NODE && processRoot.host) {
      disconnectShadowRootObserver(processRoot);
    }
  });
}

function pruneDisconnectedShadowRootObservers() {
  if (shadowRootObservers.size === 0) return;
  shadowRootObservers.forEach((shadowObserver, shadowRoot) => {
    if (!shadowRoot.host || !shadowRoot.host.isConnected) {
      shadowObserver.disconnect();
      shadowRootObservers.delete(shadowRoot);
    }
  });
}

function observeOpenShadowRoots(root) {
  if (isInHighChurnTextContext(root)) return;
  pruneDisconnectedShadowRootObservers();

  collectRootAndOpenShadowRoots(root).forEach((processRoot) => {
    if (processRoot && processRoot.nodeType === Node.DOCUMENT_FRAGMENT_NODE && processRoot.host) {
      if (isInHighChurnTextContext(processRoot.host)) return;
      ensureShadowRootObserver(processRoot);
    }
  });
}

function isComposedDescendant(node, ancestor) {
  if (!node || !ancestor) return false;
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    current = getComposedParent(current);
  }
  return false;
}

function getDeepestPointContext(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { root: document, element: null };
  }

  let currentRoot = document;
  let currentElement = null;
  const visitedRoots = new Set([document]);

  while (currentRoot && typeof currentRoot.elementFromPoint === 'function') {
    const nextElement = currentRoot.elementFromPoint(x, y);
    if (!nextElement) break;
    currentElement = nextElement;

    const shadowRoot = nextElement.shadowRoot;
    if (!shadowRoot || visitedRoots.has(shadowRoot)) {
      break;
    }

    visitedRoots.add(shadowRoot);
    currentRoot = shadowRoot;
  }

  return { root: currentRoot || document, element: currentElement };
}

function buildRangeFromCaretPosition(position) {
  if (!position || !position.offsetNode) return null;
  const range = document.createRange();
  const maxOffset =
    position.offsetNode.nodeType === Node.TEXT_NODE
      ? (position.offsetNode.textContent || '').length
      : position.offsetNode.childNodes.length;
  const offset = Math.min(Math.max(position.offset || 0, 0), maxOffset);
  range.setStart(position.offsetNode, offset);
  range.collapse(true);
  return range;
}

function getCaretRangeAtPoint(x, y, root = null) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const roots = [];
  if (root) roots.push(root);
  if (!roots.includes(document)) roots.push(document);

  for (const candidateRoot of roots) {
    if (!candidateRoot) continue;

    if (typeof candidateRoot.caretRangeFromPoint === 'function') {
      try {
        const range = candidateRoot.caretRangeFromPoint(x, y);
        if (range) return range;
      } catch (error) {
        // Try alternative APIs.
      }
    }

    if (typeof candidateRoot.caretPositionFromPoint === 'function') {
      try {
        const position = candidateRoot.caretPositionFromPoint(x, y);
        const range = buildRangeFromCaretPosition(position);
        if (range) return range;
      } catch (error) {
        // Try next root.
      }
    }
  }

  return null;
}

function getElementsAtPointCandidates(x, y, existingPointContext = null) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
  const pointContext = existingPointContext || getDeepestPointContext(x, y);
  const roots = [];
  if (pointContext.root) roots.push(pointContext.root);
  if (!roots.includes(document)) roots.push(document);

  const candidates = [];
  const seen = new Set();

  roots.forEach((root) => {
    if (candidates.length >= MAX_POINT_CANDIDATE_ELEMENTS) return;
    if (!root) return;
    let elements = [];

    if (typeof root.elementsFromPoint === 'function') {
      try {
        elements = root.elementsFromPoint(x, y) || [];
      } catch (error) {
        elements = [];
      }
    }

    if ((!elements || elements.length === 0) && typeof root.elementFromPoint === 'function') {
      try {
        const fallbackElement = root.elementFromPoint(x, y);
        if (fallbackElement) {
          elements = [fallbackElement];
        }
      } catch (error) {
        elements = [];
      }
    }

    for (let i = 0; i < elements.length; i += 1) {
      const element = elements[i];
      if (!element || seen.has(element)) continue;
      if (element === document.body || element === document.documentElement) continue;
      seen.add(element);
      candidates.push(element);
      if (candidates.length >= MAX_POINT_CANDIDATE_ELEMENTS) break;
    }
  });

  if (
    pointContext.element &&
    pointContext.element !== document.body &&
    pointContext.element !== document.documentElement &&
    !seen.has(pointContext.element) &&
    candidates.length < MAX_POINT_CANDIDATE_ELEMENTS
  ) {
    candidates.unshift(pointContext.element);
  }

  return candidates;
}

function isExtensionUiNode(node) {
  if (!node) return false;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!element) {
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && node.host) {
      return isExtensionUiNode(node.host);
    }
    return false;
  }

  if (typeof element.closest === 'function') {
    if (element.closest('.hlw-word-popup-host, .hlw-word-sidebar, .selection-icon')) {
      return true;
    }
  }

  const root = typeof element.getRootNode === 'function' ? element.getRootNode() : null;
  return !!(
    root &&
    root.host &&
    root.host.classList &&
    root.host.classList.contains('hlw-word-popup-host')
  );
}

function isYouTubeHost() {
  const host = window.location.hostname;
  return (
    host === 'youtu.be' ||
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube-nocookie.com')
  );
}

function isTwitterHost() {
  const host = window.location.hostname;
  return (
    host === 'x.com' ||
    host.endsWith('.x.com') ||
    host === 'twitter.com' ||
    host.endsWith('.twitter.com')
  );
}

function isLinkedInHost() {
  const host = window.location.hostname;
  return host === 'linkedin.com' || host.endsWith('.linkedin.com');
}

function isLinkedInJobsPage() {
  if (!isLinkedInHost()) return false;
  return (window.location.pathname || '').includes('/jobs');
}

function isTopLevelFrame() {
  try {
    return window.top === window;
  } catch (error) {
    return false;
  }
}

function isYouTubeLiveChatFrame() {
  if (!isYouTubeHost()) return false;
  const path = window.location.pathname || '';
  return path.startsWith('/live_chat') || path.startsWith('/live_chat_replay');
}

function shouldRunInCurrentFrame() {
  return isTopLevelFrame() || isYouTubeLiveChatFrame();
}

function getContextElement(node) {
  if (!node) return null;
  if (node.nodeType === Node.ELEMENT_NODE) return node;
  if (node.parentElement) return node.parentElement;
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && node.host) return node.host;

  const root = typeof node.getRootNode === 'function' ? node.getRootNode() : null;
  if (root && root.host) return root.host;
  return null;
}

function closestSafely(element, selector) {
  if (!element || typeof element.closest !== 'function' || !selector) return null;
  try {
    return element.closest(selector);
  } catch (error) {
    return null;
  }
}

function isYouTubeCaptionContext(node) {
  if (!isYouTubeHost()) return false;
  const element = getContextElement(node);
  if (!element) return false;
  return !!closestSafely(element, YOUTUBE_CAPTION_TEXT_CONTAINER_SELECTOR);
}

function isYouTubeLiveChatTextContext(node) {
  if (!isYouTubeHost()) return false;
  const element = getContextElement(node);
  if (!element) return false;
  return !!closestSafely(element, YOUTUBE_LIVE_CHAT_TEXT_CONTAINER_SELECTOR);
}

function isYouTubeReadableDynamicTextContext(node) {
  return isYouTubeCaptionContext(node) || isYouTubeLiveChatTextContext(node);
}

function isTwitterStaticInteractiveTextContext(node) {
  if (!isTwitterHost()) return false;
  const element = getContextElement(node);
  if (!element) return false;
  return !!closestSafely(element, STATIC_INTERACTIVE_TEXT_SELECTOR);
}

function isTwitterEditorPlaceholderContext(node) {
  if (!isTwitterHost()) return false;
  const element = getContextElement(node);
  if (!element) return false;
  return !!closestSafely(element, TWITTER_EDITOR_PLACEHOLDER_SELECTOR);
}

function isLinkedInReadableDynamicTextContext(node) {
  if (!isLinkedInJobsPage()) return false;
  const element = getContextElement(node);
  if (!element) return false;
  return !!closestSafely(element, LINKEDIN_READABLE_DYNAMIC_TEXT_SELECTOR);
}

function isInHighChurnTextContext(node) {
  const element = getContextElement(node);
  if (!element) return false;

  if (isTwitterEditorPlaceholderContext(element)) return false;
  if (isTwitterStaticInteractiveTextContext(element)) return false;
  if (isYouTubeReadableDynamicTextContext(element)) return false;
  if (isLinkedInReadableDynamicTextContext(element)) return false;
  if (closestSafely(element, HIGH_CHURN_TEXT_CONTAINER_SELECTOR)) return true;
  if (isYouTubeHost() && closestSafely(element, YOUTUBE_HIGH_CHURN_TEXT_CONTAINER_SELECTOR)) {
    return true;
  }

  const root = typeof element.getRootNode === 'function' ? element.getRootNode() : null;
  if (root && root.host && root.host !== element) {
    return isInHighChurnTextContext(root.host);
  }

  return false;
}

function shouldIgnoreMutationNode(node) {
  return isExtensionUiNode(node) || isInHighChurnTextContext(node);
}

function isMutationRelevantForHighlights(mutation) {
  if (!mutation) return false;
  if (!shouldIgnoreMutationNode(mutation.target)) return true;

  for (const node of mutation.addedNodes) {
    if (!shouldIgnoreMutationNode(node)) return true;
  }
  for (const node of mutation.removedNodes) {
    if (!shouldIgnoreMutationNode(node)) return true;
  }

  return false;
}

function shouldRefreshHighlightsForMutations(mutations) {
  if (!hasActiveHighlightMode()) return false;

  for (const mutation of mutations) {
    if (isMutationRelevantForHighlights(mutation)) {
      return true;
    }
  }
  return false;
}

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
    rootsToProcess: new Set(),
    cleanedRanges: 0
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
  context.cleanedRanges += clearHighlightsInSubtreeAndOpenShadowRoots(target);
  context.rootsToProcess.add(target);
}

function collectChildListMutation(mutation, context) {
  mutation.removedNodes.forEach((node) => {
    disconnectShadowRootObserversInSubtree(node);
    if (shouldIgnoreMutationNode(node)) return;
    context.cleanedRanges += clearHighlightsInSubtreeAndOpenShadowRoots(node);
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
  let cleanedRanges = 0;

  textNodes.forEach((textNode) => {
    cleanedRanges += clearHighlightsForTextNode(textNode);
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !textNode.isConnected) return;
    const parentElement = textNode.parentElement;
    if (!parentElement || !shouldProcessNode(parentElement) || isInWordPopup(parentElement)) return;
    highlightWordsInTextNode(textNode, wordsSet, visibilityCache);
  });

  return cleanedRanges;
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

  work.cleanedRanges += refreshMutatedTextNodes(work.textNodesToRefresh, wordsSet, visibilityCache);
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
      if (element.matches(RICH_EDITOR_ROOT_SELECTOR)) return true;
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
  if (joinedHints.includes('prosemirror')) return true;
  if (joinedHints.includes('drafteditor')) return true;
  if (joinedHints.includes('rich-text')) return true;
  if (joinedHints.includes('richeditor')) return true;
  if (joinedHints.includes('lexical')) return true;
  if (joinedHints.includes('slate-editor')) return true;
  if (joinedHints.includes('notion-')) return true;
  if (joinedHints.includes('kix-')) return true;
  if (joinedHints.includes('ql-editor')) return true;
  if (joinedHints.includes('codemirror')) return true;
  if (joinedHints.includes('monaco-editor')) return true;
  if (joinedHints.includes('ace_editor')) return true;
  if (joinedHints.includes('note-editor')) return true;
  if (joinedHints.includes('editor-content')) return true;
  if (joinedHints.includes('qa-common_editor_iframe')) return true;

  if (tagName === 'IFRAME') {
    if (joinedHints.includes('editor')) return true;
    if (joinedHints.includes('evernote')) return true;
    if (joinedHints.includes('docs')) return true;
    if (joinedHints.includes('kix')) return true;
    if (joinedHints.includes('compose')) return true;
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
  return isInRichEditorContext(node) && !isTwitterEditorPlaceholderContext(node);
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
        if (chrome.runtime.lastError || !siteEnabled) {
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
    console.error('Error in updateHighlights:', e);
  }
}

async function getTranslation(word, signal) {
  const cacheKey = word.toLowerCase();
  const cachedResult = getCachedTranslation(cacheKey);

  if (cachedResult) {
    return cachedResult;
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new Error('Translation aborted'));
    };

    signal?.addEventListener('abort', onAbort);

    chrome.runtime.sendMessage({ action: 'translate', word }, (response) => {
      cleanup();
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else if (!response) {
        reject(new Error('Empty translation response'));
      } else if (response.error) {
        reject(new Error(response.error));
      } else {
        cacheTranslation(cacheKey, response);
        resolve(response);
      }
    });
  });
}

function getCachedTranslation(key) {
  const cachedEntry = translationCache.get(key);
  if (cachedEntry) {
    const now = Date.now();
    if (now - cachedEntry.timestamp < CACHE_EXPIRATION_TIME) {
      cachedEntry.timestamp = now;
      return cachedEntry.translation;
    } else {
      translationCache.delete(key);
    }
  }
  return null;
}

function pruneTranslationCache(now = Date.now()) {
  translationCache.forEach((entry, key) => {
    if (!entry || now - entry.timestamp >= CACHE_EXPIRATION_TIME) {
      translationCache.delete(key);
    }
  });

  if (translationCache.size <= MAX_TRANSLATION_CACHE_SIZE) return;

  const sortedEntries = Array.from(translationCache.entries()).sort(
    (a, b) => a[1].timestamp - b[1].timestamp
  );
  const overflowCount = translationCache.size - MAX_TRANSLATION_CACHE_SIZE;

  for (let i = 0; i < overflowCount; i++) {
    const [key] = sortedEntries[i];
    translationCache.delete(key);
  }
}

function cacheTranslation(key, translation) {
  const now = Date.now();
  translationCache.set(key, { translation, timestamp: now });
  pruneTranslationCache(now);
}

function normalizePopupWord(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isTrackedHighlightedWord(word) {
  const normalizedWord = normalizePopupWord(word);
  return !!normalizedWord && highlights.has(normalizedWord.toLowerCase());
}

function resolvePopupPayloadFromEvent(event) {
  if (!event) return null;

  if (event.isFromSelectionIcon) {
    const word = normalizePopupWord(event.selectedText);
    if (!word || !event.rect) return null;
    return {
      word,
      rect: event.rect,
      hideKnownButton: true
    };
  }

  if (event.precomputedWord && event.precomputedRect) {
    const word = normalizePopupWord(event.precomputedWord);
    if (!word || !isTrackedHighlightedWord(word)) return null;
    return {
      word,
      rect: event.precomputedRect,
      hideKnownButton: false
    };
  }

  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;

  const pointContext = getDeepestPointContext(event.clientX, event.clientY);
  const range = getCaretRangeAtPoint(event.clientX, event.clientY, pointContext.root);
  let match = null;

  if (range) {
    match = findWordAtRange(range, event.clientX, event.clientY, pointContext.element);
  }
  if (!match) {
    match = findWordAtPoint(event.clientX, event.clientY, pointContext);
  }

  if (!match || !isTrackedHighlightedWord(match.word) || !match.rect) return null;
  return {
    word: normalizePopupWord(match.word),
    rect: match.rect,
    hideKnownButton: false
  };
}

function beginPopupSession(word, rect, hideKnownButton = false) {
  if (activePopup) {
    hidePopup();
  }

  const popup = createPopup(word, rect, hideKnownButton);
  activePopup = popup;
  const popupRequestId = ++currentPopupRequestId;

  clearTimeout(popupHideTimer);

  if (currentTranslationController) {
    currentTranslationController.abort();
  }
  const controller = new AbortController();
  currentTranslationController = controller;

  return {
    popup,
    popupRequestId,
    controller,
    signal: controller.signal
  };
}

function isPopupSessionStale(session) {
  if (!session) return true;
  return !!(
    session.signal?.aborted ||
    session.popupRequestId !== currentPopupRequestId ||
    activePopup !== session.popup ||
    !session.popup ||
    !session.popup.isConnected
  );
}

function fetchTranslationWithAbort(word, signal) {
  return Promise.race([
    getTranslation(word, signal),
    new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Translation aborted')), {
        once: true
      });
    })
  ]);
}

function extractPopupTranslationData(word, translationResponse) {
  const translationData = {
    googleTranslation: '',
    cambridgeTranslation: {},
    bingdictTranslation: null
  };

  if (!translationResponse) return translationData;

  const { googleResult, cambridgeResult, bingdictResult } = translationResponse;
  if (googleResult?.translation) {
    translationData.googleTranslation = googleResult.translation;
  }

  if (cambridgeResult?.html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(cambridgeResult.html, 'text/html');
    translationData.cambridgeTranslation = {
      word,
      pronunciation: extractPronunciation(doc)
    };
  }

  if (bingdictResult?.html) {
    translationData.bingdictTranslation = extractWordDetails(bingdictResult.html);
  }

  return translationData;
}

// Popup management functions
async function showPopup(event) {
  if (!siteEnabled) return;

  const payload = resolvePopupPayloadFromEvent(event);
  if (!payload || !payload.word || !payload.rect) return;

  const session = beginPopupSession(payload.word, payload.rect, payload.hideKnownButton);

  try {
    const translationResponse = await fetchTranslationWithAbort(payload.word, session.signal);
    if (isPopupSessionStale(session)) return;

    const translationData = extractPopupTranslationData(payload.word, translationResponse);
    updatePopupContent(
      session.popup,
      translationData.googleTranslation,
      translationData.cambridgeTranslation,
      translationData.bingdictTranslation
    );
  } catch (error) {
    if (error && error.message === 'Translation aborted') {
      return;
    }
    console.error('Translation error:', error);
    if (isPopupSessionStale(session)) return;
    updatePopupContent(session.popup, '', {}, null);
  } finally {
    if (currentTranslationController === session.controller) {
      currentTranslationController = null;
    }
  }
}

// 提取 bingdict 词汇详细内容
const extractWordDetails = (htmlContent) => {
  // 将传入的 HTML 内容解析成 DOM 对象
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // 获取发音部分
  const usPronunciation = doc.querySelector('.hd_prUS');
  const usPronunciationText = usPronunciation ? usPronunciation.textContent.trim() : null;

  const ukPronunciation = doc.querySelector('.hd_pr');
  const ukPronunciationText = ukPronunciation ? ukPronunciation.textContent.trim() : null;

  // 获取各个词性的释义
  const definitions = doc.querySelectorAll('.qdef ul li');

  const definitionTexts = [];
  definitions.forEach((def) => {
    const posElement = def.querySelector('.pos');
    const meaningElement = def.querySelector('.def.b_regtxt');
    const pos = posElement ? posElement.textContent.trim() : '词性未知?';
    const meaning = meaningElement ? meaningElement.textContent.trim() : '释义不存在?';
    definitionTexts.push(`${pos} ${meaning}`);
  });

  // 获取词形变化
  const plural = doc.querySelector('.hd_div1 .hd_if .p1-5');
  // 复数形式
  const pluralText = plural ? plural.textContent.trim() : null;

  // 现在分词
  const presentParticiple = doc.querySelector('.hd_div1 .hd_if .p1-5:nth-of-type(2)');
  const presentParticipleText = presentParticiple ? presentParticiple.textContent.trim() : null;

  // 过去分词
  const pastTense = doc.querySelector('.hd_div1 .hd_if .p1-5:nth-of-type(3)');
  const pastTenseText = pastTense ? pastTense.textContent.trim() : null;

  let bingdictTranslation = {
    pronunciation: {
      us: usPronunciationText,
      uk: ukPronunciationText
    },
    definition: definitionTexts,
    plural: pluralText,
    presentParticiple: presentParticipleText,
    pastTense: pastTenseText
  };
  return bingdictTranslation;
};

function extractPronunciation(doc) {
  const pronunciation = [];

  const addPronunciationAudio = (posHeader, selector, lang) => {
    const pronElement = posHeader.querySelector(selector);
    if (!pronElement) return;

    const audioElement = pronElement.querySelector('audio');
    const sourceElement = audioElement?.querySelector('source[type="audio/mpeg"], source[src]');
    const sourcePath = sourceElement?.getAttribute('src');
    if (!sourcePath) return;

    const url = new URL(sourcePath, 'https://dictionary.cambridge.org/').href;
    pronunciation.push({ lang, url });
  };

  // 获取所有包含发音的部分
  const posHeaders = doc.querySelectorAll('.pos-header.dpos-h');
  posHeaders.forEach((posHeader) => {
    addPronunciationAudio(posHeader, '.uk.dpron-i', 'uk');
    addPronunciationAudio(posHeader, '.us.dpron-i', 'us');
  });
  return pronunciation;
}

function getPopupContentElements(popupRoot) {
  return {
    googleContentElement: popupRoot.querySelector('.hlw-google-translation'),
    bingdictContentElement: popupRoot.querySelector('.hlw-bingdict-translation-container'),
    translationRow: popupRoot.querySelector('.hlw-translation-row'),
    phoneticDiv: popupRoot.querySelector('.hlw-word-phonetic'),
    phoneticElementUK: popupRoot.querySelector('.hlw-word-phonetic-uk'),
    phoneticElementUS: popupRoot.querySelector('.hlw-word-phonetic-us'),
    formsContainer: popupRoot.querySelector('.hlw-word-forms-container'),
    popupContainer: popupRoot.querySelector('.hlw-word-popup')
  };
}

function resetPopupContentElements(elements, googleTranslation) {
  elements.googleContentElement.textContent = googleTranslation || '';
  elements.phoneticDiv.style.display = 'none';
  [elements.phoneticElementUK, elements.phoneticElementUS].forEach((element) => {
    element.style.display = 'none';
    element.onclick = null;
    element.style.cursor = 'default';
  });
  elements.formsContainer.innerHTML = '';
  if (elements.bingdictContentElement) {
    elements.bingdictContentElement.innerHTML = '';
    elements.bingdictContentElement.style.display = 'none';
  }
}

function bindPronunciationFallback(element, cambridgeTranslation, pronunciation, fallbackLang) {
  if (!pronunciation) return;
  element.onclick = () => {
    const audio = new Audio(pronunciation.url);
    audio.play().catch(() => {
      pronounceWord(cambridgeTranslation.word, fallbackLang);
    });
  };
  element.style.cursor = 'pointer';
}

function renderPopupPhonetic(
  element,
  label,
  bingdictText,
  cambridgeTranslation,
  cambridgeLang,
  fallbackLang
) {
  if (!bingdictText || bingdictText.length <= 3) return false;

  element.textContent = `${label} ${formatPhonetic(bingdictText)}`;
  element.style.display = 'inline-flex';

  const cambridgeData = cambridgeTranslation || {};
  const pronunciation = (cambridgeData.pronunciation || []).find(
    (pron) => pron.lang === cambridgeLang
  );
  bindPronunciationFallback(element, cambridgeData, pronunciation, fallbackLang);
  return true;
}

function createWordFormElement(className, label, value) {
  const formsElement = document.createElement('span');
  formsElement.className = `hlw-word-forms ${className}`;
  formsElement.textContent = `${label}: ${value}`;
  return formsElement;
}

function renderWordForms(formsContainer, bingdictTranslation) {
  const forms = [
    ['hlw-word-forms-plural', '复数形式', bingdictTranslation.plural || ''],
    [
      'hlw-word-forms-present-participle',
      '现在分词',
      bingdictTranslation.presentParticiple || ''
    ],
    ['hlw-word-forms-past-tense', '过去分词', bingdictTranslation.pastTense || '']
  ];

  forms.forEach(([className, label, value]) => {
    if (value) formsContainer.appendChild(createWordFormElement(className, label, value));
  });
}

function renderBingdictPopupContent(elements, bingdictTranslation, cambridgeTranslation) {
  const bingDictDefinition = generateDefinitionFromJson(bingdictTranslation);
  if (bingDictDefinition && elements.bingdictContentElement) {
    elements.bingdictContentElement.innerHTML = bingDictDefinition;
    elements.bingdictContentElement.style.display = 'block';
  }

  const pronunciation = bingdictTranslation.pronunciation || {};
  const hasUkPhonetic = renderPopupPhonetic(
    elements.phoneticElementUK,
    'UK',
    pronunciation.uk,
    cambridgeTranslation,
    'uk',
    'en-GB'
  );
  const hasUsPhonetic = renderPopupPhonetic(
    elements.phoneticElementUS,
    'US',
    pronunciation.us,
    cambridgeTranslation,
    'us',
    'en-US'
  );
  if (hasUkPhonetic || hasUsPhonetic) {
    elements.phoneticDiv.style.display = 'block';
  }

  renderWordForms(elements.formsContainer, bingdictTranslation);
}

function updatePopupLayoutState(popup, elements, googleTranslation) {
  const hasPhonetic = elements.phoneticDiv.style.display !== 'none';
  const hasTranslation = !!(googleTranslation && googleTranslation.trim());
  if (elements.translationRow) {
    elements.translationRow.style.display = !hasTranslation && !hasPhonetic ? 'none' : '';
  }
  if (elements.popupContainer) {
    elements.popupContainer.classList.toggle('hlw-no-phonetic', !hasPhonetic);
    elements.popupContainer.classList.toggle(
      'hlw-no-translation-row',
      !hasTranslation && !hasPhonetic
    );
  }
  requestAnimationFrame(() => {
    if (activePopup === popup && popup.isConnected) {
      positionPopup(popup);
    }
  });
}

function updatePopupContent(popup, googleTranslation, cambridgeTranslation, bingdictTranslation) {
  if (!popup || activePopup !== popup) return;

  const popupRoot = getPopupRoot(popup);
  if (!popupRoot) return;

  const elements = getPopupContentElements(popupRoot);
  if (
    !elements.googleContentElement ||
    !elements.phoneticDiv ||
    !elements.phoneticElementUK ||
    !elements.phoneticElementUS ||
    !elements.formsContainer
  ) {
    return;
  }

  resetPopupContentElements(elements, googleTranslation);
  if (bingdictTranslation) {
    renderBingdictPopupContent(elements, bingdictTranslation, cambridgeTranslation);
  }
  updatePopupLayoutState(popup, elements, googleTranslation);
}

function formatPhonetic(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';
  const core = trimmed
    .replace(/^(UK|US)\s*/i, '')
    .replace(/[\[\]]/g, '')
    .trim();
  if (!core) return '';
  return `/${core}/`;
}

function generateDefinitionFromJson(json) {
  const container = document.createElement('div');
  container.className = 'definitions-container';
  (json.definition || []).forEach((def) => {
    // 将定义分成词性和内容两部分
    const [pos, ...rest] = def.split(/\s(.+)/); // 分割出词性和定义内容

    const posElement = document.createElement('span');
    posElement.className = 'hlw-definition-pos';
    posElement.textContent = pos + '  ';

    const contentElement = document.createElement('span');
    contentElement.className = 'hlw-definition-content';
    contentElement.textContent = rest.join('');

    const defWrapper = document.createElement('div');
    defWrapper.className = 'hlw-definition-text-wrapper';

    const defText = document.createElement('p');
    defText.className = 'hlw-definition-text';
    defText.appendChild(posElement);
    defText.appendChild(contentElement);

    defWrapper.appendChild(defText);
    container.appendChild(defWrapper);
  });
  return container.innerHTML;
}

function isPointInRange(range, x, y, pointRange = null, pointElement = null) {
  if (!range) return false;
  const parentElement =
    range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : range.startContainer;
  const hitElement = pointElement || document.elementFromPoint(x, y);
  const isRootHit =
    !hitElement || hitElement === document.body || hitElement === document.documentElement;
  if (isRootHit && pointRange) {
    return false;
  }
  let skipContainCheck = false;
  if (parentElement && window.getComputedStyle) {
    const parentStyle = window.getComputedStyle(parentElement);
    if (parentStyle && parentStyle.pointerEvents === 'none') {
      skipContainCheck = true;
    }
  }
  if (
    !skipContainCheck &&
    parentElement &&
    hitElement &&
    !isComposedDescendant(hitElement, parentElement)
  ) {
    if (!pointRange) {
      return false;
    }
    try {
      if (
        pointRange.compareBoundaryPoints(Range.START_TO_START, range) < 0 ||
        pointRange.compareBoundaryPoints(Range.END_TO_END, range) > 0
      ) {
        return false;
      }
    } catch (error) {
      return false;
    }
  }
  let fontSize = DEFAULT_POINT_HIT_FONT_SIZE_PX;
  if (parentElement && window.getComputedStyle) {
    const style = window.getComputedStyle(parentElement);
    const parsedFontSize = parseFloat(style.fontSize);
    if (Number.isFinite(parsedFontSize)) {
      fontSize = parsedFontSize;
    }
  }
  const isInsideRect = (rect) => {
    const insetX = Math.min(
      POINT_HIT_MAX_INSET_X_PX,
      Math.max(POINT_HIT_MIN_INSET_X_PX, rect.width * POINT_HIT_WIDTH_INSET_RATIO)
    );
    const targetHeight = Math.min(
      rect.height,
      Math.max(fontSize * POINT_HIT_FONT_HEIGHT_RATIO, POINT_HIT_MIN_HEIGHT_PX)
    );
    const extraY = Math.max(0, (rect.height - targetHeight) / 2);
    const insetY = Math.max(POINT_HIT_MIN_INSET_Y_PX, extraY);
    const left = rect.left + insetX;
    const right = rect.right - insetX;
    const top = rect.top + insetY;
    const bottom = rect.bottom - insetY;
    if (left >= right || top >= bottom) {
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }
    return x >= left && x <= right && y >= top && y <= bottom;
  };
  const rects = range.getClientRects();
  if (rects && rects.length) {
    for (const rect of rects) {
      if (isInsideRect(rect)) {
        return true;
      }
    }
    return false;
  }
  const rect = range.getBoundingClientRect();
  return isInsideRect(rect);
}

function resolveTextNodeFromRange(range) {
  if (!range) return null;
  const startContainer = range.startContainer;
  if (!startContainer) return null;

  if (startContainer.nodeType === Node.TEXT_NODE) {
    return startContainer;
  }

  if (startContainer.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const offset = Number.isFinite(range.startOffset) ? range.startOffset : 0;
  const directNode =
    startContainer.childNodes[offset] || startContainer.childNodes[Math.max(0, offset - 1)];
  if (directNode && directNode.nodeType === Node.TEXT_NODE) {
    return directNode;
  }

  if (directNode && directNode.firstChild && directNode.firstChild.nodeType === Node.TEXT_NODE) {
    return directNode.firstChild;
  }

  return null;
}

function findWordAtRange(range, x, y, pointElement = null) {
  if (!range) return null;
  const hasPoint = Number.isFinite(x) && Number.isFinite(y);
  const startContainer = resolveTextNodeFromRange(range);
  const startOffset = range.startOffset;
  const entries = getTextNodeHighlightEntries(startContainer);
  const hasCharacterOffset =
    startContainer && startContainer === range.startContainer && Number.isFinite(startOffset);

  // Prioritize exact caret text-node match.
  if (startContainer && entries.length > 0) {
    for (const entry of entries) {
      const highlightRange = entry.range;
      if (!highlightRange || highlightRange.startContainer !== startContainer) continue;
      if (shouldSkipRichEditorContext(highlightRange.startContainer)) continue;
      if (hasCharacterOffset) {
        if (startOffset < highlightRange.startOffset || startOffset > highlightRange.endOffset)
          continue;
      }
      if (!hasPoint || isPointInRange(highlightRange, x, y, range, pointElement)) {
        return { word: entry.word, rect: highlightRange.getBoundingClientRect() };
      }
    }
  }

  // Non-point fallback: keep support for callers that pass only a range.
  if (!hasPoint && entries.length > 0) {
    for (const entry of entries) {
      const highlightRange = entry.range;
      if (!highlightRange || shouldSkipRichEditorContext(highlightRange.startContainer)) continue;
      if (
        range.compareBoundaryPoints(Range.START_TO_START, highlightRange) >= 0 &&
        range.compareBoundaryPoints(Range.END_TO_END, highlightRange) <= 0
      ) {
        return { word: entry.word, rect: highlightRange.getBoundingClientRect() };
      }
    }
  }
  return null;
}

function forEachTextNodeInElementContext(
  rootNode,
  visitedTextNodes,
  callback,
  maxTextNodes = MAX_TEXT_NODES_PER_ELEMENT_CONTEXT
) {
  if (!rootNode || typeof callback !== 'function') return false;
  const queue = [rootNode];
  const visitedNodes = new Set();
  let scannedTextNodes = 0;

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    if (scannedTextNodes >= maxTextNodes) return false;
    const node = queue[queueIndex];
    if (!node || visitedNodes.has(node)) continue;
    visitedNodes.add(node);

    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.textContent || !node.textContent.trim()) continue;
      if (visitedTextNodes.has(node)) continue;
      visitedTextNodes.add(node);
      scannedTextNodes += 1;
      if (callback(node) === true) {
        return true;
      }
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      continue;
    }

    if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.tagName === 'SLOT' &&
      typeof node.assignedNodes === 'function'
    ) {
      let assignedNodes = [];
      try {
        assignedNodes = node.assignedNodes({ flatten: true }) || [];
      } catch (error) {
        assignedNodes = [];
      }
      assignedNodes.forEach((assignedNode) => {
        if (assignedNode) queue.push(assignedNode);
      });
    }

    if (node.nodeType === Node.ELEMENT_NODE && node.shadowRoot) {
      queue.push(node.shadowRoot);
    }

    const childNodes = node.childNodes || [];
    for (let i = 0; i < childNodes.length; i += 1) {
      queue.push(childNodes[i]);
    }
  }

  return false;
}

function findWordFromElementContext(pointElement, x, y) {
  if (!pointElement || !Number.isFinite(x) || !Number.isFinite(y)) return null;

  const visitedTextNodes = new Set();
  const maxAncestorDepth = MAX_ELEMENT_CONTEXT_ANCESTOR_DEPTH;
  let depth = 0;
  let current =
    pointElement.nodeType === Node.ELEMENT_NODE ? pointElement : pointElement.parentElement;

  while (current && depth <= maxAncestorDepth) {
    if (current === document.body || current === document.documentElement) break;
    let match = null;
    const hasFoundMatch = forEachTextNodeInElementContext(current, visitedTextNodes, (textNode) => {
      if (match) return;
      const entries = getTextNodeHighlightEntries(textNode);
      if (!entries || entries.length === 0) return;

      for (const entry of entries) {
        const highlightRange = entry.range;
        if (!highlightRange || shouldSkipRichEditorContext(highlightRange.startContainer)) continue;
        if (isPointInRange(highlightRange, x, y, null, pointElement)) {
          match = { word: entry.word, rect: highlightRange.getBoundingClientRect() };
          return true;
        }
      }
      return false;
    });

    if (hasFoundMatch && match) return match;

    current = getComposedParent(current);
    depth += 1;
  }

  return null;
}

function findWordFromElementCandidates(pointElements, x, y) {
  if (!pointElements || pointElements.length === 0) return null;
  const maxCandidates = Math.min(pointElements.length, MAX_POINT_CANDIDATE_ELEMENTS);
  for (let i = 0; i < maxCandidates; i += 1) {
    const element = pointElements[i];
    if (!element || element === document.body || element === document.documentElement) continue;
    const match = findWordFromElementContext(element, x, y);
    if (match) return match;
  }
  return null;
}

function findWordAtPoint(x, y, existingPointContext = null, existingPointElements = null) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const pointContext = existingPointContext || getDeepestPointContext(x, y);
  const pointElements = existingPointElements || getElementsAtPointCandidates(x, y, pointContext);
  const pointRange = getCaretRangeAtPoint(x, y, pointContext.root);
  if (!pointRange) {
    return findWordFromElementCandidates(pointElements, x, y);
  }
  const textNode = resolveTextNodeFromRange(pointRange);
  if (!textNode) {
    return findWordFromElementCandidates(pointElements, x, y);
  }

  const entries = getTextNodeHighlightEntries(textNode);
  for (const entry of entries) {
    const highlightRange = entry.range;
    if (!highlightRange || shouldSkipRichEditorContext(highlightRange.startContainer)) continue;
    if (isPointInRange(highlightRange, x, y, pointRange, pointContext.element)) {
      return { word: entry.word, rect: highlightRange.getBoundingClientRect() };
    }
  }
  return findWordFromElementCandidates(pointElements, x, y);
}

function getPopupRoot(popup) {
  if (!popup) return null;
  return popup.shadowRoot || popup;
}

function getPopupStylesText() {
  if (popupStylesText) return Promise.resolve(popupStylesText);
  if (!popupStylesPromise) {
    popupStylesPromise = fetch(chrome.runtime.getURL('styles.css'))
      .then((response) => response.text())
      .then((text) => {
        popupStylesText = text;
        return text;
      })
      .catch((error) => {
        console.warn('Failed to load popup styles:', error);
        popupStylesText = '';
        return '';
      });
  }
  return popupStylesPromise;
}

function getPopupShadowOverrides() {
  return `
:host {
  all: initial;
  position: fixed;
  z-index: ${POPUP_Z_INDEX};
  display: block;
}
:host([data-hlw-hidden="true"]) {
  opacity: 0;
  pointer-events: none;
}
.hlw-word-popup {
  position: relative !important;
}
  `.trim();
}

function createPopupBody(word, hideKnownButton) {
  const popupBody = document.createElement('div');
  popupBody.className = 'hlw-root hlw-word-popup';
  if (hideKnownButton) {
    popupBody.classList.add('hlw-hide-known');
  }
  popupBody.innerHTML = `
    <div class="hlw-word-header">
      <h2 class="hlw-word-h2"></h2>
      <button
        class="hlw-word-known"
        ${hideKnownButton ? 'style="display: none;"' : ''}
      >&#x2713;</button>
    </div>

    <div class="hlw-word-content">
      <div class="hlw-translation-row">
        <div class="hlw-google-translation-container">
          <p class="hlw-google-translation"></p>
        </div>

        <div class="hlw-word-phonetic" style="display: none;">
          <p class="hlw-word-phonetic-uk" style="display: none;"></p>
          <p class="hlw-word-phonetic-us" style="display: none;"></p>
        </div>
      </div>

      <div class="hlw-bingdict-translation-container"></div>
      <div class="hlw-word-forms-container"></div>
    </div>
  `;
  const titleElement = popupBody.querySelector('.hlw-word-h2');
  titleElement.textContent = word;
  return popupBody;
}

function bindPopupEvents(popup, shadow, word, hideKnownButton) {
  const titleElement = shadow.querySelector('.hlw-word-h2');
  titleElement.addEventListener('click', () => pronounceWord(word, 'en-US'));

  const knownButton = shadow.querySelector('.hlw-word-known');
  if (knownButton && !hideKnownButton) {
    knownButton.addEventListener('click', () => addToKnownWords(word));
  }

  popup.addEventListener('mouseenter', () => {
    popup.dataset.mouseOver = 'true';
    clearTimeout(popupHideTimer);
  });

  popup.addEventListener('mouseleave', () => {
    popup.dataset.mouseOver = 'false';
    scheduleHidePopup();
  });
}

function injectPopupStyles(popup, style, popupShadowOverrides) {
  getPopupStylesText().then((text) => {
    if (activePopup !== popup || !popup.isConnected) return;
    style.textContent = `${text}\n${popupShadowOverrides}`;
    requestAnimationFrame(() => {
      if (activePopup !== popup || !popup.isConnected) return;
      positionPopup(popup, null, { reveal: true });
    });
  });
}

function createPopup(word, rect, hideKnownButton = false) {
  const popup = document.createElement('div');
  popup.className = 'hlw-word-popup-host';
  popup.dataset.word = word;
  popup.dataset.hlwHidden = 'true';
  setPopupAnchor(popup, rect);

  const shadow = popup.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  const popupShadowOverrides = getPopupShadowOverrides();
  style.textContent = popupShadowOverrides;
  shadow.appendChild(style);
  shadow.appendChild(createPopupBody(word, hideKnownButton));

  positionPopup(popup, rect, { reveal: false });
  bindPopupEvents(popup, shadow, word, hideKnownButton);
  injectPopupStyles(popup, style, popupShadowOverrides);

  return popup;
}

function setPopupAnchor(popup, rect) {
  if (!popup || !rect) return;
  popup.dataset.anchorLeft = `${rect.left}`;
  popup.dataset.anchorRight = `${rect.right}`;
  popup.dataset.anchorTop = `${rect.top}`;
  popup.dataset.anchorBottom = `${rect.bottom}`;
}

function getPopupAnchorRect(popup) {
  if (!popup) return null;
  const left = Number(popup.dataset.anchorLeft);
  const right = Number(popup.dataset.anchorRight);
  const top = Number(popup.dataset.anchorTop);
  const bottom = Number(popup.dataset.anchorBottom);
  if ([left, right, top, bottom].some((value) => Number.isNaN(value))) return null;
  return { left, right, top, bottom };
}

function positionPopup(popup, rect = null, options = {}) {
  if (!popup) return;
  const anchor = rect || getPopupAnchorRect(popup);
  if (!anchor) return;
  if (!popup.isConnected) {
    document.body.appendChild(popup);
  }
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const gap = POPUP_VIEWPORT_GAP_PX;

  let top = anchor.bottom + gap;
  let left = anchor.left;
  const popupRect = popup.getBoundingClientRect();

  if (top + popupRect.height > viewportHeight - gap) {
    top = anchor.top - popupRect.height - gap;
  }

  if (left + popupRect.width > viewportWidth - gap) {
    left = viewportWidth - popupRect.width - gap;
  }

  if (left < gap) {
    left = gap;
  }

  if (top < gap) {
    top = gap;
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.zIndex = POPUP_Z_INDEX;

  if (options.reveal && popup.dataset.hlwHidden === 'true') {
    delete popup.dataset.hlwHidden;
  }
}

function scheduleHidePopup() {
  clearTimeout(popupHideTimer);
  if (!activePopup) return;
  popupHideTimer = setTimeout(() => {
    if (activePopup && activePopup.dataset.mouseOver !== 'true') {
      hidePopup();
    }
  }, POPUP_HIDE_DELAY_MS);
}

function hidePopup() {
  clearTimeout(popupHideTimer);
  popupHideTimer = null;
  currentPopupRequestId += 1;

  if (currentTranslationController) {
    currentTranslationController.abort();
    currentTranslationController = null;
  }

  if (activePopup && document.body.contains(activePopup)) {
    document.body.removeChild(activePopup);
  }
  activePopup = null;
}

// Word management functions
function pronounceWord(word, lang) {
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const speakNow = () => {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = lang;
    if (isMac) {
      // Prefer higher-quality macOS voices to avoid slow/raspy output.
      const preferred = getPreferredVoice(lang);
      if (preferred) utterance.voice = preferred;
      utterance.rate = 1.08;
      utterance.pitch = 1.0;
    }
    speechSynthesis.cancel(); // Cancel any ongoing speech before speaking.
    speechSynthesis.speak(utterance);
  };

  if (speechSynthesis.getVoices().length === 0) {
    speechSynthesis.onvoiceschanged = () => {
      speechSynthesis.onvoiceschanged = null;
      speakNow();
    };
    return;
  }

  speakNow();
}

function getPreferredVoice(lang) {
  const voices = speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;
  const langLower = (lang || '').toLowerCase();
  const isEnUS = langLower.includes('en-us');
  const isEnGB = langLower.includes('en-gb');
  const matchNames = isEnUS
    ? ['Siri', 'Alex', 'Samantha']
    : isEnGB
      ? ['Siri', 'Daniel', 'Kate']
      : ['Siri'];

  for (const name of matchNames) {
    const voice = voices.find((v) => v.lang.toLowerCase() === langLower && v.name.includes(name));
    if (voice) return voice;
  }

  const langVoice = voices.find((v) => v.lang.toLowerCase() === langLower);
  return langVoice || null;
}

function addToKnownWords(word) {
  const lowercaseWord = word.toLowerCase();
  if (!knownWords.has(lowercaseWord)) {
    knownWords.add(lowercaseWord);

    hidePopup();
    removeHighlightForWord(lowercaseWord);

    // 立即更新侧边栏，避免等待存储变化监听事件
    const wordList = document.getElementById('wordList');
    if (wordList) {
      appendWordToList(lowercaseWord, wordList);
    } else {
      console.warn('Word list element not found');
    }

    // Update the word count in the hlw-content-header
    const knownWordHeader = document.querySelector('.hlw-sidebar-content.hlw-learned h2');
    if (knownWordHeader) {
      knownWordHeader.textContent = `Known Words (${knownWords.size})`;
    } else {
      console.warn('Known word hlw-content-header element not found');
    }

    // 延迟保存，避免立即触发存储变化监听器
    setTimeout(() => {
      saveKnownWords();
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

function getKnownWordCleanupKeys(items) {
  return Object.keys(items || {}).filter(
    (key) => key.startsWith(STORAGE_KEY_PREFIX) || key === 'knownWordsCount'
  );
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

function setKnownWordsMetadata(wordCount, callback) {
  chrome.storage.sync.set(
    {
      knownWordsCount: wordCount,
      knownWordsUpdated: Date.now()
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error(`Error saving known words metadata: ${chrome.runtime.lastError.message}`);
        completeStorageOperation(callback, false);
        return;
      }
      completeStorageOperation(callback, true);
    }
  );
}

function writeKnownWordChunks(chunks, wordCount, onComplete) {
  const saveBatch = (index) => {
    if (index >= chunks.length) {
      onComplete();
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

function saveKnownWords(callback) {
  beginKnownWordsSyncWrite();
  const completeSave = (success = true) => {
    finishKnownWordsSyncWrite();
    completeStorageOperation(callback, success);
  };

  try {
    const knownWordsArray = Array.from(knownWords);

    if (knownWordsArray.length === 0) {
      chrome.storage.sync.get(null, (items) => {
        if (chrome.runtime.lastError) {
          console.error(
            `Error reading existing known word chunks: ${chrome.runtime.lastError.message}`
          );
          completeSave(false);
          return;
        }
        removeKeysThen(getKnownWordCleanupKeys(items), (removed) => {
          if (!removed) {
            completeSave(false);
            return;
          }
          chrome.storage.sync.set({ knownWordsUpdated: Date.now() }, () => {
            if (chrome.runtime.lastError) {
              console.error(
                `Error saving known words clear marker: ${chrome.runtime.lastError.message}`
              );
              completeSave(false);
              return;
            }
            completeSave(true);
          });
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
          setKnownWordsMetadata(knownWordsArray.length, completeSave);
        });
      };

      writeKnownWordChunks(chunks, knownWordsArray.length, finishSave);
    });
  } catch (error) {
    console.error('Error saving known words:', error);
    completeSave(false);
  }
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
  setKnownWordsMetadata(loadedWords.length);
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
      const hasMissingMetadata = storedWordCount === null && allChunkKeys.length > 0;
      const totalWords = hasMissingMetadata ? 0 : storedWordCount || 0;
      const expectedChunks = hasMissingMetadata
        ? allChunkKeys.length
        : Math.ceil(totalWords / CHUNK_SIZE);
      const chunkKeys = hasMissingMetadata
        ? allChunkKeys
        : allChunkKeys.filter((key) => getKnownWordsChunkIndex(key) < expectedChunks);
      const staleChunkKeys = hasMissingMetadata
        ? []
        : allChunkKeys.filter((key) => getKnownWordsChunkIndex(key) >= expectedChunks);
      if (staleChunkKeys.length > 0) {
        chrome.storage.sync.remove(staleChunkKeys);
      }

      const loadedWords = readKnownWordsFromChunks(result, chunkKeys, totalWords);

      if (hasMissingMetadata) {
        setKnownWordsMetadata(loadedWords.length);
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

      // Clear the update flag
      chrome.storage.sync.remove('knownWordsUpdated');

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
    if (namespace !== 'sync') return;

    const hasKnownWordsChanges = Object.keys(changes).some(
      (key) =>
        key === 'knownWordsUpdated' ||
        key === 'knownWordsCount' ||
        key.startsWith(STORAGE_KEY_PREFIX)
    );

    if (hasKnownWordsChanges && !isKnownWordsSyncWriteInProgress()) {
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

function isPointerOverActivePopup(clientX, clientY) {
  if (!activePopup) return false;
  const popupRect = activePopup.getBoundingClientRect();
  return (
    clientX >= popupRect.left &&
    clientX <= popupRect.right &&
    clientY >= popupRect.top &&
    clientY <= popupRect.bottom
  );
}

function shouldIgnoreHoverTarget(target) {
  if (!target) return false;
  return (
    isExtensionUiNode(target) ||
    shouldSkipRichEditorContext(target) ||
    isInHighChurnTextContext(target)
  );
}

function resolveHoverMatch(clientX, clientY, fallbackTarget = null) {
  const pointContext = getDeepestPointContext(clientX, clientY);
  const pointElements = getElementsAtPointCandidates(clientX, clientY, pointContext);
  const hitTarget = pointElements[0] || pointContext.element || fallbackTarget;
  const range = getCaretRangeAtPoint(clientX, clientY, pointContext.root);

  let match = null;
  if (range) {
    match = findWordAtRange(range, clientX, clientY, pointContext.element);
  }
  if (!match) {
    match = findWordAtPoint(clientX, clientY, pointContext, pointElements);
  }

  return {
    hitTarget,
    match
  };
}

function shouldShowPopupForWord(word) {
  const normalizedWord = normalizePopupWord(word);
  if (!normalizedWord) return false;
  if (!activePopup) return true;
  const activeWord = normalizePopupWord(activePopup.dataset.word);
  return normalizedWord.toLowerCase() !== activeWord.toLowerCase();
}

function shouldSkipHoverProbe(clientX, clientY, target) {
  const now = performance.now();
  const lastProbe = handleMouseMove.lastProbe;
  if (!lastProbe) {
    handleMouseMove.lastProbe = { clientX, clientY, target, time: now };
    return false;
  }

  const elapsed = now - lastProbe.time;
  const deltaX = Math.abs(clientX - lastProbe.clientX);
  const deltaY = Math.abs(clientY - lastProbe.clientY);
  const targetUnchanged = target === lastProbe.target;

  handleMouseMove.lastProbe = { clientX, clientY, target, time: now };

  if (
    elapsed < HOVER_SAMPLE_MIN_INTERVAL_MS &&
    deltaX < HOVER_MOVE_MIN_DISTANCE_PX &&
    deltaY < HOVER_MOVE_MIN_DISTANCE_PX &&
    targetUnchanged
  ) {
    return true;
  }

  return false;
}

function handleMouseMove(event) {
  if (!siteEnabled) return;

  // Some SPA flows can miss `mouseup`, leaving the state stuck as pressed.
  if (isMouseDown && event.buttons === 0) {
    isMouseDown = false;
  }

  if (isMouseDown) {
    if (activePopup) scheduleHidePopup();
    return;
  }

  handleMouseMove.latestEvent = {
    clientX: event.clientX,
    clientY: event.clientY,
    target: event.target
  };

  if (handleMouseMove.rafPending) return;
  handleMouseMove.rafPending = true;

  requestAnimationFrame(() => {
    handleMouseMove.rafPending = false;
    const latestEvent = handleMouseMove.latestEvent;
    if (!latestEvent) return;

    const { clientX, clientY, target } = latestEvent;
    if (shouldSkipHoverProbe(clientX, clientY, target)) {
      return;
    }

    if (isPointerOverActivePopup(clientX, clientY)) {
      clearTimeout(popupHideTimer);
      return;
    }

    if (shouldIgnoreHoverTarget(target)) {
      if (activePopup) scheduleHidePopup();
      return;
    }

    const hoverState = resolveHoverMatch(clientX, clientY, target);
    if (shouldIgnoreHoverTarget(hoverState.hitTarget)) {
      if (activePopup) scheduleHidePopup();
      return;
    }

    const word = hoverState.match ? normalizePopupWord(hoverState.match.word) : '';
    if (word && shouldShowPopupForWord(word)) {
      showPopup({
        clientX,
        clientY,
        precomputedWord: word,
        precomputedRect: hoverState.match.rect
      });
      return;
    }

    if (!word && activePopup) {
      scheduleHidePopup();
    }
  });
}

// 添加页面卸载时的清理函数
function cleanupOnUnload() {
  siteEnabled = false;
  cleanup();

  // 移除存储变化监听事件
  removeStorageChangedListener();

  // 清除所有定时器
  if (popupHideTimer) {
    clearTimeout(popupHideTimer);
  }
  if (selectionTimeout) {
    clearTimeout(selectionTimeout);
  }

  // 隐藏弹窗和选择图标
  if (activePopup) {
    hidePopup();
  }
  if (selectionIcon) {
    hideSelectionIcon();
  }

  // 取消翻译请求
  if (currentTranslationController) {
    currentTranslationController.abort();
  }

  // 清除缓存
  translationCache.clear();
  // 移除文本选择相关的事件监听器
  removeTextSelectionListeners();
  removeGlobalHoverListeners();
  removeDomContentLoadedListener();
}

// 监听页面卸载事件
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupOnUnload);
}

if (!document.location.href.startsWith('chrome://') && !document.location.href.endsWith('xml')) {
  if (shouldRunInCurrentFrame()) {
    initialize();
  }
}

function getSidebarMarkup() {
  return `
    <div class="hlw-sidebar-header">
      <h1 class="hlw-sidebar-title">  Learn English</h1>
      <button class="hlw-close-icon" id="closeSidebar" aria-label="Close">&times;</button>
    </div>
    <div class="hlw-sidebar-content hlw-sidebar-main hlw-active">
      <div class="hlw-button-container">
        <button class="hlw-button hlw-vocabulary-button" id="vocabularyButton">Vocabulary</button>
        <button class="hlw-button hlw-learned-button" id="learnedButton">Known Words</button>
      </div>
      <hr class="hlw-divider">
      <div class="hlw-site-permission">
        <div class="hlw-permission-control">
          <span class="hlw-permission-text">Allow to run on this web site</span>
          <label class="hlw-site-highlight-switch">
            <input type="checkbox" id="sitePermission" checked>
            <span class="hlw-sidebar-slider hlw-round"></span>
          </label>
        </div>
      </div>
      <hr class="hlw-divider">
    </div>
    <div class="hlw-sidebar-content hlw-vocabulary">
      <div class="hlw-content-header">
        <button class="hlw-back-button" id="vocabularyBackButton">
          <span class="hlw-arrow-left"></span>
        </button>
        <h2>Vocabulary</h2>
      </div>
      <div class="hlw-highlight-toggle">
        <input type="checkbox" id="highlightToggle">
        <label for="highlightToggle">Highlight all words</label>
      </div>
      <div class="hlw-file-upload">
        <input type="file" id="fileInput" multiple>
        <label for="fileInput">Upload Vocabulary Files</label>
      </div>
      <ul id="fileList" class="hlw-file-list"></ul>
    </div>
    <div class="hlw-sidebar-content hlw-learned">
      <div class="hlw-content-header">
        <button class="hlw-back-button" id="learnedBackButton">
          <span class="hlw-arrow-left"></span>
        </button>
        <h2>Known Words</h2>
      </div>
      <ul id="wordList" class="hlw-word-list"></ul>
      <button class="hlw-clear-all-button" id="clearAllButton">Delete All</button>
    </div>
    <div class="hlw-sidebar-content hlw-file-content">
      <div class="hlw-content-header">
        <button class="hlw-back-button" id="fileContentBackButton">
          <span class="hlw-arrow-left"></span>
        </button>
        <h2 id="fileContentTitle"></h2>
      </div>
      <ul id="fileContent" class="hlw-file-list"></ul>
    </div>
  `;
}

function bindSidebarEvents() {
  document.getElementById('closeSidebar').addEventListener('click', toggleSidebar);
  document
    .getElementById('vocabularyButton')
    .addEventListener('click', () => showContent('hlw-vocabulary'));
  document
    .getElementById('learnedButton')
    .addEventListener('click', () => showContent('hlw-learned'));
  document
    .getElementById('vocabularyBackButton')
    .addEventListener('click', () => showContent('hlw-sidebar-main'));
  document
    .getElementById('learnedBackButton')
    .addEventListener('click', () => showContent('hlw-sidebar-main'));
  document.getElementById('clearAllButton').addEventListener('click', clearAllWords);
  document
    .getElementById('fileContentBackButton')
    .addEventListener('click', () => showContent('hlw-vocabulary'));

  document.getElementById('fileInput').addEventListener('change', handleFileUpload);

  const highlightToggle = document.getElementById('highlightToggle');
  highlightToggle.checked = true;
  highlightToggle.addEventListener('change', toggleHighlight);

  const sitePermission = document.getElementById('sitePermission');
  sitePermission.addEventListener('change', toggleSitePermission);
  getCurrentSitePermission().then((isEnabled) => {
    sitePermission.checked = isEnabled;
  });

  const fileList = document.getElementById('fileList');
  fileList.addEventListener('change', handleFileListChange);
  fileList.addEventListener('click', handleFileListClick);

  document.getElementById('fileContent').addEventListener('click', handleFileContentClick);
}

function createSidebar() {
  if (!isTopLevelFrame()) {
    return;
  }
  if (document.querySelector('.hlw-word-sidebar')) {
    return;
  }

  const sidebar = document.createElement('div');
  sidebar.className = 'hlw-root hlw-word-sidebar';
  sidebar.innerHTML = getSidebarMarkup();
  document.body.appendChild(sidebar);

  bindSidebarEvents();
  renderFileList();
}
function readVocabularyFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      resolve({
        name: file.name,
        lastModified: file.lastModified,
        content: e.target.result || ''
      });
    };

    reader.onerror = () => {
      reject(reader.error || new Error(`Failed to read ${file.name}`));
    };

    reader.readAsText(file);
  });
}

async function handleFileUpload(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (files.length === 0) return;

  const results = await Promise.allSettled(files.map(readVocabularyFile));
  const fileInfos = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  results
    .filter((result) => result.status === 'rejected')
    .forEach((result) => {
      console.error('Error reading uploaded vocabulary file:', result.reason);
    });

  if (fileInfos.length === 0) return;

  chrome.storage.local.get(['uploadedFiles'], function (result) {
    if (chrome.runtime.lastError) {
      console.error(`Error loading uploaded files: ${chrome.runtime.lastError.message}`);
      return;
    }

    const uploadedFiles = [...(result.uploadedFiles || []), ...fileInfos];
    chrome.storage.local.set({ uploadedFiles }, function () {
      renderFileList();
      updateHighlights();
    });
  });
}

function createFileListItem(fileInfo, index, selectedFiles) {
  const li = document.createElement('li');
  li.className = 'hlw-file-item';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `file-${index}`;
  checkbox.className = 'hlw-file-checkbox';
  checkbox.checked = selectedFiles.includes(index);

  const label = document.createElement('label');
  label.htmlFor = checkbox.id;
  label.className = 'hlw-file-name';
  label.textContent = fileInfo.name;

  const deleteButton = document.createElement('button');
  deleteButton.className = 'hlw-delete-file';
  deleteButton.dataset.index = String(index);
  deleteButton.textContent = 'x';

  li.appendChild(checkbox);
  li.appendChild(label);
  li.appendChild(deleteButton);
  return li;
}

function handleFileListChange(event) {
  if (event.target && event.target.classList.contains('hlw-file-checkbox')) {
    toggleFileSelection(event);
  }
}

function handleFileListClick(event) {
  const deleteButton = event.target.closest('.hlw-delete-file');
  if (deleteButton) {
    deleteFile({ target: deleteButton });
    return;
  }

  const fileLabel = event.target.closest('.hlw-file-name');
  if (fileLabel) {
    showFileContent({ preventDefault: () => event.preventDefault(), target: fileLabel });
  }
}

function renderFileList() {
  const fileList = document.getElementById('fileList');
  if (!fileList) return;
  fileList.innerHTML = '';

  chrome.storage.local.get(
    ['uploadedFiles', 'selectedFiles', 'highlightToggle'],
    function (result) {
      const uploadedFiles = result.uploadedFiles || [];
      const selectedFiles = result.selectedFiles || [];

      // 如果 highlightToggle 未定义（首次使用），则设置为 true
      if (result.highlightToggle === undefined) {
        chrome.storage.local.set({ highlightToggle: true }, () => {
          // 设置完默认值后更新高亮
          updateHighlights();
        });
        result.highlightToggle = true;
      }

      // 设置 highlight toggle 的状态
      const highlightToggleCheckbox = document.getElementById('highlightToggle');
      if (highlightToggleCheckbox) {
        highlightToggleCheckbox.checked = result.highlightToggle;
      }

      const fragment = document.createDocumentFragment();
      uploadedFiles.forEach((fileInfo, index) => {
        fragment.appendChild(createFileListItem(fileInfo, index, selectedFiles));
      });
      fileList.appendChild(fragment);
    }
  );
}

function deleteFile(event) {
  const index = Number.parseInt(event.target.getAttribute('data-index'), 10);
  if (!Number.isInteger(index)) return;

  chrome.storage.local.get(['uploadedFiles', 'selectedFiles'], function (result) {
    let uploadedFiles = result.uploadedFiles || [];
    let selectedFiles = result.selectedFiles || [];

    // Remove the file from uploadedFiles
    uploadedFiles.splice(index, 1);

    // Remove the file index from selectedFiles and adjust remaining indices
    selectedFiles = selectedFiles.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i));

    chrome.storage.local.set(
      { uploadedFiles: uploadedFiles, selectedFiles: selectedFiles },
      function () {
        renderFileList();
        updateHighlights();
      }
    );
  });
}

function toggleSidebar() {
  if (!isTopLevelFrame()) {
    return;
  }
  let sidebar = document.querySelector('.hlw-word-sidebar');

  // 如果侧边栏不存在，创建它
  if (!sidebar) {
    createSidebar();
    sidebar = document.querySelector('.hlw-word-sidebar');
  }

  sidebarOpen = !sidebarOpen;
  sidebar.classList.toggle('hlw-open', sidebarOpen);
}

// The background action asks the content script to toggle the page sidebar.
try {
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'toggleSidebar') {
      toggleSidebar();
    }
  });
} catch (error) {
  console.error('Error setting up message listener:', error);
}

function showContent(contentId) {
  const contents = document.querySelectorAll('.hlw-sidebar-content');
  contents.forEach((content) => content.classList.remove('hlw-active'));
  document.querySelector(`.hlw-sidebar-content.${contentId}`).classList.add('hlw-active');

  const sidebarHeader = document.querySelector('.hlw-sidebar-header');
  if (contentId === 'hlw-sidebar-main') {
    sidebarHeader.style.display = 'flex';
  } else {
    sidebarHeader.style.display = 'none';
  }

  if (contentId === 'hlw-learned') {
    renderWordList();
  }
}

function ensureWordListToolbar(wordList) {
  let buttonContainer = document.querySelector('.hlw-word-list-buttons');
  if (!buttonContainer) {
    buttonContainer = document.createElement('div');
    buttonContainer.className = 'hlw-word-list-buttons';
    wordList.parentNode.insertBefore(buttonContainer, wordList);
  }

  let importButton = buttonContainer.querySelector('.hlw-import-button');
  if (!importButton) {
    importButton = document.createElement('button');
    importButton.className = 'hlw-import-button';
    importButton.textContent = 'Import Word';
    importButton.addEventListener('click', importKnownWords);
    buttonContainer.appendChild(importButton);
  }

  let exportButton = buttonContainer.querySelector('.hlw-export-button');
  if (!exportButton) {
    exportButton = document.createElement('button');
    exportButton.className = 'hlw-export-button';
    exportButton.textContent = 'Export Word';
    exportButton.addEventListener('click', exportKnownWords);
    buttonContainer.appendChild(exportButton);
  }
}

function ensureWordSearchBox(wordList) {
  let searchBox = document.querySelector('.hlw-word-search');
  if (!searchBox) {
    searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = 'Search known words...';
    searchBox.className = 'hlw-word-search';
    searchBox.addEventListener('input', filterWords);
    wordList.parentNode.insertBefore(searchBox, wordList);
  }
  return searchBox;
}

function renderWordList() {
  const wordList = document.getElementById('wordList');
  const knownWordHeader = document.querySelector('.hlw-sidebar-content.hlw-learned h2');
  if (!wordList || !knownWordHeader) return;

  knownWordHeader.textContent = `Known Words (${knownWords.size})`;
  ensureWordListToolbar(wordList);
  const searchBox = ensureWordSearchBox(wordList);

  renderFilteredWords(searchBox.value);
}

function importKnownWords() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt';
  input.onchange = function (event) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const content = e.target.result;
        const words = content
          .split('\n')
          .map((word) => word.trim().toLowerCase())
          .filter((word) => word);

        let importedCount = 0;
        words.forEach((word) => {
          if (!knownWords.has(word)) {
            knownWords.add(word);
            importedCount += 1;
          }
        });

        if (importedCount > 0) {
          saveKnownWords();
          updateHighlights();
        }
        renderWordList();
      };
      reader.readAsText(file);
    }
  };
  input.click();
}

function renderFilteredWords(filter = '') {
  const wordList = document.getElementById('wordList');
  wordList.innerHTML = '';

  const fragment = document.createDocumentFragment();
  const filteredWords = Array.from(knownWords).filter((word) =>
    word.toLowerCase().includes(filter.toLowerCase())
  );

  filteredWords.forEach((word) => {
    appendWordToList(word, fragment);
  });
  wordList.appendChild(fragment);
}

function appendWordToList(word, wordList) {
  const li = document.createElement('li');
  li.className = 'hlw-learned-word-item';
  li.textContent = word;
  const deleteButton = document.createElement('button');
  deleteButton.className = 'hlw-delete-button';
  deleteButton.textContent = 'Delete';
  deleteButton.setAttribute('aria-label', `delete ${word}`);
  deleteButton.addEventListener('click', () => deleteWord(word));
  li.appendChild(deleteButton);
  wordList.appendChild(li);
}

function filterWords(event) {
  const filter = event.target.value;
  renderFilteredWords(filter);
}

function deleteWord(word) {
  const lowercaseWord = word.toLowerCase();

  // 从 knownWords 中删除单词
  knownWords.delete(lowercaseWord);

  // 立即保存更新后的 knownWords
  saveKnownWords();

  // 检查是否需要重新高亮该单词
  chrome.storage.local.get(
    ['highlightToggle', 'selectedFiles', 'uploadedFiles'],
    function (result) {
      const highlightToggle = result.highlightToggle;
      const selectedFiles = result.selectedFiles || [];
      const uploadedFiles = result.uploadedFiles || [];

      const selectedWords = buildSelectedWordsSet(selectedFiles, uploadedFiles);
      const wordInSelectedFiles = selectedWords.has(lowercaseWord);

      // 如果开启了全部高亮或单词在选中的文件中，则重新高亮该单词
      if (highlightToggle || wordInSelectedFiles) {
        reHighlightWord(lowercaseWord);
      } else {
        // 否则只移除高亮
        removeHighlightForWord(lowercaseWord);
      }

      // 更新侧边栏单词列表
      renderWordList();
    }
  );
}

function clearAllWords() {
  clearAllKnownWordsFromStorage(() => {
    renderWordList();
    updateHighlights();
  });
}

function clearAllKnownWordsFromStorage(callback) {
  beginKnownWordsSyncWrite();
  const completeClear = (success = true) => {
    finishKnownWordsSyncWrite();
    completeStorageOperation(callback, success);
  };

  chrome.storage.sync.get(null, (items) => {
    if (chrome.runtime.lastError) {
      console.error(`Error reading known words for clear: ${chrome.runtime.lastError.message}`);
      completeClear(false);
      return;
    }

    const keysToRemove = getKnownWordCleanupKeys(items);

    const finishClear = () => {
      knownWords.clear();
      chrome.storage.sync.set({ knownWordsUpdated: Date.now() }, () => {
        if (chrome.runtime.lastError) {
          console.error(
            `Error committing known words clear: ${chrome.runtime.lastError.message}`
          );
          completeClear(false);
          return;
        }
        completeClear(true);
      });
    };

    const removeBatch = (index) => {
      const batch = keysToRemove.slice(index, index + STORAGE_CLEAR_BATCH_SIZE);
      if (batch.length === 0) {
        finishClear();
        return;
      }

      chrome.storage.sync.remove(batch, () => {
        if (chrome.runtime.lastError) {
          console.error(`Error clearing known words: ${chrome.runtime.lastError.message}`);
          completeClear(false);
          return;
        }
        setTimeout(
          () => removeBatch(index + STORAGE_CLEAR_BATCH_SIZE),
          STORAGE_CLEAR_BATCH_DELAY_MS
        );
      });
    };

    removeBatch(0);
  });
}

function createFileContentItem(line, originalIndex, fileIndex) {
  const li = document.createElement('li');
  li.className = 'hlw-content-item';

  const lineText = document.createElement('span');
  lineText.textContent = line;

  const deleteButton = document.createElement('button');
  deleteButton.className = 'hlw-delete-line';
  deleteButton.dataset.index = String(originalIndex);
  deleteButton.dataset.fileIndex = String(fileIndex);
  deleteButton.textContent = 'Delete';

  li.appendChild(lineText);
  li.appendChild(deleteButton);
  return li;
}

function handleFileContentClick(event) {
  const deleteButton = event.target.closest('.hlw-delete-line');
  if (!deleteButton) return;
  deleteLine({ target: deleteButton }, deleteButton.dataset.fileIndex);
}

function showFileContent(event) {
  event.preventDefault();
  const fileIndex = event.target.getAttribute('for').split('-')[1];
  chrome.storage.local.get(['uploadedFiles'], function (result) {
    const uploadedFiles = result.uploadedFiles || [];
    const fileInfo = uploadedFiles[fileIndex];

    if (fileInfo && fileInfo.content) {
      const content = fileInfo.content
        .split('\n')
        .map((line, originalIndex) => ({ line, originalIndex }))
        .filter((item) => item.line.trim() !== '');

      // Update the existing file content view
      const fileContentView = document.querySelector('.hlw-sidebar-content.hlw-file-content');
      if (!fileContentView) return;
      fileContentView.querySelector('h2').textContent = fileInfo.name;
      const fileContentList = fileContentView.querySelector('#fileContent');
      fileContentList.innerHTML = '';
      const fragment = document.createDocumentFragment();
      content.forEach(({ line, originalIndex }) => {
        fragment.appendChild(createFileContentItem(line, originalIndex, fileIndex));
      });
      fileContentList.appendChild(fragment);

      showContent('hlw-file-content');
    } else {
      console.error('Error getting file: File content not found');
    }
  });
}

function deleteLine(event, fileIndex) {
  const lineIndex = Number.parseInt(event.target.getAttribute('data-index'), 10);
  if (!Number.isInteger(lineIndex)) return;
  chrome.storage.local.get(['uploadedFiles'], function (result) {
    let uploadedFiles = result.uploadedFiles || [];
    let fileInfo = uploadedFiles[fileIndex];
    if (fileInfo && fileInfo.content) {
      let content = fileInfo.content.split('\n');
      content.splice(lineIndex, 1);
      fileInfo.content = content.join('\n');
      uploadedFiles[fileIndex] = fileInfo;
      chrome.storage.local.set({ uploadedFiles: uploadedFiles }, function () {
        updateHighlights();
        showFileContent({
          preventDefault: () => {},
          target: { getAttribute: () => `file-${fileIndex}` }
        });
      });
    } else {
      console.error('Error: File content not found');
    }
  });
}

function exportKnownWords() {
  const words = Array.from(knownWords).sort().join('\n');
  const blob = new Blob([words], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const filename = `known_words_${new Date().toISOString().split('T')[0]}.txt`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toggleHighlight(event) {
  const isChecked = event.target.checked;

  // 保存 highlight toggle 状态
  chrome.storage.local.set({ highlightToggle: isChecked }, () => {
    if (isChecked) {
      // 如果开启了 highlight all，取消所有文件的选择
      const fileCheckboxes = document.querySelectorAll('.hlw-file-checkbox');
      fileCheckboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });

      // 清空已选文件列表
      chrome.storage.local.set({ selectedFiles: [] }, () => {
        updateHighlights();
      });
    } else {
      updateHighlights();
    }
  });
}

function toggleFileSelection(event) {
  const fileIndex = Number.parseInt(event.target.id.split('-')[1], 10);
  if (!Number.isInteger(fileIndex)) return;
  const isChecked = event.target.checked;

  chrome.storage.local.get(['selectedFiles'], function (result) {
    let selectedFiles = result.selectedFiles || [];
    const updates = {};

    // 如果选择了文件，需要关闭 highlight all
    if (isChecked) {
      // 取消 highlight all 选项
      const highlightToggle = document.getElementById('highlightToggle');
      if (highlightToggle && highlightToggle.checked) {
        highlightToggle.checked = false;
      }
      updates.highlightToggle = false;

      // 添加选中的文件
      if (!selectedFiles.includes(fileIndex)) {
        selectedFiles.push(fileIndex);
      }
    } else {
      // 移除取消选中的文件
      selectedFiles = selectedFiles.filter((index) => index !== fileIndex);
    }

    // 保存选中文件的状态并更新高亮
    chrome.storage.local.set({ ...updates, selectedFiles: selectedFiles }, () => {
      updateHighlights();
    });
  });
}

function isExtensionContextValid() {
  try {
    chrome.runtime.getURL('');
    return true;
  } catch (e) {
    return false;
  }
}

// 获取当前网站的权限状态
function getCurrentSitePermission() {
  return new Promise((resolve) => {
    const currentHost = window.location.hostname;
    chrome.storage.local.get(['disabledSites'], (result) => {
      const disabledSites = result.disabledSites || [];
      resolve(!disabledSites.includes(currentHost));
    });
  });
}

// 切换网站权限
function toggleSitePermission(event) {
  const isEnabled = event.target.checked;
  const currentHost = window.location.hostname;

  chrome.storage.local.get(['disabledSites'], (result) => {
    let disabledSites = result.disabledSites || [];

    if (isEnabled) {
      disabledSites = disabledSites.filter((site) => site !== currentHost);
      enableSiteFeatures();
      updateHighlights();
    } else {
      if (!disabledSites.includes(currentHost)) {
        disabledSites.push(currentHost);
      }
      disableSiteFeatures();
    }

    chrome.storage.local.set({ disabledSites }, () => {});
  });
}

function initializeTextSelection() {
  if (!siteEnabled) return;
  // 监听鼠标按下事件
  document.addEventListener('mousedown', handleMouseDown);
  // 监听鼠标抬起事件
  document.addEventListener('mouseup', handleMouseUp);
  // 监听选择变化事件
  document.addEventListener('selectionchange', handleSelectionChange);
  // 监听双击事件
  document.addEventListener('dblclick', handleDoubleClick);
  // 监听点击事件，用于隐藏选择图标
  document.addEventListener('click', handleDocumentClick);
}

function handleMouseDown(event) {
  isMouseDown = true;
  hideSelectionIcon();
}

function handleMouseUp(event) {
  isMouseDown = false;
  clearTimeout(selectionTimeout);
  selectionTimeout = setTimeout(() => {
    checkSelection();
  }, SELECTION_CHECK_DELAY_MS);
}

function handleSelectionChange() {
  if (isMouseDown) return; // 如果鼠标还在按下，不处理

  clearTimeout(selectionTimeout);
  selectionTimeout = setTimeout(() => {
    checkSelection();
  }, SELECTION_CHECK_DELAY_MS);
}

function handleDoubleClick(event) {
  // 双击事件会触发 selectionchange，所以这里不需要额外处理
  // 但我们可以确保选择检查被执行
  clearTimeout(selectionTimeout);
  selectionTimeout = setTimeout(() => {
    checkSelection();
  }, SELECTION_DOUBLE_CLICK_DELAY_MS);
}

function handleDocumentClick(event) {
  // 如果点击的不是选择图标，则隐藏图标
  if (selectionIcon && !selectionIcon.contains(event.target)) {
    hideSelectionIcon();
  }
}

function checkSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    hideSelectionIcon();
    return;
  }

  const range = selection.getRangeAt(0);
  const selectedText = selection.toString().trim();

  // 检查是否是有效的英文单词或短语
  if (selectedText && isValidEnglishText(selectedText)) {
    showSelectionIcon(range, selectedText);
  } else {
    hideSelectionIcon();
  }
}

function isValidEnglishText(text) {
  // 检查是否包含至少一个英文字母，且长度至少为1个字母
  const englishPattern = /[a-zA-Z]/;
  return englishPattern.test(text) && text.length >= 1;
}

function createSelectionIconImage() {
  const iconImg = document.createElement('img');
  const imageUrl = chrome.runtime.getURL('img/letter-e-16.png');
  iconImg.src = imageUrl;
  iconImg.style.cssText = `
    width: ${SELECTION_ICON_IMAGE_SIZE_PX}px;
    height: ${SELECTION_ICON_IMAGE_SIZE_PX}px;
    display: block;
  `;
  iconImg.alt = '翻译';

  iconImg.onerror = function () {
    console.error('翻译图标加载失败:', imageUrl);
    this.style.display = 'none';
    selectionIcon.innerHTML = '🔍';
    selectionIcon.style.fontSize = `${SELECTION_ICON_FALLBACK_FONT_SIZE_PX}px`;
  };
  return iconImg;
}

function applySelectionIconStyle(icon) {
  icon.title = '点击查看翻译';
  icon.style.cssText = `
    position: absolute;
    background: ${SELECTION_ICON_BACKGROUND};
    color: white;
    border-radius: 50%;
    width: ${SELECTION_ICON_SIZE_PX}px;
    height: ${SELECTION_ICON_SIZE_PX}px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: ${SELECTION_ICON_Z_INDEX};
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    transition: all 0.2s ease;
    pointer-events: auto;
    user-select: none;
  `;
}

function positionSelectionIcon(icon, range) {
  const rect = range.getBoundingClientRect();
  const iconLeft = rect.right + window.scrollX + SELECTION_ICON_OFFSET_X_PX;
  const iconTop = rect.top + window.scrollY + SELECTION_ICON_OFFSET_Y_PX;

  icon.style.left = `${iconLeft}px`;
  icon.style.top = `${iconTop}px`;
  return rect;
}

function bindSelectionIconEvents(icon, text, rect) {
  icon.addEventListener('click', (event) => {
    event.stopPropagation();
    event.preventDefault();
    handleSelectionIconClick(text, rect);
  });

  icon.addEventListener('mousedown', (event) => {
    event.stopPropagation();
  });

  icon.addEventListener('touchend', (event) => {
    event.stopPropagation();
    event.preventDefault();
    handleSelectionIconClick(text, rect);
  });

  icon.addEventListener('mouseenter', () => {
    icon.style.transform = 'scale(1.1)';
    icon.style.background = SELECTION_ICON_BACKGROUND;
  });

  icon.addEventListener('mouseleave', () => {
    icon.style.transform = 'scale(1)';
    icon.style.background = SELECTION_ICON_BACKGROUND;
  });
}

function showSelectionIcon(range, text) {
  hideSelectionIcon();

  selectionIcon = document.createElement('div');
  selectionIcon.className = 'selection-icon';
  selectionIcon.appendChild(createSelectionIconImage());
  applySelectionIconStyle(selectionIcon);

  const rect = positionSelectionIcon(selectionIcon, range);
  bindSelectionIconEvents(selectionIcon, text, rect);

  document.body.appendChild(selectionIcon);
}

function hideSelectionIcon() {
  if (selectionIcon && document.body.contains(selectionIcon)) {
    document.body.removeChild(selectionIcon);
    selectionIcon = null;
  }
}

function handleSelectionIconClick(text, rect) {
  // 隐藏选择图标
  hideSelectionIcon();

  // 清除当前选择
  window.getSelection()?.removeAllRanges();

  // 确保 rect 对象有正确的属性
  const adjustedRect = {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };

  // 创建一个模拟的事件来触发现有的 showPopup 函数
  const mockEvent = {
    isFromSelectionIcon: true,
    selectedText: text,
    rect: adjustedRect,
    preventDefault: () => {},
    stopPropagation: () => {}
  };

  // 调用现有的 showPopup 函数
  showPopup(mockEvent);
}
