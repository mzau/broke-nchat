# nChat

**Version 0.1.0-beta**

A simple, universal web chat client for OpenAI-compatible APIs.

**nChat** = **n**ew **Chat** - A modern, lightweight interface for your LLMs.

## Overview

nChat is a standalone web interface that works with any OpenAI-compatible API server. It automatically detects server capabilities and adapts its feature set accordingly - no build tools, no dependencies, just open and use.

## Features

- **Universal Compatibility**: Works with any OpenAI-compatible API server
- **Automatic Detection**: Detects server capabilities and adapts UI
- **Zero Dependencies**: No build tools, no npm install - just HTML/CSS/JavaScript
- **Real-time Streaming**: Token-by-token streaming with Server-Sent Events
- **Markdown Rendering**: Full Markdown support with code syntax highlighting
- **📎 File Upload**: Multi-file text attachments (30+ programming languages)
- **💾 Smart Code Download**: Intelligent filename detection with download buttons on all code blocks
- **Persistent History**: Conversations with model metadata saved in browser localStorage
- **Modern UI**: Fullscreen mode, integrated prompt buttons, animated status indicators
- **Responsive Design**: Works on desktop and mobile devices

**Maturity Status:**
- ✅ **Beta** for Standard OpenAI APIs (tested with mlx-knife)
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

### Method 1: Direct Browser (Recommended)

```bash
# Simply open in browser - no server needed
open webui/index.html
# or double-click webui/index.html
```

### Method 2: Python HTTP Server (Optional)

```bash
cd webui/
python -m http.server 8080
# Then navigate to: http://localhost:8080
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
├── CLAUDE.md                # Developer documentation
├── CHANGELOG.md             # Version history
└── webui/
    ├── index.html           # Main HTML file
    ├── COMPATIBILITY_NOTES.md  # Server endpoint documentation
    ├── assets/
    │   └── broke-beaver-logo.png  # Logo
    ├── css/
    │   └── styles.css       # All styles (~760 lines)
    └── js/
        ├── version.js       # Version constant
        ├── api.js           # API communication (~430 lines)
        ├── chat.js          # Chat logic (576 lines, -55% after refactoring)
        ├── fileAttachment.js  # File upload handling (~220 lines)
        ├── debug.js         # Debug features (~180 lines)
        └── chat/
            ├── markdown.js  # Lexer/Parser for filename detection (~350 lines)
            └── ui.js        # UI rendering & interactions (~450 lines)
```

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

### Useful Browser Console Commands

```javascript
window.refreshServerCapabilities()  // Re-detect server type
toggleDebugView()                   // Toggle debug panel
clearChat()                         // Clear chat history
setMode('auto')                     // Enable auto routing
setMode('manual')                   // Enable manual override
```

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

## Credits

Developed by the **BROKE Team** (github.com/mzau)

**BROKE**: *"BROKE Runs On Keen Efficiency"*

---

## Future Roadmap

Planned features for upcoming versions (prioritized by value/size ratio):

### High Priority (Small Size, High Value)
- [ ] **Dark mode / theme support** (~5-10 KB, highly requested)
- [ ] **Keyboard shortcuts** (~5 KB, power user feature)
- [ ] **Conversation export** (JSON, Markdown) (~10-20 KB)
- [ ] **Drag & drop for file attachments** (~10 KB, extends existing feature)

### Medium Priority (Moderate Size or Server-Dependent)
- [ ] **Configuration UI** (API URL, API key) (~20-30 KB)
- [ ] **Vision support** (image uploads, ~20-30 KB, requires server support)
- [ ] **Multi-language support** (~30-50 KB, depends on language count)

### Low Priority (Large Size, Questionable Value/Size Ratio)
- [ ] **Syntax highlighting** (~200+ KB with library, significant bloat)
- [ ] **Cost estimation** (for cloud APIs, edge case)

**Philosophy:** Keep core lightweight and fast. Consider plugin architecture for heavy features.

See [CHANGELOG.md](CHANGELOG.md) for version history and completed features.
