import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProgramState } from '../Sidebar';
import { assignImm, clamp } from '@/src/utils/data';
import { Vec3 } from '@/src/utils/vector';
import { streamFromServer } from './RemoteClient';
import s from './PromptBar.module.scss';

// Note: @xenova/transformers import is commented out due to onnxruntime-node bundling issues
// Using remote tokenization via server API instead

type HFModelId = string;

const DEFAULT_MODELS: { id: HFModelId; label: string }[] = [
    { id: 'meta-llama/Llama-3.2-1B-Instruct', label: 'LLaMA 3.2 1B Instruct' },
    { id: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0', label: 'TinyLlama 1.1B Chat' },
    { id: 'google/gemma-2-2b-it', label: 'Gemma 2 2B IT' },
];

interface IModelConfigShapeLike {
    hidden_size?: number;
    num_attention_heads?: number;
    num_hidden_layers?: number;
    vocab_size?: number;
    max_position_embeddings?: number;
    n_embd?: number;
    n_head?: number;
    n_layer?: number;
    block_size?: number;
}

async function fetchConfigFromServer(serverUrl: string, modelId: string): Promise<IModelConfigShapeLike | null> {
    try {
        const resp = await fetch(serverUrl.replace(/\/$/, '') + '/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model_id: modelId }),
        });
        if (resp.ok) {
            const data = await resp.json();
            // Server returns normalized config, use it directly
            return data;
        }
    } catch (e) {
        console.warn('Failed to fetch config from server for', modelId, e);
    }
    return null;
}

async function fetchHfConfig(modelId: string): Promise<IModelConfigShapeLike | null> {
    try {
        // Try main branch then fallback
        let branches = ['main', 'refs/pr/1', 'refs/convert/parquet'];
        for (let br of branches) {
            let url = `https://huggingface.co/${modelId}/raw/${br}/config.json`;
            let resp = await fetch(url, { method: 'GET' });
            if (resp.ok) return await resp.json();
        }
    } catch (e) {
        console.warn('Failed to fetch HF config for', modelId, e);
    }
    return null;
}

function configToShape(cfg: IModelConfigShapeLike) {
    // Map common keys across GPT/LLaMA/Gemma
    let C = cfg.n_embd ?? cfg.hidden_size ?? 768;
    let nHeads = cfg.n_head ?? cfg.num_attention_heads ?? 12;
    let nBlocks = cfg.n_layer ?? cfg.num_hidden_layers ?? 12;
    let vocabSize = cfg.vocab_size ?? 50257;
    let T = cfg.block_size ?? cfg.max_position_embeddings ?? 2048;
    return { C, nHeads, nBlocks, vocabSize, T };
}

