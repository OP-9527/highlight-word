# English Word Highlighter and Learning Assistant Chrome Extension

This Chrome extension automatically highlights English words on web pages and provides a learning interface to help users expand their vocabulary. It supports both automatic highlighting of all English words and selective highlighting based on custom word lists.

主要用于网页上的单词高亮、翻译以及管理用户已知和未知的单词列表

## Features

- Highlights unfamiliar English words on web pages with two modes:
  - Auto mode: Highlights all English words except known words
  - List mode: Only highlights words from selected custom word lists
- Provides a popup with comprehensive word information:
  - Phonetic pronunciation
  - Dictionary definitions with parts of speech
  - Google translation
  - One-click audio pronunciation
- Allows users to mark words as "known" to customize their learning experience
- Includes a sidebar with vocabulary management features:
  - View and manage known words list
  - Import/export word lists
  - Upload and manage custom word lists
  - Search functionality for known words
- **Cross-device synchronization**: Known words automatically sync across all your devices using Chrome Sync
- Syncs known words across multiple tabs and browser sessions
- Supports file upload for custom word lists in txt format

## Installation

1. Clone or download this repository
2. Open Google Chrome and go to `chrome://extensions`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the folder containing the extension files

## Usage

1. Once installed, the extension will automatically highlight unfamiliar English words on web pages you visit
2. Click on a highlighted word to see its translation and pronunciation
3. Use the "✔" button in the popup to mark a word as known
4. Click the extension icon in the toolbar to open the sidebar for more features:
   - View and manage your list of known words
   - Upload custom word lists
   - Toggle between auto-highlight and list-based highlight modes
   - Import/export your known words
   - Search through your known words

### Cross-Device Synchronization

To enable synchronization of your known words across multiple computers:

1. **Sign in to Chrome**: Make sure you're signed in to the same Google account on all devices
2. **Enable Sync**: Go to Chrome Settings → Sync and Google services → Manage sync
3. **Enable Extensions**: Ensure "Extensions" sync is turned on
4. **Install the extension**: Install the extension on all your devices
5. Your known words will automatically sync across all devices within a few minutes

**Note**: The extension will automatically migrate your existing known words from local storage to sync storage on first use of the updated version.

## Technical Details

The extension is built using the following technologies:

- **Content Script**: Uses content.js to process web page content and handle user interactions
- **CSS Highlight API**: Implements modern web highlighting capabilities for better performance
- **Chrome Storage API**: Manages persistent storage of known words and settings
- **Translation APIs**: 
  - Integrates with dict.cn for comprehensive English definitions
  - Uses Google Translate API for quick translations
- **Web Speech API**: Provides word pronunciation functionality

### Architecture

- **Background Script**: Handles API calls and extension icon clicks
- **Content Script**: Manages DOM manipulation and word highlighting
- **Sidebar Interface**: Provides word management and settings controls
- **Popup Component**: Displays word information and translation results

### Storage

- **Known Words**: Stored in `chrome.storage.sync` for cross-device synchronization 
  - Limit: ~100KB total, 8KB per item
  - Capacity: ~5,000-8,000 words (depends on word length)
  - Chunk size: 200 words per chunk to stay within limits
- **Custom Word Lists**: Stored in `chrome.storage.local` (device-specific, not synced)
- **Settings**: Stored in `chrome.storage.local` (device-specific, not synced)

**Note**: If you encounter quota errors with a large word list, consider exporting and clearing some words, or use import/export for manual sync.

## Limitations

- The extension may not work perfectly on all websites, especially those with complex dynamic content
- It may slightly impact page load times on text-heavy pages
- The highlighting is based on a simple regex pattern and may occasionally highlight non-English words that match the pattern
- Translation features rely on external APIs and may be subject to rate limiting or service disruptions
- CSS Highlight API may not be supported in all browsers

## Contributing

Feel free to submit issues or pull requests if you have any suggestions for improvements or bug fixes. Areas that could use improvement include:

- Performance optimization for large pages
- Better word detection algorithms
- Additional translation service providers
- Enhanced offline capabilities
- Mobile browser support

## License

This project is open source and available under the MIT License.
