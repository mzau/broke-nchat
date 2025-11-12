# Changelog

All notable changes to nChat will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-beta] - 2025-11-12

### Initial Beta Release

First beta version of **nChat** - a universal web chat client for OpenAI-compatible APIs.

**nChat** = **n**ew **Chat** - The modern way to chat with your LLMs.

**Maturity Status:**
- **Beta** for Standard OpenAI API (tested with mlx-knife)
- **Alpha** for BROKE Cluster (experimental features)

#### Added

- **Core Features**:
  - Standalone web interface with zero build dependencies
  - Automatic server capability detection (enhanced vs. standard mode)
  - Adaptive UI based on detected server capabilities
  - Real-time token streaming with Server-Sent Events
  - Full Markdown support with marked.js
  - Persistent chat history with model metadata via localStorage
  - Fullscreen mode with fixed header/footer layout
  - Responsive design for desktop and mobile

- **📎 File Upload**:
  - Multi-file text attachment (30+ programming languages)
  - Collapsible file chips in chat messages
  - Files formatted as markdown code blocks before API submission
  - Works with existing OpenAI-compatible APIs (no server changes needed)

- **💾 Intelligent Code Download** (Unique Feature):
  - Download button on all code blocks in responses
  - **Smart filename detection** via Lexer/Parser architecture:
    - Explicit: `File: name.ext`, `**File: name.ext**`
    - Backticked: `` `app.js` ``, `` File: `name.ext` ``
    - Headings: `## 1. index.html (Description)`
    - Prosaisch: `index.html:`, `Let's create app.js:`
    - Comments: `# filename: script.py`
  - Extension verification (matches filename with code block language)
  - File System Access API (Chrome/Edge) with fallback (Firefox/Safari)
  - High confidence only - never suggests invalid filenames

- **Enhanced Mode Features** (BROKE Cluster, experimental):
  - Debug panel with Auto/Manual mode toggle (Ctrl+Shift+D / Cmd+Shift+D)
  - Complexity override slider (0.0 - 1.0)
  - Manual model selection override
  - Star rating system for feedback
  - Routing details modal with full decision information
  - Vote submission with context for training data
  - Raw debug output window for response analysis
  - Health monitoring with automatic reconnect

- **Standard Mode Features** (OpenAI-compatible APIs):
  - Model selection dropdown
  - Basic chat functionality with streaming
  - Connection status indicator
  - Persistent history

- **Technical Features**:
  - Modular JavaScript architecture:
    - `api.js` - API communication
    - `chat.js` - Chat logic (576 lines, -55% after refactoring)
    - `chat/markdown.js` - Lexer/Parser for filename detection
    - `chat/ui.js` - UI rendering & interactions
    - `fileAttachment.js` - File upload handling
    - `debug.js` - Debug features
  - Lexer/Parser architecture for robust filename detection
  - Session-based capability caching (5-minute TTL)
  - Graceful degradation for missing endpoints
  - Browser console commands for debugging
  - Zero-dependency setup (only marked.js via CDN)

- **Assets**:
  - BROKE Beaver logo v2 (SVG)
  - Complete CSS with modern design

- **Documentation**:
  - README.md with Quick Start guide
  - CLAUDE.md for developers
  - COMPATIBILITY_NOTES.md for endpoint documentation
  - Inline documentation in all JS modules

#### Technical Stats

- **Total Lines of Code**: ~2,200 lines (modular architecture)
- **Files**: 11 core files (HTML, CSS, 6x JS, 4x MD)
- **Bundle Size**: ~95 KB uncompressed
- **Browser Support**: All modern browsers with ES6, Fetch API, SSE

#### License

- **Apache License 2.0** with Additional Attribution Requirement
- Logo and attribution MUST be displayed in derivative works
- See LICENSE file for complete terms

#### Known Limitations

- No offline functionality
- No server-side chat history
- No multi-session synchronization
- API key in source code (for simple setup, not production)

---

## Versioning Policy

- **Major Version (X.0.0)**: Breaking changes in API communication or structure
- **Minor Version (0.X.0)**: New features, no breaking changes
- **Patch Version (0.0.X)**: Bug fixes, minor improvements
- **Beta/Alpha Suffix**: Unstable versions for testing

---

## Links

- **GitHub**: [github.com/mzau/broke-nchat](https://github.com/mzau/broke-nchat) _(not yet published)_
- **BROKE Team**: [github.com/mzau](https://github.com/mzau)
