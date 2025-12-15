# Contributing to nChat (WIP)

**Status:** Work in Progress - This document will be revised when Lite RAG is integrated (v0.2.0+)

Thank you for considering contributing to nChat! This guide focuses on the most common contribution: **extending the parser to support new LLM output patterns**.

---

## Quick Start: Parser Extensions

**Most common scenario:** Your favorite LLM produces output that nChat doesn't recognize.

### The Golden Rule: Check BNF First, Change It Last

**nChat's parser has two layers:**

1. **BNF Grammar** (`docs/grammar/BNF-GRAMMAR.md`) - Stable syntax specification
   - Defines what patterns are **valid**
   - Changes rarely (last resort!)
   - Requires discussion before modification

2. **Implementation** (`webui/js/chat/markdown/`) - Pattern recognition code
   - Defines which patterns are **actively recognized**
   - Changes frequently (most contributions here!)
   - Easy to extend without breaking anything

**The BNF grammar is intentionally flexible - most patterns you encounter are ALREADY valid!**

---

## Decision Flow: Implementation vs Grammar Change

```
Found unrecognized pattern (e.g., **path.js** not detected)
    ↓
Step 1: Read docs/grammar/BNF-GRAMMAR.md
    ↓
Does BNF syntax ALREADY allow this pattern?
    │
    ├─ YES (90% of cases) ✅
    │  └─> Implementation-only fix
    │      1. Add regex pattern to constants.js
    │      2. Add test fixture
    │      3. Submit PR
    │      4. BNF unchanged!
    │
    └─ NO (10% of cases) ⚠️
       └─> Stop! This needs discussion
           1. Open GitHub Issue describing pattern
           2. Discuss: Should BNF support this?
           3. If consensus: Update BNF + implement
           4. If no consensus: Close issue
```

**Example - Implementation gap (common):**
```
Pattern:   **src/app.js**  (bold Markdown emphasis)
BNF:       Already has <inline-path> syntax ✅
Solution:  Add TERM_EMPHASIS_PATH to constants.js
Change:    Code only, BNF unchanged
PR:        Simple, merge quickly
```

**Example - Grammar gap (rare):**
```
Pattern:   ```javascript:src/app.js  (language prefix in code fence)
BNF:       No syntax for language-prefix paths ❌
Solution:  Requires BNF extension discussion
Change:    BNF + code (after consensus)
PR:        Needs design review, slower merge
```

---

## Core Documentation (Read These First!)

Before contributing, understand the architecture:

### 1. **BNF-GRAMMAR.md** - The Specification (Stable)

**File:** `docs/grammar/BNF-GRAMMAR.md`

**Purpose:** Formal syntax specification - defines what's valid

**Read this to:**
- Check if your pattern is already supported
- Understand token types and priority
- See path normalization rules

**Modify this only if:**
- Pattern genuinely needs new syntax (rare!)
- You've discussed in GitHub Issue first
- Team agrees BNF extension is needed

**Key point:** BNF is intentionally broad - most patterns fit existing rules!

### 2. **parser-architecture.md** - The Implementation Guide

**File:** `docs/parser-architecture.md`

**Purpose:** Explains how code implements BNF

**Read this to:**
- Understand module structure (lexer → confidence → parser)
- See data flow diagrams
- Find implementation gaps (Appendix A)
- Learn where to add new patterns

**Modify this only if:**
- Architecture changes (very rare)
- Adding new module or changing flow

---

## Module Structure: Where to Make Changes

```
webui/js/chat/markdown/
├── constants.js     ← 90% of changes happen here! ✅
│                      Add new regex patterns for recognized tokens
│
├── lexer.js         ← 5% of changes (new token types)
│                      Modify only if BNF adds new syntax
│
├── confidence.js    ← 3% of changes (scoring adjustments)
│                      Rare: confidence tier tweaks
│
├── parser.js        ← 2% of changes (resolution logic)
│                      Very rare: priority or conflict resolution
│
└── fallback.js      ← READ ONLY - Don't modify! ❌
                       Frozen fallback logic

