import { genModelViewMatrices, ICamera, ICameraPos, updateCamera } from "./Camera";
import { drawAllArrows } from "./components/Arrow";
import { drawBlockLabels } from "./components/SectionLabels";
import { drawModelCard } from "./components/ModelCard";
import { IGptModelLink, IGpuGptModel, IModelShape } from "./GptModel";
import { genGptModelLayout, IBlkDef, IGptModelLayout } from "./GptModelLayout";
import { drawText, IFontAtlasData, IFontOpts, measureText } from "./render/fontRender";
import { initRender, IRenderState, IRenderView, renderModel, resetRenderBuffers } from "./render/modelRender";
import { beginQueryAndGetPrevMs, endQuery } from "./render/queryManager";
import { SavedState } from "./SavedState";
import { isNotNil } from "@/src/utils/data";
import { Vec3, Vec4 } from "@/src/utils/vector";
import { initWalkthrough, runWalkthrough } from "./walkthrough/Walkthrough";
import { IColorMix } from "./Annotations";
import { Mat4f } from "@/src/utils/matrix";
import { runMouseHitTesting } from "./Interaction";
import { RenderPhase } from "./render/sharedRender";
import { drawBlockInfo } from "./components/BlockInfo";
import { NativeFunctions, TensorType } from "./NativeBindings";
import { IWasmGptModel, stepWasmModel, syncWasmDataWithJsAndGpu } from "./GptModelWasm";
import { IMovementInfo, manageMovement } from "./components/MovementControls";
import { IBlockRender, initBlockRender } from "./render/blockRender";
import { ILayout } from "../utils/layout";
import { DimStyle } from "./walkthrough/WalkthroughTools";
import { Subscriptions } from "../utils/hooks";

export interface IGenerationState {
    active: boolean;
    targetTokens: number; // how many tokens to generate
    tokensGenerated: number; // how many we've generated so far
    currentStep: 'idle' | 'embedding' | 'transformer' | 'output' | 'complete';
    stepProgress: number; // 0-1 progress through current step
    cameraPhase: number; // which layer we're animating through
    promptTokens: Float32Array | null;
    generatedTokens: number[];
}

export interface IProgramState {
    native: NativeFunctions | null;
    wasmGptModel: IWasmGptModel | null;
    stepModel: boolean;
    mouse: IMouseState;
    render: IRenderState;
    inWalkthrough: boolean;
    walkthrough: ReturnType<typeof initWalkthrough>;
    camera: ICamera;
    htmlSubs: Subscriptions;
    layout: IGptModelLayout;
    mainExample: IModelExample;
    examples: IModelExample[];
    currExampleId: number;
    shape: IModelShape;
    gptGpuModel: IGpuGptModel | null;
    jsGptModel: IGptModelLink | null;
    movement: IMovementInfo;
    display: IDisplayState;
    pageLayout: ILayout;
    displayTokensBuf?: Float32Array | null;
    generation: IGenerationState;
    markDirty: () => void;
}

export interface IModelExample {
    name: string;
    shape: IModelShape;
    enabled: boolean;
    layout?: IGptModelLayout;
    blockRender: IBlockRender;
    offset: Vec3;
    modelCardOffset: Vec3;
    camera?: ICameraPos;
}

export interface IMouseState {
    mousePos: Vec3;
}

export interface IDisplayState {
    tokenColors: IColorMix | null;
    tokenIdxColors: IColorMix | null;
    tokenOutputColors: IColorMix | null;
    tokenIdxModelOpacity?: number[];
    topOutputOpacity?: number;
    lines: string[];
    hoverTarget: IHoverTarget | null;
    blkIdxHover: number[] | null;
    dimHover: DimStyle | null;
}

export interface IHoverTarget {
    subCube: IBlkDef;
    mainCube: IBlkDef;
    mainIdx: Vec3;
}

