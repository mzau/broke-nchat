/**
 * Markdown Parser (Lexer-first)
 * Processes token stream to extract filenames in document order.
 * Priority: meta > parenthetical > inline comment > heading/list > keyword/contextual
 */

function toFileResult(pathInfo) {
    if (!pathInfo) return null;
    const fullPath = pathInfo.normalized || pathInfo.value || pathInfo.raw || pathInfo;
    const basename = pathInfo.basename || (typeof fullPath === 'string' ? fullPath.split('/').pop() : '');
    if (!basename) return null;
    return { basename, fullPath };
}

/**
 * Validate extension whitelist for a candidate (BNF Constraint 3)
 * @param {Object} candidate - {basename, extension}
 * @returns {boolean}
 *
 * BNF Constraint 3: extension ∈ KNOWN_EXTENSIONS OR filename ∈ HIGH_CONFIDENCE_FILENAMES
 *
 * Accepts:
 * - Files with known extensions (e.g., .js, .py, .rs)
 * - Files in HIGH_CONFIDENCE_FILENAMES (e.g., package.json, Cargo.toml)
 * - Dotfiles (e.g., .gitignore, .env)
 * - Files starting with known basenames (e.g., Dockerfile.backend, Makefile.prod)
 *
 * Rejects:
 * - Files with unknown extensions (e.g., .xyz, .foo)
 * - Arbitrary extensionless files not in HIGH_CONFIDENCE_FILENAMES (e.g., "README" must be in list)
 */
function validateExtensionWhitelist(candidate) {
    const hasExtension = !!candidate.extension;
    const isKnownExt = hasExtension && window.KNOWN_EXTENSIONS.includes(candidate.extension.toLowerCase());
    const isKnownFilename = window.HIGH_CONFIDENCE_FILENAMES.some(
        known => known.toLowerCase() === candidate.basename.toLowerCase()
    );
    const isDotfile = candidate.basename && candidate.basename.startsWith('.');
    const startsWithKnownBasename = window.KNOWN_BASENAMES_WITHOUT_EXT.some(
        known => candidate.basename.toLowerCase().startsWith(known.toLowerCase())
    );

    // BNF Constraint 3: Must satisfy at least ONE of these conditions
    return isKnownExt || isKnownFilename || isDotfile || startsWithKnownBasename;
}

/**
 * Decide if a candidate filename is acceptable for a block
 * @param {Object} candidate - {source, fullPath, basename, extension, hasColon, afterTermFile}
 * @param {string} blockLanguage
 * @param {string[]} expectedFilenames
 * @returns {boolean}
 */
window.shouldAcceptCandidate = function(candidate, blockLanguage, expectedFilenames = []) {
    if (!candidate) return false;

    // Build context for confidence evaluation
    const context = {
        afterTermFile: !!candidate.afterTermFile,
        inHeading: candidate.source === 'heading',
        inList: candidate.source === 'list',
        expectedFilenames: expectedFilenames
    };

    // HIGH confidence sources: meta, paren, inline (structural markers that don't need context)
    // These bypass evaluateConfidence for efficiency (clear HIGH confidence)
    if (candidate.source === 'meta' || candidate.source === 'paren' || candidate.source === 'inline') {
        // BNF Constraint 3: Validate extension whitelist
        return validateExtensionWhitelist(candidate);
    }

    // MEDIUM confidence sources: emphasis (v0.1.4-beta - inline context, requires extension validation)
    if (candidate.source === 'emphasis') {
        return validateExtensionWhitelist(candidate);
    }

    // All other sources: Use evaluateConfidence() for unified confidence determination
    const confidence = window.evaluateConfidence(
        {
            value: candidate.fullPath,
            extension: candidate.extension,
            hasColon: candidate.hasColon
        },
        context
    );

    // HIGH confidence: Accept if passes extension whitelist
    if (confidence === 'HIGH') {
        return validateExtensionWhitelist(candidate);
    }

    // MEDIUM confidence: Accept if passes extension whitelist (same validation as HIGH)
    if (confidence === 'MEDIUM') {
        return validateExtensionWhitelist(candidate);
    }

    // LOW confidence: Requires extension to match block language (strictest validation)
    // Only applies to keyword sources without explicit markers
    return window.extensionMatchesLanguage(candidate.extension, blockLanguage);
};

/**
 * Resolve the best filename for a code block token based on surrounding context
 * @param {Object} blockToken - TERM_BLOCKSTART token
 * @param {Object} context - {heading, list, keyword, paren}
 * @param {string[]} expectedFilenames
 * @returns {Object|null} {basename, fullPath} or null
 */