markdown.js          ← READ ONLY - DOM integration ❌
project-structure.js ← Separate concern (bulk download) ❌
```

**For 90% of parser extensions, you ONLY modify `constants.js`!**

---

## Step-by-Step: Adding Parser Support

### 1. Capture the Problem

**Use the copy button (📋) in your chat interface!**

1. Copy the template: `cp tests/fixtures/_TEMPLATE.md tests/fixtures/Model-Name-issue.md`
2. Fill in metadata (model, date, issue description)
3. Click copy button on your prompt → paste under `## Prompt`
4. Click copy button on model response → paste under `## Response`

**The test runner parses only the `## Response` section** - the rest is documentation.

See `tests/fixtures/_TEMPLATE.md` for the full template.

### 2. Validate Against BNF (CRITICAL STEP!)

**Before writing ANY code, check if BNF already supports the pattern:**

```bash
# Read the grammar specification
cat docs/grammar/BNF-GRAMMAR.md
```

**Ask yourself:**
- Does `<inline-path>` cover this? (covers most inline patterns)
- Does `<heading-declaration>` cover this? (covers most headings)
- Does `<file-keyword-declaration>` cover this? (covers "File:", "Create:", etc.)

**If BNF already supports it → Implementation gap, proceed to Step 4**

**If BNF doesn't support it → Grammar gap, proceed to Step 3**

### 3. Grammar Extension Discussion (If Needed)

**⚠️ STOP! Don't change BNF without discussion.**

1. **Open GitHub Issue:**
   ```markdown
   Title: Parser: Unsupported pattern ```language:path.js

   Pattern found in: Qwen3-Next-80B output
   Current BNF: Doesn't support language prefixes in code fences
   Proposal: Add <language-prefix-declaration> to BNF

   Example:
   ```javascript:src/app.js
   // code here
   ```

   Should we support this? Impacts:
   - BNF complexity increases
   - Edge cases: What if language contains ":" naturally?
   ```

2. **Wait for consensus** from maintainers

3. **If approved:** Update BNF-GRAMMAR.md with new syntax
   ```bnf
   <code-block-declaration> ::= <fence-marker> <language-spec>? <path-atom>? <newline>
   <language-spec> ::= <language> (":" <path-atom>)?  # NEW
   ```

4. **Document thoroughly:** Examples, edge cases, confidence tier

5. **Then proceed to implementation** (Step 4)

### 4. Implement the Pattern

**Most common case: Add pattern to `constants.js`**

```javascript
// constants.js

// 1. Define the regex pattern
const TERM_EMPHASIS_PATH = /\*\*([^\s*]+\.(\w+))\*\*/;

// 2. Export it
window.TERM_EMPHASIS_PATH = TERM_EMPHASIS_PATH;

// 3. Add to token list (if creating new token type)
// Usually already exported via existing token types
```

**Less common: Modify `lexer.js`** (only if new tokenization logic needed)

```javascript
// lexer.js
// Add token recognition in tokenizeMarkdown()
if (TERM_EMPHASIS_PATH.test(line)) {
    // Add token to results
}
```

**Rare: Modify `parser.js`** (only if resolution logic changes)

```javascript
// parser.js
// Adjust priority or conflict resolution
// Only needed for complex BNF changes
```

### 5. Create Expected Output File

After creating your fixture file (Step 1), you need to generate the expected parser output.

**IMPORTANT:** The generator creates a **baseline** (what the parser currently detects). You MUST review and edit this to define what the parser **SHOULD** detect!

**Step 1:** Run the generator script

```bash
# Generate baseline output (current parser behavior)
node tests/generate-expected.js Your-Model-Name-issue

# Example:
node tests/generate-expected.js Mixtral-8x7B-Instruct-v0.1-4bit-chat_4special
```

**Step 2:** Review the baseline output

The script shows what the parser **currently** detects:
- The `filenameArray` (current parser output)
- Total blocks and non-null entries
- Where to save the file

**Step 3:** Save baseline with --save flag

```bash
# Auto-save the baseline
node tests/generate-expected.js Your-Model-Name-issue --save

