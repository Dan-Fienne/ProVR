export class HistoryFeature {
    constructor({context = null} = {}) {
        this.context = null;
        if (context) this.attach(context);
    }

    attach(context) {
        this.context = context;
        return this;
    }

    undo() {
        return this._ctx().commandManager.undo({source: 'history-feature'});
    }

    redo() {
        return this._ctx().commandManager.redo({source: 'history-feature'});
    }

    clear() {
        return this._ctx().commandManager.clearHistory({source: 'history-feature'});
    }

    summary() {
        return this._ctx().commandManager.historySummary();
    }

    _ctx() {
        if (!this.context) throw new Error('[HistoryFeature] context is not attached');
        return this.context;
    }
}
