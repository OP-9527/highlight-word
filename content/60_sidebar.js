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
      if (hasChromeStorageLastError('Error saving uploaded files')) return;
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
      if (hasChromeStorageLastError('Error loading uploaded files')) return;
      const uploadedFiles = result.uploadedFiles || [];
      const selectedFiles = result.selectedFiles || [];

      // 如果 highlightToggle 未定义（首次使用），则设置为 true
      if (result.highlightToggle === undefined) {
        chrome.storage.local.set({ highlightToggle: true }, () => {
          if (hasChromeStorageLastError('Error saving default highlight toggle')) return;
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
    if (hasChromeStorageLastError('Error loading uploaded files')) return;
    let uploadedFiles = result.uploadedFiles || [];
    let selectedFiles = result.selectedFiles || [];

    // Remove the file from uploadedFiles
    uploadedFiles.splice(index, 1);

    // Remove the file index from selectedFiles and adjust remaining indices
    selectedFiles = selectedFiles.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i));

    chrome.storage.local.set(
      { uploadedFiles: uploadedFiles, selectedFiles: selectedFiles },
      function () {
        if (hasChromeStorageLastError('Error deleting uploaded file')) return;
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
  deleteLine({ target: deleteButton }, deleteButton.dataset.fileIndex);
}

function showFileContent(event) {
  event.preventDefault();
  const fileIndex = event.target.getAttribute('for').split('-')[1];
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
    if (hasChromeStorageLastError('Error loading uploaded files')) return;
    let uploadedFiles = result.uploadedFiles || [];
    let fileInfo = uploadedFiles[fileIndex];
    if (fileInfo && fileInfo.content) {
      let content = fileInfo.content.split('\n');
      content.splice(lineIndex, 1);
      fileInfo.content = content.join('\n');
      uploadedFiles[fileIndex] = fileInfo;
      chrome.storage.local.set({ uploadedFiles: uploadedFiles }, function () {
        if (hasChromeStorageLastError('Error deleting vocabulary file line')) return;
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
    if (hasChromeStorageLastError('Error saving highlight toggle')) {
      event.target.checked = !isChecked;
      return;
    }
    if (isChecked) {
      // 如果开启了 highlight all，取消所有文件的选择
      const fileCheckboxes = document.querySelectorAll('.hlw-file-checkbox');
      fileCheckboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });

      // 清空已选文件列表
      chrome.storage.local.set({ selectedFiles: [] }, () => {
        if (hasChromeStorageLastError('Error clearing selected vocabulary files')) {
          renderFileList();
          return;
        }
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
    if (hasChromeStorageLastError('Error loading selected vocabulary files')) {
      renderFileList();
      return;
    }
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
      if (hasChromeStorageLastError('Error saving selected vocabulary files')) {
        renderFileList();
        return;
      }
      updateHighlights();
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