export function initProgramState(canvasEl: HTMLCanvasElement, fontAtlasData: IFontAtlasData): IProgramState {

    let render = initRender(canvasEl, fontAtlasData);
    let walkthrough = initWalkthrough();

    let prevState = SavedState.state;
    let camera: ICamera = {
        angle: prevState?.camera.angle ?? new Vec3(296, 16, 13.5),
        center: prevState?.camera.center ?? new Vec3(-8.4, 0, -481.5),
        transition: {},
        modelMtx: new Mat4f(),
        viewMtx: new Mat4f(),
        lookAtMtx: new Mat4f(),
        camPos: new Vec3(),
        camPosModel: new Vec3(),
    }

    let shape: IModelShape = {
        B: 1,
        T: 11,
        C: 48,
        nHeads: 3,
        A: 48 / 3,
        nBlocks: 3,
        vocabSize: 3,
    };

    let gpt2ShapeSmall: IModelShape = {
        B: 1,
        T: 1024,
        C: 768,
        nHeads: 12,
        A: 768 / 12,
        nBlocks: 12,
        vocabSize: 50257,
    };

    let gpt2ShapeLarge: IModelShape = {
        B: 1,
        T: 1024,
        C: 1600,
        nHeads: 25,
        A: 1600 / 25,
        nBlocks: 48,
        vocabSize: 50257,
    };

    let gpt3Shape: IModelShape = {
        B: 1,
        T: 1024,
        C: 12288,
        nHeads: 96,
        A: 12288 / 96,
        nBlocks: 96,
        vocabSize: 50257,
    };

    function makeCamera(center: Vec3, angle: Vec3): ICameraPos {
        return { center, angle };
    }

    let delta = new Vec3(10000, 0, 0);

    return {
        native: null,
        wasmGptModel: null,
        render: render!,
        inWalkthrough: true,
        walkthrough,
        camera,
        shape: shape,
        layout: genGptModelLayout(shape),
        currExampleId: -1,
        mainExample: {
            name: 'nano-gpt',
            enabled: true,
            shape: shape,
            offset: new Vec3(),
            modelCardOffset: new Vec3(),
            blockRender: null!,
            camera: makeCamera(new Vec3(42.771, 0.000, -569.287), new Vec3(284.959, 26.501, 12.867)),
        },
        examples: [{
            name: 'GPT-2 (small)',
            enabled: true,
            shape: gpt2ShapeSmall,
            offset: delta.mul(-5),
            modelCardOffset: delta.mul(-2.0),
            blockRender: initBlockRender(render?.ctx ?? null),
            camera: makeCamera(new Vec3(-65141.321, 0.000, -69843.439), new Vec3(224.459, 24.501, 1574.240)),
        }, {
            name: 'GPT-2 (XL)',
            enabled: true,
            shape: gpt2ShapeLarge,
            offset: delta.mul(20),
            modelCardOffset: delta.mul(0.5),
            blockRender: initBlockRender(render?.ctx ?? null),
            camera: makeCamera(new Vec3(237902.688, 0.000, -47282.484), new Vec3(311.959, 23.501, 1382.449)),
        }, {
            name: 'GPT-3',
            enabled: false,
            shape: gpt3Shape,
            offset: delta.mul(50.0),
            modelCardOffset: delta.mul(15.0),
            blockRender: initBlockRender(render?.ctx ?? null),
            camera: makeCamera(new Vec3(837678.163, 0.000, -485242.286), new Vec3(238.959, 10.501, 12583.939)),
        }],
        gptGpuModel: null,
        jsGptModel: null,
        stepModel: false,
        markDirty: () => { },
        htmlSubs: new Subscriptions(),
        mouse: {
            mousePos: new Vec3(),
        },
        movement: {
            action: null,
            actionHover: null,
            target: [0, 0],
            depth: 1,
            cameraLerp: null,
         },
        display: {
            tokenColors: null,
            tokenIdxColors: null,
            tokenOutputColors: null,
            lines: [],
            hoverTarget: null,
            dimHover: null,
            blkIdxHover: null,
        },
        pageLayout: {
            height: 0,
            width: 0,
            isDesktop: true,
            isPhone: true,
        },
        generation: {
            active: false,
            targetTokens: 10,
            tokensGenerated: 0,
            currentStep: 'idle',
            stepProgress: 0,
            cameraPhase: 0,
            promptTokens: null,
            generatedTokens: [],
        },
    };
}

