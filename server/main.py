from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, AsyncGenerator
import asyncio
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer

app = FastAPI()

# add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allows all origins in development
    allow_credentials=True,
    allow_methods=["*"],  # allows all methods including POST, GET, OPTIONS
    allow_headers=["*"],  # allows all headers
)

_models = {}

class GenerateRequest(BaseModel):
    model_id: str
    prompt: str
    max_new_tokens: int = 128
    temperature: float = 0.7
    top_p: float = 0.95
    repetition_penalty: float = 1.0

class ConfigRequest(BaseModel):
    model_id: str

def get_model(model_id: str):
    if model_id in _models:
        return _models[model_id]
    
    print(f"Loading model: {model_id}")
    try:
        tok = AutoTokenizer.from_pretrained(model_id)
        model = AutoModelForCausalLM.from_pretrained(
            model_id, 
            torch_dtype=torch.bfloat16, 
            device_map='auto'
        )
        _models[model_id] = (tok, model)
        print(f"Model loaded successfully: {model_id}")
        return _models[model_id]
    except Exception as e:
        print(f"Error loading model {model_id}: {e}")
        raise

@app.post('/generate')
def generate(req: GenerateRequest):
    try:
        tok, model = get_model(req.model_id)
        inputs = tok(req.prompt, return_tensors='pt').to(model.device)
        out = model.generate(
            **inputs,
            max_new_tokens=req.max_new_tokens,
            do_sample=req.temperature > 0,
            temperature=req.temperature if req.temperature > 0 else None,
            top_p=req.top_p,
            repetition_penalty=req.repetition_penalty,
        )
        text = tok.decode(out[0], skip_special_tokens=True)
        return { 'text': text }
    except Exception as e:
        print(f"Error in generate: {e}")
        return JSONResponse(status_code=500, content={'error': str(e)})

@app.post('/generate/stream')
def generate_stream(req: GenerateRequest):
    try:
        tok, model = get_model(req.model_id)
        inputs = tok(req.prompt, return_tensors='pt').to(model.device)
        streamer = TextIteratorStreamer(tok, skip_prompt=True, skip_special_tokens=True)

        gen_kwargs = dict(
            **inputs,
            max_new_tokens=req.max_new_tokens,
            do_sample=req.temperature > 0,
            temperature=req.temperature if req.temperature > 0 else None,
            top_p=req.top_p,
            repetition_penalty=req.repetition_penalty,
            streamer=streamer,
        )

        def event_stream():
            import threading
            thread = threading.Thread(target=model.generate, kwargs=gen_kwargs)
            thread.start()
            try:
                for piece in streamer:
                    yield f"data: {piece}\n\n"
            except Exception as e:
                print(f"Streaming error: {e}")
            finally:
                thread.join()

        return StreamingResponse(event_stream(), media_type='text/event-stream')
    except Exception as e:
        print(f"Error in generate_stream: {e}")
        return JSONResponse(status_code=500, content={'error': str(e)})

@app.post('/tokenize')
def tokenize_text(req: GenerateRequest):
    """Tokenize text without running generation"""
    try:
        tok, _ = get_model(req.model_id)
        encoded = tok(req.prompt, return_tensors='pt')
        token_ids = encoded['input_ids'][0].tolist()
        tokens = [tok.decode([tid]) for tid in token_ids]
        return {
            'token_ids': token_ids,
            'tokens': tokens,
            'count': len(token_ids)
        }
    except Exception as e:
        print(f"Error in tokenize: {e}")
        return JSONResponse(status_code=500, content={'error': str(e)})

@app.post('/config')
def get_model_config(req: ConfigRequest):
    """Get model configuration for visualization"""
    try:
        print(f"Config request received for model: {req.model_id}")
        tok, model = get_model(req.model_id)
        config = model.config
        
        # Extract common config fields for visualization
        # Support both GPT-style (n_embd, n_head, n_layer) and LLaMA-style (hidden_size, num_attention_heads, num_hidden_layers)
        config_dict = {}
        
        # Try to get each attribute, only include if it exists
        attrs = [
            'n_embd', 'hidden_size', 'n_head', 'num_attention_heads',
            'n_layer', 'num_hidden_layers', 'vocab_size',
            'block_size', 'max_position_embeddings'
        ]
        
        for attr in attrs:
            if hasattr(config, attr):
                value = getattr(config, attr)
                if value is not None:
                    config_dict[attr] = value
        
        # Also include the full config dict as fallback for any missing fields
        if hasattr(config, 'to_dict'):
            raw_config = config.to_dict()
            # Merge any missing fields from raw config
            for key in attrs:
                if key not in config_dict and key in raw_config:
                    config_dict[key] = raw_config[key]
        
        print(f"Config extracted: {list(config_dict.keys())}")
        return config_dict
    except Exception as e:
        print(f"Error in get_model_config: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={'error': str(e)})

@app.get('/health')
def health():
    return { 'ok': True }

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)


