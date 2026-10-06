/**
 * Vista de experimentos: lista à esquerda, parâmetros, tabela de resultados, observações e gráfico.
 */
import { t } from '../i18n/index.js';
import { EXPERIMENTS, experimentById } from '../app/experiments.js';
import { experimentLatex } from '../app/latex.js';
import { esc, tm, cell, formatOptions, modeOptions } from './common.js';
import { lineChart, barChart, bindCharts } from './chart.js';

export const defaults = () => ({ id: 'sum', params: Object.fromEntries(EXPERIMENTS.map((e) => [e.id, { ...e.params }])) });

export function render(el, st, ctx) {
    const ex = experimentById(st.id);
    const p = (st.params[ex.id] ??= { ...ex.params });
    const list = EXPERIMENTS.map((e) => `<li><button type="button" class="exp-item ${e.id === ex.id ? 'cur' : ''}" data-exp="${e.id}"><b>${esc(t(`exp.${e.id}.title`))}</b><span>${esc(t(`exp.${e.id}.short`))}</span></button></li>`).join('');
    const field = (k) => {
        if (k === 'fmt') return `<label class="field"><span>${esc(t('ui.format'))}</span><select data-p="fmt">${formatOptions(p.fmt)}</select></label>`;
        if (k === 'mode') return `<label class="field"><span>${esc(t('ui.mode'))}</span><select data-p="mode">${modeOptions(p.mode)}</select></label>`;
        return `<label class="field"><span>${esc(t(`exp.param.${k}`))}</span><input data-p="${k}" value="${esc(p[k])}" spellcheck="false" autocomplete="off"/></label>`;
    };
    el.innerHTML = `
        <div class="exp-layout">
            <nav class="card exp-list"><ul>${list}</ul></nav>
            <div class="exp-main">
                <section class="card form">
                    <h2>${esc(t(`exp.${ex.id}.title`))}</h2>
                    <p class="lead">${tm(`exp.${ex.id}.desc`)}</p>
                    <div class="row">${ex.fields.map(field).join('')}<button type="button" class="btn small" id="exp-reset">${esc(t('exp.reset'))}</button></div>
                </section>
                <div id="exp-out"></div>
            </div>
        </div>`;
    const out = el.querySelector('#exp-out');
    const draw = () => { out.innerHTML = output(ex, p); bindCharts(out); };
    for (const b of el.querySelectorAll('[data-exp]')) b.addEventListener('click', () => { st.id = b.dataset.exp; ctx.save(); render(el, st, ctx); });
    for (const inp of el.querySelectorAll('[data-p]')) {
        const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
        inp.addEventListener(ev, () => { p[inp.dataset.p] = inp.value; ctx.save(); draw(); });
    }
    el.querySelector('#exp-reset').addEventListener('click', () => { st.params[ex.id] = { ...ex.params }; ctx.save(); render(el, st, ctx); });
    draw();
}

function output(ex, p) {
    const r = ex.run(p);
    if (r.error) return `<section class="card"><p class="note warn">${tm('exp.invalid')}</p></section>`;
    const head = r.head.map((h) => `<th>${esc(t(h))}</th>`).join('');
    const rows = r.rows.map((row) => `<tr>${row.map((c, i) => (i === 0 ? `<th>${cell(c)}</th>` : `<td class="num">${cell(c)}</td>`)).join('')}</tr>`).join('');
    const notes = (r.notes ?? []).map(([k, params]) => `<p class="note">${tm(k, params)}</p>`).join('');
    let chart = '';
    if (r.chart?.kind === 'log') chart = lineChart({ series: r.chart.series.map(([k, pts]) => [t(k), pts]), xLabel: t(r.chart.x), yLabel: t(r.chart.y), envelopeNote: t('exp.envelope') });
    if (r.chart?.kind === 'bars') chart = barChart({ bars: r.chart.bars.map(([id, v]) => [t(`fmt.${id}`), v]), yLabel: t(r.chart.y) });
    return `
        ${notes ? `<section class="card">${notes}</section>` : ''}
        ${chart ? `<section class="card"><h2>${esc(t('exp.chart'))} <span class="sub">${esc(t('exp.chartSub'))}</span></h2>${chart}</section>` : ''}
        <section class="card"><h2>${esc(t('exp.table'))}</h2><div class="scroll"><table class="data">${`<tr>${head}</tr>`}${rows}</table></div></section>`;
}

export function latex(st) {
    const ex = experimentById(st.id);
    const r = ex.run(st.params[ex.id] ?? ex.params);
    if (r.error) return [];
    return [{ id: 'exp', label: t('tex.exp'), file: `experimento-${ex.id}.tex`, text: experimentLatex(t(`exp.${ex.id}.title`), r) }];
}