export function runProgram(view: IRenderView, state: IProgramState) {
    let timer0 = performance.now();

    if (!state.render) {
        return;
    }

    resetRenderBuffers(state.render);
    state.render.sharedRender.activePhase = RenderPhase.Opaque;
    state.display.lines = [];
    state.display.hoverTarget = null;
    state.display.tokenColors = null;
    state.display.tokenIdxColors = null;

    if (state.wasmGptModel && state.jsGptModel) {
        syncWasmDataWithJsAndGpu(state.wasmGptModel, state.jsGptModel);
    }

    if (state.stepModel && state.wasmGptModel && state.jsGptModel) {
        state.stepModel = false;
        stepWasmModel(state.wasmGptModel, state.jsGptModel);
    }

    // handle auto-generation
    if (state.generation.active) {
        runAutoGeneration(state, view);
    }

    // generate the base model, incorporating the gpu-side model if available
    state.layout = genGptModelLayout(state.shape, state.jsGptModel);

    // allow external tokenization to override input token visualization
    if (state.displayTokensBuf && state.layout?.extraSources) {
        state.layout.extraSources.idx = state.displayTokensBuf;
    }

    // @TODO: handle different models in the same scene.
    // Maybe need to copy a lot of different things like the entire render state per model?
    for (let example of state.examples) {
        if (example.enabled && !example.layout) {
            let layout = genGptModelLayout(example.shape, null, example.offset);
            example.layout = layout;
            // mark instanced data as stale so it gets re-uploaded
            if (example.blockRender) {
                example.blockRender.instancedDataStale = true;
            }
        }
    }

    // determine which model is selected - do this early so we can use its layout
    let selectedExample = state.currExampleId === -1 ? state.mainExample : state.examples[state.currExampleId];
    let selectedLayout = selectedExample.layout;
    let selectedOffset = state.currExampleId === -1 ? Vec3.zero : selectedExample.offset;

    // if a model is selected and it has a layout, use that layout for rendering
    // otherwise use the main model's layout
    if (selectedLayout) {
        state.layout = selectedLayout;
    }

    genModelViewMatrices(state, state.layout!, selectedOffset);

    let queryRes = beginQueryAndGetPrevMs(state.render.queryManager, 'render');
    if (isNotNil(queryRes)) {
        state.render.lastGpuMs = queryRes;
    }

    state.render.renderTiming = false; // state.pageLayout.isDesktop;

    // will modify layout; view; render a few things.
    if (state.inWalkthrough && !state.generation.active) {
        runWalkthrough(state, view);
    }

    updateCamera(state, view);

    drawBlockInfo(state);
    // these will get modified by the walkthrough (stored where?)
    drawAllArrows(state.render, state.layout);

    // draw main model card only if enabled
    if (state.mainExample.enabled) {
        // mainExample should always show its own name, not the selected model's name
        // use mainExample's layout if available, otherwise use state.layout
        let mainLayout = state.mainExample.layout ?? genGptModelLayout(state.shape, state.jsGptModel);
        drawModelCard(state, mainLayout, state.mainExample.name, new Vec3());
    }
    // drawTokens(state.render, state.layout, state.display);

    // draw enabled example models
    for (let example of state.examples) {
        if (example.enabled && example.layout) {
            drawModelCard(state, example.layout, example.name, example.offset.add(example.modelCardOffset));
        }
    }

    // manageMovement(state, view);
    runMouseHitTesting(state);
    state.render.sharedRender.activePhase = RenderPhase.Opaque;
    drawBlockLabels(state.render, state.layout);

    let lineNo = 1;
    let tw = state.render.size.x;
    state.render.sharedRender.activePhase = RenderPhase.Overlay2D;
    for (let line of state.display.lines) {
        let opts: IFontOpts = { color: new Vec4(), size: 14 };
        let w = measureText(state.render.modelFontBuf, line, opts);
        drawText(state.render.modelFontBuf, line, tw - w - 4, lineNo * opts.size * 1.3 + 4, opts)
        lineNo++;
    }
    
    // show generation status
    if (state.generation.active) {
        let gen = state.generation;
        let statusText = `Generating token ${gen.tokensGenerated + 1}/${gen.targetTokens} - ${gen.currentStep}`;
        let opts: IFontOpts = { color: new Vec4(0, 0.7, 0, 1), size: 16 };
        let w = measureText(state.render.modelFontBuf, statusText, opts);
        drawText(state.render.modelFontBuf, statusText, tw - w - 4, lineNo * opts.size * 1.3 + 4, opts);
    }

    // render everything; i.e. here's where we actually do gl draw calls
    // up until now, we've just been putting data in cpu-side buffers
    renderModel(state);

    endQuery(state.render.queryManager, 'render');
    state.render.gl.flush();

    state.render.lastJsMs = performance.now() - timer0;
}

