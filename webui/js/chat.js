// Chat state variables
let currentTypingIndicator = null;
let currentBotMessage = null;
let sessionStartTime = null;
let lastRoutingInfo = null;
let rawOutputBuffer = "";
let userVotes = new Map(); // Store user votes for training data

// One-time cleanup: Remove legacy localStorage data (migrated to sessionStorage in v0.1.5)
if (localStorage.getItem('broke_chat_history') || localStorage.getItem('broke_selected_model')) {
    console.log('[CLEANUP] Removing legacy localStorage data...');
    localStorage.removeItem('broke_chat_history');
    localStorage.removeItem('broke_selected_model');
    console.log('[CLEANUP] Legacy data removed');
}

let conversationHistory = JSON.parse(sessionStorage.getItem('broke_chat_history') || '[]'); // Session-scoped history (cleared on tab close)
let lastSelectedModel = sessionStorage.getItem('broke_selected_model') || ''; // Track model changes (session-scoped)

// Streaming control
let currentReader = null;
let currentController = null;
let isStreaming = false;

/**
 * Sanitizes conversation history for storage
 * Replaces Base64 image data with placeholder to reduce size
 */
function sanitizeHistoryForStorage(history) {
    return history.map(msg => {
        if (Array.isArray(msg.content)) {
            // Multimodal message - replace image URLs with placeholder
            return {
                ...msg,
                content: msg.content.map(part => {
                    if (part.type === 'image_url' && part.image_url?.url?.startsWith('data:')) {
                        return {
                            type: 'image_url',
                            image_url: { url: '[IMAGE_DATA_REMOVED]' }
                        };
                    }
                    if (part.type === 'input_audio' && typeof part.input_audio?.data === 'string' && part.input_audio.data.length > 0) {
                        return {
                            type: 'input_audio',
                            input_audio: {
                                ...part.input_audio,
                                data: '[AUDIO_DATA_REMOVED]'
                            }
                        };
                    }
                    return part;
                })
            };
        }
        return msg;
    });
}

/**
 * Saves conversation history to sessionStorage (with sanitized images)
 */
function saveConversationHistory() {
    try {
        const sanitized = sanitizeHistoryForStorage(conversationHistory);
        sessionStorage.setItem('broke_chat_history', JSON.stringify(sanitized));
    } catch (e) {
        console.warn('[STORAGE] Failed to save history:', e.message);
    }
}

/**
 * Sanitizes conversation history for API requests
 * Removes messages with image placeholders (from reloaded sessions)
 * @param {Array} history - Conversation history array
 * @returns {Array} - Filtered history safe for API requests
 */
function sanitizeHistoryForAPI(history) {
    const lastIndex = history.length - 1;

    return history.map((msg, index) => {
        if (!Array.isArray(msg.content)) {
            return msg;
        }

        const isLastUserMessage = index === lastIndex && msg.role === 'user';

        const filteredParts = msg.content.filter(part => {
            if (part.type === 'image_url') {
                const url = part.image_url?.url;
                if (!url || url === '[IMAGE_DATA_REMOVED]') {
                    return false;
                }
            }
            if (part.type === 'input_audio') {
                // Only keep audio in the LAST user message (current request)
                // Filter audio from historical messages to prevent sending
                // large base64 data to text models after model switch
                if (!isLastUserMessage) {
                    return false;
                }
                // Also filter if it's a placeholder
                const data = part.input_audio?.data;
                if (!data || data === '[AUDIO_DATA_REMOVED]') {
                    return false;
                }
            }
            return true;
        });

        return {
            ...msg,
            content: filteredParts.length > 0 ? filteredParts : ''
        };
    });
}

/**
 * Deletes a message from conversation history and UI
 * Primary goal: Clean up context sent to model to reduce hallucination
 * @param {string} messageHash - Hash of the message to delete
 */
