// Tree Structure Detection and Parsing
// Handles project structure tree detection, parsing, and synthetic structure generation

/**
 * Detects if a code block contains a project structure (tree view)
 * Looks for tree symbols:
 * - Unicode: ├, └, │, ─ (and their broken UTF-8 variants �)
 * - ASCII: +--, |--, \--, | (common in older terminals or ASCII-safe models)
 */
function isProjectStructure(codeContent) {
    if (!codeContent) return false;

    const lines = codeContent.split('\n');
    if (lines.length < 3) return false; // Need at least 3 lines

    // Pattern: Lines with tree symbols (Unicode, ASCII, or broken UTF-8)
    const treePattern = /[├└│─�]|[+\\|]--/;
    const treeLines = lines.filter(line => treePattern.test(line));

    // Pattern: Lines with file/directory patterns
    const filePattern = /\.(rs|js|jsx|ts|tsx|py|java|go|toml|json|yaml|yml|md|txt|html|css|xml)$/i;
    const directoryPattern = /\/$/;
    const structureLines = lines.filter(line =>
        filePattern.test(line) || directoryPattern.test(line)
    );

    // STRICT CRITERIA to avoid false positives:
    // 1. Primary: At least 50% tree symbols (high confidence)
    const hasTreeSymbols = (treeLines.length / lines.length) >= 0.5;

    // 2. Fallback: At least 5 structure lines + first line looks like root dir
    const firstLineIsRoot = lines.length > 0 && (
        lines[0].endsWith('/') ||
        lines[0].match(/^[\w\-\.]+\/$/)
    );
    const hasFileStructure = structureLines.length >= 5 && firstLineIsRoot;

    return hasTreeSymbols || hasFileStructure;
}

/**
 * Parses project structure from code block into a file tree
 * Returns: { rootName: string, files: [{path: string, name: string}] }
 */
