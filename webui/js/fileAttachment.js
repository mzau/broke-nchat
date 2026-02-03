// File Attachment Module
// Handles text file and image uploads, format detection, and content formatting

// State management
let attachedFiles = [];

// File size limits
const MAX_TEXT_FILE_SIZE = 50 * 1024;      // 50KB for text files
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;   // 20MB for images (MLX-Server supports up to 50MB)
const MAX_AUDIO_SIZE_CHAT = 5 * 1024 * 1024;    // 5MB for chat audio (input_audio in chat/completions)
const MAX_AUDIO_SIZE_TRANSCRIPTION = 50 * 1024 * 1024;  // 50MB for transcription endpoint (Whisper/Voxtral)

// Image file extensions
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const AUDIO_EXTENSIONS = ['wav', 'mp3'];

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
 * Checks if a file is an audio file based on extension
 */
function isAudioFile(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    return AUDIO_EXTENSIONS.includes(extension);
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
 * Gets audio format from filename (OpenAI input_audio expects "wav" or "mp3")
 */
function getAudioFormat(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    if (extension === 'mp3') return 'mp3';
    return 'wav';
}

/**
 * Determines the audio endpoint strategy based on model ID
 * @param {string} modelId - The model identifier
 * @returns {'transcriptions' | 'chat' | 'try_transcriptions_first'}
 */
function getAudioEndpointStrategy(modelId) {
    if (!modelId) return 'chat';
    const id = modelId.toLowerCase();

    // Known STT models → use /v1/audio/transcriptions directly
    if (id.includes('whisper') || id.includes('voxtral')) {
        return 'transcriptions';
    }

    // Known multimodal chat models → use chat/completions with input_audio
    if (id.includes('gemma-3n') || id.includes('gemma3n')) {
        return 'chat';
    }

    // Unknown → try transcriptions first, fallback to chat on error
    return 'try_transcriptions_first';
}

// Export for use in chat.js
window.getAudioEndpointStrategy = getAudioEndpointStrategy;

/**
 * Formats audio duration in mm:ss
 */
function formatDuration(seconds) {
    if (seconds === null || seconds === undefined || !isFinite(seconds)) {
        return '—';
    }
    const total = Math.round(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
 * Reads audio file as Base64 data URL
 */
function readAudioAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            resolve(e.target.result); // data:audio/...;base64,...
        };

        reader.onerror = () => {
            reject(new Error('Failed to read audio'));
        };

        reader.readAsDataURL(file);
    });
}

/**
 * Loads audio metadata (duration) from a blob URL
 */
async function decodeAudioDurationFromFile(file) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
        return null;
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const ctx = new AudioCtx();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        if (ctx.close) {
            ctx.close();
        }
        return audioBuffer?.duration || null;
    } catch (error) {
        return null;
    }
}

