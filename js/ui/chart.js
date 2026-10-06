/**
 * Gráficos dos experimentos em SVG: linhas com eixo y logarítmico (erro relativo ao longo das iterações) e
 * barras com eixo logarítmico (erro por formato). Cores por papel (--series-1, --series-2), legenda
 * sempre presente com duas séries, cruz de leitura com dica nas linhas e dica por barra. Os valores
 * também estão na tabela do experimento. Erro zero não aparece em escala logarítmica: o ponto fica de fora.
 */
import { esc, num } from './common.js';

const W = 640, H = 260;
const M = { l: 58, r: 16, t: 14, b: 34 };

const log10 = (x) => Math.log10(x);

function yRange(values) {
    const pos = values.filter((v) => v > 0 && Number.isFinite(v));
    if (!pos.length) return null;
    let lo = Math.floor(log10(Math.min(...pos)));
    let hi = Math.ceil(log10(Math.max(...pos)));
    if (hi === lo) hi = lo + 1;
    return [lo, hi];
}

function yAxis(lo, hi) {
    const ih = H - M.t - M.b;
    const y = (v) => M.t + ih - ((log10(v) - lo) / (hi - lo)) * ih;
    const step = Math.max(1, Math.ceil((hi - lo) / 6));
    let out = '';
    for (let k = lo; k <= hi; k += step) {
        const yy = M.t + ih - ((k - lo) / (hi - lo)) * ih;
        out += `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${yy}" y2="${yy}"/><text class="tick" x="${M.l - 6}" y="${yy + 4}" text-anchor="end">1e${k}</text>`;
    }
    return { y, svg: out };
}

/**
 * @param {{series: [string, [number, number][]][], xLabel: string, yLabel: string}} spec rótulos já traduzidos
 */
/**
 * Reduz uma série a no máximo `max` pontos, com o maior valor de cada intervalo (a envoltória do erro):
 * séries que oscilam a cada iteração ficam legíveis, e o pior caso continua visível.
 */
export function envelope(pts, max = 150) {
    if (pts.length <= max) return pts;
    const size = Math.ceil(pts.length / max);
    const out = [];
    for (let i = 0; i < pts.length; i += size) {
        const chunk = pts.slice(i, i + size);
        const finite = chunk.filter((p) => Number.isFinite(p[1]));
        const y = finite.length ? Math.max(...finite.map((p) => p[1])) : NaN;
        out.push([chunk.at(-1)[0], y]);
    }
    return out;
}

export function lineChart(spec0) {
    const reduced = spec0.series.some(([, pts]) => pts.length > 150);
    const spec = { ...spec0, series: spec0.series.map(([n, pts]) => [n, envelope(pts)]) };
    const all = spec.series.flatMap(([, pts]) => pts.map((p) => p[1]));
    const yr = yRange(all);
    if (!yr) return '';
    // Faixa do eixo x pela série original (a reduzida começa no fim do primeiro intervalo).
    const xs = spec0.series.flatMap(([, pts]) => pts.map((p) => p[0]));
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const iw = W - M.l - M.r;
    const x = (v) => M.l + (x1 === x0 ? 0 : ((v - x0) / (x1 - x0)) * iw);
    const { y, svg: grid } = yAxis(yr[0], yr[1]);
    const paths = spec.series.map(([, pts], i) => {
        let d = '', pen = false;
        for (const [px, py] of pts) {
            if (!(py > 0) || !Number.isFinite(py)) { pen = false; continue; }
            d += `${pen ? 'L' : 'M'}${x(px).toFixed(1)},${y(py).toFixed(1)}`;
            pen = true;
        }
        return `<path class="series s${i + 1}" d="${d}"/>`;
    }).join('');
    const xt = [x0, Math.round((x0 + x1) / 2), x1].map((v) => `<text class="tick" x="${x(v)}" y="${H - M.b + 16}" text-anchor="middle">${v}</text>`).join('');
    const legend = spec.series.map(([name], i) => `<span class="lg"><i class="sw s${i + 1}"></i>${esc(name)}</span>`).join('');
    const data = esc(JSON.stringify({ x0, x1, l: M.l, iw, series: spec.series.map(([n, p]) => [n, p]) }));
    return `<figure class="chart line" data-chart="${data}">
        <div class="legend">${legend}${reduced && spec.envelopeNote ? `<span class="lg-note">${esc(spec.envelopeNote)}</span>` : ''}</div>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.yLabel)}">
            ${grid}
            <line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}"/>
            ${paths}${xt}
            <text class="label" x="${M.l + iw / 2}" y="${H - 4}" text-anchor="middle">${esc(spec.xLabel)}</text>
            <text class="label" transform="translate(12 ${M.t + (H - M.t - M.b) / 2}) rotate(-90)" text-anchor="middle">${esc(spec.yLabel)}</text>
            <line class="cross hidden" x1="0" x2="0" y1="${M.t}" y2="${H - M.b}"/>
            <rect class="hit" x="${M.l}" y="${M.t}" width="${iw}" height="${H - M.t - M.b}"/>
        </svg>
        <div class="tip hidden"></div>
    </figure>`;
}