window.deleteMessage = function(messageHash) {
    if (!messageHash) return;

    // Safety check: prevent deletion during streaming
    if (isStreaming) {
        console.warn('[DELETE] Cannot delete messages while streaming');
        return;
    }

    // Confirm deletion
    if (!confirm('Delete this message? This will remove it from the conversation context.')) {
        return;
    }

    console.log(`[DELETE] Removing message with hash: ${messageHash}`);

    // Remove from conversationHistory (core: clean up context for next API call)
    const originalLength = conversationHistory.length;
    conversationHistory = conversationHistory.filter(msg => {
        const msgHash = window.computeMessageHash ? window.computeMessageHash(msg.content) : null;
        if (msgHash === messageHash) {
            console.log(`[DELETE] Found match in history: role=${msg.role}, hash=${msgHash}`);
        }
        return msgHash !== messageHash;
    });

    const removedCount = originalLength - conversationHistory.length;
    if (removedCount > 0) {
        console.log(`[DELETE] Removed ${removedCount} message(s) from conversation history`);

        // Save updated history to sessionStorage
        saveConversationHistory();
    } else {
        console.warn(`[DELETE] No messages removed from history! Hash ${messageHash} not found.`);
        console.log('[DELETE] Current history hashes:', conversationHistory.map(msg => ({
            role: msg.role,
            hash: window.computeMessageHash ? window.computeMessageHash(msg.content) : null,
            contentPreview: typeof msg.content === 'string' ? msg.content.substring(0, 50) : '[multimodal]'
        })));
    }

    // Remove from DOM
    const messageDiv = document.querySelector(`[data-message-hash="${messageHash}"]`);
    if (messageDiv) {
        // Fade out animation
        messageDiv.style.transition = 'opacity 0.3s ease-out';
        messageDiv.style.opacity = '0';

        setTimeout(() => {
            messageDiv.remove();
            console.log('[DELETE] Message removed from UI');
        }, 300);
    }
};

// Copy to clipboard functionality

// Message handling functions

/**
 * Enables bulk download buttons after streaming is complete
 * Validates that files in tree structure have matching code blocks (Schnittmenge)
 */
function enableBulkDownloadButtons(messageDiv) {
    const bulkButtons = messageDiv.querySelectorAll('.bulk-download-btn[disabled]');
    bulkButtons.forEach(btn => {
        // Load structure to validate
        const structureData = btn.getAttribute('data-structure');
        if (!structureData) {
            // No structure data - enable anyway (shouldn't happen)
            btn.disabled = false;
            const readyText = btn.getAttribute('data-ready-text');
            if (readyText) {
                btn.innerHTML = readyText;
            }
            return;
        }

        const structure = JSON.parse(structureData);

        // Get all code blocks in message for intersection check
        const allCodeBlocks = Array.from(messageDiv.querySelectorAll('.code-download-btn'));

        // Count Schnittmenge (Tree ∩ Code blocks with content)
        let matchCount = 0;
        for (const fileInfo of structure.files) {
            // Try exact fullPath match first
            let downloadBtn = allCodeBlocks.find(codeBtn =>
                codeBtn.getAttribute('data-fullpath') === fileInfo.fullPath
            );

            // Fallback: match by basename
            if (!downloadBtn) {
                downloadBtn = allCodeBlocks.find(codeBtn =>
                    codeBtn.getAttribute('data-filename') === fileInfo.name
                );
            }

            // Check if code block has actual content
            if (downloadBtn && downloadBtn.getAttribute('data-code')) {
                matchCount++;
            }
        }

        console.log(`[BULK-ENABLE] Schnittmenge check: ${matchCount}/${structure.files.length} files have code blocks`);

        // Check if conflicts were detected (important: conflicts mean code blocks exist, just with different paths)
        const conflictsData = btn.getAttribute('data-conflicts');
        const hasConflicts = conflictsData && JSON.parse(conflictsData).length > 0;

        // If no files have code blocks, check if this is truly tree-only OR if conflicts exist
        if (matchCount === 0) {
            if (hasConflicts) {
                // CONFLICT CASE: Tree and code blocks exist but have different paths
                // Enable button so user can resolve conflicts in modal
                btn.disabled = false;
                const readyText = btn.getAttribute('data-ready-text');
                if (readyText) {
                    btn.innerHTML = readyText;
                }

                // Update info text with conflict warning
                const conflicts = JSON.parse(conflictsData);
                const infoText = btn.parentElement?.querySelector('.bulk-download-info');
                if (infoText) {
                    infoText.textContent = `⚠️ ${conflicts.length} path conflict${conflicts.length > 1 ? 's' : ''} - click to resolve`;
                    infoText.style.color = '#ff9800'; // Orange warning color
                }

                console.log(`[BULK-ENABLE] Conflicts detected despite 0 matches - enabling for conflict resolution`);
            } else {
                // TREE-ONLY CASE: No code blocks at all
                btn.disabled = true;
                btn.innerHTML = '⚠️ No code blocks found';
                btn.title = `Tree structure detected (${structure.files.length} files), but no downloadable code blocks found`;

                // Update info text with warning
                const infoText = btn.parentElement?.querySelector('.bulk-download-info');
                if (infoText) {
                    infoText.textContent = `(${structure.files.length} files in tree, 0 downloadable)`;
                    infoText.style.color = '#ff9800'; // Orange warning color
                }
            }
        } else {
            // Normal case: enable button
            btn.disabled = false;
            const readyText = btn.getAttribute('data-ready-text');
            if (readyText) {
                btn.innerHTML = readyText;
            }

            // Update info text if partial match (some files missing code blocks)
            if (matchCount < structure.files.length) {
                const infoText = btn.parentElement?.querySelector('.bulk-download-info');
                if (infoText) {
                    infoText.textContent = `(${matchCount} of ${structure.files.length} files available)`;
                }
            }
        }
    });

    if (window.restoreBulkDownloadState) {
        window.restoreBulkDownloadState(messageDiv);
    }
}

