export class VRRayLayerPolicy {
    constructor({state} = {}) {
        this.state = state;
    }

    mode() {
        return this.state?.menuOpen ? 'ui' : 'molecule';
    }

    canTargetUI() {
        return this.mode() === 'ui';
    }

    canTargetMolecule() {
        return this.mode() === 'molecule';
    }
}
