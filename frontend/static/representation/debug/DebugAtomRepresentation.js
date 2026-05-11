import {RepresentationBase} from '../common/RepresentationBase.js';
import {createStructureFilter} from '../../domain/protein/StructureFilter.js';
import {targetFromAtom} from '../interaction/PickTarget.js';

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

export class DebugAtomRepresentation extends RepresentationBase {
    build() {
        if (this._built) return;
        const model = this.model;
        if (!model) throw new Error(`[DebugAtomRepresentation] protein not found: ${this.proteinId}`);

        const filter = createStructureFilter(this.spec.filter);
        const root = makeDebugObject({name: `DebugAtom:${this.id}`, visible: this.visible});
        let count = 0;

        for (const atom of model.atoms.values()) {
            if (!filter.acceptAtom(atom, model)) continue;
            const p = model.getAtomPosition(atom.id);
            const target = targetFromAtom(model, atom.id, {
                sourceRepresentation: this.id,
                sourceType: this.spec.type,
            });
            if (!target) continue;
            const object = makeDebugObject({
                name: `atom:${atom.id}:${atom.name}`,
                position: p ? [...p] : null,
                visible: this.visible,
                userData: {atomId: atom.id},
            });
            root.add(object);
            this.registerPickable(object, target);
            count += 1;
        }

        this.root = root;
        this.debugStats = {atomObjects: count};
        if (this.context.scene && typeof this.context.scene.add === 'function') this.context.scene.add(root);
        this._built = true;
        this._disposed = false;
    }

    update(evt) {
        if (!evt || evt.proteinId !== this.proteinId) return;
        if (evt.type === 'atomPositionChanged' && Array.isArray(evt.atomIds)) {
            const model = this.model;
            for (const object of this._pickables) {
                const atomId = object.userData?.atomId;
                if (!evt.atomIds.includes(atomId)) continue;
                const p = model.getAtomPosition(atomId);
                if (p) object.position = [...p];
            }
        }
    }
}
