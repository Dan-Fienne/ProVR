import * as THREE from '../../libs/three.module.js';
import {SpatialDesignTokens as T} from './SpatialDesignTokens.js';
import {roundedRectShape} from './SpatialCanvasTexture.js';

export class SpatialPanel {
    constructor({
                    name = 'spatial-panel',
                    width = T.sizes.panelWidth,
                    height = T.sizes.panelHeight,
                    radius = T.sizes.panelRadius,
                } = {}) {
        this.width = width;
        this.height = height;
        this.group = new THREE.Group();
        this.group.name = name;

        this.backplate = new THREE.Mesh(
            new THREE.ShapeGeometry(roundedRectShape(width, height, radius)),
            new THREE.MeshPhysicalMaterial({
                color: 0x101827,
                transparent: true,
                opacity: 0.42,
                roughness: 0.18,
                metalness: 0.0,
                transmission: 0.16,
                side: THREE.DoubleSide,
                depthWrite: false,
            })
        );
        this.backplate.name = `${name}:glassBackplate`;
        this.backplate.renderOrder = 70;
        this.group.add(this.backplate);

        this.stroke = new THREE.LineSegments(
            new THREE.EdgesGeometry(this.backplate.geometry),
            new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.18,
            })
        );
        this.stroke.name = `${name}:hairline`;
        this.stroke.position.z = 0.01;
        this.stroke.renderOrder = 72;
        this.group.add(this.stroke);
    }

    add(object) {
        this.group.add(object);
        return object;
    }
}
