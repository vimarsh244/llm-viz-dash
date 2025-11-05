# LLM Visualization - Usage Guide

## New Features

This guide covers the recently added features for dynamic model loading, prompt tokenization, and remote GPU inference.

## Getting Started

### 1. Install Dependencies

```bash
# Install frontend dependencies
yarn install  # or npm install

# Install null-loader for webpack
# (should already be in package.json)
```

### 2. Start the Development Server

```bash
yarn dev
```

The app will be available at `http://localhost:3002`

### 3. (Optional) Start Remote GPU Server

For remote inference capabilities:

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

## Using the Prompt Bar

The prompt bar appears at the top of the visualization and provides several features:

### A. Prompt Input & Tokenization

1. **Enter a prompt** in the text field (e.g., "Data is changing into information")
2. Click **"Tokenize"** to:
   - Convert your text to token IDs using transformers.js
   - Display the token count
   - Update the input boxes in the 3D visualization

**Note:** Tokenization runs entirely in your browser using WebAssembly.

### B. Model Selection & Dynamic Architecture

#### Using Preset Models

1. Select from the dropdown:
   - **LLaMA 3.2 1B Instruct** - Meta's newest small LLaMA
   - **TinyLlama 1.1B Chat** - Compact chat model
   - **Gemma 2 2B IT** - Google's instruction-tuned model

2. Click **"Load Config"** to:
   - Fetch the model's configuration from Hugging Face
   - Regenerate the 3D visualization with correct:
     - Number of layers
     - Attention heads
     - Hidden dimensions
     - Vocabulary size

#### Loading Custom Models

1. **Enter any Hugging Face repository ID** in the text field
   - Examples:
     - `mistralai/Mistral-7B-Instruct-v0.1`
     - `microsoft/phi-2`
     - `facebook/opt-1.3b`

2. Click **"Load Config"** to visualize that model's architecture

**Supported Architectures:**
- GPT-2 / GPT-Neo / GPT-J
- LLaMA / LLaMA 2 / LLaMA 3
- Gemma / Gemma 2
- Mistral
- Phi
- OPT

The visualization automatically maps different config formats:
- `n_embd` / `hidden_size` → embedding dimension
- `n_head` / `num_attention_heads` → attention heads
- `n_layer` / `num_hidden_layers` → transformer blocks

### C. Remote GPU Generation

For actual text generation with full models:

1. Make sure the Python server is running (see setup above)
2. Enter the **Server URL** (default: `http://localhost:8000`)
3. Click **"Generate (remote)"** to:
   - Stream tokens from the GPU server
   - Display generated text below the prompt bar
   - Click again to stop generation

**Why Remote GPU?**
- Larger models (7B+) require significant VRAM
- Keeps the browser lightweight
- Supports streaming token generation
- Can run on a separate machine with GPU

## Architecture Details

### How It Works

1. **Config Loading:**
   - Fetches `config.json` from Hugging Face Hub
   - Parses model dimensions (hidden size, heads, layers)
   - Regenerates 3D layout with correct proportions

2. **Tokenization:**
   - Uses `@xenova/transformers` (transformers.js)
   - Runs in browser via WebAssembly + ONNX Runtime
   - No server required for tokenization
   - Downloads tokenizer first time (cached after)

3. **Remote Inference:**
   - FastAPI server with PyTorch + Transformers
   - Uses `TextIteratorStreamer` for token-by-token streaming
   - Server-Sent Events (SSE) for real-time updates
   - Models cached in VRAM after first load

### File Structure

```
src/llm/components/
  ├── PromptBar.tsx           # UI component with all controls
  └── RemoteClient.ts         # SSE client for streaming

src/llm/
  ├── Program.ts              # Added displayTokensBuf for token display
  └── LayerView.tsx           # Integrated PromptBar overlay

server/
  ├── main.py                 # FastAPI server with streaming
  ├── requirements.txt        # Python dependencies
  └── README.md              # Server documentation
```

## Troubleshooting

### "Module parse failed" / onnxruntime-node error

This has been fixed with webpack configuration. If you still see it:

1. Stop the dev server
2. Delete `.next/` folder:
   ```bash
   rm -rf .next
   ```
3. Restart:
   ```bash
   yarn dev
   ```

### Tokenizer Download Issues

First tokenizer load downloads model files (~1-50MB depending on model):
- Files cached in browser's IndexedDB
- Subsequent loads are instant
- Check browser console for download progress

### Model Config Not Loading

Some models require authentication or have non-standard configs:
- Check if model is gated (requires HF account)
- Try the main branch explicitly: `model-name` (it auto-tries multiple branches)
- Check browser console for 404 errors

### Remote Server Connection Issues

- Ensure Python server is running on port 8000
- Check CORS if running on different domains
- Verify GPU drivers and CUDA installation
- Check server logs for model loading errors

## Performance Tips

### For Visualization Only:
- Use "Load Config" to see different architectures
- Use "Tokenize" to see token representation
- No need for remote server

### For Full Generation:
- Start with small models (1B-2B parameters)
- Monitor GPU VRAM usage
- First generation is slower (model loading)
- Subsequent generations reuse loaded model

### Browser Performance:
- Larger models (12+ layers) may render slowly
- Use camera zoom to focus on specific layers
- Close other browser tabs during visualization

## Next Steps

### Adding More Features:

1. **Live Activation Visualization:**
   - Modify `server/main.py` to return intermediate activations
   - Stream attention maps, layer outputs to frontend
   - Update textures in real-time during generation

2. **In-Browser Inference:**
   - Add WebGPU backend via transformers.js
   - Run small models entirely in browser
   - Toggle between local/remote execution

3. **Architecture Comparison:**
   - Load multiple models side-by-side
   - Highlight architectural differences
   - Compare layer counts, dimensions

## Additional Resources

- [Transformers.js Documentation](https://huggingface.co/docs/transformers.js)
- [Hugging Face Model Hub](https://huggingface.co/models)
- [Original LLM Viz Project](https://github.com/bbycroft/llm-viz)

## Questions?

Check the console logs for detailed error messages and loading status.

