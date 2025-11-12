// Markdown rendering with intelligent filename detection and download buttons
// Architecture: Lexer → Parser (State Machine) → Filename Map

// ============================================
// 1. LEXIKALISCHE STRUKTUR-DEFINITIONEN
// ============================================

const KNOWN_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'go', 'rs', 'php', 'rb',
    'swift', 'kt', 'c', 'cpp', 'h', 'hpp', 'cs', 'html', 'css', 'scss', 'json', 'yaml',
    'yml', 'xml', 'sql', 'sh', 'bash', 'md', 'txt', 'r', 'scala', 'perl', 'lua', 'dart', 'vue'];

const EXTENSION_TO_LANGUAGE = {
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
    'vue': ['vue']
};

const TOKEN_PATTERNS = {
    // Terminal: "File:" or "Filename:" (case insensitive, with/without markdown bold)
    // Also recognizes Markdown headings with filenames
    TERM_FILE: [
        { regex: /\*\*File\s*:\s*/i, length: (m) => m[0].length },
        { regex: /\*\*Filename\s*:\s*/i, length: (m) => m[0].length },
        { regex: /File\s*:\s*/i, length: (m) => m[0].length },
        { regex: /Filename\s*:\s*/i, length: (m) => m[0].length },
        // Markdown headings: ## 1. filename.ext or ### filename.ext
        { regex: /^#{1,6}\s+(?:\d+\.\s+)?/m, length: (m) => m[0].length }
    ],

    // Token: Filename with extension (with or without backticks)
    TOK_FILENAME: [
        // Special case: filename.ext: (with colon) → HIGH CONFIDENCE
        // Example: "index.html:" or "Let's create constants.js:"
        {
            regex: /([\w\-\.\/]+\.(js|jsx|ts|tsx|py|java|go|rs|php|rb|swift|kt|c|cpp|h|hpp|cs|html|css|scss|json|yaml|yml|xml|sql|sh|bash|md|txt|r|scala|perl|lua|dart|vue)):\s*/i,
            extract: (m) => ({
                value: m[1],
                extension: m[2],
                fullMatch: m[0],
                hasColon: true // Flag for HIGH CONFIDENCE
            }),
            length: (m) => m[0].length
        },
        // With backticks: `app.js` or `path/to/app.js`
        {
            regex: /`([\w\-\.\/]+\.(\w+))`/,
            extract: (m) => ({
                value: m[1],
                extension: m[2],
                fullMatch: m[0],
                hasColon: false
            }),
            length: (m) => m[0].length
        },
        // Without backticks: app.js or path/to/app.js
        {
            regex: /([\w\-\.\/]+\.(\w+))\b/,
            extract: (m) => ({
                value: m[1],
                extension: m[2],
                fullMatch: m[0],
                hasColon: false
            }),
            length: (m) => m[0].length
        }
    ],

    // Terminal: Code block start ```language (must be on own line or after newline)
    TERM_BLOCKSTART: [
        {
            regex: /^```([\w]*)/m,  // ^ = start of line (multiline mode)
            extract: (m) => ({
                language: m[1] || 'text'
            }),
            length: (m) => m[0].length
        }
    ]
};

// ============================================
// 2. LEXER (Token Stream Generator)
// ============================================

/**
 * Tokenizes text into array of recognized tokens
 * Stateful: Only scans TOK_FILENAME after TERM_FILE
 */
function tokenize(text) {
    const tokens = [];
    let pos = 0;
    let blockIndex = 0;
    let expectFilename = false; // State: expecting filename after TERM_FILE

    while (pos < text.length) {
        let matched = false;

        // Determine which token types to scan based on state
        const tokensToScan = ['TOK_FILENAME', 'TERM_FILE', 'TERM_BLOCKSTART'];

        // Try to match each token type at current position
        for (const tokenType of tokensToScan) {
            const patterns = TOKEN_PATTERNS[tokenType];
            if (!patterns) continue;

            for (const patternDef of patterns) {
                const regex = new RegExp(patternDef.regex.source, patternDef.regex.flags);
                regex.lastIndex = pos;

                const match = regex.exec(text.substring(pos));

                if (match && match.index === 0) {
                    const token = { type: tokenType };

                    // Extract additional data if extractor provided
                    if (patternDef.extract) {
                        Object.assign(token, patternDef.extract(match));

                        // Validate extension for TOK_FILENAME
                        if (tokenType === 'TOK_FILENAME') {
                            if (!KNOWN_EXTENSIONS.includes(token.extension.toLowerCase())) {
                                // Skip unknown extensions
                                pos += patternDef.length(match);
                                matched = true;
                                expectFilename = false; // Reset state
                                break;
                            }

                            // Filter: If NOT expecting filename and NO colon → skip this token
                            if (!expectFilename && !token.hasColon) {
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

    return tokens;
}

// ============================================
// 3. PARSER (State Machine)
// ============================================

/**
 * Extension verification: check if filename extension matches block language
 */
function extensionMatchesLanguage(extension, blockLanguage) {
    if (!extension || !blockLanguage) return false;

    const ext = extension.toLowerCase();
    const lang = blockLanguage.toLowerCase();

    const validLanguages = EXTENSION_TO_LANGUAGE[ext] || [];
    return validLanguages.includes(lang);
}

/**
 * Parses token stream to build filename array (in order of code blocks in text)
 * State Machine: IDLE → AFTER_TERM_FILE → HAS_FILENAME → IDLE
 */
function parseFilenameTokens(text) {
    const filenameArray = []; // Array of {filename, language} in order

    let state = 'IDLE';
    let pendingFilename = null;
    let highConfidence = false;

    // DEBUG: Enable to see token stream
    const DEBUG = false;

    for (const token of tokenize(text)) {
        if (DEBUG) {
            console.log(`[${state}] Token:`, token.type, token.value || token.language || '');
        }

        switch (state) {
            case 'IDLE':
                if (token.type === 'TERM_FILE') {
                    state = 'AFTER_TERM_FILE';
                    highConfidence = true;
                } else if (token.type === 'TOK_FILENAME') {
                    pendingFilename = token;
                    state = 'HAS_FILENAME';
                    // filename.ext: (with colon) → HIGH CONFIDENCE
                    highConfidence = token.hasColon || false;
                }
                break;

            case 'AFTER_TERM_FILE':
                if (token.type === 'TOK_FILENAME') {
                    pendingFilename = token;
                    state = 'HAS_FILENAME';
                    // Keep highConfidence = true from TERM_FILE
                } else if (token.type === 'TERM_FILE') {
                    // Another TERM_FILE, stay in this state
                    state = 'AFTER_TERM_FILE';
                } else if (token.type === 'TERM_BLOCKSTART') {
                    // Code block without filename, reset
                    filenameArray.push(null); // No filename for this block
                    state = 'IDLE';
                    highConfidence = false;
                }
                break;

            case 'HAS_FILENAME':
                if (token.type === 'TERM_BLOCKSTART') {
                    // Match! Decide if we accept based on confidence
                    let accept = highConfidence; // High confidence = always accept

                    if (!highConfidence) {
                        // Low confidence = verify extension matches language
                        accept = extensionMatchesLanguage(
                            pendingFilename.extension,
                            token.language
                        );
                    }

                    if (accept) {
                        // Extract filename from path (e.g., "src/app.js" → "app.js")
                        const filename = pendingFilename.value.split('/').pop();
                        filenameArray.push(filename);
                    } else {
                        filenameArray.push(null); // Rejected due to verification
                    }

                    // Reset
                    state = 'IDLE';
                    pendingFilename = null;
                    highConfidence = false;

                } else if (token.type === 'TERM_FILE') {
                    // New TERM_FILE overrides pending filename
                    state = 'AFTER_TERM_FILE';
                    highConfidence = true;
                    pendingFilename = null;

                } else if (token.type === 'TOK_FILENAME') {
                    // New filename overrides previous one
                    pendingFilename = token;
                    // Update confidence: hasColon → HIGH, otherwise keep current
                    if (token.hasColon) {
                        highConfidence = true;
                    }
                    // else: keep current highConfidence value
                }
                break;
        }
    }

    return filenameArray;
}

/**
 * Fallback: Detect filename from first line of code (comment patterns)
 */
function detectFilenameFromCode(codeContent) {
    if (!codeContent) return null;

    const firstLine = codeContent.split('\n')[0].trim();

    // Pattern: # filename: utils.py or // filename: app.js
    const commentPattern = /^(?:#|\/\/|<!--)\s*(?:filename|file)\s*:\s*([\w\-\.]+\.\w+)/i;
    const match = firstLine.match(commentPattern);

    return match ? match[1] : null;
}

/**
 * Adds download buttons to code blocks in rendered markdown
 */
function addDownloadButtonsToCodeBlocks(html, originalText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const codeBlocks = doc.querySelectorAll('pre code');

    // Parse filename tokens ONCE for entire text (returns array in code block order)
    const filenameArray = parseFilenameTokens(originalText);

    codeBlocks.forEach((codeElement, blockIndex) => {
        const preElement = codeElement.parentElement;
        const codeContent = codeElement.textContent;

        // Detect language from class (marked adds language-xxx)
        const languageClass = Array.from(codeElement.classList).find(cls => cls.startsWith('language-'));
        const language = languageClass ? languageClass.replace('language-', '') : 'text';

        // HIGH CONFIDENCE detection only
        let detectedFilename = null;

        // Method 1: Check filename array from forward parsing
        if (blockIndex < filenameArray.length && filenameArray[blockIndex]) {
            detectedFilename = filenameArray[blockIndex];
        }

        // Method 2: Check first line of code (fallback)
        if (!detectedFilename) {
            detectedFilename = detectFilenameFromCode(codeContent);
        }

        // Create download button (only if we have content)
        if (codeContent.trim()) {
            const downloadBtn = doc.createElement('button');
            downloadBtn.className = 'code-download-btn';
            downloadBtn.innerHTML = '💾 Save';
            downloadBtn.setAttribute('data-code', codeContent);
            downloadBtn.setAttribute('data-filename', detectedFilename || '');
            downloadBtn.setAttribute('data-language', language);
            downloadBtn.setAttribute('onclick', `downloadCode(this)`);

            // Add language label + download button container
            const headerDiv = doc.createElement('div');
            headerDiv.className = 'code-block-header';

            const langLabel = doc.createElement('span');
            langLabel.className = 'code-language-label';
            langLabel.textContent = language;

            headerDiv.appendChild(langLabel);
            headerDiv.appendChild(downloadBtn);

            // Wrap pre element in container
            const container = doc.createElement('div');
            container.className = 'code-block-container';
            preElement.parentNode.insertBefore(container, preElement);
            container.appendChild(headerDiv);
            container.appendChild(preElement);
        }
    });

    return doc.body.innerHTML;
}

/**
 * Renders markdown text with code block enhancements
 */
window.renderMarkdown = function(text) {
    if (!text) return '';

    // Configure marked for our use case
    marked.setOptions({
        breaks: true,        // Convert single line breaks to <br>
        gfm: true,          // GitHub Flavored Markdown
        headerIds: false,   // Don't add IDs to headers
        mangle: false       // Don't mangle email addresses
    });

    try {
        const rendered = marked.parse(text);
        // Add download buttons to code blocks
        return addDownloadButtonsToCodeBlocks(rendered, text);
    } catch (error) {
        console.error('Markdown rendering error:', error);
        // Fallback: just escape HTML and convert newlines
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
    }
};

/**
 * Downloads code content as a file using File System Access API or fallback
 */
window.downloadCode = async function(buttonElement) {
    const code = buttonElement.getAttribute('data-code');
    const suggestedFilename = buttonElement.getAttribute('data-filename');
    const language = buttonElement.getAttribute('data-language');

    if (!code) {
        console.error('No code content found');
        return;
    }

    // Determine file extension from language if no filename suggested
    const extensionMap = {
        'python': 'py',
        'javascript': 'js',
        'typescript': 'ts',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'csharp': 'cs',
        'go': 'go',
        'rust': 'rs',
        'php': 'php',
        'ruby': 'rb',
        'swift': 'swift',
        'kotlin': 'kt',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'yaml': 'yaml',
        'yml': 'yml',
        'xml': 'xml',
        'sql': 'sql',
        'bash': 'sh',
        'shell': 'sh',
        'markdown': 'md',
        'text': 'txt'
    };

    // Use suggested filename if high confidence, otherwise use default with extension
    const extension = extensionMap[language] || 'txt';
    let filename = suggestedFilename;
    if (!filename || filename.trim() === '') {
        filename = 'download.' + extension;
    }

    try {
        // Modern browsers: Use File System Access API (opens Save-As dialog)
        if ('showSaveFilePicker' in window) {
            const options = {
                suggestedName: filename,
                types: [{
                    description: 'Text Files',
                    accept: { 'text/plain': ['.' + extension] }
                }]
            };

            const fileHandle = await window.showSaveFilePicker(options);
            const writable = await fileHandle.createWritable();
            await writable.write(code);
            await writable.close();

            console.log('File saved via File System Access API');
        } else {
            // Fallback for Firefox and older browsers: Direct download
            const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('File downloaded via fallback method (Downloads folder)');
        }

        // Visual feedback
        const originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = '✓ Saved';
        buttonElement.classList.add('downloaded');

        setTimeout(() => {
            buttonElement.innerHTML = originalText;
            buttonElement.classList.remove('downloaded');
        }, 2000);

    } catch (error) {
        // User cancelled or error occurred
        if (error.name === 'AbortError') {
            console.log('User cancelled save dialog');
        } else {
            console.error('Error saving file:', error);
            alert('Failed to save file: ' + error.message);
        }
    }
};
