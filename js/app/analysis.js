/**
 * Análises usadas pela interface e pela exportação: tudo o que se mostra de uma conversão ou de uma
 * operação, calculado com o núcleo exato. Funções puras (sem DOM), testadas em Node.
 */
import * as core from '../fp/core.js';
import { FORMATS, FORMAT_IDS, ROUNDING_MODES, getFormat } from '../fp/formats.js';
import { parseNumber, fromText, exactValueText, shortestText, displayText, ratToSci, ratToNumber } from '../fp/decimal.js';
import { traceOp } from '../fp/trace.js';

const abs = (n) => (n < 0n ? -n : n);

/** Diferença exata entre dois racionais com sinal: a - b. */
function ratSub(a, b) {
    const sa = a.sign ? -a.N : a.N, sb = b.sign ? -b.N : b.N;
    const N = sa * b.D - sb * a.D;
    return { sign: N < 0n ? 1 : 0, N: abs(N), D: a.D * b.D };
}

/** Expansão decimal de um racional com até `max` casas: {text, exact}. */
export function rationalText(sign, N, D, max = 40) {
    const int = N / D;
    let rem = N % D;
    let frac = '';
    while (rem !== 0n && frac.length < max) {
        rem *= 10n;
        frac += (rem / D).toString();
        rem %= D;
    }
    const s = sign && (N !== 0n) ? '-' : '';
    return { text: s + int.toString() + (frac ? `.${frac}` : ''), exact: rem === 0n };
}

/** Erros de representar o racional x pelo valor dos bits: absoluto, relativo e em ULPs (textos). */
export function errors(fmt, x, bits) {
    const v = core.decode(fmt, bits);
    if (!core.isFinite(v) || x.N === undefined) return null;
    const stored = core.toRational(v);
    const d = ratSub(x, stored);
    if (d.N === 0n) return { exact: true, abs: '0', rel: '0', ulps: '0', absNum: 0, relNum: 0 };
    const u = core.ulp(fmt, bits);
    const rel = x.N === 0n ? null : { N: d.N * x.D, D: d.D * x.N };
    const ul = { N: d.N * u.D, D: d.D * u.N };
    return {
        exact: false,
        abs: ratToSci(0, d.N, d.D, 4),
        rel: rel ? ratToSci(0, rel.N, rel.D, 4) : '∞',
        ulps: ratToSci(0, ul.N, ul.D, 4),
        absNum: ratToNumber(0, d.N, d.D),
        relNum: rel ? ratToNumber(0, rel.N, rel.D) : Infinity,
        ulpNum: ratToNumber(0, ul.N, ul.D),
    };
}

/** Campos de um padrão de bits, para a tabela de anatomia do número. */
export function fields(fmtId, bits) {
    const f = getFormat(fmtId);
    const v = core.decode(f, bits);
    const bin = (x, n) => x.toString(2).padStart(n, '0');
    const sub = v.cls === 'subnormal' || v.cls === 'zero';
    return {
        cls: v.cls,
        sign: v.sign,
        expBits: bin(BigInt(v.expField), f.expBits),
        expField: v.expField,
        bias: f.bias,
        // Expoente real: campo - bias para normais; emin para subnormais (o campo 0 vale como 1).
        exp: v.cls === 'normal' ? v.expField - f.bias : (sub ? f.emin : null),
        fracBits: bin(v.frac, f.fracBits),
        hidden: v.cls === 'normal' ? 1 : 0,
        fclass: core.FCLASS[core.fclass(f, bits)],
        quiet: v.quiet,
    };
}

/** Texto em hexadecimal com o número certo de dígitos. */
export const hex = (fmt, bits) => `0x${BigInt(bits).toString(16).toUpperCase().padStart(getFormat(typeof fmt === 'string' ? fmt : fmt.id).hexDigits, '0')}`;

function describe(fmtId, bits) {
    return { bits, hex: hex(fmtId, bits), short: displayText(fmtId, bits), shortest: shortestText(fmtId, bits), exactText: exactValueText(fmtId, bits) };
}