function loadAudioDuration(objectUrl, file) {
    return new Promise((resolve) => {
        const audio = new Audio();
        let timeoutId = null;
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(value);
        };
        const cleanup = () => {
            audio.removeEventListener('loadedmetadata', onLoaded);
            audio.removeEventListener('loadeddata', onLoaded);
            audio.removeEventListener('canplaythrough', onLoaded);
            audio.removeEventListener('error', onError);
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        };
        const onLoaded = () => {
            if (isFinite(audio.duration) && audio.duration > 0) {
                finish(audio.duration);
            }
        };
        const onError = () => {
            finish(null);
        };
        audio.preload = 'metadata';
        audio.src = objectUrl;
        audio.addEventListener('loadedmetadata', onLoaded);
        audio.addEventListener('loadeddata', onLoaded);
        audio.addEventListener('canplaythrough', onLoaded);
        audio.addEventListener('error', onError);
        // Some browsers never fire loadedmetadata for local blobs; avoid hanging forever.
        timeoutId = setTimeout(async () => {
            cleanup();
            const decodedDuration = await decodeAudioDurationFromFile(file);
            finish(decodedDuration);
        }, 1500);
        audio.load();
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
        const isAudio = isAudioFile(file.name);
        // Audio: Allow up to 50MB for transcription models (Whisper/Voxtral)
        // Actual limit depends on model - checked at send time
        const maxSize = isImage ? MAX_IMAGE_SIZE : (isAudio ? MAX_AUDIO_SIZE_TRANSCRIPTION : MAX_TEXT_FILE_SIZE);

        // Check file size
        if (file.size > maxSize) {
            const limitInfo = isAudio ? ' (transcription models support up to 50MB)' : '';
            alert(`File "${file.name}" is too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(maxSize)}${limitInfo}.`);
            continue;
        }

        // Only 1 audio per request (mlx-vlm limitation)
        if (isAudio && attachedFiles.some(f => f.type === 'audio')) {
            alert('Only one audio file can be attached per request.');
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
            } else if (isAudio) {
                const objectUrl = URL.createObjectURL(file);
                try {
                const durationSeconds = await loadAudioDuration(objectUrl, file);
                    const durationLabel = formatDuration(durationSeconds);
                    const base64DataUrl = await readAudioAsBase64(file);
                    const base64 = base64DataUrl.split(',')[1] || '';

                    attachedFiles.push({
                        type: 'audio',
                        name: file.name,
                        size: file.size,
                        format: getAudioFormat(file.name),
                        base64: base64,
                        file: file,  // Keep original File for multipart upload
                        objectUrl: objectUrl,
                        duration: durationSeconds,
                        durationLabel: durationLabel
                    });
                } catch (error) {
                    URL.revokeObjectURL(objectUrl);
                    throw error;
                }
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
        } else if (file.type === 'audio') {
            const duration = file.durationLabel ? ` · ${file.durationLabel}` : '';
            return `
                <div class="attached-file-item attached-audio-item">
                    <span class="file-icon">🎧</span>
                    <div class="file-info">
                        <span class="file-name">${escapeHtml(file.name)}</span>
                        <span class="file-size">${formatFileSize(file.size)}${duration}</span>
                        <audio class="audio-preview" controls src="${file.objectUrl}"></audio>
                    </div>
                    <button class="file-remove-btn" onclick="removeAttachedFile(${index})" title="Remove audio">×</button>
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
    const file = attachedFiles[index];
    if (file && file.type === 'audio' && file.objectUrl) {
        URL.revokeObjectURL(file.objectUrl);
    }
    attachedFiles.splice(index, 1);
    updateAttachedFilesUI();
}

/**
 * Clears all attached files
 */
function clearAttachedFiles() {
    attachedFiles.forEach(file => {
        if (file.type === 'audio' && file.objectUrl) {
            URL.revokeObjectURL(file.objectUrl);
        }
    });
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
 * Gets attached audio in OpenAI input_audio format
 * Returns array of audio content parts (max 1)
 */
function getAttachedAudioForAPI() {
    return attachedFiles
        .filter(f => f.type === 'audio')
        .map(f => ({
            type: 'input_audio',
            input_audio: {
                data: f.base64,
                format: f.format
            }
        }));
}

/**
 * Gets the first attached audio File object for transcription API (multipart upload)
 * @returns {File|null} The original File object or null if no audio attached
 */
function getAttachedAudioFile() {
    const audioFile = attachedFiles.find(f => f.type === 'audio');
    return audioFile?.file || null;
}

/**
 * Checks if there are any attached images
 */
function hasAttachedImages() {
    return attachedFiles.some(f => f.type === 'image');
}

/**
 * Checks if there are any attached audio files
 */
function hasAttachedAudio() {
    return attachedFiles.some(f => f.type === 'audio');
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
        } else if (file.type === 'audio') {
            return {
                type: 'audio',
                name: file.name,
                size: file.size,
                format: file.format,
                duration: file.duration,
                durationLabel: file.durationLabel
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
window.getAttachedAudioForAPI = getAttachedAudioForAPI;
window.getAttachedAudioFile = getAttachedAudioFile;
window.hasAttachedImages = hasAttachedImages;
window.hasAttachedAudio = hasAttachedAudio;
