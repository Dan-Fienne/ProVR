export class CommandManager {
    constructor({eventBus, context}) {
        this.eventBus = eventBus;
        this.context = context;
        this.undoStack = [];
        this.redoStack = [];

        this._activeTransaction = null;
    }

    execute(command, {record = true} = {}) {
        command.execute(this.context);
        if (record) {
            this.undoStack.push(command);
            this.redoStack.length = 0;
        }
    }

    undo() {
        const cmd = this.undoStack.pop();
        if (!cmd) return;
        cmd.undo(this.context);
        this.redoStack.push(cmd);
    }

    redo() {
        const cmd = this.redoStack.pop();
        if (!cmd) return;
        cmd.redo ? cmd.redo(this.context) : cmd.execute(this.context);
        this.undoStack.push(cmd);
    }

    beginTransaction(name = 'transaction') {
        if (this._activeTransaction) throw new Error('transaction already active');
        this._activeTransaction = {name, commands: []};
    }

    executeInTransaction(command) {
        if (!this._activeTransaction) throw new Error('no active transaction');
        command.execute(this.context);
        this._activeTransaction.commands.push(command);
    }

    commitTransaction() {
        if (!this._activeTransaction) return;
        const tx = this._activeTransaction;
        this._activeTransaction = null;
        if (tx.commands.length === 0) return;

        const batch = {
            name: tx.name,
            execute: (ctx) => tx.commands.forEach((c) => c.execute(ctx)),
            undo: (ctx) => {
                for (let i = tx.commands.length - 1; i >= 0; i--) tx.commands[i].undo(ctx);
            },
            redo: (ctx) => tx.commands.forEach((c) => (c.redo ? c.redo(ctx) : c.execute(ctx))),
        };
        this.undoStack.push(batch);
        this.redoStack.length = 0;
    }

    rollbackTransaction() {
        if (!this._activeTransaction) return;
        const tx = this._activeTransaction;
        this._activeTransaction = null;
        for (let i = tx.commands.length - 1; i >= 0; i--) {
            tx.commands[i].undo(this.context);
        }
    }
}