import {SSEType} from './ProteinConstants.js';

export class SecondaryStructureModel {
    constructor() {
        this.byResidueId = new Map();
        this.ranges = [];
    }

    setResidueSSE(residueId, sse = SSEType.LOOP, metadata = {}) {
        this.byResidueId.set(residueId, {residueId, sse, metadata: {...metadata}});
    }

    getResidueSSE(residueId, fallback = SSEType.LOOP) {
        return this.byResidueId.get(residueId)?.sse || fallback;
    }

    addRange(chainId, start, end, type, metadata = {}) {
        const range = {chainId, start, end, type, metadata: {...metadata}};
        this.ranges.push(range);
        return range;
    }

    rangesForChain(chainId) {
        return this.ranges.filter((r) => r.chainId === chainId);
    }

    clear() {
        this.byResidueId.clear();
        this.ranges.length = 0;
    }

    toJSON() {
        return {
            residues: [...this.byResidueId.values()].map((x) => ({...x, metadata: {...x.metadata}})),
            ranges: this.ranges.map((x) => ({...x, metadata: {...x.metadata}})),
        };
    }

    summary() {
        const byType = {};
        for (const row of this.byResidueId.values()) byType[row.sse] = (byType[row.sse] || 0) + 1;
        return {residues: this.byResidueId.size, ranges: this.ranges.length, byType};
    }
}