window.resolveFilenameForBlock = function(blockToken, context, expectedFilenames = []) {
    const candidates = [];
    const blockLanguage = blockToken.language || 'text';

    // 1) Code fence metadata path
    if (blockToken.pathInfo || blockToken.pathHint) {
        const pathInfo = blockToken.pathInfo || window.normalizePath(blockToken.pathHint);
        if (pathInfo && pathInfo.basename) {
            candidates.push({
                source: 'meta',
                fullPath: pathInfo.normalized,
                basename: pathInfo.basename,
                extension: pathInfo.extension
            });
        }
    }

    // 2) Parenthetical path paired with heading/list
    if (context.paren) {
        const parenInfo = window.normalizePath(context.paren.value || context.paren);
        const headingValue = context.heading ? (context.heading.headingValue || context.heading.value) : null;
        const listValue = context.list ? context.list.value : null;

        const matchesHeading = headingValue && parenInfo && window.pathEndsWith(parenInfo.normalized, headingValue);
        const matchesList = listValue && parenInfo && window.pathEndsWith(parenInfo.normalized, listValue);

        // Only accept if paired with heading/list AND suffix constraint satisfied
        if (parenInfo && (matchesHeading || matchesList)) {
            candidates.push({
                source: 'paren',
                fullPath: parenInfo.normalized,
                basename: parenInfo.basename,
                extension: parenInfo.extension
            });
        }
    }

    // 3) Inline path inside code block
    if (blockToken.inlinePathInfo) {
        candidates.push({
            source: 'inline',
            fullPath: blockToken.inlinePathInfo.value || blockToken.inlinePathInfo.normalized,
            basename: blockToken.inlinePathInfo.basename,
            extension: blockToken.inlinePathInfo.extension
        });
    }

    // 4) Heading/List declarations
    if (context.heading) {
        const headingInfo = window.normalizePath(context.heading.value);
        if (headingInfo && headingInfo.basename) {
            candidates.push({
                source: 'heading',
                fullPath: headingInfo.normalized,
                basename: headingInfo.basename,
                extension: headingInfo.extension || context.heading.extension
            });
        }
    } else if (context.list) {
        const listInfo = window.normalizePath(context.list.value);
        if (listInfo && listInfo.basename) {
            candidates.push({
                source: 'list',
                fullPath: listInfo.normalized,
                basename: listInfo.basename,
                extension: listInfo.extension || context.list.extension,
                hasColon: context.list.hasColon
            });
        }
    }

    // 5) Keyword/contextual filename tokens
    if (context.keyword) {
        const keywordInfo = window.normalizePath(context.keyword.value);
        if (keywordInfo && keywordInfo.basename) {
            candidates.push({
                source: 'keyword',
                fullPath: keywordInfo.normalized,
                basename: keywordInfo.basename,
                extension: keywordInfo.extension || context.keyword.extension,
                hasColon: context.keyword.hasColon,
                afterTermFile: context.keyword.afterTermFile
            });
        }
    }

    // Pick the first acceptable candidate following the priority order above
    for (const candidate of candidates) {
        if (window.shouldAcceptCandidate(candidate, blockLanguage, expectedFilenames)) {
            return toFileResult({
                normalized: candidate.fullPath,
                basename: candidate.basename
            });
        }
    }

    return null;
};

/**
 * Parses token stream to build filename array (in order of code blocks in text)
 * @param {string} text - The markdown text to parse
 * @param {string[]} expectedFilenames - Optional: Filenames/paths from project structure for context-aware parsing
 * @returns {Array<Object|null>} - Array of {basename, fullPath} objects aligned with code blocks
 */
