import * as THREE from '../../libs/three.module.js';

/**
 * One menu hover cursor per controller.
 * This fixes the "second controller has no feedback" problem.
 */
export class VRMenuHoverLayer {
    constructor({scene, maxControllers = 2} = {}) {
        this.scene = scene;
        this.cursors = new Map();
        for (let i = 0; i < maxControllers; i += 1) {
            const cursor = this._createCursor(i);
            scene.add(cursor);
            cursor.visible = false;
            this.cursors.set(i, cursor);
        }
    }

    show(index, {point, camera, pressed = false} = {}) {
        const cursor = this.cursors.get(index);
        if (!cursor || !point) return;
        cursor.visible = true;
        cursor.position.copy(point);
        const scale = pressed ? 1.28 : 1.0;
        cursor.scale.setScalar(scale);
        const camPos = new THREE.Vector3();
        camera.getWorldPosition(camPos);
        cursor.lookAt(camPos);
    }

    hide(index) {
        const cursor = this.cursors.get(index);
        if (cursor) cursor.visible = false;
    }

    hideAll() {
        for (const cursor of this.cursors.values()) cursor.visible = false;
    }

    _createCursor(index) {
        const group = new THREE.Group();
        group.name = `vr-menu-hover-cursor-${index}`;
        group.renderOrder = 2700;

        const color = index === 0 ? 0xffffff : 0xdfffee;

        const halo = new THREE.Mesh(
            new THREE.RingGeometry(0.026, 0.035, 48),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.92,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false,
            })
        );

        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.017, 20, 10),
            new THREE.MeshBasicMaterial({
                color: index === 0 ? 0x5ac8fa : 0x60d394,
                transparent: true,
                opacity: 0.42,
                depthTest: false,
                depthWrite: false,
            })
        );

        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.006, 16, 8),
            new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 1,
                depthTest: false,
                depthWrite: false,
            })
        );

        group.add(halo, glow, dot);
        return group;
    }
}
