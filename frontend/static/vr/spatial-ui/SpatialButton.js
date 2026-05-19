import * as THREE from '../../libs/three.module.js';
import {SpatialDesignTokens as T} from './SpatialDesignTokens.js';
import {makeButtonTexture} from './SpatialCanvasTexture.js';

export class SpatialButton {
    constructor({
                    action,
                    title,
                    subtitle = '',
                    width = T.sizes.buttonWidth,
                    height = T.sizes.buttonHeight,
                    active = false,
                    tone = 'default',
                } = {}) {
        if (!action) throw new Error('[SpatialButton] action is required');
        this.action = action;
        this.title = title || action;
        this.subtitle = subtitle;
        this.width = width;
        this.height = height;
        this.active = !!active;
        this.tone = tone;

        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshBasicMaterial({
                map: this._makeTexture(),
                transparent: true,
                depthWrite: false,
            })
        );

        this.mesh.name = `vr:button:${action}`;
        this.mesh.renderOrder = 180;
        this.mesh.userData.spatialAction = action;
        this.mesh.userData.spatialButton = this;
    }

    setActive(active) {
        this.active = !!active;
        this.refresh();
    }

    setVisible(visible) {
        this.mesh.visible = !!visible;
    }

    refresh() {
        const old = this.mesh.material.map;
        this.mesh.material.map = this._makeTexture();
        old?.dispose?.();
        this.mesh.material.needsUpdate = true;
    }

    _makeTexture() {
        return makeButtonTexture({
            title: this.title,
            subtitle: this.subtitle,
            active: this.active,
            tone: this.tone,
        });
    }
}
