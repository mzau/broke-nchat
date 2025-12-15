// File Attachment Module
// Handles text file and image uploads, format detection, and content formatting

// State management
let attachedFiles = [];

// File size limits
const MAX_TEXT_FILE_SIZE = 50 * 1024;      // 50KB for text files
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;   // 20MB for images (MLX-Server supports up to 50MB)

// Image file extensions
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

// Thumbnail settings
const THUMBNAIL_MAX_SIZE = 100; // Max dimension in pixels

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
 * Checks if a file is an image based on extension
 */
function isImageFile(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    return IMAGE_EXTENSIONS.includes(extension);
}

/**
 * Gets MIME type from file extension
 */
function getMimeType(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

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
 * Reads image file as Base64 data URL
 */
function readImageAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            resolve(e.target.result); // data:image/...;base64,...
        };

        reader.onerror = (e) => {
            reject(new Error('Failed to read image'));
        };

        reader.readAsDataURL(file);
    });
}

/**
 * Creates a thumbnail from a Base64 image data URL
 * Returns a smaller Base64 data URL for UI display
 */
function createThumbnail(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            // Calculate thumbnail dimensions (maintain aspect ratio)
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > THUMBNAIL_MAX_SIZE) {
                    height = Math.round(height * THUMBNAIL_MAX_SIZE / width);
                    width = THUMBNAIL_MAX_SIZE;
                }
            } else {
                if (height > THUMBNAIL_MAX_SIZE) {
                    width = Math.round(width * THUMBNAIL_MAX_SIZE / height);
                    height = THUMBNAIL_MAX_SIZE;
                }
            }

            // Create canvas and draw resized image
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to data URL (JPEG for smaller size)
            const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
            resolve({
                thumbnail,
                originalWidth: img.width,
                originalHeight: img.height
            });
        };

        img.onerror = () => {
            reject(new Error('Failed to create thumbnail'));
        };

        img.src = dataUrl;
    });
}

/**
 * Handles file selection from input
 */
async function handleFileSelect(event) {
    const files = event.target.files;

    for (let file of files) {
        const isImage = isImageFile(file.name);
        const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_TEXT_FILE_SIZE;

        // Check file size
        if (file.size > maxSize) {
            alert(`File "${file.name}" is too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(maxSize)}.`);
            continue;
        }

        // Check if file is already attached
        if (attachedFiles.some(f => f.name === file.name)) {
            alert(`File "${file.name}" is already attached.`);
            continue;
        }

        try {
            if (isImage) {
                // Read image as Base64
                const base64 = await readImageAsBase64(file);
                const { thumbnail, originalWidth, originalHeight } = await createThumbnail(base64);

                attachedFiles.push({
                    type: 'image',
                    name: file.name,
                    size: file.size,
                    base64: base64,
                    mimeType: getMimeType(file.name),
                    thumbnail: thumbnail,
                    width: originalWidth,
                    height: originalHeight
                });
            } else {
                // Read text file
                const content = await readFileContent(file);

                attachedFiles.push({
                    type: 'text',
                    name: file.name,
                    size: file.size,
                    content: content,
                    language: detectLanguage(file.name)
                });
            }
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
    filesList.innerHTML = attachedFiles.map((file, index) => {
        if (file.type === 'image') {
            // Image file with thumbnail
            return `
                <div class="attached-file-item attached-image-item">
                    <img src="${file.thumbnail}" alt="${escapeHtml(file.name)}" class="image-thumbnail">
                    <div class="file-info">
                        <span class="file-name">${escapeHtml(file.name)}</span>
                        <span class="file-size">${file.width}×${file.height} · ${formatFileSize(file.size)}</span>
                    </div>
                    <button class="file-remove-btn" onclick="removeAttachedFile(${index})" title="Remove image">×</button>
                </div>
            `;
        } else {
            // Text file with icon
            return `
                <div class="attached-file-item">
                    <span class="file-icon">📄</span>
                    <div class="file-info">
                        <span class="file-name">${escapeHtml(file.name)}</span>
                        <span class="file-size">${formatFileSize(file.size)}</span>
                    </div>
                    <button class="file-remove-btn" onclick="removeAttachedFile(${index})" title="Remove file">×</button>
                </div>
            `;
        }
    }).join('');
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
 * Gets formatted content of all attached TEXT files as markdown
 * Returns string to be appended to user prompt
 * Note: Images are NOT included here (they use getAttachedImagesForAPI)
 */
function getAttachedFilesContent() {
    const textFiles = attachedFiles.filter(f => f.type === 'text');

    if (textFiles.length === 0) {
        return '';
    }

    let content = '\n\n---\n**Attached Files:**\n\n';

    for (let file of textFiles) {
        content += `**File: ${file.name}**\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n\n`;
    }

    return content;
}

/**
 * Gets attached images in OpenAI Vision API format
 * Returns array of image content parts for multimodal messages
 */
function getAttachedImagesForAPI() {
    return attachedFiles
        .filter(f => f.type === 'image')
        .map(f => ({
            type: 'image_url',
            image_url: { url: f.base64 }
        }));
}

/**
 * Checks if there are any attached images
 */
function hasAttachedImages() {
    return attachedFiles.some(f => f.type === 'image');
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
 * Gets metadata of attached files (for UI display)
 * Returns array with different fields for text vs image files
 */
function getAttachedFilesMetadata() {
    return attachedFiles.map(file => {
        if (file.type === 'image') {
            return {
                type: 'image',
                name: file.name,
                size: file.size,
                mimeType: file.mimeType,
                thumbnail: file.thumbnail,
                width: file.width,
                height: file.height
            };
        } else {
            return {
                type: 'text',
                name: file.name,
                size: file.size,
                language: file.language,
                content: file.content
            };
        }
    });
}

// Export functions for use by other modules
window.handleFileSelect = handleFileSelect;
window.removeAttachedFile = removeAttachedFile;
window.clearAttachedFiles = clearAttachedFiles;
window.getAttachedFilesContent = getAttachedFilesContent;
window.getAttachedFilesCount = getAttachedFilesCount;
window.getAttachedFilesMetadata = getAttachedFilesMetadata;
window.getAttachedImagesForAPI = getAttachedImagesForAPI;
window.hasAttachedImages = hasAttachedImages;
