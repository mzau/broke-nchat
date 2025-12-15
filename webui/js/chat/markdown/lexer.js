/**
 * Markdown Lexer (Tokenizer)
 * Scans markdown text and produces token stream
 * Handles code block boundary detection and resynchronization
 */

/**
 * Scan text for code block boundaries (one-time pre-scan)
 * Handles resynchronization when nested blocks are detected
 * @param {string} text - The markdown text to scan
 * @returns {Array<{start: number, end: number}>} - Array of block ranges
 */
window.scanBlockRanges = function(text) {
    const blockRanges = []; // [{start: pos, end: pos}, ...]
    const lines = text.split('\n');
    let linePos = 0;
    let inBlock = false;
    let blockStart = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // High confidence opening (with language and optional metadata)
        // Matches: ```js, ```python file:path, ```js title="name", etc.
        if (/^\s*```(\w+)/.test(line)) {
            if (inBlock) {
                // RESYNC: Close previous block, start new one
                blockRanges.push({ start: blockStart, end: linePos });
                blockStart = linePos + line.length + 1; // Start AFTER this line
            } else {
                // Start new block AFTER the opening ``` line
                inBlock = true;
                blockStart = linePos + line.length + 1; // +1 for \n
            }
        }
        // Plain ``` (toggle)
        else if (/^\s*```\s*$/.test(line)) {
            if (inBlock) {
                // Close block (INCLUDING the closing ``` delimiter)
                blockRanges.push({ start: blockStart, end: linePos + line.length });
                inBlock = false;
                blockStart = -1;
            } else {
                // Open block AFTER the opening ``` line
                inBlock = true;
                blockStart = linePos + line.length + 1; // +1 for \n
            }
        }

        linePos += line.length + 1; // +1 for \n
    }

    // If still in block at EOF, close it
    if (inBlock && blockStart !== -1) {
        blockRanges.push({ start: blockStart, end: text.length });
    }

    return blockRanges;
};

/**
 * Extract inline path from the first non-empty comment line in a code block
 * @param {string} blockText
 * @returns {Object|null} path info with {value, basename, extension, source}
 */
