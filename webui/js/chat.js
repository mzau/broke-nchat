// Chat state variables
let currentTypingIndicator = null;
let currentBotMessage = null;
let sessionStartTime = null;
let lastRoutingInfo = null;
let rawOutputBuffer = "";
let userVotes = new Map(); // Store user votes for training data
let conversationHistory = JSON.parse(localStorage.getItem('broke_chat_history') || '[]'); // Persistent conversation history
let lastSelectedModel = localStorage.getItem('broke_selected_model') || ''; // Track model changes

// Copy to clipboard functionality

// Message handling functions

/**
 * Renders file attachments as collapsible chips
 */

// Main send message function
window.sendMessage = async function() {
    const input = document.getElementById('promptInput');
    const chatArea = document.getElementById('chatArea');
    const sendButton = document.getElementById('sendButton');
    const mainModelSelect = document.getElementById('mainModelSelect');

    let prompt = input.value.trim();

    // Get attached files metadata for UI display
    const filesMetadata = getAttachedFilesMetadata();

    // Add attached files content to prompt for API
    const filesContent = getAttachedFilesContent();
    if (filesContent) {
        prompt += filesContent;
    }

    // Check if we have either prompt text or files
    if (!prompt && getAttachedFilesCount() === 0) return;

    // Add user message to history and display (with file metadata for UI)
    conversationHistory.push({ role: 'user', content: prompt });
    localStorage.setItem('broke_chat_history', JSON.stringify(conversationHistory));
    addMessage(prompt, MESSAGE_TYPE.USER, null, filesMetadata.length > 0 ? filesMetadata : null);
    input.value = '';
    
    // Disable input and show loading
    sendButton.disabled = true;
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
        // Create streaming response with manual overrides
        const requestBody = {
            model: manualModel || 'auto',
            messages: conversationHistory.length > 0 ? conversationHistory : [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 1000,
            temperature: 0.7,
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
        
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentModel = 'unknown';
        
        // Create placeholder for bot message
        const botMessageDiv = createBotMessagePlaceholder();
        chatArea.appendChild(botMessageDiv);
        chatArea.scrollTop = chatArea.scrollHeight;
        
        let tokenCount = 0;
        let complexity = finalComplexity;
        
        while (true) {
            const { done, value } = await reader.read();
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
                            localStorage.setItem('broke_chat_history', JSON.stringify(conversationHistory));
                        }
                        
                        finalizeBotMessage(botMessageDiv, currentModel, responseTime, complexity, routingData, finalRequestId);
                        updateConnectionStatus(true, `Response complete (${tokenCount} tokens)`);
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
                                localStorage.setItem('broke_chat_history', JSON.stringify(conversationHistory));
                            }
                            
                            finalizeBotMessage(botMessageDiv, currentModel, responseTime, complexity, routingData, finalRequestId);
                            updateConnectionStatus(true, `Response complete (${tokenCount} tokens)`);
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
        hideTypingIndicator();
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
        updateConnectionStatus(true, 'API running');
        
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
            
            // Restore selected model from localStorage
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
                if (!document.getElementById('statusText').textContent.includes('Streaming') && 
                    !document.getElementById('statusText').textContent.includes('Verarbeite')) {
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
            localStorage.setItem('broke_selected_model', selectedModel);
            updateModelInfo(`Model: ${displayName}`, null);
        }
    });
    
    // Set initial model info
    if (mainModelSelect.value) {
        const initialModel = mainModelSelect.value;
        const displayName = initialModel.replace('mlx-community/', '');
        lastSelectedModel = initialModel;
        localStorage.setItem('broke_selected_model', initialModel);
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
        localStorage.setItem('broke_selected_model', newModel);
        updateModelInfo(`Model: ${displayName}`, null);
    };
    
    // Start Fresh
    buttons[1].onclick = () => {
        document.body.removeChild(overlay);
        conversationHistory = [];
        localStorage.setItem('broke_chat_history', JSON.stringify(conversationHistory));
        lastSelectedModel = newModel;
        localStorage.setItem('broke_selected_model', newModel);
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
    if (conversationHistory.length === 0) {
        return; // Nothing to clear
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
        conversationHistory = [];
        localStorage.setItem('broke_chat_history', JSON.stringify(conversationHistory));
        const chatArea = document.getElementById('chatArea');
        chatArea.innerHTML = '<div class="message bot-message"><strong>BROKE:</strong> Chat cleared. Ask me a new question!</div>';
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
    }
}

// Initialize chat history restoration
window.addEventListener('load', () => {
    // Delay restoration to ensure DOM is ready
    setTimeout(restoreChatHistory, 100);
});