import React from 'react';
import { useProgramState } from '../Sidebar';
import clsx from 'clsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExpand, faMagnifyingGlass, faEye, faEyeSlash, faTrash } from '@fortawesome/free-solid-svg-icons';
import { Vec3 } from '@/src/utils/vector';
import { Mat4f } from '@/src/utils/matrix';

export const ModelSelectorToolbar: React.FC<{
}> = () => {
    let progState = useProgramState();

    function getModel(egIndex: number) {
        return egIndex === -1 ? progState.mainExample : progState.examples[egIndex];
    }

    function getAllModels() {
        // return main example and all examples
        let models: Array<{ index: number; model: typeof progState.mainExample }> = [
            { index: -1, model: progState.mainExample }
        ];
        progState.examples.forEach((example, idx) => {
            models.push({ index: idx, model: example });
        });
        return models;
    }

    function handleToggleVisibility(egIndex: number, ev: React.MouseEvent) {
        ev.stopPropagation();
        let model = getModel(egIndex);
        model.enabled = !model.enabled;
        progState.markDirty();
    }

    function handleDelete(egIndex: number, ev: React.MouseEvent) {
        ev.stopPropagation();
        // can't delete main example (index -1)
        if (egIndex === -1) return;
        
        // remove from examples array
        progState.examples.splice(egIndex, 1);
        
        // if we deleted the currently selected model, switch to main example
        if (progState.currExampleId === egIndex) {
            progState.currExampleId = -1;
            progState.camera.desiredCamera = progState.mainExample.camera;
        } else if (progState.currExampleId > egIndex) {
            // adjust current selection index if needed
            progState.currExampleId -= 1;
        }
        
        progState.markDirty();
    }

    function handleSelect(egIndex: number) {
        let model = getModel(egIndex);
        // enable if disabled when selecting
        if (!model.enabled) {
            model.enabled = true;
        }
        progState.currExampleId = egIndex;
        progState.camera.desiredCamera = model.camera;
        progState.markDirty();
    }

    function makeButton(egIndex: number) {
        let model = getModel(egIndex);
        let isEnabled = model.enabled;
        let isActive = progState.currExampleId === egIndex;
        let isMainExample = egIndex === -1;

        return <div 
            key={egIndex}
            className={clsx('m-2 p-2 rounded shadow flex items-center gap-2', 
                isActive ? 'bg-blue-200' : 'bg-white',
                !isEnabled && 'opacity-50'
            )}
        >
            <div 
                className={clsx('flex-1 cursor-pointer hover:bg-blue-300 px-2 py-1 rounded', isEnabled ? '' : 'line-through')} 
                onClick={() => handleSelect(egIndex)}
            >
                {model.name}
            </div>
            <button
                className={clsx('p-1 rounded hover:bg-blue-400', isEnabled ? 'text-blue-600' : 'text-gray-400')}
                onClick={(ev) => handleToggleVisibility(egIndex, ev)}
                title={isEnabled ? 'Hide model' : 'Show model'}
            >
                <FontAwesomeIcon icon={isEnabled ? faEye : faEyeSlash} />
            </button>
            {!isMainExample && (
                <button
                    className="p-1 rounded hover:bg-red-400 text-red-600"
                    onClick={(ev) => handleDelete(egIndex, ev)}
                    title="Delete model"
                >
                    <FontAwesomeIcon icon={faTrash} />
                </button>
            )}
        </div>;
    }

    function onExpandClick() {
        let example = progState.examples[progState.currExampleId] ?? progState.mainExample;
        progState.camera.desiredCamera = example.camera;
        progState.markDirty();
    }

    function onMagnifyClick() {
        let example = progState.examples[progState.currExampleId] ?? progState.mainExample;
        let layout = example.layout ?? progState.layout;

        // new Vec3(3.347, 48.000, -2.634), new Vec3(270.000, 4.500, 1.199)

        // new Vec3(-1.771, 0.750, -4.470), new Vec3(270.000, 4.500, 0.739)

        let obj = layout.residual0;
        let modelTarget = new Vec3(obj.x, obj.y, obj.z);
        let modelMtx = progState.camera.modelMtx.mul(Mat4f.fromTranslation(example.offset))

        let center = modelMtx.mulVec3Proj(modelTarget);
        let zoom = progState.currExampleId === -1 ? 0.7 : 4;
        progState.camera.desiredCamera = {
            center, angle: new Vec3(270, 4.5, zoom),
        };
        progState.markDirty();

    }

    let selectedModel = getModel(progState.currExampleId);
    let allModels = getAllModels();

    return <div className='absolute top-0 left-0 flex flex-col bg-white rounded shadow-lg p-2 max-h-[80vh] overflow-y-auto'>
        <div className='mb-2 px-2 py-1 bg-blue-100 rounded'>
            <div className='text-xs text-gray-600'>Selected Model:</div>
            <div className='text-sm font-semibold'>{selectedModel.name}</div>
        </div>
        <div className='flex flex-col'>
            {allModels.map(({ index }) => makeButton(index))}
        </div>
        <div className='mt-2 flex flex-row border-t pt-2'>
            <div className={clsx('m-2 p-2 bg-white min-w-[2rem] flex justify-center rounded shadow cursor-pointer hover:bg-blue-300')} onClick={onExpandClick}>
                <FontAwesomeIcon icon={faExpand} />
            </div>
            <div className={clsx('m-2 p-2 bg-white min-w-[2rem] flex justify-center rounded shadow cursor-pointer hover:bg-blue-300')} onClick={onMagnifyClick}>
                <FontAwesomeIcon icon={faMagnifyingGlass} />
            </div>
        </div>
    </div>;

};
