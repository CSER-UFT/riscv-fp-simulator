/**
 * Análise de ponto fixo para a interface e a exportação: operandos, operação inteira passo a passo,
 * resultado, erro e a comparação com os formatos de ponto flutuante do mesmo tamanho. Sem DOM.
 */
import * as core from '../fp/core.js';
import { FORMATS, FORMAT_IDS } from '../fp/formats.js';
import { parseNumber, fromText, exactDecimal, displayText, ratToSci } from '../fp/decimal.js';
import { fixedFormat, fromRational, operate, rawToRational } from '../fx/fixed.js';
import { errors, rationalText } from './analysis.js';

/** Texto exato de um valor guardado em ponto fixo. */
export function fixedText(fx, raw) {
    const r = rawToRational(fx, raw);
    return exactDecimal(r.sign, r.N, r.D);
}

/** Bits como texto com o ponto binário no lugar: sinal, parte inteira e fração. */
export function fixedBitsText(fx, bits) {
    const s = BigInt(bits).toString(2).padStart(fx.bits, '0');
    const sign = fx.signed ? s[0] : '';
    const int = s.slice(fx.signed ? 1 : 0, fx.bits - fx.n);
    const frac = s.slice(fx.bits - fx.n);
    return { sign, int, frac, text: `${sign}${sign ? ' ' : ''}${int || '0'}${fx.n ? `.${frac}` : ''}` };
}

const hexOf = (fx, bits) => `0x${BigInt(bits).toString(16).toUpperCase().padStart(Math.ceil(fx.bits / 4), '0')}`;

function operand(fx, text, mode, overflow) {
    const p = parseNumber(text);
    if (!p || p.kind !== 'finite') return null;
    const r = fromRational(fx, p.sign, p.N, p.D, mode, overflow);
    const x = { sign: p.sign, N: p.N, D: p.D };
    return {
        text, parsed: x, raw: r.raw, bits: r.bits, flags: r.flags,
        hex: hexOf(fx, r.bits), bin: fixedBitsText(fx, r.bits), value: fixedText(fx, r.raw),
        err: fixedError(fx, x, r.raw),
    };
}

/** Erros absoluto e relativo de representar x pelo valor guardado. */
function fixedError(fx, x, raw) {
    const v = rawToRational(fx, raw);
    const sx = x.sign ? -x.N : x.N, sv = v.sign ? -v.N : v.N;
    let N = sx * v.D - sv * x.D;
    const D = x.D * v.D;
    if (N < 0n) N = -N;
    if (N === 0n) return { exact: true, abs: '0', rel: '0' };
    return { exact: false, abs: ratToSci(0, N, D, 4), rel: x.N === 0n ? '∞' : ratToSci(0, N * x.D, D * x.N, 4) };
}

/** Resultado exato da operação sobre os valores digitados (null na divisão por zero). */
function idealResult(op, a, b) {
    const sa = a.sign ? -a.N : a.N, sb = b.sign ? -b.N : b.N;
    let N, D;
    if (op === 'add' || op === 'sub') { N = sa * b.D + (op === 'add' ? 1n : -1n) * sb * a.D; D = a.D * b.D; }
    else if (op === 'mul') { N = sa * sb; D = a.D * b.D; }
    else { if (sb === 0n) return null; N = sa * b.D; D = a.D * sb; }
    if (D < 0n) { N = -N; D = -D; }
    return { sign: N < 0n ? 1 : 0, N: N < 0n ? -N : N, D };
}

/** Formatos de ponto flutuante com o mesmo número de bits do formato de ponto fixo. */
export const sameWidthFloats = (bits) => FORMAT_IDS.filter((id) => FORMATS[id].bits === bits);

/**
 * @param {{m, n, signed, overflow, mode, op, a, b}} st op = 'conv' (só converte a) ou add, sub, mul, div
 */
export function analyzeFixed(st) {
    let fx;
    try { fx = fixedFormat(Number(st.m), Number(st.n), Boolean(st.signed)); } catch { return { error: 'format' }; }
    const A = operand(fx, st.a, st.mode, st.overflow);
    const B = st.op === 'conv' ? null : operand(fx, st.b, st.mode, st.overflow);
    if (!A || (st.op !== 'conv' && !B)) return { error: 'operand', fx };
    const res = { fx, op: st.op, mode: st.mode, overflow: st.overflow, A, B };
    res.range = {
        min: fixedText(fx, fx.min), max: fixedText(fx, fx.max),
        step: exactDecimal(0, 1n, 1n << BigInt(fx.n)), count: (1n << BigInt(fx.bits)).toString(),
    };
    if (st.op !== 'conv') {
        res.ideal = idealResult(st.op, A.parsed, B.parsed);
        res.idealText = res.ideal ? rationalText(res.ideal.sign, res.ideal.N, res.ideal.D, 30) : null;
        const r = operate(fx, st.op, A.raw, B.raw, st.mode, st.overflow);
        res.result = { raw: r.raw, bits: r.bits, flags: r.flags, hex: hexOf(fx, r.bits), bin: fixedBitsText(fx, r.bits), value: fixedText(fx, r.raw), steps: r.steps };
        if (r.exact) {
            res.exact = r.exact;
            res.exactText = rationalText(r.exact.sign, r.exact.N, r.exact.D, 30);
        }
        // Erro contra o resultado ideal (a conta exata com os valores digitados), igual para fixo e float.
        if (res.ideal) res.result.err = fixedError(fx, res.ideal, r.raw);
    }
    // Comparação com ponto flutuante do mesmo tamanho (os operandos convertidos do texto, no mesmo modo).
    res.floats = sameWidthFloats(fx.bits).map((id) => {
        const f = FORMATS[id];
        const a = fromText(id, st.a, st.mode);
        const row = { fmt: id, a: { bits: a.bits, text: displayText(id, a.bits), err: errors(f, A.parsed, a.bits), flags: a.flags } };
        if (st.op !== 'conv') {
            const b = fromText(id, st.b, st.mode);
            const o = core.operate(st.op, f, [a.bits, b.bits], st.mode);
            row.result = { bits: o.bits, text: displayText(id, o.bits), flags: o.flags, err: res.ideal ? errors(f, res.ideal, o.bits) : null };
        }
        return row;
    });
    // Erro de representação ao longo da faixa: absoluto fixo no ponto fixo, relativo fixo no float.
    const maxNum = Number(fixedText(fx, fx.max));
    const step = 2 ** -fx.n;
    const samples = [];
    // Três amostras por década, desde valores que já arredondam para zero (erro relativo de 100%).
    for (let k = -12; k <= 12; k++) {
        for (const c of [1.2345678, 2.7182818, 5.4321098]) {
            const v = c * 10 ** k;
            if (v >= step / 4 && v <= maxNum) samples.push(String(Number(v.toPrecision(8))));
        }
    }
    res.sweep = samples.map((text) => {
        const p = parseNumber(text);
        const r = fromRational(fx, p.sign, p.N, p.D, 'rne', 'sat');
        const row = { text, fixed: { value: fixedText(fx, r.raw), err: fixedError(fx, p, r.raw) } };
        row.floats = sameWidthFloats(fx.bits).map((id) => {
            const b = fromText(id, text, 'rne').bits;
            return { fmt: id, text: displayText(id, b), err: errors(FORMATS[id], p, b) };
        });
        return row;
    });
    return res;
}
