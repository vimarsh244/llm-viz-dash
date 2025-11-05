# LLM Visualization Server API Documentation

## Overview

This FastAPI server provides endpoints for LLM tokenization, text generation, and streaming generation. It integrates with the llm-viz frontend to enable real-time visualization of language model processing.

## Features

- ✅ **CORS Support**: Fully configured to accept requests from frontend applications
- ✅ **Model Caching**: Models are loaded once and cached for subsequent requests
- ✅ **Error Handling**: Comprehensive error handling with informative error messages
- ✅ **Streaming Support**: Server-Sent Events (SSE) for real-time token generation
- ✅ **Multiple Models**: Support for any Hugging Face model ID

## Endpoints

### 1. Health Check

**`GET /health`**

Check if the server is running.

**Response:**
```json
{
  "ok": true
}
```

---

### 2. Tokenization

**`POST /tokenize`**

Tokenize text without running generation. Used by the frontend to visualize input tokens.

**Request Body:**
```json
{
  "model_id": "gpt2",
  "prompt": "Hello world"
}
```

**Response:**
```json
{
  "token_ids": [15496, 995],
  "tokens": ["Hello", " world"],
  "count": 2
}
```

**Frontend Integration:**
- Called when user clicks "Tokenize" button in PromptBar
- Token IDs are displayed in the 3D visualization
- Updates `prog.displayTokensBuf` with token IDs

---

### 3. Text Generation (Non-Streaming)

**`POST /generate`**

Generate text using the specified model.

**Request Body:**
```json
{
  "model_id": "gpt2",
  "prompt": "Once upon a time",
  "max_new_tokens": 128,
  "temperature": 0.7,
  "top_p": 0.95,
  "repetition_penalty": 1.0
}
```

**Parameters:**
- `model_id`: Hugging Face model ID (e.g., "gpt2", "meta-llama/Llama-3.2-1B-Instruct")
- `prompt`: Input text
- `max_new_tokens`: Maximum tokens to generate (default: 128)
- `temperature`: Sampling temperature, 0 for greedy (default: 0.7)
- `top_p`: Nucleus sampling parameter (default: 0.95)
- `repetition_penalty`: Penalty for repeating tokens (default: 1.0)

**Response:**
```json
{
  "text": "Once upon a time, there was a beautiful princess..."
}
```

---

### 4. Streaming Generation

**`POST /generate/stream`**

Generate text with real-time streaming using Server-Sent Events (SSE).

**Request Body:**
```json
{
  "model_id": "gpt2",
  "prompt": "Hello",
  "max_new_tokens": 10,
  "temperature": 0.7,
  "top_p": 0.95,
  "repetition_penalty": 1.0
}
```

**Response Format (SSE):**
```
data: Hello

data: ,

data:  how

data:  are

data:  you
```

**Frontend Integration:**
- Called when user clicks "Generate (remote)" button
- Each token is streamed as it's generated
- Uses `RemoteClient.streamFromServer()` for handling the stream
- Supports abort/stop functionality

---

## CORS Configuration

The server is configured to accept requests from any origin in development:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Note:** For production, restrict `allow_origins` to specific domains.

---

## Model Loading

Models are automatically loaded on first use and cached in memory:

```python
# First request loads the model
POST /tokenize {"model_id": "gpt2", ...}
# Subsequent requests use cached model
```

**Supported Models:**
- `gpt2` (small)
- `meta-llama/Llama-3.2-1B-Instruct`
- `TinyLlama/TinyLlama-1.1B-Chat-v1.0`
- `google/gemma-2-2b-it`
- Any Hugging Face causal LM model

---

## Error Handling

All endpoints return proper error responses:

```json
{
  "error": "Error message here"
}
```

**Status Codes:**
- `200`: Success
- `500`: Server error (model loading failed, generation failed, etc.)

---

## Running the Server

### Development Mode

```bash
cd server
source .venv/bin/activate
python3 main.py
```

Server runs on: `http://0.0.0.0:8000`

### Testing

Run the test suite:

```bash
python3 test_api.py
```

---

## Frontend Integration

### PromptBar Component

Located at: `src/llm/components/PromptBar.tsx`

**Features:**
1. **Tokenize Button**: Calls `/tokenize` endpoint
2. **Load Config Button**: Fetches model config from Hugging Face
3. **Generate (remote) Button**: Calls `/generate/stream` for streaming generation

**Configuration:**
- Server URL input field (default: `http://localhost:8000`)
- Model selector (dropdown + custom input)
- Prompt text area

### RemoteClient

Located at: `src/llm/components/RemoteClient.ts`

**Function:** `streamFromServer()`
- Handles SSE streaming
- Parses "data:" prefixed chunks
- Supports abort controller for stopping generation

---

## Architecture

```
Frontend (Next.js)
    ↓ POST /tokenize
    ↓ POST /generate/stream
FastAPI Server
    ↓ AutoTokenizer
    ↓ AutoModelForCausalLM
Hugging Face Transformers
    ↓
GPU/CPU (torch)
```

---

## Performance Notes

1. **First Request**: Slow due to model loading
2. **Subsequent Requests**: Fast using cached model
3. **Memory**: Models remain in GPU/CPU memory
4. **Concurrency**: Multiple requests supported via threading

---

## Requirements

See `requirements.txt`:
```
fastapi>=0.104.1
uvicorn>=0.24.0
torch>=2.0.0
transformers>=4.35.0
```

---

## Troubleshooting

### CORS Errors
- Ensure server is running
- Check browser console for specific CORS error
- Verify server URL in PromptBar matches actual server

### Model Loading Errors
- Check model ID is valid on Hugging Face
- Ensure sufficient memory (GPU/CPU)
- Check server logs for detailed error messages

### Streaming Not Working
- Verify browser supports SSE
- Check network tab for connection issues
- Ensure request body is valid JSON

---

## Future Enhancements

Potential improvements:
- [ ] Add authentication/API keys
- [ ] Support for custom model weights
- [ ] Batch processing
- [ ] GPU memory management
- [ ] Model quantization options
- [ ] Attention visualization data export