/**
 * Shows stop button and hides send button
 */
function showStopButton() {
    document.getElementById('sendButton').style.display = 'none';
    document.getElementById('stopButton').style.display = 'block';
    isStreaming = true;

    // Disable input area during streaming to prevent race conditions
    const promptInput = document.getElementById('promptInput');
    const attachButton = document.getElementById('attachButton');
    if (promptInput) {
        promptInput.disabled = true;
        promptInput.placeholder = 'Please wait...';
    }
    if (attachButton) attachButton.disabled = true;

    // Disable delete buttons during streaming to prevent inconsistencies
    document.querySelectorAll('.delete-button').forEach(btn => {
        btn.disabled = true;
        btn.style.cursor = 'not-allowed';
        btn.style.opacity = '0.5';
    });
}

/**
 * Shows send button and hides stop button
 */
function showSendButton() {
    document.getElementById('stopButton').style.display = 'none';
    document.getElementById('sendButton').style.display = 'block';
    isStreaming = false;

    // Re-enable input area after streaming completes
    const promptInput = document.getElementById('promptInput');
    const attachButton = document.getElementById('attachButton');
    if (promptInput) {
        promptInput.disabled = false;
        promptInput.placeholder = 'Ask your question...';
    }
    if (attachButton) attachButton.disabled = false;

    // Re-enable delete buttons after streaming completes
    document.querySelectorAll('.delete-button').forEach(btn => {
        btn.disabled = false;
        btn.style.cursor = 'pointer';
        btn.style.opacity = ''; // Reset to CSS-controlled opacity
    });
}

/**
 * Stops the current inference/streaming
 */
window.stopInference = function() {
    if (!isStreaming) return;

    console.log('Stopping inference...');

    // Cancel the reader
    if (currentReader) {
        try {
            currentReader.cancel();
        } catch (e) {
            console.warn('Failed to cancel reader:', e);
        }
        currentReader = null;
    }

    // Abort the controller if available
    if (currentController) {
        try {
            currentController.abort();
        } catch (e) {
            console.warn('Failed to abort controller:', e);
        }
        currentController = null;
    }

    // Finalize the current message
    if (currentBotMessage) {
        const assistantContent = currentBotMessage.getAttribute('data-content') || '';
        if (assistantContent.trim()) {
            conversationHistory.push({
                role: 'assistant',
                content: assistantContent + '\n\n[Generation stopped by user]',
                model: currentBotMessage.getAttribute('data-model') || 'unknown'
            });
            saveConversationHistory();
        }

        // Finalize UI
        const responseTime = Date.now() - (sessionStartTime || Date.now());
        const model = currentBotMessage.getAttribute('data-model') || 'unknown';
        finalizeBotMessage(currentBotMessage, model, responseTime, null, null);
        enableBulkDownloadButtons(currentBotMessage);

        // Reset currentBotMessage to prevent further updates from overwriting finalized state
        currentBotMessage = null;
    }

    // Reset UI
    showSendButton();
    updateConnectionStatus(true, 'Generation stopped by user');
    hideTypingIndicator();
};

/**
 * Renders file attachments as collapsible chips
 */

