import {EventTypes} from '../../event/EventTypes.js';

export class ReplaceFragmentCommand {
    constructor({proteinId, residueIds = [], fragment = null, metadata = {}} = {}) {
        if (!proteinId || !residueIds.length || !fragment) {
            throw new Error('[ReplaceFragmentCommand] proteinId, residueIds and fragment are required');
        }
        this.type = 'replaceFragment';
        this.name = `Replace fragment with ${fragment.name || fragment.id}`;
        this.proteinId = proteinId;
        this.residueIds = [...residueIds];
        this.fragment = fragment;
        this.metadata = {...metadata};
        this.before = new Map();
    }

    execute(ctx) {
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        if (!model) throw new Error(`[ReplaceFragmentCommand] protein not found: ${this.proteinId}`);

        this.before.clear();

        for (const residueId of this.residueIds) {
            const residue = model.residues.get(residueId);
            if (!residue) continue;
            this.before.set(residueId, {...(residue.metadata || {})});
            residue.metadata = {
                ...(residue.metadata || {}),
                provrFragmentState: 'replace-preview',
                provrReplacementFragment: this.fragment.id || this.fragment.name || 'fragment',
                provrReplacementAt: new Date().toISOString(),
            };
        }

        model.bumpRevision?.('replaceFragment');

        ctx.eventBus?.emit?.(EventTypes.STRUCTURE_REBUILT, {
            proteinId: this.proteinId,
            residueIds: [...this.residueIds],
            fragment: this.fragment,
            operation: 'replaceFragment',
            source: 'ReplaceFragmentCommand',
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

        model.bumpRevision?.('undoReplaceFragment');

        ctx.eventBus?.emit?.(EventTypes.STRUCTURE_REBUILT, {
            proteinId: this.proteinId,
            residueIds: [...this.residueIds],
            operation: 'undoReplaceFragment',
            source: 'ReplaceFragmentCommand.undo',
        });

        return true;
    }

    toJSON() {
        return {
            type: this.type,
            proteinId: this.proteinId,
            residueIds: [...this.residueIds],
            fragment: this.fragment?.toJSON?.() || this.fragment,
            metadata: {...this.metadata},
        };
    }
}
