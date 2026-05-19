import {EventTypes} from '../../event/EventTypes.js';

export class CutFragmentCommand {
    constructor({proteinId, residueIds = [], metadata = {}} = {}) {
        if (!proteinId || !residueIds.length) {
            throw new Error('[CutFragmentCommand] proteinId and residueIds are required');
        }
        this.type = 'cutFragment';
        this.name = `Cut fragment (${residueIds.length} residues)`;
        this.proteinId = proteinId;
        this.residueIds = [...residueIds];
        this.metadata = {...metadata};
        this.before = new Map();
    }

    execute(ctx) {
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        if (!model) throw new Error(`[CutFragmentCommand] protein not found: ${this.proteinId}`);

        this.before.clear();

        for (const residueId of this.residueIds) {
            const residue = model.residues.get(residueId);
            if (!residue) continue;
            this.before.set(residueId, {...(residue.metadata || {})});
            residue.metadata = {
                ...(residue.metadata || {}),
                provrFragmentState: 'cut-preview',
                provrCutAt: new Date().toISOString(),
                provrHiddenIntent: true,
            };
        }

        model.bumpRevision?.('cutFragment');

        ctx.eventBus?.emit?.(EventTypes.STRUCTURE_REBUILT, {
            proteinId: this.proteinId,
            residueIds: [...this.residueIds],
            operation: 'cutFragment',
            source: 'CutFragmentCommand',
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

        model.bumpRevision?.('undoCutFragment');

        ctx.eventBus?.emit?.(EventTypes.STRUCTURE_REBUILT, {
            proteinId: this.proteinId,
            residueIds: [...this.residueIds],
            operation: 'undoCutFragment',
            source: 'CutFragmentCommand.undo',
        });

        return true;
    }

    toJSON() {
        return {
            type: this.type,
            proteinId: this.proteinId,
            residueIds: [...this.residueIds],
            metadata: {...this.metadata},
        };
    }
}