// Main send message function
window.sendMessage = async function() {
    // Safety guard: prevent sending while streaming
    if (isStreaming) {
        console.warn('[SEND] Blocked: Cannot send message while streaming');
        return;
    }

    const input = document.getElementById('promptInput');
    const chatArea = document.getElementById('chatArea');
    const sendButton = document.getElementById('sendButton');
    const mainModelSelect = document.getElementById('mainModelSelect');

    let prompt = input.value.trim();

    // Get attached files metadata for UI display
    const filesMetadata = getAttachedFilesMetadata();

    // Add attached TEXT files content to prompt
    const filesContent = getAttachedFilesContent();
    if (filesContent) {
        prompt += filesContent;
    }

    // Get attached images for API (multimodal format)
    const images = getAttachedImagesForAPI();
    // Get attached audio for API (input_audio format)
    const audios = getAttachedAudioForAPI();

    // Check if we have either prompt text or files
    if (!prompt && getAttachedFilesCount() === 0) return;

    // Build message content (multimodal if images present)
    let messageContent;
    if (images.length > 0 || audios.length > 0) {
        // Multimodal format for Vision API
        messageContent = [
            { type: 'text', text: prompt }
        ];
        messageContent.push(...images);
        messageContent.push(...audios);
        if (images.length > 0 && audios.length > 0) {
            console.log(`[MULTIMODAL] Sending message with ${images.length} image(s) and ${audios.length} audio file(s)`);
            // Warn user that audio is ignored when combined with images (mlx-vlm limitation)
            showWarning('Audio is ignored when combined with images (server limitation).');
        } else if (images.length > 0) {
            console.log(`[VISION] Sending multimodal message with ${images.length} image(s)`);
        } else {
            console.log(`[AUDIO] Sending multimodal message with ${audios.length} audio file(s)`);
        }
    } else {
        // Text-only format (unchanged)
        messageContent = prompt;
    }

    // Add user message to history and display (with file metadata for UI)
    conversationHistory.push({ role: 'user', content: messageContent });
    saveConversationHistory();
    addMessage(prompt, MESSAGE_TYPE.USER, null, filesMetadata.length > 0 ? filesMetadata : null);
    input.value = '';
    
    // Disable input and show loading
    sendButton.disabled = true;
    showStopButton(); // Show stop button during streaming
    sessionStartTime = Date.now();
    updateConnectionStatus(true, 'Processing request...');
    showTypingIndicator();
    
    // First, get complexity prediction and routing info for better UX
    let complexityScore = null;
    let routingData = null;
    try {
        routingData = await getComplexityPrediction(prompt);
        if (routingData) {
            complexityScore = routingData.complexity_score;
            const tier = getComplexityTier(complexityScore);
            updateConnectionStatus(true, `Analyzing complexity: ${tier} (${complexityScore.toFixed(2)})...`);
        }
    } catch (e) {
        console.warn('Complexity prediction failed:', e);
    }
    
    // Get manual overrides if in manual mode
    let manualComplexity = null;
    let manualModel = null;
    let finalComplexity = complexityScore;
    
    // For servers without automatic routing (like MLX Knife), use the selected model
    if (!serverCapabilities.hasComplexityEndpoint && serverCapabilities.hasStandardModelsEndpoint && mainModelSelect) {
        manualModel = mainModelSelect.value;
        console.log('Manual model selection required, selected:', manualModel);
        if (!manualModel) {
            updateConnectionStatus(false, 'Please select a model');
            sendButton.disabled = false;
            showSendButton();
            input.disabled = false;
            return;
        }
        updateConnectionStatus(true, `Using model: ${manualModel.replace('mlx-community/', '')}...`);
    }
    // Check for debug mode overrides (BROKE cluster)
    else if (debugMode === 'manual') {
        const complexitySlider = document.getElementById('complexitySlider');
        const modelSelect = document.getElementById('modelSelect');
        
        // Check if specific model is selected (overrides complexity)
        if (modelSelect && modelSelect.value !== 'auto') {
            manualModel = modelSelect.value;
            // When model is manually selected, we don't need to set complexity
            // The API will handle routing the specific model directly
            updateConnectionStatus(true, `Manual model: ${manualModel} (direct selection)...`);
        } else if (complexitySlider) {
            // Only use complexity slider if no specific model selected
            manualComplexity = parseFloat(complexitySlider.value);
            finalComplexity = manualComplexity;
            updateConnectionStatus(true, `Manual complexity: ${getComplexityTier(finalComplexity)} (${finalComplexity.toFixed(2)})...`);
        }
    } else {
        // Guard against null/undefined complexity score
        if (finalComplexity !== null && finalComplexity !== undefined) {
            updateConnectionStatus(true, `Auto complexity: ${getComplexityTier(finalComplexity)} (${finalComplexity.toFixed(2)})...`);
        } else {
            updateConnectionStatus(true, 'Processing request...');
        }
    }
    
    try {
        // Check if this is a pure audio request that should use transcription endpoint
        const audioFile = getAttachedAudioFile();
        const selectedModel = manualModel || mainModelSelect?.value || 'auto';

        // Audio size limits
        const MAX_AUDIO_SIZE_CHAT = 5 * 1024 * 1024;  // 5MB for chat/completions

        if (audioFile && audios.length > 0 && images.length === 0) {
            const strategy = getAudioEndpointStrategy(selectedModel);
            console.log(`[AUDIO] Strategy for model ${selectedModel}: ${strategy}`);

            // Check if audio is too large for chat endpoint
            if (strategy === 'chat' && audioFile.size > MAX_AUDIO_SIZE_CHAT) {
                const sizeMB = (audioFile.size / (1024 * 1024)).toFixed(1);
                showWarning(`Audio file too large for chat model (${sizeMB}MB > 5MB limit). Use a transcription model like Whisper for larger files.`);
                updateConnectionStatus(false, 'Audio too large for chat model');
                showSendButton();
                sendButton.disabled = false;
                input.disabled = false;
                hideTypingIndicator();
                return;
            }

            if (strategy === 'transcriptions' || strategy === 'try_transcriptions_first') {
                updateConnectionStatus(true, 'Transcribing audio...');

                try {
                    const result = await transcribeAudio(audioFile, selectedModel);

                    if (result && result.text) {
                        // Transcription successful - display result
                        const transcriptionText = result.text;
                        console.log('[AUDIO] Transcription successful:', transcriptionText.substring(0, 100) + '...');

                        // Add transcription as assistant message
                        conversationHistory.push({ role: 'assistant', content: transcriptionText, model: selectedModel });

                        // Sanitize in-memory history to free memory (replace audio base64 with placeholder)
                        conversationHistory = sanitizeHistoryForStorage(conversationHistory);
                        saveConversationHistory();

                        // Display result
                        const responseTime = Date.now() - sessionStartTime;
                        addMessage(transcriptionText, MESSAGE_TYPE.BOT, selectedModel);

                        updateConnectionStatus(true, 'Transcription complete');
                        showSendButton();
                        sendButton.disabled = false;
                        input.disabled = false;
                        clearAttachedFiles();
                        return;
                    }

                    // result is null - not a transcription model, fallback to chat
                    if (strategy === 'try_transcriptions_first') {
                        console.log('[AUDIO] Falling back to chat/completions with input_audio');
                        // Check if audio is too large for chat fallback
                        if (audioFile.size > MAX_AUDIO_SIZE_CHAT) {
                            const sizeMB = (audioFile.size / (1024 * 1024)).toFixed(1);
                            throw new Error(`Audio file too large for chat (${sizeMB}MB > 5MB). Model does not support transcription.`);
                        }
                        updateConnectionStatus(true, 'Using chat mode for audio...');
                    }
                } catch (transcriptionError) {
                    if (strategy === 'transcriptions') {
                        // STT model should work, throw the error
                        throw transcriptionError;
                    }
                    // For 'try_transcriptions_first', fallback to chat
                    console.log('[AUDIO] Transcription failed, falling back to chat:', transcriptionError.message);
                    // Check if audio is too large for chat fallback
                    if (audioFile.size > MAX_AUDIO_SIZE_CHAT) {
                        const sizeMB = (audioFile.size / (1024 * 1024)).toFixed(1);
                        throw new Error(`Audio file too large for chat (${sizeMB}MB > 5MB). Transcription failed: ${transcriptionError.message}`);
                    }
                    updateConnectionStatus(true, 'Using chat mode for audio...');
                }
            }
        }

        // Create streaming response with manual overrides
        // Filter out messages with image placeholders from reloaded sessions
        const apiHistory = conversationHistory.length > 0
            ? sanitizeHistoryForAPI(conversationHistory)
            : [];

        const requestBody = {
            model: manualModel || 'auto',
            messages: apiHistory.length > 0 ? apiHistory : [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            // max_tokens omitted - let server use dynamic calculation (context_length/2)
            // Previous: 1000 (too restrictive for code generation tasks)
            temperature: audios.length > 0 ? 0.0 : 0.7,
            stream: true
        };
        
        // Add manual overrides to request if specified
        if (finalComplexity !== complexityScore) {
            requestBody.debug_complexity_override = finalComplexity;
        }
        if (manualModel) {
            requestBody.debug_model_override = manualModel;
        }
        
        const response = await createChatCompletion(requestBody);

        // Capture X-Request-ID for debugging (MLX Knife extension)
        const requestId = response.headers.get('X-Request-ID');
        if (requestId) {
            console.log(`[API] X-Request-ID: ${requestId}`);
        }

        // Handle streaming response
        currentReader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentModel = 'unknown';
        
        // Create placeholder for bot message
        const botMessageDiv = createBotMessagePlaceholder();
        currentBotMessage = botMessageDiv; // Assign to global for stop button access
        chatArea.appendChild(botMessageDiv);
        chatArea.scrollTop = chatArea.scrollHeight;
        
        let tokenCount = 0;
        let complexity = finalComplexity;

        while (true) {
            // Check if reader was cancelled (abort handling)
            if (!currentReader) {
                console.log('[ABORT] Reader cancelled, exiting stream loop');
                break;
            }

            const { done, value } = await currentReader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') {
                        const responseTime = Date.now() - sessionStartTime;
                        const finalRequestId = 'req-' + Date.now();
                        
                        // Add assistant response to conversation history
                        const assistantContent = botMessageDiv.getAttribute('data-content') || '';
                        if (assistantContent.trim()) {
                            conversationHistory.push({ role: 'assistant', content: assistantContent, model: currentModel });
                            // Sanitize in-memory history to free memory (replace media base64 with placeholders)
                            conversationHistory = sanitizeHistoryForStorage(conversationHistory);
                            saveConversationHistory();
                        }
                        
                        finalizeBotMessage(botMessageDiv, currentModel, responseTime, complexity, routingData, finalRequestId);
                        enableBulkDownloadButtons(botMessageDiv);
                        updateConnectionStatus(true, `Response complete (${tokenCount} tokens)`);
                        showSendButton();
                        currentReader = null;
                        currentBotMessage = null; // Reset after finalization
                        return;
                    }
                    
                    try {
                        const chunk = JSON.parse(data);
                        const delta = chunk.choices[0]?.delta;
                        const previousModel = currentModel;
                        currentModel = chunk.model || currentModel;

                        // Update typing indicator with model name when it becomes available
                        if (currentModel !== 'unknown' && currentModel !== previousModel) {
                            showTypingIndicator(currentModel);
                        }

                        if (delta?.content) {
                            // Abort check: stop processing if message was aborted
                            if (!currentBotMessage) {
                                console.log('[ABORT] Message aborted, stopping stream processing');
                                break;
                            }

                            tokenCount += delta.content.split(/\s+/).length;

                            // Update raw debug view with unprocessed content
                            updateRawDebugView(delta.content);

                            // DEBUG: Show raw model output in console
                            console.log('RAW MODEL TOKEN:', JSON.stringify(delta.content));

                            appendToBotMessage(botMessageDiv, delta.content, currentModel, complexity);
                            chatArea.scrollTop = chatArea.scrollHeight;
                            updateConnectionStatus(true, `Streaming from ${currentModel}... (${tokenCount} tokens)`);

                            // Small delay to allow browser rendering - makes streaming visible
                            await new Promise(resolve => setTimeout(resolve, 20));
                        }
                        
                        if (chunk.choices[0]?.finish_reason) {
                            const responseTime = Date.now() - sessionStartTime;
                            const finalRequestId = 'req-' + Date.now();
                            
                            // Add assistant response to conversation history
                            const assistantContent = botMessageDiv.getAttribute('data-content') || '';
                            if (assistantContent.trim()) {
                                conversationHistory.push({ role: 'assistant', content: assistantContent, model: currentModel });
                                // Sanitize in-memory history to free memory (replace media base64 with placeholders)
                                conversationHistory = sanitizeHistoryForStorage(conversationHistory);
                                saveConversationHistory();
                            }

                            finalizeBotMessage(botMessageDiv, currentModel, responseTime, complexity, routingData, finalRequestId);
                            enableBulkDownloadButtons(botMessageDiv);
                            updateConnectionStatus(true, `Response complete (${tokenCount} tokens)`);
                            showSendButton();
                            currentReader = null;
                            currentBotMessage = null; // Reset after finalization
                            return;
                        }
                    } catch (e) {
                        console.warn('Failed to parse chunk:', data);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('API Error:', error);
        hideTypingIndicator();
        addMessage(`Error: ${error.message}`, MESSAGE_TYPE.BOT, 'error');
        updateConnectionStatus(false, 'Connection error - Is the API started?');
    } finally {
        sendButton.disabled = false;
        showSendButton();
        hideTypingIndicator();
        currentReader = null;
        currentBotMessage = null; // Reset on error/completion
        // Clear attached files after sending
        clearAttachedFiles();
    }
}

// Initialize chat functionality  
window.initializeChat = async function() {
    // Restore chat history first
    restoreChatHistory();
    console.log('Starting chat initialization...');
    updateConnectionStatus(false, 'Testing connection...');
    
    try {
        console.log('Checking API health...');
        const healthData = await checkAPIHealth();
        console.log('Health data:', healthData);
        updateConnectionStatus(true, 'Ready');
        
        // Show appropriate status based on available data
        if (healthData.nodes) {
            // Server provides node information (BROKE cluster)
            const nodeCount = Object.keys(healthData.nodes).length;
            const version = healthData.version || 'unknown';
            updateModelInfo(`Cluster: ${nodeCount} nodes • v${version}`, null);
        } else if (healthData.service) {
            // Server provides service name
            updateModelInfo(`${healthData.service} • localhost:8000`, null);
        } else {
            // Generic API server
            updateModelInfo('API: localhost:8000', null);
        }
        
        // Hide routing info button if complexity endpoint not available
        const routingButton = document.querySelector('button[onclick="showRoutingInfo()"]');
        if (routingButton && !serverCapabilities.hasComplexityEndpoint) {
            routingButton.style.display = 'none';
        }
        
        // Show model selector only when:
        // 1. No BROKE complexity endpoint (no automatic routing)
        // 2. Standard models endpoint exists
        // This ensures we only show it for servers that require manual model selection
        if (!serverCapabilities.hasComplexityEndpoint && serverCapabilities.hasStandardModelsEndpoint) {
            console.log('No automatic routing detected, checking if model selection is needed...');
            await setupModelSelector();
            
            // Restore selected model from sessionStorage
            const mainModelSelect = document.getElementById('mainModelSelect');
            if (mainModelSelect && lastSelectedModel) {
                const options = Array.from(mainModelSelect.options);
                const savedOption = options.find(opt => opt.value === lastSelectedModel);
                if (savedOption) {
                    mainModelSelect.value = lastSelectedModel;
                    const displayName = lastSelectedModel.replace('mlx-community/', '');
                    updateModelInfo(`Model: ${displayName}`, null);
                    console.log('Restored selected model:', displayName);
                }
            }
        }
        
        // Set up periodic health checks
        setupPeriodicHealthCheck((connected, healthData) => {
            if (connected) {
                // Only update to "Ready" if not currently streaming
                if (!isStreaming) {
                    updateConnectionStatus(true, 'Ready');
                }
            } else {
                updateConnectionStatus(false, 'Connection interrupted');
            }
        });
        
    } catch (error) {
        updateConnectionStatus(false, error.message);
    }
    
    // Close modal when clicking outside (only if modal exists)
    const routingModal = document.getElementById('routingModal');
    if (routingModal) {
        routingModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeRoutingModal();
            }
        });
    }
}

