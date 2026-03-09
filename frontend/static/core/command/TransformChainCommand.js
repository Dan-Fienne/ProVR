import {EventTypes} from '../event/EventTypes.js';

function mulMat4Vec3(m, x, y, z) {
    return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
}

export class TransformChainCommand {
    constructor({
                    proteinId,
                    chainId,
                    matrix4,    // Float32Array(16) or Array(16)
                    bake = false,
                    phase = 'final'
                }) {
        this.proteinId = proteinId;
        this.chainId = chainId;
        this.matrix4 = matrix4;
        this.bake = bake;
        this.phase = phase;

        this._backup = null; // bake时用于undo
    }

    execute(ctx) {
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        if (!model) return;
        const chain = model.chains.get(this.chainId);
        if (!chain) return;

        if (!this.bake) {
            chain.previewTransform = [...this.matrix4];
            const revision = model.bumpRevision();
            ctx.eventBus.emit(EventTypes.CHAIN_TRANSFORMED, {
                type: EventTypes.CHAIN_TRANSFORMED,
                proteinId: this.proteinId,
                chainId: this.chainId,
                bake: false,
                phase: this.phase,
                revision,
            });
            return;
        }

        const atomIds = model.getChainAtomIds(this.chainId);
        this._backup = new Map();
        for (const atomId of atomIds) {
            const p = model.getAtomPosition(atomId);
            this._backup.set(atomId, [...p]);
            const n = mulMat4Vec3(this.matrix4, p[0], p[1], p[2]);
            model.setAtomPosition(atomId, n[0], n[1], n[2]);
        }
        chain.previewTransform = null;

        const revision = model.bumpRevision();
        ctx.eventBus.emit(EventTypes.CHAIN_TRANSFORMED, {
            type: EventTypes.CHAIN_TRANSFORMED,
            proteinId: this.proteinId,
            chainId: this.chainId,
            bake: true,
            atomIds,
            phase: this.phase,
            revision,
        });
    }

    undo(ctx) {
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        if (!model) return;
        const chain = model.chains.get(this.chainId);
        if (!chain) return;

        if (!this.bake) {
            chain.previewTransform = null;
            const revision = model.bumpRevision();
            ctx.eventBus.emit(EventTypes.CHAIN_TRANSFORMED, {
                type: EventTypes.CHAIN_TRANSFORMED,
                proteinId: this.proteinId,
                chainId: this.chainId,
                bake: false,
                phase: 'final',
                revision,
            });
            return;
        }

        if (!this._backup) return;
        const atomIds = [];
        for (const [atomId, p] of this._backup.entries()) {
            model.setAtomPosition(atomId, p[0], p[1], p[2]);
            atomIds.push(atomId);
        }
        const revision = model.bumpRevision();
        ctx.eventBus.emit(EventTypes.CHAIN_TRANSFORMED, {
            type: EventTypes.CHAIN_TRANSFORMED,
            proteinId: this.proteinId,
            chainId: this.chainId,
            bake: true,
            atomIds,
            phase: 'final',
            revision,
        });
    }

    redo(ctx) {
        this.execute(ctx);
    }
}