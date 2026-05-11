import {GeometryCache} from '../geometry/GeometryCache.js';
import {PickRegistry} from '../interaction/PickRegistry.js';

export class RepresentationContext {
    constructor({
                    proteinSystem,
                    eventBus = null,
                    scene = null,
                    geometryCache = null,
                    pickRegistry = null,
                    styleRegistry = null,
                    materialRegistry = null,
                    renderer = null,
                } = {}) {
        if (!proteinSystem) throw new Error('[RepresentationContext] proteinSystem is required');
        this.proteinSystem = proteinSystem;
        this.eventBus = eventBus;
        this.scene = scene;
        this.geometryCache = geometryCache || new GeometryCache();
        this.pickRegistry = pickRegistry || new PickRegistry();
        this.styleRegistry = styleRegistry;
        this.materialRegistry = materialRegistry;
        this.renderer = renderer;
    }

    getProtein(proteinId) {
        return this.proteinSystem.getProtein(proteinId);
    }
}