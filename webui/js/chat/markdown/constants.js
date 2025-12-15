/**
 * Markdown Parser Constants
 * Token patterns, extension mappings, and allowlists
 */

// ============================================
// EXTENSION AND FILENAME ALLOWLISTS
// ============================================

/**
 * Known file extensions for filename detection
 * Extensions not in this list are rejected to avoid false positives
 */
window.KNOWN_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'go', 'rs', 'php', 'rb',
    'swift', 'kt', 'c', 'cpp', 'h', 'hpp', 'cs', 'html', 'css', 'scss', 'json', 'yaml',
    'yml', 'toml', 'xml', 'sql', 'sh', 'bash', 'md', 'txt', 'r', 'scala', 'perl', 'lua', 'dart', 'vue',
    'conf', 'config', 'ini', 'properties', 'cfg',
    // Asset file extensions (v0.1.3-patch)
    'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp',           // Images
    'woff', 'woff2', 'ttf', 'otf', 'eot',                                // Fonts
    'mp3', 'mp4', 'webm', 'ogg', 'wav',                                  // Media
    'pdf'];                                                              // Documents

/**
 * Helper: Build extension alternation pattern for regex (DRY - Single Source of Truth)
 * Returns: "(js|jsx|ts|...|cfg)"
 */
window.getExtensionPattern = function() {
    return '(' + window.KNOWN_EXTENSIONS.join('|') + ')';
};

/**
 * Known basenames without extensions (case-insensitive)
 * Examples: Makefile, Dockerfile, Cargo
 */
window.KNOWN_BASENAMES_WITHOUT_EXT = [
    'Cargo',      // Rust: Cargo.toml, Cargo.lock
    'Makefile',   // Make
    'Dockerfile', // Docker
    'Rakefile',   // Ruby
    'Gemfile',    // Ruby
    'Procfile',   // Heroku
    'Vagrantfile' // Vagrant
];

/**
 * High-confidence filenames: Always accept regardless of block language
 * These are well-known config/manifest files that models often mislabel
 */
window.HIGH_CONFIDENCE_FILENAMES = [
    // Rust
    'Cargo.toml', 'Cargo.lock',
    // JavaScript/Node
    'package.json', 'package-lock.json', 'tsconfig.json', 'webpack.config.js',
    'vite.config.js', 'vite.config.ts', 'next.config.js', 'nuxt.config.js',
    // Python
    'setup.py', 'requirements.txt', 'pyproject.toml', 'setup.cfg',
    // Ruby
    'Gemfile', 'Gemfile.lock', 'Rakefile',
    // Go
    'go.mod', 'go.sum',
    // Docker/DevOps
    'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
    '.dockerignore', '.gitignore', '.gitattributes', '.env',
    // Build/Config
    'Makefile', 'CMakeLists.txt', '.editorconfig', '.prettierrc',
    'eslint.config.js', '.eslintrc.json', '.eslintrc.js'
];

/**
 * Extension to language mapping
 * Maps file extensions to valid code fence language identifiers
 * Used for LOW confidence filename verification
 */
window.EXTENSION_TO_LANGUAGE = {
    'js': ['javascript', 'js', 'node'],
    'jsx': ['javascript', 'jsx', 'react'],
    'ts': ['typescript', 'ts'],
    'tsx': ['typescript', 'tsx', 'react'],
    'py': ['python', 'py'],
    'java': ['java'],
    'go': ['go', 'golang'],
    'rs': ['rust', 'rs'],
    'php': ['php'],
    'rb': ['ruby', 'rb'],
    'swift': ['swift'],
    'kt': ['kotlin', 'kt'],
    'c': ['c'],
    'cpp': ['cpp', 'c++', 'cxx'],
    'h': ['c', 'cpp', 'c++'],
    'hpp': ['cpp', 'c++'],
    'cs': ['csharp', 'cs', 'c#'],
    'html': ['html', 'htm'],
    'css': ['css'],
    'scss': ['scss', 'sass'],
    'json': ['json'],
    'yaml': ['yaml', 'yml'],
    'yml': ['yaml', 'yml'],
    'toml': ['toml'],
    'xml': ['xml'],
    'sql': ['sql'],
    'sh': ['bash', 'sh', 'shell'],
    'bash': ['bash', 'sh', 'shell'],
    'md': ['markdown', 'md'],
    'txt': ['text', 'txt', 'plain'],
    'r': ['r'],
    'scala': ['scala'],
    'perl': ['perl', 'pl'],
    'lua': ['lua'],
    'dart': ['dart'],
    'vue': ['vue'],
    'ini': ['ini', 'dosini']
};

