/**
 * Markdown Renderer with Intelligent Filename Detection
 *
 * Architecture: Modular Design
 * - markdown/constants.js: Token patterns, extension mappings, allowlists
 * - markdown/lexer.js: scanBlockRanges(), tokenize()
 * - markdown/confidence.js: evaluateConfidence(), verifyFilename()
 * - markdown/fallback.js: detectFilenameFromCode()
 * - markdown/parser.js: parseFilenameTokens() (state machine)
 * - markdown.js (this file): UI integration, renderMarkdown(), download/copy functions
 *
 * All parser modules are loaded via index.html and export to window.*
 */

// ============================================
// DOM INTEGRATION & UI FUNCTIONS
// ============================================

/**
 * Detects conflicts between explicit tree structure and code block paths
 * @param {Object} treeStructure - Structure parsed from tree block
 * @param {Object} codeBlockStructure - Structure from code block paths
 * @returns {Array|null} - Array of conflict objects, or null if no conflicts
 */
function detectPathConflicts(treeStructure, codeBlockStructure) {
    if (!treeStructure || !codeBlockStructure) return null;
    if (!treeStructure.files || !codeBlockStructure.files) return null;

    // Build maps: basename -> array of fullPaths (handles duplicate basenames like main.rs)
    const treeMap = new Map();
    treeStructure.files.forEach(f => {
        if (f.name) {
            if (!treeMap.has(f.name)) {
                treeMap.set(f.name, []);
            }
            treeMap.get(f.name).push(f.fullPath || f.name);
        }
    });

    const codeBlockMap = new Map();
    codeBlockStructure.files.forEach(f => {
        if (f.name) {
            if (!codeBlockMap.has(f.name)) {
                codeBlockMap.set(f.name, []);
            }
            codeBlockMap.get(f.name).push(f.fullPath || f.name);
        }
    });

    // Check for files that exist in both but have different paths
    const conflicts = [];
    for (const [basename, codePaths] of codeBlockMap.entries()) {
        const treePaths = treeMap.get(basename);
        if (!treePaths) continue; // File only in code blocks, not in tree (no conflict)

        // For each code block path, check if it exists in tree paths
        codePaths.forEach(codePath => {
            // If this exact path exists in tree, no conflict
            if (treePaths.includes(codePath)) return;

            // Path differs - find the best matching tree path (same basename)
            // If there's only one tree path, use it; otherwise flag as ambiguous
            if (treePaths.length === 1) {
                const treePath = treePaths[0];
                conflicts.push({
                    filename: basename,
                    treePath: treePath,
                    codePath: codePath
                });
                console.log(`  [CONFLICT] ${basename}: tree="${treePath}" vs code="${codePath}"`);
            } else {
                // Multiple tree paths with same basename - can't auto-resolve
                console.log(`  [CONFLICT] ${basename}: ambiguous - ${treePaths.length} tree paths, code="${codePath}"`);
                // Use first tree path as default
                conflicts.push({
                    filename: basename,
                    treePath: treePaths[0],
                    codePath: codePath
                });
            }
        });
    }

    return conflicts.length > 0 ? conflicts : null;
}

