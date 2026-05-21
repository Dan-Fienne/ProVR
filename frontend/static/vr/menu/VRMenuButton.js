import * as THREE from '../../libs/three.module.js';
import {
    makeLiquidButtonTexture,
    makeLiquidSliderTexture,
    makeQuickButtonTexture,
} from '../ui/VRLiquidGlassCanvas.js';
import {VRDesignTokens} from '../ui/VRDesignTokens.js';
import {MenuActionKind} from './VRMenuDefinitions.js';

export class VRMenuButton {
    constructor({
        action,
        width = VRDesignTokens.layout.contentButtonWidth,
        height = VRDesignTokens.layout.contentButtonHeight,
        quick = false,
        nav = false,
        icon = '',
    } = {}) {
        if (!action?.id) throw new Error('[VRMenuButton] action.id required');
        this.action = action;
        this.state = 'normal';
        this.isSlider = action.kind === MenuActionKind.SLIDER;
        this.quick = quick || nav;
        this.icon = icon || action.icon || '';

        this.width = this.quick ? VRDesignTokens.layout.quickButtonWidth : (this.isSlider ? VRDesignTokens.layout.sliderWidth : width);
        this.height = this.quick ? VRDesignTokens.layout.quickButtonHeight : (this.isSlider ? VRDesignTokens.layout.sliderHeight : height);

        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(this.width, this.height),
            new THREE.MeshBasicMaterial({
                map: this._texture(),
                transparent: true,
                depthWrite: false,
                depthTest: false,
                side: THREE.DoubleSide,
            })
        );

        this.mesh.name = `vr-menu-button:${action.id}`;
        this.mesh.userData.menuAction = action;
        this.mesh.userData.menuButton = this;
        this.mesh.renderOrder = 1500;
    }

    setHover(hovered) {
        const next = hovered ? 'hover' : 'normal';
        if (this.state === next) return;
        this.state = next;
        this._refreshTexture();
        this.mesh.scale.setScalar(hovered ? (this.quick ? VRDesignTokens.layout.quickHoverScale : VRDesignTokens.layout.hoverScale) : 1.0);
        this.mesh.position.z = hovered ? 0.096 : 0.055;
    }

    setPressed(pressed) {
        const next = pressed ? 'pressed' : 'hover';
        if (this.state === next) return;
        this.state = next;
        this._refreshTexture();
        this.mesh.scale.setScalar(pressed ? VRDesignTokens.layout.pressedScale : (this.quick ? VRDesignTokens.layout.quickHoverScale : VRDesignTokens.layout.hoverScale));
        this.mesh.position.z = pressed ? 0.11 : 0.096;
    }

    refreshSlider(value) {
        if (!this.isSlider) return;
        this.action.value = value;
        this._refreshTexture();
    }

    dispose() {
        this.mesh.geometry?.dispose?.();
        this.mesh.material?.map?.dispose?.();
        this.mesh.material?.dispose?.();
    }

    _texture() {
        if (this.quick) {
            return makeQuickButtonTexture({
                title: this.action.title,
                subtitle: this.action.subtitle,
                icon: this.icon,
                state: this.state,
            });
        }

        return this.isSlider
            ? makeLiquidSliderTexture({
                title: this.action.title,
                value: this.action.value,
                min: this.action.min,
                max: this.action.max,
                state: this.state,
            })
            : makeLiquidButtonTexture({
                title: this.action.title,
                subtitle: this.action.subtitle,
                color: this.action.color,
                disabled: this.action.disabled,
                state: this.state,
            });
    }

    _refreshTexture() {
        const old = this.mesh.material.map;
        this.mesh.material.map = this._texture();
        old?.dispose?.();
        this.mesh.material.needsUpdate = true;
    }
}
