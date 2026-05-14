import {TransformAtomSetCommand} from './TransformAtomSetCommand.js';

function parseLabel(label) {
    const m = String(label).match(/^(-?\d+)([A-Za-z]?)$/);
    if (!m) return {n: 0, i: ''};
    return {n: parseInt(m[1], 10), i: m[2] || ''};
}

function compareLabel(a, b) {
    const A = parseLabel(a);
    const B = parseLabel(b);
    if (A.n !== B.n) return A.n - B.n;
    return A.i.localeCompare(B.i);
}

function inRange(label, start, end) {
    return compareLabel(label, start) >= 0 && compareLabel(label, end) <= 0;
}

export class TransformResidueRangeCommand {
    constructor({
                    proteinId,
                    chainId,
                    startLabel,
                    endLabel,
                    residueIds = null,
                    translation = null,
                    matrix4 = null,
                    phase = 'final',
                    source = 'command',
                    intent = null,
                    description = '',
                } = {}) {
        if (!proteinId) throw new Error('[TransformResidueRangeCommand] proteinId is required');
        this.type = 'transformResidueRange';
        this.proteinId = proteinId;
        this.chainId = chainId;
        this.startLabel = startLabel;
        this.endLabel = endLabel;
        this.residueIds = residueIds ? [...residueIds] : null;
        this.translation = translation;
        this.matrix4 = matrix4;
        this.phase = phase;
        this.source = source;
        this.intent = intent;
        this.description = description;
        this._inner = null;
        this._resolvedResidueIds = null;
    }

    execute(ctx) {
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        if (!model) return false;

        const residueIds = this._resolveResidues(model);
        if (!residueIds.length) return false;

        const atomIds = [];
        for (const residueId of residueIds) {
            const residue = model.residues.get(residueId);
            if (residue?.atomIds?.length) atomIds.push(...residue.atomIds);
        }
        if (!atomIds.length) return false;

        if (!this._inner) {
            this._inner = new TransformAtomSetCommand({
                proteinId: this.proteinId,
                atomIds,
                translation: this.translation,
                matrix4: this.matrix4,
                phase: this.phase,
                source: this.source,
                intent: this.intent,
                description: this.description || `Transform residue range ${this.chainId || ''}:${this.startLabel || ''}-${this.endLabel || ''}`,
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
            chainId: this.chainId,
            startLabel: this.startLabel,
            endLabel: this.endLabel,
            residueIds: this.residueIds,
            resolvedResidueIds: this._resolvedResidueIds,
            translation: this.translation,
            matrix4: this.matrix4,
            phase: this.phase,
            source: this.source,
            intent: this.intent,
            description: this.description,
            inner: this._inner?.toJSON?.() || null,
        };
    }

    _resolveResidues(model) {
        if (this.residueIds?.length) {
            this._resolvedResidueIds = this.residueIds.filter((id) => model.residues.has(id));
            return this._resolvedResidueIds;
        }

        if (!this.chainId || this.startLabel == null || this.endLabel == null) {
            this._resolvedResidueIds = [];
            return [];
        }

        const chain = model.chains.get(this.chainId);
        if (!chain) {
            this._resolvedResidueIds = [];
            return [];
        }

        const start = String(this.startLabel);
        const end = String(this.endLabel);
        const residueIds = [];
        for (const residueId of chain.residueIds || []) {
            const residue = model.residues.get(residueId);
            if (!residue) continue;
            if (inRange(residue.label, start, end)) residueIds.push(residueId);
        }

        this._resolvedResidueIds = residueIds;
        return residueIds;
    }
}
