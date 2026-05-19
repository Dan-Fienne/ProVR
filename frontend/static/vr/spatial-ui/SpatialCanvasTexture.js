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

function texture(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
}

export function makePanelTexture({title, subtitle, sections = [], footer = '', width = 1400, height = 920} = {}) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');

    ctx.clearRect(0, 0, width, height);
    rr(ctx, 8, 8, width - 16, height - 16, 76);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, 'rgba(255,255,255,.96)');
    bg.addColorStop(.5, 'rgba(238,249,255,.82)');
    bg.addColorStop(1, 'rgba(226,255,240,.70)');
    ctx.fillStyle = bg;
    ctx.fill();

    let bloom = ctx.createRadialGradient(width * .20, height * .08, 20, width * .20, height * .08, width * .58);
    bloom.addColorStop(0, 'rgba(98,200,255,.30)');
    bloom.addColorStop(1, 'rgba(98,200,255,0)');
    ctx.fillStyle = bloom;
    ctx.fill();

    bloom = ctx.createRadialGradient(width * .86, height * .12, 20, width * .86, height * .12, width * .46);
    bloom.addColorStop(0, 'rgba(142,244,198,.26)');
    bloom.addColorStop(1, 'rgba(142,244,198,0)');
    ctx.fillStyle = bloom;
    ctx.fill();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,.96)';
    ctx.stroke();

    ctx.fillStyle = T.colors.ink;
    ctx.font = T.typography.display;
    ctx.fillText(title || 'ProVR', 72, 104);

    ctx.fillStyle = T.colors.muted;
    ctx.font = T.typography.body;
    ctx.fillText(subtitle || '', 76, 148);

    let y = 220;
    for (const section of sections.slice(0, 4)) {
        ctx.fillStyle = T.colors.subtle;
        ctx.font = T.typography.micro;
        ctx.fillText(String(section.label || '').toUpperCase(), 78, y);
        y += 38;
        ctx.fillStyle = T.colors.inkSoft;
        ctx.font = T.typography.body;
        for (const line of (section.lines || []).slice(0, 4)) {
            ctx.fillText(String(line), 84, y);
            y += 34;
        }
        y += 24;
    }

    if (footer) {
        rr(ctx, 62, height - 112, width - 124, 62, 30);
        ctx.fillStyle = 'rgba(255,255,255,.52)';
        ctx.fill();
        ctx.fillStyle = T.colors.inkSoft;
        ctx.font = T.typography.small;
        ctx.fillText(footer, 92, height - 73);
    }

    return texture(c);
}

export function makeButtonTexture({title = '', subtitle = '', active = false, tone = 'default', width = 512, height = 176} = {}) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');

    ctx.clearRect(0, 0, width, height);
    rr(ctx, 6, 6, width - 12, height - 12, 48);

    const g = ctx.createLinearGradient(0, 0, width, height);
    if (active) {
        g.addColorStop(0, 'rgba(98,200,255,.96)');
        g.addColorStop(1, 'rgba(142,244,198,.90)');
    } else if (tone === 'danger') {
        g.addColorStop(0, 'rgba(255,143,163,.76)');
        g.addColorStop(1, 'rgba(255,255,255,.72)');
    } else if (tone === 'primary') {
        g.addColorStop(0, 'rgba(255,255,255,.99)');
        g.addColorStop(1, 'rgba(218,244,255,.90)');
    } else {
        g.addColorStop(0, 'rgba(255,255,255,.76)');
        g.addColorStop(1, 'rgba(255,255,255,.48)');
    }
    ctx.fillStyle = g;
    ctx.fill();

    ctx.strokeStyle = active ? 'rgba(255,255,255,.96)' : 'rgba(71,85,105,.13)';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.fillStyle = T.colors.ink;
    ctx.font = T.typography.label;
    ctx.fillText(title, 30, 72);

    if (subtitle) {
        ctx.fillStyle = T.colors.muted;
        ctx.font = T.typography.small;
        ctx.fillText(subtitle, 30, 112);
    }

    return texture(c);
}

export function makeContextTexture({title = 'Context', subtitle = '', rows = [], kind = 'default', width = 900, height = 340} = {}) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');

    ctx.clearRect(0, 0, width, height);
    rr(ctx, 8, 8, width - 16, height - 16, 48);
    ctx.fillStyle = 'rgba(255,255,255,.80)';
    ctx.fill();

    ctx.strokeStyle = kind === 'error' ? 'rgba(255,143,163,.58)' : 'rgba(71,85,105,.13)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = kind === 'error' ? '#C73550' : kind === 'ok' ? '#147A4C' : T.colors.ink;
    ctx.font = T.typography.title;
    ctx.fillText(title, 44, 72);

    if (subtitle) {
        ctx.fillStyle = T.colors.muted;
        ctx.font = T.typography.body;
        ctx.fillText(subtitle, 46, 112);
    }

    let y = 164;
    ctx.font = T.typography.small;
    for (const row of rows.slice(0, 5)) {
        const text = Array.isArray(row) ? `${row[0]}     ${row[1]}` : String(row);
        ctx.fillStyle = Array.isArray(row) ? T.colors.inkSoft : T.colors.muted;
        ctx.fillText(text, 46, y);
        y += 34;
    }

    return texture(c);
}
