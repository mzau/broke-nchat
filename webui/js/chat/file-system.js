// File System Access API Wrapper
// Handles directory selection, file creation, and permission management

/**
 * Global state for project root directory handle
 */
let projectRootHandle = null;

/**
 * Get current project root handle (for single-file downloads)
 */
window.getProjectRootHandle = function() {
    return projectRootHandle;
};

/**
 * Ensure a valid project root handle (shared with single-file saves)
 * @param {boolean} forceNew - If true, always prompt for a new directory
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
window.ensureProjectRootHandle = async function(forceNew = false) {
    if (forceNew) {
        projectRootHandle = null;
    }

    const isValid = await verifyProjectRoot();
    if (!projectRootHandle || !isValid) {
        if (!isValid && projectRootHandle) {
            console.log('Existing project root lost or inaccessible, requesting new selection');
            projectRootHandle = null;
        }

        const selected = await selectProjectRoot();
        if (!selected) return null;
    }

    return projectRootHandle;
};

/**
 * Prompts user to select project root folder
 * Stores handle for subsequent downloads
 */
async function selectProjectRoot() {
    try {
        // Check if File System Access API is available
        if (!('showDirectoryPicker' in window)) {
            alert('Your browser does not support directory selection. Please use Chrome or Edge.');
            return false;
        }

        projectRootHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'documents'
        });

        console.log('Project root selected:', projectRootHandle.name);
        return true;

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('User cancelled directory selection');
        } else {
            console.error('Error selecting directory:', error);
            alert('Failed to select directory: ' + error.message);
        }
        return false;
    }
}

/**
 * Creates nested directories in the selected root
 * Returns: DirectoryHandle for the target directory
 */
async function createDirectoryPath(rootHandle, pathString) {
    if (!pathString) return rootHandle;

    const parts = pathString.split('/').filter(p => p);
    let currentHandle = rootHandle;

    for (const part of parts) {
        try {
            currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
        } catch (error) {
            console.error(`Failed to create directory: ${part}`, error);
            throw error;
        }
    }

    return currentHandle;
}

/**
 * Saves a file to the project directory with optional subdirectory path
 * Exported for use by single-file downloads
 * @param {FileSystemDirectoryHandle} rootHandle - Root directory handle
 * @param {string} filePath - Subdirectory path (e.g., "src/components")
 * @param {string} fileName - File name (e.g., "App.js")
 * @param {string} content - File content
 * @returns {Promise<{success: boolean, error?: Error}>}
 */
window.saveFileToProject = async function saveFileToProject(rootHandle, filePath, fileName, content) {
    console.log(`[SAVE] Starting save - rootHandle:`, rootHandle, 'path:', filePath, 'file:', fileName);

    try {
        // Create directory path if needed
        console.log(`[SAVE] Creating directory path: "${filePath}"`);
        const dirHandle = await createDirectoryPath(rootHandle, filePath);
        console.log(`[SAVE] Directory handle obtained:`, dirHandle);

        // Create file
        console.log(`[SAVE] Creating file: "${fileName}"`);
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        console.log(`[SAVE] File handle obtained, creating writable...`);

        const writable = await fileHandle.createWritable();
        console.log(`[SAVE] Writing ${content.length} bytes...`);
        await writable.write(content);
        await writable.close();

        console.log(`[SAVE] ✓ Successfully saved: ${filePath}/${fileName}`);
        return { success: true };

    } catch (error) {
        console.error(`[SAVE] ✗ Failed to save ${filePath}/${fileName}:`, error);
        return { success: false, error };
    }
};

/**
 * Verifies that the project root directory handle is still valid
 * Returns true if valid, false if directory was deleted or permission lost
 */
async function verifyProjectRoot() {
    if (!projectRootHandle) return false;

    try {
        // Verify permission - this is sufficient to check validity
        const permission = await projectRootHandle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            return false;
        }

        // Permission granted means the directory still exists and is accessible
        return true;
    } catch (error) {
        console.warn('Project root verification failed:', error);
        return false;
    }
}

// Export for internal use by other modules
window.__fileSystem = {
    getHandle: () => projectRootHandle,
    setHandle: (handle) => { projectRootHandle = handle; },
    selectRoot: selectProjectRoot,
    verifyRoot: verifyProjectRoot
};
