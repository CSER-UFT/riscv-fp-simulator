/**
 * Vista de conversão: um número em texto (ou bits clicáveis) convertido para um formato, com a anatomia
 * dos campos, o valor exato armazenado, o erro, a reta numérica, os cinco modos e todos os formatos.
 */
import { t } from '../i18n/index.js';
import { analyzeConversion } from '../app/analysis.js';
import { conversionLatex } from '../app/latex.js';
import { exactValueText, displayText } from '../fp/decimal.js';
import { getFormat } from '../fp/formats.js';
import * as core from '../fp/core.js';
import { esc, tm, md, formatOptions, modeOptions, flagsHtml, bitsHtml, fmtName, modeName } from './common.js';
import { numberLineHtml } from './numberline.js';
import { explainHtml } from './explain.js';

export const defaults = () => ({ fmt: 'single', mode: 'rne', text: '0.1', sat: false });

const EXAMPLES = ['0.1', '1/3', '-12.375', '16777217', '1e39', '1e-45', '2^-149', '0x1.8p3', '448', '-0', 'inf', 'nan'];

export function render(el, st, ctx) {
    const f = getFormat(st.fmt);
    el.innerHTML = `
        <section class="card form">
            <div class="row">
                <label class="field grow"><span>${esc(t('conv.value'))}</span><input id="cv-text" value="${esc(st.text)}" spellcheck="false" autocomplete="off"/></label>
                <label class="field"><span>${esc(t('ui.format'))}</span><select id="cv-fmt">${formatOptions(st.fmt)}</select></label>
                <label class="field"><span>${esc(t('ui.mode'))}</span><select id="cv-mode">${modeOptions(st.mode)}</select></label>
                <label class="field check ${f.bits === 8 ? '' : 'hidden'}"><input type="checkbox" id="cv-sat" ${st.sat ? 'checked' : ''}/>${esc(t('ui.sat'))}</label>
            </div>
            <p class="hint">${tm('conv.hint')} ${EXAMPLES.map((x) => `<button type="button" class="chip" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</p>
        </section>
        <div id="cv-out"></div>`;
    const $ = (id) => el.querySelector(id);
    const out = $('#cv-out');
    const draw = () => { out.innerHTML = output(st); bindOutput(out, st, ctx, draw); };
    $('#cv-text').addEventListener('input', (e) => { st.text = e.target.value; ctx.save(); draw(); });
    $('#cv-fmt').addEventListener('change', (e) => { st.fmt = e.target.value; ctx.save(); render(el, st, ctx); });
    $('#cv-mode').addEventListener('change', (e) => { st.mode = e.target.value; ctx.save(); draw(); });
    $('#cv-sat').addEventListener('change', (e) => { st.sat = e.target.checked; ctx.save(); draw(); });
    for (const b of el.querySelectorAll('[data-ex]')) b.addEventListener('click', () => { st.text = b.dataset.ex; $('#cv-text').value = st.text; ctx.save(); draw(); });
    draw();
}

function bindOutput(out, st, ctx, draw) {
    // Clicar em um bit inverte o bit e escreve o valor exato correspondente no campo de entrada.
    for (const b of out.querySelectorAll('.bits button.bit')) {
        b.addEventListener('click', () => {
            const a = analyzeConversion(st.fmt, st.text, st.mode, { sat: st.sat });
            const bits = (a ? a.bits : 0n) ^ (1n << BigInt(b.dataset.bit));
            st.text = bitsToText(st.fmt, bits);
            document.getElementById('cv-text').value = st.text;
            ctx.save();
            draw();
        });
    }
    const hexIn = out.querySelector('#cv-hex');
    hexIn?.addEventListener('change', () => {
        const f = getFormat(st.fmt);
        const v = hexIn.value.trim().toLowerCase().replace(/^0x/, '').replace(/[\s_]/g, '');
        if (!/^[0-9a-f]+$/.test(v)) { hexIn.classList.add('bad'); return; }
        const bits = BigInt(`0x${v}`) & f.mask;
        st.text = bitsToText(st.fmt, bits);
        document.getElementById('cv-text').value = st.text;
        ctx.save();
        draw();
    });
    for (const a of out.querySelectorAll('[data-goto-fmt]')) a.addEventListener('click', () => {
        st.fmt = a.dataset.gotoFmt;
        ctx.save();
        ctx.rerender();
    });
}

/** Texto que representa exatamente um padrão de bits (para editar pelos bits). */
function bitsToText(fmtId, bits) {
    const v = core.decode(fmtId, bits);
    if (v.cls === 'nan') return 'nan';
    if (v.cls === 'inf') return v.sign ? '-inf' : 'inf';
    const exact = exactValueText(fmtId, bits);
    return exact.length <= 40 ? exact : `0x${v.sig.toString(16)}p${v.exp}`.replace(/^/, v.sign ? '-' : '');
}

const errRow = (e) => (e ? (e.exact ? `<span class="ok">${esc(t('ui.exact'))}</span>` : `${esc(e.rel)}`) : '-');

function output(st) {
    const a = analyzeConversion(st.fmt, st.text, st.mode, { sat: st.sat });
    if (!a) return `<section class="card"><p class="note warn">${tm('conv.invalid')}</p></section>`;
    const f = a.fmt;
    const fl = a.fields;
    const formula = formulaHtml(a);
    const exactFull = a.exactText.length > 90;
    const input = a.input
        ? (a.input.exact ? esc(a.input.text) : `${esc(a.inputFraction ?? '')} = ${esc(a.input.text)}…`)
        : esc(a.parsed.kind === 'inf' ? (a.parsed.sign ? '-∞' : '+∞') : 'NaN');
    const modes = a.modes.map((m) => `<tr class="${m.mode === st.mode ? 'cur' : ''}"><th>${m.mode.toUpperCase()}</th><td class="sub">${esc(modeName(m.mode))}</td><td><code>${esc(m.hex)}</code></td><td class="num">${esc(m.short)}</td><td class="num">${errRow(m.err)}</td><td>${flagsHtml(m.flags, { all: false })}</td></tr>`).join('');
    const formats = a.formats.map((m) => {
        const g = getFormat(m.fmt);
        return `<tr class="${m.fmt === st.fmt ? 'cur' : ''}"><th><button type="button" class="link" data-goto-fmt="${m.fmt}">${esc(fmtName(m.fmt))}</button></th><td class="num">${g.bits}</td><td class="num">${g.p}</td><td><code>${esc(m.hex)}</code></td><td class="num">${esc(m.short)}</td><td class="num">${errRow(m.err)}</td><td>${flagsHtml(m.flags, { all: false })}</td></tr>`;
    }).join('');
    const ints = a.ints.map((x) => `<tr><th><code>fcvt.${x.type}.${f.suffix ?? 's'}</code></th><td class="num">${esc(x.value.toString())}</td><td>${flagsHtml(x.flags, { all: false })}</td></tr>`).join('');
    const round = a.info && !a.info.exactZero && !a.info.overflow && a.info.inexact
        ? `<p class="note">${tm('conv.grs', { G: a.info.guard, R: a.info.round, S: a.info.sticky, up: t(a.info.up ? 'conv.up' : 'conv.down') })}</p>` : '';
    return `
        <div class="grid2">
            <section class="card span2">
                <h2>${esc(t('conv.bitsTitle'))} <span class="sub">${esc(fmtName(f.id))} · ${f.bits} bits · ${esc(t('conv.sub', { e: f.expBits, m: f.fracBits, bias: f.bias }))}</span></h2>
                ${bitsHtml(f.id, a.bits, { editable: true })}
                <div class="row hexrow"><label class="field"><span>${esc(t('ui.hex'))}</span><input id="cv-hex" value="${esc(a.hex)}" spellcheck="false"/></label>
                    <div class="result-big"><span class="dim">=</span> ${esc(a.short)}</div>
                    <div>${flagsHtml(a.flags)}</div></div>
                <p class="hint">${tm('conv.clickBits')}</p>
            </section>
            <section class="card">
                <h2>${esc(t('conv.fields'))}</h2>
                <table class="kv">
                    <tr><th>${esc(t('ui.class'))}</th><td>${esc(t(`cls.${fl.fclass}`))} <span class="sub">(fclass: bit ${core.fclass(f, a.bits)})</span></td></tr>
                    <tr><th>${esc(t('ui.sign'))}</th><td><code class="c-sign">${fl.sign}</code> ${esc(fl.sign ? t('conv.negative') : t('conv.positive'))}</td></tr>
                    <tr><th>${esc(t('ui.exponent'))}</th><td><code class="c-exp">${fl.expBits}</code> = ${fl.expField}</td></tr>
                    <tr><th>${esc(t('ui.realExp'))}</th><td>${fl.exp === null ? '-' : (fl.cls === 'normal' ? `${fl.expField} − ${fl.bias} = <b>${fl.exp}</b>` : tm('conv.subExp', { emin: fl.exp }))}</td></tr>
                    <tr><th>${esc(t('ui.fraction'))}</th><td><code class="c-frac">${fl.fracBits}</code></td></tr>
                    <tr><th>${esc(t('ui.significand'))}</th><td><code>${fl.cls === 'normal' ? '1' : '0'}.${fl.fracBits}</code>${fl.cls === 'normal' ? '' : ` <span class="sub">${esc(t('conv.noHidden'))}</span>`}</td></tr>
                </table>
                ${formula}
            </section>
            <section class="card">
                <h2>${esc(t('conv.valueTitle'))}</h2>
                <table class="kv">
                    <tr><th>${esc(t('ui.typed'))}</th><td class="mono wrap">${input}</td></tr>
                    <tr><th>${esc(t('ui.storedValue'))}</th><td class="mono wrap">${exactFull ? `<details><summary>${esc(a.exactText.slice(0, 60))}…</summary>${esc(a.exactText)}</details>` : esc(a.exactText)}</td></tr>
                    <tr><th>${esc(t('ui.shortest'))}</th><td class="mono">${esc(a.shortest)}</td></tr>
                    <tr><th>${esc(t('ui.absErr'))}</th><td class="mono">${a.err ? esc(a.err.abs) : '-'}</td></tr>
                    <tr><th>${esc(t('ui.relErr'))}</th><td class="mono">${a.err ? esc(a.err.rel) : '-'}</td></tr>
                    <tr><th>${esc(t('ui.ulpErr'))}</th><td class="mono">${a.err ? esc(a.err.ulps) : '-'}</td></tr>
                </table>
                ${round}
            </section>
            ${a.neighbors ? `<section class="card span2"><h2>${esc(t('ui.numberLine'))} <span class="sub">${esc(t('conv.nlSub'))}</span></h2>${numberLineHtml(a.neighbors)}</section>` : ''}
            ${a.explain ? explainHtml(a.explain, st.mode) : ''}
            <section class="card span2">
                <h2>${esc(t('conv.modesTitle'))}</h2>
                <div class="scroll"><table class="data"><tr><th>${esc(t('ui.mode'))}</th><th></th><th>${esc(t('ui.bits'))}</th><th>${esc(t('ui.value'))}</th><th>${esc(t('ui.relErr'))}</th><th>${esc(t('ui.flags'))}</th></tr>${modes}</table></div>
            </section>
            <section class="card span2">
                <h2>${esc(t('conv.formatsTitle'))} <span class="sub">${esc(t('conv.formatsSub', { mode: st.mode.toUpperCase() }))}</span></h2>
                <div class="scroll"><table class="data"><tr><th>${esc(t('ui.format'))}</th><th>${esc(t('ui.bits'))}</th><th>p</th><th>${esc(t('ui.hex'))}</th><th>${esc(t('ui.value'))}</th><th>${esc(t('ui.relErr'))}</th><th>${esc(t('ui.flags'))}</th></tr>${formats}</table></div>
                <p class="hint">${tm('conv.formatsHint')}</p>
            </section>
            <section class="card">
                <h2>${esc(t('conv.intTitle'))} <span class="sub">${esc(st.mode.toUpperCase())}</span></h2>
                <table class="data"><tr><th>${esc(t('conv.instr'))}</th><th>${esc(t('ui.value'))}</th><th>${esc(t('ui.flags'))}</th></tr>${ints}</table>
                <p class="hint">${tm('conv.intHint')}</p>
            </section>
            <section class="card">
                <h2>${esc(t('conv.limitsTitle'))}</h2>
                ${limitsHtml(f)}
            </section>
        </div>`;
}

function formulaHtml(a) {
    const fl = a.fields;
    if (fl.cls === 'nan') return `<p class="formula">${tm(fl.quiet ? 'conv.qnan' : 'conv.snan')}</p>`;
    if (fl.cls === 'inf') return `<p class="formula">${tm('conv.inf')}</p>`;
    if (fl.cls === 'zero') return `<p class="formula">${tm('conv.zero')}</p>`;
    const s = fl.sign ? '−' : '+';
    const lead = fl.cls === 'normal' ? '1' : '0';
    return `<p class="formula">(−1)<sup>${fl.sign}</sup> × ${lead}.${fl.fracBits.replace(/0+$/, '') || '0'}<sub>2</sub> × 2<sup>${fl.exp}</sup> = ${s}${esc(a.short.replace(/^-/, ''))}</p>`;
}

function limitsHtml(f) {
    const v = (bits) => displayText(f.id, bits);
    const rows = [
        ['conv.maxFinite', v(core.maxFinite(f, 0))],
        ['conv.minNormal', `2^${f.emin} ≈ ${v(core.encode(f, 0, 1, 0n))}`],
        ['conv.minSub', `2^${f.emin - f.fracBits} ≈ ${v(1n)}`],
        ['conv.epsilon', `2^-${f.fracBits} = ${v(core.encode(f, 0, f.bias - f.fracBits, 0n))}`],
        ['conv.precision', `${f.p} bits ≈ ${(f.p * Math.log10(2)).toFixed(1)} ${t('conv.digits')}`],
        ['conv.expRange', `${f.emin} … ${f.emax}`],
    ];
    return `<table class="kv">${rows.map(([k, x]) => `<tr><th>${esc(t(k))}</th><td class="mono">${esc(x)}</td></tr>`).join('')}</table>
        ${f.hasInf ? '' : `<p class="hint">${tm('conv.e4m3Note')}</p>`}`;
}

export function latex(st) {
    const a = analyzeConversion(st.fmt, st.text, st.mode, { sat: st.sat });
    if (!a) return [];
    return [{ id: 'conv', label: t('tex.conv'), file: 'conversao.tex', text: conversionLatex(a) }];
}

export { md };
