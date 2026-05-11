import {RepresentationBase} from '../common/RepresentationBase.js';
import {createStructureFilter} from '../../domain/protein/StructureFilter.js';
import {targetFromBond} from '../interaction/PickTarget.js';

function centroid(model, atomIds = []) {
    const out = [0, 0, 0];
    let n = 0;
    for (const atomId of atomIds) {
        const p = model.getAtomPosition(atomId);
        if (!p) continue;
        out[0] += p[0]; out[1] += p[1]; out[2] += p[2];
        n += 1;
    }
    if (n === 0) return null;
    out[0] /= n; out[1] /= n; out[2] /= n;
    return out;
}

function makeDebugObject({name, position = null, visible = true, userData = {}} = {}) {
    return {
        isDebugRepresentationObject: true,
        type: 'DebugObject',
        name,
        position,
        visible,
        userData,
        children: [],
        add(child) { this.children.push(child); },
        remove(child) { this.children = this.children.filter((c) => c !== child); },
        clear() { this.children.length = 0; },
    };
}

export class DebugResidueRepresentation extends RepresentationBase {
    build() {
        if (this._built) return;
        const model = this.model;
        if (!model) throw new Error(`[DebugResidueRepresentation] protein not found: ${this.proteinId}`);

        const filter = createStructureFilter(this.spec.filter);
        const root = makeDebugObject({name: `DebugResidue:${this.id}`, visible: this.visible});
        let count = 0;

        for (const residue of model.residues.values()) {
            if (!filter.acceptResidue(residue)) continue;
            const target = targetFromResidue(model, residue.id, {
                sourceRepresentation: this.id,
                sourceType: this.spec.type,
            });
            if (!target) continue;
            const object = makeDebugObject({
                name: `residue:${residue.id}`,
                position: centroid(model, residue.atomIds || []),
                visible: this.visible,
                userData: {residueId: residue.id},
            });
            root.add(object);
            this.registerPickable(object, target);
            count += 1;
        }

        this.root = root;
        this.debugStats = {residueObjects: count};
        if (this.context.scene && typeof this.context.scene.add === 'function') this.context.scene.add(root);
        this._built = true;
        this._disposed = false;
    }
}
