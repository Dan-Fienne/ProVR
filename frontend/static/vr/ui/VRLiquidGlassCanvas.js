import * as THREE from '../../libs/three.module.js';
import {VRDesignTokens} from './VRDesignTokens.js';

function roundRect(ctx, x, y, w, h, r) {
    const q = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + q, y);
    ctx.lineTo(x + w - q, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + q);
    ctx.lineTo(x + w, y + h - q);
    ctx.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
    ctx.lineTo(x + q, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - q);
    ctx.lineTo(x, y + q);
    ctx.quadraticCurveTo(x, y, x + q, y);
    ctx.closePath();
}

function dropletPath(ctx, x, y, w, h) {
    const r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.bezierCurveTo(x + w * 0.32, y - h * 0.04, x + w * 0.78, y + h * 0.015, x + w - r * 0.76, y + h * 0.08);
    ctx.quadraticCurveTo(x + w, y + h * 0.20, x + w, y + h * 0.50);
    ctx.quadraticCurveTo(x + w, y + h * 0.80, x + w - r * 0.76, y + h * 0.92);
    ctx.bezierCurveTo(x + w * 0.72, y + h * 1.02, x + w * 0.35, y + h * 1.035, x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h / 2);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function makeTexture(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 16;
    t.needsUpdate = true;
    return t;
}

function fit(ctx, text, x, y, maxWidth, font, minPx = 18) {
    const source = String(text || '');
    const px = Number(font.match(/(\d+)px/)?.[1] || 28);
    for (let p = px; p >= minPx; p -= 2) {
        ctx.font = font.replace(/\d+px/, `${p}px`);
        if (ctx.measureText(source).width <= maxWidth) {
            ctx.fillText(source, x, y);
            return p;
        }
    }
    ctx.font = font.replace(/\d+px/, `${minPx}px`);
    let s = source;
    while (s.length > 2 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
    ctx.fillText(s + '…', x, y);
    return minPx;
}

function addGlassHighlights(ctx, w, h, intensity = 1) {
    const radial = ctx.createRadialGradient(w * 0.20, h * 0.12, 8, w * 0.20, h * 0.12, w * 0.76);
    radial.addColorStop(0, `rgba(255,255,255,${0.46 * intensity})`);
    radial.addColorStop(0.34, `rgba(255,255,255,${0.14 * intensity})`);
    radial.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, w, h);

    const slash = ctx.createLinearGradient(0, 0, w, h);
    slash.addColorStop(0, `rgba(255,255,255,${0.28 * intensity})`);
    slash.addColorStop(0.22, 'rgba(255,255,255,0)');
    slash.addColorStop(0.68, `rgba(255,255,255,${0.14 * intensity})`);
    slash.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = slash;
    ctx.fillRect(0, 0, w, h);
}

function drawGlassBase(ctx, {x, y, w, h, r, active = false, pressed = false, faint = false, droplet = false} = {}) {
    const token = VRDesignTokens;

    ctx.shadowColor = active ? 'rgba(255,255,255,0.40)' : token.color.shadow;
    ctx.shadowBlur = active ? 34 : 18;
    ctx.shadowOffsetY = active ? 10 : 6;

    if (droplet) dropletPath(ctx, x, y, w, h);
    else roundRect(ctx, x, y, w, h, r);

    const bg = ctx.createLinearGradient(x, y, x + w, y + h);
    if (pressed) {
        bg.addColorStop(0, 'rgba(255,255,255,0.94)');
        bg.addColorStop(0.52, 'rgba(255,255,255,0.60)');
        bg.addColorStop(1, 'rgba(255,255,255,0.30)');
    } else if (active) {
        bg.addColorStop(0, 'rgba(255,255,255,0.90)');
        bg.addColorStop(0.52, 'rgba(255,255,255,0.52)');
        bg.addColorStop(1, 'rgba(255,255,255,0.24)');
    } else if (faint) {
        bg.addColorStop(0, token.color.glassFaintTop);
        bg.addColorStop(1, token.color.glassFaintBottom);
    } else {
        bg.addColorStop(0, token.color.glassTop);
        bg.addColorStop(0.52, token.color.glassMid);
        bg.addColorStop(1, token.color.glassBottom);
    }

    ctx.fillStyle = bg;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    addGlassHighlights(ctx, w, h, active ? 1.22 : 0.76);

    if (droplet) dropletPath(ctx, x, y, w, h);
    else roundRect(ctx, x, y, w, h, r);

    ctx.lineWidth = active ? 5 : 3;
    ctx.strokeStyle = active ? token.color.edgeStrong : token.color.edge;
    ctx.stroke();

    if (droplet) dropletPath(ctx, x + 10, y + 10, w - 20, h - 20);
    else roundRect(ctx, x + 10, y + 10, w - 20, h - 20, Math.max(8, r - 10));

    ctx.lineWidth = 2;
    ctx.strokeStyle = active ? token.color.accentSoft : token.color.hairline;
    ctx.stroke();
}

export function makeConsoleHeaderTexture({
    title = 'ProVR',
    subtitle = '',
    breadcrumb = 'ROOT',
    width = 1360,
    height = 220,
    state = 'normal',
} = {}) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    const token = VRDesignTokens;
    const active = state === 'hover' || state === 'pressed';

    ctx.clearRect(0, 0, width, height);
    drawGlassBase(ctx, {x: 10, y: 10, w: width - 20, h: height - 20, r: 70, active, faint: true});

    ctx.fillStyle = token.color.subtle;
    ctx.font = token.font.eyebrow;
    ctx.fillText(String(breadcrumb || 'ROOT').toUpperCase(), 58, 55);

    ctx.fillStyle = token.color.ink;
    fit(ctx, title, 56, 140, 450, token.font.title, 46);

    ctx.fillStyle = token.color.inkSoft;
    fit(ctx, subtitle, 540, 133, width - 600, token.font.subtitle, 26);

    return makeTexture(c);
}

