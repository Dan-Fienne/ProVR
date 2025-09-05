import {elementColors, residueColors} from "../core/constants.js";
import {Color} from "../js/three.core.js";

export function rgbToColor(rgb) {
    return new Color(rgb[0], rgb[1], rgb[2]);
}


export function getElementColor(elem) {
    const rgb = elementColors[elem] || elementColors.DEF;
    return rgbToColor(rgb);
}

export function getResidueColor(res) {
    const rgb = residueColors[res] || residueColors.DEF;
    return rgbToColor(rgb);
}

export function getChainColor(chainId, index = 0) {
    const goldenAngle = 137.508;
    const hue = (index * goldenAngle) % 360;
    const saturation = 0.65;
    const value = 0.8;
    const rgb = hsvToRgb(hue, saturation, value);
    return rgbToColor(rgb);
}

function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let [r, g, b] = [0, 0, 0];

    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];

    return [r + m, g + m, b + m];
}