/**
 * Tudo sobre a conversão de um texto para um formato.
 * @returns {null | object} null se o texto não é um número
 */
export function analyzeConversion(fmtId, text, mode, opts = {}) {
    const f = getFormat(fmtId);
    const parsed = parseNumber(text);
    if (!parsed) return null;
    const main = fromText(fmtId, text, mode, opts);
    const x = parsed.kind === 'finite' ? parsed : null;
    const res = {
        fmt: f, mode, text, parsed,
        input: x ? rationalText(x.sign, x.N, x.D, 60) : null,
        inputFraction: x && !rationalText(x.sign, x.N, x.D, 60).exact ? `${x.sign ? '-' : ''}${x.N}/${x.D}` : null,
        ...describe(fmtId, main.bits),
        flags: main.flags,
        fields: fields(fmtId, main.bits),
        err: x ? errors(f, x, main.bits) : null,
        info: main.info ?? null,
    };
    res.modes = ROUNDING_MODES.map((m) => {
        const r = fromText(fmtId, text, m, opts);
        return { mode: m, ...describe(fmtId, r.bits), flags: r.flags, err: x ? errors(f, x, r.bits) : null };
    });
    res.formats = FORMAT_IDS.map((id) => {
        const r = fromText(id, text, mode, opts);
        return { fmt: id, ...describe(id, r.bits), flags: r.flags, err: x ? errors(FORMATS[id], x, r.bits) : null };
    });
    res.neighbors = x && x.N !== 0n ? neighbors(fmtId, x, opts) : null;
    res.explain = x && x.N !== 0n ? roundingExplain(fmtId, x, opts) : null;
    res.ints = Object.keys(core.INT_TYPES).map((type) => {
        const r = core.toInteger(fmtId, main.bits, type, mode);
        return { type, value: r.value, flags: r.flags };
    });
    return res;
}

/**
 * Dados para explicar o arredondamento de um racional x em cada modo:
 *   o significando de |x| em binário, com o corte depois do bit p (bits mantidos e os primeiros descartados);
 *   os bits guard, round e sticky e a posição de x entre os vizinhos (fração de um ULP);
 *   os dois vizinhos (lo, de menor magnitude, e hi, de maior), a paridade de cada um e o resultado de cada
 *   modo. Também cobre o estouro (hi é infinito, ou NaN no E4M3) e os subnormais.
 */
export function roundingExplain(fmtId, x, opts = {}) {
    const f = getFormat(fmtId);
    if (x.N === 0n) return null;
    const p = f.p;
    // Expoente do bit mais alto; abaixo de emin o corte fica fixo (subnormais).
    const e = core.floorLog2(x.N, x.D);
    const E = Math.max(e, f.emin);
    const scale = p - 1 - E;
    const num = scale >= 0 ? x.N << BigInt(scale) : x.N;
    const den = scale >= 0 ? x.D : x.D << BigInt(-scale);
    const q = num / den;
    let rem = num % den;
    // Primeiros bits descartados (divisão longa) e se ainda sobra algo depois deles.
    let dropped = '';
    for (let i = 0; i < 24 && rem !== 0n; i++) {
        rem *= 2n;
        dropped += rem >= den ? '1' : '0';
        if (rem >= den) rem -= den;
    }
    const more = rem !== 0n;
    const exact = dropped === '';
    const G = dropped[0] === '1' ? 1 : 0;
    const R = dropped[1] === '1' ? 1 : 0;
    const S = dropped.slice(2).includes('1') || more ? 1 : 0;
    const subnormal = e < f.emin;
    const kept = q.toString(2).padStart(p, '0');

    const by = {};
    for (const m of ROUNDING_MODES) by[m] = core.fromRational(f, x.sign, x.N, x.D, m, { ...opts, sat: false }).bits;
    const loBits = by.rtz;
    const hiBits = x.sign ? by.rdn : by.rup;
    const lsb = (bits) => {
        const v = core.decode(f, bits);
        return core.isFinite(v) ? Number(v.frac & 1n) : null;
    };
    const label = (bits) => {
        const v = core.decode(f, bits);
        if (v.cls === 'inf') return v.sign ? '-∞' : '+∞';
        if (v.cls === 'nan') return 'NaN';
        return displayText(fmtId, bits);
    };
    // Posição de x entre lo (0) e hi (1), exata: tie quando é 1/2.
    const nb = exact ? null : neighbors(fmtId, x, opts);
    const r = nb ? nb.x : 0;
    const half = G === 1 && R === 0 && S === 0;
    const overflow = !exact && !core.isFinite(core.decode(f, hiBits));
    return {
        fmt: f, sign: x.sign, exact, subnormal, overflow,
        E, kept, dropped, more, G, R, S, half,
        r, dLo: num4(r), dHi: num4(1 - r),
        lo: { bits: loBits, hex: hex(fmtId, loBits), text: label(loBits), lsb: lsb(loBits) },
        hi: { bits: hiBits, hex: hex(fmtId, hiBits), text: label(hiBits), lsb: lsb(hiBits) },
        modes: ROUNDING_MODES.map((m) => ({ mode: m, bits: by[m], text: label(by[m]), hex: hex(fmtId, by[m]), side: exact ? 'exact' : by[m] === loBits ? 'lo' : 'hi' })),
    };
}

