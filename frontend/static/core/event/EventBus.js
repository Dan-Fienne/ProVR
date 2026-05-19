import {createEventPayload} from './EventPayloads.js';
import {requireKnownEventType} from './EventTypes.js';

/**
 * Industrial EventBus for ProVR frontend.
 *
 * Rules:
 * - single frontend event bus
 * - no local demo EventBus in VR or pages
 * - supports wildcard listener "*"
 * - supports once()
 * - supports scoped cleanup
 */
export class EventBus {
    constructor({
                    allowUnknownEvents = false,
                    catchListenerErrors = false,
                    onListenerError = null,
                    maxHistory = 500,
                } = {}) {
        this.allowUnknownEvents = allowUnknownEvents;
        this.catchListenerErrors = catchListenerErrors;
        this.onListenerError = onListenerError;
        this.maxHistory = Math.max(0, Number(maxHistory) || 0);
        this._listeners = new Map();
        this._wildcardListeners = new Set();
        this._scopes = new Map();
        this._history = [];
    }

    on(type, listener, {scope = null} = {}) {
        if (type !== '*') requireKnownEventType(type, {allowUnknown: this.allowUnknownEvents});
        if (typeof listener !== 'function') throw new Error('[EventBus] listener must be a function');

        const set = type === '*' ? this._wildcardListeners : this._listenerSet(type);
        set.add(listener);

        if (scope) {
            if (!this._scopes.has(scope)) this._scopes.set(scope, new Set());
            this._scopes.get(scope).add({type, listener});
        }

        return () => this.off(type, listener);
    }

    once(type, listener, options = {}) {
        const off = this.on(type, (evt) => {
            off();
            listener(evt);
        }, options);
        return off;
    }

    off(type, listener) {
        if (type === '*') return this._wildcardListeners.delete(listener);
        return this._listeners.get(type)?.delete(listener) || false;
    }

    offScope(scope) {
        const records = this._scopes.get(scope);
        if (!records) return 0;
        let count = 0;
        for (const {type, listener} of records) {
            if (this.off(type, listener)) count += 1;
        }
        this._scopes.delete(scope);
        return count;
    }

    emit(typeOrEvent, payload = {}, options = {}) {
        const evt = typeof typeOrEvent === 'object'
            ? createEventPayload(typeOrEvent.type, typeOrEvent, {
                source: typeOrEvent.source || options.source || 'unknown',
                allowUnknown: this.allowUnknownEvents,
            })
            : createEventPayload(typeOrEvent, payload, {
                source: payload.source || options.source || 'unknown',
                allowUnknown: this.allowUnknownEvents,
            });

        this._pushHistory(evt);

        for (const listener of this._listeners.get(evt.type) || []) this._call(listener, evt);
        for (const listener of this._wildcardListeners) this._call(listener, evt);

        return evt;
    }

    listenerCount(type = null) {
        if (!type) {
            let total = this._wildcardListeners.size;
            for (const set of this._listeners.values()) total += set.size;
            return total;
        }
        return type === '*' ? this._wildcardListeners.size : (this._listeners.get(type)?.size || 0);
    }

    history({type = null, limit = 100} = {}) {
        const rows = type ? this._history.filter((evt) => evt.type === type) : this._history;
        return rows.slice(Math.max(0, rows.length - limit));
    }

    clearHistory() {
        this._history.length = 0;
    }

    clear() {
        this._listeners.clear();
        this._wildcardListeners.clear();
        this._scopes.clear();
        this._history.length = 0;
    }

    summary() {
        const byType = {};
        for (const [type, set] of this._listeners.entries()) byType[type] = set.size;
        return {
            listenerCount: this.listenerCount(),
            wildcardListenerCount: this._wildcardListeners.size,
            byType,
            scopeCount: this._scopes.size,
            historySize: this._history.length,
        };
    }

    _listenerSet(type) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        return this._listeners.get(type);
    }

    _call(listener, evt) {
        if (!this.catchListenerErrors) {
            listener(evt);
            return;
        }
        try {
            listener(evt);
        } catch (err) {
            if (this.onListenerError) this.onListenerError(err, evt);
            else console.error('[EventBus] listener error', err, evt);
        }
    }

    _pushHistory(evt) {
        if (this.maxHistory <= 0) return;
        this._history.push(evt);
        if (this._history.length > this.maxHistory) {
            this._history.splice(0, this._history.length - this.maxHistory);
        }
    }
}

export function createEventBus(options = {}) {
    return new EventBus(options);
}
