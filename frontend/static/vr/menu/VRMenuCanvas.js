import * as THREE from '../../libs/three.module.js';

export const MenuTheme = Object.freeze({
    ink: '#071827',
    muted: '#5D718B',
    line: 'rgba(7,24,39,.14)',
    bg1: 'rgba(255,255,255,.985)',
    bg2: 'rgba(235,249,255,.955)',
    blue: '#22B8FF',
    mint: '#5EF0B0',
    danger: '#FF6B8F',
});

function rr(ctx, x, y, w, h, r) {
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

function texture(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 16;
    t.needsUpdate = true;
    return t;
}

function fit(ctx, text, x, y, maxWidth, font, min = 22) {
    const px = Number(font.match(/(\d+)px/)?.[1] || 36);
    const base = font;
    let p = px;
    for (; p >= min; p -= 3) {
        ctx.font = base.replace(/\d+px/, `${p}px`);
        if (ctx.measureText(String(text || '')).width <= maxWidth) {
            ctx.fillText(String(text || ''), x, y);
            return;
        }
    }
    let s = String(text || '');
    ctx.font = base.replace(/\d+px/, `${min}px`);
    while (s.length > 2 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
    ctx.fillText(s + '…', x, y);
}

export function makePanelTexture({title = '', subtitle = '', breadcrumb = '', width = 1800, height = 900} = {}) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const ctx = c.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, MenuTheme.bg1);
    g.addColorStop(1, MenuTheme.bg2);
    rr(ctx, 16, 16, width - 32, height - 32, 92);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.stroke();

    ctx.fillStyle = '#8497AE';
    ctx.font = '760 28px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
    ctx.fillText(breadcrumb || 'PROVR', 76, 78);

    ctx.fillStyle = MenuTheme.ink;
    fit(ctx, title, 74, 160, width - 240, '850 72px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', 40);

    ctx.fillStyle = MenuTheme.muted;
    fit(ctx, subtitle, 78, 222, width - 240, '700 34px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', 26);

    ctx.fillStyle = 'rgba(34,184,255,.16)';
    rr(ctx, width - 260, 58, 92, 64, 28);
    ctx.fill();
    ctx.fillStyle = MenuTheme.ink;
    ctx.font = '850 32px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
    ctx.fillText('☰', width - 226, 101);

    ctx.fillStyle = 'rgba(255,107,143,.14)';
    rr(ctx, width - 148, 58, 70, 64, 28);
    ctx.fill();
    ctx.fillStyle = '#b91c1c';
    ctx.font = '850 32px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
    ctx.fillText('×', width - 122, 101);

    return texture(c);
}

export function makeButtonTexture({title = '', subtitle = '', color = null, active = false, disabled = false, width = 760, height = 260} = {}) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const ctx = c.getContext('2d');

    rr(ctx, 10, 10, width - 20, height - 20, 60);
    const g = ctx.createLinearGradient(0, 0, width, height);
    if (disabled) {
        g.addColorStop(0, 'rgba(226,232,240,.82)');
        g.addColorStop(1, 'rgba(203,213,225,.72)');
    } else if (active) {
        g.addColorStop(0, 'rgba(34,184,255,.98)');
        g.addColorStop(1, 'rgba(94,240,176,.93)');
    } else {
        g.addColorStop(0, 'rgba(255,255,255,.99)');
        g.addColorStop(1, 'rgba(240,249,255,.94)');
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(7,24,39,.12)';
    ctx.stroke();

    if (color) {
        ctx.fillStyle = color;
        rr(ctx, 42, 52, 58, 58, 20);
        ctx.fill();
        ctx.strokeStyle = 'rgba(7,24,39,.18)';
        ctx.stroke();
    }

    const x = color ? 124 : 46;
    ctx.fillStyle = disabled ? '#94a3b8' : MenuTheme.ink;
    fit(ctx, title, x, 100, width - x - 46, '820 44px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', 28);

    if (subtitle) {
        ctx.fillStyle = disabled ? '#a3adba' : MenuTheme.muted;
        fit(ctx, subtitle, x, 164, width - x - 46, '700 28px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', 20);
    }
    return texture(c);
}

export function makeSliderTexture({title = 'Slider', value = 0.5, min = 0, max = 1, width = 1320, height = 260} = {}) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const ctx = c.getContext('2d');

    rr(ctx, 10, 10, width - 20, height - 20, 60);
    ctx.fillStyle = 'rgba(255,255,255,.98)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(7,24,39,.12)';
    ctx.lineWidth = 3;
    ctx.stroke();

    const t = (value - min) / Math.max(max - min, 1e-6);
    const x0 = 260, x1 = width - 120, y = 144;
    ctx.fillStyle = MenuTheme.ink;
    fit(ctx, title, 46, 98, 180, '820 42px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', 26);

    ctx.strokeStyle = 'rgba(148,163,184,.55)';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();

    ctx.strokeStyle = MenuTheme.blue;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + (x1 - x0) * t, y);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x0 + (x1 - x0) * t, y, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = MenuTheme.blue;
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.fillStyle = MenuTheme.muted;
    ctx.font = '760 30px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
    ctx.fillText(`${Math.round(value * 100)}%`, 48, 174);

    return texture(c);
}