window.parseFilenameTokens = function(text, expectedFilenames = []) {
    const tokens = window.tokenize(text);
    const filenameArray = [];

    let context = {
        heading: null,
        list: null,
        keyword: null,
        paren: null
    };

    for (const token of tokens) {
        if (token.type === 'TERM_HEADING_FILENAME') {
            context.heading = token;
            context.list = null;
            context.keyword = null;
        } else if (token.type === 'LIST_FILENAME') {
            context.list = token;
            context.heading = null;
            context.keyword = null;
        } else if (token.type === 'PAREN_PATH') {
            context.paren = token;
        } else if (token.type === 'TERM_FILE') {
            // Expect TOK_FILENAME to follow
            context.keyword = null;
        } else if (token.type === 'TOK_FILENAME') {
            context.keyword = token;
        } else if (token.type === 'TERM_BLOCKSTART') {
            const fileInfo = window.resolveFilenameForBlock(token, context, expectedFilenames);
            filenameArray.push(fileInfo);

            // Reset context after each block
            context = {
                heading: null,
                list: null,
                keyword: null,
                paren: null
            };
        }
    }

    // Collapse duplicate top-level prefixes (e.g., "backend/backend/src/index.ts" → "backend/src/index.ts")
    // This is a pragmatic cleanup for LLM outputs that accidentally duplicate folder names.
    filenameArray.forEach(item => {
        if (!item || !item.fullPath) return;

        // Skip Windows drive paths (e.g., C:/...)
        if (item.fullPath.includes(':')) return;

        const withoutLeadingSlash = item.fullPath.replace(/^\/+/, '');
        const segments = withoutLeadingSlash.split('/').filter(Boolean);
        if (segments.length < 2) return;

        const first = segments[0];
        const second = segments[1];

        if (first && first === second && window.KNOWN_TOP_LEVEL_DIRS && window.KNOWN_TOP_LEVEL_DIRS.has(first)) {
            const collapsed = [first, ...segments.slice(2)].join('/');
            item.fullPath = collapsed;
            item.basename = collapsed.split('/').pop();
        }
    });

    // Strip a common leading root segment ONLY if it makes sense
    // Heuristic: Only strip if there's structural diversity underneath (multiple top-level dirs)

    // Check for mixed structure: files with and without directory prefixes
    const hasRootLevelFiles = filenameArray.some(item =>
        item && item.fullPath && !item.fullPath.includes('/')
    );

    const pathsWithDirs = filenameArray
        .filter(item => item && item.fullPath && item.fullPath.includes('/'));

    if (pathsWithDirs.length > 0) {
        // Extract first path segment (potential root)
        const firstSegments = pathsWithDirs.map(item =>
            item.fullPath.replace(/^\//, '').split('/')[0]
        );

        const candidateRoot = firstSegments[0];
        const allShareRoot = firstSegments.every(seg => seg === candidateRoot);

        if (allShareRoot && !candidateRoot.includes(':')) {
            // Never strip well-known top-level directories like "src", "client", "backend".
            // Models often output only "src/..." paths; stripping would flatten the tree incorrectly.
            if (window.KNOWN_TOP_LEVEL_DIRS && window.KNOWN_TOP_LEVEL_DIRS.has(candidateRoot)) {
                return filenameArray;
            }

            // If we have BOTH root-level files AND files in a subdirectory,
            // the subdirectory is likely a real folder (client/, backend/), not a project name
            // Example: Dockerfile + client/package.json → Don't strip "client/"
            if (hasRootLevelFiles) {
                return filenameArray;  // Mixed structure → Don't strip
            }

            // Check structural diversity: How many different second-level dirs exist?
            // Count unique second-level segments, but distinguish between files and directories
            const secondLevelDirs = new Set();
            const hasDeepPaths = pathsWithDirs.some(item => {
                const parts = item.fullPath.replace(/^\//, '').split('/');
                return parts.length > 2;  // At least 3 levels: root/subdir/file
            });

            pathsWithDirs.forEach(item => {
                const parts = item.fullPath.replace(/^\//, '').split('/');
                // Only count second-level segments for paths with actual subdirectories (3+ parts)
                // This prevents counting "client/file.js" as having a "file.js" subdirectory
                if (parts.length > 2) {
                    secondLevelDirs.add(parts[1]);
                }
            });

            // Strip the common root if:
            // 1. We have structural diversity (>= 2 different subdirectories), OR
            // 2. All paths have the same prefix AND there are deep paths (indicating project structure)
            // Example: task-manager/backend/..., task-manager/frontend/... → Strip "task-manager"
            // Example: task-manager/package.json, task-manager/backend/src/... → Strip "task-manager"
            // Counter: client/file1.js, client/file2.js → Don't strip (shallow, no diversity)
            const hasStructuralDiversity = secondLevelDirs.size >= 2 || hasDeepPaths;

            if (hasStructuralDiversity) {
                // Strip the common root prefix
                filenameArray.forEach(item => {
                    if (item && item.fullPath) {
                        const withoutLeadingSlash = item.fullPath.replace(/^\//, '');
                        if (withoutLeadingSlash.startsWith(candidateRoot + '/')) {
                            const stripped = withoutLeadingSlash.substring(candidateRoot.length + 1);
                            item.fullPath = stripped;
                            item.basename = stripped.split('/').pop();
                        }
                    }
                });
            }
        }
    }

    return filenameArray;
};

/**
 * Parse filename from code block content (first-line comment patterns)
 * This remains as a BNF-aligned wrapper for the fallback detection logic
 */
window.parseCodeBlockWithComment = function(codeContent, blockLanguage, projectRoots = []) {
    return window.detectFilenameFromCode(codeContent, blockLanguage, projectRoots);
};
