export class Command {
    constructor({
                    type = 'command',
                    id = null,
                    description = '',
                    source = 'command',
                    metadata = {},
                } = {}) {
        this.type = type;
        this.id = id || `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
        this.description = description;
        this.source = source;
        this.metadata = {...metadata};
        this.createdAt = new Date().toISOString();
    }

    execute(_ctx) {
        throw new Error(`${this.constructor.name}.execute(ctx) not implemented`);
    }

    undo(_ctx) {
        throw new Error(`${this.constructor.name}.undo(ctx) not implemented`);
    }

    redo(ctx) {
        return this.execute(ctx);
    }

    toJSON() {
        return {
            type: this.type,
            id: this.id,
            description: this.description,
            source: this.source,
            metadata: {...this.metadata},
            createdAt: this.createdAt,
        };
    }
}

export function isCommandLike(command) {
    return !!command
        && typeof command.execute === 'function'
        && typeof command.undo === 'function';
}

export function commandLabel(command) {
    return command?.description || command?.name || command?.type || command?.constructor?.name || 'command';
}
