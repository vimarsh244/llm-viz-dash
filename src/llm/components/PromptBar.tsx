import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProgramState } from '../Sidebar';
import { assignImm, clamp } from '@/src/utils/data';
import { Vec3 } from '@/src/utils/vector';
import { streamFromServer } from './RemoteClient';
import { IModelShape } from '../GptModel';
import { IModelExample } from '../Program';
import { ICameraPos } from '../Camera';
import { calculateWeightCount } from '../GptModelLayout';
import { initBlockRender } from '../render/blockRender';
import { genGptModelLayout } from '../GptModelLayout';
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

function configToShape(cfg: IModelConfigShapeLike): { C: number; nHeads: number; nBlocks: number; vocabSize: number; T: number } {
    // Map common keys across GPT/LLaMA/Gemma
    let C = cfg.n_embd ?? cfg.hidden_size ?? 768;
    let nHeads = cfg.n_head ?? cfg.num_attention_heads ?? 12;
    let nBlocks = cfg.n_layer ?? cfg.num_hidden_layers ?? 12;
    let vocabSize = cfg.vocab_size ?? 50257;
    let T = cfg.block_size ?? cfg.max_position_embeddings ?? 2048;
    return { C, nHeads, nBlocks, vocabSize, T };
}

function formatModelName(modelId: string): string {
    // Extract a readable name from the model ID
    // e.g., "meta-llama/Llama-3.2-1B-Instruct" -> "Llama 3.2 1B Instruct"
    let parts = modelId.split('/');
    let name = parts[parts.length - 1];
    // Replace dashes and underscores with spaces, capitalize words
    name = name.replace(/[-_]/g, ' ');
    name = name.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    return name;
}

function makeCamera(center: Vec3, angle: Vec3): ICameraPos {
    return { center, angle };
    // TODO: add camera position based on model size
    // let cameraCenter = new Vec3(offset.x, 0, -Math.max(400, shape.C * 6));
    // let cameraAngle = new Vec3(285, 22, 12);
    // return { center: cameraCenter, angle: cameraAngle };
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


            let modelShape: IModelShape = {
                B: 1,
                T: shape.T,
                C: shape.C,
                nHeads: shape.nHeads,
                A: shape.C / shape.nHeads,
                nBlocks: shape.nBlocks,
                vocabSize: shape.vocabSize,
            };
            // don't modify prog.shape - that's for the mainExample (nano-gpt)
            // each model example has its own shape property
            
            // Create model name from ID
            let modelName = formatModelName(id);
            let weightCount = calculateWeightCount(modelShape);
            
            // Check if model already exists (by name)
            let existingIndex = prog.examples.findIndex(ex => ex.name === modelName);
            if (existingIndex >= 0) {
                // Model already exists, select it instead of creating a new one
                prog.currExampleId = existingIndex;
                prog.camera.desiredCamera = prog.examples[existingIndex].camera;
                prog.markDirty();
                console.log('Model already loaded, selecting existing:', modelName);
                return;
            }
            
            // Calculate offset for positioning
            // Place new models starting from mainExample, incrementing by delta
            let delta = new Vec3(10000, 0, 0);
            
            // Find all used X positions (considering only non-negative positions near mainExample)
            let usedXPositions = new Set<number>();
            usedXPositions.add(prog.mainExample.offset?.x ?? 0);
            prog.examples.forEach(ex => {
                let x = ex.offset?.x ?? 0;
                // Only consider models in the "new model" region (>= 0)
                if (x >= 0) {
                    usedXPositions.add(x);
                }
            });
            
            // Find the first free slot starting from mainExample position (0)
            let baseX = prog.mainExample.offset?.x ?? 0;
            let slotIndex = 1; // start checking from slot 1 (slot 0 is mainExample)
            let nextX = baseX + (slotIndex * delta.x);
            while (usedXPositions.has(nextX)) {
                slotIndex++;
                nextX = baseX + (slotIndex * delta.x);
            }
            let offset = new Vec3(nextX, 0, 0);
            
            console.log('Placing new model at offset:', offset, 'slot:', slotIndex);
            
            // Calculate camera position based on model size
            let cameraCenter = new Vec3(offset.x, 0, -Math.max(400, shape.C * 6));
            let cameraAngle = new Vec3(285, 22, 12);
            
            // Create model example
            const ctx = prog.render?.ctx;
            if (!ctx) {
                console.warn('Renderer not ready yet; try again after canvas initializes');
                return;
            }

            let modelExample: IModelExample = {
                name: modelName,
                enabled: true,
                shape: modelShape,
                offset: offset,
                modelCardOffset: delta.mul(0.5),
                blockRender: initBlockRender(ctx),
                camera: makeCamera(cameraCenter, cameraAngle),
            };
            // Don't pre-generate layout - let the render loop handle it properly
            // The layout will be generated in Program.ts with proper offset handling
            
            // Add to examples array
            prog.examples.push(modelExample);
            
            // Select the newly loaded model
            prog.currExampleId = prog.examples.length - 1;
            prog.camera.desiredCamera = modelExample.camera;
            prog.markDirty();
            
            console.log('Applied model config:', {
                name: modelName,
                weightCount: weightCount,
                nBlocks: shape.nBlocks,
                nHeads: shape.nHeads,
                C: shape.C,
                vocabSize: shape.vocabSize,
                T: shape.T,
                offset: offset,
                enabled: modelExample.enabled,
                hasBlockRender: !!modelExample.blockRender,
                totalExamples: prog.examples.length,
                existingModels: prog.examples.map(e => ({ name: e.name, offset: e.offset })),
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

    async function onAutoGenerate() {
        if (!prog.wasmGptModel || !prog.jsGptModel) {
            console.warn('Model not loaded. Please load a model first.');
            return;
        }

        // tokenize prompt first
        setTokenizing(true);
        try {
            let tokens: Float32Array | null = null;
            
            // try remote tokenization first
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
                        tokens = new Float32Array(Math.max(T, data.token_ids.length));
                        for (let i = 0; i < data.token_ids.length; i++) {
                            tokens[i] = data.token_ids[i];
                        }
                    }
                } catch (e) {
                    console.warn('Remote tokenization failed', e);
                }
            }
            
            // fallback: simple tokenization
            if (!tokens) {
                let promptTokens = prompt.trim().split(/\s+/);
                setTokenCount(promptTokens.length);
                let T = prog.shape.T;
                tokens = new Float32Array(Math.max(T, promptTokens.length));
                for (let i = 0; i < promptTokens.length; i++) {
                    tokens[i] = i % prog.shape.vocabSize; // simple mapping
                }
            }
            
            // start auto-generation
            prog.generation.active = true;
            prog.generation.targetTokens = 10;
            prog.generation.tokensGenerated = 0;
            prog.generation.currentStep = 'idle';
            prog.generation.stepProgress = 0;
            prog.generation.cameraPhase = 0;
            prog.generation.promptTokens = tokens;
            prog.generation.generatedTokens = [];
            
            prog.displayTokensBuf = tokens;
            prog.markDirty();
            
        } catch (e) {
            console.error('Auto-generation setup failed', e);
        } finally {
            setTokenizing(false);
        }
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
                <button className={s.buttonBlue}
                    onClick={onAutoGenerate}
                    disabled={tokenizing || !prog.wasmGptModel || !prog.jsGptModel || prog.generation.active}
                >{prog.generation.active ? 'Generating...' : 'Auto Generate & Visualize'}</button>
            </div>
        </div>
        {streamText && <div className={s.streamOutput}>
            {streamText}
        </div>}
    </div>;
}