# This creates: tests/expected/Your-Model-Name-issue.json
```

**Step 4:** Edit to define EXPECTED behavior (CRITICAL STEP!)

This is where YOU define what the parser **SHOULD** detect:

```bash
# Open the generated baseline file
nano tests/expected/Your-Model-Name-issue.json
```

**Review and edit ALL fields:**
```json
{
  "description": "TODO: Add description" ← Change this!
  "filenameArray": [ ... ],              ← REVIEW THIS! Edit if parser is wrong!
  "notes": [
    "TODO: Add notes",                    ← Change this!
    "",
    "Null blocks (no filename detected):",
    "  Block 0 (line 23): null - TODO: Describe block content", ← Auto-generated!
    "",
    "Total blocks: 11",                   ← Auto-generated
    "Non-null entries: 10",               ← Auto-generated
    "Null entries: 1"                     ← Auto-generated
  ]
}
```

**The generator automatically documents null blocks with line numbers!**

For each `null` entry in `filenameArray`, you'll see:
- `Block 0 (line 23): null - TODO: Describe block content`

**Use the line number to identify what's in the block:**

1. Open the `.md` fixture at the indicated line (READ-ONLY - never edit fixtures!)
2. See what type of block it is (tree structure, bash command, text)
3. Determine if `null` is **correct** or if the parser **should** detect a filename

**Case A: `null` is correct** (no filename to extract)
- Block contains tree structure, bash commands, or plain text
- Update the TODO in `.json` with description:
  - `"Block 0 (line 23): Tree structure (./ root) - null is correct"`
  - `"Block 5 (line 142): Bash installation commands - null is correct"`
  - `"Block 7 (line 198): Plain text explanation - null is correct"`

**Case B: Parser SHOULD detect a filename** (parser bug/gap!)
- Block contains filename pattern that parser misses
- Update `.json` notes AND edit `filenameArray` to reflect expected behavior:

  **Example:**
  ```bash
  # 1. Check line 142 in fixture
  nano tests/fixtures/Model-xyz.md +142
  # See: "Create **src/app.js** with following code:"

  # 2. Parser missed bold path! Edit expected JSON:
  nano tests/expected/Model-xyz.json
  ```

  **Before:**
  ```json
  "filenameArray": [
    ...,
    null,  // Block 5: Parser missed it!
    ...
  ],
  "notes": [
    "Block 5 (line 142): null - TODO: Describe block content"
  ]
  ```

  **After:**
  ```json
  "filenameArray": [
    ...,
    {"basename": "app.js", "fullPath": "src/app.js"},  // Block 5: SHOULD detect!
    ...
  ],
  "notes": [
    "Block 5 (line 142): Bold path **src/app.js** - parser should detect (currently fails!)",
    "TODO: Fix parser - add TERM_EMPHASIS_PATH pattern to constants.js"
  ]
  ```

  **Now the test will FAIL until you fix the parser!**

**Using line numbers for GitHub Issues:**

When you find a parser bug, the line number makes issues precise:

```markdown
**Title:** Parser missing bold path detection

**Pattern:** `**src/app.js**` in prose text not detected

**Fixture:** `tests/fixtures/Model-xyz.md:142` ← Line number!

**Expected:** Block 5 should detect `{basename: "app.js", fullPath: "src/app.js"}`
**Actual:** Block 5 returns `null`

**BNF:** Covered by `<inline-path>` (implementation gap, not grammar change)
**Fix:** Add `TERM_EMPHASIS_PATH` pattern to `constants.js`
```

**CRITICAL:** If the parser currently misses files or detects wrong paths, **edit the `filenameArray`** to reflect what SHOULD be detected. This creates a failing test that will pass once you fix the parser!

**Real-world example workflow:**

```bash
# 1. Generate baseline (parser currently misses `.env`)
node tests/generate-expected.js Mixtral-8x7B-special --save

# Generated baseline shows:
# Block 1: null  ← Parser missed `.env`!

# 2. Edit the expected file to define correct behavior
nano tests/expected/Mixtral-8x7B-special.json

# Change Block 1 from:
#   null
# To:
#   {"basename": ".env", "fullPath": ".env"}

# 3. Run test → FAILS (expected .env, got null)
npm test -- Mixtral-8x7B-special
# ✗ FAILED: Expected .env, got null

# 4. Fix parser (add `.env` to HIGH_CONFIDENCE_FILENAMES)
nano webui/js/chat/markdown/constants.js

