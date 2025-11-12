// File Attachment Module
// Handles text file uploads, format detection, and content formatting

// State management
let attachedFiles = [];

// File size limit (50KB)
const MAX_FILE_SIZE = 50 * 1024;

// Language detection mapping (file extension -> markdown language identifier)
const LANGUAGE_MAP = {
    'py': 'python',
    'js': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'jsx': 'javascript',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'html': 'html',
    'css': 'css',
    'xml': 'xml',
    'md': 'markdown',
    'sh': 'bash',
    'bash': 'bash',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'java': 'java',
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'rb': 'ruby',
    'swift': 'swift',
    'kt': 'kotlin',
    'sql': 'sql',
    'r': 'r',
    'log': 'log',
    'txt': 'text',
    'csv': 'csv'
};

/**
 * Detects programming language from file extension
 */
function detectLanguage(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    return LANGUAGE_MAP[extension] || 'text';
}

/**
 * Formats file size for display
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Handles file selection from input
 */
async function handleFileSelect(event) {
    const files = event.target.files;

    for (let file of files) {
        // Check file size
        if (file.size > MAX_FILE_SIZE) {
            alert(`File "${file.name}" is too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`);
            continue;
        }

        // Check if file is already attached
        if (attachedFiles.some(f => f.name === file.name)) {
            alert(`File "${file.name}" is already attached.`);
            continue;
        }

        try {
            // Read file content
            const content = await readFileContent(file);

            // Add to attached files
            attachedFiles.push({
                name: file.name,
                size: file.size,
                content: content,
                language: detectLanguage(file.name)
            });

        } catch (error) {
            console.error('Error reading file:', error);
            alert(`Failed to read file "${file.name}": ${error.message}`);
        }
    }

    // Clear file input to allow re-selecting the same file
    event.target.value = '';

    // Update UI
    updateAttachedFilesUI();
}

/**
 * Reads file content as text
 */
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            resolve(e.target.result);
        };

        reader.onerror = (e) => {
            reject(new Error('Failed to read file'));
        };

        reader.readAsText(file);
    });
}

/**
 * Updates the UI to show attached files
 */
function updateAttachedFilesUI() {
    const filesArea = document.getElementById('attachedFilesArea');
    const filesList = document.getElementById('attachedFilesList');

    if (attachedFiles.length === 0) {
        filesArea.style.display = 'none';
        filesList.innerHTML = '';
        return;
    }

    filesArea.style.display = 'block';

    // Build files list HTML
    filesList.innerHTML = attachedFiles.map((file, index) => `
        <div class="attached-file-item">
            <span class="file-icon">📄</span>
            <div class="file-info">
                <span class="file-name">${escapeHtml(file.name)}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
            <button class="file-remove-btn" onclick="removeAttachedFile(${index})" title="Remove file">×</button>
        </div>
    `).join('');
}

/**
 * Removes a file from attached files list
 */
function removeAttachedFile(index) {
    attachedFiles.splice(index, 1);
    updateAttachedFilesUI();
}

/**
 * Clears all attached files
 */
function clearAttachedFiles() {
    attachedFiles = [];
    updateAttachedFilesUI();
}

/**
 * Gets formatted content of all attached files as markdown
 * Returns string to be appended to user prompt
 */
function getAttachedFilesContent() {
    if (attachedFiles.length === 0) {
        return '';
    }

    let content = '\n\n---\n**Attached Files:**\n\n';

    for (let file of attachedFiles) {
        content += `**File: ${file.name}**\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n\n`;
    }

    return content;
}

/**
 * Escapes HTML characters to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Gets count of attached files
 */
function getAttachedFilesCount() {
    return attachedFiles.length;
}

/**
 * Gets metadata of attached files (for UI display, includes content)
 * Returns array of {name, size, language, content}
 */
function getAttachedFilesMetadata() {
    return attachedFiles.map(file => ({
        name: file.name,
        size: file.size,
        language: file.language,
        content: file.content
    }));
}

// Export functions for use by other modules
window.handleFileSelect = handleFileSelect;
window.removeAttachedFile = removeAttachedFile;
window.clearAttachedFiles = clearAttachedFiles;
window.getAttachedFilesContent = getAttachedFilesContent;
window.getAttachedFilesCount = getAttachedFilesCount;
window.getAttachedFilesMetadata = getAttachedFilesMetadata;
