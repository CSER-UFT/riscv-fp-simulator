/**
 * Vista de ponto fixo (Qm.n): conversão e as quatro operações com a conta inteira passo a passo, estouro com
 * saturação ou volta, e a comparação com os formatos de ponto flutuante do mesmo tamanho.
 */
import { t } from '../i18n/index.js';
import { analyzeFixed } from '../app/fixed.js';
import { fixedLatex } from '../app/latex.js';
import { fixedStepText } from '../app/text.js';
import { esc, md, tm, options, modeOptions, flagsHtml, fmtName } from './common.js';
import { lineChart, bindCharts } from './chart.js';

export const defaults = () => ({ m: 3, n: 4, signed: true, overflow: 'sat', mode: 'rne', op: 'conv', a: '0.1', b: '2.25' });

const OPS = ['conv', 'add', 'sub', 'mul', 'div'];

const PRESETS = [
    { m: 3, n: 4, signed: true, op: 'conv', a: '0.1', key: 'fx.ex.q34' },
    { m: 0, n: 15, signed: true, op: 'conv', a: '0.1', key: 'fx.ex.q15' },
    { m: 7, n: 8, signed: true, op: 'mul', a: '1.5', b: '0.1', key: 'fx.ex.mul' },
    { m: 3, n: 4, signed: true, op: 'add', a: '6', b: '3', overflow: 'sat', key: 'fx.ex.sat' },
    { m: 3, n: 4, signed: true, op: 'add', a: '6', b: '3', overflow: 'wrap', key: 'fx.ex.wrap' },
    { m: 7, n: 8, signed: true, op: 'div', a: '1', b: '3', key: 'fx.ex.div' },
    { m: 8, n: 8, signed: false, op: 'conv', a: '200.7', key: 'fx.ex.uq' },
];

/** Bits do ponto fixo coloridos: sinal, parte inteira e fração, com o ponto binário marcado. */
function fxBitsHtml(fx, bin) {
    const cell = (ch, cls, first) => `<span class="bit ${cls} ${ch === '1' ? 'one' : ''} ${first ? 'first' : ''}">${ch}</span>`;
    const parts = [];
    if (bin.sign) parts.push(cell(bin.sign, 'sign', true));
    [...bin.int].forEach((c, i) => parts.push(cell(c, 'int', i === 0)));
    if (fx.n) parts.push('<span class="fx-point">.</span>');
    [...bin.frac].forEach((c) => parts.push(cell(c, 'frac', false)));
    return `<div class="bits ${fx.bits > 32 ? 'wide' : ''}">${parts.join('')}</div>`;
}

