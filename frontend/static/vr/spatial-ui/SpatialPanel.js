import * as THREE from '../../libs/three.module.js';
import {SpatialDesignTokens as T} from './SpatialDesignTokens.js';
import {roundedRectShape} from './SpatialCanvasTexture.js';

export class SpatialPanel {
    constructor({
                    name = 'spatial-panel',
                    width = 8,
                    height = 4,
                    radius = T.sizes.radius,
                    opacity = T.opacity.panel,
                } = {}) {
        this.group = new THREE.Group();
        this.group.name = name;

        this.backplate = new THREE.Mesh(
            new THREE.ShapeGeometry(roundedRectShape(width, height, radius)),
            new THREE.MeshPhysicalMaterial({
                color: T.colors.panel,
                transparent: true,
                opacity,
                roughness: 0.24,
                metalness: 0,
                transmission: 0.12,
                side: THREE.DoubleSide,
            })
        );
        this.backplate.name = `${name}:backplate`;
        this.backplate.renderOrder = 80;
        this.group.add(this.backplate);
    }

    add(object) {
        this.group.add(object);
        return object;
    }

    setPosition(x, y, z) {
        this.group.position.set(x, y, z);
    }

    setRotation(x, y, z) {
        this.group.rotation.set(x, y, z);
    }
}
