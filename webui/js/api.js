// ============================================
// ⚠️  API CONFIGURATION
// ============================================
//
// Server configuration can be set in two ways:
//
// Option 1: Browser localStorage (Recommended - no code editing required)
//   Open browser DevTools → Console:
//     Windows/Linux: F12 or Ctrl+Shift+I
//     macOS: Cmd+Option+I or right-click → Inspect
//   Then paste:
//     localStorage.setItem('broke_api_base', 'http://localhost:11434');     // Your server URL (or http://localhost:11434/v1)
//     localStorage.setItem('broke_api_key', 'your-api-key');                // Your API key
//     location.reload();
//
//   See README.md "Server Configuration" section for examples (Ollama, LM-Studio, mlx-knife)
//
// Option 2: Edit code below (fallback if localStorage not set)
//   Default values are used when localStorage is empty
//
// ⚠️  SECURITY NOTE: This is a pure client-side app (static HTML/JS).
//     API keys are always visible in browser. Never use production keys
//     with sensitive billing limits. This is intended for local/dev use.
// ============================================

// Read from localStorage first, fall back to hardcoded defaults
//
// Note: `broke_api_base` may be set either to the server root (`http://localhost:11434`)
// or to an OpenAI-style base (`http://localhost:11434/v1`). This file normalizes both.
function normalizeApiBase(apiBase) {
    if (!apiBase) {
        return '';
    }
    return apiBase.trim().replace(/\/+$/, '');
}

const API_BASE = normalizeApiBase(localStorage.getItem('broke_api_base') || 'http://localhost:8000');
const API_KEY = localStorage.getItem('broke_api_key') || 'broke-dev-key-12345';

function buildApiUrl(path) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const baseRoot = API_BASE.endsWith('/v1') ? API_BASE.slice(0, -3) : API_BASE;

    if (normalizedPath === '/v1' || normalizedPath.startsWith('/v1/')) {
        return `${baseRoot}/v1${normalizedPath.slice(3)}`;
    }

    return `${baseRoot}${normalizedPath}`;
}

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
                
                // Cache can become stale when switching servers; ensure it matches the current base.
                // Older versions stored the plain capabilities object; treat those as invalid.
                if (!cached || typeof cached !== 'object' || !cached.apiBase || !cached.capabilities) {
                    console.log('Cached capabilities format is outdated - will re-detect');
                    sessionStorage.removeItem(CAPABILITY_CACHE_KEY);
                    sessionStorage.removeItem(CAPABILITY_CACHE_TIMESTAMP_KEY);
                    return false;
                }

                if (cached.apiBase !== API_BASE) {
                    console.log('Cached capabilities are for a different server base - will re-detect');
                    sessionStorage.removeItem(CAPABILITY_CACHE_KEY);
                    sessionStorage.removeItem(CAPABILITY_CACHE_TIMESTAMP_KEY);
                    return false;
                }

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
                serverCapabilities = { ...serverCapabilities, ...cached.capabilities };
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
        sessionStorage.setItem(CAPABILITY_CACHE_KEY, JSON.stringify({
            apiBase: API_BASE,
            capabilities: serverCapabilities
        }));
        sessionStorage.setItem(CAPABILITY_CACHE_TIMESTAMP_KEY, Date.now().toString());
        console.log('Server capabilities cached for session');
    } catch (error) {
        console.warn('Error caching capabilities:', error);
    }
}

