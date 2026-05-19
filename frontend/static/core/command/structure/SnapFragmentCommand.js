import {EventTypes} from '../../event/EventTypes.js';

export class SnapFragmentCommand {
    constructor({proteinId, residueIds = [], snapTarget = null, quality = null, metadata = {}} = {}) {
        if (!proteinId || !residueIds.length) {
            throw new Error('[SnapFragmentCommand] proteinId and residueIds are required');
        }
        this.type = 'snapFragment';
        this.name = 'Magnet snap fragment';
        this.proteinId = proteinId;
        this.residueIds = [...residueIds];
        this.snapTarget = snapTarget;
        this.quality = quality || {score: 0, label: 'preview'};
        this.metadata = {...metadata};
        this.before = new Map();
    }

    execute(ctx) {
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        if (!model) throw new Error(`[SnapFragmentCommand] protein not found: ${this.proteinId}`);

        this.before.clear();

        for (const residueId of this.residueIds) {
            const residue = model.residues.get(residueId);
            if (!residue) continue;
            this.before.set(residueId, {...(residue.metadata || {})});
            residue.metadata = {
                ...(residue.metadata || {}),
                provrSnapState: 'magnet-snapped',
                provrSnapQuality: this.quality,
                provrSnapTarget: this.snapTarget,
                provrSnapAt: new Date().toISOString(),
            };
        }

        model.bumpRevision?.('snapFragment');

        ctx.eventBus?.emit?.(EventTypes.STRUCTURE_REBUILT, {
            proteinId: this.proteinId,
            residueIds: [...this.residueIds],
            operation: 'snapFragment',
            snapTarget: this.snapTarget,
            quality: this.quality,
            source: 'SnapFragmentCommand',
        });

        return true;
    }

    undo(ctx) {
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        if (!model) return false;

        for (const residueId of this.residueIds) {
            const residue = model.residues.get(residueId);
            if (!residue) continue;
            residue.metadata = {...(this.before.get(residueId) || {})};
        }

        model.bumpRevision?.('undoSnapFragment');

        ctx.eventBus?.emit?.(EventTypes.STRUCTURE_REBUILT, {
            proteinId: this.proteinId,
            residueIds: [...this.residueIds],
            operation: 'undoSnapFragment',
            source: 'SnapFragmentCommand.undo',
        });

        return true;
    }

    toJSON() {
        return {
            type: this.type,
            proteinId: this.proteinId,
            residueIds: [...this.residueIds],
            snapTarget: this.snapTarget,
            quality: this.quality,
            metadata: {...this.metadata},
        };
    }
}
