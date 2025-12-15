# Changelog

All notable changes to nChat will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.5-beta] - 2025-12-15

Vision API POC beta, message deletion (experimental), universal OpenAI API compatibility, and critical bug fixes.

#### Added

- **Vision/Image Upload Support** (2025-12-10):
  - Image file uploads (JPEG, PNG, GIF, WebP) up to 20MB
  - Automatic thumbnail generation for UI display (100px max)
  - OpenAI Vision API multimodal message format
  - Mixed text + image uploads supported
  - Thumbnails shown in attachment area and chat messages
  - `fileAttachment.js`: `isImageFile()`, `readImageAsBase64()`, `createThumbnail()`, `getAttachedImagesForAPI()`
  - Tested successfully with Pixtral (5 images, detailed descriptions)
- **Message Deletion Feature (Experimental)** (2025-12-13):
  - Delete individual messages (user or bot) from conversation context
  - 🗑️ Delete button next to 📋 Copy button (visible on hover)
  - Power-user feature: Enables targeted context manipulation
  - Primary goal: Clean up conversation context to reduce hallucination
  - Confirmation dialog before deletion
  - Removes message from both UI and `conversationHistory` (impacts next API call)
  - Fade-out animation for visual feedback
  - Streaming protection: Delete buttons disabled during response generation
  - `chat.js:deleteMessage()` with detailed console logging for debugging
  - **Feedback welcome:** Considering paired deletion (prompt+answer) vs. granular approach

#### Changed

- **Storage: localStorage → sessionStorage** (2025-12-10):
  - All chat state now uses sessionStorage (ephemeral, cleared on tab close)
  - Provides "reset escape hatch" - close tab to clear buggy state
  - Automatic cleanup of legacy localStorage data on first load
  - Updated: `broke_chat_history`, `broke_selected_model`
  - Documentation updated in CLAUDE.md (State Management section)
- **Image sanitization for storage** (2025-12-10):
  - Base64 images replaced with `[IMAGE_DATA_REMOVED]` placeholder before storage
  - Prevents sessionStorage quota issues (5MB limit)
  - Full images kept in RAM only during session
- **Copy button UI refinement** (2025-12-13):
  - Changed from `📋 Copy` to icon-only `📋` with tooltip
  - Consistent icon-based UI with delete button
  - Visual feedback on copy: `✓` (checkmark only)
- **Vision API error handling** (2025-12-11):
  - Server error responses now parsed and displayed (instead of generic "HTTP 400: Bad Request")
  - Supports multiple error formats (OpenAI, FastAPI, generic JSON)
  - Context-aware error messages for Vision API failures:
    - Shows image count: `[Request contained 7 image(s)]`
    - Payload errors: "Image payload too large. Try using fewer or smaller images"
    - Token limit errors: "Images exceed model context window. Reduce image count or resolution"
    - Format errors: "Check image format (JPEG, PNG, GIF, WebP) and size limits"
  - No client-side image limits - server determines constraints based on its heuristics
  - `api.js:createChatCompletion()`: Enhanced error handling with image detection and helpful hints

#### Changed

- **Health-check with graceful fallback** (2025-12-14):
  - Health endpoint now tries `/health` first, then falls back to `/v1/models`
  - Enables compatibility with standard OpenAI-compatible servers (Ollama, LM-Studio)
  - mlx-knife `/health` provides extra metadata, fallback uses model count
  - Model selector works independently even if health-check fails (graceful degradation)
  - Known: Status indicator may not turn green with Ollama (health endpoint missing), but functionality works
  - Files: `webui/js/api.js:checkAPIHealth()`
- **API URL normalization** (2025-12-14):
  - New `buildApiUrl()` function handles both `/v1` suffix and root API_BASE formats
  - Prevents double `/v1/v1/models` when API_BASE already includes `/v1`
  - Normalizes trailing slashes automatically
  - Example: `http://localhost:11434/v1` + `/v1/models` → `http://localhost:11434/v1/models` ✅
  - Files: `webui/js/api.js:buildApiUrl()`, all API calls updated to use normalization
