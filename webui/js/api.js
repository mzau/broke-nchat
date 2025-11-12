// API Configuration
const API_BASE = 'http://localhost:8000';
const API_KEY = 'broke-dev-key-12345';

// Server capabilities detection with session caching
let serverCapabilities = {
    hasDebugEndpoints: false,
    hasComplexityEndpoint: false,
    hasModelsDebugEndpoint: false,
    hasVoteEndpoint: false,
    hasStandardModelsEndpoint: false,
    requiresApiKey: false
};

// Session storage key for capability caching
const CAPABILITY_CACHE_KEY = 'broke_server_capabilities';
const CAPABILITY_CACHE_TIMESTAMP_KEY = 'broke_server_capabilities_timestamp';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Load cached capabilities if available and recent
function loadCachedCapabilities() {
    try {
        const cachedData = sessionStorage.getItem(CAPABILITY_CACHE_KEY);
        const cacheTimestamp = sessionStorage.getItem(CAPABILITY_CACHE_TIMESTAMP_KEY);
        
        if (cachedData && cacheTimestamp) {
            const timestamp = parseInt(cacheTimestamp);
            const now = Date.now();
            
            if (now - timestamp < CACHE_DURATION) {
                const cached = JSON.parse(cachedData);
                console.log('Loading cached server capabilities:', cached);
                
                // Reset to defaults first to avoid stale state
                serverCapabilities = {
                    hasDebugEndpoints: false,
                    hasComplexityEndpoint: false,
                    hasModelsDebugEndpoint: false,
                    hasVoteEndpoint: false,
                    hasStandardModelsEndpoint: false,
                    requiresApiKey: false
                };
                
                // Then apply cached values
                serverCapabilities = { ...serverCapabilities, ...cached };
                return true;
            } else {
                console.log('Cached capabilities expired, will re-detect');
                sessionStorage.removeItem(CAPABILITY_CACHE_KEY);
                sessionStorage.removeItem(CAPABILITY_CACHE_TIMESTAMP_KEY);
            }
        }
    } catch (error) {
        console.warn('Error loading cached capabilities:', error);
    }
    return false;
}

// Save capabilities to cache
function saveCachedCapabilities() {
    try {
        sessionStorage.setItem(CAPABILITY_CACHE_KEY, JSON.stringify(serverCapabilities));
        sessionStorage.setItem(CAPABILITY_CACHE_TIMESTAMP_KEY, Date.now().toString());
        console.log('Server capabilities cached for session');
    } catch (error) {
        console.warn('Error caching capabilities:', error);
    }
}

// Force refresh capabilities (for server switches)
window.refreshServerCapabilities = function() {
    console.log('Forcing server capability refresh...');
    sessionStorage.removeItem(CAPABILITY_CACHE_KEY);
    sessionStorage.removeItem(CAPABILITY_CACHE_TIMESTAMP_KEY);
    return detectServerCapabilities();
};

// API utility functions
async function fetchWithAuth(url, options = {}) {
    const defaultHeaders = {
        'Content-Type': 'application/json'
    };
    
    // Only add API key if server requires it
    if (serverCapabilities.requiresApiKey) {
        defaultHeaders['X-API-Key'] = API_KEY;
    }
    
    return fetch(url, {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    });
}

