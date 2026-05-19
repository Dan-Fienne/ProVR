import {EventTypes} from '../event/EventTypes.js';
import {commandLabel, isCommandLike} from './Command.js';

function makeBatchCommand(name, commands) {
    return {
        type: 'transaction',
        name,
        description: name,
        commands,
        execute(ctx) {
            for (const command of commands) command.execute(ctx);
            return true;
        },
        undo(ctx) {
            for (let i = commands.length - 1; i >= 0; i -= 1) commands[i].undo(ctx);
            return true;
        },
        redo(ctx) {
            for (const command of commands) {
                if (typeof command.redo === 'function') command.redo(ctx);
                else command.execute(ctx);
            }
            return true;
        },
        toJSON() {
            return {
                type: 'transaction',
                name,
                commands: commands.map((c) => c.toJSON?.() || {
                    type: c.type || c.constructor?.name || 'command',
                    description: commandLabel(c),
                }),
            };
        },
    };
}

export class CommandManager {
    constructor({
                    eventBus = null,
                    context = {},
                    maxHistory = 500,
                    strict = true,
                } = {}) {
        this.eventBus = eventBus;
        this.context = context;
        this.maxHistory = Math.max(1, Number(maxHistory) || 500);
        this.strict = strict;
        this.undoStack = [];
        this.redoStack = [];
        this._activeTransaction = null;
    }

    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }

    execute(command, {record = true, source = 'command-manager'} = {}) {
        this._assertCommand(command);

        if (this._activeTransaction) {
            return this.executeInTransaction(command);
        }

        try {
            const result = command.execute(this.context);
            if (record) {
                this.undoStack.push(command);
                this._trimUndoStack();
                this.redoStack.length = 0;
            }
            this._emit(EventTypes.COMMAND_EXECUTED, {
                command,
                commandType: command.type || command.constructor?.name || 'command',
                description: commandLabel(command),
                record,
                result,
            }, source);
            this._emitHistoryChanged(source);
            return result;
        } catch (err) {
            this._emit(EventTypes.COMMAND_FAILED, {
                command,
                commandType: command.type || command.constructor?.name || 'command',
                description: commandLabel(command),
                error: err,
                phase: 'execute',
            }, source);
            throw err;
        }
    }

    undo({source = 'command-manager'} = {}) {
        const command = this.undoStack.pop();
        if (!command) return false;
        try {
            const result = command.undo(this.context);
            this.redoStack.push(command);
            this._emit(EventTypes.COMMAND_UNDONE, {
                command,
                commandType: command.type || command.constructor?.name || 'command',
                description: commandLabel(command),
                result,
            }, source);
            this._emitHistoryChanged(source);
            return result;
        } catch (err) {
            this.undoStack.push(command);
            this._emit(EventTypes.COMMAND_FAILED, {
                command,
                commandType: command.type || command.constructor?.name || 'command',
                description: commandLabel(command),
                error: err,
                phase: 'undo',
            }, source);
            throw err;
        }
    }

    redo({source = 'command-manager'} = {}) {
        const command = this.redoStack.pop();
        if (!command) return false;
        try {
            const result = typeof command.redo === 'function'
                ? command.redo(this.context)
                : command.execute(this.context);
            this.undoStack.push(command);
            this._emit(EventTypes.COMMAND_REDONE, {
                command,
                commandType: command.type || command.constructor?.name || 'command',
                description: commandLabel(command),
                result,
            }, source);
            this._emitHistoryChanged(source);
            return result;
        } catch (err) {
            this.redoStack.push(command);
            this._emit(EventTypes.COMMAND_FAILED, {
                command,
                commandType: command.type || command.constructor?.name || 'command',
                description: commandLabel(command),
                error: err,
                phase: 'redo',
            }, source);
            throw err;
        }
    }

    beginTransaction(name = 'transaction', {source = 'command-manager'} = {}) {
        if (this._activeTransaction) throw new Error('[CommandManager] transaction already active');
        this._activeTransaction = {name, commands: [], startedAt: new Date().toISOString()};
        this._emit(EventTypes.COMMAND_TRANSACTION_STARTED, {name}, source);
    }

    executeInTransaction(command) {
        this._assertCommand(command);
        if (!this._activeTransaction) throw new Error('[CommandManager] no active transaction');
        const result = command.execute(this.context);
        this._activeTransaction.commands.push(command);
        return result;
    }

    commitTransaction({source = 'command-manager'} = {}) {
        if (!this._activeTransaction) return false;
        const tx = this._activeTransaction;
        this._activeTransaction = null;
        if (!tx.commands.length) return false;

        const batch = makeBatchCommand(tx.name, tx.commands);
        this.undoStack.push(batch);
        this._trimUndoStack();
        this.redoStack.length = 0;

        this._emit(EventTypes.COMMAND_TRANSACTION_COMMITTED, {
            name: tx.name,
            commandCount: tx.commands.length,
            transaction: batch,
        }, source);
        this._emitHistoryChanged(source);
        return batch;
    }

    rollbackTransaction({source = 'command-manager'} = {}) {
        if (!this._activeTransaction) return false;
        const tx = this._activeTransaction;
        this._activeTransaction = null;

        for (let i = tx.commands.length - 1; i >= 0; i -= 1) {
            tx.commands[i].undo(this.context);
        }

        this._emit(EventTypes.COMMAND_TRANSACTION_ROLLED_BACK, {
            name: tx.name,
            commandCount: tx.commands.length,
        }, source);
        this._emitHistoryChanged(source);
        return true;
    }

    clearHistory({source = 'command-manager'} = {}) {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this._emitHistoryChanged(source);
    }

    historySummary() {
        return {
            undo: this.undoStack.map((command) => ({
                type: command.type || command.constructor?.name || 'command',
                description: commandLabel(command),
            })),
            redo: this.redoStack.map((command) => ({
                type: command.type || command.constructor?.name || 'command',
                description: commandLabel(command),
            })),
            canUndo: this.canUndo,
            canRedo: this.canRedo,
            activeTransaction: this._activeTransaction
                ? {
                    name: this._activeTransaction.name,
                    commandCount: this._activeTransaction.commands.length,
                    startedAt: this._activeTransaction.startedAt,
                }
                : null,
        };
    }

    _assertCommand(command) {
        if (!isCommandLike(command)) {
            const message = '[CommandManager] command must implement execute(ctx) and undo(ctx)';
            if (this.strict) throw new Error(message);
            console.warn(message, command);
        }
    }

    _trimUndoStack() {
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.splice(0, this.undoStack.length - this.maxHistory);
        }
    }

    _emit(type, payload, source) {
        this.eventBus?.emit?.(type, {...payload, source});
    }

    _emitHistoryChanged(source) {
        this._emit(EventTypes.HISTORY_CHANGED, {
            undoSize: this.undoStack.length,
            redoSize: this.redoStack.length,
            canUndo: this.canUndo,
            canRedo: this.canRedo,
        }, source);
    }
}