- **Server capability cache invalidation** (2025-12-14):
  - Cache now tracks `apiBase` and invalidates when server switches
  - Prevents stale capability detection when switching between Ollama/LM-Studio/mlx-knife
  - sessionStorage cleared automatically on API_BASE change
  - Files: `webui/js/api.js:detectServerCapabilities()`

#### Fixed

- **Streaming input race condition** (2025-12-15):
  - Fixed: Input area now properly disabled during streaming to prevent race conditions
  - Before: User could press Enter or attach files while response was streaming
  - After: Textarea and attach button (📎) disabled during streaming
  - Visual feedback: Placeholder changes to "Please wait..." during streaming
  - Safety guard: `sendMessage()` checks `isStreaming` flag before processing
  - Prevents: Overlapping API requests, corrupted conversation history, UI state inconsistencies
  - Files: `webui/js/chat.js:showStopButton()`, `showSendButton()`, `sendMessage()`
- **Clear Chat dialog logic** (2025-12-10):
  - Fixed: Dialog now checks both history array AND UI messages before showing
  - Prevents "no messages" dialog when history is out of sync with UI
- **Duplicate button prevention** (2025-12-13):
  - Fixed race condition where `finalizeBotMessage()` could be called multiple times
  - Symptom: Delete/copy buttons sometimes unresponsive (stacked duplicate buttons)
  - Fix: Remove existing buttons before adding new ones in `finalizeBotMessage()`
  - Also prevents duplicate star ratings and metadata
  - Delete buttons now work reliably on first click
- **Root-stripping heuristic fixes** (2025-12-14):
  - Fixed incorrect root stripping for shallow directory structures (e.g., `client/package.json`)
  - Fixed: Filenames were incorrectly counted as subdirectories in structural diversity check
  - Added mixed-structure detection: preserves subdirectory prefixes when root-level files exist
  - Example before fix: `client/package.json` → `package.json` (wrong, lost directory)
  - Example after fix: `client/package.json` → `client/package.json` (correct, preserved)
  - Bonus: Automatically strips duplicate prefixes (e.g., `backend/backend/src/...` → `backend/src/...`)
  - Makes separate duplicate-prefix detection feature obsolete
  - Language-agnostic: Works with all comment markers (`#`, `//`, `<!--`, `/*`, `--`)
  - New test fixture: `Qwen3-Next-80B-A3B-chat_3a.md` validates mixed-structure handling
  - Updated: `Duplicate-Prefix-Test.json` to reflect auto-stripping behavior
  - All 41 tests passing (19 filename parser + 22 tree parser)
- **Server configuration without code editing** (2025-12-14):
  - Fixed: Client now supports server configuration via browser localStorage (no code editing required)
  - Before: README claimed "universal" but required editing `api.js` to change servers
  - After: Use browser console to set `broke_api_base` and `broke_api_key` in localStorage
  - Breaking Promise Fix: Fulfills core promise "Works with any OpenAI-compatible API server"
  - Testing: Enables easy testing with Ollama, LM-Studio, and other OpenAI-compatible servers
  - Fallback: Code-editing still works if localStorage unavailable
  - Documentation: README.md "Server Configuration" section with copy-paste examples
  - Files: `webui/js/api.js` (localStorage override), `README.md` (new configuration section)

#### Removed

- **Obsolete duplicate-prefix detection code** (2025-12-14):
  - Removed 24 LOC from `tree-detection.js` (hasDuplicatePrefix detection logic)
  - Reason: Radio-button UI was never implemented, auto-stripping already handles all cases
  - Tree detection simplified: 459 LOC → 435 LOC

#### Tested