function parseProjectStructure(codeContent) {
    const lines = codeContent.split('\n').filter(l => l.trim()); // DON'T trim yet!
    const files = [];
    let rootName = 'project';
    let currentPath = [];

    // Check if first line is an explicit root directory or starts with tree symbols
    let startIndex = 1; // Default: skip first line (it's the root)
    let hasExplicitRoot = true; // Track if tree has explicit root node

    if (lines.length > 0) {
        const firstLine = lines[0];
        // If first line starts with tree symbols (Unicode or ASCII), there's NO explicit root
        if (/^[├└│─�]|^[+\\|]--/.test(firstLine)) {
            rootName = 'project'; // Default root name
            startIndex = 0; // Parse from first line
            hasExplicitRoot = false; // No explicit root → adjust depth calculation
        } else {
            // First line is the root directory name
            rootName = firstLine.replace(/\/$/, '').trim();
            startIndex = 1; // Skip first line
            hasExplicitRoot = true;
        }
    }

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i]; // Original line with whitespace preserved

        // Remove tree symbols and clean up (Unicode + ASCII variants)
        let cleaned = line
            // First pass: Remove all leading tree symbols (Unicode + ASCII)
            .replace(/^[├└│─�\s+\\|]+/, '')   // Remove all tree symbols and whitespace
            // Second pass: Remove remaining dashes (from +-- or \--)
            .replace(/^-+\s*/, '')             // Remove leading dashes
            .trim();

        if (!cleaned) continue;

        // Strip comments (everything after # or //)
        cleaned = cleaned.replace(/\s*(#|\/\/).*$/, '').trim();

        if (!cleaned) continue;

        // Detect if it's a file or directory
        // Method 1: Explicit slash at end
        let isDirectory = cleaned.endsWith('/');
        let name = cleaned.replace(/\/$/, '');

        // Strip type annotations that LLMs sometimes add (e.g., "src (folder)", ".env (file)")
        // Common patterns: (folder), (file), (dir), (directory), [folder], {folder}
        name = name.replace(/\s*[\(\[\{](folder|file|dir|directory)[\)\]\}]\s*$/i, '').trim();

        // Method 2: No file extension = likely directory
        // (except known files without extension like Dockerfile, Makefile)
        if (!isDirectory && !/\./.test(name)) {
            const knownFilesWithoutExt = ['Dockerfile', 'Makefile', 'Rakefile', 'Gemfile', 'Procfile', 'LICENSE', 'README'];
            isDirectory = !knownFilesWithoutExt.includes(name);
        }

        // Calculate depth from indentation (original line)
        // Strategy: Find the branch symbol (├ or └, or ASCII +-- / \--), count everything before it
        //
        // Example (Unicode):
        //   ├── src/              branchPos=0, before='', │=0, spaces=0 → depth=0
        //   │   ├── main.rs       branchPos=4, before='│   ', │=1, spaces=3 → depth=1
        //   │       ├── lib.rs    branchPos=8, before='│       ', │=1, spaces=7 → depth=2
        //
        // Example (ASCII):
        //   +-- src/              branchPos=0, before='', |=0, spaces=0 → depth=0
        //   |   +-- main.rs       branchPos=4, before='|   ', |=1, spaces=3 → depth=1
        //   |       +-- lib.rs    branchPos=8, before='|       ', |=1, spaces=7 → depth=2
        //
        // Formula: depth = floor(spacesOnly/4) + verticalBars
        // Where spacesOnly = characters before branch symbol, excluding │ or |
        //
        // Note: � (U+FFFD) is the Unicode replacement char for broken UTF-8 box-drawing symbols
        // We treat it as equivalent to └ (common in LLM outputs with encoding issues)
        // Can appear as single � or double �� depending on how many bytes were corrupted

        // Find branch position (Unicode: ├└, ASCII: +-- \-- |--, Broken: �)
        let branchPos = -1;

        // Unicode branches
        branchPos = Math.max(
            line.lastIndexOf('├'),
            line.lastIndexOf('└'),
            line.lastIndexOf('�')  // Broken UTF-8 box-drawing char
        );

        // ASCII branches (if no Unicode found)
        if (branchPos === -1) {
            const asciiMatch = line.match(/[+\\|]--/);
            if (asciiMatch) {
                branchPos = asciiMatch.index;
            }
        }

        let depth = 0;

        if (branchPos >= 0) {
            // Extract everything before the branch symbol
            const beforeBranch = line.substring(0, branchPos);

            // Count vertical bars before branch (Unicode │ or ASCII |)
            // Each vertical bar represents one nesting level
            const unicodeVertical = (beforeBranch.match(/│/g) || []).length;
            const asciiVertical = (beforeBranch.match(/\|/g) || []).length;
            const verticalBars = unicodeVertical + asciiVertical;

            // Count spaces (excluding │, |, ─, and other non-space chars)
            const spacesOnly = beforeBranch.replace(/[│─|]/g, '').length;

            // Adaptive depth formula: handles both compact (3-space) and wide (7-space) trees
            // - Each │ = 1 base level
            // - After accounting for typical spacing (~3 spaces per │), extra spaces indicate deeper nesting
            const baseSpacesPerBar = 3; // Minimum expected spaces per │
            const extraSpaces = Math.max(0, spacesOnly - (verticalBars * baseSpacesPerBar));

            depth = verticalBars + Math.floor(extraSpaces / 4);
        } else {
            // Fallback: No branch symbol found (shouldn't happen in valid trees)
            // Use old logic as safety net
            const leadingSpaces = line.search(/[^\s]/);
            const unicodeVertical = (line.match(/│/g) || []).length;
            const asciiVertical = (line.match(/\|/g) || []).length;
            const verticalBars = unicodeVertical + asciiVertical;
            depth = Math.floor(leadingSpaces / 4) + verticalBars;
        }

        // Update current path based on depth
        currentPath = currentPath.slice(0, depth);
        currentPath.push(name);

        // Only store files (not directories)
        if (!isDirectory) {
            files.push({
                path: currentPath.slice(0, -1).join('/'),
                name: name,
                fullPath: currentPath.join('/')
            });
            // Remove file from currentPath (only directories should remain in path)
            currentPath.pop();
        }
    }

    return { rootName, files };
}

/**
 * Generates a synthetic project structure from code blocks with fullPath data
 * Used when no explicit tree structure is detected, but files have path information
 * @param {HTMLElement} messageElement - The message container to scan for code blocks
 * @returns {{rootName: string, files: Array}} - Same format as parseProjectStructure()
 */
