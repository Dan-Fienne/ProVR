import {RepresentationContext} from './RepresentationContext.js';
import {RepresentationRegistry} from './RepresentationRegistry.js';
import {normalizeRepresentationSpec} from './RepresentationSpec.js';
import {RepDirtyFlags} from './DirtyPolicy.js';
import {EventTypes} from '../../core/event/EventTypes.js';

function specJSON(spec) {
    return spec?.toJSON?.() || spec || null;
}

export class RepresentationManager {
    constructor({
                    proteinSystem,
                    eventBus = null,
                    scene = null,
                    renderer = null,
                    registry = null,
                    context = null,
                    autoBindEvents = true,
                    projectSession = null,
                    strictUpdateErrors = false,
                } = {}) {
        this.context = context || new RepresentationContext({proteinSystem, eventBus, scene, renderer});
        this.registry = registry || new RepresentationRegistry();
        this.eventBus = eventBus || this.context.eventBus || null;
        this.projectSession = projectSession;
        this.strictUpdateErrors = strictUpdateErrors;

        this._instances = new Map();
        this._instancesByProtein = new Map();
        this._eventOffs = [];

        if (autoBindEvents && this.eventBus) this._bindDefaultEvents();
    }

    register(type, record) {
        const registered = this.registry.register(type, record);
        this.eventBus?.emit?.(EventTypes.REPRESENTATION_REGISTERED, {
            type,
            record: registered,
            source: 'representation-manager',
        });
        return registered;
    }

    create(specInput) {
        const spec = normalizeRepresentationSpec(specInput);
        const model = this.context.getProtein(spec.proteinId);
        if (!model) throw new Error(`[RepresentationManager] protein not found: ${spec.proteinId}`);
        if (this._instances.has(spec.id)) throw new Error(`[RepresentationManager] duplicate representation id: ${spec.id}`);

        const rep = this.registry.create(spec, this.context);
        rep.build();
        if (!rep.built && typeof rep._markBuilt === 'function') rep._markBuilt();
        rep.setVisible(spec.visible);

        this._instances.set(rep.id, rep);
        if (!this._instancesByProtein.has(rep.proteinId)) this._instancesByProtein.set(rep.proteinId, new Set());
        this._instancesByProtein.get(rep.proteinId).add(rep.id);

        this.projectSession?.upsertRepresentationSpec?.(rep.spec.toJSON());
        this.eventBus?.emit?.(EventTypes.REPRESENTATION_CREATED, {
            representationId: rep.id,
            proteinId: rep.proteinId,
            representationType: rep.spec.type,
            spec: rep.spec.toJSON(),
            source: 'representation-manager',
        });

        return rep.id;
    }

    get(repId) {
        return this._instances.get(repId) || null;
    }

    require(repId) {
        const rep = this.get(repId);
        if (!rep) throw new Error(`[RepresentationManager] representation not found: ${repId}`);
        return rep;
    }

    list({proteinId = null, type = null} = {}) {
        let ids = proteinId ? [...(this._instancesByProtein.get(proteinId) || [])] : [...this._instances.keys()];
        if (type) ids = ids.filter((id) => this._instances.get(id)?.spec.type === type);
        return ids;
    }

    specs() {
        return [...this._instances.values()].map((rep) => specJSON(rep.spec));
    }

    updateSpec(repId, patch = {}, {rebuild = true} = {}) {
        const rep = this.get(repId);
        if (!rep) return false;

        rep.setOptions(patch);
        if (patch.visible != null) rep.setVisible(patch.visible);
        if (rebuild) rep.rebuild();

        this.projectSession?.upsertRepresentationSpec?.(rep.spec.toJSON());
        this.eventBus?.emit?.(EventTypes.REPRESENTATION_SPEC_CHANGED, {
            representationId: rep.id,
            proteinId: rep.proteinId,
            representationType: rep.spec.type,
            spec: rep.spec.toJSON(),
            rebuild,
            source: 'representation-manager',
        });

        return true;
    }