- **Cross-browser compatibility** (2025-12-14):
  - Chrome: LM-Studio (text chat + Vision)
  - Firefox: Ollama (`file://` and HTTP server)
  - Safari: Ollama (`file://` protocol)
- **OpenAI-compatible servers** (2025-12-14):
  - mlx-knife: Full feature support
  - Ollama (port 11434): Standard mode with localStorage configuration
  - LM-Studio (port 1234): Standard mode with Vision support
  - All tested with localStorage configuration (no code editing)

#### Notes

- **Vision Support**: Client-side implementation follows OpenAI Vision API standard
  - Server determines image limits and capabilities (client adapts automatically)
  - Recommended workflow: Vision model for descriptions → Text model for analysis
  - Cross-model collaboration tested and working
  - For mlx-knife server specifics, see mlx-knife project documentation

#### Known Issues (Server-side fixes required)

- **Image numbering resets after model switch** (Identified 2025-12-13):
  - Symptom: "Image 1, 2, 3..." numbering restarts when switching between models
  - Expected: Stable numbering based on conversation history
  - Root cause: Server-side issue (not implementing history-based image deduplication)
  - Client status: ✅ Client sends full `conversationHistory` correctly (OpenAI API compliant)
  - Workaround: Manually reference images by description in prompts ("the beach photo", etc.)
  - **Status: Awaiting server-side fix** (mlx-knife beta limitation)

---

## [0.1.4-beta] - 2025-12-10

**Note:** Parser validation is ongoing (edge cases continue to surface during daily use).

#### Added

- **Shift+Click Subdirectory Prompt** (2025-11-30):
  - Single-file downloads now support subdirectory input (consistent with bulk download UX)
  - After selecting projectRoot, prompts: "Save to subdirectory (optional):"
  - Pre-fills with original directory part (e.g., `src/main.rs` → suggests "src")
  - User can accept, edit, clear (root level), or cancel
  - Example: projectRoot="myproject", subdir="docs" → saves to `myproject/docs/README.md`
  - Subdirectory is path WITHIN projectRoot, not a new root
- **Markdown emphasis paths**: Lexer-level pattern for emphasis-wrapped paths (`**src/app.js**`, `*config.json*`, `_path/file.ext_`)
  - `TERM_EMPHASIS_PATH` token implementation in lexer
  - MEDIUM confidence level (inline context, requires extension verification)
  - Works with all markdown emphasis markers (not just `**`)
- **Dotfile support enhancements**:
  - `.env` added to HIGH_CONFIDENCE_FILENAMES allowlist
  - Backtick-wrapped dotfile pattern (`` `.env` ``, `` `.gitignore` ``)
- **Code fence metadata extraction**: Implemented `BLOCK_META_PATH` token for ` ```js title="src/app.js"` ` patterns (was BNF-only in v0.1.3)
- **First-line comment paths**: Formalized `INLINE_PATH` as first-class token (was TERM_BLOCKSTART attribute in v0.1.3)

#### Changed

- **CONTRIBUTING.md consolidation**:
  - Clarified test workflow (Expected ≠ Current Output)
  - Added `filenameArray` structure documentation with block-index mapping
  - Removed "Option B: Manual Generation" (-76 lines)
  - Enhanced with real-world workflow examples and GitHub issue templates
- **Test infrastructure**:
  - `generate-expected.js` now documents null blocks with line numbers
  - Enhanced expected JSON format with detailed block mapping for easier debugging
- **Bulk download refactoring** (2025-11-28):
  - Split `project-structure.js` (1347 LOC monolith) into 4 focused modules:
    - `tree-detection.js` (409 LOC) - Tree parsing & synthetic structure
    - `file-system.js` (162 LOC) - File System Access API wrapper
    - `bulk-download.js` (368 LOC) - Download orchestration & state
    - `bulk-ui.js` (570 LOC) - Modal rendering & tree visualization
    - `project-structure.js` (53 LOC, -96%!) - Module loader with validation
  - Total: ~1500 LOC (better organized, +153 LOC for improved structure)
