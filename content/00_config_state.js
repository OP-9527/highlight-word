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
let knownWordsSaveInProgress = false;
let knownWordsSaveQueued = false;
let knownWordsSaveCallbacks = [];
let selectionIcon = null;
let selectionTimeout = null;
let isMouseDown = false;
let popupStylesText = null;
let popupStylesPromise = null;
let currentPopupRequestId = 0;
const selectorList = (selectors) => selectors.join(',');
const TEXT_CONTEXT_SELECTORS = {
  mediaShell: selectorList([
    'video',
    'audio',
    'canvas',
    '.html5-video-player',
    '[class*="video-player"]',
    '[id*="video-player"]',
    '[id*="movie_player"]'
  ]),
  liveRegion: selectorList(['[aria-live="polite"]', '[aria-live="assertive"]']),
  transientUi: selectorList([
    '[class*="tooltip"]',
    '[role="tooltip"]',
    '[class*="miniplayer"]',
    '[class*="mini-player"]',
    '#chatframe'
  ]),
  staticText: selectorList([
    'a[href]',
    'button',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="tab"]',
    'nav'
  ]),
  mainContent: selectorList([
    'main',
    '[role="main"]',
    'article',
    '[role="article"]',
    '[role="feed"]',
    '[role="list"]',
    '[role="listitem"]',
    '[class*="feed"]',
    '[class*="profile"]',
    '[class*="search-results"]',
    '[class*="message"]',
    '[class*="notification"]',
    '[class*="comment"]',
    '[class*="job-card"]',
    '[class*="jobs-"]',
    '[data-test-id*="job"]'
  ]),
  mediaText: selectorList([
    '[class*="caption"]',
    '[id*="caption"]',
    '[class*="subtitle"]',
    '[id*="subtitle"]',
    '[class*="transcript"]',
    '[id*="transcript"]',
    '[role="log"]',
    '[role="status"]',
    '[class*="message"]',
    '[class*="chat"]',
    '[id*="chat"]',
    '#message',
    '#author-name'
  ]),
  editorPlaceholder: selectorList([
    '.public-DraftEditorPlaceholder-root',
    '.public-DraftEditorPlaceholder-inner'
  ])
};
const RICH_EDITOR_CONTEXT = {
  rootSelector: selectorList([
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
  ]),
  hints: [
    'prosemirror',
    'drafteditor',
    'rich-text',
    'richeditor',
    'lexical',
    'slate-editor',
    'notion-',
    'kix-',
    'ql-editor',
    'codemirror',
    'monaco-editor',
    'ace_editor',
    'note-editor',
    'editor-content',
    'qa-common_editor_iframe'
  ],
  iframeHints: ['editor', 'evernote', 'docs', 'kix', 'compose']
};
let sidebarOpen = false;
const ENGLISH_WORD_PATTERN = /\b[a-zA-Z]{2,}\b/g;
let unknownHL;
let observer = null;
let shadowRootObservers = new Map();
let siteEnabled = false;
let domContentLoadedHandler = null;
let globalHoverListenersAdded = false;
let storageChangedListener = null;
let extensionContextInvalidated = false;
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
