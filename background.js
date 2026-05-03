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
      const translation = data?.[0]?.[0]?.[0];
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
      return { html: hasNoResult ? null : bingdictHtml, source: 'bingdict' };
    }
  }
};

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

async function getAllTranslations(word) {
  const translations = await Promise.all(
    Object.keys(TRANSLATION_SOURCES).map((source) => fetchTranslation(source, word))
  );

  return Object.keys(TRANSLATION_SOURCES).reduce((results, source, index) => {
    results[`${source}Result`] = translations[index];
    return results;
  }, {});
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