- **Bulk download state persistence** (2025-11-28):
  - Switched from in-memory to sessionStorage (cleared on tab close, better testability)
  - Persist `conflictStrategy` and `duplicatePrefixMode` for view-only modal
  - Info badges now display correctly after page reload
  - Fallback: If `conflictStrategy` missing but conflicts present, default to "code"
- **Keyboard shortcuts consistency** (2025-11-29):
  - **Shift+Click** now works consistently in all button states
  - In "View project tree" mode: Shift+Click immediately resets to initial state and triggers new download
  - Removed Alt+Shift+Click debug feature (obsolete with consistent Shift+Click)
  - Single-file downloads now strip tree root from paths (consistent with bulk download behavior)
  - Alt+Click and Shift+Click show relative paths under project root (e.g., `src/app.js` instead of `myproject/src/app.js`)

#### Fixed

- **Synthetic tree root stripping bug** (2025-11-30, P1):
  - Fixed false stripping of legitimate top-level directories (`src/`, `backend/`, `packages/`)
  - Added `KNOWN_TOP_LEVEL_DIRS` heuristic to distinguish wrapper roots from structural directories
  - Implemented 3-criteria check: (1) All paths share prefix, (2) NOT known top-level dir, (3) Structural diversity (≥2 second-level dirs)
  - Exception: Duplicate prefix (`backend/backend/...`) ALWAYS strips first segment
  - Fixes: `src/App.tsx` no longer corrupted to `App.tsx` in synthetic structure
  - Reviewer finding: docs/review-synthetic-tree-root-strip.md (P1 bug)
- **Duplicate-prefix edge cases** (2025-11-30, 3 bugs fixed):
  - **Tree-only without code blocks**: Button now correctly disabled when tree structure exists but no code blocks available
    - Intersection validation: Count intersection (Tree ∩ Code blocks with content)
    - UI: "⚠️ No code blocks found" + "(N files in tree, 0 downloadable)"
    - Prevents empty downloads when LLM provides tree structure but no file contents
  - **Alt+Click path editing**: Prompt now shows ORIGINAL unstripped path (not pre-stripped path)
    - Fixed: Alt+Click on `backend/backend/src/index.ts` now shows `backend/backend/src/index.ts` (not `backend/src/index.ts`)
    - Root stripping moved AFTER Alt+Click prompt (previously happened before)
    - Normal downloads still use stripped paths as expected
  - **Tooltip after bulk save**: Tooltip now shows ACTUAL saved path (correctly stripped)
    - Fixed: Green button tooltip shows `Saved to project/backend/src/index.ts` (not `backend/backend/src/index.ts`)
    - Tooltip updated immediately after successful file save
  - **Conflict detection enhancement**: Button remains enabled when path conflicts exist despite zero intersection
    - Logic: Intersection = 0 + conflicts present → Button ENABLED (not disabled)
    - UI: "⚠️ N path conflicts - click to resolve"
    - Prevents disabling button when tree/code paths differ but files exist
  - Verified with real LLM outputs: `duplicate-tree-without-files_report.md`, `duplicate-tree-with-files_report.md`
- **Folder annotation bug** (2025-11-28):
  - LLM-generated tree annotations like `(folder)`, `(file)`, `[dir]` no longer cause false path conflicts
  - Fixed in `tree-detection.js:95` - strips annotations before path normalization
  - Example: `frontend (folder)/src (folder)/.eslintrc.json` → `frontend/src/.eslintrc.json`
  - New test fixture: `Folder-Annotation-Test.md`

#### Documentation

- **BNF Grammar v0.1.4**: Complete grammar specification (no version history, pure specification)
- **Grammar removed version references**: BNF now contains only current grammar, history moved to CHANGELOG
- **README.md keyboard shortcuts expanded** (2025-11-30):
  - Shift+Click workflows clarified (bulk and single-file with subdirectory prompts)
  - Alt+Click use cases explained (path management within session)
  - Clear distinction between Alt+Click (within session) vs Shift+Click (new session)

