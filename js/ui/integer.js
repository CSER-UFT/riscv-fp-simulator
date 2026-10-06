/**
 * Vista de aritmética inteira: soma e subtração em complemento de 2, multiplicação (primeira versão,
 * refinada e Booth) e divisão (primeira versão, refinada e sem restauração), com a tabela de passos no
 * formato do Patterson e Hennessy.
 */
import { t } from '../i18n/index.js';
import { addSub, multiply, divide, parseInt, toSigned, MUL_ALGOS, DIV_ALGOS } from '../int/arith.js';
import { integerLatex } from '../app/latex.js';
import { intStepText } from '../app/text.js';
import { esc, md, tm, options } from './common.js';

export const defaults = () => ({ op: 'mul', algo: 'v1', n: 4, a: '2', b: '3', signed: false });

const OPS = { add: ['add'], sub: ['sub'], mul: MUL_ALGOS, div: DIV_ALGOS };

const PRESETS = [
    { op: 'mul', algo: 'v1', n: 4, a: '2', b: '3', signed: false, key: 'int.ex.book23' },
    { op: 'mul', algo: 'booth', n: 4, a: '2', b: '-3', signed: true, key: 'int.ex.booth' },
    { op: 'div', algo: 'v1', n: 4, a: '7', b: '2', signed: false, key: 'int.ex.book72' },
    { op: 'div', algo: 'nonrestoring', n: 8, a: '-77', b: '6', signed: true, key: 'int.ex.signedDiv' },
    { op: 'add', algo: 'add', n: 8, a: '100', b: '50', signed: true, key: 'int.ex.overflow' },
    { op: 'sub', algo: 'sub', n: 8, a: '5', b: '9', signed: false, key: 'int.ex.borrow' },
];

const bin = (v, n) => BigInt(v).toString(2).padStart(n, '0');
const show = (v, n, signed) => (signed ? toSigned(v, n).toString() : BigInt(v).toString());

/** Executa a operação e devolve o resultado com os textos de cabeçalho. */
export function compute(st) {
    const n = Number(st.n);
    const A = parseInt(st.a, n), B = parseInt(st.b, n);
    if (A === null || B === null) return { error: true };
    if (st.op === 'add' || st.op === 'sub') {
        const r = addSub(n, A, B, st.op === 'sub');
        return { kind: 'add', r, n, A, B, showA: show(A, n, st.signed), showB: show(B, n, st.signed), showSum: show(r.sum, n, st.signed) };
    }
    if (st.op === 'mul') {
        const algo = MUL_ALGOS.includes(st.algo) ? st.algo : 'v1';
        return { kind: 'mul', ...multiply(algo, n, A, B, algo === 'booth' ? true : st.signed) };
    }
    const algo = DIV_ALGOS.includes(st.algo) ? st.algo : 'v1';
    return { kind: 'div', ...divide(algo, n, A, B, st.signed) };
}

