// Bulk Download Orchestration and State Management
// Handles download state, persistence, and execution flow

/**
 * sessionStorage key for bulk download state
 * (uses sessionStorage instead of localStorage for better testability - cleared on tab close)
 */
const BULK_STATE_KEY = 'broke_bulk_download_state';

/**
 * Get message hash from message div (for state persistence)
 */
function getMessageHashFromDiv(messageDiv) {
    if (!messageDiv) return null;
    const attrHash = messageDiv.getAttribute('data-message-hash');
    if (attrHash) return attrHash;

    const rawContent = messageDiv.getAttribute('data-content') || messageDiv.textContent || '';
    return window.computeMessageHash ? window.computeMessageHash(rawContent) : null;
}

/**
 * Persist bulk download state for a message (uses sessionStorage)
 *
 * SINGLE SESSION MODEL (ADR-005):
 * - Clears ALL previous sessions before saving new one
 * - Ensures consistent filesystem state tracking (one active project root)
 * - Prevents mixing files from different sessions/roots
 *
 * @param {string} messageHash - Message hash (unique identifier)
 * @param {Object} payload - State to persist
 * @param {Object} payload.structure - Project structure
 * @param {number} payload.failedCount - Number of failed files
 * @param {string} payload.rootHandleName - Root directory name
 * @param {string} payload.conflictStrategy - Conflict resolution strategy ('tree' or 'code')
 * @param {Array} payload.conflicts - Array of conflict objects (for info badge in view-only modal)
 */
function persistBulkState(messageHash, payload) {
    if (!messageHash || !payload) return;

    try {
        // SINGLE SESSION MODEL: Clear all old sessions
        const allState = {
            [messageHash]: {
                ...payload
            }
        };

        // Save to sessionStorage (cleared on tab close)
        sessionStorage.setItem(BULK_STATE_KEY, JSON.stringify(allState));

        console.log(`[BULK-DOWNLOAD] State persisted for message ${messageHash.substring(0, 8)}... (all old sessions cleared)`);
    } catch (err) {
        console.error('[BULK-DOWNLOAD] Failed to persist state:', err);
    }
}

/**
 * Get persisted bulk download state for a message (from sessionStorage)
 */
function getPersistedBulkState(messageHash) {
    if (!messageHash) return null;

    try {
        const allState = JSON.parse(sessionStorage.getItem(BULK_STATE_KEY) || '{}');
        return allState[messageHash] || null;
    } catch (err) {
        console.error('[BULK-DOWNLOAD] Failed to load state:', err);
        return null;
    }
}

/**
 * Exported helper to fetch bulk state for a given message
 */
window.getBulkStateForMessage = function(messageDiv) {
    if (!messageDiv) return null;
    const messageHash = getMessageHashFromDiv(messageDiv);
    if (!messageHash) return null;
    return getPersistedBulkState(messageHash);
};

/**
 * Restore bulk download state (view-only) for a given message
 * Called on page load to restore buttons to "View tree" state
 */
window.restoreBulkDownloadState = function(messageDiv) {
    const messageHash = getMessageHashFromDiv(messageDiv);
    if (!messageHash) return;

    const saved = getPersistedBulkState(messageHash);
    if (!saved || !saved.structure) return;

    if (saved.structure && !saved.structure.rootHandleName) {
        saved.structure.rootHandleName = saved.rootHandleName || 'project_root';
    }

    const buttons = messageDiv.querySelectorAll('.bulk-download-btn');
    buttons.forEach(btn => {
        try {
            btn.setAttribute('data-structure', JSON.stringify(saved.structure));
        } catch (err) {
            console.warn('Failed to attach persisted structure to button:', err);
        }
        btn.setAttribute('data-view-only', 'true');
        if (saved.rootHandleName) {
            btn.setAttribute('data-root-name', saved.rootHandleName);
        }

        // Attach conflict metadata for view-only modal
        if (saved.conflictStrategy) {
            btn.setAttribute('data-conflict-strategy', saved.conflictStrategy);
        }
        // Restore conflicts array if present
        if (saved.conflicts) {
            btn.setAttribute('data-conflicts', JSON.stringify(saved.conflicts));
        }

        if (saved.failedCount && saved.failedCount > 0) {
            btn.innerHTML = '⚠️ View project tree';
            btn.title = 'Some files failed; view project tree';
            const infoText = btn.parentElement?.querySelector('.bulk-download-info');
            if (infoText) infoText.textContent = 'Download finished; some files failed. View tree.';
        } else {
            btn.innerHTML = '👁 View project tree';
            btn.title = 'View project tree';
            const infoText = btn.parentElement?.querySelector('.bulk-download-info');
            if (infoText) infoText.textContent = 'Files downloaded. View tree.';
        }

        btn.disabled = false;
        btn.classList.add('downloaded');
    });
};