/** Barras (uma série), eixo y logarítmico. bars: [rótulo, valor]. */
export function barChart(spec) {
    const yr = yRange(spec.bars.map((b) => b[1]));
    if (!yr) return '';
    const { y, svg: grid } = yAxis(yr[0], yr[1]);
    const iw = W - M.l - M.r;
    const n = spec.bars.length;
    const slot = iw / n;
    const bw = Math.min(56, slot * 0.6);
    const base = H - M.b;
    const bars = spec.bars.map(([name, v], i) => {
        const cx = M.l + slot * (i + 0.5);
        const label = `<text class="tick" x="${cx}" y="${base + 16}" text-anchor="middle">${esc(name)}</text>`;
        if (!(v > 0) || !Number.isFinite(v)) return label + `<text class="tick" x="${cx}" y="${base - 6}" text-anchor="middle">0</text>`;
        const top = Math.min(y(v), base - 2);
        const h = base - top;
        // Ponta arredondada só em cima: o retângulo de raio 4 é cortado na base por um retângulo reto.
        return `<g class="bar" tabindex="0" data-tip="${esc(`${name}: ${num(v, 3)}`)}"><path class="series s1" d="M${cx - bw / 2},${base} V${top + 4} Q${cx - bw / 2},${top} ${cx - bw / 2 + 4},${top} H${cx + bw / 2 - 4} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + 4} V${base} Z"/>
            <rect class="hit" x="${cx - slot / 2}" y="${M.t}" width="${slot}" height="${base - M.t}"/>
            <text class="val" x="${cx}" y="${top - 5}" text-anchor="middle">${esc(num(v, 2))}</text></g>${label}`;
    }).join('');
    return `<figure class="chart bars">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.yLabel)}">
            ${grid}<line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${base}" y2="${base}"/>${bars}
            <text class="label" transform="translate(12 ${M.t + (H - M.t - M.b) / 2}) rotate(-90)" text-anchor="middle">${esc(spec.yLabel)}</text>
        </svg>
        <div class="tip hidden"></div>
    </figure>`;
}

/** Liga a cruz de leitura e as dicas dos gráficos dentro de `root`. */
export function bindCharts(root) {
    for (const fig of root.querySelectorAll('figure.chart.line')) {
        const spec = JSON.parse(fig.dataset.chart);
        const svg = fig.querySelector('svg');
        const cross = svg.querySelector('.cross');
        const tip = fig.querySelector('.tip');
        const hit = svg.querySelector('.hit');
        const move = (ev) => {
            const r = svg.getBoundingClientRect();
            const sx = ((ev.clientX - r.left) / r.width) * W;
            const xv = spec.x0 + ((sx - spec.l) / spec.iw) * (spec.x1 - spec.x0);
            // Ponto mais próximo no eixo x (as séries têm os mesmos x).
            const pts = spec.series[0][1];
            let best = pts[0];
            for (const p of pts) if (Math.abs(p[0] - xv) < Math.abs(best[0] - xv)) best = p;
            const px = spec.l + ((best[0] - spec.x0) / (spec.x1 - spec.x0 || 1)) * spec.iw;
            cross.setAttribute('x1', px);
            cross.setAttribute('x2', px);
            cross.classList.remove('hidden');
            tip.replaceChildren();
            const head = document.createElement('div');
            head.className = 'tip-head';
            head.textContent = `k = ${best[0]}`;
            tip.append(head);
            spec.series.forEach(([name, ps], i) => {
                const p = ps.find((q) => q[0] === best[0]);
                const row = document.createElement('div');
                const sw = document.createElement('i');
                sw.className = `sw s${i + 1}`;
                const b = document.createElement('b');
                b.textContent = p ? num(p[1], 3) : '-';
                row.append(sw, b, document.createTextNode(` ${name}`));
                tip.append(row);
            });
            tip.classList.remove('hidden');
            const left = (px / W) * r.width;
            tip.style.left = `${Math.min(left + 12, r.width - tip.offsetWidth - 4)}px`;
            tip.style.top = '8px';
        };
        hit.addEventListener('pointermove', move);
        hit.addEventListener('pointerleave', () => { cross.classList.add('hidden'); tip.classList.add('hidden'); });
    }
    for (const fig of root.querySelectorAll('figure.chart.bars')) {
        const tip = fig.querySelector('.tip');
        const show = (g) => {
            tip.textContent = g.dataset.tip;
            tip.classList.remove('hidden');
            const r = fig.getBoundingClientRect(), b = g.getBoundingClientRect();
            tip.style.left = `${Math.max(4, b.left - r.left + b.width / 2 - tip.offsetWidth / 2)}px`;
            tip.style.top = '8px';
        };
        for (const g of fig.querySelectorAll('.bar')) {
            g.addEventListener('pointerenter', () => show(g));
            g.addEventListener('focus', () => show(g));
            g.addEventListener('pointerleave', () => tip.classList.add('hidden'));
            g.addEventListener('blur', () => tip.classList.add('hidden'));
        }
    }
}