function extractInlinePathFromBlock(blockText) {
    if (!blockText) return null;

    // Helper: reject dotfiles that are only dots (e.g., "..."), require alphanumeric after leading dots
    const hasDotfileBody = (basename) => {
        if (!basename || !basename.startsWith('.')) return true;
        const body = basename.replace(/^\.+/, '');
        return body.length > 0 && /[A-Za-z0-9]/.test(body);
    };

    const lines = blockText.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Explicit keyword: filename: or file:
        // BNF-GRAMMAR v0.1.3: <segment-char> allows spaces in paths
        const explicit = trimmed.match(/^(?:#|\/\/|<!--|\/\*|--)\s*(?:filename|file)\s*:\s*([^\s]+(?: [^\s]+)*)/i);
        if (explicit) {
            let pathInfo = window.normalizePath(explicit[1]);

            // Models often prefix relative paths with "/" (e.g., "/src/app.ts").
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

            if (pathInfo && pathInfo.basename) {
                return {
                    value: pathInfo.normalized,
                    basename: pathInfo.basename,
                    extension: pathInfo.extension,
                    source: 'inline'
                };
            }
        }

        // Direct path in a comment
        const direct = trimmed.match(/^(?:#|\/\/|<!--|\/\*|--)\s*([/\\]?[\w .\-\\/]+(?:\.[\w]+)?)/);
        if (direct) {
            // Strip trailing comment closers and description markers
            let rawPath = direct[1].replace(/(-->|\/\*)$/, '').trim();
            rawPath = rawPath.replace(/\s+--$/, '').replace(/\s+—$/, '').replace(/[:\-]+\s*$/, '');

            let pathInfo = window.normalizePath(rawPath);

            // Models often prefix relative paths with "/" (e.g., "/src/app.ts").
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

            if (pathInfo && pathInfo.basename) {
                const isKnownBasename = window.KNOWN_BASENAMES_WITHOUT_EXT.some(
                    known => known.toLowerCase() === pathInfo.basename.toLowerCase()
                );
                const isDotfile = pathInfo.basename.startsWith('.');
                if (isDotfile && !hasDotfileBody(pathInfo.basename)) {
                    // Ignore degenerate dot tokens like "..."
                    continue;
                }
                if (pathInfo.extension || isKnownBasename || isDotfile) {
                    return {
                        value: pathInfo.normalized,
                        basename: pathInfo.basename,
                        extension: pathInfo.extension,
                        source: 'inline'
                    };
                }
            }
        }

        // Only consider the first non-empty line
        break;
    }

    return null;
}

/**
 * Tokenizes text into array of recognized tokens
 * Stateful: Only scans TOK_FILENAME after TERM_FILE
 * Skips content inside code blocks to avoid false positives
 * @param {string} text - The markdown text to tokenize
 * @returns {Array<Token>} - Array of tokens in document order
 */
window.tokenize = function(text) {
    const tokens = [];
    let pos = 0;
    let blockIndex = 0;
    let expectFilename = false; // State: expecting filename after TERM_FILE

    // Pre-scan for code block boundaries
    const blockRanges = window.scanBlockRanges(text);

    // Helper: Check if position is inside any code block
    function isInsideCodeBlock(position) {
        return blockRanges.some(range => position >= range.start && position <= range.end);
    }

    // Main tokenization loop
    while (pos < text.length) {
        let matched = false;

        // Check if we're inside a code block
        const inCodeBlock = isInsideCodeBlock(pos);

        // Determine which token types to scan based on state
        // Scan order: headings/list/paren first, then filenames, keywords, block starts
        const tokensToScan = [
            'TERM_HEADING_FILENAME',
            'LIST_FILENAME',
            'PAREN_PATH',
            'TOK_FILENAME',
            'TERM_FILE',
            'TERM_BLOCKSTART'
        ];

        // Try to match each token type at current position
        for (const tokenType of tokensToScan) {
            const patterns = window.TOKEN_PATTERNS[tokenType];
            if (!patterns) continue;

            // Skip matching when inside code blocks to avoid false positives
            if (inCodeBlock) {
                continue;
            }

            for (const patternDef of patterns) {
                const regex = new RegExp(patternDef.regex.source, patternDef.regex.flags);
                regex.lastIndex = pos;

                const match = regex.exec(text.substring(pos));

                if (match && match.index === 0) {
                    const extracted = patternDef.extract ? patternDef.extract(match) : {};

                    // If extractor returns null, treat as non-match
                    if (patternDef.extract && extracted === null) {
                        continue;
                    }

                    const token = { type: tokenType };

                    // Extract additional data if extractor provided
                    if (patternDef.extract && extracted) {
                        Object.assign(token, extracted);

                        // Validate extension for TOK_FILENAME
                        if (tokenType === 'TOK_FILENAME') {
                            const hasExtension = !!token.extension;
                            const isKnownExt = hasExtension && window.KNOWN_EXTENSIONS.includes(token.extension.toLowerCase());
                            const isKnownBasename = window.KNOWN_BASENAMES_WITHOUT_EXT.some(
                                known => known.toLowerCase() === token.basename.toLowerCase()
                            );
                            const startsWithKnownBasename = window.KNOWN_BASENAMES_WITHOUT_EXT.some(
                                known => token.basename.toLowerCase().startsWith(known.toLowerCase())
                            );
                            const isDotfile = token.basename && token.basename.startsWith('.');

                            if (hasExtension && !isKnownExt && !isKnownBasename && !startsWithKnownBasename && !isDotfile) {
                                // Skip unknown extensions (unless it's a known basename, starts with known basename, or dotfile)
                                pos += patternDef.length(match);
                                matched = true;
                                expectFilename = false; // Reset state
                                break;
                            }

                            // Dotfile guard: require body after leading dots
                            if (isDotfile) {
                                const body = token.basename.replace(/^\.+/, '');
                                if (body.length === 0 || !/[A-Za-z0-9]/.test(body)) {
                                    pos += patternDef.length(match);
                                    matched = true;
                                    expectFilename = false;
                                    break;
                                }
                            }

                            // Filter: If NOT expecting filename and NO colon → skip this token
                            // Exception: requiresTermFile flag means this pattern REQUIRES expectFilename
                            const requiresTermFile = !!patternDef.requiresTermFile || !!token.requiresTermFile;
                            const allowStandalone = !!patternDef.allowStandalone;
                            if (!expectFilename && !token.hasColon && !allowStandalone) {
                                // Don't yield, continue scanning
                                pos += patternDef.length(match);
                                matched = true;
                                break;
                            }
                        }
                    }

                    // Add blockIndex for code blocks
                    if (tokenType === 'TERM_BLOCKSTART') {
                        token.blockIndex = blockIndex++;
                    }

                    // Update state
                    if (tokenType === 'TERM_FILE') {
                        expectFilename = true; // Next token should be filename
                    } else if (tokenType === 'TOK_FILENAME') {
                        token.afterTermFile = expectFilename;
                        expectFilename = false; // Filename consumed
                    } else if (tokenType === 'TERM_BLOCKSTART') {
                        expectFilename = false; // Reset on code block
                    }

                    tokens.push(token);
                    pos += patternDef.length(match);
                    matched = true;
                    break;
                }
            }
            if (matched) break;
        }

        if (!matched) {
            pos++; // Skip character
            // Reset expectFilename if we skip too much (e.g., newline after TERM_FILE without filename)
            if (expectFilename && text[pos - 1] === '\n') {
                const nextChars = text.substring(pos, pos + 50);
                // If next line doesn't start with filename-like pattern, reset
                if (!/^[\s]*[\w\-\.\/`]+\.\w+/.test(nextChars)) {
                    expectFilename = false;
                }
            }
        }
    }

    // Post-process: attach inline paths for each code block
    tokens.forEach((token) => {
        if (token.type === 'TERM_BLOCKSTART') {
            const range = blockRanges[token.blockIndex];
            if (!range) return;
            const blockText = text.substring(range.start, range.end);
            const inlinePath = extractInlinePathFromBlock(blockText);
            if (inlinePath) {
                token.inlinePath = inlinePath.value;
                token.inlinePathInfo = inlinePath;
            }
        }
    });

    return tokens;
};