// Detect server capabilities (BROKE vs Standard OpenAI-compatible)
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

    // Prefer probing the standard OpenAI endpoint first (avoids CORS preflights on servers like Ollama).
    try {
        const modelsResponse = await fetch(buildApiUrl('/v1/models'));
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
            console.log('❌ Standard server probe failed - trying BROKE endpoints...');

            const response = await fetch(buildApiUrl('/debug/models'), {
                headers: {
                    'X-API-Key': API_KEY
                }
            });

            if (response.ok) {
                console.log('✅ BROKE cluster detected - debug/models successful');
                serverCapabilities.hasDebugEndpoints = true;
                serverCapabilities.hasComplexityEndpoint = true;
                serverCapabilities.hasModelsDebugEndpoint = true;
                serverCapabilities.hasVoteEndpoint = true;
                serverCapabilities.requiresApiKey = true;
                serverCapabilities.hasStandardModelsEndpoint = false;

                console.log('🔧 BROKE cluster mode: Debug panel enabled, /debug/* endpoints active');
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

// Force refresh capabilities (for server switches)
window.refreshServerCapabilities = function() {
    console.log('Forcing server capability refresh...');
    sessionStorage.removeItem(CAPABILITY_CACHE_KEY);
    sessionStorage.removeItem(CAPABILITY_CACHE_TIMESTAMP_KEY);
    return window.detectServerCapabilities();
};

// API utility functions
async function fetchWithAuth(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const hasBody = options.body !== undefined && options.body !== null;
    const mergedHeaders = { ...(options.headers || {}) };

    // Only set JSON content-type when we actually send a body (avoids CORS preflights for GET).
    if (hasBody && !('Content-Type' in mergedHeaders) && !('content-type' in mergedHeaders)) {
        mergedHeaders['Content-Type'] = 'application/json';
    }

    // Only add API key if server requires it
    if (serverCapabilities.requiresApiKey && !('X-API-Key' in mergedHeaders)) {
        mergedHeaders['X-API-Key'] = API_KEY;
    }

    return fetch(url, {
        ...options,
        method,
        headers: mergedHeaders
    });
}

// Health check API with fallback for standard OpenAI-compatible servers
async function checkAPIHealth() {
    // Try mlx-knife /health endpoint first (has extra metadata)
    try {
        const response = await fetchWithAuth(buildApiUrl('/health'));
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        // /health not available - try fallback
    }

    // Fallback: Try standard OpenAI /v1/models endpoint
    // This works with Ollama, LM-Studio, and other OpenAI-compatible servers
    try {
        const response = await fetchWithAuth(buildApiUrl('/v1/models'));
        if (response.ok) {
            const data = await response.json();
            // Return minimal health data if models endpoint works
            return {
                status: 'ok',
                service: 'OpenAI-compatible API',
                models: data.data ? data.data.length : 0
            };
        }
    } catch (error) {
        // Both endpoints failed
    }

    throw new Error('API server not reachable - please start your backend server');
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
        const response = await fetchWithAuth(buildApiUrl('/debug/complexity'), {
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

// Model context length cache (model ID -> context_length)
const modelContextLengths = new Map();

// Get context length for a model (returns null if unknown)
function getModelContextLength(modelId) {
    return modelContextLengths.get(modelId) || null;
}
window.getModelContextLength = getModelContextLength;

// Load available models API with fallback to standard endpoint
async function loadAvailableModels() {
    console.log('📋 loadAvailableModels called with capabilities:', serverCapabilities);
    
    try {
        // Try debug endpoint first if available
        if (serverCapabilities.hasModelsDebugEndpoint) {
            console.log('🔧 Using debug endpoint /debug/models');
            const response = await fetchWithAuth(buildApiUrl('/debug/models'));
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
            const response = await fetch(buildApiUrl('/v1/models'));
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
                // Also cache context_length if provided by server
                models.forEach(model => {
                    const modelId = model.id;
                    const modelName = modelId.replace('mlx-community/', '');

                    // Cache context_length if available (MLX Knife extension)
                    if (model.context_length) {
                        modelContextLengths.set(modelId, model.context_length);
                    }

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
        const response = await fetchWithAuth(buildApiUrl('/debug/vote'), {
            method: 'POST',
            body: JSON.stringify(voteData)
        });
        
        return response.ok;
    } catch (error) {
        console.error('Vote submission error:', error);
        return false;
    }
}

// Audio transcription API (Whisper-compatible)
// Returns transcription result or null if model is not a transcription model
async function transcribeAudio(file, model, options = {}) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', model);

    // Optional parameters
    if (options.language) {
        formData.append('language', options.language);
    }
    formData.append('response_format', options.response_format || 'json');
    if (options.temperature !== undefined) {
        formData.append('temperature', options.temperature.toString());
    }

    try {
        // Build headers for authentication (if required by server)
        const headers = {};
        if (serverCapabilities.requiresApiKey) {
            headers['X-API-Key'] = API_KEY;
        }

        const response = await fetch(buildApiUrl('/v1/audio/transcriptions'), {
            method: 'POST',
            body: formData,
            headers: headers
            // Note: Don't set Content-Type header - browser will set it with boundary
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));

            // Check if this is a "not a transcription model" error
            const errorMsg = errorData.error?.message || errorData.message || errorData.detail || '';
            if (errorMsg.toLowerCase().includes('not a') &&
                errorMsg.toLowerCase().includes('transcription')) {
                console.log('[AUDIO] Model is not a transcription model, will fallback to chat');
                return null; // Signal to fallback to chat/completions
            }

            // ADR-004 envelope detection
            if (errorData.status === 'error' && errorData.error?.type) {
                const err = errorData.error;
                throw new Error(`${err.type}: ${err.message}`);
            }

            throw new Error(errorMsg || `HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        // Network errors or parse errors
        if (error.message.includes('not a') && error.message.includes('transcription')) {
            return null;
        }
        throw error;
    }
}

// Chat completions API
async function createChatCompletion(requestBody) {
    const response = await fetchWithAuth(buildApiUrl('/v1/chat/completions'), {
        method: 'POST',
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        // Detect if request contains images (Vision API)
        const hasImages = requestBody.messages?.some(msg =>
            Array.isArray(msg.content) && msg.content.some(part => part.type === 'image_url')
        );

        // Count images if present
        let imageCount = 0;
        if (hasImages) {
            requestBody.messages.forEach(msg => {
                if (Array.isArray(msg.content)) {
                    imageCount += msg.content.filter(part => part.type === 'image_url').length;
                }
            });
        }

        // Capture X-Request-ID for debugging (MLX Knife extension)
        const requestId = response.headers.get('X-Request-ID');
        if (requestId) {
            console.log(`[API Error] X-Request-ID: ${requestId}`);
        }

        // Try to extract detailed error message from server response
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        // HTTP 507: Insufficient Storage (Memory constraints)
        if (response.status === 507) {
            errorMessage = 'Insufficient Memory: Model too large for available RAM. ' +
                           'Try a smaller quantized model (e.g., 4-bit instead of 8-bit).';
        }

        try {
            const errorData = await response.json();

            // ADR-004 envelope detection: {status: "error", error: {type, message, retryable}}
            if (errorData.status === 'error' && errorData.error?.type) {
                const err = errorData.error;
                const typeLabels = {
                    'validation_error': 'Validation Error',
                    'model_not_found': 'Model Not Found',
                    'internal_error': 'Internal Error',
                    'server_shutdown': 'Server Shutdown',
                    'insufficient_memory': 'Insufficient Memory',
                    'access_denied': 'Access Denied',
                    'ambiguous_match': 'Ambiguous Match',
                    'download_failed': 'Download Failed'
                };
                errorMessage = `${typeLabels[err.type] || err.type}: ${err.message}`;
                if (err.retryable) {
                    errorMessage += ' (retryable)';
                }
                // Log request_id for debugging if present
                if (errorData.request_id) {
                    console.log(`[API] Request-ID: ${errorData.request_id}`);
                }
            } else if (errorData.error?.message) {
                // OpenAI-style: { error: { message: "...", type: "..." } }
                errorMessage = errorData.error.message;
            } else if (errorData.error) {
                // Simple error string: { error: "..." }
                errorMessage = errorData.error;
            } else if (errorData.detail) {
                // FastAPI-style: { detail: "..." }
                errorMessage = errorData.detail;
            } else if (errorData.message) {
                // Generic: { message: "..." }
                errorMessage = errorData.message;
            }

            // Add context-aware hints for Vision API errors
            if (response.status === 400 && hasImages) {
                const imageContext = `\n\n[Request contained ${imageCount} image(s)]`;

                if (errorMessage.toLowerCase().includes('payload') ||
                    (errorMessage.toLowerCase().includes('request') && errorMessage.toLowerCase().includes('large'))) {
                    errorMessage += imageContext + '\nTip: Image payload too large. Try using fewer or smaller images (max 20MB per image).';
                } else if (errorMessage.toLowerCase().includes('token') ||
                           errorMessage.toLowerCase().includes('context')) {
                    errorMessage += imageContext + '\nTip: Images exceed model context window. Reduce image count or resolution.';
                } else if (errorMessage.toLowerCase().includes('image')) {
                    errorMessage += imageContext + '\nTip: Check image format (JPEG, PNG, GIF, WebP) and size limits.';
                } else {
                    // Generic Vision API error - add image context
                    errorMessage += imageContext + '\nTip: This error may be related to the uploaded images. Try reducing image count or size.';
                }
            }
        } catch (e) {
            // If JSON parsing fails, keep the generic HTTP error
            console.warn('[API] Could not parse error response as JSON:', e);
        }

        throw new Error(errorMessage);
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