function generateSyntheticProjectStructure(messageElement) {
    if (!messageElement) return null;

    // Find all code blocks with fullPath data
    const codeBlocks = messageElement.querySelectorAll('.code-download-btn[data-fullpath]');

    let filesWithPaths = [];  // let (not const) - will be reassigned during root stripping
    const filesWithoutPaths = [];

    for (const btn of codeBlocks) {
        const fullPath = btn.getAttribute('data-fullpath');
        const filename = btn.getAttribute('data-filename');
        const language = btn.getAttribute('data-language');
        const isStructure = btn.getAttribute('data-is-structure') === 'true';

        if (!filename) continue;

        // Skip tree blocks (WebUI-generated, not actual file content)
        // Tree blocks often have no language tag, so we check data-is-structure attribute
        if (isStructure) {
            console.log('[SYNTHETIC] Skipping tree structure block:', filename);
            continue;
        }

        // Additional check: Skip bash/tree blocks that are project structure themselves
        // These have a .bulk-download-btn sibling (the explicit tree structure button)
        if (language === 'bash' || language === 'tree') {
            const container = btn.closest('.code-block-container');
            if (container && container.nextElementSibling?.classList.contains('bulk-download-container')) {
                console.log('[SYNTHETIC] Skipping project tree block (via language tag):', filename);
                continue;
            }
        }

        if (fullPath && fullPath.trim()) {
            // Parse fullPath into directory path + filename
            const lastSlash = fullPath.lastIndexOf('/');

            if (lastSlash >= 0) {
                // Has directory structure
                const path = fullPath.substring(0, lastSlash);
                const name = fullPath.substring(lastSlash + 1);

                filesWithPaths.push({
                    path: path,
                    name: name,
                    fullPath: fullPath
                });
            } else {
                // Root-level file
                filesWithPaths.push({
                    path: '',
                    name: fullPath,
                    fullPath: fullPath
                });
            }
        } else {
            // No path information - will be placed at root
            filesWithoutPaths.push({
                path: '',
                name: filename,
                fullPath: filename
            });
        }
    }

    // Need at least 2 files with paths to consider this a project structure
    if (filesWithPaths.length < 2) {
        return null;
    }

    /**
     * Determine if a common root prefix should be stripped from synthetic structure
     * Uses 3 criteria to distinguish wrapper roots from legitimate top-level directories
     *
     * @param {string} commonRoot - The common root prefix found in all paths
     * @param {Array} filesWithPaths - Array of file objects with fullPath
     * @returns {boolean} True if the root should be stripped
     */
    function shouldStripRoot(commonRoot, filesWithPaths) {
        // Criterion 1: All paths must start with this root (already verified by caller)

        // Criterion 2: Root must NOT be a known top-level directory
        // Known directories like "src", "backend", "packages" are NEVER project roots
        if (window.KNOWN_TOP_LEVEL_DIRS && window.KNOWN_TOP_LEVEL_DIRS.has(commonRoot)) {
            console.log('[SYNTHETIC] Root is known top-level directory:', commonRoot, '→ NOT stripping');
            return false;
        }

        // Criterion 3: Structural diversity - at least 2 different second-level directories
        // This prevents stripping when all files are under a single subdirectory
        // Example: my-app/src/A.tsx + my-app/src/B.tsx → only "src" under root → DON'T strip
        // Example: my-app/src/A.tsx + my-app/backend/B.go → "src" + "backend" → DO strip
        const secondLevelDirs = new Set();
        filesWithPaths.forEach(f => {
            const parts = f.fullPath.split('/');
            if (parts.length >= 2 && parts[0] === commonRoot) {
                secondLevelDirs.add(parts[1]);
            }
        });

        if (secondLevelDirs.size < 2) {
            console.log('[SYNTHETIC] No structural diversity under root:', commonRoot,
                       `(${secondLevelDirs.size} second-level dir) → NOT stripping`);
            return false;
        }

        // All criteria met → Strip the root
        console.log('[SYNTHETIC] Root meets all criteria for stripping:', commonRoot,
                   `(${secondLevelDirs.size} second-level dirs)`);
        return true;
    }

    // DUPLICATE PREFIX PRE-CHECK (Issue #1)
    // Check FIRST if we have a duplicate prefix pattern (backend/backend/...)
    // If yes, ALWAYS strip the first segment, regardless of KNOWN_TOP_LEVEL_DIRS
    let hasDuplicatePrefixPattern = false;
    if (filesWithPaths.length >= 2) {
        const pathsWithMultipleSegments = filesWithPaths.filter(f => {
            const segments = f.fullPath.split('/');
            return segments.length >= 2;
        });

        if (pathsWithMultipleSegments.length >= 2) {
            hasDuplicatePrefixPattern = pathsWithMultipleSegments.every(f => {
                const segments = f.fullPath.split('/');
                return segments[0] === segments[1];
            });
        }
    }

    // Try to detect a common project root name
    // NOTE: Paths are already stripped by parser.js (max 1 level)
    // We just need to detect the root name for display, NOT strip again
    let rootName = 'project';

    // Strategy 1: Look for common root directories in paths
    // Extract first segment of each fullPath (potential root directory)
    const rootDirs = filesWithPaths
        .map(f => f.fullPath.split('/')[0])
        .filter(d => d);

    if (rootDirs.length > 0) {
        // Count occurrences of each root directory
        const counts = {};
        rootDirs.forEach(dir => {
            counts[dir] = (counts[dir] || 0) + 1;
        });

        // CRITICAL: Root must appear in 100% of files (not just majority)
        // A true project root is the directory that contains ALL files
        const maxCount = Math.max(...Object.values(counts));
        if (maxCount === filesWithPaths.length) {
            const commonRoot = Object.keys(counts).find(k => counts[k] === maxCount);

            if (commonRoot) {
                // Validate: ALL fullPaths must start with commonRoot + '/'
                const prefix = commonRoot + '/';
                const allStartWithRoot = filesWithPaths.every(f =>
                    f.fullPath.startsWith(prefix)
                );

                if (allStartWithRoot) {
                    // Common root detected → Check if it should be stripped
                    // EXCEPTION: If duplicate prefix detected, ALWAYS strip (override heuristic)
                    const shouldStrip = hasDuplicatePrefixPattern || shouldStripRoot(commonRoot, filesWithPaths);

                    if (shouldStrip) {
                        if (hasDuplicatePrefixPattern) {
                            console.log('[SYNTHETIC] Duplicate prefix detected:', commonRoot + '/' + commonRoot, '→ Stripping first segment');
                        }
                        // All 3 criteria met → Strip the root
                        rootName = commonRoot;

                        // Strip root prefix to make paths relative to root
                        filesWithPaths = filesWithPaths.map(f => ({
                            ...f,
                            path: f.path.startsWith(prefix)
                                ? f.path.substring(prefix.length)
                                : f.path,
                            fullPath: f.fullPath.substring(prefix.length)
                        }));

                        console.log('[SYNTHETIC] Stripped root prefix from', filesWithPaths.length, 'file paths');

                        // CRITICAL: Update download button data-fullpath AND labels
                        // Buttons were created with absolute paths, need to strip root prefix
                        for (const btn of codeBlocks) {
                            const originalPath = btn.getAttribute('data-fullpath');
                            if (originalPath && originalPath.startsWith(prefix)) {
                                const strippedPath = originalPath.substring(prefix.length);

                                // Update data-fullpath attribute (for bulk download matching)
                                btn.setAttribute('data-fullpath', strippedPath);

                                // Update button display text (💾 icon + path)
                                const currentText = btn.textContent || '';
                                if (currentText.includes(originalPath)) {
                                    btn.textContent = currentText.replace(originalPath, strippedPath);
                                }

                                console.log('[SYNTHETIC] Updated button:', originalPath, '→', strippedPath);
                            }
                        }
                    } else {
                        // Root should NOT be stripped (known top-level dir or no diversity)
                        console.log('[SYNTHETIC] Keeping root in paths:', commonRoot);
                        rootName = 'project'; // Fallback to generic name
                    }
                } else {
                    // Detected root doesn't prefix all paths → fallback
                    console.log('[SYNTHETIC] Detected root not universal, using "project"');
                }
            }
        } else {
            console.log('[SYNTHETIC] No universal root detected (max coverage:',
                       Math.round(maxCount / filesWithPaths.length * 100) + '%), using "project"');
        }
    }

    // Strategy 2: Look for package.json, Cargo.toml, etc. and use "name" field
    // (Could be implemented later with file content parsing)

    // Combine files with and without paths
    const allFiles = [...filesWithPaths, ...filesWithoutPaths];

    return {
        rootName: rootName,
        files: allFiles,
        synthetic: true // Flag to indicate this is generated, not parsed from tree
    };
}

// Export for use in markdown.js and project-structure.js
window.isProjectStructure = isProjectStructure;
window.parseProjectStructure = parseProjectStructure;
window.generateSyntheticProjectStructure = generateSyntheticProjectStructure;
