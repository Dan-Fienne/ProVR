import {normalizeRepresentationSpec} from './RepresentationSpec.js';
import {RepDirtyFlags} from './DirtyPolicy.js';

export class RepresentationBase {
    constructor({spec, context}) {
        this.spec = normalizeRepresentationSpec(spec);
        this.context = context;
        this.id = this.spec.id;
        this.proteinId = this.spec.proteinId;
        this.root = null;
        this._built = false;
        this._disposed = false;
        this._visible = this.spec.visible;
        this._dirty = RepDirtyFlags.NONE;
        this._pickables = new Set();
    }

    get model() {
        return this.context.getProtein(this.proteinId);
    }

    get built() {
        return this._built;
    }

    get disposed() {
        return this._disposed;
    }

    get visible() {
        return this._visible;
    }

    build() {
        throw new Error(`${this.constructor.name}.build() not implemented`);
    }

    update(_evt) {
        // Representation-specific event handling goes here.
    }

    setVisible(visible) {
        this._visible = !!visible;
        this.spec = this.spec.patch({visible: this._visible});
        if (this.root) this.root.visible = this._visible;
        this.markDirty(RepDirtyFlags.VISIBILITY);
    }

    setOptions(patch = {}) {
        this.spec = this.spec.patch(patch);
        this.markDirty(RepDirtyFlags.STYLE | RepDirtyFlags.FILTER | RepDirtyFlags.GEOMETRY | RepDirtyFlags.PICK_TARGETS);
    }

    markDirty(flags = RepDirtyFlags.FULL_REBUILD) {
        this._dirty |= flags;
    }

    flushDirty() {
        if (this._dirty === RepDirtyFlags.NONE) return false;
        const dirty = this._dirty;
        this._dirty = RepDirtyFlags.NONE;
        if (dirty & RepDirtyFlags.FULL_REBUILD) {
            this.rebuild();
            return true;
        }
        return false;
    }

    rebuild() {
        this.disposeObjectsOnly();
        this._built = false;
        this._disposed = false;
        this.build();
    }

    getPickables() {
        return [...this._pickables];
    }

    registerPickable(object, target) {
        if (!object) return null;
        if (!object.userData) object.userData = {};
        object.userData.target = target;
        object.userData.representationId = this.id;
        object.userData.proteinId = this.proteinId;
        this._pickables.add(object);
        this.context.pickRegistry.register(object, target, {representationId: this.id});
        return object;
    }

    unregisterPickables() {
        for (const object of this._pickables) {
            this.context.pickRegistry.unregister(object);
        }
        this._pickables.clear();
    }

    disposeObjectsOnly() {
        this.unregisterPickables();
        if (this.root && this.context.scene && typeof this.context.scene.remove === 'function') {
            this.context.scene.remove(this.root);
        }
        this.root = null;
    }

    dispose() {
        if (this._disposed) return;
        this.disposeObjectsOnly();
        this._disposed = true;
        this._built = false;
    }
}