export function render(el, st, ctx) {
    el.innerHTML = `
        <section class="card form">
            <div class="row">
                <label class="field check"><input type="checkbox" id="fx-signed" ${st.signed ? 'checked' : ''}/>${esc(t('fx.signed'))}</label>
                <label class="field"><span>${esc(t('fx.m'))}</span><input id="fx-m" type="number" min="0" max="63" value="${st.m}"/></label>
                <label class="field"><span>${esc(t('fx.n'))}</span><input id="fx-n" type="number" min="0" max="63" value="${st.n}"/></label>
                <label class="field"><span>${esc(t('fx.overflow'))}</span><select id="fx-of">${options([['sat', t('fx.of.sat')], ['wrap', t('fx.of.wrap')]], st.overflow)}</select></label>
                <label class="field"><span>${esc(t('ui.mode'))}</span><select id="fx-mode">${modeOptions(st.mode)}</select></label>
            </div>
            <div class="row">
                <label class="field"><span>${esc(t('ui.operation'))}</span><select id="fx-op">${options(OPS.map((o) => [o, t(`fx.op.${o}`)]), st.op)}</select></label>
                <label class="field grow"><span>a</span><input id="fx-a" value="${esc(st.a)}" spellcheck="false" autocomplete="off"/></label>
                <label class="field grow ${st.op === 'conv' ? 'hidden' : ''}"><span>b</span><input id="fx-b" value="${esc(st.b)}" spellcheck="false" autocomplete="off"/></label>
            </div>
            <p class="hint">${tm('fx.hint')} ${PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${esc(t(p.key))}</button>`).join('')}</p>
        </section>
        <div id="fx-out"></div>`;
    const $ = (s) => el.querySelector(s);
    const out = $('#fx-out');
    const draw = () => { out.innerHTML = output(st); bindCharts(out); };
    const num = (id, key) => $(id).addEventListener('input', (e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 0) { st[key] = v; ctx.save(); draw(); } });
    num('#fx-m', 'm');
    num('#fx-n', 'n');
    $('#fx-signed').addEventListener('change', (e) => { st.signed = e.target.checked; ctx.save(); draw(); });
    $('#fx-of').addEventListener('change', (e) => { st.overflow = e.target.value; ctx.save(); draw(); });
    $('#fx-mode').addEventListener('change', (e) => { st.mode = e.target.value; ctx.save(); draw(); });
    $('#fx-op').addEventListener('change', (e) => { st.op = e.target.value; ctx.save(); render(el, st, ctx); });
    $('#fx-a').addEventListener('input', (e) => { st.a = e.target.value; ctx.save(); draw(); });
    $('#fx-b').addEventListener('input', (e) => { st.b = e.target.value; ctx.save(); draw(); });
    for (const b of el.querySelectorAll('[data-preset]')) b.addEventListener('click', () => {
        const p = PRESETS[Number(b.dataset.preset)];
        Object.assign(st, { overflow: 'sat', b: st.b }, p);
        delete st.key;
        ctx.save();
        render(el, st, ctx);
    });
    draw();
}

const errCell = (e) => (e ? (e.exact ? `<span class="ok">${esc(t('ui.exact'))}</span>` : esc(e.rel)) : '-');

function output(st) {
    const r = analyzeFixed(st);
    if (r.error === 'format') return `<section class="card"><p class="note warn">${tm('fx.badFormat')}</p></section>`;
    if (r.error) return `<section class="card"><p class="note warn">${tm('fx.invalid')}</p></section>`;
    const fx = r.fx;
    const opRow = (label, o) => `<tr><th>${label}</th><td class="mono">${esc(o.text)}</td><td>${fxBitsHtml(fx, o.bin)}</td><td><code>${esc(o.hex)}</code></td><td class="num">${esc(o.raw.toString())}</td><td class="num">${esc(o.value)}</td><td class="num">${errCell(o.err)}</td><td>${flagsHtml(o.flags, { all: false })}</td></tr>`;
    const head = `<tr><th></th><th>${esc(t('ui.typed'))}</th><th>${esc(t('ui.bits'))}</th><th>${esc(t('ui.hex'))}</th><th>${esc(t('fx.raw'))}</th><th>${esc(t('ui.storedValue'))}</th><th>${esc(t('ui.relErr'))}</th><th>${esc(t('ui.flags'))}</th></tr>`;
    const operands = [opRow('a', r.A), r.B ? opRow('b', r.B) : ''].join('');
    let opCards = '';
    if (r.result) {
        const steps = r.result.steps.map((s) => `<li>${md(fixedStepText(s, fx))}</li>`).join('');
        opCards = `<section class="card span2"><h2>${esc(t('fx.steps'))} <span class="sub">${esc(t('fx.stepsSub', { n: fx.n }))}</span></h2>
            <ol class="steps">${steps}</ol></section>
            <section class="card span2"><h2>${esc(t('ops.result'))}</h2>
            ${fxBitsHtml(fx, r.result.bin)}
            <table class="kv">
                <tr><th>${esc(t('ui.hex'))}</th><td><code>${esc(r.result.hex)}</code> = <b>${esc(r.result.value)}</b> <span class="sub">(${esc(t('fx.rawIs', { v: r.result.raw.toString(), n: fx.n }))})</span></td></tr>
                <tr><th>${esc(t('fx.ideal'))}</th><td class="mono">${r.idealText ? `${esc(r.idealText.text)}${r.idealText.exact ? '' : '…'}` : '-'}</td></tr>
                <tr><th>${esc(t('ui.relErr'))}</th><td class="mono">${errCell(r.result.err)}</td></tr>
                <tr><th>${esc(t('ui.flags'))}</th><td>${flagsHtml(r.result.flags)}</td></tr>
            </table></section>`;
    }
    const floats = r.floats.length
        ? `<table class="data"><tr><th>${esc(t('ui.format'))}</th><th>a</th><th>${esc(t('ui.relErr'))}</th>${r.result ? `<th>${esc(t('ops.result'))}</th><th>${esc(t('ui.relErr'))}</th>` : ''}</tr>
            <tr class="cur"><th>${esc(fx.name)}</th><td class="num">${esc(r.A.value)}</td><td class="num">${errCell(r.A.err)}</td>${r.result ? `<td class="num">${esc(r.result.value)}</td><td class="num">${errCell(r.result.err)}</td>` : ''}</tr>
            ${r.floats.map((f) => `<tr><th>${esc(fmtName(f.fmt))}</th><td class="num">${esc(f.a.text)}</td><td class="num">${errCell(f.a.err)}</td>${f.result ? `<td class="num">${esc(f.result.text)}</td><td class="num">${errCell(f.result.err)}</td>` : ''}</tr>`).join('')}</table>
            <p class="hint">${tm('fx.compareHint')}</p>`
        : `<p class="note">${esc(t('fx.noSameWidth', { bits: fx.bits }))}</p>`;
    const series = [[fx.name, r.sweep.map((s, i) => [i, s.fixed.err.exact ? 0 : relNum(s.fixed.err)])]];
    r.floats.forEach((f, k) => series.push([fmtName(f.fmt), r.sweep.map((s, i) => [i, s.floats[k].err && !s.floats[k].err.exact ? s.floats[k].err.relNum : 0])]));
    const chart = r.sweep.length > 2 ? lineChart({ series, xLabel: t('fx.sweepX'), yLabel: t('ui.relErr') }) : '';
    const sweepRows = r.sweep.map((s) => `<tr><th class="mono">${esc(s.text)}</th><td class="num">${esc(s.fixed.value)}</td><td class="num">${errCell(s.fixed.err)}</td>${s.floats.map((f) => `<td class="num">${esc(f.text)}</td><td class="num">${errCell(f.err)}</td>`).join('')}</tr>`).join('');
    return `<div class="grid2">
        <section class="card span2"><h2>${esc(fx.name)} <span class="sub">${esc(t('fx.formatSub', { bits: fx.bits, n: fx.n }))}</span></h2>
            <table class="kv">
                <tr><th>${esc(t('fx.range'))}</th><td class="mono">${esc(r.range.min)} … ${esc(r.range.max)}</td></tr>
                <tr><th>${esc(t('fx.step'))}</th><td class="mono">2^−${fx.n} = ${esc(r.range.step)}</td></tr>
                <tr><th>${esc(t('fx.count'))}</th><td class="mono">${esc(r.range.count)}</td></tr>
            </table>
            <p class="hint">${tm('fx.formatNote', { name: fx.name, m: fx.m, n: fx.n })}</p>
        </section>
        <section class="card span2"><h2>${esc(t('ops.operands'))}</h2><div class="scroll"><table class="data fxops">${head}${operands}</table></div>
            <div class="bit-legend">${fx.signed ? `<span class="sign">${esc(t('ui.sign'))}</span>` : ''}<span class="int">${esc(t('fx.intPart', { m: fx.m }))}</span><span class="frac">${esc(t('ui.fraction'))} (${fx.n})</span></div></section>
        ${opCards}
        <section class="card span2"><h2>${esc(t('fx.compareTitle'))} <span class="sub">${esc(t('fx.compareSub', { bits: fx.bits }))}</span></h2>${floats}</section>
        <section class="card span2"><h2>${esc(t('fx.sweepTitle'))} <span class="sub">${esc(t('fx.sweepSub'))}</span></h2>
            ${chart}
            <div class="scroll"><table class="data"><tr><th>${esc(t('ui.value'))}</th><th>${esc(fx.name)}</th><th>${esc(t('ui.relErr'))}</th>${r.floats.map((f) => `<th>${esc(fmtName(f.fmt))}</th><th>${esc(t('ui.relErr'))}</th>`).join('')}</tr>${sweepRows}</table></div>
            <p class="hint">${tm('fx.sweepHint')}</p></section>
    </div>`;
}

/** Erro relativo numérico a partir do texto em notação científica. */
const relNum = (e) => (e.rel === '∞' ? Infinity : Number(e.rel));

export function latex(st) {
    const r = analyzeFixed(st);
    if (r.error) return [];
    return [{ id: 'fx', label: t('tex.fx'), file: 'ponto-fixo.tex', text: fixedLatex(r) }];
}
