# Tokenization Fix - onnxruntime-node Issue

## Problem

The `@xenova/transformers` library (transformers.js) includes `onnxruntime-node` as a dependency, which contains native `.node` binary files that webpack cannot bundle for the browser.

## Current Solution

### 1. Disabled In-Browser Tokenization

The direct import of `@xenova/transformers` has been commented out in `PromptBar.tsx` to avoid the bundling error.

### 2. Alternative: Remote Tokenization

The system now uses **remote tokenization** via the Python server:

- Server endpoint: `POST /tokenize`
- Falls back to simple whitespace splitting if server unavailable
- Provides proper BPE tokenization for any model

### 3. Webpack Configuration

Added comprehensive exclusions in `next.config.js`:
- Externals for `onnxruntime-node`
- Browser alias to `false`
- `null-loader` for `.node` files

## How to Use

### Option A: Remote Tokenization (Recommended)

1. Start the Python server:
```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

2. In the UI:
   - Set server URL: `http://localhost:8000`
   - Enter prompt
   - Click "Tokenize"
   - Gets proper tokenization via server

### Option B: Simple Tokenization (No Server)

- Just click "Tokenize" without server running
- Uses whitespace splitting
- Good enough for visualization demo
- Token IDs are sequential (0, 1, 2, ...)

## Future Solutions

### Solution 1: Use CDN Version

Load transformers.js from CDN in `public/index.html`:
```html
<script src="https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"></script>
```

Then use globally:
```typescript
const { AutoTokenizer } = window.Transformers;
```

### Solution 2: WebWorker

Run transformers.js in a Web Worker to isolate WASM/ONNX runtime:
```typescript
// worker.ts
importScripts('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
// ... tokenization logic
```

### Solution 3: Wait for transformers.js Update

Track: https://github.com/xenova/transformers.js/issues
- They may fix the bundling issue
- Or provide better webpack configuration

### Solution 4: Use ONNX Runtime Web

Install only the web version:
```bash
npm install onnxruntime-web @xenova/transformers
```

Configure to use web backend only.

## Current Status

✅ **Working:**
- Model loading from Hugging Face
- Architecture visualization
- Remote tokenization (with server)
- Simple fallback tokenization
- Text generation streaming
- All other features

⚠️ **Disabled:**
- In-browser tokenization via transformers.js
- (Will re-enable once bundling issue resolved)

## Package Dependencies

You can optionally remove `@xenova/transformers` from `package.json` if you don't plan to use it:

```bash
npm uninstall @xenova/transformers
# or
yarn remove @xenova/transformers
```

Everything will still work via remote tokenization.

## Testing

After restart:

1. **Clean build:**
```bash
rm -rf .next node_modules/.cache
yarn dev
```

2. **Test features:**
   - ✅ Load different models
   - ✅ Tokenize (with/without server)
   - ✅ Generate text (with server)
   - ✅ No bundling errors

## Questions?

Check the console for tokenization method used:
- "Using remote tokenization" - server-based (accurate)
- "Using simple whitespace tokenization" - fallback (demo only)

