# WebUI Server Compatibility

## Overview

This WebUI automatically detects and adapts to different server capabilities. It works with any OpenAI-compatible API server and enables additional features when connected to a BROKE Cluster server.

Beyond text chat it supports **multimodal input** (image / audio in `/v1/chat/completions`), **audio transcription** (`/v1/audio/transcriptions`), and **saving generated files** to a local directory (File System Access API). These are gated on the connected model/server actually supporting them; the WebUI degrades gracefully when they are absent.

> **Doc currency:** reflects the WebUI as of **v0.1.6-beta**. Client auth is `X-API-Key` (see [Security Considerations](#security-considerations)).

## Server Detection

The WebUI uses binary detection to determine server type:

1. **Test Endpoint**: `GET /debug/models` with API key header
2. **Classification**: BROKE Cluster mode (debug endpoints available) or Standard OpenAI mode (basic API)
3. **UI Adaptation**: Features enabled/disabled based on detected server type
4. **Session Caching**: Detection result cached for 5 minutes

### Detection Logic

```javascript
// Test for BROKE Cluster
const response = await fetch('/debug/models', {
    headers: { 'X-API-Key': API_KEY }
});

if (response.ok) {
    // BROKE Cluster mode - enable all features
    enableDebugPanel();
    enableStarRatings();
    enableRoutingInfo();
} else {
    // Standard OpenAI mode - basic features only
    showModelSelector();
}
```

## Required Endpoints (Standard OpenAI Mode)

All OpenAI-compatible servers must implement:

### 1. Health Check
```
GET /health
```

**Response**:
```json
{
    "status": "ok"
}
```

**Usage**: Polled every 30 seconds to monitor connection status.

### 2. List Models
```
GET /v1/models
```

**Response**:
```json
{
    "data": [
        {
            "id": "model-name",
            "object": "model",
            "created": 1234567890,
            "owned_by": "organization"
        }
    ]
}
```

**Usage**: Populates model selector dropdown.

**Client Behavior**:
- Client auto-selects the **first model** in the `data[]` array as default
- Server tip: Place currently loaded or preferred model at position 0
- Enables server to pre-select model without custom API extensions
- OpenAI API compliant (list order not specified in OpenAI spec)

### 3. Chat Completion (Streaming)
```
POST /v1/chat/completions
```

**Request**:
```json
{
    "model": "model-name",
    "messages": [
        {"role": "user", "content": "Hello"}
    ],
    "stream": true
}
```

**Response**: Server-Sent Events (SSE) stream
```
data: {"choices":[{"delta":{"content":"Hello"}}]}

data: {"choices":[{"delta":{"content":" there"}}]}

data: [DONE]
```

**Usage**: Main chat functionality with real-time token streaming.

#### Multimodal Content (Vision & Audio)

`/v1/chat/completions` also accepts OpenAI-style multimodal `content` arrays, sent when the user attaches files and the selected model supports the modality:

- **Vision** — `{"type": "image_url", "image_url": {"url": "data:image/png;base64,…"}}`
- **Audio in chat** — `{"type": "input_audio", "input_audio": {"data": "<base64>", "format": "wav"|"mp3"}}`

If the model does not support the modality the server returns an error, which the WebUI surfaces. Reloading the page keeps the conversation but strips binary image/audio payloads from history (text-only follow-ups).

### Audio Transcription (optional)

```
POST /v1/audio/transcriptions
Content-Type: multipart/form-data   (fields: file, model, [language], [response_format], [temperature])
Headers: X-API-Key: <api-key>       (when the server requires auth)
```

For **dedicated STT models** (Whisper, Voxtral). The WebUI routes audio by model: known STT models → this endpoint; known multimodal chat models → `/v1/chat/completions` with `input_audio`. Optional — only needed for STT-model transcription.

## BROKE Cluster Endpoints

BROKE Cluster servers implement these additional endpoints (note: BROKE Cluster is in alpha and these may change):

### 4. Debug Models List
```
GET /debug/models
Headers: X-API-Key: <api-key>
```

**Response**:
```json
{
    "models": [
        {
            "name": "model-1",
            "complexity_tier": "fast",
            "min_complexity": 0.0,
            "max_complexity": 0.4
        },
        {
            "name": "model-2",
            "complexity_tier": "balanced",
            "min_complexity": 0.4,
            "max_complexity": 0.85
        }
    ]
}
```

**Usage**:
- Capability detection (presence indicates BROKE Cluster mode)
- Populates manual model override dropdown
- Shows complexity tier information

**Activates**:
- Debug panel
- Manual model override
- Complexity slider

### 5. Complexity Analysis
```
POST /debug/complexity
Headers: X-API-Key: <api-key>
```

**Request**:
```json
{
    "prompt": "User input text"
}
```

**Response**:
```json
{
    "complexity": 0.65,
    "reasoning": "Moderate complexity task requiring balanced model",
    "recommended_model": "model-2"
}
```

**Usage**: Server-side complexity prediction for auto-routing.

**Note**: This endpoint is BROKE Cluster-specific. Without it, no routing info is available (Standard OpenAI mode).

### 6. Vote/Feedback Collection
```
POST /debug/vote
Headers: X-API-Key: <api-key>
```

**Request**:
```json
{
    "session_id": "req-1234567890",
    "vote": "star_rating",
    "rating": 4,
    "model_used": "model-2",
    "complexity_score": 0.65,
    "response_time": 1250,
    "routing_method": "auto",
    "prompt": "Original user input"
}
```

**Response**:
```json
{
    "status": "recorded"
}
```

**Usage**: Collects user feedback for model training and routing optimization.

**Activates**: Star rating buttons on bot messages.

## Feature Matrix

| Feature | Standard OpenAI Mode | BROKE Cluster Mode |
|---------|--------------|---------------|
| Chat functionality | ✅ | ✅ |
| Streaming responses | ✅ | ✅ |
| Markdown rendering | ✅ | ✅ |
| Vision input (`image_url`) ¹ | ✅ | ✅ |
| Audio input / transcription ¹ | ✅ | ✅ |
| Save / bulk-download generated files ² | ✅ | ✅ |
| Model selector dropdown | ✅ | ❌ |
| Debug panel | ❌ | ✅ |
| Auto/Manual mode toggle | ❌ | ✅ |
| Complexity override slider | ❌ | ✅ |
| Manual model override | ❌ | ✅ |
| Star ratings | ❌ | ✅ |
| Routing info modal | ❌ | ✅ |
| API key requirement | Optional | Required |

¹ Multimodal rows require a connected model/server that supports the modality (a vision or STT model); the WebUI degrades gracefully when unsupported.
² File saving uses the browser File System Access API (Chromium-based browsers); Firefox/Safari fall back to standard per-file downloads.

## UI Adaptations

### Standard OpenAI Mode

**When `/debug/models` returns 404 or error:**

- Model selector dropdown shown in input area
- User must select model before chatting
- Debug panel button hidden
- Star ratings hidden
- Routing info button hidden (no auto-routing, user selects model manually)
- No complexity analysis
- Basic health monitoring only

### BROKE Cluster Mode

**When `/debug/models` returns 200 OK:**

- Debug panel button shown
- Auto-routing enabled by default
- Manual override available via debug panel
- Star ratings shown on bot messages
- **Routing info button** shown on each response (displays complexity analysis and model selection reasoning)
- Complexity override slider (0.0 - 1.0)
- Full complexity analysis with server-side prediction

## Session Caching

To minimize detection overhead:

- Detection result cached in `sessionStorage`
- Cache key: `broke_server_capabilities`
- Cache TTL: 5 minutes
- Manual refresh: `window.refreshServerCapabilities()`

**Cache data structure**:
```javascript
{
    hasDebugEndpoints: boolean,
    hasComplexityEndpoint: boolean,
    hasModelsDebugEndpoint: boolean,
    hasVoteEndpoint: boolean,
    hasStandardModelsEndpoint: boolean,
    requiresApiKey: boolean
}
```

## Error Handling

### Graceful Degradation

The WebUI continues working even if some endpoints fail:

1. `/debug/models` fails → Switch to standard mode
2. `/debug/complexity` fails → Use client-side heuristics
3. `/debug/vote` fails → Hide star ratings but continue chat
4. `/v1/models` fails → User can still type model name manually
5. Connection lost → Show offline indicator, retry on reconnect

### Connection Recovery

- Health check every 30 seconds
- Automatic reconnection attempt
- Visual connection indicator (green/red dot)
- User can continue typing during disconnection

## Testing

### Test Standard OpenAI Mode

```bash
# Any OpenAI-compatible server
# Example endpoints:
GET  /health          → 200 OK
GET  /v1/models       → 200 OK with model list
POST /v1/chat/completions → SSE stream

# Expected UI:
- Model selector dropdown visible
- No debug panel button
- No star ratings
```

### Test BROKE Cluster Mode

```bash
# Server with debug endpoints
# Additional endpoints:
GET  /debug/models    → 200 OK with BROKE Cluster model info
POST /debug/complexity → 200 OK with analysis
POST /debug/vote      → 200 OK

# Expected UI:
- Debug panel button visible
- Star ratings on bot messages
- Auto/Manual mode toggle
- Complexity slider
- Routing info available
```

### Test Server Switching

1. Start server A, open WebUI
2. Observe UI features
3. Stop server A, start server B (different type)
4. Reload browser page
5. Observe UI features changed automatically

## Implementation Guidelines

### For Standard OpenAI Servers

Minimum implementation:
1. `GET /health` - Simple status check
2. `GET /v1/models` - List available models
3. `POST /v1/chat/completions` - Streaming chat

This provides full basic chat functionality.

### For BROKE Cluster Mode Servers

Additional implementation:
1. `GET /debug/models` - Extended model info with tiers
2. `POST /debug/complexity` - Analyze prompt complexity
3. `POST /debug/vote` - Collect feedback

This enables auto-routing, manual override, and training data collection.

## Security Considerations

- API key sent in `X-API-Key` header (not URL) — **including on the multipart `/v1/audio/transcriptions` upload** (a common server-side mistake is to auth JSON endpoints but forget file-upload ones)
- API key required for all `/debug/*` endpoints
- Standard `/v1/*` endpoints may not require auth
- A fronting auth proxy for browser clients may instead expect `Authorization: Bearer <key>` (passes the CORS preflight); the WebUI's own requests use `X-API-Key`
- CORS must be configured for browser access
- Rate limiting recommended for `/debug/complexity` and `/debug/vote`

## Performance Optimization

- Capability detection cached for 5 minutes
- Health check only every 30 seconds
- Streaming responses for instant feedback
- No unnecessary endpoint polling
- Lazy loading of model lists
