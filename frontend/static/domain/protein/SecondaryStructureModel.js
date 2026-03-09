import {SSEType} from "./ProteinConstants.js";


export class SecondaryStructureModel {
    constructor() {
        this._residueSSE = new Map();
        this._ranges = [];
    }

    setResidueSSE(residueId, type = SSEType.LOOP) {
        this._residueSSE.set(residueId, type);
    }

    getResidueSSE(residueId) {
        return this._residueSSE.get(residueId) || SSEType.LOOP;
    }

    addRange(chainId, startLabel, endLabel, type) {
        this._ranges.push({chainId, startLabel, endLabel, type});
    }

    get ranges() {
        return this._ranges;
    }

    clear() {
        this._residueSSE.clear();
        this._ranges.length = 0;
    }
}
