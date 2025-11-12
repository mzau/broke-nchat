// UI rendering and interaction module

// ============================================
// MESSAGE TYPE CONSTANTS
// ============================================

const MESSAGE_TYPE = {
    USER: 'user',
    BOT: 'bot'
};

// ============================================
// STATUS & CONNECTION
// ============================================

window.updateConnectionStatus = function(connected, message = '') {
    const dot = document.getElementById('connectionDot');
    const statusText = document.getElementById('statusText');

    if (connected) {
        dot.classList.remove('offline');
        statusText.textContent = message || 'Connected';
    } else {
        dot.classList.add('offline');
        statusText.textContent = message || 'Disconnected';
    }
};

window.updateModelInfo = function(model = '', complexity = null, responseTime = null) {
    // Model info is now shown in message headers only, not in status bar
    // This function is kept for backward compatibility but does nothing
    console.log('Model info:', model, complexity, responseTime);
};

window.getComplexityTier = function(complexity) {
    if (complexity < 0.4) return 'Fast';
    if (complexity < 0.85) return 'Balanced';
    return 'Premium';
};

// ============================================
// TYPING INDICATOR
// ============================================

window.showTypingIndicator = function(model = '') {
    // Show spinner and update status text
    const dot = document.getElementById('connectionDot');
    const spinner = document.getElementById('statusSpinner');
    const statusText = document.getElementById('statusText');

    if (dot) dot.style.display = 'none';
    if (spinner) spinner.style.display = 'block';

    const modelName = model || 'Model';
    statusText.textContent = `${modelName} working...`;
};

window.hideTypingIndicator = function() {
    // Hide spinner, show dot, reset status
    const dot = document.getElementById('connectionDot');
    const spinner = document.getElementById('statusSpinner');

    if (spinner) spinner.style.display = 'none';
    if (dot) dot.style.display = 'block';

    updateConnectionStatus(true, 'Connected');
};

// ============================================
// RAW DEBUG VIEW
// ============================================

window.updateRawDebugView = function(content) {
    window.rawOutputBuffer += content;
    const rawContent = document.getElementById('rawContent');
    rawContent.textContent = window.rawOutputBuffer;
};

// ============================================
// FILE ATTACHMENTS IN MESSAGES
// ============================================

window.renderFileAttachments = function(files) {
    return files.map((file, index) => {
        const fileId = `file-${Date.now()}-${index}`;
        const sizeFormatted = formatFileSize(file.size);

        return `
            <div class="file-attachment-chip">
                <div class="file-chip-header" onclick="toggleFileContent('${fileId}')">
                    <span class="file-chip-icon">📄</span>
                    <span class="file-chip-name">${escapeHtmlForChat(file.name)}</span>
                    <span class="file-chip-size">(${sizeFormatted})</span>
                    <span class="file-chip-toggle" id="${fileId}-toggle">▼</span>
                </div>
                <div class="file-chip-content" id="${fileId}" style="display: none;">
                    <pre><code class="language-${file.language}">${escapeHtmlForChat(file.content)}</code></pre>
                </div>
            </div>
        `;
    }).join('');
};