/**
 * Detect language from file path extension (ADR-005 File-State-API)
 * @param {string} filepath - File path (e.g., "src/app.js" or "app.js")
 * @returns {string} Language identifier (e.g., "javascript", "python", "text")
 */
window.detectLanguageFromPath = function(filepath) {
    if (!filepath) return 'text';

    // Extract basename from path
    const parts = filepath.split('/');
    const filename = parts[parts.length - 1];

    // Dotfiles without extension (e.g., .gitignore, .env)
    if (filename.startsWith('.') && !filename.includes('.', 1)) {
        return 'text';
    }

    // Extract extension
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1 || lastDot === 0) return 'text';

    const ext = filename.substring(lastDot + 1).toLowerCase();

    // Lookup in EXTENSION_TO_LANGUAGE map (returns first language from array)
    const languages = window.EXTENSION_TO_LANGUAGE[ext];
    return languages ? languages[0] : 'text';
};

// ============================================
// PATH NORMALIZATION
// ============================================

/**
 * Check if a full path ends with a specific tail (case-insensitive, slash-normalized)
 * Used for validating BNF Constraint 2: Parenthetical path must end with heading/list value
 * @param {string} fullPath - The full path to check (e.g., "src/lib.rs")
 * @param {string} tail - The expected ending (e.g., "main.rs")
 * @returns {boolean}
 */
window.pathEndsWith = function(fullPath, tail) {
    if (!fullPath || !tail) return false;
    const normalize = (value) => value.replace(/\\/g, '/').toLowerCase();
    return normalize(fullPath).endsWith(normalize(tail));
};

/**
 * Normalize a path string and capture metadata
 * - Converts backslashes to forward slashes
 * - Strips leading "./"
 * - Collapses duplicate slashes
 * - Records absolute/Windows drive hints
 * @param {string} rawPath
 * @returns {Object|null} {raw, normalized, basename, extension, isAbsolute, isWindowsDrive, hasRoot}
 */
