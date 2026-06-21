// Bulk Download UI - Modal Rendering and Tree Visualization
// Handles structure review modal, file tree rendering, and user interactions

/**
 * Global state for structure review modal
 */
let pendingStructureDownload = null;
let currentReviewStructure = null;
let currentConflicts = null; // Store conflicts for resolution during download

/**
 * Builds a hierarchical tree structure from flat file list
 * @param {Array} files - Array of {path, name, fullPath}
 * @returns {Object} - Nested tree structure
 */
function buildFileTree(files) {
    const tree = {};

    files.forEach((file, index) => {
        const parts = file.fullPath.split('/');
        let current = tree;

        parts.forEach((part, i) => {
            const isLast = i === parts.length - 1;

            if (!current[part]) {
                current[part] = {
                    name: part,
                    isFile: isLast,
                    fullPath: parts.slice(0, i + 1).join('/'),
                    fileIndex: isLast ? index : null,
                    children: {}
                };
            }

            if (!isLast) {
                current = current[part].children;
            }
        });
    });

    return tree;
}

/**
 * Renders a file tree recursively with ASCII tree symbols
 * @param {Object} node - Tree node
 * @param {number} depth - Current depth
 * @param {Array} prefix - Array of prefixes for indentation
 * @param {HTMLElement} container - Container to append to
 */
function renderTreeNode(node, depth, prefix, container) {
    // Priority order for common project directories
    const dirPriority = {
        'src': 10,
        'lib': 9,
        'app': 8,
        'public': 7,
        'assets': 6,
        'docs': 5,
        'tests': 4,
        'test': 4,
        'config': 3,
        'scripts': 2,
        'node_modules': 1
    };

    const entries = Object.entries(node).sort((a, b) => {
        const [nameA, dataA] = a;
        const [nameB, dataB] = b;

        // Folders first, then files
        if (dataA.isFile !== dataB.isFile) {
            return dataA.isFile ? 1 : -1;
        }

        // If both are folders, use priority order
        if (!dataA.isFile && !dataB.isFile) {
            const priorityA = dirPriority[nameA] || 0;
            const priorityB = dirPriority[nameB] || 0;

            if (priorityA !== priorityB) {
                return priorityB - priorityA; // Higher priority first
            }
        }

        // Default: alphabetical
        return nameA.localeCompare(nameB);
    });

    entries.forEach(([name, data], index) => {
        const isLastEntry = index === entries.length - 1;
        const item = document.createElement('div');
        item.className = 'structure-tree-item';

        // Build indentation with CSS-based lines
        let indentHTML = '';
        // Add indent spacers for each level of depth (except current level which gets the branch)
        for (let i = 0; i < depth; i++) {
            // Show vertical line if parent at this level has more children
            const showLine = prefix[i];
            indentHTML += `<span class="structure-tree-indent${showLine ? ' has-line' : ''}"></span>`;
        }

        // Branch connector (L-shape for last item, T-shape for others)
        const branchClass = isLastEntry ? 'is-last' : '';
        const branchHTML = depth > 0 ? `<span class="structure-tree-branch ${branchClass}"></span>` : '';

        // Icon
        const icon = data.isFile ? '📄' : '📁';
        const iconClass = data.isFile ? 'file' : 'folder';

        item.innerHTML = `
            ${indentHTML}
            ${branchHTML}
            <span class="structure-tree-icon ${iconClass}">${icon}</span>
        `;

        if (data.isFile) {
            // File: show name + read-only path
            const nameSpan = document.createElement('span');
            nameSpan.className = 'structure-tree-name';
            nameSpan.textContent = name;

            const pathSpan = document.createElement('span');
            pathSpan.className = 'structure-tree-path';
            pathSpan.textContent = `(${data.fullPath})`;
            pathSpan.dataset.fullpath = data.fullPath;
            pathSpan.dataset.index = data.fileIndex;

            item.appendChild(nameSpan);
            item.appendChild(pathSpan);
        } else {
            // Folder: just show name
            const nameSpan = document.createElement('span');
            nameSpan.className = 'structure-tree-name folder';
            nameSpan.textContent = name + '/';
            item.appendChild(nameSpan);
        }

        container.appendChild(item);

        // Recurse for children (folders)
        if (!data.isFile && Object.keys(data.children).length > 0) {
            const newPrefix = [...prefix];
            newPrefix[depth] = !isLastEntry;
            renderTreeNode(data.children, depth + 1, newPrefix, container);
        }
    });
}