/**
 * Downloads all code blocks in the current message to the project structure
 * Called when user clicks the bulk download button
 * @param {HTMLElement} buttonElement - The bulk download button
 * @param {Event} event - The click event (optional, used to detect Shift+Click)
 */
window.bulkDownloadToProject = async function(buttonElement, event) {
    const messageDiv = buttonElement.closest('.bot-message');
    if (!messageDiv) {
        alert('Error: Could not find message container');
        return;
    }

    // Get the project structure from the data attribute
    const structureData = buttonElement.getAttribute('data-structure');
    if (!structureData) {
        alert('Error: No project structure data found');
        return;
    }

    const structure = JSON.parse(structureData);

    // Get conflicts data if present
    const conflictsData = buttonElement.getAttribute('data-conflicts');
    const conflicts = conflictsData ? JSON.parse(conflictsData) : null;

    // Check if user wants to force a new download (Shift+Click)
    const forceNewDownload = event && event.shiftKey;

    // Shift+Click: Always clear ALL state (shared handle, structure root, sessionStorage)
    // SINGLE SESSION MODEL (ADR-005): Clear ENTIRE store, not just current message
    if (forceNewDownload) {
        // 1. Clear shared projectRootHandle (from single-file downloads)
        const fileSystem = window.__fileSystem;
        if (fileSystem) {
            fileSystem.setHandle(null);  // Clear shared directory handle
        }

        // 2. Clear rootHandleName from structure (prevents showing stale path in modal)
        if (structure.rootHandleName) {
            delete structure.rootHandleName;
            // Update data-structure attribute with cleaned structure
            try {
                buttonElement.setAttribute('data-structure', JSON.stringify(structure));
            } catch (err) {
                console.warn('[BULK-DOWNLOAD] Failed to update structure:', err);
            }
        }

        // 3. Clear ENTIRE sessionStorage (SINGLE SESSION MODEL - ADR-005)
        // Removes all old sessions, not just current message
        try {
            sessionStorage.removeItem(BULK_STATE_KEY);
            console.log('[BULK-DOWNLOAD] Shift+Click: Cleared entire session store');
        } catch (err) {
            console.error('[BULK-DOWNLOAD] Failed to clear session store:', err);
        }
    }

    // View-only mode: show modal UNLESS Shift is held (force new download)
    const isViewOnly = buttonElement.getAttribute('data-view-only') === 'true';
    if (isViewOnly && !forceNewDownload) {
        if (window.showStructureReviewModal) {
            // Pass metadata from persisted state
            let conflictStrategy = buttonElement.getAttribute('data-conflict-strategy');

            // BUG FIX: If conflicts exist but strategy is missing, default to 'code'
            if (!conflictStrategy && conflicts && conflicts.length > 0) {
                conflictStrategy = 'code'; // Default strategy used during download
                console.log('[BULK-DOWNLOAD] Missing conflictStrategy, defaulting to "code"');
            }

            window.showStructureReviewModal(structure, null, conflicts, {
                viewOnly: true,
                conflictStrategy: conflictStrategy
            });
        }
        return;
    }

    // Shift+Click in view-only mode: Reset button UI to initial state
    // (Handle, structure, sessionStorage already cleared above in general Shift+Click handler)
    if (isViewOnly && forceNewDownload) {
        buttonElement.removeAttribute('data-view-only');
        buttonElement.removeAttribute('data-root-name');
        buttonElement.removeAttribute('data-conflict-strategy');
        buttonElement.removeAttribute('data-duplicate-prefix-mode');
        buttonElement.removeAttribute('data-conflicts');
        buttonElement.classList.remove('downloaded');

        // Reset button UI to initial state
        buttonElement.innerHTML = '📦 View Structure';
        buttonElement.title = 'Click to review project structure before downloading';

        // Reset info text to initial state (file count)
        const infoText = buttonElement.parentElement?.querySelector('.bulk-download-info');
        if (infoText && structure.files) {
            infoText.textContent = `(${structure.files.length} files detected)`;
        }

        // Continue with normal download flow below
    }

    // ALWAYS show review modal for consistent UX
    if (window.showStructureReviewModal) {
        // Show modal and wait for user confirmation
        // Pass conflicts array - modal will show conflict details
        window.showStructureReviewModal(structure, async (editedStructure, metadata) => {
            // User confirmed, proceed with download using edited structure
            // Add conflicts to metadata for persistence
            metadata.conflicts = conflicts;
            await performBulkDownload(buttonElement, editedStructure, event, metadata);
        }, conflicts);
        return;
    }

    // Fallback: direct download if modal not available (shouldn't happen)
    await performBulkDownload(buttonElement, structure, event);
};

