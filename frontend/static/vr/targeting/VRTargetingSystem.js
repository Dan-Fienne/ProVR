import * as THREE from '../../libs/three.module.js';
import {VRRayVisualState} from '../ui/VRLiquidRay.js';
import {VRReticleLayer} from './VRReticleLayer.js';
import {VRTargetLabelLayer} from './VRTargetLabelLayer.js';
import {VRHighlightLayer} from './VRHighlightLayer.js';
import {describeTarget} from './VRTargetDescriptor.js';

export class VRTargetingSystem {
    constructor({runtime, rig, context, proteinStageGroup} = {}) {
        this.runtime = runtime;
        this.rig = rig;
        this.context = context;
        this.proteinStageGroup = proteinStageGroup;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Line = {threshold: 0.15};
        this.reticle = new VRReticleLayer({scene: runtime.scene});
        this.label = new VRTargetLabelLayer({scene: runtime.scene});
        this.highlight = new VRHighlightLayer({scene: runtime.scene, proteinStageGroup});
        this.current = null;
        this.lastTargetKey = '';
    }

    pick(controller) {
        const registry = this.context.representationManager?.context?.pickRegistry;
        const records = registry?.list?.() || [];
        const objects = records.map((r) => r.object).filter((o) => o?.isObject3D && o.visible !== false);
        if (!objects.length) return null;

        this.raycaster.ray.copy(this.rig.controllerRay(controller));
        const hits = this.raycaster.intersectObjects(objects, false);

        for (const hit of hits) {
            const target = registry.getTarget(hit.object) || hit.object.userData?.target;
            if (!target) continue;
            const model = this.context.proteinSystem.getProtein(target.proteinId) || this.context.activeModel;
            if (!model) continue;
            const desc = describeTarget(target, model);
            return {hit, object: hit.object, point: hit.point, target, model, label: desc.label, subtitle: desc.subtitle, controller};
        }

        return null;
    }

    update(controllers = [], {dragging = false} = {}) {
        for (const controller of controllers) {
            const pick = this.pick(controller);
            if (pick) {
                const key = `${pick.target.kind}|${(pick.target.atomIds || []).slice(0, 3).join(',')}|${pick.target.atomIds?.length || 0}`;
                if (key !== this.lastTargetKey) {
                    this.rig.pulse?.(controller, {intensity: 0.10, duration: 18});
                    this.lastTargetKey = key;
                }
                this.current = pick;
                this.rig.setRayState?.(controller, VRRayVisualState.MOLECULE_HOVER);
                this.reticle.show(pick.point, this.runtime.camera);
                this.label.show({point: pick.point, label: pick.label, subtitle: pick.subtitle, camera: this.runtime.camera, dragging});
                this.highlight.show({target: pick.target, model: pick.model, fallbackPoint: pick.point});
                return pick;
            }
            this.rig.setRayState?.(controller, VRRayVisualState.MOLECULE);
        }

        this.hide();
        this.current = null;
        this.lastTargetKey = '';
        return null;
    }

    hide() {
        this.reticle.hide();
        this.label.hide();
        this.highlight.hide();
    }
}