export function render(el, st, ctx) {
    if (!OPS[st.op].includes(st.algo)) st.algo = OPS[st.op][0];
    const algos = st.op === 'mul' || st.op === 'div'
        ? `<label class="field"><span>${esc(t('int.algo'))}</span><select id="in-algo">${options(OPS[st.op].map((a) => [a, t(`int.algo.${st.op}.${a}`)]), st.algo)}</select></label>` : '';
    const forceSigned = st.op === 'mul' && st.algo === 'booth';
    el.innerHTML = `
        <section class="card form">
            <div class="row">
                <label class="field"><span>${esc(t('ui.operation'))}</span><select id="in-op">${options(Object.keys(OPS).map((o) => [o, t(`int.op.${o}`)]), st.op)}</select></label>
                ${algos}
                <label class="field"><span>${esc(t('int.bits'))}</span><select id="in-n">${options([4, 6, 8, 16, 32].map((x) => [x, `${x} bits`]), st.n)}</select></label>
                <label class="field"><span>A</span><input id="in-a" value="${esc(st.a)}" spellcheck="false"/></label>
                <label class="field"><span>B</span><input id="in-b" value="${esc(st.b)}" spellcheck="false"/></label>
                <label class="field check"><input type="checkbox" id="in-signed" ${st.signed || forceSigned ? 'checked' : ''} ${forceSigned ? 'disabled' : ''}/>${esc(t('int.signed'))}</label>
            </div>
            <p class="hint">${tm('int.hint')} ${PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${esc(t(p.key))}</button>`).join('')}</p>
        </section>
        <div id="in-out"></div>`;
    const $ = (id) => el.querySelector(id);
    const out = $('#in-out');
    const draw = () => { out.innerHTML = output(st); };
    $('#in-op').addEventListener('change', (e) => { st.op = e.target.value; st.algo = OPS[st.op][0]; ctx.save(); render(el, st, ctx); });
    $('#in-algo')?.addEventListener('change', (e) => { st.algo = e.target.value; ctx.save(); render(el, st, ctx); });
    $('#in-n').addEventListener('change', (e) => { st.n = Number(e.target.value); ctx.save(); draw(); });
    $('#in-a').addEventListener('input', (e) => { st.a = e.target.value; ctx.save(); draw(); });
    $('#in-b').addEventListener('input', (e) => { st.b = e.target.value; ctx.save(); draw(); });
    $('#in-signed').addEventListener('change', (e) => { st.signed = e.target.checked; ctx.save(); draw(); });
    for (const b of el.querySelectorAll('[data-preset]')) b.addEventListener('click', () => {
        const p = PRESETS[Number(b.dataset.preset)];
        Object.assign(st, { op: p.op, algo: p.algo, n: p.n, a: p.a, b: p.b, signed: p.signed });
        ctx.save();
        render(el, st, ctx);
    });
    draw();
}

function output(st) {
    const res = compute(st);
    const n = Number(st.n);
    if (res.error) return `<section class="card"><p class="note warn">${tm('int.invalid', { n, min: -(2 ** (n - 1)), max: 2 ** n - 1 })}</p></section>`;
    if (res.kind === 'add') return addOutput(res, st);
    const signed = res.signed;
    let summary;
    if (res.kind === 'mul') {
        const p = show(res.product, 2 * n, signed);
        summary = `${tm('int.mulResult', { a: show(res.A, n, signed), b: show(res.B, n, signed), p, bin: bin(res.product, 2 * n) })} ${res.product === res.expected ? `<span class="ok">✓</span>` : '<span class="warn">✗</span>'}`;
    } else if (res.divByZero) summary = tm('int.divZero', { a: show(res.A, n, signed), q: bin(res.quotient, n) });
    else if (res.overflow) summary = tm('int.divOverflow', { a: show(res.A, n, signed) });
    else summary = `${tm('int.divResult', { a: show(res.A, n, signed), b: show(res.B, n, signed), q: show(res.quotient, n, signed), r: show(res.remainder, n, signed) })} ${res.quotient === res.expected.q && res.remainder === res.expected.r ? '<span class="ok">✓</span>' : '<span class="warn">✗</span>'}`;
    const mag = res.magnitudes && (res.magnitudes.sa || res.magnitudes.sb) ? `<p class="note">${tm('int.magnitudes', { a: res.magnitudes.ma.toString(), b: res.magnitudes.mb.toString() })}</p>` : '';
    const names = res.regs.map(([x]) => x);
    const widths = Object.fromEntries(res.regs);
    let prev = null;
    const rows = res.rows.map((row) => {
        const cells = names.map((nm) => {
            const changed = prev && prev.regs[nm] !== row.regs[nm];
            return `<td class="mono ${changed ? 'chg' : ''}">${groupBits(bin(row.regs[nm] ?? 0n, widths[nm]), nm, n, res)}</td>`;
        }).join('');
        const newIter = !prev || prev.iter !== row.iter;
        prev = row;
        return `<tr class="${newIter ? 'iter' : ''}"><th>${newIter ? row.iter : ''}</th><td class="st">${md(intStepText(row, res))}</td>${cells}</tr>`;
    }).join('');
    const table = res.rows.length ? `<div class="scroll"><table class="data steps-int"><tr><th>${esc(t('int.iter'))}</th><th>${esc(t('ui.step'))}</th>${names.map((nm) => `<th>${esc(t(`ireg.${nm}`))} <span class="sub">${widths[nm]}b</span></th>`).join('')}</tr>${rows}</table></div>` : '';
    return `<section class="card"><h2>${esc(t(`int.algo.${st.op}.${res.algo}`))}</h2><p class="result-line">${summary}</p>${mag}
        <p class="hint">${tm(`int.note.${st.op}.${res.algo}`)}</p></section>
        ${table ? `<section class="card"><h2>${esc(t('int.steps'))} <span class="sub">${esc(t('int.stepsSub'))}</span></h2>${table}</section>` : ''}`;
}

/** Separa visualmente as metades dos registros de 2n bits (e o bit extra quando houver). */
function groupBits(s, name, n) {
    if (s.length === 2 * n) return `${s.slice(0, n)}<span class="gap"></span>${s.slice(n)}`;
    if (s.length === 2 * n + 1) return `${s.slice(0, n + 1)}<span class="gap"></span>${s.slice(n + 1)}`;
    return s;
}

function addOutput(res, st) {
    const { r, n } = res;
    const carries = [...r.carries].reverse().map(String).join('');
    const bits = (v) => bin(v, n);
    const signedSum = toSigned(r.sum, n).toString();
    return `<section class="card"><h2>${esc(t(`int.op.${st.op}`))}</h2>
        <table class="adder mono">
            <tr class="carry"><th>${esc(t('int.carries'))}</th><td>${carries}</td><td></td></tr>
            <tr><th>A</th><td>&nbsp;${bits(r.A)}</td><td>${esc(res.showA)}</td></tr>
            <tr><th>${r.subtract ? esc(t('int.notB')) : 'B'}</th><td>+${bits(r.Be)}</td><td>${r.subtract ? esc(t('int.plusOne')) : esc(res.showB)}</td></tr>
            <tr class="sum"><th>${esc(t('int.result'))}</th><td>&nbsp;${bits(r.sum)}</td><td>${esc(res.showSum)}</td></tr>
        </table>
        <table class="kv">
            <tr><th>${esc(t('int.unsigned'))}</th><td>${r.A} ${r.subtract ? '−' : '+'} ${r.B} = ${r.exactUnsigned}; ${esc(t('int.got'))} ${r.sum} ${r.unsignedOverflow ? `<span class="warn">${esc(t(r.subtract ? 'int.borrowYes' : 'int.carryYes'))}</span>` : `<span class="ok">${esc(t('int.ok'))}</span>`}</td></tr>
            <tr><th>${esc(t('int.signedLabel'))}</th><td>${toSigned(r.A, n)} ${r.subtract ? '−' : '+'} ${toSigned(r.B, n)} = ${r.exactSigned}; ${esc(t('int.got'))} ${signedSum} ${r.overflow ? `<span class="warn">${esc(t('int.ovYes'))}</span>` : `<span class="ok">${esc(t('int.ok'))}</span>`}</td></tr>
            <tr><th>${esc(t('int.flagsCV'))}</th><td>C = ${r.carryOut}, V = c<sub>${n}</sub> ⊕ c<sub>${n - 1}</sub> = ${r.carries[n]} ⊕ ${r.carries[n - 1]} = ${r.overflow}</td></tr>
        </table>
        <p class="hint">${tm('int.addNote')}</p></section>`;
}

export function latex(st) {
    const res = compute(st);
    if (res.error) return [];
    const title = res.kind === 'add' ? t(`int.op.${st.op}`) : t(`int.algo.${st.op}.${res.algo}`);
    return [{ id: 'int', label: t('tex.int'), file: 'aritmetica-inteira.tex', text: integerLatex(res, `${title}: A = ${st.a}, B = ${st.b} (${st.n} bits)`) }];
}