    setVisible(repId, visible) {
        const rep = this.get(repId);
        if (!rep) return false;
        rep.setVisible(visible);
        this.projectSession?.upsertRepresentationSpec?.(rep.spec.toJSON());
        this.eventBus?.emit?.(EventTypes.REPRESENTATION_VISIBILITY_CHANGED, {
            representationId: rep.id,
            proteinId: rep.proteinId,
            representationType: rep.spec.type,
            visible: !!visible,
            source: 'representation-manager',
        });
        return true;
    }

    rebuild(repId) {
        const rep = this.get(repId);
        if (!rep) return false;
        rep.rebuild();
        this.eventBus?.emit?.(EventTypes.REPRESENTATION_REBUILT, {
            representationId: rep.id,
            proteinId: rep.proteinId,
            representationType: rep.spec.type,
            source: 'representation-manager',
        });
        return true;
    }

    markDirtyByProtein(proteinId, flags = RepDirtyFlags.FULL_REBUILD) {
        for (const repId of this.list({proteinId})) {
            this.get(repId)?.markDirty?.(flags);
        }
    }

    flushDirty() {
        let count = 0;
        for (const rep of this._instances.values()) {
            if (rep.flushDirty?.()) count += 1;
        }
        return count;
    }

    dispatchEvent(evt) {
        if (!evt) return;
        const ids = evt.proteinId ? this.list({proteinId: evt.proteinId}) : this.list();
        const failures = [];

        for (const repId of ids) {
            const rep = this.get(repId);
            if (!rep || rep.disposed) continue;

            try {
                rep.update?.(evt);
            } catch (err) {
                failures.push({repId, error: err});
                console.error(`[RepresentationManager] update failed: ${repId}`, err);
                if (this.strictUpdateErrors) throw err;
            }
        }

        this.eventBus?.emit?.(EventTypes.REPRESENTATION_UPDATED, {
            sourceEvent: evt.type,
            proteinId: evt.proteinId || null,
            representationCount: ids.length,
            failureCount: failures.length,
            source: 'representation-manager',
        });
    }

    remove(repId) {
        const rep = this.get(repId);
        if (!rep) return false;

        rep.dispose?.();
        this._instances.delete(repId);

        const set = this._instancesByProtein.get(rep.proteinId);
        if (set) {
            set.delete(repId);
            if (set.size === 0) this._instancesByProtein.delete(rep.proteinId);
        }

        this.projectSession?.removeRepresentationSpec?.(repId);
        this.eventBus?.emit?.(EventTypes.REPRESENTATION_REMOVED, {
            representationId: repId,
            proteinId: rep.proteinId,
            representationType: rep.spec?.type || '',
            source: 'representation-manager',
        });

        return true;
    }

    removeByProtein(proteinId) {
        let count = 0;
        for (const repId of [...this.list({proteinId})]) {
            if (this.remove(repId)) count += 1;
        }
        return count;
    }

    dispose() {
        for (const repId of [...this._instances.keys()]) this.remove(repId);
        for (const off of this._eventOffs) off();
        this._eventOffs.length = 0;
    }

    summary() {
        const rows = [];
        for (const rep of this._instances.values()) {
            rows.push({
                id: rep.id,
                type: rep.spec?.type || '',
                proteinId: rep.proteinId,
                visible: rep.visible,
                built: rep.built,
                disposed: rep.disposed,
                summary: rep.summary?.() || rep.root?.userData?.summary || null,
            });
        }
        return {
            count: rows.length,
            byProtein: Object.fromEntries([...this._instancesByProtein.entries()].map(([k, v]) => [k, v.size])),
            rows,
            registry: this.registry.summary?.() || null,
            pickRegistry: this.context.pickRegistry?.summary?.() || null,
        };
    }

    _bindDefaultEvents() {
        const types = [
            EventTypes.ATOM_SET_TRANSFORMED,
            EventTypes.ATOM_POSITION_CHANGED,
            EventTypes.RESIDUE_MODIFIED,
            EventTypes.CHAIN_TRANSFORMED,
            EventTypes.STRUCTURE_REBUILT,
            EventTypes.SELECTION_CHANGED,
        ];

        for (const type of types) {
            const off = this.eventBus.on(type, (evt) => this.dispatchEvent(evt));
            this._eventOffs.push(off);
        }
    }
}
