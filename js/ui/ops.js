/**
 * Vista de operações: fadd, fsub, fmul, fdiv, fsqrt e fmadd em qualquer formato e modo, com os passos do
 * hardware (alinhamento, guard, round e sticky, normalização, arredondamento), o resultado exato, o erro e
 * os cinco modos lado a lado.
 */
import { t } from '../i18n/index.js';
import { analyzeOperation } from '../app/analysis.js';
import { operationLatex } from '../app/latex.js';
import { stepText, specialText, regLabel } from '../app/text.js';
import { exactValueText } from '../fp/decimal.js';
import { getFormat } from '../fp/formats.js';
import { ARITY } from '../fp/core.js';
import * as core from '../fp/core.js';
import { esc, md, tm, formatOptions, modeOptions, flagsHtml, bitsHtml, regHtml, options, fmtName, modeName } from './common.js';
import { numberLineHtml } from './numberline.js';
import { explainHtml } from './explain.js';

export const OPS = ['add', 'sub', 'mul', 'div', 'sqrt', 'fma'];

export const defaults = () => ({ fmt: 'single', op: 'add', mode: 'rne', a: '0.1', b: '0.2', c: '1', sat: false, hex: false });

const PRESETS = [
    { op: 'add', a: '0.1', b: '0.2', key: 'ops.ex.point3' },
    { op: 'add', a: '1', b: '2^-24', key: 'ops.ex.tie' },
    { op: 'add', a: '1', b: '2^-27', key: 'ops.ex.sticky' },
    { op: 'sub', a: '1.0000001', b: '1', key: 'ops.ex.cancel' },
    { op: 'mul', a: '3.4e38', b: '2', key: 'ops.ex.overflow' },
    { op: 'mul', a: '1e-30', b: '1e-15', key: 'ops.ex.underflow' },
    { op: 'div', a: '1', b: '3', key: 'ops.ex.third' },
    { op: 'div', a: '1', b: '0', key: 'ops.ex.dz' },
    { op: 'sub', a: 'inf', b: 'inf', key: 'ops.ex.invalid' },
    { op: 'sqrt', a: '2', key: 'ops.ex.sqrt2' },
    { op: 'fma', a: '1.000244140625', b: '1.000244140625', c: '-1.00048828125', key: 'ops.ex.fma' },
];

/** Texto do operando: valor, ou bits quando a opção hexadecimal está ligada. */
function operandText(st, s) {
    if (!st.hex) return s;
    const f = getFormat(st.fmt);
    const v = String(s).trim().toLowerCase().replace(/^0x/, '').replace(/[\s_]/g, '');
    if (!/^[0-9a-f]+$/.test(v)) return '?';
    const bits = BigInt(`0x${v}`) & f.mask;
    const d = core.decode(f, bits);
    if (d.cls === 'nan') return 'nan';
    if (d.cls === 'inf') return d.sign ? '-inf' : 'inf';
    return exactValueText(st.fmt, bits);
}

export function analyze(st) {
    const texts = [st.a, st.b, st.c].map((s) => operandText(st, s));
    return analyzeOperation(st.op, st.fmt, texts, st.mode, { sat: st.sat });
}