export const PromptBar: React.FC<{}> = () => {
    let prog = useProgramState();

    let [prompt, setPrompt] = useState<string>('Data is changing ...');
    let [modelId, setModelId] = useState<HFModelId>(DEFAULT_MODELS[0].id);
    let [customModelId, setCustomModelId] = useState<string>('');
    let [loadingCfg, setLoadingCfg] = useState<boolean>(false);
    let [tokenizing, setTokenizing] = useState<boolean>(false);
    let [tokenCount, setTokenCount] = useState<number>(0);
    let [serverUrl, setServerUrl] = useState<string>('http://localhost:8000');
    let [streaming, setStreaming] = useState<boolean>(false);
    let [streamText, setStreamText] = useState<string>('');
    let streamCleanupRef = useRef<null | (() => void)>(null);

    // Auto-load config for default model on mount
    useEffect(() => {
        if (modelId) {
            applyModelConfig(modelId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run on mount

    async function applyModelConfig(id: string) {
        setLoadingCfg(true);
        try {
            let cfg: IModelConfigShapeLike | null = null;
            
            // Try fetching from server first if server URL is set
            if (serverUrl) {
                cfg = await fetchConfigFromServer(serverUrl, id);
                if (cfg) {
                    console.log('Loaded config from server');
                }
            }
            
            // Fallback to HuggingFace if server fetch failed or not available
            if (!cfg) {
                cfg = await fetchHfConfig(id);
                if (cfg) {
                    console.log('Loaded config from HuggingFace');
                }
            }
            
            if (!cfg) {
                console.warn('Could not load config for model:', id);
                return;
            }
            
            let shape = configToShape(cfg);
            prog.shape = {
                B: 1,
                T: shape.T,
                C: shape.C,
                nHeads: shape.nHeads,
                A: shape.C / shape.nHeads,
                nBlocks: shape.nBlocks,
                vocabSize: shape.vocabSize,
            };
            
            // Layout will automatically regenerate on next render via runProgram()
            // Move/zoom camera a bit when shape changes for readability
            prog.camera.center = new Vec3(0, 0, -Math.max(400, shape.C * 6));
            prog.camera.angle = new Vec3(285, 22, 12);
            prog.markDirty();
            
            console.log('Applied model config:', {
                nBlocks: shape.nBlocks,
                nHeads: shape.nHeads,
                C: shape.C,
                vocabSize: shape.vocabSize,
                T: shape.T,
            });
        } finally {
            setLoadingCfg(false);
        }
    }

    async function tokenizeAndShow() {
        setTokenizing(true);
        try {
            // Try remote tokenization first if server URL is set
            if (serverUrl) {
                try {
                    const resp = await fetch(serverUrl.replace(/\/$/, '') + '/tokenize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model_id: customModelId.trim() || modelId,
                            prompt: prompt,
                        }),
                    });
                    if (resp.ok) {
                        const data = await resp.json();
                        setTokenCount(data.count);
                        
                        let T = prog.shape.T;
                        let arr = new Float32Array(Math.max(T, data.token_ids.length));
                        for (let i = 0; i < data.token_ids.length; i++) {
                            arr[i] = data.token_ids[i];
                        }
                        prog.displayTokensBuf = arr;
                        prog.markDirty();
                        console.log('Using remote tokenization');
                        return;
                    }
                } catch (e) {
                    console.warn('Remote tokenization failed, falling back to simple split', e);
                }
            }
            
            // Fallback: use simple whitespace tokenization for demo
            let tokens = prompt.trim().split(/\s+/);
            setTokenCount(tokens.length);
            
            // Create dummy token IDs (0-based index for now)
            let T = prog.shape.T;
            let arr = new Float32Array(Math.max(T, tokens.length));
            for (let i = 0; i < tokens.length; i++) arr[i] = i;
            prog.displayTokensBuf = arr;
            prog.markDirty();
            
            console.log('Note: Using simple whitespace tokenization. Start server for proper tokenization.');
        } catch (e) {
            console.error('tokenization failed', e);
        } finally {
            setTokenizing(false);
        }
    }

    function onLoadClick() {
        let id = customModelId.trim() || modelId;
        if (!id) return;
        applyModelConfig(id);
    }

    function onGenerateRemote() {
        if (streaming) {
            streamCleanupRef.current?.();
            setStreaming(false);
            return;
        }
        setStreamText('');
        setStreaming(true);
        const stop = streamFromServer({
            serverUrl,
            modelId: customModelId.trim() || modelId,
            prompt,
            onText: (t) => {
                setStreamText(prev => prev + t);
            },
            onDone: () => setStreaming(false),
        });
        streamCleanupRef.current = stop;
    }

    return <div className={s.promptBar}>
        <div className={s.container}>
            <div className={s.row}>
                <label className={s.label}>Prompt</label>
                <input
                    className={s.input}
                    placeholder="Enter prompt..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                />
                <button className={s.buttonBlue}
                    onClick={tokenizeAndShow}
                    disabled={tokenizing}
                >{tokenizing ? 'Tokenizing…' : 'Tokenize'}</button>
                <div className={s.tokenCount}>{tokenCount > 0 ? `${tokenCount} tokens` : ''}</div>
            </div>
            <div className={s.row}>
                <label className={s.label}>Model</label>
                <select className={s.select}
                    value={modelId}
                    onChange={(e) => {
                        setModelId(e.target.value);
                        // Auto-load config when model selection changes
                        if (e.target.value) {
                            applyModelConfig(e.target.value);
                        }
                    }}>
                    {DEFAULT_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <input
                    className={s.input}
                    placeholder="Or enter any Hugging Face repo id"
                    value={customModelId}
                    onChange={(e) => setCustomModelId(e.target.value)}
                />
                <button className={s.buttonGray}
                    onClick={onLoadClick}
                    disabled={loadingCfg}
                >{loadingCfg ? 'Loading…' : 'Load Model & Visualize'}</button>
            </div>
            <div className={s.row}>
                <label className={s.label}>Remote GPU</label>
                <input
                    className={s.input}
                    placeholder="Server URL (FastAPI)"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                />
                <button className={s.buttonGreen}
                    onClick={onGenerateRemote}
                >{streaming ? 'Stop' : 'Generate (remote)'}</button>
            </div>
        </div>
        {streamText && <div className={s.streamOutput}>
            {streamText}
        </div>}
    </div>;
}


