# Changelog

All notable changes to nChat will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.5-beta] - 2025-12-15

First public beta release with Vision API support, enhanced bulk download, and universal OpenAI API compatibility.

### Added

- **Vision/Image Upload Support**:
  - Upload images (JPEG, PNG, GIF, WebP) up to 20MB
  - Automatic thumbnail generation for UI display
  - OpenAI Vision API multimodal message format
  - Mixed text + image uploads in single message
  - Thumbnails shown in attachment area and chat history
  - Tested with Pixtral and other Vision-capable models

- **Message Deletion (Experimental)**:
  - Delete individual messages (user prompts or AI responses) from conversation
  - 🗑️ Delete button appears on hover next to copy button
  - Power-user feature for targeted context manipulation
  - Confirmation dialog prevents accidental deletion
  - Removes message from both UI and conversation history
  - Delete buttons disabled during streaming for safety
  - **Feedback welcome**: Considering paired deletion (prompt+answer) vs. granular approach

- **Bulk Download with Project Structure**:
  - Automatically detects project tree structures in LLM responses
  - "Set Project Root & Download All" button for multi-file downloads
  - Smart parsing handles Unicode box-drawing (`├──`, `└──`, `│`) and ASCII variants
  - Creates nested directories matching project structure
  - Conflict resolution UI when tree paths differ from code block paths
  - Visual preview modal before download
  - Supports synthetic tree generation when LLM doesn't provide explicit structure
  - Works with File System Access API (Chrome/Edge) with fallback for other browsers

- **Stop Inference Button**:
  - Red stop button (⏹) to halt streaming mid-generation
  - Graceful termination saves partial response to history
  - Send button (➤) toggles to stop button during streaming
  - Enables bulk download even on stopped messages

- **Universal OpenAI API Support**:
  - Configure server via browser console (no code editing required)
  - localStorage-based configuration: `broke_api_base`, `broke_api_key`
  - Tested with Ollama, LM-Studio, and mlx-knife
  - Health-check with graceful fallback (`/health` → `/v1/models`)
  - API URL normalization prevents double `/v1/v1/` issues
  - Server capability cache invalidation on API_BASE change

- **Enhanced Parser**:
  - Emphasis path support: `**src/app.js**`, `*config.json*`, `_path_`
  - Code fence metadata: ` ```js title="src/app.js"` `
  - Parenthetical paths: `#### db.ts (project/backend/src/config/db.ts)`
  - Dotfile support: `.env`, `.gitignore` with backtick wrapping
  - 80+ file extensions recognized (including assets, configs, media)
  - BNF-conformant grammar with lexer/parser architecture

### Changed

- **Storage Migration**:
  - localStorage → sessionStorage for chat history
  - Ephemeral state cleared on tab close (provides "reset escape hatch")
  - Automatic cleanup of legacy localStorage data on first load
  - Prevents quota issues with large conversation histories

- **Image Sanitization**:
  - Base64 images replaced with `[IMAGE_DATA_REMOVED]` placeholder in sessionStorage
  - Full images kept in RAM only during active session
  - Prevents storage quota exhaustion (5MB sessionStorage limit)
  - Vision conversations continue gracefully after page reload (text-only)

- **Bulk Download Refactoring**:
  - Modular architecture: tree-detection, file-system, bulk-download, bulk-ui, project-structure
  - Improved state persistence with sessionStorage
  - Consistent keyboard shortcuts (Shift+Click for subdirectory prompt)
  - Better visual feedback and conflict detection

- **UX Improvements**:
  - Copy button changed to icon-only (📋) with tooltip
  - Visual feedback on copy: checkmark (✓) only
  - Streaming input protection: textarea and attach button disabled during generation
  - Placeholder changes to "Please wait..." during streaming
  - Vision API error handling with context-aware messages

### Fixed

- **Streaming Input Race Condition**:
  - Fixed: Users could press Enter or attach files during streaming
  - Now: Textarea and attach button (📎) disabled while response generates
  - Safety guard in `sendMessage()` checks streaming flag
  - Prevents overlapping API requests and corrupted conversation history

### Cross-Browser Compatibility

Tested with:
- Chrome: LM-Studio (text + Vision)
- Firefox: Ollama (`file://` and HTTP server)
- Safari: Ollama (`file://` protocol), bulk download fallback

### Known Issues

- **Image numbering resets after model switch** (Server-side issue):
  - Symptom: "Image 1, 2, 3..." numbering restarts when switching models
  - Root cause: Server not implementing history-based image deduplication
  - Client sends full `conversationHistory` correctly (OpenAI API compliant)
  - Workaround: Reference images by description in prompts ("the beach photo", etc.)
  - Status: Awaiting server-side fix

---

## [0.1.0-beta] - 2025-11-12

Initial beta release of **nChat** - a universal web chat client for OpenAI-compatible APIs.

### Core Features

- **Zero-Build Web Interface**:
  - Standalone HTML/CSS/JavaScript (no build dependencies)
  - Automatic server capability detection
  - Real-time token streaming with Server-Sent Events
  - Full Markdown support with marked.js
  - Persistent chat history via localStorage
  - Responsive design for desktop and mobile

- **File Upload**:
  - Multi-file text attachment (30+ programming languages)
  - Collapsible file chips in chat messages
  - Files formatted as markdown code blocks for API submission

- **Intelligent Code Download**:
  - Download button on all code blocks
  - Smart filename detection via Lexer/Parser:
    - Explicit: `File: name.ext`, `**File: name.ext**`
    - Backticked: `` `app.js` ``, `` File: `name.ext` ``
    - Headings: `## 1. index.html (Description)`
    - Prosaisch: `index.html:`, `Let's create app.js:`
    - Comments: `# filename: script.py`
  - Extension verification (matches filename with code block language)
  - File System Access API with fallback

- **Standard Mode** (OpenAI-compatible APIs):
  - Model selection dropdown
  - Streaming chat with connection status
  - Persistent history and model metadata

### Technical Details

- **Modular Architecture**:
  - `api.js` - API communication
  - `chat.js` - Chat logic
  - `chat/markdown.js` - Lexer/Parser for filename detection
  - `chat/ui.js` - UI rendering
  - `fileAttachment.js` - File upload handling

- **Browser Support**: All modern browsers with ES6, Fetch API, SSE

### License

Apache License 2.0 with Additional Attribution Requirement. See LICENSE for details.

---

## Versioning Policy

- **Major Version (X.0.0)**: Breaking changes
- **Minor Version (0.X.0)**: New features, no breaking changes
- **Patch Version (0.0.X)**: Bug fixes, minor improvements
- **Beta/Alpha Suffix**: Unstable versions for testing

---

## Links

- **GitHub**: [github.com/mzau/broke-nchat](https://github.com/mzau/broke-nchat)
- **BROKE Team**: [github.com/mzau](https://github.com/mzau)