# 5. Run test → PASSES
npm test -- Mixtral-8x7B-special
# ✓ PASSED: .env detected correctly
```

**Example of good description and notes:**
```json
{
  "description": "Mixtral-8x7B Tauri project with tree structure and code blocks",
  "filenameArray": [ ... ],
  "notes": [
    "Tests tree parsing with explicit root (./)",
    "Tests nested paths in backend/src/ and frontend/src/",
    "BNF v0.1.3 compatible - no grammar changes needed",
    "Total blocks: 42",
    "Non-null entries: 15"
  ]
}
```

#### Expected Output Format Reference

```json
{
  "description": "Short description of what this fixture tests",
  "filenameArray": [
    null,
    {"basename": "app.js", "fullPath": "src/app.js"},
    {"basename": "config.json", "fullPath": "config.json"},
    null
  ],
  "notes": [
    "Tests TERM_EMPHASIS_PATH token for bold paths **file.js**",
    "Tests tree parsing with explicit root",
    "BNF v0.1.3 compatible - <inline-path> syntax covers this",
    "Implementation-only change, no BNF modification needed",
    "Total blocks: 4",
    "Non-null entries: 2"
  ]
}
```

**Understanding the `filenameArray`:**

The `filenameArray` is the core test assertion - it represents what the parser SHOULD extract from the markdown.

**Array Structure:**
- **One entry per code block** in the markdown (in order of appearance)
- **Index = Block number** (0-based: Block 0, Block 1, Block 2, ...)

**Entry Types:**

1. **`null`** - Block contains **NO filename** to extract
   - Tree structure blocks (` ```\n./\n├── src/\n``` `)
   - Pure text blocks
   - Bash commands/output
   - Code without filename declaration

   **Example:**
   ```markdown
   ```bash
   npm install
   ```
   ```
   → `filenameArray[0]: null`

2. **`{basename, fullPath}`** - Block has **detected filename**
   - `basename`: The filename only (e.g., `"app.js"`)
   - `fullPath`: Full path with directories (e.g., `"src/app.js"`)

   **Example:**
   ```markdown
   `src/app.js`
   ```javascript
   console.log('hello');
   ```
   ```
   → `filenameArray[1]: {"basename": "app.js", "fullPath": "src/app.js"}`

**Real-World Example:**

Given this markdown:
```markdown
Here's the project structure:    ← Block 0
```
./
├── src/
│   └── app.js
```

`src/app.js`                     ← Block 1
```javascript
const app = 'hello';
```

`.env`                           ← Block 2
```makefile
API_KEY=secret
```
```

Expected `filenameArray`:
```json
[
  null,                                           // Block 0: Tree structure
  {"basename": "app.js", "fullPath": "src/app.js"},  // Block 1: Code file
  {"basename": ".env", "fullPath": ".env"}           // Block 2: Dotfile
]
```

**Field explanations:**
- `description`: One-line summary of what pattern this fixture tests
- `filenameArray`: Output from `parseFilenameTokens()` - one entry per code block (see above)
- `notes`: Array of important details about the test case
  - What tokens are tested
  - BNF compliance notes
  - Edge cases or special behaviors
  - Block count validation (Total blocks, Non-null entries)

### 6. Validate Locally

```bash
# Run all tests - MUST pass!
npm test

# Run specific test
npm test -- Qwen3-Next

# Watch mode for development
npm run test:watch
```

**Zero regression rule:** All existing tests must pass. If your change breaks existing tests, the PR will be rejected.

### 7. Submit Pull Request

**PR Checklist:**

- [ ] Fixture added: `tests/fixtures/model-xyz-output.md`
- [ ] Expected output: `tests/expected/model-xyz-output.json`
- [ ] Code changes: `constants.js` (or other files if needed)
- [ ] BNF updated: `docs/grammar/BNF-GRAMMAR.md` (ONLY if grammar change)
- [ ] All tests pass: `npm test` shows X/X passed
- [ ] Description explains pattern and justification

**PR Template:**

```markdown
## Parser Extension: [Brief Description]

**Pattern:** Bold emphasis paths (`**src/app.js**`)
**Model:** Qwen3-Next-80B
**Type:** Implementation-only (no BNF change)

### Changes
- Added `TERM_EMPHASIS_PATH` regex to `constants.js`
- Added test fixture: `Qwen3-Next-emphasis-paths.md`
- All existing tests pass (13/13)

### BNF Validation
- Pattern covered by existing `<inline-path>` syntax ✅
- No BNF modification needed ✅
- Confidence tier: MEDIUM (context-free)

### Test Output
```
$ npm test
✓ PASSED: Qwen3-Next-emphasis-paths.md (15 files detected)
...
Summary: 13/13 passed
```