export function makeStatusPillTexture({text = '', width = 1360, height = 128, state = 'normal'} = {}) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    const token = VRDesignTokens;
    const active = state === 'hover' || state === 'pressed';

    ctx.clearRect(0, 0, width, height);
    drawGlassBase(ctx, {x: 10, y: 10, w: width - 20, h: height - 20, r: 54, active, faint: true});

    ctx.fillStyle = token.color.inkSoft;
    fit(ctx, text || 'Point at a button · Trigger to select', 54, 82, width - 108, token.font.status, 24);

    return makeTexture(c);
}

export function makeQuickButtonTexture({title = '', subtitle = '', state = 'normal', icon = '', width = 560, height = 190} = {}) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    const token = VRDesignTokens;
    const active = state === 'hover' || state === 'pressed';
    const pressed = state === 'pressed';

    ctx.clearRect(0, 0, width, height);
    drawGlassBase(ctx, {x: 10, y: 10, w: width - 20, h: height - 20, r: 58, active, pressed});

    const glyph = icon || title?.slice(0, 1) || '';
    ctx.fillStyle = token.color.ink;
    ctx.font = '900 58px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 68, height / 2);

    ctx.textAlign = 'left';
    ctx.fillStyle = token.color.ink;
    fit(ctx, title, 118, 79, width - 132, token.font.quickTitle, 24);

    if (subtitle) {
        ctx.fillStyle = token.color.inkSoft;
        fit(ctx, subtitle, 120, 129, width - 136, token.font.quickSub, 18);
    }

    return makeTexture(c);
}