// auto-generation speed control (ms per step)
const GENERATION_STEP_DURATION = 2000; // 2 seconds per step for slow visualization
const CAMERA_TRANSITION_DURATION = 1500; // 1.5 seconds for camera transitions

function runAutoGeneration(state: IProgramState, view: IRenderView) {
    let gen = state.generation;
    
    if (!state.wasmGptModel || !state.jsGptModel) {
        gen.active = false;
        return;
    }

    // initialize if needed
    if (gen.currentStep === 'idle' && gen.promptTokens) {
        // set initial tokens
        let inputTokensTensor = state.wasmGptModel.native.getModelTensor(
            state.wasmGptModel.modelPtr,
            TensorType.InputTokens
        );
        let T = state.shape.T;
        for (let i = 0; i < Math.min(gen.promptTokens.length, T); i++) {
            inputTokensTensor.buffer[i] = gen.promptTokens[i];
        }
        state.jsGptModel.inputLen = Math.min(gen.promptTokens.length, T);
        
        // run initial forward pass
        state.wasmGptModel.native.runModel(state.wasmGptModel.modelPtr);
        state.wasmGptModel.intersDirty = true;
        syncWasmDataWithJsAndGpu(state.wasmGptModel, state.jsGptModel);
        
        gen.currentStep = 'embedding';
        gen.stepProgress = 0;
        gen.cameraPhase = 0;
        animateCameraToLayer(state, 'embedding');
    }

    // update step progress
    gen.stepProgress += view.dt / GENERATION_STEP_DURATION;
    
    if (gen.stepProgress >= 1.0) {
        // move to next step
        if (gen.currentStep === 'embedding') {
            gen.currentStep = 'transformer';
            gen.stepProgress = 0;
            gen.cameraPhase = 0;
            animateCameraToLayer(state, 'transformer', 0);
        } else if (gen.currentStep === 'transformer') {
            gen.cameraPhase++;
            if (gen.cameraPhase >= state.shape.nBlocks) {
                gen.currentStep = 'output';
                gen.stepProgress = 0;
                animateCameraToLayer(state, 'output');
            } else {
                gen.stepProgress = 0;
                animateCameraToLayer(state, 'transformer', gen.cameraPhase);
            }
        } else if (gen.currentStep === 'output') {
            // generate next token
            let nextToken = sampleNextToken(state.jsGptModel);
            gen.generatedTokens.push(nextToken);
            gen.tokensGenerated++;
            
            // update display
            if (state.jsGptModel.sortedBuf) {
                let tIdx = state.jsGptModel.inputLen - 1;
                let arr = new Float32Array(state.jsGptModel.inputLen + 1);
                let inputTokensTensor = state.wasmGptModel.native.getModelTensor(
                    state.wasmGptModel.modelPtr,
                    TensorType.InputTokens
                );
                for (let i = 0; i < state.jsGptModel.inputLen; i++) {
                    arr[i] = inputTokensTensor.buffer[i];
                }
                arr[state.jsGptModel.inputLen] = nextToken;
                state.displayTokensBuf = arr;
            }
            
            if (gen.tokensGenerated >= gen.targetTokens) {
                gen.currentStep = 'complete';
                gen.active = false;
            } else {
                // add the generated token to input before stepping
                let inputTokensTensor = state.wasmGptModel.native.getModelTensor(
                    state.wasmGptModel.modelPtr,
                    TensorType.InputTokens
                );
                let tIdx = state.jsGptModel.inputLen;
                if (tIdx < state.shape.T) {
                    inputTokensTensor.buffer[tIdx] = nextToken;
                    state.jsGptModel.inputLen = tIdx + 1;
                    
                    // run model forward pass with new token
                    state.wasmGptModel.native.runModel(state.wasmGptModel.modelPtr);
                    state.wasmGptModel.intersDirty = true;
                    syncWasmDataWithJsAndGpu(state.wasmGptModel, state.jsGptModel);
                }
                
                // reset for next generation cycle
                gen.currentStep = 'embedding';
                gen.stepProgress = 0;
                gen.cameraPhase = 0;
                animateCameraToLayer(state, 'embedding');
            }
        }
    }
    
    // animate camera during current step
    animateCameraDuringGeneration(state, view);
    
    state.markDirty();
}

