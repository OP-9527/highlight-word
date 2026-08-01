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

// The sidebar lives in a shadow root, so page CSS cannot reach it; every lookup
// has to be scoped to that root instead of the document.
function sidebarById(id) {
  return sidebarRoot ? sidebarRoot.getElementById(id) : null;
}

function sidebarQuery(selector) {
  return sidebarRoot ? sidebarRoot.querySelector(selector) : null;
}

function sidebarQueryAll(selector) {
  return sidebarRoot ? sidebarRoot.querySelectorAll(selector) : [];
}

function bindSidebarEvents() {
  sidebarById('closeSidebar').addEventListener('click', toggleSidebar);
  sidebarById('vocabularyButton').addEventListener('click', () => showContent('hlw-vocabulary'));
  sidebarById('learnedButton').addEventListener('click', () => showContent('hlw-learned'));
  sidebarById('vocabularyBackButton').addEventListener('click', () => showContent('hlw-sidebar-main'));
  sidebarById('learnedBackButton').addEventListener('click', () => showContent('hlw-sidebar-main'));
  sidebarById('clearAllButton').addEventListener('click', clearAllWords);
  sidebarById('fileContentBackButton').addEventListener('click', () => showContent('hlw-vocabulary'));

  sidebarById('fileInput').addEventListener('change', handleFileUpload);

  const highlightToggle = sidebarById('highlightToggle');
  highlightToggle.checked = true;
  highlightToggle.addEventListener('change', toggleHighlight);

  const sitePermission = sidebarById('sitePermission');
  sitePermission.addEventListener('change', toggleSitePermission);
  getCurrentSitePermission().then((isEnabled) => {
    sitePermission.checked = isEnabled;
  });

  const fileList = sidebarById('fileList');
  fileList.addEventListener('change', handleFileListChange);
  fileList.addEventListener('click', handleFileListClick);

  sidebarById('fileContent').addEventListener('click', handleFileContentClick);
}

// Inline styles outrank page rules; a :host rule would lose to them, and the
// panel itself is fixed-positioned, so the host only needs to be a neutral anchor.
const SIDEBAR_HOST_STYLE = `all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: ${POPUP_Z_INDEX};`;

function getSidebarShadowOverrides() {
  return `
.hlw-word-sidebar {
  visibility: hidden !important;
}
.hlw-word-sidebar.hlw-styles-ready {
  visibility: visible !important;
}
  `.trim();
}

// styles.css arrives asynchronously; keep the sidebar hidden until it lands so a
// bare, unstyled panel never flashes over the page.
function injectSidebarStyles(shadow, style) {
  const overrides = getSidebarShadowOverrides();
  getPopupStylesText().then((text) => {
    if (!text || !shadow.isConnected) return;
    style.textContent = `${text}\n${overrides}`;
    const sidebar = shadow.querySelector('.hlw-word-sidebar');
    if (sidebar) sidebar.classList.add('hlw-styles-ready');
  });
}

