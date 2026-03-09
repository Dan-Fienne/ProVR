import {EventTypes} from '../event/EventTypes.js';

export class MoveAtomCommand {
    constructor({
                    proteinId,
                    atomId,
                    nextPosition, // [x,y,z]
                    phase = 'final'
                }) {
        this.proteinId = proteinId;
        this.atomId = atomId;
        this.nextPosition = nextPosition;
        this.phase = phase;
        this.prevPosition = null;
    }

    execute(ctx) {
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        if (!model) return;

        const current = model.getAtomPosition(this.atomId);
        if (!current) return;

        this.prevPosition = [...current];
        model.setAtomPosition(this.atomId, this.nextPosition[0], this.nextPosition[1], this.nextPosition[2]);
        const revision = model.bumpRevision();

        const atom = model.getAtom(this.atomId);
        ctx.eventBus.emit(EventTypes.ATOM_POSITION_CHANGED, {
            type: EventTypes.ATOM_POSITION_CHANGED,
            proteinId: this.proteinId,
            atomIds: [this.atomId],
            residueIds: atom ? [atom.residueId] : [],
            phase: this.phase,
            revision,
        });
    }

    undo(ctx) {
        if (!this.prevPosition) return;
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        if (!model) return;

        model.setAtomPosition(this.atomId, this.prevPosition[0], this.prevPosition[1], this.prevPosition[2]);
        const revision = model.bumpRevision();

        const atom = model.getAtom(this.atomId);
        ctx.eventBus.emit(EventTypes.ATOM_POSITION_CHANGED, {
            type: EventTypes.ATOM_POSITION_CHANGED,
            proteinId: this.proteinId,
            atomIds: [this.atomId],
            residueIds: atom ? [atom.residueId] : [],
            phase: 'final',
            revision,
        });
    }

    redo(ctx) {
        this.execute(ctx);
    }
}