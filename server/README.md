# Remote GPU Inference Server

This FastAPI server provides GPU-accelerated LLM inference for the visualization.

## ✨ Features

- ✅ **CORS Enabled** - Works seamlessly with frontend
- ✅ **Streaming Support** - Real-time token generation via SSE
- ✅ **Tokenization API** - Visualize input tokens
- ✅ **Model Caching** - Fast subsequent requests
- ✅ **Error Handling** - Robust production-ready code
- ✅ **Flexible Models** - Support for any HF causal LM

## Setup

1. Install dependencies:
```bash
cd server
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

2. (Optional) Set Hugging Face token if accessing gated models:
```bash
export HUGGINGFACE_HUB_TOKEN=your_token_here
```

3. Run the server:
```bash
python main.py
```

The server will start on `http://localhost:8000`

## Endpoints

### GET `/health`
Health check endpoint

**Response:**
```json
{
  "ok": true
}
```

### POST `/tokenize`
Tokenize text for visualization (NEW!)

**Request:**
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

### POST `/generate`
Single-shot text generation (non-streaming)

**Request:**
```json
{
  "model_id": "meta-llama/Llama-3.2-1B-Instruct",
  "prompt": "Data is changing",
  "max_new_tokens": 128,
  "temperature": 0.7,
  "top_p": 0.95,
  "repetition_penalty": 1.0
}
```

**Response:**
```json
{
  "text": "Generated text here..."
}
```

### POST `/generate/stream`
Streaming text generation using Server-Sent Events (SSE)

**Request:** Same as `/generate`

**Response:** Stream of `data: <token>` events

## Testing

Run the comprehensive test suite:

```bash
python test_api.py
```

This tests all endpoints including CORS configuration.

## GPU Requirements

- CUDA-capable GPU recommended
- At least 4GB VRAM for smallest models (TinyLlama, LLaMA 3.2 1B)
- 8GB+ VRAM for 2B-7B models
- Models load in bfloat16 precision by default

## Supported Models

The server can load any Hugging Face causal LM model:
- meta-llama/Llama-3.2-1B-Instruct
- TinyLlama/TinyLlama-1.1B-Chat-v1.0
- google/gemma-2-2b-it
- gpt2 (recommended for testing)
- Any other compatible model from HF Hub

Models are cached after first load for faster subsequent generations.

## Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Quick reference guide
- **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** - Complete API reference
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Implementation details

## Frontend Integration

The server integrates with the LLM visualization frontend via:
- `src/llm/components/PromptBar.tsx` - UI for tokenization and generation
- `src/llm/components/RemoteClient.ts` - Streaming client implementation
- `src/llm/Program.ts` - Token visualization display

## Troubleshooting

### CORS Errors
✅ **Fixed!** The server now properly handles CORS via middleware.

### Model Loading Issues
- First request downloads the model (can take 30s+)
- Check console for loading progress
- Ensure sufficient disk space and memory

### Port Already in Use
```bash
# Kill existing server
pkill -f "python3 main.py"
# Or change port in main.py
uvicorn.run(app, host='0.0.0.0', port=8001)
```

