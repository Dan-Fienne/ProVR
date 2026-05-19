import {exportPDB, downloadText} from '../../domain/io/PDBExporter.js';

export class ExportFeature {
    constructor({context = null} = {}) {
        this.context = null;
        if (context) this.attach(context);
    }

    attach(context) {
        this.context = context;
        return this;
    }

    exportPDBText({proteinId = null, includeConect = true, includeHeader = true, endRecord = true} = {}) {
        const ctx = this._ctx();
        const pid = proteinId || ctx.activeProteinId;
        const model = pid ? ctx.proteinSystem.getProtein(pid) : null;
        if (!model) throw new Error('[ExportFeature] active model not found');
        return exportPDB(model, {includeConect, includeHeader, endRecord});
    }

    downloadPDB({proteinId = null, filename = null} = {}) {
        const ctx = this._ctx();
        const pid = proteinId || ctx.activeProteinId;
        const model = pid ? ctx.proteinSystem.getProtein(pid) : null;
        if (!model) throw new Error('[ExportFeature] active model not found');
        const text = this.exportPDBText({proteinId: pid});
        const name = filename || `${model.id || 'provr'}_edited.pdb`;
        downloadText(text, name, 'chemical/x-pdb');
        return {filename: name, text};
    }

    _ctx() {
        if (!this.context) throw new Error('[ExportFeature] context is not attached');
        return this.context;
    }
}