// Simple server type detection
window.detectServerCapabilities = async function() {
    // Check cache first
    if (loadCachedCapabilities()) {
        console.log('✅ Using cached server capabilities');
        return;
    }

    console.log('🔍 Detecting server capabilities...');
    
    // Reset capabilities
    serverCapabilities = {
        hasDebugEndpoints: false,
        hasComplexityEndpoint: false,
        hasModelsDebugEndpoint: false,
        hasVoteEndpoint: false,
        hasStandardModelsEndpoint: false,
        requiresApiKey: false
    };
    
    // Simple test: Try one BROKE endpoint to determine server type
    try {
        const response = await fetch(`${API_BASE}/debug/models`, {
            headers: { 'X-API-Key': API_KEY }
        });
        
        if (response.ok) {
            console.log('✅ BROKE cluster detected - debug/models successful');
            // This is a BROKE cluster - set all BROKE capabilities
            serverCapabilities.hasDebugEndpoints = true;
            serverCapabilities.hasComplexityEndpoint = true;
            serverCapabilities.hasModelsDebugEndpoint = true;
            serverCapabilities.hasVoteEndpoint = true;
            serverCapabilities.requiresApiKey = true;
            serverCapabilities.hasStandardModelsEndpoint = false; // Important: No v1/models for BROKE
            
            console.log('🔧 BROKE cluster mode: Debug panel enabled, /debug/* endpoints active');
        } else {
            console.log('❌ Not a BROKE cluster (debug/models failed) - trying standard server...');
            
            // Test if it's a standard OpenAI-compatible server  
            const modelsResponse = await fetch(`${API_BASE}/v1/models`);
            if (modelsResponse.ok) {
                console.log('✅ Standard OpenAI-compatible server detected');
                serverCapabilities.hasStandardModelsEndpoint = true;
                serverCapabilities.hasDebugEndpoints = false;
                serverCapabilities.hasComplexityEndpoint = false;
                serverCapabilities.hasModelsDebugEndpoint = false;
                serverCapabilities.hasVoteEndpoint = false;
                serverCapabilities.requiresApiKey = false;
                
                console.log('🌐 Standard server mode: Model selector enabled, /v1/* endpoints active');
            } else {
                console.log('❌ No server detected - cannot determine type');
            }
        }
    } catch (error) {
        console.log('💥 Server detection failed:', error);
        // Default to standard server
        serverCapabilities.hasStandardModelsEndpoint = true;
        serverCapabilities.hasDebugEndpoints = false;
    }
    
    console.log('📊 Final server capabilities:', serverCapabilities);

    // Cache the results for this session
    saveCachedCapabilities();
}

// Health check API
async function checkAPIHealth() {
    try {
        const response = await fetchWithAuth(`${API_BASE}/health`);
        if (response.ok) {
            return await response.json();
        } else {
            throw new Error('API server not reachable');
        }
    } catch (error) {
        throw new Error('API server not reachable - please start your backend server');
    }
}

