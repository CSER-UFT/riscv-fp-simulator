/**
 * Gerador de exercícios com semente: a mesma semente e as mesmas opções geram as mesmas questões (o link
 * do exercício guarda só isso). Cada questão traz o enunciado (chave de tradução e parâmetros), a resposta
 * canônica e uma função de correção que aceita formas equivalentes.
 */
import * as core from '../fp/core.js';
import { FORMATS, ROUNDING_MODES, getFormat } from '../fp/formats.js';
import { fromText, displayText as shortestText, exactValueText, parseNumber } from '../fp/decimal.js';
import { multiply, divide, toSigned, toUnsigned } from '../int/arith.js';
import { hex, roundingExplain } from './analysis.js';
import { fixedFormat, fromRational as fixedFromRational } from '../fx/fixed.js';
import { rng } from './rng.js';

export const QUESTION_TYPES = ['encode', 'decode', 'exponent', 'round', 'flags', 'grs', 'modes', 'fixenc', 'intmul', 'intdiv'];

export { rng };

/** Valores "de aula": frações com poucos bits, algumas que não terminam em binário, potências de 2. */
function niceValue(r, f) {
    const kind = r();
    const sign = r() < 0.35 ? '-' : '';
    if (kind < 0.35) {
        // m / 2^k com m pequeno: exato em formatos com p suficiente.
        const m = 1 + Math.floor(r() * 63);
        const k = Math.floor(r() * 6);
        return `${sign}${(m / 2 ** k).toString()}`;
    }
    if (kind < 0.6) return `${sign}${['0.1', '0.2', '0.3', '0.7', '1.1', '2.6', '0.05', '3.3', '6.5', '9.9'][Math.floor(r() * 10)]}`;
    if (kind < 0.8) {
        const e = Math.floor(r() * 8) - 4;
        return `${sign}${(2 ** e) * (1 + Math.floor(r() * 8) / 8)}`;
    }
    // Perto dos limites do formato: maior finito, subnormais.
    const v = core.decode(f, r() < 0.5 ? core.maxFinite(f, 0) : BigInt(1 + Math.floor(r() * 3)));
    return `${sign}${shortestText(f.id, v.bits)}`;
}

const normHex = (s) => String(s).trim().toLowerCase().replace(/^0x/, '').replace(/[\s_]/g, '').replace(/^0+(?=.)/, '');
const normBin = (s) => String(s).trim().replace(/^0b/i, '').replace(/[\s_.]/g, '');
const normInt = (s) => String(s).trim().replace(/\s/g, '');

function checkHex(expected) {
    return (ans) => normHex(ans) === normHex(expected);
}

/** Resposta decimal certa se, lida no formato (rne), dá os mesmos bits. */
function checkValue(fmtId, bits) {
    return (ans) => {
        const t = String(ans).trim();
        if (!parseNumber(t)) return false;
        const r = fromText(fmtId, t, 'rne');
        return r && r.bits === bits;
    };
}

function checkFlags(mask) {
    return (ans) => {
        const parts = String(ans).toUpperCase().split(/[^A-Z]+/).filter(Boolean);
        if (parts.length === 1 && ['NENHUMA', 'NONE', 'NADA', 'ZERO'].includes(parts[0])) return mask === 0;
        if (!parts.every((p) => core.FLAG_NAMES.includes(p))) return false;
        let m = 0;
        for (const p of parts) m |= core.FLAG[p];
        return m === mask;
    };
}

const OPS = ['add', 'sub', 'mul', 'div'];
const OP_SYMBOL = { add: '+', sub: '−', mul: '×', div: '÷' };

function genEncode(r, f, mode) {
    const v = niceValue(r, f);
    const res = fromText(f.id, v, mode);
    return {
        type: 'encode', text: { key: 'q.encode', params: { v, fmt: f.id, mode } },
        answer: hex(f.id, res.bits), check: checkHex(hex(f.id, res.bits)),
        solution: { key: 'q.sol.encode', params: { exact: exactValueText(f.id, res.bits), flags: core.flagList(res.flags).join(' ') || '-' } },
        link: { view: 'convert', fmt: f.id, mode, text: v },
    };
}

function genDecode(r, f) {
    const v = niceValue(r, f);
    const bits = fromText(f.id, v, 'rne').bits;
    const exact = exactValueText(f.id, bits);
    return {
        type: 'decode', text: { key: 'q.decode', params: { hex: hex(f.id, bits), fmt: f.id } },
        answer: exact.length > 24 ? shortestText(f.id, bits) : exact, check: checkValue(f.id, bits),
        solution: { key: 'q.sol.decode', params: { exact } },
        link: { view: 'convert', fmt: f.id, mode: 'rne', text: exact },
    };
}

