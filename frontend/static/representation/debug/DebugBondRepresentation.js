import {RepresentationBase} from '../common/RepresentationBase.js';
import {createStructureFilter} from '../../domain/protein/StructureFilter.js';
import {targetFromBond} from '../interaction/PickTarget.js';

function makeDebugObject({name, a = null, b = null, visible = true, userData = {}} = {}) {
    return {
        isDebugRepresentationObject: true,
        type: 'DebugBondObject',
        name,
        a,
        b,
        visible,
        userData,
        children: [],
        add(child) { this.children.push(child); },
        remove(child) { this.children = this.children.filter((c) => c !== child); },
        clear() { this.children.length = 0; },
    };
}

function* uniqueBonds(model) {
    const seen = new Set();
    for (const [a, neighbors] of model.bondGraph._adj.entries()) {
        for (const b of neighbors) {
            const key = Number(a) < Number(b) ? `${a}-${b}` : `${b}-${a}`;
            if (seen.has(key)) continue;
            seen.add(key);
            yield [a, b];
        }
    }
}

export class DebugBondRepresentation extends RepresentationBase {
    build() {
        if (this._built) return;
        const model = this.model;
        if (!model) throw new Error(`[DebugBondRepresentation] protein not found: ${this.proteinId}`);

        const filter = createStructureFilter(this.spec.filter);
        const root = makeDebugObject({name: `DebugBond:${this.id}`, visible: this.visible});
        let count = 0;

        for (const [a, b] of uniqueBonds(model)) {
            const atomA = model.getAtom(a);
            const atomB = model.getAtom(b);
            if (!filter.acceptBond(atomA, atomB, model)) continue;
            const target = targetFromBond(model, a, b, {
                sourceRepresentation: this.id,
                sourceType: this.spec.type,
            });
            if (!target) continue;
            const object = makeDebugObject({
                name: `bond:${a}-${b}`,
                a: model.getAtomPosition(a) ? [...model.getAtomPosition(a)] : null,
                b: model.getAtomPosition(b) ? [...model.getAtomPosition(b)] : null,
                visible: this.visible,
                userData: {atomIds: [a, b]},
            });
            root.add(object);
            this.registerPickable(object, target);
            count += 1;
        }

        this.root = root;
        this.debugStats = {bondObjects: count};
        if (this.context.scene && typeof this.context.scene.add === 'function') this.context.scene.add(root);
        this._built = true;
        this._disposed = false;
    }
}
