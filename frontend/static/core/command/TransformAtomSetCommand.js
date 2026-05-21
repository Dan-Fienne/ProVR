import {EventTypes} from '../event/EventTypes.js';

function toArray3(value, fallback = [0, 0, 0]) {
    if (!value || value.length < 3) return [...fallback];
    return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0];
}

function clonePositionsMap(value) {
    if (!value) return null;
    if (value instanceof Map) return new Map([...value.entries()].map(([atomId, p]) => [atomId, [...p]]));
    if (Array.isArray(value)) {
        return new Map(value.map((entry) => {
            if (Array.isArray(entry) && entry.length >= 2) return [entry[0], [...entry[1]]];
            return [entry.atomId, [...entry.position]];
        }));
    }
    if (typeof value === 'object') {
        return new Map(Object.entries(value).map(([atomId, p]) => [Number.isNaN(Number(atomId)) ? atomId : Number(atomId), [...p]]));
    }
    return null;
}

function mat4TransformPoint(m, p) {
    const x = p[0], y = p[1], z = p[2];
    return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
}

function unique(values) { return [...new Set(values.filter((v) => v != null))]; }

function collectResidueAndChainIds(model, atomIds) {
    const residueIds = [];
    const chainIds = [];
    for (const atomId of atomIds) {
        const atom = model.getAtom(atomId);
        if (!atom) continue;
        residueIds.push(atom.residueId);
        const residue = model.residues.get(atom.residueId);
        if (residue) chainIds.push(residue.chainId);
    }
    return {residueIds: unique(residueIds), chainIds: unique(chainIds)};
}

function snapshotPositions(model, atomIds) {
    const out = new Map();
    for (const atomId of atomIds) {
        const p = model.getAtomPosition(atomId);
        if (p) out.set(atomId, [...p]);
    }
    return out;
}

function positionsToObject(map) {
    const obj = {};
    for (const [atomId, p] of map.entries()) obj[atomId] = [...p];
    return obj;
}

function translationMatrix(t) {
    return [1,0,0,0, 0,1,0,0, 0,0,1,0, t[0],t[1],t[2],1];
}

function inverseTranslation(t) { return [-t[0], -t[1], -t[2]]; }

export class TransformAtomSetCommand {
    constructor({proteinId, atomIds, translation = null, matrix4 = null, previousPositions = null, nextPositions = null, phase = 'final', source = 'command', intent = null, description = ''} = {}) {
        if (!proteinId) throw new Error('[TransformAtomSetCommand] proteinId is required');
        if (!Array.isArray(atomIds) || atomIds.length === 0) throw new Error('[TransformAtomSetCommand] atomIds must be a non-empty array');
        this.type = 'transformAtomSet';
        this.proteinId = proteinId;
        this.atomIds = unique(atomIds);
        this.translation = translation ? toArray3(translation) : null;
        this.matrix4 = matrix4 ? [...matrix4] : null;
        this.previousPositions = clonePositionsMap(previousPositions);
        this.nextPositions = clonePositionsMap(nextPositions);
        this.phase = phase;
        this.source = source;
        this.intent = intent;
        this.description = description;
        this._executed = false;
    }

    execute(ctx) {
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        if (!model) return false;
        if (!this.previousPositions) this.previousPositions = snapshotPositions(model, this.atomIds);
        if (!this.nextPositions) this.nextPositions = this._computeNextPositions(this.previousPositions);
        if (!this.nextPositions || this.nextPositions.size === 0) return false;
        this._applyPositions(model, this.nextPositions);
        this._executed = true;
        this._emit(ctx, model, 'execute');
        return true;
    }

    undo(ctx) {
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        if (!model || !this.previousPositions) return false;
        this._applyPositions(model, this.previousPositions);
        this._emit(ctx, model, 'undo');
        return true;
    }

    redo(ctx) {
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        if (!model || !this.nextPositions) return false;
        this._applyPositions(model, this.nextPositions);
        this._emit(ctx, model, 'redo');
        return true;
    }

    toJSON() {
        return {
            type: this.type,
            proteinId: this.proteinId,
            atomIds: [...this.atomIds],
            translation: this.translation ? [...this.translation] : null,
            matrix4: this.matrix4 ? [...this.matrix4] : null,
            previousPositions: this.previousPositions ? positionsToObject(this.previousPositions) : null,
            nextPositions: this.nextPositions ? positionsToObject(this.nextPositions) : null,
            phase: this.phase,
            source: this.source,
            intent: this.intent,
            description: this.description,
        };
    }

    _computeNextPositions(previousPositions) {
        const out = new Map();
        if (this.matrix4) {
            for (const [atomId, p] of previousPositions.entries()) out.set(atomId, mat4TransformPoint(this.matrix4, p));
            return out;
        }
        if (this.translation) {
            const t = this.translation;
            for (const [atomId, p] of previousPositions.entries()) out.set(atomId, [p[0] + t[0], p[1] + t[1], p[2] + t[2]]);
            return out;
        }
        return out;
    }

    _applyPositions(model, positions) {
        for (const [atomId, p] of positions.entries()) model.setAtomPosition(atomId, p[0], p[1], p[2]);
    }

    _eventTransform(action) {
        if (!this.translation && !this.matrix4) return {};
        if (this.translation) {
            const t = action === 'undo' ? inverseTranslation(this.translation) : [...this.translation];
            const matrix = translationMatrix(t);
            return {translation: t, matrix, transform: {translation: {x: t[0], y: t[1], z: t[2]}, matrix}};
        }
        // Matrix undo inversion is intentionally not guessed here. Rigid VR drags pass translation.
        return action === 'undo' ? {} : {matrix: [...this.matrix4], transform: {matrix: [...this.matrix4]}};
    }

    _emit(ctx, model, action) {
        const revision = model.bumpRevision();
        const {residueIds, chainIds} = collectResidueAndChainIds(model, this.atomIds);
        const transformPayload = this._eventTransform(action);
        const payload = {
            commandType: this.type,
            action,
            proteinId: this.proteinId,
            atomIds: [...this.atomIds],
            residueIds,
            chainIds,
            phase: this.phase,
            source: this.source,
            intent: this.intent,
            revision,
            ...transformPayload,
        };
        ctx.eventBus?.emit?.(EventTypes.ATOM_SET_TRANSFORMED, {type: EventTypes.ATOM_SET_TRANSFORMED, ...payload});
        ctx.eventBus?.emit?.(EventTypes.ATOM_POSITION_CHANGED, {type: EventTypes.ATOM_POSITION_CHANGED, ...payload});
    }
}