function genExponent(r, f) {
    const v = niceValue(r, f);
    const bits = fromText(f.id, v, 'rne').bits;
    const d = core.decode(f, bits);
    if (d.cls === 'zero') return genExponent(r, f);
    const field = d.expField;
    const e = d.cls === 'normal' ? field - f.bias : f.emin;
    return {
        type: 'exponent', text: { key: 'q.exponent', params: { v: shortestText(f.id, bits), fmt: f.id } },
        answer: `${field} ${e}`,
        check: (ans) => { const p = String(ans).trim().split(/[\s;,]+/); return p.length === 2 && Number(p[0]) === field && Number(p[1]) === e; },
        solution: { key: 'q.sol.exponent', params: { field, bias: f.bias, e, cls: d.cls } },
        link: { view: 'convert', fmt: f.id, mode: 'rne', text: shortestText(f.id, bits) },
    };
}

function opPair(r, f) {
    const op = OPS[Math.floor(r() * OPS.length)];
    const a = niceValue(r, f), b = niceValue(r, f);
    const A = fromText(f.id, a, 'rne').bits, B = fromText(f.id, b, 'rne').bits;
    return { op, a: shortestText(f.id, A), b: shortestText(f.id, B), A, B };
}

function genRound(r, f, mode) {
    const { op, a, b, A, B } = opPair(r, f);
    const res = core.operate(op, f, [A, B], mode);
    return {
        type: 'round', text: { key: 'q.round', params: { a, b, op: OP_SYMBOL[op], fmt: f.id, mode } },
        answer: hex(f.id, res.bits), check: checkHex(hex(f.id, res.bits)),
        solution: { key: 'q.sol.round', params: { v: shortestText(f.id, res.bits), flags: core.flagList(res.flags).join(' ') || '-' } },
        link: { view: 'ops', fmt: f.id, mode, op, a, b },
    };
}

function genFlags(r, f, mode) {
    const { op, a, b, A, B } = opPair(r, f);
    const res = core.operate(op, f, [A, B], mode);
    const list = core.flagList(res.flags);
    return {
        type: 'flags', text: { key: 'q.flags', params: { a, b, op: OP_SYMBOL[op], fmt: f.id, mode } },
        answer: list.join(' ') || '-', check: (ans) => (String(ans).trim() === '-' ? res.flags === 0 : checkFlags(res.flags)(ans)),
        solution: { key: 'q.sol.flags', params: { v: shortestText(f.id, res.bits) } },
        link: { view: 'ops', fmt: f.id, mode, op, a, b },
    };
}

function genIntMul(r) {
    const n = 4;
    const algo = ['v1', 'v2', 'booth'][Math.floor(r() * 3)];
    const signed = algo === 'booth';
    const a = BigInt(Math.floor(r() * 16)), b = BigInt(Math.floor(r() * 16));
    const m = multiply(algo, n, a, b, signed);
    const k = 1 + Math.floor(r() * n);
    // Registro do produto no fim da iteração k (última linha daquela iteração).
    const last = m.rows.filter((x) => x.iter === k).at(-1);
    const width = m.regs.find(([name]) => name === 'P')[1];
    const P = last.regs.P.toString(2).padStart(width, '0');
    const show = (v) => (signed ? String(toSigned(v, n)) : String(v));
    return {
        type: 'intmul', text: { key: `q.intmul.${algo}`, params: { a: show(a), b: show(b), n, k, w: width } },
        answer: P, check: (ans) => normBin(ans) === P,
        solution: { key: 'q.sol.intmul', params: { p: signed ? String(toSigned(m.product, 2 * n)) : String(m.product) } },
        link: { view: 'int', op: 'mul', algo, n, a: show(a), b: show(b), signed },
    };
}

function genIntDiv(r) {
    const n = 8;
    const a = BigInt(Math.floor(r() * 256) - 128), b = BigInt(Math.floor(r() * 30) - 15) || 7n;
    const d = divide('v2', n, toUnsigned(a, n), toUnsigned(b, n), true);
    const q = toSigned(d.quotient, n), rem = toSigned(d.remainder, n);
    return {
        type: 'intdiv', text: { key: 'q.intdiv', params: { a: String(a), b: String(b) } },
        answer: `${q} ${rem}`,
        check: (ans) => { const p = String(ans).trim().split(/[\s;,]+/).map(normInt); return p.length === 2 && p[0] === String(q) && p[1] === String(rem); },
        solution: { key: 'q.sol.intdiv', params: { q: String(q), r: String(rem) } },
        link: { view: 'int', op: 'div', algo: 'v2', n, a: String(a), b: String(b), signed: true },
    };
}

/** Valor que não é representável em f e fica entre dois vizinhos finitos (para G, R, S e os modos). */
function inexactValue(r, f) {
    for (let i = 0; i < 50; i++) {
        const v = niceValue(r, f);
        const p = parseNumber(v);
        if (!p || p.kind !== 'finite' || p.N === 0n) continue;
        const ex = roundingExplain(f.id, { sign: p.sign, N: p.N, D: p.D });
        if (ex && !ex.exact && !ex.overflow && !ex.subnormal && ex.r < 1) return { v, ex };
    }
    // Sempre há um valor de reserva: 0.1 não termina em binário em nenhum formato.
    const ex = roundingExplain(f.id, { sign: 0, N: 1n, D: 10n });
    return { v: '0.1', ex };
}

