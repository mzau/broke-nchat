<div align="center">

<h1>
  <img src="webui/assets/broke-beaver-logo.png" alt="BROKE Beaver" height="33" style="vertical-align: baseline; margin-bottom: -2px;">nChat
</h1>

<strong>Version 0.1.5-beta</strong>

<em>The new way to chat with your LLMs</em>

A simple, universal web chat client for OpenAI-compatible APIs.

</div>

## Overview

**nChat** is a standalone web interface that works with any OpenAI-compatible API server. It automatically detects server capabilities and adapts its feature set accordingly - no build tools, no dependencies, just open and use.

**Reference Implementation**: nChat serves as the reference client implementation for the [mlx-knife](https://github.com/mzau/mlx-knife) project and BROKE Cluster, demonstrating best practices for OpenAI-compatible API integration, Vision API support, and advanced chat features.

## Features

- **Universal Compatibility**: Works with any OpenAI-compatible API server
- **Automatic Detection**: Detects server capabilities and adapts UI
- **Zero Dependencies**: No build tools, no npm install - just HTML/CSS/JavaScript
- **Real-time Streaming**: Token-by-token streaming with Server-Sent Events
- **Markdown Support**: Code blocks, lists, links, tables, emphasis
- **🖼️ Vision/Image Upload** *(v0.1.5-beta)*: Multi-image support with OpenAI Vision API (JPEG, PNG, GIF, WebP up to 20MB)
- **🗑️ Message Deletion** *(v0.1.5-beta)*: Delete individual messages to clean up conversation context and reduce hallucination
- **📎 File Upload**: Multi-file text attachments (25+ programming languages)
- **💾 Smart Code Download**: Intelligent filename detection with download buttons on all code blocks
- **📦 Bulk Download**: Auto-detects project structures → one-click save with full directory hierarchy (Chrome/Edge; fallback for other browsers)
- **⏹ Stop Generation**: Abort streaming mid-response with graceful termination
- **Session History**: Conversations with model metadata saved in browser sessionStorage (cleared on tab close)
- **Modern UI**: Fullscreen mode, integrated prompt buttons, animated status indicators

**Maturity Status:**
- ✅ **Beta** for Standard OpenAI APIs (tested with mlx-knife)
- ✅ **Beta** for Vision API (v0.1.5-beta) - *Server-side image numbering fix pending*
- ⚠️ **Alpha** for BROKE Cluster (experimental features)

### Enhanced Mode Features

When connected to a server with extended debug endpoints, additional features activate:

- Debug panel with Auto/Manual mode toggle
- Complexity override slider (0.0 - 1.0)
- Star rating system for feedback
- Routing details and model selection info
- Vote submission for training data

### Standard Mode Features

For standard OpenAI-compatible servers:

- Model selection dropdown
- Basic chat functionality
- Health monitoring

## Quick Start

### Step 1: Launch nChat

Simply open the HTML file - no build step required:

#### Method 1: Direct Browser (Recommended)

```bash
# Simply open in browser - no server needed
open webui/index.html
# or double-click webui/index.html
```

#### Method 2: Python HTTP Server (Optional)

```bash
cd webui/
python -m http.server 8080
# Then navigate to: http://localhost:8080
```

---

## Server Configuration

**nChat works with any OpenAI-compatible API server.** Configure your server by opening browser DevTools → Console:

**Open DevTools:**
- Windows/Linux: `F12` or `Ctrl+Shift+I`
- macOS: `Cmd+Option+I` or right-click → Inspect

### Option 1: Browser localStorage (Recommended)

**No code editing required** - just paste the commands below and reload:

#### Ollama (Local)
```javascript
// Prefer the server root; `/v1` also works.
localStorage.setItem('broke_api_base', 'http://localhost:11434');
localStorage.setItem('broke_api_key', 'ollama');  // Ollama ignores API keys
location.reload();
```

#### LM-Studio (Local)
```javascript
// Prefer the server root; `/v1` also works.
localStorage.setItem('broke_api_base', 'http://localhost:1234');
localStorage.setItem('broke_api_key', 'lm-studio');  // LM-Studio ignores API keys
location.reload();
```

#### Local OpenAI-compatible server (generic)
```javascript
localStorage.setItem('broke_api_base', 'http://localhost:8000');
localStorage.setItem('broke_api_key', 'your-api-key');  // May not be required by all servers
location.reload();
```

#### Remote server
```javascript
localStorage.setItem('broke_api_base', 'http://your-server-ip:8000');
localStorage.setItem('broke_api_key', 'your-api-key');
location.reload();
```

**To reset to defaults:**
```javascript
localStorage.removeItem('broke_api_base');
localStorage.removeItem('broke_api_key');
location.reload();
```

### Option 2: Edit Code (Fallback)

If localStorage doesn't work, edit `webui/js/api.js` (lines 24-25):
```javascript
const API_BASE = localStorage.getItem('broke_api_base') || 'http://localhost:8000';
const API_KEY = localStorage.getItem('broke_api_key') || 'broke-dev-key-12345';
```

**⚠️ Security Note:** nChat is a pure client-side app (static HTML/JS). API keys are always visible in browser DevTools. **Never use production keys with sensitive billing limits.** This is intended for local/development use only.

---

## Keyboard Shortcuts

### Enhanced Mode (BROKE Cluster)
- **Ctrl+Shift+D** (Windows/Linux) / **Cmd+Shift+D** (Mac): Toggle debug panel

### File Operations
- **Shift+Click** on Bulk Download button: Download to a new directory (Mac: ⇧ + Klick)
  - Works for both initial download and repeated downloads (even after "View project tree" is shown)
  - Prompts for optional subdirectory ("Download to:" field in modal)
  - Resets entire session: clears all path edits (Alt+Click) and bulk button state
  - Use case: Download same LLM output to multiple test directories without tab reload
  - Tooltip shows: *"Shift+Click to download to a new directory (works for repeated downloads)"*
- **Alt+Click** on single file save (code block): Edit the relative path under the current project root before saving. (Mac: ⌥ + Klick)
  - Preserves current project root, only changes file path
  - Example: `backend/utils.js` → edit to `lib/helpers.js` → saves to same project under different path
  - Use case: Reorganize individual files within the same project session
- **Shift+Click** on single file save (code block): Start new session with new project root (Mac: ⇧ + Klick)
  - Prompts for new project root directory
  - Prompts for optional subdirectory (consistent with bulk download UX)
  - Pre-fills subdirectory with original path (e.g., `src/main.rs` → suggests "src")
  - Resets entire session: clears all path edits (Alt+Click) and bulk button state
  - Use case: Save file to completely different project (fresh start)

### Browser Console Commands

For advanced users, these commands are available in the browser console:

```javascript
window.refreshServerCapabilities()  // Re-detect server type
toggleDebugView()                   // Toggle debug panel (BROKE Cluster only)
clearChat()                         // Clear chat history
setMode('auto')                     // Enable auto routing (BROKE Cluster only)
setMode('manual')                   // Enable manual override (BROKE Cluster only)
```

## Configuration

API configuration is located in `webui/js/api.js` (lines 4-5):

```javascript
const API_BASE = 'http://localhost:8000';  // Your backend URL
const API_KEY = 'broke-dev-key-12345';     // Your API key
```

## Project Structure

```
broke-nchat/
├── README.md                # This file
├── CHANGELOG.md             # Version history
├── LICENSE                  # Apache 2.0 License
└── webui/
    ├── index.html           # Main HTML file
    ├── COMPATIBILITY_NOTES.md  # Server endpoint documentation
    ├── assets/
    │   └── broke-beaver-logo.png
    ├── css/
    │   └── styles.css
    └── js/
        ├── version.js       # Version constant
        ├── api.js           # API communication
        ├── chat.js          # Chat logic & streaming control
        ├── fileAttachment.js  # File & image upload handling
        ├── debug.js         # Debug features (BROKE Cluster)
        └── chat/
            ├── ui.js        # UI rendering & interactions
            ├── bulk-download.js  # Bulk download orchestration
            ├── bulk-ui.js   # Bulk download UI
            ├── file-system.js  # File System Access API wrapper
            ├── project-structure.js  # Tree structure generation
            ├── tree-detection.js  # Tree syntax detection
            ├── markdown.js  # Parser DOM integration
            └── markdown/    # Modular parser
                ├── constants.js   # Token patterns & file extensions
                ├── lexer.js       # Path extraction
                ├── parser.js      # Candidate resolution
                ├── confidence.js  # Confidence scoring
                └── fallback.js    # Fallback patterns
```

**Key Modules:**

**Parser (modular architecture):**
- Code modules: `webui/js/chat/markdown/` (5 modules + DOM integration)
- Lexer-based path extraction with confidence scoring
- Fallback patterns for edge cases

**Core Chat:**
- `api.js` - HTTP communication, server capability detection
- `chat.js` - Main chat logic, state management, streaming
- `ui.js` - UI rendering & interactions
- `fileAttachment.js` - File & image upload handling (Vision API support)

**Bulk Download:**
- `bulk-download.js` - Download orchestration
- `bulk-ui.js` - UI for bulk operations
- `file-system.js` - File System Access API wrapper
- `project-structure.js` - Tree structure generation
- `tree-detection.js` - Tree syntax detection

## Technical Details

- **No Build Dependencies**: Zero-build setup with pure HTML/CSS/JavaScript
- **Modular Architecture**: Clean separation between API, chat, UI, file handling, and debug logic
- **Lexer/Parser**: Robust filename detection using compiler-style architecture
- **Session Caching**: Server capabilities cached for 5 minutes
- **Graceful Degradation**: Works even if certain endpoints are missing
- **localStorage**: Persists chat history and model selection
- **File System Access API**: Native save dialogs (Chrome/Edge) with fallback (Firefox/Safari)

## Browser Compatibility

Works with all modern browsers supporting:

- ES6 JavaScript
- Fetch API
- localStorage
- sessionStorage
- Server-Sent Events (SSE)

## Development

No build tools required! Simply edit files and refresh browser.

```bash
# Edit a file
vim webui/js/chat.js

# Refresh browser - done!
```

See [Keyboard Shortcuts](#keyboard-shortcuts) section for available hotkeys and console commands.

## API Requirements

See `webui/COMPATIBILITY_NOTES.md` for detailed endpoint documentation.

**Minimum Required Endpoints:**
- `GET /health` - Health check
- `GET /v1/models` - List available models
- `POST /v1/chat/completions` - Chat endpoint with streaming

**Optional Enhanced Endpoints:**
- `GET /debug/models` - Extended model information
- `POST /debug/complexity` - Prompt complexity analysis
- `POST /debug/vote` - Feedback collection

## License

This project is licensed under the **Apache License 2.0** with an **Additional Attribution Requirement**.

See the [LICENSE](LICENSE) file for full details.

### Key Points

- ✅ **Free to use, modify, and distribute** (Apache 2.0)
- ✅ **Commercial use permitted**
- ⚠️ **Attribution required**: Forks and derivatives MUST display the BROKE logo and credit in the UI
- 🔗 **Link required**: "Built with nChat by BROKE Team" with link to this repository

This ensures users can always identify the original source while allowing the community to build upon this work.

---

<div align="center">

## 🦫

**BROKE** – *BROKE Runs On Keen Efficiency*

Built with ❤️ by the [BROKE Team](https://github.com/mzau)

[mlx-knife](https://github.com/mzau/mlx-knife) • [nChat](https://github.com/mzau/broke-nchat) • [BROKE Cluster](https://github.com/mzau)

See [CHANGELOG.md](CHANGELOG.md) for complete version history.

</div>
