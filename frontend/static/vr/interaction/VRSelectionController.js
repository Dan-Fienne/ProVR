export class VRSelectionController {
    constructor({context, inputAdapter, spatialUI = null} = {}) {
        if (!context) throw new Error('[VRSelectionController] context is required');
        if (!inputAdapter) throw new Error('[VRSelectionController] inputAdapter is required');
        this.context = context;
        this.input = inputAdapter;
        this.spatialUI = spatialUI;
        this.hoverState = null;
    }

    pickSpatialUI(controller) {
        const objects = this.spatialUI?.getPickableObjects?.() || [];
        if (!objects.length) return null;
        const hit = this.input.raycast(controller, objects, {recursive: false})[0] || null;
        if (!hit) return null;
        return {
            kind: 'ui',
            hit,
            object: hit.object,
            point: hit.point,
            action: hit.object?.userData?.spatialAction || null,
        };
    }

    pickSemanticTarget(controller) {
        const registry = this.context.representationManager.context.pickRegistry;
        const records = registry?.list?.() || [];
        const objects = records
            .map((record) => record.object)
            .filter((object) => object?.isObject3D && object.visible !== false);

        if (!objects.length) return null;

        const hits = this.input.raycast(controller, objects, {recursive: false});
        for (const hit of hits) {
            const target = registry.getTarget(hit.object) || hit.object.userData?.target;
            if (!target) continue;
            const model = this.context.proteinSystem.getProtein(target.proteinId) || this.context.activeModel;
            if (!model) continue;
            return {
                kind: 'molecule',
                hit,
                object: hit.object,
                point: hit.point,
                target,
                model,
            };
        }
        return null;
    }

    pickSurfaceLayer(controller, surfaceFeature) {
        const rep = surfaceFeature?.getSurfaceRep?.();
        const meshes = rep?.getSurfaceLayerMeshes?.({pickableOnly: true, visibleOnly: true}) || [];
        if (!meshes.length) return null;

        const hit = this.input.raycast(controller, meshes, {recursive: false})[0] || null;
        if (!hit?.object) return null;

        return {
            kind: 'surfaceLayer',
            hit,
            object: hit.object,
            point: hit.point,
            layerId: hit.object.userData?.layerId || hit.object.userData?.rangeId || null,
        };
    }

    updateHover(controller) {
        const ui = this.pickSpatialUI(controller);
        if (ui) {
            this.hoverState = ui;
            return ui;
        }

        const target = this.pickSemanticTarget(controller);
        if (target) {
            this.hoverState = target;
            return target;
        }

        this.hoverState = null;
        return null;
    }
}