/**
 * Shows the structure review modal with project structure
 * @param {Object} structure - The project structure { rootName, files: [{path, name, fullPath}] }
 * @param {Function|null} onConfirm - Callback when user confirms download (receives edited structure, metadata)
 * @param {Array|null} conflicts - Array of conflict objects: [{filename, treePath, codePath}]
 * @param {Object} options - Optional config { viewOnly?: boolean, conflictStrategy?: string }
 */
function showStructureReviewModal(structure, onConfirm, conflicts = null, options = {}) {
    const { viewOnly = false, conflictStrategy = null } = options;

    if (!structure || !structure.files || structure.files.length === 0) {
        alert('No files found in project structure');
        return;
    }

    // Store callback, structure, and conflicts for later
    pendingStructureDownload = viewOnly ? null : onConfirm;
    currentReviewStructure = structure;
    currentConflicts = conflicts; // Store conflicts for resolution
    let rootLabelElement = null;

    function setRootLabel(displayPath) {
        if (!rootLabelElement) return;

        const trimmed = displayPath ? displayPath.trim() : '';
        const normalized = trimmed || `${structure.rootName}/`;
        const finalLabel = normalized.endsWith('/') ? normalized : `${normalized}/`;
        rootLabelElement.textContent = finalLabel;
    }

    // Populate target directory input (empty = current directory)
    const targetInput = document.getElementById('structureTargetInput');
    const initialTarget = (structure && typeof structure.targetDir === 'string') ? structure.targetDir : '';
    targetInput.value = initialTarget; // Empty field = current directory
    targetInput.disabled = viewOnly; // View-only mode keeps input static
    const rootLabel = document.querySelector('.structure-root-label');
    const subdirHint = document.querySelector('.structure-subdir-hint');

    if (viewOnly) {
        if (rootLabel) rootLabel.style.display = 'none';
        targetInput.style.display = 'none';
    } else {
        if (rootLabel) rootLabel.style.display = '';
        targetInput.style.display = '';
    }

    // Update preview when input changes
    async function updateTargetPreview() {
        const target = targetInput.value.trim() || '.';
        const preview = document.getElementById('structureTargetPreview');
        const suggestedPath = target;
        const storedRootName = structure.rootHandleName || '';

        // Get absolute path if projectRootHandle is available
        const fileSystem = window.__fileSystem;
        const projectRootHandle = fileSystem ? fileSystem.getHandle() : null;

        if (projectRootHandle) {
            try {
                // Get the selected directory name
                const dirName = projectRootHandle.name;

                // Build relative path from input
                let relativePath = suggestedPath === '.' ? '' : suggestedPath.replace(/^\/+|\/+$/g, '');

                // Combine directory + relative path
                let fullPath = relativePath ? `${dirName}/${relativePath}` : dirName;

                // Intelligent truncation if too long (keep last 2-3 segments)
                const segments = fullPath.split('/');
                if (segments.length > 3) {
                    fullPath = '.../' + segments.slice(-2).join('/');
                }

                preview.textContent = fullPath + '/';
                setRootLabel(preview.textContent);
            } catch (err) {
                // Fallback to relative path
                const normalized = suggestedPath === '.' ? './' : suggestedPath.replace(/^\/+|\/+$/g, '') + '/';
                preview.textContent = normalized;
                setRootLabel(preview.textContent);
            }
        } else {
            // No directory selected yet - show relative path (or stored root name)
            const normalized = suggestedPath === '.' ? './' : suggestedPath.replace(/^\/+|\/+$/g, '') + '/';

            if (storedRootName) {
                const fullDisplay = normalized === './' ? `${storedRootName}/` : `${storedRootName}/${normalized}`;
                preview.textContent = fullDisplay;
                setRootLabel(fullDisplay);
            } else {
                preview.textContent = normalized;
                setRootLabel(preview.textContent);
            }
        }
    }

    // Attach the input listener — but FIRST drop any handler left from a previous open. The modal and
    // #structureTargetInput are persistent singletons reused on every open, while updateTargetPreview
    // is a FRESH closure each call (it closes over this open's structure). A plain
    // removeEventListener(updateTargetPreview) would therefore never match the prior closure, so the
    // listeners would accumulate on the input (fire N× per keystroke, plus leak old-structure closures
    // on a node that is never recreated). Stash the handler on the element so the next open removes
    // exactly this one. Visible output was already correct (newest listener fires last and wins); this
    // is a leak/redundancy fix.
    if (targetInput._brokePreviewHandler) {
        targetInput.removeEventListener('input', targetInput._brokePreviewHandler);
        targetInput._brokePreviewHandler = null;
    }
    if (!viewOnly) {
        targetInput._brokePreviewHandler = updateTargetPreview;
        targetInput.addEventListener('input', updateTargetPreview);
    }

    // Initialize preview
    updateTargetPreview();

    // Calculate summary stats.
    // Count directories that contain files, including the project root itself when files live
    // there (a flat project of root-level files is "1 directory", not "0").
    const totalFiles = structure.files.length;
    const dirSet = new Set();
    let hasRootFile = false;
    structure.files.forEach(f => {
        const d = (f.path || '').replace(/^\/+|\/+$/g, '');
        if (d) dirSet.add(d); else hasRootFile = true;
    });
    const uniqueDirs = dirSet.size + (hasRootFile ? 1 : 0);
    let summaryHTML = `${totalFiles} file${totalFiles !== 1 ? 's' : ''} in ${uniqueDirs} director${uniqueDirs !== 1 ? 'ies' : 'y'}`;

    // BUG FIX: Add conflict strategy info in view-only modal
    if (viewOnly && conflictStrategy) {
        summaryHTML += `\n\n<div style="font-size: 0.9em; margin-top: 8px; padding: 8px; background: #e6fffa; border-left: 3px solid #38a169; color: #333;">`;
        summaryHTML += `ℹ️ <strong>Path conflict resolved:</strong> ${getConflictStrategyLabel(conflictStrategy)}`;
        summaryHTML += `</div>`;
    }

    // Add conflict details if present
    if (conflicts && conflicts.length > 0 && !viewOnly) {
        summaryHTML += `\n\n<strong style="color: #e53e3e;">⚠️ ${conflicts.length} Path Conflict${conflicts.length > 1 ? 's' : ''} Detected</strong>\n`;
        summaryHTML += '<div style="font-size: 0.9em; margin-top: 8px; padding: 8px; background: #fff5f5; border-left: 3px solid #e53e3e; color: #333;">';
        summaryHTML += 'Project tree and code block paths differ. Choose which path to use for each file:\n\n';

        conflicts.forEach((conflict, index) => {
            const conflictId = `conflict-${index}`;
            summaryHTML += `<div style="margin: 8px 0; padding: 8px; background: white; border: 1px solid #fed7d7; border-radius: 4px;">`;
            summaryHTML += `<div style="font-weight: 600; margin-bottom: 6px;">📄 ${conflict.filename}</div>`;

            // Radio button for Tree path
            summaryHTML += `<label style="display: block; margin: 4px 0; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" onmouseover="this.style.background='#f7fafc'" onmouseout="this.style.background='transparent'">`;
            summaryHTML += `<input type="radio" name="${conflictId}" value="tree" style="margin-right: 8px;" />`;
            summaryHTML += `<span style="font-family: monospace; font-size: 0.85em;">Tree: ${conflict.treePath}</span>`;
            summaryHTML += `</label>`;

            // Radio button for Code path (default selected)
            summaryHTML += `<label style="display: block; margin: 4px 0; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" onmouseover="this.style.background='#f7fafc'" onmouseout="this.style.background='transparent'">`;
            summaryHTML += `<input type="radio" name="${conflictId}" value="code" checked style="margin-right: 8px;" />`;
            summaryHTML += `<span style="font-family: monospace; font-size: 0.85em; color: #38a169;">Code: ${conflict.codePath}</span>`;
            summaryHTML += `<span style="margin-left: 8px; font-size: 0.75em; color: #718096;">(default - has actual content)</span>`;
            summaryHTML += `</label>`;

            summaryHTML += `</div>`;
        });

        summaryHTML += '</div>';
    }

    const summaryElement = document.getElementById('structureSummary');
    summaryElement.innerHTML = summaryHTML;
    summaryElement.style.whiteSpace = 'pre-line'; // Allow newlines

    // Build and render file tree
    const fileList = document.getElementById('structureFileList');
    fileList.innerHTML = '';

    const treeContainer = document.createElement('div');
    treeContainer.className = 'structure-tree';

    // Only show root folder for non-synthetic structures (explicit tree blocks)
    // For synthetic structures, showing root is confusing because it gets stripped from paths
    // and won't be created as a directory (files save directly to ./backend/... not ./my-task-manager/backend/...)
    const showRootNode = !structure.synthetic;

    if (showRootNode) {
        // Add root folder
        const rootItem = document.createElement('div');
        rootItem.className = 'structure-tree-item';
        rootItem.innerHTML = `
            <span class="structure-tree-icon folder">📁</span>
            <span class="structure-tree-name folder" id="structureRootName">${structure.rootName}/</span>
        `;
        treeContainer.appendChild(rootItem);
        rootLabelElement = rootItem.querySelector('#structureRootName');
        setRootLabel(document.getElementById('structureTargetPreview').textContent);
    }

    // Build tree structure and render
    const tree = buildFileTree(structure.files);
    const startDepth = showRootNode ? 1 : 0; // Start at depth 0 if no root shown
    renderTreeNode(tree, startDepth, [], treeContainer);

    fileList.appendChild(treeContainer);

    // Adjust actions for view-only mode
    const downloadBtn = document.querySelector('.structure-btn-download');
    const cancelBtn = document.querySelector('.structure-btn-cancel');

    if (viewOnly) {
        if (downloadBtn) {
            downloadBtn.style.display = 'none';
            downloadBtn.disabled = true;
        }
        if (cancelBtn) {
            cancelBtn.textContent = 'Close';
        }
    } else {
        if (downloadBtn) {
            downloadBtn.style.display = '';
            downloadBtn.disabled = false;
        }
        if (cancelBtn) {
            cancelBtn.textContent = 'Cancel';
        }
    }

    // Show modal
    document.getElementById('structureReviewModal').classList.add('visible');
}

