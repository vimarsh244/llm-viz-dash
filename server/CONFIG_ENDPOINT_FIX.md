# Fix for /config Endpoint 404 Error

## Problem
The `/config` endpoint is returning 404 errors because the FastAPI server needs to be restarted to pick up the new route.

## Solution

### Step 1: Restart the Server

**Stop the current server** (if running):
- Press `Ctrl+C` in the terminal where the server is running

**Start the server again**:
```bash
cd server
source .venv/bin/activate  # if using venv
python3 main.py
```

### Step 2: Verify the Endpoint Works

After restarting, test the endpoint:

```bash
# Quick test
cd server
python3 verify_config.py

# Or full test suite
python3 test_api.py
```

### Step 3: Test from Frontend

1. Make sure server is running at `http://localhost:8000`
2. Open the frontend at `http://localhost:3000/llm`
3. Select a model from the dropdown or enter a custom model ID
4. Click "Load Model & Visualize"

The config should now load automatically from the server!

## What Changed

1. **Added `/config` endpoint** in `server/main.py`:
   - Extracts model configuration (n_embd, n_head, n_layer, etc.)
   - Supports both GPT-style and LLaMA-style configs
   - Returns JSON with all relevant visualization parameters

2. **Updated frontend** in `src/llm/components/PromptBar.tsx`:
   - Fetches config from server first (if server URL is set)
   - Falls back to HuggingFace if server unavailable
   - Auto-loads config when model is selected
   - Automatically regenerates visualization based on model architecture

## Expected Behavior

After restarting the server:
- ✅ `/config` endpoint returns 200 OK
- ✅ Config contains model parameters (n_embd, n_head, n_layer, vocab_size, etc.)
- ✅ Frontend automatically loads config when model is selected
- ✅ Visualization updates to show correct number of layers, heads, etc.

## Troubleshooting

If still getting 404:
1. **Verify server is running**: `curl http://localhost:8000/health`
2. **Check server logs**: Look for "Config request received" message
3. **Verify route registration**: Check server startup logs for route registration
4. **Test directly**: `curl -X POST http://localhost:8000/config -H "Content-Type: application/json" -d '{"model_id":"gpt2"}'`

If config is empty:
- Model might not be loaded yet (first request loads model)
- Check server logs for model loading messages
- Some models might have different config field names

