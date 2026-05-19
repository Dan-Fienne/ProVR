import {normalizeRepresentationSpec} from './RepresentationSpec.js';
import {RepDirtyFlags, dirtyFlagsToNames, patchToDirtyFlags} from './DirtyPolicy.js';

function disposeMaterial(material) {
    if (!material) return;
    if (Array.isArray(material)) {
        material.forEach(disposeMaterial);
        return;
    }
    for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose?.();
    }
    material.dispose?.();
}

function disposeObjectResources(root) {
    if (!root?.traverse) return;
    root.traverse((obj) => {
        obj.geometry?.dispose?.();
        disposeMaterial(obj.material);
    });
}

/**
 * Base contract for all ProVR representations.
 *
 * Subclasses may override build/update/rebuild/dispose, but should preserve:
 * - _built
 * - _disposed
 * - root
 * - registerPickable/unregisterPickables
 */
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

        this._lifecycle = {
            createdAt: new Date().toISOString(),
            builtAt: null,
            disposedAt: null,
            rebuildCount: 0,
            updateCount: 0,
            lastEventType: null,
            lastError: null,
        };
    }

    get model() {
        return this.context.getProtein(this.proteinId);
    }

    get built() { return this._built; }
    get disposed() { return this._disposed; }
    get visible() { return this._visible; }
    get dirty() { return this._dirty; }

    build() {
        throw new Error(`${this.constructor.name}.build() not implemented`);
    }

    update(evt) {
        this._lifecycle.updateCount += 1;
        this._lifecycle.lastEventType = evt?.type || null;
    }

    setVisible(visible) {
        this._visible = !!visible;
        this.spec = this.spec.patch({visible: this._visible});
        if (this.root) this.root.visible = this._visible;
        this.markDirty(RepDirtyFlags.VISIBILITY);
    }

    setOptions(patch = {}) {
        this.spec = this.spec.patch(patch);
        this.markDirty(patchToDirtyFlags(patch));
    }

    markDirty(flags = RepDirtyFlags.FULL_REBUILD) {
        this._dirty |= flags;
    }

    clearDirty(flags = RepDirtyFlags.FULL_REBUILD | RepDirtyFlags.DATA | RepDirtyFlags.TRANSFORM | RepDirtyFlags.PICK_TARGETS | RepDirtyFlags.GEOMETRY | RepDirtyFlags.FILTER | RepDirtyFlags.STYLE | RepDirtyFlags.VISIBILITY) {
        this._dirty &= ~flags;
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
        this.disposeObjectsOnly({disposeResources: true});
        this._built = false;
        this._disposed = false;
        this._lifecycle.rebuildCount += 1;
        this.build();
    }

    getPickables() {
        return [...this._pickables];
    }

    registerPickable(object, target) {
        if (!object || !target) return null;
        if (!object.userData) object.userData = {};
        object.userData.target = target;
        object.userData.representationId = this.id;
        object.userData.proteinId = this.proteinId;
        this._pickables.add(object);
        this.context.pickRegistry?.register?.(object, target, {representationId: this.id});
        return object;
    }

    unregisterPickables() {
        for (const object of this._pickables) {
            this.context.pickRegistry?.unregister?.(object);
        }
        this._pickables.clear();
    }

    disposeObjectsOnly({disposeResources = true} = {}) {
        this.unregisterPickables();
        if (this.root && this.context.scene && typeof this.context.scene.remove === 'function') {
            this.context.scene.remove(this.root);
        }
        if (disposeResources) disposeObjectResources(this.root);
        this.root?.clear?.();
        this.root = null;
    }

    dispose() {
        if (this._disposed) return;
        this.disposeObjectsOnly({disposeResources: true});
        this._disposed = true;
        this._built = false;
        this._lifecycle.disposedAt = new Date().toISOString();
    }

    _markBuilt() {
        this._built = true;
        this._disposed = false;
        this._lifecycle.builtAt = new Date().toISOString();
    }

    summary() {
        return {
            id: this.id,
            type: this.spec.type,
            proteinId: this.proteinId,
            visible: this.visible,
            built: this.built,
            disposed: this.disposed,
            dirty: this._dirty,
            dirtyNames: dirtyFlagsToNames(this._dirty),
            pickables: this._pickables.size,
            rootName: this.root?.name || '',
            lifecycle: {...this._lifecycle},
        };
    }
}
