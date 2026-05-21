import {TransformAtomSetCommand} from '../../core/command/TransformAtomSetCommand.js';

export class VRDragCommitter {
    constructor({context} = {}) {
        if (!context) throw new Error('[VRDragCommitter] context required');
        this.context = context;
    }

    commit({proteinId, atomIds, previousPositions, nextPositions, translation = null, matrix4 = null, source = 'vr', intent = null, description = ''} = {}) {
        if (!proteinId || !atomIds?.length) return false;
        const cmd = new TransformAtomSetCommand({
            proteinId,
            atomIds,
            translation,
            matrix4,
            previousPositions,
            nextPositions,
            source,
            phase: 'final',
            intent,
            description,
        });
        return this.context.commandManager.execute(cmd) !== false;
    }
}
