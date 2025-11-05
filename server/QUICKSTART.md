# Quick Start Guide

## 🚀 Server Setup (One-Time)

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## ▶️ Run Server

```bash
cd server
source .venv/bin/activate
python3 main.py
```

Server will be available at: **http://localhost:8000**

## ✅ Test Server

```bash
# In a new terminal
cd server
source .venv/bin/activate
python3 test_api.py
```

Expected output: `5/5 tests passed`

## 🌐 Use with Frontend

1. **Start Next.js frontend** (in another terminal):
   ```bash
   npm run dev
   # or
   yarn dev
   ```

2. **Navigate to**: http://localhost:3000/llm

3. **Use the PromptBar**:
   - Enter a prompt
   - Click **"Tokenize"** to visualize tokens
   - Click **"Generate (remote)"** to generate text with streaming

## 🔍 Quick API Test

### Health Check
```bash
curl http://localhost:8000/health
```

### Tokenize
```bash
curl -X POST http://localhost:8000/tokenize \
  -H "Content-Type: application/json" \
  -d '{"model_id": "gpt2", "prompt": "Hello world"}'
```

### Generate
```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "gpt2",
    "prompt": "Once upon a time",
    "max_new_tokens": 20
  }'
```

### Stream
```bash
curl -X POST http://localhost:8000/generate/stream \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "gpt2",
    "prompt": "Hello",
    "max_new_tokens": 10
  }' \
  -N
```

## 📋 Common Issues

### CORS Errors
- ✅ **Fixed!** CORS middleware is now properly configured
- Server accepts requests from any origin

### Model Loading Slow
- First request downloads model from Hugging Face
- Subsequent requests use cached model

### Out of Memory
- Use smaller models (gpt2, TinyLlama-1.1B)
- Or use CPU: set `device_map='cpu'` in main.py

## 📚 More Info

- **Full API Docs**: See `API_DOCUMENTATION.md`
- **Implementation Details**: See `IMPLEMENTATION_SUMMARY.md`
- **Frontend Integration**: See `src/llm/components/PromptBar.tsx`

## 🎯 Supported Models

Default models in PromptBar:
- `meta-llama/Llama-3.2-1B-Instruct`
- `TinyLlama/TinyLlama-1.1B-Chat-v1.0`
- `google/gemma-2-2b-it`
- `gpt2` (fastest for testing)

Any Hugging Face causal LM model should work!

## 💡 Tips

1. **Use gpt2 for testing** - It's small and fast
2. **Server URL in frontend** - Default is `http://localhost:8000`
3. **Change models** - Enter any HF model ID in custom field
4. **Load config first** - Click "Load Config" to update visualization shape
5. **Watch console** - Server logs model loading progress