#### Test Coverage

- 40/40 tests passing (18 filename parser + 22 tree parser)
- New fixtures:
  - `Mixtral-8x7B-Instruct-v0.1-4bit-chat_4special.md` (emphasis paths)
  - `Emphasis-Path-Test.md` (all emphasis markers)
  - `DeepHermes-3-Mistral-24B-Preview-8bit-chat_4.md` (real-world validation)
  - `Folder-Annotation-Test.md` (folder annotation stripping)

---

## [0.1.3-beta] - 2025-11-27

**Major feature release** - BNF conformance, asset support, UX improvements

### Fixed

- **Parser path corruption**: Markdown horizontal rules (`---`) no longer misidentified as list items, preventing corrupted paths like `"### \`file.rs"` in parsed output
- **Tree depth calculation**: Deep nesting with wide indentation (Qwen3-style `│       ├──`) now correctly parsed, fixing missing directory levels in file paths
- **Conflict detection false positives**: Duplicate basenames (e.g., `src/main.rs` + `src-tauri/src/main.rs`) no longer trigger incorrect conflicts

### Added

- **Asset file support**: Images (`.svg`, `.png`, `.jpg`, etc.), fonts (`.woff`, `.woff2`, `.ttf`, etc.), media (`.mp3`, `.mp4`, etc.), and documents (`.pdf`) now recognized by parser and included in bulk downloads
- **ASCII box-drawing support**: Tree structures using ASCII symbols (`+--`, `|--`, `\--`) now parsed correctly alongside Unicode variants
- **Broken UTF-8 handling**: Gracefully handles corrupted UTF-8 box-drawing characters (`�`) in model outputs
- **BNF conformance improvements**:
  - Extension whitelist validation (80+ file types)
  - Config file support (`.conf`, `.ini`, `.cfg`, `.properties`)
  - MEDIUM confidence level for `File:` keyword and inline paths
  - Enhanced path patterns: dotfiles, known basenames (`Dockerfile`, `Makefile`), Windows paths, absolute path normalization
  - LOW confidence language validation (rejects mismatched extensions)
- **Duplicate prefix detection**: UI for handling `backend/backend/` patterns in synthetic structures with auto-detection and manual override
- **Conflict resolution UI**: Per-file radio buttons for choosing between tree paths and code paths when conflicts occur
- **Synthetic tree improvements**: No confusing root node shown; preview matches actual download structure
- **Test infrastructure**:
  - Expected output validator (`npm run validate`)
  - Template support in fixtures (files starting with `_` excluded)
  - New fixtures: BNF-Conformance-Test, Duplicate-Prefix-Test, Qwen3-Next-80B (51 blocks)

### Changed

- **License**: Updated `package.json` from `UNLICENSED` to `Apache-2.0` (matches LICENSE file)
- **Root metadata persistence**: View-only modal now preserves project name metadata for better UX consistency

### Test Coverage

- 14/14 parser test fixtures passing (198 total test cases)
- 22/22 tree-parser unit tests passing (Unicode, ASCII, broken UTF-8 coverage)
- All expected outputs validated (no path corruption)
- No regressions from v0.1.2

### Documentation

- **BNF Grammar**: Documented Markdown emphasis path limitation (planned for v0.1.4)
- **Parser Architecture**: Updated Appendix A - all 7 implementation gaps closed
- **CONTRIBUTING.md**: Added contributor guide with parser extension workflow

---

## [0.1.2-beta] - 2025-11-23

### Fixed

- **Stop button regression**: Fixed `currentBotMessage` assignment during streaming (`chat.js`)
- **Project root verification**: Removed broken directory probe, fixed handle persistence (`project-structure.js`)

### Added

