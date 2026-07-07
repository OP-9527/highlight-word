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

function scheduleSelectionCheck(delay = SELECTION_CHECK_DELAY_MS) {
  clearTimeout(selectionTimeout);
  selectionTimeout = setTimeout(checkSelection, delay);
}

function handleMouseUp(event) {
  isMouseDown = false;
  scheduleSelectionCheck();
}

function handleSelectionChange() {
  if (isMouseDown) return; // 如果鼠标还在按下，不处理
  scheduleSelectionCheck();
}

function handleDoubleClick(event) {
  // 双击事件会触发 selectionchange，这里只是确保选择检查更快执行
  scheduleSelectionCheck(SELECTION_DOUBLE_CLICK_DELAY_MS);
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

  // 扩展自身 UI（侧边栏、弹窗）里的选区不显示翻译图标
  if (isExtensionUiNode(range.commonAncestorContainer)) {
    hideSelectionIcon();
    return;
  }

  const selectedText = selection.toString().trim();

  // 检查是否是有效的英文单词或短语
  if (selectedText && isValidEnglishText(selectedText)) {
    showSelectionIcon(range, selectedText);
  } else {
    hideSelectionIcon();
  }
}

function isValidEnglishText(text) {
  // 检查是否包含至少一个英文字母
  return /[a-zA-Z]/.test(text);
}

function createSelectionIconImage() {
  const iconImg = document.createElement('img');
  let imageUrl = '';
  try {
    if (!isExtensionContextValid()) {
      handleExtensionContextInvalidated();
    } else {
      imageUrl = chrome.runtime.getURL('img/letter-e-16.png');
    }
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      handleExtensionContextInvalidated();
    } else {
      throw error;
    }
  }
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
  });

  icon.addEventListener('mouseleave', () => {
    icon.style.transform = 'scale(1)';
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
  hideSelectionIcon();

  // 创建图标时记录的 rect 是视口坐标，页面滚动后会过期；优先用当前选区的位置
  const selection = window.getSelection();
  const liveRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const liveRect = liveRange ? liveRange.getBoundingClientRect() : null;
  const anchorRect = liveRect && (liveRect.width || liveRect.height) ? liveRect : rect;

  // 清除当前选择
  selection?.removeAllRanges();

  showPopup({ isFromSelectionIcon: true, selectedText: text, rect: anchorRect });
}
