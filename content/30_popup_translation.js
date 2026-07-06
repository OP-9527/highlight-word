
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
        const translationData = extractPopupTranslationData(word, response);
        cacheTranslation(cacheKey, translationData);
        resolve(translationData);
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

  const match = findHighlightedWordMatchAtPoint(event.clientX, event.clientY);

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
    const translationData = await getTranslation(payload.word, session.signal);
    if (isPopupSessionStale(session)) return;

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

  // 获取词形变化（依次为复数、现在分词、过去分词）。
  // 注意不能用 :nth-of-type——它按同类型兄弟元素计数，而词形值和标签交错排列。
  const wordForms = doc.querySelectorAll('.hd_div1 .hd_if .p1-5');
  const getWordFormText = (index) =>
    wordForms[index] ? wordForms[index].textContent.trim() : null;
  const pluralText = getWordFormText(0);
  const presentParticipleText = getWordFormText(1);
  const pastTenseText = getWordFormText(2);

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
  // Cheap reject on raw rects before any style or hit-test work; the inset
  // test below only ever accepts points inside a raw rect.
  const rects = range.getClientRects();
  const boundingRect = rects && rects.length ? null : range.getBoundingClientRect();
  const rectContainsPoint = (rect) =>
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  let insideAnyRect = false;
  if (rects && rects.length) {
    for (const rect of rects) {
      if (rectContainsPoint(rect)) {
        insideAnyRect = true;
        break;
      }
    }
  } else if (boundingRect) {
    insideAnyRect = rectContainsPoint(boundingRect);
  }
  if (!insideAnyRect) return false;
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
  const parentStyle =
    parentElement && window.getComputedStyle ? window.getComputedStyle(parentElement) : null;
  const skipContainCheck = !!(parentStyle && parentStyle.pointerEvents === 'none');
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
  if (parentStyle) {
    const parsedFontSize = parseFloat(parentStyle.fontSize);
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
  if (rects && rects.length) {
    for (const rect of rects) {
      if (isInsideRect(rect)) {
        return true;
      }
    }
    return false;
  }
  return isInsideRect(boundingRect);
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
  if (startContainer && entries && entries.size > 0) {
    for (const [highlightRange, word] of entries) {
      if (!highlightRange || highlightRange.startContainer !== startContainer) continue;
      if (shouldSkipRichEditorContext(highlightRange.startContainer)) continue;
      if (hasCharacterOffset) {
        if (startOffset < highlightRange.startOffset || startOffset > highlightRange.endOffset)
          continue;
      }
      if (!hasPoint || isPointInRange(highlightRange, x, y, range, pointElement)) {
        return { word, rect: highlightRange.getBoundingClientRect() };
      }
    }
  }

  // Non-point fallback: keep support for callers that pass only a range.
  if (!hasPoint && entries && entries.size > 0) {
    for (const [highlightRange, word] of entries) {
      if (!highlightRange || shouldSkipRichEditorContext(highlightRange.startContainer)) continue;
      if (
        range.compareBoundaryPoints(Range.START_TO_START, highlightRange) >= 0 &&
        range.compareBoundaryPoints(Range.END_TO_END, highlightRange) <= 0
      ) {
        return { word, rect: highlightRange.getBoundingClientRect() };
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
      if (!entries || entries.size === 0) return;

      for (const [highlightRange, word] of entries) {
        if (!highlightRange || shouldSkipRichEditorContext(highlightRange.startContainer)) continue;
        if (isPointInRange(highlightRange, x, y, null, pointElement)) {
          match = { word, rect: highlightRange.getBoundingClientRect() };
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
  if (entries) {
    for (const [highlightRange, word] of entries) {
      if (!highlightRange || shouldSkipRichEditorContext(highlightRange.startContainer)) continue;
      if (isPointInRange(highlightRange, x, y, pointRange, pointContext.element)) {
        return { word, rect: highlightRange.getBoundingClientRect() };
      }
    }
  }
  return findWordFromElementCandidates(pointElements, x, y);
}

// Shared caret-first hit-test pipeline for the hover and popup paths.
function findHighlightedWordMatchAtPoint(x, y, pointContext = null, pointElements = null) {
  const context = pointContext || getDeepestPointContext(x, y);
  const range = getCaretRangeAtPoint(x, y, context.root);
  let match = null;
  if (range) {
    match = findWordAtRange(range, x, y, context.element);
  }
  if (!match) {
    match = findWordAtPoint(x, y, context, pointElements);
  }
  return match;
}

function getPopupRoot(popup) {
  if (!popup) return null;
  return popup.shadowRoot || popup;
}

function getPopupStylesText() {
  if (popupStylesText) return Promise.resolve(popupStylesText);
  if (!popupStylesPromise) {
    let stylesUrl = '';
    try {
      if (!isExtensionContextValid()) {
        handleExtensionContextInvalidated();
        return Promise.resolve('');
      }
      stylesUrl = chrome.runtime.getURL('styles.css');
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        handleExtensionContextInvalidated();
        return Promise.resolve('');
      }
      throw error;
    }

    popupStylesPromise = fetch(stylesUrl)
      .then((response) => response.text())
      .then((text) => {
        popupStylesText = text;
        return text;
      })
      .catch((error) => {
        if (isExtensionContextInvalidatedError(error)) {
          handleExtensionContextInvalidated();
          return '';
        }
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
      <button class="hlw-word-known" ${hideKnownButton ? 'style="display: none;"' : ''}>&#x2705;</button>
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
