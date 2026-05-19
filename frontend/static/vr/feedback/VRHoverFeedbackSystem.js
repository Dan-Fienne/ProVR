import * as THREE from '../../libs/three.module.js';
import {VRInputEvents} from '../input/VRControllerInputAdapter.js';

export class VRHoverFeedbackSystem {
    constructor({inputAdapter, selectionController, spatialUI, onHover = () => {}} = {}) {
        if (!inputAdapter) throw new Error('[VRHoverFeedbackSystem] inputAdapter is required');
        if (!selectionController) throw new Error('[VRHoverFeedbackSystem] selectionController is required');
        this.input = inputAdapter;
        this.selection = selectionController;
        this.spatialUI = spatialUI;
        this.onHover = onHover;
        this._off = null;
        this._lastButton = null;
        this._lastKey = '';
        this._reticles = new Map();
    }

    enable() {
        if (this._off) return;
        this._off = this.input.on(VRInputEvents.FRAME, () => this.update());
    }

    disable() {
        this._off?.();
        this._off = null;
    }

    update() {
        for (const controller of this.input.controllers) {
            const hover = this.selection.updateHover(controller);
            this._buttonFeedback(hover);
            this._reticleFeedback(controller, hover);
            this._contextFeedback(hover);
            this.onHover(hover);
        }
    }

    _buttonFeedback(hover) {
        const button = hover?.kind === 'ui' ? hover.object?.userData?.spatialButton : null;
        if (this._lastButton && this._lastButton !== button) this._lastButton.mesh.scale.setScalar(1);
        if (button) button.mesh.scale.setScalar(1.075);
        this._lastButton = button || null;
    }

    _reticleFeedback(controller, hover) {
        if (!this._reticles.has(controller)) {
            const reticle = new THREE.Mesh(
                new THREE.SphereGeometry(0.026, 18, 18),
                new THREE.MeshBasicMaterial({
                    color: 0x62c8ff,
                    transparent: true,
                    opacity: 0.92,
                    depthTest: false,
                })
            );
            reticle.name = `vr:hoverReticle:${controller.userData.index ?? 0}`;
            reticle.renderOrder = 600;
            this.input.runtime.scene.add(reticle);
            this._reticles.set(controller, reticle);
        }

        const reticle = this._reticles.get(controller);
        if (hover?.point) {
            reticle.visible = true;
            reticle.position.copy(hover.point);
            reticle.scale.setScalar(hover.kind === 'ui' ? 1.4 : 1.0);
        } else {
            reticle.visible = false;
        }
    }

    _contextFeedback(hover) {
        let key = '';
        if (hover?.kind === 'ui') key = `ui:${hover.action}`;
        if (hover?.kind === 'molecule') {
            key = `mol:${hover.target?.kind}:${hover.target?.residueIds?.join(',')}:${hover.target?.chainIds?.join(',')}`;
        }
        if (key === this._lastKey) return;
        this._lastKey = key;

        if (!hover) return;

        if (hover.kind === 'ui') {
            const button = hover.object?.userData?.spatialButton;
            this.spatialUI?.setContextCard?.({
                title: button?.title || 'Action',
                subtitle: button?.subtitle || hover.action,
                rows: [['Trigger', 'activate']],
            });
            return;
        }

        const t = hover.target;
        this.spatialUI?.setContextCard?.({
            title: t?.metadata?.residueLabel || t?.kind || 'Target',
            subtitle: `${t?.kind || 'target'} · ${t?.chainIds?.join(',') || 'chain?'}`,
            rows: [
                ['Residues', String(t?.residueIds?.length || 0)],
                ['Atoms', String(t?.atomIds?.length || 0)],
                ['Trigger', 'select / operate'],
            ],
        });
    }
}