// Setup model selector for non-BROKE servers
async function setupModelSelector() {
    console.log('Setting up model selector for non-BROKE server...');
    
    const modelSelectorArea = document.getElementById('modelSelectorArea');
    const mainModelSelect = document.getElementById('mainModelSelect');
    
    if (!modelSelectorArea || !mainModelSelect) {
        console.error('Model selector elements not found!');
        return;
    }
    
    // Show the model selector
    modelSelectorArea.style.display = 'flex';
    modelSelectorArea.style.alignItems = 'center';
    
    // Load available models
    console.log('Loading available models...');
    const modelData = await loadAvailableModels();
    console.log('Model data received:', modelData);
    
    if (!modelData || !modelData.models || modelData.models.length === 0) {
        console.error('No models available!');
        mainModelSelect.innerHTML = '<option value="">No models available</option>';
        return;
    }
    
    // Populate model dropdown
    mainModelSelect.innerHTML = '';
    modelData.models.forEach((model, index) => {
        const option = document.createElement('option');
        option.value = model;
        // Simplify display name by removing mlx-community/ prefix
        const displayName = model.replace('mlx-community/', '');
        option.textContent = displayName;
        // Select first model by default
        if (index === 0) {
            option.selected = true;
        }
        mainModelSelect.appendChild(option);
    });
    
    // Update model info when selection changes
    mainModelSelect.addEventListener('change', function() {
        const selectedModel = this.value;
        const displayName = selectedModel.replace('mlx-community/', '');
        
        // Check for model change and ask about conversation history
        if (conversationHistory.length > 0 && lastSelectedModel && lastSelectedModel !== selectedModel) {
            showModelSwitchModal(selectedModel, displayName);
        } else {
            // No history or first selection - just update
            lastSelectedModel = selectedModel;
            sessionStorage.setItem('broke_selected_model', selectedModel);
            updateModelInfo(`Model: ${displayName}`, null);
        }
    });
    
    // Set initial model info
    if (mainModelSelect.value) {
        const initialModel = mainModelSelect.value;
        const displayName = initialModel.replace('mlx-community/', '');
        lastSelectedModel = initialModel;
        sessionStorage.setItem('broke_selected_model', initialModel);
        updateModelInfo(`Model: ${displayName}`, null);
        console.log('Initial model selected:', displayName);
    }
}