export function render(el, st, ctx) {
    const f = getFormat(st.fmt);
    const n = ARITY[st.op];
    const field = (k, label) => `<label class="field grow ${'abc'.indexOf(k) < n ? '' : 'hidden'}"><span>${label}</span><input id="op-${k}" value="${esc(st[k])}" spellcheck="false" autocomplete="off"/></label>`;
    el.innerHTML = `
        <section class="card form">
            <div class="row">
                <label class="field"><span>${esc(t('ui.operation'))}</span><select id="op-op">${options(OPS.map((o) => [o, t(`op.${o}`)]), st.op)}</select></label>
                ${field('a', 'a')}${field('b', 'b')}${field('c', 'c')}
            </div>
            <div class="row">
                <label class="field"><span>${esc(t('ui.format'))}</span><select id="op-fmt">${formatOptions(st.fmt)}</select></label>
                <label class="field"><span>${esc(t('ui.mode'))}</span><select id="op-mode">${modeOptions(st.mode)}</select></label>
                <label class="field check"><input type="checkbox" id="op-hex" ${st.hex ? 'checked' : ''}/>${esc(t('ops.hexInput'))}</label>
                <label class="field check ${f.bits === 8 ? '' : 'hidden'}"><input type="checkbox" id="op-sat" ${st.sat ? 'checked' : ''}/>${esc(t('ui.sat'))}</label>
            </div>
            <p class="hint">${tm('ops.hint')} ${PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${esc(t(p.key))}</button>`).join('')}</p>
        </section>
        <div id="op-out"></div>`;
    const $ = (id) => el.querySelector(id);
    const out = $('#op-out');
    const draw = () => { out.innerHTML = output(st); };
    for (const k of ['a', 'b', 'c']) $(`#op-${k}`).addEventListener('input', (e) => { st[k] = e.target.value; ctx.save(); draw(); });
    $('#op-op').addEventListener('change', (e) => { st.op = e.target.value; ctx.save(); render(el, st, ctx); });
    $('#op-fmt').addEventListener('change', (e) => { st.fmt = e.target.value; ctx.save(); render(el, st, ctx); });
    $('#op-mode').addEventListener('change', (e) => { st.mode = e.target.value; ctx.save(); draw(); });
    $('#op-sat').addEventListener('change', (e) => { st.sat = e.target.checked; ctx.save(); draw(); });
    $('#op-hex').addEventListener('change', (e) => {
        // Ao trocar a forma de entrada, converte os operandos atuais para a outra forma.
        const a = analyze(st);
        st.hex = e.target.checked;
        if (!a.error) a.ops.forEach((o, i) => { st['abc'[i]] = st.hex ? o.hex : o.exactText; });
        ctx.save();
        render(el, st, ctx);
    });
    for (const b of el.querySelectorAll('[data-preset]')) b.addEventListener('click', () => {
        const p = PRESETS[Number(b.dataset.preset)];
        Object.assign(st, { op: p.op, a: p.a, b: p.b ?? st.b, c: p.c ?? st.c, hex: false });
        ctx.save();
        render(el, st, ctx);
    });
    draw();
}

const errCell = (e) => (e ? (e.exact ? `<span class="ok">${esc(t('ui.exact'))}</span>` : esc(e.rel)) : '-');

