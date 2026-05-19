import {EventTypes} from '../../event/EventTypes.js';
import {classifyResidue} from '../../../domain/protein/StructureClassifier.js';

export class MutateResidueCommand {
    constructor({proteinId, residueId, toResidueName, metadata = {}} = {}) {
        if (!proteinId || !residueId || !toResidueName) {
            throw new Error('[MutateResidueCommand] proteinId, residueId and toResidueName are required');
        }
        this.type = 'mutateResidue';
        this.name = `Mutate residue to ${toResidueName}`;
        this.proteinId = proteinId;
        this.residueId = residueId;
        this.toResidueName = String(toResidueName).toUpperCase();
        this.metadata = {...metadata};
        this.before = null;
    }

    execute(ctx) {
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        if (!model) throw new Error(`[MutateResidueCommand] protein not found: ${this.proteinId}`);

        const residue = model.residues.get(this.residueId);
        if (!residue) throw new Error(`[MutateResidueCommand] residue not found: ${this.residueId}`);

        this.before = {
            name: residue.name,
            kind: residue.kind,
            chainType: residue.chainType,
            flags: {
                isProtein: residue.isProtein,
                isNucleic: residue.isNucleic,
                isHeterogen: residue.isHeterogen,
                isWater: residue.isWater,
                isUnknown: residue.isUnknown,
            },
            metadata: {...(residue.metadata || {})},
        };

        const cls = classifyResidue({recordType: residue.recordType, resName: this.toResidueName});
        residue.name = this.toResidueName;
        residue.kind = cls.kind;
        residue.chainType = cls.chainType;
        residue.isProtein = cls.isProtein;
        residue.isNucleic = cls.isNucleic;
        residue.isHeterogen = cls.isHeterogen;
        residue.isWater = cls.isWater;
        residue.isUnknown = cls.isUnknown;
        residue.metadata = {
            ...(residue.metadata || {}),
            provrMutation: {
                from: this.before.name,
                to: this.toResidueName,
                at: new Date().toISOString(),
                source: this.metadata.source || 'mutation-command',
            },
        };

        model.bumpRevision?.('mutateResidue');

        ctx.eventBus?.emit?.(EventTypes.RESIDUE_MODIFIED, {
            proteinId: this.proteinId,
            residueId: this.residueId,
            from: this.before.name,
            to: this.toResidueName,
            source: 'MutateResidueCommand',
        });

        return true;
    }

    undo(ctx) {
        const model = ctx.proteinSystem.getProtein(this.proteinId);
        const residue = model?.residues?.get?.(this.residueId);
        if (!residue || !this.before) return false;

        residue.name = this.before.name;
        residue.kind = this.before.kind;
        residue.chainType = this.before.chainType;
        residue.isProtein = this.before.flags.isProtein;
        residue.isNucleic = this.before.flags.isNucleic;
        residue.isHeterogen = this.before.flags.isHeterogen;
        residue.isWater = this.before.flags.isWater;
        residue.isUnknown = this.before.flags.isUnknown;
        residue.metadata = {...this.before.metadata};

        model.bumpRevision?.('undoMutateResidue');

        ctx.eventBus?.emit?.(EventTypes.RESIDUE_MODIFIED, {
            proteinId: this.proteinId,
            residueId: this.residueId,
            to: this.before.name,
            source: 'MutateResidueCommand.undo',
        });

        return true;
    }

    toJSON() {
        return {
            type: this.type,
            proteinId: this.proteinId,
            residueId: this.residueId,
            toResidueName: this.toResidueName,
            metadata: {...this.metadata},
        };
    }
}