**Closes:** #42 (if applicable)
```

---

## Architecture Guidelines

### Safe Modification Zones

**✅ Frequently modified (90% of contributions):**
- `constants.js` - Add new regex patterns here
- `tests/fixtures/` - Add new test cases
- `tests/expected/` - Add expected outputs

**⚠️ Modify with caution (9% of contributions):**
- `lexer.js` - Only if new token type needed
- `confidence.js` - Only for confidence tier adjustments
- `parser.js` - Only for resolution logic changes
- `docs/grammar/BNF-GRAMMAR.md` - ONLY after Issue discussion!

**❌ Read-only (internal APIs):**
- `fallback.js` - Frozen fallback logic
- `markdown.js` - DOM integration, not parser logic
- `project-structure.js` - Bulk download, separate concern

### Design Principles

1. **BNF is stable** - Implementation fills gaps, grammar rarely changes
2. **Lexer-first architecture** - Tokenize once, resolve once (don't mix)
3. **Confidence-based resolution** - Highest confidence wins
4. **Zero regressions** - All existing tests must always pass
5. **Real-world fixtures** - Test with actual LLM outputs

### Common Pitfalls

**❌ Don't do this:**
- Change BNF prematurely (check implementation gap first!)
- Modify parser so it violates BNF rules
- Break existing tests to make new pattern work
- Add heuristics that conflict with BNF specification

**✅ Do this:**
- Read BNF first, check if pattern already supported
- Add minimal code to recognize the pattern
- Ensure zero regressions (all tests pass)
- Document edge cases in `tests/expected/*.json` notes

---

## Testing Philosophy

### Why Real-World Fixtures?

We archive actual LLM outputs instead of writing synthetic tests because:

- Real models produce unexpected edge cases
- Patterns evolve as models improve
- Fixtures document real-world usage
- Easy to add coverage as new models emerge

### Test Coverage Strategy

**Current coverage (v0.1.3):**
- 13 filename parser fixtures (diverse model outputs)
- 19 tree parser unit tests (structure parsing)
- **100% pass rate required for PR merge**

**When to add tests:**
- New model output style → Add fixture
- New BNF pattern → Add fixture + unit tests
- Bug fix → Add regression test
- Edge case discovered → Add test case

---

## Other Contributions (Non-Parser)

### UI/UX Improvements

**Files:** `webui/index.html`, `webui/css/styles.css`, `webui/js/chat/ui.js`

**Before modifying:** Read `webui/COMPATIBILITY_NOTES.md` for cross-browser constraints

### API Integration

**File:** `webui/js/api.js`

**Critical:** Maintain OpenAI API compatibility - many servers rely on this!

### Documentation

Always welcome:
- Typo fixes
- Clarifications
- Examples
- Translations

**Keep in sync:** If you change BNF-GRAMMAR.md, update parser-architecture.md accordingly

---

## Getting Help

### Before Opening an Issue

1. **Check BNF:** Does `docs/grammar/BNF-GRAMMAR.md` already support the pattern?
2. **Check architecture:** Read `docs/parser-architecture.md` Appendix A (known gaps)
3. **Check tests:** Look at `tests/expected/*.json` notes for similar patterns
4. **Run tests:** Does `npm test` reveal the issue?

### For Parser Questions

- **Implementation gaps:** Check `docs/parser-architecture.md` Appendix A
- **BNF questions:** Open Issue with "Parser:" prefix
- **Edge cases:** Document in `tests/expected/*.json` notes field

### For General Questions

- **Project overview:** `README.md`
- **Recent changes:** `CHANGELOG.md`
- **Browser compatibility:** `webui/COMPATIBILITY_NOTES.md`

---

## Future: Lite RAG Integration (v0.2.0+)

**⚠️ This workflow may change significantly with Lite RAG!**

Planned capabilities:
- Semantic code search for similar patterns
- Automated fixture generation
- Context-aware parser suggestions
- RAG-powered pattern matching

**This document will be substantially revised when Lite RAG is integrated.**

---

## License & Code of Conduct

**License:** See `LICENSE` file (to be added before public release)

**Code of Conduct:** Be respectful, collaborative, and constructive. We're building this for the community.

---

**Thank you for contributing to nChat! 🚀**

**Remember:** Most parser extensions only need changes to `constants.js` - the BNF grammar is stable by design.
