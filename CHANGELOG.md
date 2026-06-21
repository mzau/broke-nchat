# Changelog

All notable changes to nChat will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.7-beta] - 2026-06-21

Parser & tree-recognition robustness consolidation — known fixes accumulated since
0.1.6-beta, all independent of the upcoming 0.2.0 work. No new user-facing features.

### Fixed

- **Code-block file splitting**: support variable-length fences (a 4-backtick outer
  block containing 3-backtick inner blocks is one block) and meta-only fences. This
  fixes the index drift that mis-routed save paths after nested fences.
- **Path normalization on save**: multi-dot dotfiles are handled, and Windows /
  absolute paths are normalized to relative before saving.
- **Tree recognition — full ASCII connector family**: column-stack DEDENT with
  single-dash `|-`, plus the `tree`-style backtick last-child corner `` `-- ``, so
  rootless and mixed-style project trees nest correctly.
- **List-item filenames**: strip a leading path label and surrounding backticks from
  parenthetical filenames, so common-root detection isn't polluted.
- **Tree descriptions**: strip a trailing free-text `( … )` description on tree lines
  (and stop a dotted description from mis-rooting a subtree).
- **Duplicate files**: last-wins de-duplication by path; bulk save now writes the
  newest revision of a regenerated file.
- **Display / save hygiene**: sanitize the U+FFFD replacement glyph in saved and
  displayed copies, count root-level files as a directory in the summary, and pin a
  session-canonical project root across multi-turn saves.
- **Structure review modal**: drop a stale target-path input listener when the modal
  is re-opened (no more accumulating listeners across opens).

### Docs

- **COMPATIBILITY_NOTES**: document the vision / audio / file-save features.

---

## [0.1.6-beta] - 2026-02-03

Audio upload support with SERVER-HANDBOOK.md v2.0.4-beta.9 feature alignment.

### Added

- **Audio File Upload**:
  - Upload audio files (mp3, wav) up to 50MB for transcription, 5MB for chat
  - Single-audio guard (one audio per message)
  - Preview player in prompt area
  - Compact metadata chips in chat history
  - Robust duration detection (metadata + WebAudio fallback)

- **`/v1/audio/transcriptions` Endpoint Support**:
  - Hybrid audio endpoint strategy based on model detection
  - Known STT models (whisper, voxtral) → direct transcriptions endpoint
  - Known multimodal chat models (gemma-3n) → chat/completions with input_audio
  - Unknown models → try transcriptions first, fallback to chat on error
  - Multipart/form-data upload for Whisper-compatible transcription
  - Authentication header support for reverse proxy deployments

- **ADR-004 Error Envelope Support**:
  - Detects structured error format: `{status: "error", error: {type, message, retryable}}`
  - User-friendly error type labels (validation_error, model_not_found, etc.)
  - Retryable indicator shown in error messages

- **HTTP 507 Handling**:
  - Specific message for insufficient memory errors
  - Suggests trying smaller quantized models (e.g., 4-bit instead of 8-bit)

- **Audio+Vision Warning**:
  - Toast notification when audio is combined with images
  - Informs user that audio will be ignored (server limitation)

- **X-Request-ID Capture**:
  - Captures server request ID from response headers
  - Included in error messages for debugging

- **Context Length Caching**:
  - Caches `context_length` from `/v1/models` response
  - Available via `getModelContextLength(modelId)` for future UI features

### Fixed

- **Abort-Handling Crashes**:
  - Fixed: Stream reader null-pointer error when stopping long inference
  - Fixed: Copy button missing on aborted messages
  - Now: Graceful abort with proper UI state (copy/delete buttons visible)
  - Prevents "Cannot read properties of null (reading 'read')" crash

### Known Issues (Server Limitations)

- Long audio truncated to early segment (regardless of `max_tokens`)
- Audio+Vision combined: audio ignored (mlx-vlm behavior)
- Multi-audio not supported (mlx-vlm limitation)
- EuroLLM-22B tokenizer/encoding issues (model-specific, not WebUI bug)

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