function createSidebar() {
  if (!isTopLevelFrame()) {
    return;
  }
  if (sidebarRoot) {
    if (sidebarRoot.host.isConnected) return;
    sidebarRoot = null;
  }

  const host = document.createElement('div');
  host.className = 'hlw-word-sidebar-host';
  host.style.cssText = SIDEBAR_HOST_STYLE;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = getSidebarShadowOverrides();
  shadow.appendChild(style);

  const sidebar = document.createElement('div');
  sidebar.className = 'hlw-root hlw-word-sidebar';
  sidebar.innerHTML = getSidebarMarkup();
  shadow.appendChild(sidebar);

  document.body.appendChild(host);
  sidebarRoot = shadow;
  injectSidebarStyles(shadow, style);

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
    if (hasChromeStorageLastError('Error loading uploaded files')) return;

    const uploadedFiles = [...(result.uploadedFiles || []), ...fileInfos];
    // The storage listener refreshes highlights for local setting changes.
    chrome.storage.local.set({ uploadedFiles }, function () {
      if (hasChromeStorageLastError('Error saving uploaded files')) return;
      renderFileList();
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
    deleteFile(Number.parseInt(deleteButton.dataset.index, 10));
    return;
  }

  const fileLabel = event.target.closest('.hlw-file-name');
  if (fileLabel) {
    event.preventDefault();
    showFileContent(Number.parseInt(fileLabel.htmlFor.split('-')[1], 10));
  }
}

function renderFileList() {
  const fileList = sidebarById('fileList');
  if (!fileList) return;
  fileList.innerHTML = '';

  chrome.storage.local.get(
    ['uploadedFiles', 'selectedFiles', 'highlightToggle'],
    function (result) {
      if (hasChromeStorageLastError('Error loading uploaded files')) return;
      const uploadedFiles = result.uploadedFiles || [];
      const selectedFiles = result.selectedFiles || [];

      // 如果 highlightToggle 未定义（首次使用），则设置为 true；
      // 存储监听器会在写入后刷新高亮
      if (result.highlightToggle === undefined) {
        chrome.storage.local.set({ highlightToggle: true }, () => {
          hasChromeStorageLastError('Error saving default highlight toggle');
        });
        result.highlightToggle = true;
      }

      // 设置 highlight toggle 的状态
      const highlightToggleCheckbox = sidebarById('highlightToggle');
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

function deleteFile(index) {
  if (!Number.isInteger(index)) return;

  chrome.storage.local.get(['uploadedFiles', 'selectedFiles'], function (result) {
    if (hasChromeStorageLastError('Error loading uploaded files')) return;
    let uploadedFiles = result.uploadedFiles || [];
    let selectedFiles = result.selectedFiles || [];

    // Remove the file from uploadedFiles
    uploadedFiles.splice(index, 1);

    // Remove the file index from selectedFiles and adjust remaining indices
    selectedFiles = selectedFiles.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i));

    // The storage listener refreshes highlights for local setting changes.
    chrome.storage.local.set(
      { uploadedFiles: uploadedFiles, selectedFiles: selectedFiles },
      function () {
        if (hasChromeStorageLastError('Error deleting uploaded file')) return;
        renderFileList();
      }
    );
  });
}

function toggleSidebar() {
  if (!isTopLevelFrame()) {
    return;
  }
  // 如果侧边栏不存在，创建它
  createSidebar();
  const sidebar = sidebarQuery('.hlw-word-sidebar');
  if (!sidebar) return;

  sidebarOpen = !sidebarOpen;
  sidebar.classList.toggle('hlw-open', sidebarOpen);
  if (sidebarOpen) renderWordList();
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
  const contents = sidebarQueryAll('.hlw-sidebar-content');
  contents.forEach((content) => content.classList.remove('hlw-active'));
  sidebarQuery(`.hlw-sidebar-content.${contentId}`).classList.add('hlw-active');

  const sidebarHeader = sidebarQuery('.hlw-sidebar-header');
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
  let buttonContainer = sidebarQuery('.hlw-word-list-buttons');
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
  let searchBox = sidebarQuery('.hlw-word-search');
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
  // The list is invisible while the sidebar is closed; toggleSidebar re-renders
  // on open, so skipping here avoids rebuilding a large hidden DOM list.
  if (!sidebarOpen) return;
  const wordList = sidebarById('wordList');
  const knownWordHeader = sidebarQuery('.hlw-sidebar-content.hlw-learned h2');
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
    if (!file) return;
    readVocabularyFile(file)
      .then(({ content }) => {
        const words = parseVocabularyWords(content);

        const importedWords = [];
        words.forEach((word) => {
          if (!knownWords.has(word)) {
            knownWords.add(word);
            importedWords.push(word);
          }
        });

        if (importedWords.length > 0) {
          saveKnownWords((success) => {
            if (!success) {
              importedWords.forEach((word) => knownWords.delete(word));
              console.error('Imported known words were not saved because sync storage did not commit.');
              renderWordList();
              return;
            }
            updateHighlights();
          });
        }
        renderWordList();
      })
      .catch((error) => {
        console.error('Error reading imported known words file:', error);
      });
  };
  input.click();
}

function renderFilteredWords(filter = '') {
  const wordList = sidebarById('wordList');
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

// Rebuilding the list per keystroke is slow with large word sets, so debounce.
const debouncedRenderFilteredWords = debounce((filter) => renderFilteredWords(filter), WORD_SEARCH_DEBOUNCE_MS);

function filterWords(event) {
  debouncedRenderFilteredWords(event.target.value);
}

function deleteWord(word) {
  const lowercaseWord = word.toLowerCase();
  const hadWord = knownWords.has(lowercaseWord);

  // 从 knownWords 中删除单词
  knownWords.delete(lowercaseWord);

  // 立即保存更新后的 knownWords
  saveKnownWords((success) => {
    if (!success && hadWord) {
      knownWords.add(lowercaseWord);
      console.error('Known word was not deleted because sync storage did not commit.');
      renderWordList();
      return;
    }

    // 检查是否需要重新高亮该单词
    chrome.storage.local.get(
      ['highlightToggle', 'selectedFiles', 'uploadedFiles'],
      function (result) {
        if (hasChromeStorageLastError('Error loading highlight settings')) return;
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
  });
}

function clearAllWords() {
  const previousKnownWords = new Set(knownWords);
  knownWords.clear();

  saveKnownWords((success) => {
    if (!success) {
      knownWords = previousKnownWords;
      console.error('Known words were not cleared because sync storage did not commit.');
      renderWordList();
      return;
    }

    renderWordList();
    updateHighlights();
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
  deleteLine(
    Number.parseInt(deleteButton.dataset.index, 10),
    Number.parseInt(deleteButton.dataset.fileIndex, 10)
  );
}

function showFileContent(fileIndex) {
  if (!Number.isInteger(fileIndex)) return;
  chrome.storage.local.get(['uploadedFiles'], function (result) {
    if (hasChromeStorageLastError('Error loading uploaded files')) return;
    const uploadedFiles = result.uploadedFiles || [];
    const fileInfo = uploadedFiles[fileIndex];

    if (fileInfo && fileInfo.content) {
      const content = fileInfo.content
        .split('\n')
        .map((line, originalIndex) => ({ line, originalIndex }))
        .filter((item) => item.line.trim() !== '');

      // Update the existing file content view
      const fileContentView = sidebarQuery('.hlw-sidebar-content.hlw-file-content');
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

function deleteLine(lineIndex, fileIndex) {
  if (!Number.isInteger(lineIndex) || !Number.isInteger(fileIndex)) return;
  chrome.storage.local.get(['uploadedFiles'], function (result) {
    if (hasChromeStorageLastError('Error loading uploaded files')) return;
    let uploadedFiles = result.uploadedFiles || [];
    let fileInfo = uploadedFiles[fileIndex];
    if (fileInfo && fileInfo.content) {
      let content = fileInfo.content.split('\n');
      content.splice(lineIndex, 1);
      fileInfo.content = content.join('\n');
      uploadedFiles[fileIndex] = fileInfo;
      // The storage listener refreshes highlights for local setting changes.
      chrome.storage.local.set({ uploadedFiles: uploadedFiles }, function () {
        if (hasChromeStorageLastError('Error deleting vocabulary file line')) return;
        showFileContent(fileIndex);
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

  // 一次写入两个键，存储监听器只触发一次全页高亮刷新
  const updates = { highlightToggle: isChecked };
  if (isChecked) {
    // 如果开启了 highlight all，清空已选文件列表
    updates.selectedFiles = [];
  }

  chrome.storage.local.set(updates, () => {
    if (hasChromeStorageLastError('Error saving highlight toggle')) {
      event.target.checked = !isChecked;
      return;
    }
    if (isChecked) {
      // 取消所有文件的选择
      sidebarQueryAll('.hlw-file-checkbox').forEach((checkbox) => {
        checkbox.checked = false;
      });
    }
  });
}

function toggleFileSelection(event) {
  const fileIndex = Number.parseInt(event.target.id.split('-')[1], 10);
  if (!Number.isInteger(fileIndex)) return;
  const isChecked = event.target.checked;

  chrome.storage.local.get(['selectedFiles'], function (result) {
    if (hasChromeStorageLastError('Error loading selected vocabulary files')) {
      renderFileList();
      return;
    }
    let selectedFiles = result.selectedFiles || [];
    const updates = {};

    // 如果选择了文件，需要关闭 highlight all
    if (isChecked) {
      // 取消 highlight all 选项
      const highlightToggle = sidebarById('highlightToggle');
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

    // 保存选中文件的状态；存储监听器负责刷新高亮
    chrome.storage.local.set({ ...updates, selectedFiles: selectedFiles }, () => {
      if (hasChromeStorageLastError('Error saving selected vocabulary files')) {
        renderFileList();
      }
    });
  });
}

function isExtensionContextValid() {
  if (extensionContextInvalidated) return false;
  try {
    chrome.runtime.getURL('');
    return true;
  } catch (e) {
    return false;
  }
}

function isExtensionContextInvalidatedError(error) {
  return !!(
    error &&
    typeof error.message === 'string' &&
    error.message.toLowerCase().includes('extension context invalidated')
  );
}

// Highlighting itself needs no chrome APIs, so orphaned content scripts keep
// it alive (observer included) and only shut down translation/storage features.
function handleExtensionContextInvalidated() {
  if (extensionContextInvalidated) return;
  extensionContextInvalidated = true;
  removeTextSelectionListeners();
  removeGlobalHoverListeners();
  removeDomContentLoadedListener();
  if (activePopup) {
    hidePopup();
  }
  if (selectionIcon) {
    hideSelectionIcon();
  }
  if (currentTranslationController) {
    currentTranslationController.abort();
    currentTranslationController = null;
  }
}

// 获取当前网站的权限状态
function getCurrentSitePermission() {
  return new Promise((resolve) => {
    const currentHost = window.location.hostname;
    chrome.storage.local.get(['disabledSites'], (result) => {
      if (hasChromeStorageLastError('Error loading site permission')) {
        resolve(true);
        return;
      }
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
    if (hasChromeStorageLastError('Error loading site permission')) {
      event.target.checked = !isEnabled;
      return;
    }
    let disabledSites = result.disabledSites || [];

    if (isEnabled) {
      disabledSites = disabledSites.filter((site) => site !== currentHost);
    } else {
      if (!disabledSites.includes(currentHost)) {
        disabledSites.push(currentHost);
      }
    }

    chrome.storage.local.set({ disabledSites }, () => {
      if (hasChromeStorageLastError('Error saving site permission')) {
        event.target.checked = !isEnabled;
        return;
      }
      if (isEnabled) {
        enableSiteFeatures();
      } else {
        disableSiteFeatures();
      }
    });
  });
}