- **Parser modularization**: Split into 6 focused modules (~1220 LOC total)
  - `markdown/constants.js`, `markdown/lexer.js`, `markdown/confidence.js`
  - `markdown/fallback.js`, `markdown/parser.js`, `markdown.js`
- **BNF-aligned production functions**: 5 parser functions matching formal grammar
- **Synthetic project tree generator**: Creates structure from code block paths when no explicit tree exists
- **Structure review modal**: Visual tree preview with conflict detection before bulk download
  - CSS-based tree rendering (no Unicode artifacts)
  - Intelligent directory sorting (src → tests → config)
  - Conflict detection (tree paths vs. code block paths)
  - Editable project root name
- **Smart preference logic**: Code block paths always preferred over tree block paths
- **Root name reconciliation**: Explicit tree root names respected over synthetic guesses
- **Parenthetical path extraction**: Heading pattern `#### filename (full/path/filename)`
  - Extracts full project paths from parentheses when present
  - Example: `#### db.ts (task-manager/backend/src/config/db.ts)` → extracts `task-manager/backend/src/config/db.ts`
  - Robust fallback: uses short filename if no parenthetical path provided
- **Known basenames without extension**: `Dockerfile`, `Makefile`, `Cargo`, etc.
  - Whitelisted filenames now recognized in headings without requiring `.ext`
- **Test infrastructure**: 27 automated tests (8 filename parser fixtures + 19 tree parser unit tests)
  - **New fixture**: Mistral-Small-3.2-24B (tests parenthetical path extraction)
  - Deep-Hermes-3-Mistral-24B (2 fixtures), Good-Model-Tauri, Llama-3.3-70B, Qwen3-Coder-30B, Synthetic-Deep-Nested
  - Tree parser: explicit roots, rootless trees, edge cases, synthetic generation, conflict detection
- **Real-world validation**: Mistral-Small prompt_3 bulk download successful (8 files, correct structure)

### Changed

- **Parser architecture**: Refactored from monolithic state machine to modular production-based design
  - `markdown.js`: 1070 → 390 LOC (DOM integration only)
  - `parseFilenameTokens()`: 140 → 30 LOC (-79%)

### Improved

- **Bulk download reliability**:
  - Stricter root detection (100% validation)
  - Consistent path handling (single source of truth)
  - Better attribute synchronization
  - Location: `project-structure.js`, `ui.js`

### Documentation

- **Parser architecture** (`docs/parser-architecture.md`): Updated with refactored architecture section
- **ADR-002** (`docs/ADR/ADR-002-parser-refactor.md`): Status changed to "Implemented" with implementation notes
- **API configuration** (`webui/js/api.js`, `README.md`): Added setup instructions and security notes
- **Test documentation** (`tests/README.md`): Added tree parser test coverage details

---

## [0.1.1-beta] - 2025-11-18 (Released 2025-11-19)

### Added

- **🧪 Parser Test Infrastructure** (2025-11-19):
  - **Automated test suite** for markdown filename parser
  - **Real-world fixtures** - archived chat patterns from Mixtral-8x7B and Qwen3-Next-80B
  - **Regression detection** - validates parser behavior across model outputs
  - **npm test integration** - `npm test` runs full test suite
  - **Documentation** - `tests/README.md` explains workflow and philosophy
  - **Structure**:
    - `tests/fixtures/` - Archived markdown patterns
    - `tests/expected/` - Expected parser outputs (JSON)
    - `tests/parser.test.js` - Test runner with colored output
  - **Result**: 2/2 tests passing, foundation for future parser improvements
  - **Files**: `tests/`, `package.json`

