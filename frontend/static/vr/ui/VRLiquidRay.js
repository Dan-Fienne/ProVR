import * as THREE from '../../libs/three.module.js';

export const VRRayVisualState = Object.freeze({
    IDLE: 'idle',
    UI: 'ui',
    UI_HOVER: 'ui-hover',
    MOLECULE: 'molecule',
    MOLECULE_HOVER: 'molecule-hover',
    PRESSED: 'pressed',
});

// UI ray is intentionally shorter and lighter so it does not slice through the whole menu.
const STATE = Object.freeze({
    [VRRayVisualState.IDLE]: {color: 0x6edcff, opacity: 0.26, length: 1.05},
    [VRRayVisualState.UI]: {color: 0xffffff, opacity: 0.28, length: 0.78},
    [VRRayVisualState.UI_HOVER]: {color: 0xffffff, opacity: 0.92, length: 0.78},
    [VRRayVisualState.MOLECULE]: {color: 0x7cffd1, opacity: 0.44, length: 1.50},
    [VRRayVisualState.MOLECULE_HOVER]: {color: 0xffffff, opacity: 0.86, length: 1.60},
    [VRRayVisualState.PRESSED]: {color: 0xfff7d1, opacity: 0.96, length: 0.86},
});

export function createLiquidRayLine() {
    const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
    ]);
    const material = new THREE.LineBasicMaterial({color: 0x6edcff, transparent: true, opacity: 0.34});
    const line = new THREE.Line(geometry, material);
    line.name = 'liquid-controller-ray';
    line.userData.rayVisualState = VRRayVisualState.IDLE;
    line.scale.z = 1.05;
    return line;
}

export function setRayVisualState(controller, state = VRRayVisualState.IDLE) {
    const line = controller?.children?.find?.((c) => c.name === 'liquid-controller-ray' || c.name === 'controller-ray');
    if (!line?.material) return;
    const spec = STATE[state] || STATE[VRRayVisualState.IDLE];
    line.material.color.setHex(spec.color);
    line.material.opacity = spec.opacity;
    line.material.needsUpdate = true;
    line.scale.z = spec.length;
    line.userData.rayVisualState = state;
}