/**
 * Internal function that performs the actual bulk download
 * Extracted from bulkDownloadToProject to allow modal confirmation flow
 * @param {HTMLElement} buttonElement - The bulk download button
 * @param {Object} structure - Project structure
 * @param {Event} event - Click event
 * @param {Object} metadata - Metadata from modal (conflict strategy, duplicate prefix mode)
 */
async function performBulkDownload(buttonElement, structure, event, metadata = {}) {
    const messageDiv = buttonElement.closest('.bot-message');
    if (!messageDiv) {
        alert('Error: Could not find message container');
        return;
    }

    // Persist the finalized structure on the button for future "view tree" clicks
    try {
        buttonElement.setAttribute('data-structure', JSON.stringify(structure));
    } catch (err) {
        console.warn('Failed to persist structure on button:', err);
    }

    // Check if user wants to force directory selection (Shift+Click)
    const forceNewDirectory = event && event.shiftKey;

    // Get file system handle
    const fileSystem = window.__fileSystem;
    let projectRootHandle = null;

    if (forceNewDirectory) {
        // User explicitly wants to change directory
        fileSystem.setHandle(null);
        const selected = await fileSystem.selectRoot();
        if (!selected) return; // User cancelled
        projectRootHandle = fileSystem.getHandle();
    } else {
        // Normal flow: Check if existing project root is still valid
        const isValid = await fileSystem.verifyRoot();

        // Select project root if not already selected or if invalid
        if (!fileSystem.getHandle() || !isValid) {
            if (!isValid && fileSystem.getHandle()) {
                // Inform user that directory was deleted/moved
                alert('⚠️ The previously selected directory no longer exists or is inaccessible.\n\nPlease select a new directory.');
                fileSystem.setHandle(null);
            }

            const selected = await fileSystem.selectRoot();
            if (!selected) return; // User cancelled
        }
        projectRootHandle = fileSystem.getHandle();
    }

    // Get all code blocks in message for matching
    const allCodeBlocks = Array.from(messageDiv.querySelectorAll('.code-download-btn'));
    console.log('[BULK] Total code blocks in message:', allCodeBlocks.length);
    console.log('[BULK] Files in structure:', structure.files.length);

    const rootHandleName = projectRootHandle
        ? projectRootHandle.name
        : (buttonElement.getAttribute('data-root-name') || 'project_root');

    // Update button state
    buttonElement.innerHTML = '⏳ Saving files...';
    buttonElement.disabled = true;

    let savedCount = 0;
    let failedCount = 0;
    let aborted = false;

    // CORRECT APPROACH: Iterate over structure.files (what user sees in modal)
    // For each file, find matching code block in DOM
    for (const fileInfo of structure.files) {
        // Find code block by fullPath or basename
        let downloadBtn = null;

        // Try exact fullPath match first
        downloadBtn = allCodeBlocks.find(btn => btn.getAttribute('data-fullpath') === fileInfo.fullPath);

        // Fallback: match by basename
        if (!downloadBtn) {
            downloadBtn = allCodeBlocks.find(btn => btn.getAttribute('data-filename') === fileInfo.name);
        }

        if (!downloadBtn) {
            // Tree entry without matching code block (placeholder like README, configs)
            // This is NOT an error - just skip silently
            console.log('[BULK] Skipping tree-only entry (no code block):', fileInfo.fullPath || fileInfo.name);
            continue;
        }

        const code = downloadBtn.getAttribute('data-code');
        if (!code) {
            // Code block exists but has no content - skip silently
            console.log('[BULK] Skipping empty code block:', fileInfo.name);
            continue;
        }

        // CRITICAL: Extract path from fullPath (Single Source of Truth)
        // fullPath is what's shown in modal and what's been stripped
        let pathPart = fileInfo.fullPath.includes('/')
            ? fileInfo.fullPath.substring(0, fileInfo.fullPath.lastIndexOf('/'))
            : '';

        // Apply target directory prefix if specified
        if (structure.targetDir) {
            pathPart = pathPart ? `${structure.targetDir}/${pathPart}` : structure.targetDir;
        }

        console.log('[BULK] Saving:', fileInfo.fullPath, '→', pathPart, '/', fileInfo.name);
        const result = await window.saveFileToProject(
            projectRootHandle,
            pathPart,
            fileInfo.name,
            code
        );

        if (result.success) {
            savedCount++;
            console.log('[BULK] ✓ Saved successfully. Total:', savedCount);

            // Visual feedback on individual button
            downloadBtn.innerHTML = '✓ Saved';
            downloadBtn.classList.add('downloaded');

            // Update tooltip to show ACTUAL saved path (not original unstripped path)
            const displayPath = pathPart
                ? `${rootHandleName}/${pathPart}/${fileInfo.name}`
                : `${rootHandleName}/${fileInfo.name}`;
            downloadBtn.title = `Saved to ${displayPath}`;

            // Update data-fullpath to reflect actual saved path (for consistency)
            // This ensures Alt+Click will show the correct path on subsequent edits
            downloadBtn.setAttribute('data-fullpath', fileInfo.fullPath);
        } else {
            failedCount++;
            console.error('[BULK] ✗ Save failed. Total failed:', failedCount);

            // Check for critical errors (directory deleted/inaccessible)
            if (result.error && (
                result.error.name === 'NotFoundError' ||
                result.error.name === 'NotAllowedError'
            )) {
                // Critical error - stop bulk download
                aborted = true;
                fileSystem.setHandle(null); // Reset handle

                alert(`❌ Bulk download stopped!\n\nThe project directory is no longer accessible.\nSaved ${savedCount} files before error.\n\nClick the button again to select a new directory and retry.`);

                buttonElement.innerHTML = '⚠️ Directory Lost - Click to Retry';
                buttonElement.disabled = false;
                return;
            }
        }
    }

    // Final status (only if not aborted)
    if (!aborted) {
        const infoText = buttonElement.parentElement?.querySelector('.bulk-download-info');
        const messageHash = getMessageHashFromDiv(messageDiv);

        // Merge root handle name into structure for display in future view-only sessions
        const structureWithRoot = {
            ...structure,
            rootHandleName: structure.rootHandleName || rootHandleName || 'project_root'
        };

        buttonElement.setAttribute('data-root-name', structureWithRoot.rootHandleName || '');
        try {
            buttonElement.setAttribute('data-structure', JSON.stringify(structureWithRoot));
        } catch (err) {
            console.warn('Failed to update data-structure with root info:', err);
        }

        if (failedCount > 0) {
            buttonElement.innerHTML = '⚠️ View project tree';
            buttonElement.title = 'Some files failed; view project tree';
            if (infoText) {
                infoText.textContent = 'Download finished; some files failed. View tree.';
            }
        } else {
            buttonElement.innerHTML = '👁 View project tree';
            buttonElement.title = 'View project tree';
            if (infoText) {
                infoText.textContent = 'Files downloaded. View tree.';
            }
        }

        buttonElement.disabled = false; // Allow viewing the tree
        buttonElement.setAttribute('data-view-only', 'true'); // Switch to view-only mode
        buttonElement.classList.add('downloaded');

        // BUG FIX: Persist conflict strategy, duplicate prefix mode, and conflicts array
        if (messageHash) {
            persistBulkState(messageHash, {
                structure: structureWithRoot,
                failedCount,
                rootHandleName: structureWithRoot.rootHandleName || null,
                conflictStrategy: metadata.conflictStrategy || null,
                conflicts: metadata.conflicts || null,
                savedAt: Date.now()
            });
        }
    }
}