function addDownloadButtonsToCodeBlocks(html, originalText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const codeBlocks = doc.querySelectorAll('pre code');

    // STEP 1: Pre-scan for project structures to extract expected filenames AND rootNames
    // This enables context-aware filename detection
    const expectedFilenames = [];
    const projectRoots = []; // NEW: Collect root directory names (e.g., "hello-tauri")
    if (window.isProjectStructure && window.parseProjectStructure) {
        codeBlocks.forEach((codeElement) => {
            const codeContent = codeElement.textContent;
            if (window.isProjectStructure(codeContent)) {
                const structure = window.parseProjectStructure(codeContent);
                // Collect all file paths from structure
                structure.files.forEach(file => {
                    if (file.fullPath) {
                        expectedFilenames.push(file.fullPath);
                    }
                });
                // Collect root directory name for path cleanup
                if (structure.rootName && !projectRoots.includes(structure.rootName)) {
                    projectRoots.push(structure.rootName);
                }
            }
        });
        console.log('[FILENAME-PARSER] Expected filenames from structures:', expectedFilenames);
        console.log('[FILENAME-PARSER] Project root names:', projectRoots);
    }

    // STEP 2: Parse filename tokens ONCE for entire text (returns array in code block order)
    // Pass expectedFilenames for context-aware HIGH CONFIDENCE matching
    const filenameArray = window.parseFilenameTokens(originalText, expectedFilenames);

    codeBlocks.forEach((codeElement, blockIndex) => {
        const preElement = codeElement.parentElement;
        const codeContent = codeElement.textContent;

        // Detect language from class (marked adds language-xxx)
        const languageClass = Array.from(codeElement.classList).find(cls => cls.startsWith('language-'));
        const language = languageClass ? languageClass.replace('language-', '') : 'text';

        // Check if this is a project structure FIRST (highest priority)
        const isStructure = window.isProjectStructure && window.isProjectStructure(codeContent);

        // Sanitized copy for the SAVE/DISPLAY path only. Detection and parsing below stay on the
        // raw codeContent (isProjectStructure / tree parsing rely on U+FFFD as a branch glyph). A
        // structure block maps U+FFFD → a box connector so project.txt renders cleanly; in a real
        // code file the replacement char is decode noise, so it is stripped.
        const codeForSave = isStructure
            ? (window.sanitizeMojibake ? window.sanitizeMojibake(codeContent) : codeContent)
            : codeContent.replace(/�+/g, '');

        // HIGH CONFIDENCE detection only
        let detectedFilename = null;
        let detectedFullPath = null;

        // Method 1: If structure → always use "project.txt" (override everything)
        if (isStructure) {
            detectedFilename = 'project.txt';
            detectedFullPath = 'project.txt';
        } else {
            // Method 2: Check filename array from forward parsing
            if (blockIndex < filenameArray.length && filenameArray[blockIndex]) {
                const fileInfo = filenameArray[blockIndex];
                // Support both old string format and new object format
                if (typeof fileInfo === 'string') {
                    detectedFilename = fileInfo;
                } else if (fileInfo && fileInfo.basename) {
                    detectedFilename = fileInfo.basename;
                    detectedFullPath = fileInfo.fullPath;
                }
            }

            // Method 3: Check first line of code (fallback)
            if (!detectedFilename) {
                const fileInfo = window.detectFilenameFromCode(codeContent, language, projectRoots);
                if (fileInfo) {
                    detectedFilename = fileInfo.basename;
                    detectedFullPath = fileInfo.fullPath;
                }
            }
        }

        // Create download button (only if we have content)
        if (codeContent.trim()) {
            const downloadBtn = doc.createElement('button');
            downloadBtn.className = 'code-download-btn';

            // Show filename if detected, otherwise generic "Save"
            if (detectedFilename) {
                // Show full path if available, otherwise just basename
                const displayName = detectedFullPath || detectedFilename;
                downloadBtn.innerHTML = `💾 ${displayName}`;
                downloadBtn.setAttribute('title', `Download ${displayName}`);
            } else {
                downloadBtn.innerHTML = '💾 Save';
                downloadBtn.setAttribute('title', 'Download code');
            }

            downloadBtn.setAttribute('data-code', codeForSave);
            downloadBtn.setAttribute('data-filename', detectedFilename || '');
            downloadBtn.setAttribute('data-fullpath', detectedFullPath || ''); // For bulk download
            downloadBtn.setAttribute('data-language', language);
            downloadBtn.setAttribute('data-is-structure', isStructure ? 'true' : 'false'); // Mark tree blocks
            downloadBtn.setAttribute('onclick', `downloadCode(this, event)`);

            // Create clipboard button
            const clipboardBtn = doc.createElement('button');
            clipboardBtn.className = 'code-clipboard-btn';
            clipboardBtn.innerHTML = '📋';
            clipboardBtn.setAttribute('title', 'Copy to clipboard');
            clipboardBtn.setAttribute('onclick', `copyCodeToClipboard(this)`);
            clipboardBtn.setAttribute('data-code', codeForSave);

            // Add language label + buttons container
            const headerDiv = doc.createElement('div');
            headerDiv.className = 'code-block-header';

            const langLabel = doc.createElement('span');
            langLabel.className = 'code-language-label';
            langLabel.textContent = language;

            headerDiv.appendChild(langLabel);
            headerDiv.appendChild(downloadBtn);
            headerDiv.appendChild(clipboardBtn);

            // Wrap pre element in container
            const container = doc.createElement('div');
            container.className = 'code-block-container';
            preElement.parentNode.insertBefore(container, preElement);
            container.appendChild(headerDiv);
            container.appendChild(preElement);

            // Check if this is a project structure block
            if (window.isProjectStructure && window.isProjectStructure(codeContent)) {
                const structure = window.parseProjectStructure(codeContent);

                // Add bulk download button below the code block
                const bulkDownloadDiv = doc.createElement('div');
                bulkDownloadDiv.className = 'bulk-download-container';

                const bulkBtn = doc.createElement('button');
                bulkBtn.className = 'bulk-download-btn';
                bulkBtn.innerHTML = '⏳ Waiting for response to complete...';
                bulkBtn.setAttribute('data-structure', JSON.stringify(structure));
                bulkBtn.setAttribute('onclick', 'bulkDownloadToProject(this, event)');
                bulkBtn.disabled = true; // Initially disabled during streaming
                bulkBtn.setAttribute('data-ready-text', '📦 View Structure');
                bulkBtn.setAttribute('title', 'Click to review project structure before downloading');

                const infoText = doc.createElement('span');
                infoText.className = 'bulk-download-info';
                infoText.textContent = `(${structure.files.length} files detected)`;

                bulkDownloadDiv.appendChild(bulkBtn);
                bulkDownloadDiv.appendChild(infoText);

                // Insert after the code block container
                container.parentNode.insertBefore(bulkDownloadDiv, container.nextSibling);
            }
        }
    });

    // After processing all code blocks, check if we can generate a synthetic structure
    // This handles cases like Qwen3-Coder where files have paths but no explicit tree
    if (window.generateSyntheticProjectStructure) {
        // ALWAYS try to generate synthetic structure from code blocks
        const syntheticStructure = window.generateSyntheticProjectStructure(doc.body);

        // Check if we have an explicit tree structure button
        const explicitTreeBtn = doc.querySelector('.bulk-download-btn');
        const hasExplicitTree = explicitTreeBtn !== null;

        // If we have BOTH synthetic structure AND explicit tree:
        // - ALWAYS prefer synthetic (code blocks have real content, tree is just structure)
        // - Replace explicit tree button with synthetic structure
        if (hasExplicitTree && syntheticStructure && syntheticStructure.files.length > 0) {
            const explicitStructure = JSON.parse(explicitTreeBtn.getAttribute('data-structure'));

            // Detect conflicts between tree and code block paths
            const conflicts = detectPathConflicts(explicitStructure, syntheticStructure);

            console.log('[SYNTHETIC] Comparing tree vs code block structure');
            console.log('  Tree files:', explicitStructure.files.length);
            console.log('  Code block files:', syntheticStructure.files.length);
            console.log('  Tree rootName:', explicitStructure.rootName);
            console.log('  Synthetic rootName:', syntheticStructure.rootName);
            console.log('  Conflicts detected:', conflicts ? conflicts.length : 0);

            // RECONCILIATION: Prefer explicit tree's rootName over synthetic's guess
            // Explicit tree is authoritative for project structure, synthetic is for file extraction
            if (explicitStructure.rootName && explicitStructure.rootName !== 'project') {
                // Explicit tree has a specific root name → keep it
                syntheticStructure.rootName = explicitStructure.rootName;
                console.log('[RECONCILE] Using explicit tree rootName:', explicitStructure.rootName);
            } else if (explicitStructure.rootName === 'project' && syntheticStructure.rootName !== 'project') {
                // Explicit tree defaulted to "project" (rootless), but synthetic found specific root
                // This is a edge case - keep "project" for consistency
                syntheticStructure.rootName = 'project';
                console.log('[RECONCILE] Keeping rootless tree default: project');
            }

            // Use synthetic structure (code blocks have actual content) with reconciled rootName
            explicitTreeBtn.setAttribute('data-structure', JSON.stringify(syntheticStructure));
            explicitTreeBtn.setAttribute('data-synthetic', 'true');

            // Store conflicts for modal display
            if (conflicts && conflicts.length > 0) {
                explicitTreeBtn.setAttribute('data-conflicts', JSON.stringify(conflicts));
                console.log('[CONFLICT] Path conflicts detected - will show in modal');
            }

            // Update info text
            const infoText = explicitTreeBtn.nextElementSibling;
            if (infoText && infoText.classList.contains('bulk-download-info')) {
                const conflictNote = conflicts ? ` ⚠️ ${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''}` : '';
                infoText.textContent = `(${syntheticStructure.files.length} files from code blocks${conflictNote})`;
            }
        } else if (!hasExplicitTree && syntheticStructure && syntheticStructure.files.length > 0) {
            // No explicit tree found, add synthetic structure button
            console.log('[SYNTHETIC] Generated structure with', syntheticStructure.files.length, 'files');

            // Add synthetic bulk download button at the end of the document
            const bulkDownloadDiv = doc.createElement('div');
            bulkDownloadDiv.className = 'bulk-download-container';
            bulkDownloadDiv.style.marginTop = '20px';
            bulkDownloadDiv.style.borderTop = '2px solid #e2e8f0';
            bulkDownloadDiv.style.paddingTop = '15px';

            const bulkBtn = doc.createElement('button');
            bulkBtn.className = 'bulk-download-btn';
            bulkBtn.innerHTML = '⏳ Waiting for response to complete...';
            bulkBtn.setAttribute('data-structure', JSON.stringify(syntheticStructure));
            bulkBtn.setAttribute('data-synthetic', 'true'); // Mark as synthetic
            bulkBtn.setAttribute('onclick', 'bulkDownloadToProject(this, event)');
            bulkBtn.disabled = true;
            bulkBtn.setAttribute('data-ready-text', '📦 Review & Download All Files');
            bulkBtn.setAttribute('title', 'Review project structure and download all files');

            const infoText = doc.createElement('span');
            infoText.className = 'bulk-download-info';
            infoText.textContent = `(${syntheticStructure.files.length} files detected from code blocks)`;

            bulkDownloadDiv.appendChild(bulkBtn);
            bulkDownloadDiv.appendChild(infoText);

            // Append to end of document
            doc.body.appendChild(bulkDownloadDiv);
        }
    }

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
window.downloadCode = async function(buttonElement, event) {
    const code = buttonElement.getAttribute('data-code');
    const suggestedFilename = buttonElement.getAttribute('data-filename');
    const fullPath = buttonElement.getAttribute('data-fullpath');
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
        'toml': 'toml',
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
        // STRATEGY 1: If project root handle exists (or can be selected) AND fullPath available → Save to project
        const forceNewRoot = event && event.shiftKey; // allow shift+click to re-pick root
        let projectRoot = null;

        if (window.ensureProjectRootHandle) {
            projectRoot = await window.ensureProjectRootHandle(forceNewRoot);
        } else if (window.getProjectRootHandle) {
            projectRoot = window.getProjectRootHandle();
        }

        // Get message container (needed for multiple operations below)
        const messageDiv = buttonElement.closest('.bot-message');

        // Shift+Click = NEW SESSION = FRESH START:
        // 1. Clear ALL custom paths (UI intention reset)
        // 2. Clear File-State-API (historical record reset)
        // 3. Reset bulk button to initial state (allow re-download in new projectRoot)
        if (forceNewRoot && messageDiv) {
            // Clear all data-custom-path attributes in this message
            const allButtons = messageDiv.querySelectorAll('.code-download-btn[data-custom-path]');
            allButtons.forEach(btn => btn.removeAttribute('data-custom-path'));
            console.log(`[DOWNLOAD] Shift+Click: Cleared ${allButtons.length} custom paths (UI reset)`);

            // Reset bulk button to initial state (remove view-only mode)
            const bulkButton = messageDiv.querySelector('.bulk-download-btn[data-view-only="true"]');
            if (bulkButton) {
                bulkButton.removeAttribute('data-view-only');
                bulkButton.classList.remove('downloaded');
                bulkButton.innerHTML = '📥 Download Files';
                bulkButton.title = 'Download all files';
                bulkButton.disabled = false;
                console.log('[DOWNLOAD] Shift+Click: Reset bulk button to initial state');
            }

            // Clear entire File-State-API sessionStorage (Single-Session Model)
            try {
                // Also wipes the session-canonical root (INTERIM) → next save re-establishes it.
                sessionStorage.removeItem('broke_bulk_download_state');
                console.log('[DOWNLOAD] Shift+Click: Cleared File-State-API (fresh session)');
            } catch (err) {
                console.warn('[DOWNLOAD] Failed to clear File-State-API:', err);
            }
        }

        // Shift+Click: Prompt for subdirectory (consistent with bulk download "Download to:" UX)
        let targetPath = fullPath || filename;
        if (forceNewRoot && projectRoot) {
            // Extract directory part from fullPath as pre-fill suggestion
            const dirPart = (fullPath && fullPath.includes('/'))
                ? fullPath.substring(0, fullPath.lastIndexOf('/'))
                : '';

            const subPath = prompt('Save to subdirectory (optional):', dirPart);

            if (subPath === null) {
                // User cancelled - abort download
                console.log('[DOWNLOAD] Shift+Click: User cancelled subdirectory prompt');
                return;
            }

            // User entered something (could be empty string = root level)
            if (subPath.trim()) {
                // Prepend subPath to filename
                targetPath = subPath.trim() + '/' + filename;
                console.log(`[DOWNLOAD] Shift+Click: Using subdirectory "${subPath.trim()}" → ${targetPath}`);
            } else {
                // Empty = root level
                targetPath = filename;
                console.log(`[DOWNLOAD] Shift+Click: Saving to root level → ${targetPath}`);
            }
        }

        // If bulk state exists for this message, get the tree root
        const bulkState = window.getBulkStateForMessage ? window.getBulkStateForMessage(messageDiv) : null;
        const rootNameFromState = bulkState?.structure?.rootName || bulkState?.structure?.rootHandleName || null;

        // INTERIM (0.1.7): pin a session-canonical root so multi-turn root drift doesn't split the
        // project across sibling roots. The first save with a declared root sets the canon; from
        // then on we strip the CANONICAL root (not this message's possibly-drifted root).
        // OPFS Session-Root-SSOT (ADR-006, 0.2.0) replaces this structurally.
        const effectiveRoot = (window.establishCanonicalRoot && rootNameFromState)
            ? window.establishCanonicalRoot(rootNameFromState)
            : ((window.getCanonicalRoot ? window.getCanonicalRoot() : null) || rootNameFromState);

        // Allow inline path edit (Alt+Click) without changing root
        // IMPORTANT: Alt+Click should show ORIGINAL path (before root stripping)
        if (event && event.altKey) {
            // Use original fullPath for Alt+Click prompt (no root stripping)
            const originalPath = fullPath || filename;
            const edited = prompt('Relative path under project root:', originalPath);
            if (edited && edited.trim()) {
                targetPath = edited.trim();
                buttonElement.setAttribute('data-custom-path', targetPath);
            } else if (edited === null) {
                // User cancelled - keep original path WITHOUT stripping
                targetPath = originalPath;
            }
        } else if (buttonElement.getAttribute('data-custom-path')) {
            // Use previously edited custom path
            targetPath = buttonElement.getAttribute('data-custom-path');
        } else {
            // Normal download (no Alt+Click): Strip the session-canonical root from targetPath so
            // paths are relative to the project root (consistent with bulk download) and stay under
            // ONE tree across turns (INTERIM, see establishCanonicalRoot in bulk-download.js).
            if (effectiveRoot && targetPath) {
                const normalized = targetPath.replace(/^\/+/, '');
                if (normalized.startsWith(effectiveRoot + '/')) {
                    targetPath = normalized.substring(effectiveRoot.length + 1);
                } else if (normalized === effectiveRoot) {
                    targetPath = filename; // Root-level file, use just filename
                }
            }
        }

        if (projectRoot && targetPath) {
            // Parse targetPath into directory + filename
            const pathParts = targetPath.split('/');
            const fileName = pathParts[pathParts.length - 1];
            const dirPath = pathParts.slice(0, -1).join('/'); // May be empty for root files

            const rootName = projectRoot.name || 'project_root';
            const displayPath = dirPath ? `${rootName}/${dirPath}/${fileName}` : `${rootName}/${fileName}`;
            buttonElement.title = `Save to ${displayPath}`;

            console.log(`[DOWNLOAD] Saving to project: ${dirPath}/${fileName}`);

            const result = await window.saveFileToProject(projectRoot, dirPath, fileName, code);

            if (!result.success) {
                throw result.error || new Error('Failed to save to project');
            }

            console.log('[DOWNLOAD] ✓ Saved to project directory');
        }
        // STRATEGY 2: No project context or user cancelled → Use Save-As dialog
        else if ('showSaveFilePicker' in window) {
            // Dotfiles (.gitignore, .env, etc.) should NOT have type restrictions
            // Otherwise browsers force .txt extension
            const isDotfile = filename.startsWith('.');

            const options = {
                suggestedName: filename
            };

            // Only add type restriction for non-dotfiles
            if (!isDotfile) {
                options.types = [{
                    description: 'Text Files',
                    accept: { 'text/plain': ['.' + extension] }
                }];
            }

            const fileHandle = await window.showSaveFilePicker(options);
            const writable = await fileHandle.createWritable();
            await writable.write(code);
            await writable.close();

            console.log('[DOWNLOAD] File saved via Save-As dialog');
        }
        // STRATEGY 3: Fallback for Firefox and older browsers
        else {
            const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('[DOWNLOAD] File downloaded via fallback (Downloads folder)');
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
            console.log('[DOWNLOAD] User cancelled save dialog');
        } else {
            console.error('[DOWNLOAD] Error saving file:', error);
            alert('Failed to save file: ' + error.message);
        }
    }
};

/**
 * Copy code to clipboard
 * Simple, transparent operation with visual feedback
 */
window.copyCodeToClipboard = async function(buttonElement) {
    const code = buttonElement.getAttribute('data-code');

    if (!code) {
        console.error('No code content found');
        return;
    }

    try {
        // Use modern Clipboard API
        await navigator.clipboard.writeText(code);

        // Visual feedback
        const originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = '✓';

        setTimeout(() => {
            buttonElement.innerHTML = originalText;
        }, 2000);

        console.log('Code copied to clipboard');

    } catch (error) {
        console.error('Failed to copy code:', error);

        // Fallback: Try older execCommand method
        try {
            const textarea = document.createElement('textarea');
            textarea.value = code;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);

            // Visual feedback
            const originalText = buttonElement.innerHTML;
            buttonElement.innerHTML = '✓';
            setTimeout(() => {
                buttonElement.innerHTML = originalText;
            }, 2000);

            console.log('Code copied via fallback method');
        } catch (fallbackError) {
            console.error('Fallback copy failed:', fallbackError);
            alert('Failed to copy code to clipboard');
        }
    }
};
