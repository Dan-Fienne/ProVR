export class VRStrainIndicator {
    constructor({onStatus = () => {}} = {}) {
        this.onStatus = onStatus;
    }

    update({maxDisplacement = 0, endpointError = 0} = {}) {
        if (endpointError > 2.0) this.onStatus(`High endpoint strain: ${endpointError.toFixed(2)} Å`);
        else if (maxDisplacement > 4.0) this.onStatus(`Large local displacement: ${maxDisplacement.toFixed(2)} Å`);
    }
}