function genGrs(r, f) {
    const { v, ex } = inexactValue(r, f);
    const ans = `${ex.G} ${ex.R} ${ex.S}`;
    return {
        type: 'grs', text: { key: 'q.grs', params: { v, fmt: f.id } },
        answer: ans,
        check: (a) => { const d = String(a).replace(/[^01]/g, ''); return d === `${ex.G}${ex.R}${ex.S}`; },
        solution: { key: 'q.sol.grs', params: { kept: `${ex.kept[0]}.${ex.kept.slice(1)}`, dropped: `${ex.dropped}${ex.more ? '…' : ''}`, r: ex.dLo } },
        link: { view: 'convert', fmt: f.id, mode: 'rne', text: v },
    };
}

function genModes(r, f) {
    const { v, ex } = inexactValue(r, f);
    const up = ex.modes.filter((m) => m.side === 'hi').map((m) => m.mode.toUpperCase());
    return {
        type: 'modes', text: { key: 'q.modes', params: { v, fmt: f.id } },
        answer: up.join(' ') || '-',
        check: (a) => {
            const parts = String(a).toUpperCase().split(/[^A-Z]+/).filter(Boolean);
            if (!parts.length) return up.length === 0 && String(a).trim() === '-';
            if (!parts.every((x) => ROUNDING_MODES.includes(x.toLowerCase()))) return false;
            return [...new Set(parts)].sort().join() === [...up].sort().join();
        },
        solution: { key: 'q.sol.modes', params: { lo: exactValueText(f.id, ex.lo.bits), hi: exactValueText(f.id, ex.hi.bits), r: ex.dLo } },
        link: { view: 'convert', fmt: f.id, mode: 'rne', text: v },
    };
}

const FIX_FORMATS = [[3, 4, true], [1, 6, true], [2, 5, true], [4, 4, false], [0, 7, true]];

function genFixEnc(r, f, mode) {
    const [m, n, signed] = FIX_FORMATS[Math.floor(r() * FIX_FORMATS.length)];
    const fx = fixedFormat(m, n, signed);
    // Valores dentro da faixa: frações curtas, decimais que não terminam em binário e, às vezes, negativos.
    const lim = 2 ** m;
    const sign = signed && r() < 0.4 ? '-' : '';
    const pick = r();
    let v;
    if (pick < 0.4) v = String(Number(((Math.floor(r() * lim * 100)) / 100 || 0.1).toFixed(2)));
    else if (pick < 0.7) v = ['0.1', '0.3', '0.7', '0.2', '0.45', '0.9', '0.33'][Math.floor(r() * 7)];
    else v = String((1 + Math.floor(r() * (lim * 8 - 1))) / 8 + 1 / 2 ** (n + 1));
    if (Number(v) >= lim) v = String(lim / 2 + 0.3);
    v = sign + v;
    const p = parseNumber(v);
    const res = fixedFromRational(fx, p.sign, p.N, p.D, mode, 'sat');
    const bin = res.bits.toString(2).padStart(fx.bits, '0');
    const value = ((x) => { const a = x < 0n ? -x : x; return `${x < 0n ? '-' : ''}${Number(a) / 2 ** n}`; })(res.raw);
    return {
        type: 'fixenc', text: { key: 'q.fixenc', params: { v, name: fx.name, mode, bits: fx.bits } },
        answer: bin,
        check: (a) => {
            const t = String(a).trim();
            if (/^0x/i.test(t)) return normHex(t) === normHex(res.bits.toString(16));
            return normBin(t).padStart(fx.bits, '0') === bin && normBin(t).length <= fx.bits;
        },
        solution: { key: 'q.sol.fixenc', params: { raw: res.raw.toString(), n, value, flags: core.flagList(res.flags).join(' ') || '-' } },
        link: { view: 'fix', m, n, signed, mode, op: 'conv', a: v },
    };
}

/**
 * Gera `count` questões dos tipos e formatos pedidos.
 * @param {{seed: number, count: number, types: string[], formats: string[], modes: string[]}} opts
 */
export function generate({ seed = 1, count = 8, types = QUESTION_TYPES, formats = ['half', 'single', 'bf16', 'e4m3'], modes = ROUNDING_MODES }) {
    const r = rng(seed);
    const ts = types.filter((x) => QUESTION_TYPES.includes(x));
    const fs = formats.filter((x) => FORMATS[x]);
    const ms = modes.filter((x) => ROUNDING_MODES.includes(x));
    if (!ts.length || !fs.length || !ms.length) return [];
    const out = [];
    for (let i = 0; i < Math.max(1, Math.min(40, count)); i++) {
        const type = ts[i % ts.length];
        const f = getFormat(fs[Math.floor(r() * fs.length)]);
        const mode = ms[Math.floor(r() * ms.length)];
        const q = { encode: genEncode, decode: genDecode, exponent: genExponent, round: genRound, flags: genFlags, grs: genGrs, modes: genModes, fixenc: genFixEnc, intmul: genIntMul, intdiv: genIntDiv }[type](r, f, mode);
        out.push(q);
    }
    return out;
}
