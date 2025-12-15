/**
 * Fallback Filename Detection
 * Detects filenames from first-line comments when no explicit declaration exists
 * Supports multiple comment syntaxes and path cleanup
 */

/**
 * Detect filename from first line of code (comment patterns)
 * Supports multiple comment syntaxes and direct path declarations
 * @param {string} codeContent - Code block content
 * @param {string} blockLanguage - Language identifier from code fence
 * @param {string[]} projectRoots - Project root names for path cleanup
 * @returns {Object|null} - {basename, fullPath} or null
 */
window.detectFilenameFromCode = function(codeContent, blockLanguage, projectRoots = []) {
    if (!codeContent) return null;

    const firstLine = codeContent.split('\n')[0].trim();

    // Pattern 1: Explicit "filename:" or "file:" keyword
    // Example: # filename: utils.py, // filename: app.js
    const explicitPattern = /^(?:#|\/\/|<!--|\/\*)\s*(?:filename|file)\s*:\s*([\w\-\.\/]+\.\w+)/i;
    let match = firstLine.match(explicitPattern);
    if (match) {
        let fullPath = match[1];
        // Models often prefix relative paths with "/" (e.g., "/src/app.ts").
        // If the first segment is a known top-level dir (src/, backend/, client/), keep it.
        // Otherwise treat "/<project>/" as a wrapper root and strip the first segment.
        if (fullPath.startsWith('/')) {
            const withoutLeadingSlash = fullPath.replace(/^\/+/, '');
            const segments = withoutLeadingSlash.split('/').filter(Boolean);
            const firstSegment = segments[0] || '';
            if (window.KNOWN_TOP_LEVEL_DIRS && window.KNOWN_TOP_LEVEL_DIRS.has(firstSegment)) {
                fullPath = withoutLeadingSlash;
            } else if (segments.length > 1) {
                fullPath = segments.slice(1).join('/');
            } else {
                fullPath = withoutLeadingSlash;
            }
        }
        // Strip project root prefix (e.g., hello-tauri/Cargo.toml → Cargo.toml)
        for (const rootName of projectRoots) {
            if (fullPath.startsWith(rootName + '/')) {
                fullPath = fullPath.substring(rootName.length + 1);
                break;
            }
        }
        return {
            basename: fullPath.split('/').pop(),
            fullPath: fullPath
        };
    }

    // Pattern 2a: DOTFILES in comments (checked first, before regular patterns)
    // Matches: .gitignore, path/to/.env, etc.
    const dotfilePathPatterns = [
        // Python, Ruby, Shell, YAML: # .gitignore or # path/to/.env
        /^#\s+((?:[\w\-]+\/)*(\.\w[\w\-]*))\s*$/,
        // JavaScript, C++, Rust, Java: // .gitignore
        /^\/\/\s+((?:[\w\-]+\/)*(\.\w[\w\-]*))\s*$/,
        // HTML, XML: <!-- .gitignore -->
        /^<!--\s+((?:[\w\-]+\/)*(\.\w[\w\-]*))\s*-->$/,
        // CSS, C, Java: /* .gitignore */
        /^\/\*\s+((?:[\w\-]+\/)*(\.\w[\w\-]*))\s*\*\/$/
    ];

    // Try dotfile patterns first
    for (const pattern of dotfilePathPatterns) {
        match = firstLine.match(pattern);
        if (match) {
            let fullPath = match[1];

            // Models often prefix relative paths with "/" (e.g., "/.env").
            // If the first segment is a known top-level dir (src/, backend/, client/), keep it.
            // Otherwise treat "/<project>/" as a wrapper root and strip the first segment.
            if (fullPath.startsWith('/')) {
                const withoutLeadingSlash = fullPath.replace(/^\/+/, '');
                const segments = withoutLeadingSlash.split('/').filter(Boolean);
                const firstSegment = segments[0] || '';
                if (window.KNOWN_TOP_LEVEL_DIRS && window.KNOWN_TOP_LEVEL_DIRS.has(firstSegment)) {
                    fullPath = withoutLeadingSlash;
                } else if (segments.length > 1) {
                    fullPath = segments.slice(1).join('/');
                } else {
                    fullPath = withoutLeadingSlash;
                }
            }

            // Strip project root prefix
            for (const rootName of projectRoots) {
                if (fullPath.startsWith(rootName + '/')) {
                    fullPath = fullPath.substring(rootName.length + 1);
                    break;
                }
            }

            return {
                basename: fullPath.split('/').pop(),
                fullPath: fullPath
            };
        }
    }

    // Pattern 2b: Direct path in comment (regular files with extension)
    // Supports: #, //, <!-- -->, /* */
    const directPathPatterns = [
        // Python, Ruby, Shell, YAML: # path/to/file.ext
        /^#\s+([\w\-\.\/]+\.(\w+))\s*$/,
        // JavaScript, C++, Rust, Java: // path/to/file.ext
        /^\/\/\s+([\w\-\.\/]+\.(\w+))\s*$/,
        // HTML, XML: <!-- path/to/file.ext -->
        /^<!--\s+([\w\-\.\/]+\.(\w+))\s*-->$/,
        // CSS, C, Java: /* path/to/file.ext */
        /^\/\*\s+([\w\-\.\/]+\.(\w+))\s*\*\/$/
    ];

    for (const pattern of directPathPatterns) {
        match = firstLine.match(pattern);
        if (match) {
            let fullPath = match[1];
            const extension = match[2];

            // Validate extension
            if (window.KNOWN_EXTENSIONS.includes(extension.toLowerCase())) {
                // Models often prefix relative paths with "/" (e.g., "/src/app.ts").
                // If the first segment is a known top-level dir (src/, backend/, client/), keep it.
                // Otherwise treat "/<project>/" as a wrapper root and strip the first segment.
                if (fullPath.startsWith('/')) {
                    const withoutLeadingSlash = fullPath.replace(/^\/+/, '');
                    const segments = withoutLeadingSlash.split('/').filter(Boolean);
                    const firstSegment = segments[0] || '';
                    if (window.KNOWN_TOP_LEVEL_DIRS && window.KNOWN_TOP_LEVEL_DIRS.has(firstSegment)) {
                        fullPath = withoutLeadingSlash;
                    } else if (segments.length > 1) {
                        fullPath = segments.slice(1).join('/');
                    } else {
                        fullPath = withoutLeadingSlash;
                    }
                }

                // Strip project root prefix (e.g., hello-tauri/src/main.rs → src/main.rs)
                // Pattern: project-name/relative/path → relative/path (WITHOUT leading /)
                for (const rootName of projectRoots) {
                    if (fullPath.startsWith(rootName + '/')) {
                        fullPath = fullPath.substring(rootName.length + 1);
                        break; // Only strip first match
                    }
                }

                // Return both basename and full relative path
                return {
                    basename: fullPath.split('/').pop(),
                    fullPath: fullPath
                };
            }
        }
    }

    // Pattern 3: Filename without extension in comment + derive extension from language
    // Example: "# Cargo" in a toml block → Cargo.toml
    // ONLY for whitelisted basenames to avoid false positives
    const noExtPattern = /^(?:#|\/\/|<!--|\/\*)\s+([\w\-]+)\s*(?:-->|\*\/)?\s*$/;
    match = firstLine.match(noExtPattern);
    if (match && blockLanguage) {
        const baseName = match[1];

        // Validate: Only accept known basenames (case-insensitive)
        const isKnownBasename = window.KNOWN_BASENAMES_WITHOUT_EXT.some(
            known => known.toLowerCase() === baseName.toLowerCase()
        );

        if (isKnownBasename) {
            // Find extension for this language
            const extension = Object.keys(window.EXTENSION_TO_LANGUAGE).find(ext =>
                window.EXTENSION_TO_LANGUAGE[ext].includes(blockLanguage.toLowerCase())
            );

            if (extension) {
                const filename = `${baseName}.${extension}`;
                return {
                    basename: filename,
                    fullPath: filename  // No path component for these files
                };
            }
        }
    }

    return null;
};