window.normalizePath = function(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return null;

    let raw = rawPath.trim();

    // Strip wrapping quotes/backticks if provided in meta fields
    raw = raw.replace(/^["'`]/, '').replace(/["'`]$/, '');

    const isWindowsDrive = /^[A-Za-z]:/.test(raw);

    // Unify slashes and remove leading "./"
    let normalized = raw.replace(/\\\\/g, '\\'); // collapse escaped backslashes
    normalized = normalized.replace(/\\/g, '/');
    normalized = normalized.replace(/^\.\/+/, '');
    normalized = normalized.replace(/\/{2,}/g, '/');

    // Remove trailing slash (unless root "/")
    if (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }

    // Normalize Windows drive delimiter
    if (isWindowsDrive) {
        normalized = normalized.replace(/^([A-Za-z]):\/?/, '$1:/');
    }

    const isAbsolute = normalized.startsWith('/') || isWindowsDrive;
    const hasRoot = normalized.startsWith('/');

    const parts = normalized.split('/');
    const basename = parts[parts.length - 1] || '';

    // Detect known basenames without extension
    const isKnownBasename = window.KNOWN_BASENAMES_WITHOUT_EXT.some(
        known => known.toLowerCase() === basename.toLowerCase()
    );

    let extension = '';
    if (!isKnownBasename) {
        const lastDot = basename.lastIndexOf('.');
        if (lastDot > 0 && lastDot < basename.length - 1) {
            extension = basename.slice(lastDot + 1);
        }
    }

    return {
        raw,
        normalized,
        basename,
        extension,
        isAbsolute,
        isWindowsDrive,
        hasRoot
    };
};

// ============================================
// TOKEN PATTERNS (Lexer Rules)
// ============================================

/**
 * Token pattern definitions for lexer
 * Each pattern has:
 * - regex: Regular expression to match
 * - extract: Function to extract token data from match
 * - length: Function to calculate match length
 */
window.TOKEN_PATTERNS = {
    // Terminal: "File:" or "Filename:" (case insensitive, with/without markdown bold)
    // Also matches numbered lists: "1. ", "2. ", etc.
    TERM_FILE: [
        { regex: /\*\*File\s*:\s*/i, length: (m) => m[0].length },
        { regex: /\*\*Filename\s*:\s*/i, length: (m) => m[0].length },
        { regex: /File\s*:\s*/i, length: (m) => m[0].length },
        { regex: /Filename\s*:\s*/i, length: (m) => m[0].length }
    ],

    // List/bullet filenames (e.g., "- src/api/server.ts", "1) main.rs")
    // BNF v0.1.3: Supports integrated parenthetical paths with optional description
    // Format: "- listValue (parenPath) - description" or "1. listValue (parenPath) : description"
    // NOTE: Use [ \t]+ instead of \s+ to avoid matching newlines (prevents false matches with "---" horizontal rules)
    LIST_FILENAME: [
        {
            regex: /^(?:[-*][ \t]+|\d+[.)][ \t]+)([^\n(]+?)(?:\s*\(([^)]+)\))?(?:\s*(?:[-:]|[-:]\s+).*)?$/m,
            extract: (m) => {
                let listValue = m[1].trim();
                let parentheticalPath = m[2] ? m[2].trim() : null;

                // BNF v0.1.4: Strip optional emphasis markers (**, *, __, _) from list filenames
                // Examples: 1. **file.js**, - *path/to/file*, 2. _config.yml_, 3. __main.py__
                listValue = listValue.replace(/^\*\*(.+?)\*\*$|^\*(.+?)\*$|^__(.+?)__$|^_(.+?)_$/, '$1$2$3$4');
                if (parentheticalPath) {
                    parentheticalPath = parentheticalPath.replace(/^\*\*(.+?)\*\*$|^\*(.+?)\*$|^__(.+?)__$|^_(.+?)_$/, '$1$2$3$4');
                }

                const listInfo = window.normalizePath(listValue);

                if (!listInfo || !listInfo.basename) return null;

                // BNF Constraint 2: If parenthetical path present, it MUST end with list value
                if (parentheticalPath) {
                    const parenInfo = window.normalizePath(parentheticalPath);
                    if (!parenInfo) return null;

                    // Validate suffix constraint
                    if (!window.pathEndsWith(parenInfo.normalized, listInfo.normalized)) {
                        return null; // Reject - suffix constraint violated
                    }

                    // Valid parenthetical path - use it
                    const isKnownBasename = window.KNOWN_BASENAMES_WITHOUT_EXT.some(
                        known => known.toLowerCase() === parenInfo.basename.toLowerCase()
                    );
                    const isDotfile = parenInfo.basename.startsWith('.');
                    const hasExtension = !!parenInfo.extension;

                    if (!hasExtension && !isKnownBasename && !isDotfile) {
                        return null;
                    }

                    return {
                        value: parenInfo.normalized,
                        basename: parenInfo.basename,
                        extension: parenInfo.extension,
                        hasColon: false,
                        source: 'list',
                        parenthetical: parenInfo.normalized,
                        listValue: listInfo.normalized
                    };
                }

                // No parenthetical path - use list value directly
                const isKnownBasename = window.KNOWN_BASENAMES_WITHOUT_EXT.some(
                    known => known.toLowerCase() === listInfo.basename.toLowerCase()
                );
                const isDotfile = listInfo.basename.startsWith('.');
                const hasExtension = !!listInfo.extension;

                // Require some filename signal to avoid capturing arbitrary bullets
                if (!hasExtension && !isKnownBasename && !isDotfile) {
                    return null;
                }

                return {
                    value: listInfo.normalized,
                    basename: listInfo.basename,
                    extension: listInfo.extension,
                    hasColon: /:\s*$/.test(m[0]),
                    source: 'list',
                    parenthetical: null,
                    listValue: listInfo.normalized
                };
            },
            length: (m) => m[0].length
        }
    ],

    // Parenthetical paths, e.g., "(backend/src/db.ts)" or "(C:\\proj\\app\\Program.cs)"
    PAREN_PATH: [
        {
            regex: /\(([^()\n]*[\\/][^()\n]+|[^()\n]*\.\w+[^()]*)\)/,
            extract: (m) => {
                const pathInfo = window.normalizePath(m[1]);
                if (!pathInfo || !pathInfo.basename) return null;

                return {
                    value: pathInfo.normalized,
                    basename: pathInfo.basename,
                    extension: pathInfo.extension,
                    source: 'paren'
                };
            },
            length: (m) => m[0].length
        }
    ],

    // Markdown heading with filename: ## Cargo.toml or ## src/main.rs
    // Extract the entire heading as a combined TERM_FILE + TOK_FILENAME token
    TERM_HEADING_FILENAME: [
        {
            // Pattern 0: Parenthetical-only heading (edge case: no heading value, only paren)
            // Format: "#### (backend/src/index.ts)"
            regex: /^#{1,6}\s*\(([^)]+)\)\s*$/m,
            extract: (m) => {
                const parenPath = m[1].trim();
                const pathInfo = window.normalizePath(parenPath);
                if (!pathInfo || !pathInfo.basename) return null;

                return {
                    value: pathInfo.normalized,
                    basename: pathInfo.basename,
                    extension: pathInfo.extension,
                    isHeading: true,
                    source: 'heading',
                    parenthetical: pathInfo.normalized,
                    headingValue: null // No heading value, only parenthetical
                };
            },
            length: (m) => m[0].length
        },
        {
            // Pattern 1a: Backtick-wrapped DOTFILES in headings
            regex: /^#{1,6}\s+[^\n`]*?`((?:[\w\-]+\/)*(\.\w[\w\-]*))`/m,
            extract: (m) => {
                const pathInfo = window.normalizePath(m[1].replace(/\\/g, ''));
                if (!pathInfo) return null;

                return {
                    value: pathInfo.normalized,
                    basename: pathInfo.basename,
                    extension: pathInfo.extension || pathInfo.basename.substring(1),
                    isHeading: true,
                    source: 'heading'
                };
            },
            length: (m) => m[0].length
        },
        {
            // Pattern 1b: Backtick-wrapped regular files with extension
            regex: /^#{1,6}\s+[^\n`]*?`([\w\-\.\/\\]+\.(\w+))`/m,
            extract: (m) => {
                const pathInfo = window.normalizePath(m[1]);
                if (!pathInfo) return null;
                return {
                    value: pathInfo.normalized,
                    basename: pathInfo.basename,
                    extension: pathInfo.extension || m[2],
                    isHeading: true,
                    source: 'heading'
                };
            },
            length: (m) => m[0].length
        },
        {
            // Pattern 1.5: Emphasis-wrapped files in headings (BNF v0.1.4)
            // Examples: ## **file.js**, ### *path/to/file.ts*, #### _config.yml_, ##### __main.py__
            regex: /^#{1,6}\s+(?:\*\*|__)([\w\-\.\/\\]+\.(\w+))(?:\*\*|__)(?:\s*\(([^\)]+)\))?(?:\s*[—:\-].*)?$/m,
            extract: (m) => {
                let filename = m[1].replace(/\\/g, '');
                let parentheticalPath = m[3] ? m[3].trim() : null;

                if (parentheticalPath) {
                    parentheticalPath = parentheticalPath.replace(/^\*\*(.+?)\*\*$|^\*(.+?)\*$|^__(.+?)__$|^_(.+?)_$/, '$1$2$3$4');
                }

                const headingInfo = window.normalizePath(filename);

                if (parentheticalPath) {
                    const parenInfo = window.normalizePath(parentheticalPath);
                    if (!parenInfo || !headingInfo) return null;

                    if (!window.pathEndsWith(parenInfo.normalized, headingInfo.normalized)) {
                        return null;
                    }

                    return {
                        value: parenInfo.normalized,
                        basename: parenInfo.basename,
                        extension: parenInfo.extension || m[2],
                        isHeading: true,
                        source: 'heading',
                        parenthetical: parenInfo.normalized,
                        headingValue: headingInfo.normalized
                    };
                }

                if (!headingInfo) return null;

                return {
                    value: headingInfo.normalized,
                    basename: headingInfo.basename,
                    extension: headingInfo.extension || m[2],
                    isHeading: true,
                    source: 'heading'
                };
            },
            length: (m) => m[0].length
        },
        {
            // Pattern 1.6: Single emphasis-wrapped files in headings (*path*, _path_)
            regex: /^#{1,6}\s+(?:\*|_)([\w\-\.\/\\]+\.(\w+))(?:\*|_)(?:\s*\(([^\)]+)\))?(?:\s*[—:\-].*)?$/m,
            extract: (m) => {
                let filename = m[1].replace(/\\/g, '');
                let parentheticalPath = m[3] ? m[3].trim() : null;

                if (parentheticalPath) {
                    parentheticalPath = parentheticalPath.replace(/^\*\*(.+?)\*\*$|^\*(.+?)\*$|^__(.+?)__$|^_(.+?)_$/, '$1$2$3$4');
                }

                const headingInfo = window.normalizePath(filename);

                if (parentheticalPath) {
                    const parenInfo = window.normalizePath(parentheticalPath);
                    if (!parenInfo || !headingInfo) return null;

                    if (!window.pathEndsWith(parenInfo.normalized, headingInfo.normalized)) {
                        return null;
                    }

                    return {
                        value: parenInfo.normalized,
                        basename: parenInfo.basename,
                        extension: parenInfo.extension || m[2],
                        isHeading: true,
                        source: 'heading',
                        parenthetical: parenInfo.normalized,
                        headingValue: headingInfo.normalized
                    };
                }

                if (!headingInfo) return null;

                return {
                    value: headingInfo.normalized,
                    basename: headingInfo.basename,
                    extension: headingInfo.extension || m[2],
                    isHeading: true,
                    source: 'heading'
                };
            },
            length: (m) => m[0].length
        },
        {
            // Pattern 2: Normal files with extension (and paths): src/main.rs, Cargo.toml
            // Allows optional parenthetical path and optional description after em-dash
            regex: /^#{1,6}\s+(?:\d+\.\s+)?(?!\/)([\w\-\.\/\\]+\.(\w+))(?:\s*\(([^\)]+)\))?(?:\s*[—:\-].*)?$/m,
            extract: (m) => {
                let filename = m[1].replace(/\\/g, '');
                let parentheticalPath = m[3] ? m[3].trim() : null;

                if (parentheticalPath) {
                    parentheticalPath = parentheticalPath.replace(/^\*\*(.+?)\*\*$|^\*(.+?)\*$|^__(.+?)__$|^_(.+?)_$/, '$1$2$3$4');
                }

                const headingInfo = window.normalizePath(filename);

                // BNF Constraint 2: If parenthetical path present, it MUST end with heading value
                if (parentheticalPath) {
                    const parenInfo = window.normalizePath(parentheticalPath);
                    if (!parenInfo || !headingInfo) return null;

                    // Validate suffix constraint
                    if (!window.pathEndsWith(parenInfo.normalized, headingInfo.normalized)) {
                        return null; // Reject - suffix constraint violated
                    }

                    // Valid parenthetical path - use it
                    return {
                        value: parenInfo.normalized,
                        basename: parenInfo.basename,
                        extension: parenInfo.extension || m[2],
                        isHeading: true,
                        source: 'heading',
                        parenthetical: parenInfo.normalized,
                        headingValue: headingInfo.normalized
                    };
                }

                // No parenthetical path - use heading value directly
                if (!headingInfo) return null;
                return {
                    value: headingInfo.normalized,
                    basename: headingInfo.basename,
                    extension: headingInfo.extension || m[2],
                    isHeading: true,
                    source: 'heading',
                    parenthetical: null,
                    headingValue: headingInfo.normalized
                };
            },
            length: (m) => m[0].length
        },
        {
            // Pattern 3: Specific dotfiles (whitelist to avoid false positives)
            regex: /^#{1,6}\s+(?:\d+\.\s+)?(?!\/)(\.(?:gitignore|gitattributes|dockerignore|editorconfig|prettierrc|eslintrc\.js|eslintrc\.json|travis\.yml|env|env\.example))(?:\s*\(([^\)]+)\))?(?:\s*[—:\-].*)?$/mi,
            extract: (m) => {
                const filename = m[1];
                const parentheticalPath = m[2] ? m[2].trim() : null;
                const headingInfo = window.normalizePath(filename);

                const parts = filename.split('.');
                const extension = parts.length > 2 ? parts[parts.length - 1] : parts[1];

                // BNF Constraint 2: If parenthetical path present, it MUST end with heading value
                if (parentheticalPath) {
                    const parenInfo = window.normalizePath(parentheticalPath);
                    if (!parenInfo || !headingInfo) return null;

                    // Validate suffix constraint
                    if (!window.pathEndsWith(parenInfo.normalized, headingInfo.normalized)) {
                        return null; // Reject - suffix constraint violated
                    }

                    // Valid parenthetical path - use it
                    return {
                        value: parenInfo.normalized,
                        basename: parenInfo.basename,
                        extension: extension,
                        isHeading: true,
                        source: 'heading',
                        parenthetical: parenInfo.normalized,
                        headingValue: headingInfo.normalized
                    };
                }

                // No parenthetical path - use heading value directly
                if (!headingInfo) return null;
                return {
                    value: headingInfo.normalized,
                    basename: headingInfo.basename,
                    extension: extension,
                    isHeading: true,
                    source: 'heading',
                    parenthetical: null,
                    headingValue: headingInfo.normalized
                };
            },
            length: (m) => m[0].length
        },
        {
            // Pattern 4: Known basenames without extensions (whitelist)
            regex: /^#{1,6}\s+(?:\d+\.\s+)?(?:(?:[\w\-]+\/)*)?(Dockerfile|Makefile|Cargo|Rakefile|Gemfile|Procfile|Vagrantfile)(?:\s*\(([^\)]+)\))?(?:\s*[—:\-].*)?$/mi,
            extract: (m) => {
                const filename = m[1];
                const parentheticalPath = m[2] ? m[2].trim() : null;
                const headingInfo = window.normalizePath(filename);

                // BNF Constraint 2: If parenthetical path present, it MUST end with heading value
                if (parentheticalPath) {
                    const parenInfo = window.normalizePath(parentheticalPath);
                    if (!parenInfo || !headingInfo) return null;

                    // Validate suffix constraint
                    if (!window.pathEndsWith(parenInfo.normalized, headingInfo.normalized)) {
                        return null; // Reject - suffix constraint violated
                    }

                    // Valid parenthetical path - use it
                    return {
                        value: parenInfo.normalized,
                        basename: parenInfo.basename,
                        extension: filename.toLowerCase(),
                        isHeading: true,
                        source: 'heading',
                        parenthetical: parenInfo.normalized,
                        headingValue: headingInfo.normalized
                    };
                }

                // No parenthetical path - use heading value directly
                if (!headingInfo) return null;
                return {
                    value: headingInfo.normalized,
                    basename: headingInfo.basename,
                    extension: filename.toLowerCase(),
                    isHeading: true,
                    source: 'heading',
                    parenthetical: null,
                    headingValue: headingInfo.normalized
                };
            },
            length: (m) => m[0].length
        }
    ],

    // Token: Filename with extension (with or without backticks)
    TOK_FILENAME: [
        // Backticks WITH colon: `filename.ext`: → HIGH CONFIDENCE
        {
            regex: new RegExp('`([\\w\\-\\.\\/]+\\.' + window.getExtensionPattern() + ')`:\\s*', 'i'),
            extract: (m) => {
                const pathInfo = window.normalizePath(m[1]);
                if (!pathInfo) return null;
                return {
                    value: pathInfo.normalized,
                    basename: pathInfo.basename,
                    extension: pathInfo.extension || m[2],
                    fullMatch: m[0],
                    hasColon: true,
                    source: 'keyword'
                };
            },
            length: (m) => m[0].length
        },
        // filename.ext: (with colon, NO backticks) → HIGH CONFIDENCE
        {
            regex: new RegExp('([\\w\\-\\.\\/]+\\.' + window.getExtensionPattern() + '):\\s*', 'i'),
            extract: (m) => {
                const pathInfo = window.normalizePath(m[1]);
                if (!pathInfo) return null;
                return {
                    value: pathInfo.normalized,
                    basename: pathInfo.basename,
                    extension: pathInfo.extension || m[2],
                    fullMatch: m[0],
                    hasColon: true,
                    source: 'keyword'
                };
            },
            length: (m) => m[0].length
        },
        // With backticks (NO colon): `app.js` or `path/to/app.js`
        {
            regex: /`([\w\-\.\/]+\.(\w+))`/,
            allowStandalone: true, // High-confidence; allowed without preceding "File:"
            extract: (m) => {
                const pathInfo = window.normalizePath(m[1]);
                if (!pathInfo) return null;
                return {
                    value: pathInfo.normalized,
                    basename: pathInfo.basename,
                    extension: pathInfo.extension || m[2],
                    fullMatch: m[0],
                    hasColon: false,
                    source: 'keyword'
                };
            },
            length: (m) => m[0].length
        },
        // Backtick-wrapped dotfiles: `.env`, `.gitignore`, etc.
        {
            regex: /`((?:[\w\-]+\/)*(\.\w[\w\-]*))`/,
            allowStandalone: true, // High-confidence dotfiles allowed standalone
            extract: (m) => {
                const pathInfo = window.normalizePath(m[1]);
                if (!pathInfo) return null;
                const basename = pathInfo.basename;
                // Validate: dotfile must have alphanumeric body after dots
                const body = basename.replace(/^\.+/, '');
                if (!body || !/[A-Za-z0-9]/.test(body)) return null;

                return {
                    value: pathInfo.normalized,
                    basename: basename,
                    extension: basename.substring(1), // Extension is everything after first dot
                    fullMatch: m[0],
                    hasColon: false,
                    source: 'keyword'
                };
            },
            length: (m) => m[0].length
        },
        // Markdown emphasis-wrapped paths: **src/app.js**, *config.json*, _lib/utils.ts_, __path__
        // BNF-GRAMMAR v0.1.4: TERM_EMPHASIS_PATH token (all markdown emphasis markers)
        {
            regex: /\*\*([\w\-\.\/]+\.(\w+))\*\*|\*([\w\-\.\/]+\.(\w+))\*|__([\w\-\.\/]+\.(\w+))__|_([\w\-\.\/]+\.(\w+))_/,
            allowStandalone: true, // MEDIUM confidence - requires extension validation
            extract: (m) => {
                // Group 1,2 for ** variant, Group 3,4 for * variant
                // Group 5,6 for __ variant, Group 7,8 for _ variant
                const pathStr = m[1] || m[3] || m[5] || m[7];
                const ext = m[2] || m[4] || m[6] || m[8];
                if (!pathStr) return null;

                const pathInfo = window.normalizePath(pathStr);
                if (!pathInfo) return null;

                return {
                    value: pathInfo.normalized,
                    basename: pathInfo.basename,
                    extension: pathInfo.extension || ext,
                    fullMatch: m[0],
                    hasColon: false,
                    source: 'emphasis'
                };
            },
            length: (m) => m[0].length
        },
        // Without backticks: app.js or path/to/app.js
        {
            regex: /([\w\-\.\/]+\.(\w+))\b/,
            extract: (m) => {
                const pathInfo = window.normalizePath(m[1]);
                if (!pathInfo) return null;
                return {
                    value: pathInfo.normalized,
                    basename: pathInfo.basename,
                    extension: pathInfo.extension || m[2],
                    fullMatch: m[0],
                    hasColon: false,
                    source: 'keyword'
                };
            },
            length: (m) => m[0].length
        },
        // Dotfiles after TERM_FILE: .env, .gitignore, etc.
        // BNF-GRAMMAR v0.1.3: <filename-token> supports dotfiles
        {
            regex: /(\.\w[\w\-]*)\b/,
            extract: (m) => {
                const basename = m[1];
                const extension = basename.substring(1); // Extension is everything after the dot
                return {
                    value: basename,
                    basename: basename,
                    extension: extension,
                    fullMatch: m[0],
                    hasColon: false,
                    source: 'keyword',
                    requiresTermFile: true // Only valid after TERM_FILE
                };
            },
            length: (m) => m[0].length
        },
        // NEW: Known basenames without extension (only after TERM_FILE)
        // BNF-GRAMMAR v0.1.3: <filename-token> ::= <known-basename>
        {
            regex: /\b(Dockerfile|Makefile|Cargo|Rakefile|Gemfile|Procfile|Vagrantfile)\b/i,
            extract: (m) => {
                const basename = m[1];
                // Normalize casing to match actual file conventions
                const normalizedBasename = basename.charAt(0).toUpperCase() + basename.slice(1).toLowerCase();
                return {
                    value: normalizedBasename,
                    basename: normalizedBasename,
                    extension: normalizedBasename.toLowerCase(), // Use basename as pseudo-extension for validation
                    fullMatch: m[0],
                    hasColon: false,
                    source: 'keyword',
                    requiresTermFile: true // Only valid after TERM_FILE
                };
            },
            length: (m) => m[0].length
        }
    ],

    // Terminal: Code block start ```language (with optional metadata)
    TERM_BLOCKSTART: [
        {
            regex: /^```([^\n]*)/m,  // start of line fence, capture full meta segment
            extract: (m) => {
                const opener = m[1] || '';
                const langMatch = opener.trim().match(/^([\w-]+)/);
                const language = langMatch ? langMatch[1] : 'text';

                // Match metadata key/value pairs for path hints (quoted values may include spaces)
                const metaMatch = opener.match(/\b(?:title|file|filename|path)\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s]+))/i);
                const rawPath = metaMatch ? (metaMatch[1] || metaMatch[2] || metaMatch[3] || metaMatch[4]) : null;
                let pathInfo = rawPath ? window.normalizePath(rawPath) : null;
                // Models may include a leading "/" on relative paths.
                // If the first segment is a known top-level dir (src/, backend/, client/), keep it.
                // Otherwise treat "/<project>/" as a wrapper root and strip the first segment.
                if (pathInfo && pathInfo.hasRoot) {
                    const withoutLeadingSlash = pathInfo.normalized.replace(/^\/+/, '');
                    const segments = withoutLeadingSlash.split('/').filter(Boolean);
                    const firstSegment = segments[0] || '';

                    if (window.KNOWN_TOP_LEVEL_DIRS && window.KNOWN_TOP_LEVEL_DIRS.has(firstSegment)) {
                        pathInfo = window.normalizePath(withoutLeadingSlash);
                    } else if (segments.length > 1) {
                        pathInfo = window.normalizePath(segments.slice(1).join('/'));
                    } else {
                        pathInfo = window.normalizePath(withoutLeadingSlash);
                    }
                }

                return {
                    language: language || 'text',
                    pathHint: pathInfo ? pathInfo.normalized : null,
                    pathInfo: pathInfo
                };
            },
            length: (m) => m[0].length
        }
    ]
};

// ============================================
// ROOT STRIPPING HEURISTICS
// ============================================

/**
 * Known top-level directories that should NEVER be stripped as project roots
 * These are structural directories that appear at the first level of a project
 * Used in synthetic structure generation to distinguish real directories from wrapper roots
 *
 * Example:
 * - src/App.tsx → "src" is a top-level dir, NOT a project root → Don't strip
 * - my-app/src/App.tsx → "my-app" is a wrapper root → Strip it
 */
window.KNOWN_TOP_LEVEL_DIRS = new Set([
    // Source code directories
    'src', 'lib', 'app', 'source', 'code',

    // Build/output directories
    'dist', 'build', 'out', 'public', 'static', 'assets',

    // Architecture directories
    'backend', 'frontend', 'api', 'server', 'client', 'web',

    // Monorepo directories
    'packages', 'apps', 'modules', 'components', 'services',

    // Supporting directories
    'docs', 'documentation',
    'tests', '__tests__', 'test', 'spec', '__specs__',
    'config', 'configs', 'configuration',
    'scripts', 'tools', 'bin', 'utils'
]);
