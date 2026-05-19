import {GeometryCache} from '../geometry/GeometryCache.js';
import {PickRegistry} from '../interaction/PickRegistry.js';

/**
 * Shared runtime context passed to every representation.
 *
 * It intentionally does not own domain data; ProteinSystem remains the source of truth.
 */
export class RepresentationContext {
    constructor({
                    proteinSystem,
                    eventBus = null,
                    scene = null,
                    renderer = null,
                    camera = null,
                    geometryCache = null,
                    pickRegistry = null,
                    services = {},
                    metadata = {},
                } = {}) {
        if (!proteinSystem) throw new Error('[RepresentationContext] proteinSystem is required');
        this.proteinSystem = proteinSystem;
        this.eventBus = eventBus;
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.geometryCache = geometryCache || new GeometryCache();
        this.pickRegistry = pickRegistry || new PickRegistry();
        this.services = {...services};
        this.metadata = {...metadata};
    }

    getProtein(proteinId) {
        return this.proteinSystem.getProtein?.(proteinId) || null;
    }

    requireProtein(proteinId) {
        const model = this.getProtein(proteinId);
        if (!model) throw new Error(`[RepresentationContext] protein not found: ${proteinId}`);
        return model;
    }

    setScene(scene) {
        this.scene = scene;
    }

    setRenderer(renderer) {
        this.renderer = renderer;
    }

    getService(name) {
        return this.services[name] || null;
    }

    registerService(name, service) {
        this.services[name] = service;
        return service;
    }

    summary() {
        return {
            hasProteinSystem: !!this.proteinSystem,
            hasEventBus: !!this.eventBus,
            hasScene: !!this.scene,
            hasRenderer: !!this.renderer,
            hasCamera: !!this.camera,
            geometryCache: this.geometryCache?.summary?.() || null,
            pickRegistry: this.pickRegistry?.summary?.() || null,
            services: Object.keys(this.services),
        };
    }
}
