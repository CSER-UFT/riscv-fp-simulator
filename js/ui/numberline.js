/**
 * Reta numérica: os vizinhos representáveis do valor exato x (mais um de cada lado), o ponto médio entre os
 * dois mais próximos e, abaixo de cada vizinho, os modos de arredondamento que o escolhem. Para números
 * negativos a reta é espelhada, para que a esquerda continue sendo o lado menor.
 */
import { t } from '../i18n/index.js';
import { esc } from './common.js';

const W = 680, PAD = 70;

export function numberLineHtml(nb, { xLabel = 'x' } = {}) {
    if (!nb) return '';
    const flip = nb.sign === 1 ? -1 : 1;
    const ps = nb.points.map((p) => ({ ...p, q: p.pos * flip }));
    const qs = ps.map((p) => p.q);
    let lo = Math.min(...qs), hi = Math.max(...qs);
    if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
    const span = hi - lo;
    const X = (q) => PAD + ((q - lo) / span) * (W - 2 * PAD);
    const y0 = 70;
    const most = nb.exact ? 0 : Math.max(0, ...ps.map((p) => p.modes.length));
    const H = y0 + 44 + most * 17;
    let svg = `<line class="nl-axis" x1="${PAD - 30}" x2="${W - PAD + 30}" y1="${y0}" y2="${y0}"/>`;
    for (const p of ps) {
        const xx = X(p.q);
        const near = p.role !== 'outer';
        svg += `<line class="nl-tick ${near ? 'near' : ''}" x1="${xx}" x2="${xx}" y1="${y0 - (near ? 14 : 9)}" y2="${y0 + (near ? 14 : 9)}"/>`;
        svg += `<text class="nl-val ${near ? 'near' : ''}" x="${xx}" y="${y0 - 22}" text-anchor="middle">${esc(p.short)}</text>`;
        svg += `<text class="nl-hex" x="${xx}" y="${y0 + 30}" text-anchor="middle">${esc(p.hex)}</text>`;
        // Valor exato: todos os modos coincidem (a nota abaixo diz isso); os distintivos só poluiriam.
        if (!nb.exact) p.modes.forEach((m, i) => {
            svg += `<g class="nl-mode"><rect x="${xx - 20}" y="${y0 + 38 + i * 17}" width="40" height="14" rx="3"/><text x="${xx}" y="${y0 + 49 + i * 17}" text-anchor="middle">${m.toUpperCase()}</text></g>`;
        });
    }
    if (nb.mid !== null) {
        const xm = X(0.5 * flip);
        svg += `<line class="nl-mid" x1="${xm}" x2="${xm}" y1="${y0 - 34}" y2="${y0 + 18}"/><text class="nl-midlabel" x="${xm}" y="${y0 - 38}" text-anchor="middle">${esc(t('ui.midpoint'))}</text>`;
    }
    // O valor exato; se estiver fora da escala (estouro), uma seta na borda.
    const qx = nb.x * flip;
    let xx = X(qx), out = false;
    if (xx > W - 12) { xx = W - 12; out = true; }
    if (xx < 12) { xx = 12; out = true; }
    svg += `<g class="nl-x"><path d="M${xx - 6},${y0 - 52} L${xx + 6},${y0 - 52} L${xx},${y0 - 43} Z"/><line x1="${xx}" x2="${xx}" y1="${y0 - 43}" y2="${y0}"/><text x="${xx}" y="${y0 - 56}" text-anchor="middle">${esc(out ? `${xLabel} →` : xLabel)}</text></g>`;
    const exactNote = nb.exact ? `<p class="note ok">${esc(t('ui.nlExact'))}</p>` : '';
    return `<div class="numberline"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('ui.numberLine'))}">${svg}</svg>${exactNote}</div>`;
}
