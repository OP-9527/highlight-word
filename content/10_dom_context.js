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
    if (!isExtensionContextValid()) {
      handleExtensionContextInvalidated();
      return;
    }
    try {
      chrome.storage.local.get(['highlightToggle', 'selectedFiles'], function (result) {
        if (hasChromeStorageLastError('Error loading highlight settings')) return;
        if (result.highlightToggle || (result.selectedFiles && result.selectedFiles.length > 0)) {
          requestAnimationFrame(() => {
            updateHighlights();
          });
        }
      });
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        handleExtensionContextInvalidated();
        return;
      }
      throw error;
    }
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

  // One traversal both attaches shadow observers and highlights text.
  collectRootAndOpenShadowRoots(root).forEach((processRoot) => {
    if (isInHighChurnTextContext(processRoot)) return;
    if (
      options.observeShadowRoots &&
      processRoot.nodeType === Node.DOCUMENT_FRAGMENT_NODE &&
      processRoot.host
    ) {
      ensureShadowRootObserver(processRoot);
    }
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

function pruneDisconnectedShadowRootObservers() {
  if (shadowRootObservers.size === 0) return;
  shadowRootObservers.forEach((shadowObserver, shadowRoot) => {
    if (!shadowRoot.host || !shadowRoot.host.isConnected) {
      shadowObserver.disconnect();
      shadowRootObservers.delete(shadowRoot);
    }
  });
}

function isNodeWithinAnyClass(node, classNames) {
  let current = node;
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE && current.classList) {
      for (const className of classNames) {
        if (current.classList.contains(className)) return true;
      }
    }
    if (current === document.body || current === document.documentElement) break;
    current = getComposedParent(current);
  }
  return false;
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

function hasClosestSelector(node, selector) {
  const element = getContextElement(node);
  if (!element) return false;
  return !!closestSafely(element, selector);
}

function isEditorPlaceholderContext(node) {
  return hasClosestSelector(node, TEXT_CONTEXT_SELECTORS.editorPlaceholder);
}

function isReadableTextContext(node) {
  return (
    hasClosestSelector(node, TEXT_CONTEXT_SELECTORS.staticText) ||
    hasClosestSelector(node, TEXT_CONTEXT_SELECTORS.mainContent) ||
    hasClosestSelector(node, TEXT_CONTEXT_SELECTORS.mediaText) ||
    isEditorPlaceholderContext(node)
  );
}

function isInHighChurnTextContext(node) {
  const element = getContextElement(node);
  if (!element) return false;

  if (closestSafely(element, TEXT_CONTEXT_SELECTORS.mediaShell)) {
    return !hasClosestSelector(element, TEXT_CONTEXT_SELECTORS.mediaText);
  }
  if (closestSafely(element, TEXT_CONTEXT_SELECTORS.liveRegion)) {
    return !isReadableTextContext(element);
  }
  if (closestSafely(element, TEXT_CONTEXT_SELECTORS.transientUi)) {
    return !hasClosestSelector(element, TEXT_CONTEXT_SELECTORS.mediaText);
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
