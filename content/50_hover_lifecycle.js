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

  return {
    hitTarget: pointElements[0] || pointContext.element || fallbackTarget,
    match: findHighlightedWordMatchAtPoint(clientX, clientY, pointContext, pointElements)
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
    // Release the target reference so removed DOM nodes can be collected.
    handleMouseMove.latestEvent = null;
    if (!latestEvent) return;

    // Nothing highlighted and no popup showing: skip the hit-test pipeline.
    if (highlightRangeCount === 0 && !activePopup) return;

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

    if (word && activePopup) {
      // Hovering the word the active popup belongs to: keep the popup alive.
      clearTimeout(popupHideTimer);
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

  // 移除文本选择相关的事件监听器
  removeTextSelectionListeners();
  removeGlobalHoverListeners();
  removeDomContentLoadedListener();
}