// Model switch modal functionality
function showModelSwitchModal(newModel, displayName) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;
    
    overlay.innerHTML = `
        <div class="modal" style="
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            max-width: 400px;
            text-align: center;
        ">
            <h3>Model Switch</h3>
            <p>Switching to <strong>${displayName}</strong>.<br>
            Keep your chat history with the new model?</p>
            <div style="margin-top: 20px; display: flex; gap: 15px; justify-content: center;">
                <button class="modal-button primary" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: bold;
                    min-width: 100px;
                    background: #007AFF;
                    color: white;
                ">Keep History</button>
                <button class="modal-button secondary" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: bold;
                    min-width: 100px;
                    background: #6c757d;
                    color: white;
                ">Start Fresh</button>
            </div>
        </div>
    `;
    
    const buttons = overlay.querySelectorAll('.modal-button');
    
    // Keep History
    buttons[0].onclick = () => {
        document.body.removeChild(overlay);
        lastSelectedModel = newModel;
        sessionStorage.setItem('broke_selected_model', newModel);
        updateModelInfo(`Model: ${displayName}`, null);
    };
    
    // Start Fresh
    buttons[1].onclick = () => {
        document.body.removeChild(overlay);
        conversationHistory = [];
        saveConversationHistory();
        lastSelectedModel = newModel;
        sessionStorage.setItem('broke_selected_model', newModel);
        updateModelInfo(`Model: ${displayName}`, null);
        
        // Clear chat display
        const chatArea = document.getElementById('chatArea');
        chatArea.innerHTML = '<div class="message bot-message"><strong>BROKE:</strong> Hello! New conversation with ' + displayName + ' started.</div>';
    };
    
    // Hover effects
    buttons.forEach(button => {
        button.addEventListener('mouseenter', () => button.style.opacity = '0.8');
        button.addEventListener('mouseleave', () => button.style.opacity = '1');
    });
    
    document.body.appendChild(overlay);
}

