import * as THREE from '../../libs/three.module.js';
import {SpatialDesignTokens as T} from './SpatialDesignTokens.js';

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

export function makePanelTexture({
                                     title = 'ProVR',
                                     subtitle = '',
                                     mode = 'Start',
                                     instruction = 'Load protein inside VR',
                                     width = 2048,
                                     height = 1440,
                                 } = {}) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');

    ctx.clearRect(0, 0, width, height);

    rr(ctx, 12, 12, width - 24, height - 24, 120);
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, 'rgba(255,255,255,.99)');
    bg.addColorStop(.52, 'rgba(236,249,255,.97)');
    bg.addColorStop(1, 'rgba(226,255,240,.92)');
    ctx.fillStyle = bg;
    ctx.fill();

    let bloom = ctx.createRadialGradient(width * .18, height * .10, 20, width * .18, height * .10, width * .62);
    bloom.addColorStop(0, 'rgba(58,183,255,.34)');
    bloom.addColorStop(1, 'rgba(58,183,255,0)');
    ctx.fillStyle = bloom;
    ctx.fill();

    bloom = ctx.createRadialGradient(width * .86, height * .12, 20, width * .86, height * .12, width * .48);
    bloom.addColorStop(0, 'rgba(100,233,173,.30)');
    bloom.addColorStop(1, 'rgba(100,233,173,0)');
    ctx.fillStyle = bloom;
    ctx.fill();

    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(15,23,42,.08)';
    rr(ctx, 38, 38, width - 76, height - 76, 96);
    ctx.stroke();

    ctx.fillStyle = T.colors.ink;
    ctx.font = T.typography.display;
    ctx.fillText(title, 96, 150);

    ctx.fillStyle = T.colors.muted;
    ctx.font = T.typography.body;
    ctx.fillText(subtitle, 102, 218);

    // Status card
    rr(ctx, 92, 300, width - 184, 230, 58);
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,23,42,.08)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = T.colors.subtle;
    ctx.font = T.typography.micro;
    ctx.fillText('CURRENT STEP', 132, 360);

    ctx.fillStyle = T.colors.ink;
    ctx.font = T.typography.title;
    ctx.fillText(mode, 132, 445);

    ctx.fillStyle = T.colors.inkSoft;
    ctx.font = T.typography.body;
    ctx.fillText(instruction, 132, 505);

    // Control guide
    rr(ctx, 92, 590, width - 184, 230, 58);
    ctx.fillStyle = 'rgba(255,255,255,.58)';
    ctx.fill();

    ctx.fillStyle = T.colors.ink;
    ctx.font = T.typography.body;
    ctx.fillText('Trigger  =  Select / Activate', 132, 670);
    ctx.fillText('Squeeze  =  Show / Hide Panel', 132, 742);

    return makeTexture(c);
}

export function makeButtonTexture({
                                      title = '',
                                      subtitle = '',
                                      active = false,
                                      tone = 'default',
                                      width = 1024,
                                      height = 360,
                                  } = {}) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');

    ctx.clearRect(0, 0, width, height);
    rr(ctx, 10, 10, width - 20, height - 20, 82);

    const g = ctx.createLinearGradient(0, 0, width, height);
    if (active) {
        g.addColorStop(0, 'rgba(58,183,255,.98)');
        g.addColorStop(1, 'rgba(100,233,173,.94)');
    } else if (tone === 'danger') {
        g.addColorStop(0, 'rgba(255,111,141,.88)');
        g.addColorStop(1, 'rgba(255,235,239,.96)');
    } else if (tone === 'primary') {
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(213,244,255,.98)');
    } else {
        g.addColorStop(0, 'rgba(255,255,255,.98)');
        g.addColorStop(1, 'rgba(244,250,255,.92)');
    }
    ctx.fillStyle = g;
    ctx.fill();

    ctx.strokeStyle = active ? 'rgba(255,255,255,1)' : 'rgba(15,23,42,.10)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = T.colors.ink;
    ctx.font = T.typography.label;
    ctx.fillText(title, 58, 132);

    if (subtitle) {
        ctx.fillStyle = active ? 'rgba(11,23,38,.78)' : T.colors.muted;
        ctx.font = T.typography.small;
        ctx.fillText(subtitle, 60, 210);
    }

    return makeTexture(c);
}

export function makeContextTexture({
                                      title = 'Context',
                                      subtitle = '',
                                      rows = [],
                                      kind = 'default',
                                      width = 1600,
                                      height = 460,
                                  } = {}) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');

    ctx.clearRect(0, 0, width, height);
    rr(ctx, 10, 10, width - 20, height - 20, 72);
    ctx.fillStyle = 'rgba(255,255,255,.96)';
    ctx.fill();

    ctx.strokeStyle = kind === 'error' ? 'rgba(255,111,141,.72)' : 'rgba(15,23,42,.10)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = kind === 'error' ? '#C73550' : kind === 'ok' ? '#0F8A5C' : T.colors.ink;
    ctx.font = T.typography.title;
    ctx.fillText(title, 70, 108);

    if (subtitle) {
        ctx.fillStyle = T.colors.inkSoft;
        ctx.font = T.typography.body;
        ctx.fillText(subtitle, 74, 180);
    }

    let y = 265;
    ctx.font = T.typography.small;
    for (const row of rows.slice(0, 2)) {
        const text = Array.isArray(row) ? `${row[0]}   ${row[1]}` : String(row);
        ctx.fillStyle = Array.isArray(row) ? T.colors.inkSoft : T.colors.muted;
        ctx.fillText(text, 74, y);
        y += 58;
    }

    return makeTexture(c);
}