export function makeLiquidButtonTexture({
    title = '',
    subtitle = '',
    color = null,
    disabled = false,
    state = 'normal',
    width = 760,
    height = 250,
} = {}) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    const token = VRDesignTokens;
    const active = state === 'hover' || state === 'pressed';
    const pressed = state === 'pressed';

    ctx.clearRect(0, 0, width, height);

    drawGlassBase(ctx, {
        x: 10,
        y: 10,
        w: width - 20,
        h: height - 20,
        r: 78,
        active,
        pressed,
        droplet: true,
    });

    let textX = 52;
    if (color) {
        const swatch = ctx.createRadialGradient(64, height / 2 - 8, 4, 64, height / 2, 34);
        swatch.addColorStop(0, '#ffffff');
        swatch.addColorStop(0.22, color);
        swatch.addColorStop(1, color);
        ctx.fillStyle = swatch;
        ctx.beginPath();
        ctx.arc(64, height / 2, 29, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.90)';
        ctx.stroke();
        textX = 116;
    }

    ctx.fillStyle = disabled ? '#7f8da0' : token.color.ink;
    fit(ctx, title, textX, 102, width - textX - 54, token.font.button, 36);

    if (subtitle) {
        ctx.fillStyle = disabled ? '#94a3b8' : token.color.inkSoft;
        fit(ctx, subtitle, textX, 159, width - textX - 58, token.font.buttonSub, 22);
    }

    if (active) {
        ctx.fillStyle = token.color.accentStrong;
        ctx.beginPath();
        ctx.arc(width - 52, height / 2, pressed ? 12 : 9, 0, Math.PI * 2);
        ctx.fill();
    }

    return makeTexture(c);
}

export function makeLiquidSliderTexture({title = 'Slider', value = 0.5, min = 0, max = 1, width = 1180, height = 230, state = 'normal'} = {}) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    const token = VRDesignTokens;
    const t = Math.max(0, Math.min(1, (value - min) / Math.max(max - min, 1e-6)));
    const active = state === 'hover' || state === 'pressed';

    ctx.clearRect(0, 0, width, height);
    drawGlassBase(ctx, {x: 10, y: 10, w: width - 20, h: height - 20, r: 78, active, pressed: state === 'pressed'});

    ctx.fillStyle = token.color.ink;
    fit(ctx, title, 48, 90, 210, '900 44px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', 28);

    ctx.fillStyle = token.color.inkSoft;
    ctx.font = '800 30px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
    ctx.fillText(`${Math.round(value * 100)}%`, 50, 147);

    const x0 = 270, x1 = width - 110, y = 119;
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(148,163,184,0.34)';
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();

    const grad = ctx.createLinearGradient(x0, y, x1, y);
    grad.addColorStop(0, 'rgba(90,200,250,0.90)');
    grad.addColorStop(1, 'rgba(96,211,148,0.86)');
    ctx.strokeStyle = grad;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + (x1 - x0) * t, y); ctx.stroke();

    const knobX = x0 + (x1 - x0) * t;
    const knob = ctx.createRadialGradient(knobX - 16, y - 16, 4, knobX, y, 44);
    knob.addColorStop(0, 'rgba(255,255,255,1)');
    knob.addColorStop(0.50, 'rgba(255,255,255,0.84)');
    knob.addColorStop(1, 'rgba(255,255,255,0.46)');
    ctx.fillStyle = knob;
    ctx.beginPath();
    ctx.arc(knobX, y, state === 'pressed' ? 39 : 33, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(90,200,250,0.76)';
    ctx.stroke();

    return makeTexture(c);
}

// Backward-compatible names used by older code.
export const makeLiquidPanelTexture = makeConsoleHeaderTexture;
export const makeNavButtonTexture = makeQuickButtonTexture;

export function makeLiquidCalloutTexture({title = '', subtitle = '', width = 1024, height = 310} = {}) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    const token = VRDesignTokens;

    ctx.clearRect(0, 0, width, height);
    drawGlassBase(ctx, {x: 12, y: 12, w: width - 24, h: height - 24, r: 70, active: false});

    ctx.fillStyle = token.color.ink;
    fit(ctx, title, 56, 126, width - 112, token.font.calloutTitle, 38);

    ctx.fillStyle = token.color.inkSoft;
    fit(ctx, subtitle, 60, 214, width - 120, token.font.calloutBody, 26);

    return makeTexture(c);
}

export function makeTooltipTexture({text = '', width = 800, height = 180} = {}) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    const token = VRDesignTokens;

    drawGlassBase(ctx, {x: 10, y: 10, w: width - 20, h: height - 20, r: 52, active: true, faint: false});

    ctx.fillStyle = token.color.ink;
    fit(ctx, text, 52, 112, width - 104, '900 48px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', 28);
    return makeTexture(c);
}