// Clear chat functionality
window.clearChat = function() {
    // Check if there's anything to clear (history OR UI messages)
    const chatArea = document.getElementById('chatArea');
    const hasMessages = chatArea && chatArea.querySelectorAll('.message').length > 1; // More than welcome message

    if (conversationHistory.length === 0 && !hasMessages) {
        console.log('[CLEAR] Nothing to clear');
        return;
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;
    
    overlay.innerHTML = `
        <div class="modal" style="
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            max-width: 400px;
            text-align: center;
        ">
            <h3>Clear Chat</h3>
            <p>Are you sure you want to clear the entire chat history?</p>
            <div style="margin-top: 20px; display: flex; gap: 15px; justify-content: center;">
                <button class="modal-button primary" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: bold;
                    min-width: 100px;
                    background: #dc3545;
                    color: white;
                ">Clear All</button>
                <button class="modal-button secondary" style="
                    padding: 10px 20px;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: bold;
                    min-width: 100px;
                    background: #6c757d;
                    color: white;
                ">Cancel</button>
            </div>
        </div>
    `;
    
    const buttons = overlay.querySelectorAll('.modal-button');
    
    // Clear All
    buttons[0].onclick = () => {
        document.body.removeChild(overlay);

        // Clear in-memory history
        conversationHistory = [];

        // Clear sessionStorage
        try {
            sessionStorage.removeItem('broke_chat_history');
            console.log('[CLEAR] Chat history cleared from sessionStorage');
        } catch (e) {
            console.error('[CLEAR] Failed to clear sessionStorage:', e);
        }

        // Clear attached files
        if (window.clearAttachedFiles) {
            clearAttachedFiles();
        }

        // Reset UI
        const chatArea = document.getElementById('chatArea');
        chatArea.innerHTML = '<div class="message bot-message"><strong>nChat:</strong> Chat cleared. Ask me a new question!</div>';

        console.log('[CLEAR] Chat cleared successfully');
    };
    
    // Cancel
    buttons[1].onclick = () => {
        document.body.removeChild(overlay);
    };
    
    // Hover effects
    buttons.forEach(button => {
        button.addEventListener('mouseenter', () => button.style.opacity = '0.8');
        button.addEventListener('mouseleave', () => button.style.opacity = '1');
    });
    
    document.body.appendChild(overlay);
};

// Restore chat history on initialization
function restoreChatHistory() {
    if (conversationHistory.length > 0) {
        console.log('Restoring chat history with', conversationHistory.length, 'messages');
        const chatArea = document.getElementById('chatArea');
        chatArea.innerHTML = '<div class="message bot-message"><strong>BROKE:</strong> Previous conversation restored.</div>';

        conversationHistory.forEach(msg => {
            if (msg.role === 'user') {
                addMessage(msg.content, MESSAGE_TYPE.USER);
            } else if (msg.role === 'assistant') {
                addMessage(msg.content, MESSAGE_TYPE.BOT, msg.model || null);
            }
        });

        // Enable all bulk download buttons in restored messages (they're already complete)
        setTimeout(() => {
            const allBotMessages = chatArea.querySelectorAll('.bot-message');
            allBotMessages.forEach(msg => enableBulkDownloadButtons(msg));
        }, 200); // Small delay to ensure DOM is ready
    }
}

// Initialize chat history restoration
window.addEventListener('load', () => {
    // Delay restoration to ensure DOM is ready
    setTimeout(restoreChatHistory, 100);
});