window.toggleFileContent = function(fileId) {
    const contentDiv = document.getElementById(fileId);
    const toggleIcon = document.getElementById(fileId + '-toggle');

    if (contentDiv.style.display === 'none') {
        contentDiv.style.display = 'block';
        toggleIcon.textContent = '▲';
    } else {
        contentDiv.style.display = 'none';
        toggleIcon.textContent = '▼';
    }
};

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtmlForChat(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// MESSAGE RENDERING
// ============================================

window.addMessage = function(content, type, model = null, files = null) {
    const chatArea = document.getElementById('chatArea');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;

    if (type === 'user') {
        // User messages - simple text, no markdown
        const textContent = files && files.length > 0
            ? content.split('\n\n---\n**Attached Files:**')[0].trim() // Remove file content from display
            : content;

        messageDiv.innerHTML = `
            <strong>You:</strong> ${escapeHtmlForChat(textContent)}
            <button class="copy-button">📋 Copy</button>
        `;

        // Add collapsible file attachments if present
        if (files && files.length > 0) {
            const filesContainer = document.createElement('div');
            filesContainer.className = 'message-files';
            filesContainer.innerHTML = renderFileAttachments(files);
            messageDiv.insertBefore(filesContainer, messageDiv.querySelector('.copy-button'));
        }

        // Add copy event listener
        const copyButton = messageDiv.querySelector('.copy-button');
        copyButton.addEventListener('click', () => copyToClipboard(content, copyButton));

        // Add timestamp to user messages
        const metadataDiv = document.createElement('div');
        metadataDiv.className = 'message-metadata';
        metadataDiv.innerHTML = `<span>${new Date().toLocaleTimeString('en-US')}</span>`;
        messageDiv.appendChild(metadataDiv);
    } else {
        const modelInfo = model && model !== 'error' ? ` (${model})` : '';

        // Bot messages - render markdown
        const renderedContent = renderMarkdown(content);
        messageDiv.innerHTML = `
            <strong>BROKE${modelInfo}:</strong>
            <div class="message-content">
                ${renderedContent}
                <button class="copy-button">📋 Copy</button>
            </div>
        `;

        // Add copy event listener
        const copyButton = messageDiv.querySelector('.copy-button');
        copyButton.addEventListener('click', () => copyToClipboard(content, copyButton));

        // Add metadata for bot messages
        const metadataDiv = document.createElement('div');
        metadataDiv.className = 'message-metadata';
        metadataDiv.innerHTML = `<span>${new Date().toLocaleTimeString('en-US')}</span>`;
        messageDiv.appendChild(metadataDiv);
    }

    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
};

// Copy to clipboard functionality
async function copyToClipboard(text, buttonElement) {
    try {
        await navigator.clipboard.writeText(text);

        // Visual feedback
        const originalText = buttonElement.textContent;
        buttonElement.textContent = '✓ Copied!';
        buttonElement.classList.add('copied');

        setTimeout(() => {
            buttonElement.textContent = originalText;
            buttonElement.classList.remove('copied');
        }, 2000);
    } catch (err) {
        console.error('Copy failed:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);

        buttonElement.textContent = '✓ Copied!';
        setTimeout(() => {
            buttonElement.textContent = '📋 Copy';
        }, 2000);
    }
}

// ============================================
// STREAMING MESSAGE UPDATES
// ============================================

window.createBotMessagePlaceholder = function() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    messageDiv.innerHTML = '<strong>BROKE:</strong> <div class="message-content"></div>';
    messageDiv.setAttribute('data-content', '');
    return messageDiv;
};

window.appendToBotMessage = function(messageDiv, content, model, complexity = null) {
    let currentContent = messageDiv.getAttribute('data-content') || '';
    currentContent += content;
    messageDiv.setAttribute('data-content', currentContent);

    const contentDiv = messageDiv.querySelector('.message-content');
    const renderedContent = renderMarkdown(currentContent);

    const modelInfo = model && model !== 'unknown' ? ` (${model})` : '';
    const complexityInfo = complexity !== null ? ` ${getComplexityTier(complexity)}` : '';

    messageDiv.querySelector('strong').textContent = `BROKE${modelInfo}${complexityInfo}:`;

    contentDiv.innerHTML = renderedContent;
};

window.finalizeBotMessage = function(messageDiv, model, responseTime, complexity = null, routingData = null, requestId = null) {
    const contentDiv = messageDiv.querySelector('.message-content');

    // Add copy button
    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.textContent = '📋 Copy';
    const content = messageDiv.getAttribute('data-content') || '';
    copyButton.addEventListener('click', () => copyToClipboard(content, copyButton));
    contentDiv.appendChild(copyButton);

    // Add metadata
    const metadataDiv = document.createElement('div');
    metadataDiv.className = 'message-metadata';

    let metadataHTML = `<span>${new Date().toLocaleTimeString('en-US')}</span>`;
    if (responseTime) {
        metadataHTML += ` • <span>${responseTime}ms</span>`;
    }
    if (model && model !== 'unknown') {
        metadataHTML += ` • <span>Model: ${model}</span>`;
    }

    metadataDiv.innerHTML = metadataHTML;
    messageDiv.appendChild(metadataDiv);

    // Add star rating if routing data available
    if (routingData && requestId) {
        addStarRating(messageDiv, requestId, routingData);
    }
};

// ============================================
// STAR RATING & FEEDBACK
// ============================================

function addStarRating(messageDiv, requestId, routingData) {
    const ratingDiv = document.createElement('div');
    ratingDiv.className = 'star-rating';
    ratingDiv.innerHTML = `
        <span class="rating-label">Rate this response:</span>
        <div class="stars">
            ${[1, 2, 3, 4, 5].map(rating =>
                `<span class="star" data-rating="${rating}" onclick="rateResponse('${requestId}', ${rating}, '${routingData?.selected_model || 'unknown'}')">★</span>`
            ).join('')}
        </div>
        <button class="routing-info-btn" onclick="showRoutingInfo(${JSON.stringify(routingData).replace(/"/g, '&quot;')})">
            🧠 Routing Info
        </button>
    `;

    messageDiv.appendChild(ratingDiv);
}

window.rateResponse = function(requestId, rating, model) {
    console.log(`Rating ${rating} stars for request ${requestId} (model: ${model})`);

    // Store vote
    if (!window.userVotes) window.userVotes = new Map();
    window.userVotes.set(requestId, { rating, model, timestamp: Date.now() });

    // Update UI
    const stars = document.querySelectorAll(`[onclick*="${requestId}"]`);
    stars.forEach((star, index) => {
        if (index < rating) {
            star.classList.add('selected');
        } else {
            star.classList.remove('selected');
        }
    });

    // Send to server if endpoint available
    if (serverCapabilities && serverCapabilities.hasVoteEndpoint) {
        submitVote(requestId, rating, model);
    }
};

async function submitVote(requestId, rating, model) {
    try {
        await fetch(`${API_BASE}/debug/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify({
                request_id: requestId,
                rating: rating,
                model: model,
                timestamp: new Date().toISOString()
            })
        });
        console.log('Vote submitted successfully');
    } catch (error) {
        console.error('Failed to submit vote:', error);
    }
}

// ============================================
// ROUTING INFO MODAL
// ============================================

window.showRoutingInfo = function(routingData) {
    const modal = document.getElementById('routingModal');
    const details = document.getElementById('routingDetails');

    details.innerHTML = `
        <div class="routing-detail">
            <strong>Selected Model:</strong> ${routingData.selected_model || 'Unknown'}
        </div>
        <div class="routing-detail">
            <strong>Complexity Score:</strong> ${routingData.complexity_score?.toFixed(3) || 'N/A'}
        </div>
        <div class="routing-detail">
            <strong>Tier:</strong> ${getComplexityTier(routingData.complexity_score)}
        </div>
        ${routingData.reasoning ? `
            <div class="routing-detail">
                <strong>Reasoning:</strong> ${routingData.reasoning}
            </div>
        ` : ''}
        ${routingData.alternatives ? `
            <div class="routing-detail">
                <strong>Alternative Models:</strong>
                <ul>
                    ${routingData.alternatives.map(alt =>
                        `<li>${alt.model} (score: ${alt.score?.toFixed(3) || 'N/A'})</li>`
                    ).join('')}
                </ul>
            </div>
        ` : ''}
    `;

    modal.style.display = 'flex';
};

window.closeRoutingModal = function() {
    const modal = document.getElementById('routingModal');
    modal.style.display = 'none';
};