/** Número com até 4 algarismos significativos, sem zeros finais. */
const num4 = (v) => String(Number(v.toPrecision(4)));

/**
 * Vizinhos representáveis de um racional x, para a reta numérica: os dois mais próximos (abaixo e acima) e
 * mais um de cada lado, com as posições relativas exatas (lo = 0, hi = 1) e os modos que escolhem cada um.
 */
export function neighbors(fmtId, x, opts = {}) {
    const f = getFormat(fmtId);
    const byMode = {};
    // A reta mostra a grade do formato: sem saturação, para que o estouro apareça como infinito (ou NaN).
    for (const m of ROUNDING_MODES) byMode[m] = core.fromRational(f, x.sign, x.N, x.D, m, { ...opts, sat: false }).bits;
    // Em magnitude: rtz dá o vizinho de menor magnitude; o outro vem de afastar-se de zero.
    const towardZero = byMode.rtz;
    const away = x.sign ? byMode.rdn : byMode.rup;
    const exact = towardZero === away;
    const val = (bits) => {
        const v = core.decode(f, bits);
        if (core.isFinite(v)) return { ...core.toRational(v), sign: 0 };
        // Infinito (ou NaN do E4M3): posição logo depois do maior finito, como se a grade continuasse.
        const mx = core.toRational(core.decode(f, core.maxFinite(f, 0)));
        const u = core.ulp(f, core.maxFinite(f, 0));
        return { sign: 0, N: mx.N * u.D + u.N * mx.D, D: mx.D * u.D };
    };
    const lo = towardZero, hi = away;
    const outer = (bits, dir) => {
        const v = core.decode(f, bits);
        if (!core.isFinite(v)) return null;
        const mag = bits & ~f.signBit;
        const nb = dir > 0 ? core.nextUp(f, mag) : core.nextDown(f, mag);
        const w = core.decode(f, nb);
        if (nb === mag || (dir < 0 && w.sign === 1)) return null;
        return nb | (bits & f.signBit);
    };
    const lo2 = outer(lo, -1);
    const hi2 = exact ? outer(hi, 1) : (core.isFinite(core.decode(f, hi)) ? outer(hi, 1) : null);
    // Posições em unidades de (hi - lo); com x exato, a unidade é a distância até o próximo.
    const L = val(lo);
    const ref = exact ? (hi2 !== null ? val(hi2) : null) : val(hi);
    const pos = (r) => {
        if (!ref) return 0;
        const num = r.N * L.D - L.N * r.D; // (r - L) com denominador r.D·L.D
        const den = ref.N * L.D - L.N * ref.D; // (ref - L) com denominador ref.D·L.D
        if (den === 0n) return 0;
        return ratToNumber(num < 0n ? 1 : 0, abs(num) * ref.D, abs(den) * r.D);
    };
    const X = { sign: 0, N: x.N, D: x.D };
    const points = [];
    const add = (bits, role) => {
        if (bits === null) return;
        const v = core.decode(f, bits);
        points.push({ role, bits, hex: hex(fmtId, bits), short: core.isFinite(v) ? displayText(fmtId, bits) : (v.cls === 'nan' ? 'NaN' : (v.sign ? '-∞' : '+∞')), pos: pos(val(bits)), modes: ROUNDING_MODES.filter((m) => byMode[m] === bits) });
    };
    add(lo2, 'outer');
    add(lo, 'lo');
    if (!exact) add(hi, 'hi');
    add(hi2, 'outer');
    // Ponto médio entre lo e hi (o limite do arredondamento ao mais próximo).
    // Muito fora da escala (estouro de 10^400 em single, por exemplo): limita a posição, a reta mostra uma seta.
    const xp = Math.max(-1e6, Math.min(1e6, pos(X)));
    return { sign: x.sign, exact, points, x: Number.isFinite(xp) ? xp : 1e6, mid: exact ? null : 0.5 };
}