/**
 * Helper: Get human-readable label for conflict strategy
 */
function getConflictStrategyLabel(strategy) {
    const labels = {
        'tree': 'Used tree structure paths',
        'code': 'Used code block paths (default)'
    };
    return labels[strategy] || strategy;
}

/**
 * Closes the structure review modal without downloading
 */
window.closeStructureReviewModal = function() {
    document.getElementById('structureReviewModal').classList.remove('visible');
    pendingStructureDownload = null;
    currentReviewStructure = null;
    currentConflicts = null; // Clear conflicts state
};

/**
 * Confirms structure download and executes the callback
 * Uses original file structure with optionally edited root name
 */
window.confirmStructureDownload = function() {
    if (!pendingStructureDownload || !currentReviewStructure) {
        console.error('No pending download callback or structure');
        return;
    }

    // Collect target directory
    const targetDir = document.getElementById('structureTargetInput').value.trim() || '.';
    let processedFiles = currentReviewStructure.files;

    // Apply conflict resolution based on user selections
    let conflictStrategy = null;
    if (currentConflicts && currentConflicts.length > 0) {
        console.log('[CONFIRM] Applying conflict resolutions');

        // Build a map of filename → selected path
        const conflictResolutions = new Map();
        currentConflicts.forEach((conflict, index) => {
            const conflictId = `conflict-${index}`;
            const selectedRadio = document.querySelector(`input[name="${conflictId}"]:checked`);
            const selection = selectedRadio ? selectedRadio.value : 'code'; // Default to code if not found

            // Store the selected path
            const selectedPath = selection === 'tree' ? conflict.treePath : conflict.codePath;
            conflictResolutions.set(conflict.filename, selectedPath);

            // Track conflict strategy (assume consistent selection across all conflicts)
            if (!conflictStrategy) {
                conflictStrategy = selection;
            }

            console.log(`[CONFIRM] Conflict resolution for ${conflict.filename}: ${selection} → ${selectedPath}`);
        });

        // Apply resolutions to processed files
        processedFiles = processedFiles.map(file => {
            const resolvedPath = conflictResolutions.get(file.name);
            if (resolvedPath && resolvedPath !== file.fullPath) {
                // User selected different path - update file
                const lastSlash = resolvedPath.lastIndexOf('/');
                const newPath = lastSlash >= 0 ? resolvedPath.substring(0, lastSlash) : '';

                console.log(`[CONFIRM] Applying conflict resolution: ${file.fullPath} → ${resolvedPath}`);

                return {
                    ...file,
                    path: newPath,
                    fullPath: resolvedPath
                };
            }
            return file;
        });
    }

    // Use original or processed files
    const finalStructure = {
        targetDir: targetDir === '.' ? '' : targetDir.replace(/^\/+|\/+$/g, ''), // Normalize (empty for current dir)
        files: processedFiles,
        synthetic: currentReviewStructure.synthetic,
        rootName: currentReviewStructure.rootName || 'project',
        rootHandleName: currentReviewStructure.rootHandleName || null
    };

    // Prepare metadata for persistence
    const metadata = {
        conflictStrategy: conflictStrategy
    };

    // Close modal
    document.getElementById('structureReviewModal').classList.remove('visible');

    // Execute callback with structure AND metadata
    pendingStructureDownload(finalStructure, metadata);
    pendingStructureDownload = null;
    currentReviewStructure = null;
    currentConflicts = null; // Clear conflicts state
};

// Export for use in project-structure.js
window.showStructureReviewModal = showStructureReviewModal;