- **📦 Bulk Download with Project Structure Detection** (Killer Feature!):
  - **Automatic detection** of project structure blocks (tree views with `├──`, `└──`, `│`)
  - **Smart parsing** with robust depth calculation (handles broken UTF-8 symbols `��`)
  - **Directory recognition** without `/` suffix (heuristic: no extension = directory)
  - **"Set Project Root & Download All" button** appears below detected structures
  - **Nested directory creation** with File System Access API (Chrome/Edge)
  - **Full-path matching** for accurate file placement (`src/utils/mod.rs` → correct subdirectory)
  - **Multiple structure support** - each bulk button only downloads its associated files
  - **Visual feedback** - disabled during streaming, enabled when response completes
  - **Perfect for code generation** - models output structure + files → bulk save preserves hierarchy
  - **File**: `webui/js/chat/project-structure.js` (~280 lines, new module)

- **⏹ Stop Inference Button**:
  - **Stop streaming** mid-generation with red stop button (⏹)
  - **Graceful termination** - saves partial response to history with `[Generation stopped by user]` marker
  - **UI toggle** - Send button (➤) becomes Stop button (⏹) during streaming
  - **Reader cancellation** with proper cleanup and state management
  - **Enables bulk download** even on stopped messages
  - **File**: `webui/js/chat.js` (streaming control + `stopInference()`)

### Improved

- **Filename Detection Enhancements**:
  - **Full-path preservation** - stores both `fullPath` and `basename` for bulk download matching
  - **Fallback detection** from first-line comments: `// src/main.rs` → `main.rs`
  - **Direct path patterns** - supports comments without `filename:` keyword
  - **Extension derivation** - `# Cargo` in TOML block → `Cargo.toml`
  - **Whitelist validation** - `Cargo`, `Makefile`, `Dockerfile`, etc. recognized without extension
  - **Multiple comment syntaxes** - `#`, `//`, `<!-- -->`, `/* */`
  - **TOML support** added to known extensions and language mappings

- **Project Structure Parser**:
  - **Hybrid depth calculation** - combines vertical bars (`│`) count + whitespace indentation
  - **Broken UTF-8 resilience** - handles `��` replacement characters correctly
  - **Directory heuristics** - files without extension (not in whitelist) treated as directories
  - **Whitespace preservation** - doesn't trim lines prematurely for accurate indentation analysis
  - **Multi-level nesting** - correctly parses deep hierarchies like `src/utils/nested/file.rs`

### Fixed

- **Hardcoded max_tokens removed for better code generation**:
  - **Impact**: Previously limited to ~1000 tokens per response
  - **Now**: Uses server's dynamic calculation (up to 131k tokens for Qwen3-Coder-30B)
  - **Result**: Complex multi-file generation tasks complete fully without truncation
  - **File**: `webui/js/chat.js:119-120`

### Improved

- **Dotfile Support** (2025-11-19):
  - Dotfiles (`.gitignore`, `.env`, `.travis.yml`, etc.) now fully supported
  - Detected in both backtick headings and comment patterns
  - Saved with correct name (no `.txt` extension added by browser)
  - Files: `webui/js/chat/markdown.js`

- **Bulk Download Robustness** (2025-11-19):
  - Files detected via patterns (not in structure tree) land in correct subdirectories
  - Uses fullPath from filename detection for accurate placement
  - Consistent visual feedback (green checkmark) for all saved files
  - Files: `webui/js/chat/project-structure.js`

- **Project Structure Parsing** (2025-11-19):
  - Improved depth calculation for indented tree structures
  - Handles leading spaces + box-drawing symbols correctly
  - Formula: `depth = floor(leadingSpaces/4) + verticalBars + branchSymbols`
  - **Note**: Some edge cases with broken UTF-8 (`��`) from certain models remain
  - Files: `webui/js/chat/project-structure.js`

### Documentation

- **📚 Parser Architecture Documentation** (2025-11-19):
  - **Complete Lexer/Parser documentation** in `docs/parser-architecture.md`
  - Architecture overview, BNF grammar specification, state machine
  - All design decisions and rationale from v0.1.1-beta development
  - Testing strategy and coverage goals
  - **Purpose**: Consolidation anchor to prevent code drift

---

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