/** Converte o texto de um operando para o formato (modo rne, como uma constante no programa). */
export function operand(fmtId, text, opts = {}) {
    const r = fromText(fmtId, text, 'rne', opts);
    if (!r) return null;
    return { text, bits: r.bits, flags: r.flags, ...describe(fmtId, r.bits), fields: fields(fmtId, r.bits) };
}

const OP_MNEMONIC = { add: 'fadd', sub: 'fsub', mul: 'fmul', div: 'fdiv', sqrt: 'fsqrt', fma: 'fmadd' };

/** Instrução RISC-V equivalente (null para formatos sem instruções aritméticas padrão). */
export function instruction(op, fmtId, mode) {
    const f = getFormat(fmtId);
    if (!f.suffix) return null;
    const regs = { 1: 'fa0, fa1', 2: 'fa0, fa1, fa2', 3: 'fa0, fa1, fa2, fa3' }[core.ARITY[op]];
    return `${OP_MNEMONIC[op]}.${f.suffix} ${regs}, ${mode}`;
}

/** Tudo sobre uma operação: operandos, passos do hardware, resultado exato e os cinco modos. */
export function analyzeOperation(op, fmtId, texts, mode, opts = {}) {
    const f = getFormat(fmtId);
    const n = core.ARITY[op];
    const ops = texts.slice(0, n).map((t) => operand(fmtId, t, opts));
    if (ops.some((o) => !o)) return { error: 'operand', ops };
    const bits = ops.map((o) => o.bits);
    const trace = traceOp(op, fmtId, bits, mode, opts);
    const r = trace.result;
    const exact = r.exact ?? null;
    const res = {
        op, fmt: f, mode, ops, trace,
        instruction: instruction(op, fmtId, mode),
        ...describe(fmtId, r.bits),
        flags: r.flags,
        fields: fields(fmtId, r.bits),
        exactText: exact ? rationalText(exact.sign, exact.N, exact.D, 40) : null,
        err: exact ? errors(f, exact, r.bits) : null,
        sqrtInexact: op === 'sqrt' && !exact && r.rootApprox,
    };
    res.modes = ROUNDING_MODES.map((m) => {
        const x = core.operate(op, f, bits, m, opts);
        return { mode: m, ...describe(fmtId, x.bits), flags: x.flags, err: exact ? errors(f, exact, x.bits) : null };
    });
    if (op === 'fma') {
        const p = core.mul(f, bits[0], bits[1], mode, opts);
        const s = core.add(f, p.bits, bits[2], mode, opts);
        res.unfused = { product: describe(fmtId, p.bits), productFlags: p.flags, ...describe(fmtId, s.bits), flags: s.flags | p.flags, err: exact ? errors(f, exact, s.bits) : null };
    }
    res.neighbors = exact && exact.N !== 0n ? neighbors(fmtId, exact, opts) : null;
    res.explain = exact && exact.N !== 0n ? roundingExplain(fmtId, exact, opts) : null;
    return res;
}

export { FORMATS, FORMAT_IDS, ROUNDING_MODES };
