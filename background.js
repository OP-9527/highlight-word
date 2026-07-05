// Handles toolbar icon clicks and toggles the sidebar in the active tab.
const TRANSLATION_REQUEST_TIMEOUT_MS = 2000;
const BLOCKED_ACTION_PROTOCOLS = new Set([
  'chrome:',
  'chrome-extension:',
  'edge:',
  'about:',
  'view-source:'
]);

function canToggleSidebarInTab(tab) {
  if (!tab || typeof tab.id !== 'number' || !tab.url) return false;

  try {
    const url = new URL(tab.url);
    if (BLOCKED_ACTION_PROTOCOLS.has(url.protocol)) return false;
    if (url.pathname.toLowerCase().endsWith('.xml')) return false;
    return true;
  } catch (error) {
    return false;
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (!canToggleSidebarInTab(tab)) return;

  chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' }, () => {
    if (chrome.runtime.lastError) {
      // The content script may not be available on restricted or not-yet-loaded pages.
    }
  });
});

const TRANSLATION_SOURCES = {
  google: {
    url: (word) =>
      'https://translate.googleapis.com/translate_a/single' +
      `?client=gtx&sl=en&tl=zh&dt=t&q=${encodeURIComponent(word)}`,
    processResponse: async (response) => {
      const data = await response.json();
      const translation = Array.isArray(data?.[0])
        ? data[0]
            .map((segment) => segment?.[0])
            .filter((segmentText) => typeof segmentText === 'string')
            .join('')
            .trim()
        : '';
      return translation ? { translation, source: 'google' } : null;
    }
  },
  cambridge: {
    url: (word) =>
      'https://dictionary.cambridge.org/us/dictionary/english-chinese-simplified/' +
      encodeURIComponent(word),
    processResponse: async (response) => {
      const cambridgeHtml = await response.text();
      return { html: cambridgeHtml, source: 'cambridge' };
    }
  },
  bingdict: {
    url: (word) => `https://www.bing.com/dict/search?mkt=zh-cn&q=${encodeURIComponent(word)}`,
    processResponse: async (response) => {
      const bingdictHtml = await response.text();
      const hasNoResult =
        bingdictHtml.includes('No results found') || bingdictHtml.includes('没有找到');
      return { html: hasNoResult ? null : trimBingDictHtml(bingdictHtml), source: 'bingdict' };
    }
  }
};

// The content script only reads the .qdef block (pronunciation, definitions,
// word forms), so avoid serializing the whole page through sendMessage.
const BING_HTML_SLICE_MAX_CHARS = 60000;

function trimBingDictHtml(html) {
  const markerIndex = html.indexOf('class="qdef"');
  if (markerIndex === -1) return html;
  const start = html.lastIndexOf('<', markerIndex);
  const sliceStart = start === -1 ? markerIndex : start;
  return html.slice(sliceStart, sliceStart + BING_HTML_SLICE_MAX_CHARS);
}

async function fetchTranslation(source, word) {
  const config = TRANSLATION_SOURCES[source];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TRANSLATION_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(config.url(word), { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      console.warn(`${source} translation request failed with status ${response.status}`);
      return null;
    }
    return await config.processResponse(response);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error && error.name === 'AbortError') {
      console.warn(`${source} translation request timed out`);
      return null;
    }
    console.error(`Error fetching ${source} translation:`, error);
    return null;
  }
}

// Cross-tab cache so repeated lookups skip the network and the large payloads.
const TRANSLATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TRANSLATION_CACHE_MAX_ENTRIES = 200;
const translationResultsCache = new Map();

function getCachedTranslationResults(word) {
  const entry = translationResultsCache.get(word);
  if (!entry) return null;
  if (Date.now() - entry.timestamp >= TRANSLATION_CACHE_TTL_MS) {
    translationResultsCache.delete(word);
    return null;
  }
  // Re-insert to keep Map iteration order as LRU order.
  translationResultsCache.delete(word);
  translationResultsCache.set(word, entry);
  return entry.results;
}

function cacheTranslationResults(word, results) {
  translationResultsCache.set(word, { results, timestamp: Date.now() });
  while (translationResultsCache.size > TRANSLATION_CACHE_MAX_ENTRIES) {
    translationResultsCache.delete(translationResultsCache.keys().next().value);
  }
}

async function getAllTranslations(word) {
  const cacheKey = word.toLowerCase();
  const cachedResults = getCachedTranslationResults(cacheKey);
  if (cachedResults) return cachedResults;

  const translations = await Promise.all(
    Object.keys(TRANSLATION_SOURCES).map((source) => fetchTranslation(source, word))
  );

  const results = Object.keys(TRANSLATION_SOURCES).reduce((acc, source, index) => {
    acc[`${source}Result`] = translations[index];
    return acc;
  }, {});

  // Only cache useful responses; failures should retry on the next lookup.
  if (translations.some((translation) => translation !== null)) {
    cacheTranslationResults(cacheKey, results);
  }
  return results;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    getAllTranslations(request.word)
      .then((results) => {
        sendResponse(results);
      })
      .catch((error) => {
        console.error('Translation error:', error);
        sendResponse({ error: 'Translation error' });
      });

    return true;
  }

  return false;
});
