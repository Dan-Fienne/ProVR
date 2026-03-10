export class RepresentationBase {
    constructor({
                    id,
                    proteinId,
                    proteinSystem,
                    eventBus,
                    scene,
                    options = {}
                }) {
        this.id = id;
        this.proteinId = proteinId;
        this.proteinSystem = proteinSystem;
        this.eventBus = eventBus;
        this.scene = scene;
        this.options = options;

        this.root = null;
        this._built = false;
        this._disposed = false;
    }

    get model() {
        return this.proteinSystem.getProtein(this.proteinId);
    }

    build() {
        throw new Error(`${this.constructor.name}.build() not implemented`);
    }

    update(_evt) {

    }

    dispose() {
        this._disposed = true;
        this._built = false;
    }

    get built() {
        return this._built;
    }

    get disposed() {
        return this._disposed;
    }
}

