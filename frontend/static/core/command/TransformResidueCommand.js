import {TransformAtomSetCommand} from './TransformAtomSetCommand.js';

export class TransformResidueCommand {
    constructor({
                    proteinId,
                    residueId,
                    translation = null,
                    matrix4 = null,
                    phase = 'final',
                    source = 'command',
                    intent = null,
                    description = '',
                } = {}) {
        if (!proteinId) throw new Error('[TransformResidueCommand] proteinId is required');
        if (!residueId) throw new Error('[TransformResidueCommand] residueId is required');

        this.type = 'transformResidue';
        this.proteinId = proteinId;
        this.residueId = residueId;
        this.translation = translation;
        this.matrix4 = matrix4;
        this.phase = phase;
        this.source = source;
        this.intent = intent;
        this.description = description;
        this._inner = null;
    }

    execute(ctx) {
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        if (!model) return false;
        const residue = model.residues.get(this.residueId);
        if (!residue || !residue.atomIds?.length) return false;

        if (!this._inner) {
            this._inner = new TransformAtomSetCommand({
                proteinId: this.proteinId,
                atomIds: [...residue.atomIds],
                translation: this.translation,
                matrix4: this.matrix4,
                phase: this.phase,
                source: this.source,
                intent: this.intent,
                description: this.description || `Transform residue ${this.residueId}`,
            });
        }

        return this._inner.execute(ctx);
    }

    undo(ctx) {
        return this._inner?.undo(ctx) ?? false;
    }

    redo(ctx) {
        return this._inner?.redo(ctx) ?? false;
    }

    toJSON() {
        return {
            type: this.type,
            proteinId: this.proteinId,
            residueId: this.residueId,
            translation: this.translation,
            matrix4: this.matrix4,
            phase: this.phase,
            source: this.source,
            intent: this.intent,
            description: this.description,
            inner: this._inner?.toJSON?.() || null,
        };
    }
}