// Client-side complexity estimation (fallback for MLX Knife)
function estimateComplexityClientSide(prompt) {
    // Simple heuristic-based complexity estimation
    const wordCount = prompt.split(/\s+/).length;
    const charCount = prompt.length;
    
    // Check for complexity indicators
    const hasCode = /```|function|class|def|import|const|let|var/.test(prompt);
    const hasMath = /\d+[\+\-\*\/]|equation|formula|calculate/.test(prompt.toLowerCase());
    const hasAnalysis = /analyze|explain|compare|evaluate|assess/.test(prompt.toLowerCase());
    
    // Base complexity on length
    let complexity = Math.min(0.9, charCount / 1000);
    
    // Adjust based on content type
    if (hasCode) complexity = Math.max(0.5, complexity);
    if (hasMath) complexity = Math.max(0.4, complexity);
    if (hasAnalysis) complexity = Math.max(0.6, complexity);
    
    // Determine tier
    let tier = 'fast';
    if (complexity >= 0.85) tier = 'premium';
    else if (complexity >= 0.4) tier = 'balanced';
    
    return {
        complexity_score: complexity,
        predicted_tier: tier,
        estimated_tokens: Math.max(50, wordCount * 2),
        features_detected: {
            has_code: hasCode,
            has_math: hasMath,
            has_analysis: hasAnalysis
        }
    };
}

// Complexity prediction API with fallback
async function getComplexityPrediction(prompt) {
    // If server doesn't have complexity endpoint, no routing info available
    // (Standard OpenAI mode - user selects model manually)
    if (!serverCapabilities.hasComplexityEndpoint) {
        return null;
    }
    
    try {
        const response = await fetchWithAuth(`${API_BASE}/debug/complexity`, {
            method: 'POST',
            body: JSON.stringify({ prompt: prompt })
        });
        
        if (response.ok) {
            return await response.json();
        } else {
            console.warn('Complexity prediction failed');
            return null;
        }
    } catch (error) {
        console.warn('Complexity prediction error:', error);
        return null;
    }
}

// Load available models API with fallback to standard endpoint
async function loadAvailableModels() {
    console.log('📋 loadAvailableModels called with capabilities:', serverCapabilities);
    
    try {
        // Try debug endpoint first if available
        if (serverCapabilities.hasModelsDebugEndpoint) {
            console.log('🔧 Using debug endpoint /debug/models');
            const response = await fetchWithAuth(`${API_BASE}/debug/models`);
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Debug models loaded successfully:', data.models?.length, 'models');
                return data;
            } else {
                console.warn('❌ Debug models endpoint failed:', response.status);
            }
        }
        
        // Only fallback to standard OpenAI endpoint if no debug endpoints available
        // This prevents unnecessary calls to /v1/models on BROKE cluster
        if (serverCapabilities.hasStandardModelsEndpoint && !serverCapabilities.hasDebugEndpoints) {
            console.log('🌐 Using standard endpoint /v1/models (no debug endpoints detected)');
            console.log('🚨 MAKING /v1/models CALL - this should NOT happen for BROKE cluster!');
            const response = await fetch(`${API_BASE}/v1/models`);
            if (response.ok) {
                const data = await response.json();
                
                // Transform OpenAI format to BROKE format
                const models = data.data || [];
                const modelsByTier = {
                    fast: [],
                    balanced: [],
                    premium: []
                };
                
                // Simple categorization based on model name/size
                models.forEach(model => {
                    const modelId = model.id;
                    const modelName = modelId.replace('mlx-community/', '');
                    
                    // Categorize by size hints in name
                    if (modelName.includes('mini') || modelName.includes('3b') || modelName.includes('4b')) {
                        modelsByTier.fast.push(modelId);
                    } else if (modelName.includes('7b') || modelName.includes('8b') || modelName.includes('medium')) {
                        modelsByTier.balanced.push(modelId);
                    } else {
                        modelsByTier.premium.push(modelId);
                    }
                });
                
                // If no categorization worked, put all in balanced
                if (modelsByTier.fast.length === 0 && modelsByTier.balanced.length === 0 && modelsByTier.premium.length === 0) {
                    models.forEach(model => {
                        modelsByTier.balanced.push(model.id);
                    });
                }
                
                return {
                    models: models.map(m => m.id),
                    models_by_tier: modelsByTier
                };
            } else {
                console.warn('❌ Failed to load models from standard endpoint');
                return null;
            }
        } else {
            console.log('⚠️ No endpoints available for model loading (hasStandardModelsEndpoint:', serverCapabilities.hasStandardModelsEndpoint, 'hasDebugEndpoints:', serverCapabilities.hasDebugEndpoints, ')');
            return null;
        }
    } catch (error) {
        console.warn('💥 Model loading error:', error);
        return null;
    }
}

// Submit vote API with graceful fallback
async function submitVote(requestId, voteType, rating = null) {
    // If server doesn't have vote endpoint, just log locally
    if (!serverCapabilities.hasVoteEndpoint) {
        console.log('Vote (client-side only):', {
            session_id: requestId,
            vote: voteType,
            rating: rating,
            timestamp: new Date().toISOString()
        });
        return true; // Pretend success for UI consistency
    }
    
    try {
        const body = {
            session_id: requestId,
            vote: voteType,
            timestamp: new Date().toISOString()
        };
        
        // Add rating for star ratings
        if (rating !== null) {
            body.rating = rating;
        }
        
        const response = await fetchWithAuth(`${API_BASE}/debug/vote`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        
        return response.ok;
    } catch (error) {
        console.log('Vote submission failed, logged locally:', error);
        return true; // Pretend success for UI consistency
    }
}

// Enhanced vote submission with full context
async function submitVoteWithContext(voteData) {
    // If server doesn't have vote endpoint, just log locally
    if (!serverCapabilities.hasVoteEndpoint) {
        console.log('Vote with context (client-side only):', voteData);
        return { success: true };
    }
    
    try {
        const response = await fetchWithAuth(`${API_BASE}/debug/vote`, {
            method: 'POST',
            body: JSON.stringify(voteData)
        });
        
        return response.ok;
    } catch (error) {
        console.error('Vote submission error:', error);
        return false;
    }
}

// Chat completions API
async function createChatCompletion(requestBody) {
    const response = await fetchWithAuth(`${API_BASE}/v1/chat/completions`, {
        method: 'POST',
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response;
}

// Periodic health check setup
function setupPeriodicHealthCheck(callback) {
    setInterval(async () => {
        try {
            const healthData = await checkAPIHealth();
            callback(true, healthData);
        } catch (error) {
            callback(false, null);
        }
    }, 30000); // Check every 30 seconds
}