function output(st) {
    const o = analyze(st);
    if (o.error) return `<section class="card"><p class="note warn">${tm('ops.invalid')}</p></section>`;
    const f = o.fmt;
    const tr = o.trace;
    const operands = o.ops.map((x, i) => `<tr><th>${'abc'[i]}</th><td class="mono">${esc(x.text)}</td><td><code>${esc(x.hex)}</code></td><td class="mono wrap">${esc(x.exactText.length > 60 ? `${x.exactText.slice(0, 60)}…` : x.exactText)}</td><td>${(x.flags & core.FLAG.NX) ? `<span class="warn">${esc(t('ops.inexactOperand'))}</span>` : `<span class="ok">${esc(t('ui.exact'))}</span>`}</td></tr>`).join('');
    const steps = tr.special
        ? `<p class="note">${md(specialText(tr))}</p>`
        : `<ol class="steps">${tr.steps.map((s) => `<li><div class="st-text">${md(stepText(s, tr))}</div>${(s.regs ?? []).length ? `<table class="regs">${s.regs.map((r) => `<tr><th>${esc(regLabel(r))}</th><td class="s">${r.sign === null ? '' : r.sign ? '−' : '+'}</td><td>${regHtml(r)}</td><td class="e">${r.exp === null ? '' : `× 2<sup>${r.exp}</sup>`}</td></tr>`).join('')}</table>` : ''}</li>`).join('')}</ol>`;
    const modes = o.modes.map((m) => `<tr class="${m.mode === st.mode ? 'cur' : ''}"><th>${m.mode.toUpperCase()}</th><td class="sub">${esc(modeName(m.mode))}</td><td><code>${esc(m.hex)}</code></td><td class="num">${esc(m.short)}</td><td class="num">${errCell(m.err)}</td><td>${flagsHtml(m.flags, { all: false })}</td></tr>`).join('');
    const exact = o.exactText
        ? `${esc(o.exactText.text)}${o.exactText.exact ? '' : '…'}`
        : (o.sqrtInexact ? esc(t('ops.irrational')) : '-');
    const unfused = o.unfused ? `<section class="card span2"><h2>${esc(t('ops.unfusedTitle'))}</h2>
        <table class="data"><tr><th></th><th>${esc(t('ui.bits'))}</th><th>${esc(t('ui.value'))}</th><th>${esc(t('ui.relErr'))}</th><th>${esc(t('ui.flags'))}</th></tr>
        <tr><th>fmadd</th><td><code>${esc(o.hex)}</code></td><td class="num">${esc(o.short)}</td><td class="num">${errCell(o.err)}</td><td>${flagsHtml(o.flags, { all: false })}</td></tr>
        <tr><th>fmul</th><td><code>${esc(o.unfused.product.hex)}</code></td><td class="num">${esc(o.unfused.product.short)}</td><td></td><td>${flagsHtml(o.unfused.productFlags, { all: false })}</td></tr>
        <tr><th>fmul + fadd</th><td><code>${esc(o.unfused.hex)}</code></td><td class="num">${esc(o.unfused.short)}</td><td class="num">${errCell(o.unfused.err)}</td><td>${flagsHtml(o.unfused.flags, { all: false })}</td></tr></table>
        <p class="hint">${tm(o.unfused.bits === o.bits ? 'ops.fmaSame' : 'ops.fmaDiff')}</p></section>` : '';
    return `
        <div class="grid2">
            <section class="card span2">
                <h2>${esc(t('ops.operands'))} <span class="sub">${o.instruction ? `<code>${esc(o.instruction)}</code>` : esc(t('ops.noInstruction', { fmt: fmtName(f.id) }))}</span></h2>
                <table class="data"><tr><th></th><th>${esc(t('ui.typed'))}</th><th>${esc(t('ui.bits'))}</th><th>${esc(t('ui.storedValue'))}</th><th></th></tr>${operands}</table>
            </section>
            <section class="card span2">
                <h2>${esc(t('ops.steps'))} <span class="sub">${esc(t('ops.stepsSub'))}</span></h2>
                ${steps}
            </section>
            <section class="card span2">
                <h2>${esc(t('ops.result'))}</h2>
                ${bitsHtml(f.id, o.bits)}
                <table class="kv">
                    <tr><th>${esc(t('ui.hex'))}</th><td><code>${esc(o.hex)}</code> = <b>${esc(o.short)}</b></td></tr>
                    <tr><th>${esc(t('ops.exactResult'))}</th><td class="mono wrap">${exact}</td></tr>
                    <tr><th>${esc(t('ui.storedValue'))}</th><td class="mono wrap">${esc(o.exactText ? exactValueText(f.id, o.bits) : o.short)}</td></tr>
                    <tr><th>${esc(t('ui.relErr'))}</th><td class="mono">${o.err ? esc(o.err.rel) : '-'} ${o.err ? `<span class="sub">(${esc(o.err.ulps)} ULP)</span>` : ''}</td></tr>
                    <tr><th>${esc(t('ui.flags'))}</th><td>${flagsHtml(o.flags)}</td></tr>
                </table>
            </section>
            ${o.neighbors ? `<section class="card span2"><h2>${esc(t('ui.numberLine'))} <span class="sub">${esc(t('ops.nlSub'))}</span></h2>${numberLineHtml(o.neighbors, { xLabel: t('ops.exactShort') })}</section>` : ''}
            ${o.explain ? explainHtml(o.explain, st.mode) : ''}
            <section class="card span2">
                <h2>${esc(t('conv.modesTitle'))}</h2>
                <div class="scroll"><table class="data"><tr><th>${esc(t('ui.mode'))}</th><th></th><th>${esc(t('ui.bits'))}</th><th>${esc(t('ui.value'))}</th><th>${esc(t('ui.relErr'))}</th><th>${esc(t('ui.flags'))}</th></tr>${modes}</table></div>
            </section>
            ${unfused}
        </div>`;
}

export function latex(st) {
    const o = analyze(st);
    if (o.error) return [];
    return [{ id: 'op', label: t('tex.op'), file: 'operacao.tex', text: operationLatex(o) }];
}