function sampleNextToken(model: IGptModelLink): number {
    if (!model.sortedBuf) {
        return 0;
    }
    
    let tIdx = model.inputLen - 1;
    if (tIdx < 0) return 0;
    
    // get probabilities for the last token position
    let vocabSize = model.shape.vocabSize;
    let T = model.shape.T;
    let probs: { token: number; prob: number }[] = [];
    
    for (let i = 0; i < vocabSize; i++) {
        let idx = (tIdx * vocabSize + i) * 2;
        if (idx + 1 < model.sortedBuf.length) {
            let token = model.sortedBuf[idx];
            let prob = model.sortedBuf[idx + 1];
            probs.push({ token, prob });
        }
    }
    
    // sample from distribution (or take top token)
    if (probs.length === 0) return 0;
    
    // for now, just take the top token (greedy sampling)
    return probs[0].token;
}

function animateCameraToLayer(state: IProgramState, layer: 'embedding' | 'transformer' | 'output', blockIdx?: number) {
    let layout = state.layout;
    let center = state.camera.center.clone();
    let angle = state.camera.angle.clone();
    
    if (layer === 'embedding') {
        // camera position for embedding layer
        let embedBlock = layout.residual0;
        if (embedBlock) {
            center = new Vec3(embedBlock.x + embedBlock.dx / 2, embedBlock.y + embedBlock.dy / 2, embedBlock.z + embedBlock.dz / 2);
            angle = new Vec3(290, 20, 8);
        }
    } else if (layer === 'transformer') {
        // camera position for transformer block
        let blocks = layout.blocks;
        if (blocks && blockIdx !== undefined && blockIdx < blocks.length) {
            let block = blocks[blockIdx];
            let blockBlk = block.mlpResidual;
            if (blockBlk) {
                center = new Vec3(blockBlk.x + blockBlk.dx / 2, blockBlk.y + blockBlk.dy / 2, blockBlk.z + blockBlk.dz / 2);
                angle = new Vec3(290, 20, 7);
            }
        }
    } else if (layer === 'output') {
        // camera position for output layer
        let outputBlock = layout.logitsSoftmax;
        if (outputBlock) {
            center = new Vec3(outputBlock.x + outputBlock.dx / 2, outputBlock.y + outputBlock.dy / 2, outputBlock.z + outputBlock.dz / 2);
            angle = new Vec3(290, 20, 6);
        }
    }
    
    state.camera.desiredCamera = { center, angle };
}

function animateCameraDuringGeneration(state: IProgramState, view: IRenderView) {
    let gen = state.generation;
    
    // highlight blocks based on current step
    if (gen.currentStep === 'embedding') {
        highlightBlocks(state, ['embedding']);
    } else if (gen.currentStep === 'transformer') {
        highlightBlocks(state, ['transformer', gen.cameraPhase]);
    } else if (gen.currentStep === 'output') {
        highlightBlocks(state, ['output']);
    }
}

function highlightBlocks(state: IProgramState, blocks: (string | number)[]) {
    // reset all highlights
    for (let cube of state.layout.cubes) {
        cube.highlight = 0.0;
    }
    
    if (blocks[0] === 'embedding') {
        let embedBlocks = [
            state.layout.idxObj,
            state.layout.tokEmbedObj,
            state.layout.posEmbedObj,
            state.layout.residual0,
        ];
        for (let blk of embedBlocks) {
            if (blk) blk.highlight = 0.6;
        }
    } else if (blocks[0] === 'transformer' && typeof blocks[1] === 'number') {
        let blockIdx = blocks[1];
        let transformerBlocks = state.layout.blocks;
        if (transformerBlocks && blockIdx < transformerBlocks.length) {
            let block = transformerBlocks[blockIdx];
            let blockCubes = [
                block.ln1.lnResid,
                block.attnOut,
                block.attnResidual,
                block.ln2.lnResid,
                block.mlpResult,
                block.mlpResidual,
            ];
            for (let blk of blockCubes) {
                if (blk) blk.highlight = 0.6;
            }
        }
    } else if (blocks[0] === 'output') {
        let outputBlocks = [
            state.layout.ln_f.lnResid,
            state.layout.logits,
            state.layout.logitsSoftmax,
        ];
        for (let blk of outputBlocks) {
            if (blk) blk.highlight = 0.6;
        }
    }
}
