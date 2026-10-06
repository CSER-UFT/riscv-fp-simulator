/**
 * Núcleo de ponto flutuante com aritmética exata.
 *
 * Todo resultado é calculado primeiro de forma exata, como um racional N/D (BigInt), e só então arredondado
 * para o formato de destino, no modo pedido. Assim o simulador não depende do ponto flutuante do JavaScript
 * (que só tem double e só arredonda ao mais próximo) e trata da mesma forma todos os formatos e os cinco
 * modos de arredondamento do RISC-V.
 *
 * As regras seguem a IEEE 754 com as escolhas da especificação RISC-V (extensões F, D e Zfh):
 *   todo resultado NaN é o NaN canônico (sinal 0, expoente todo em 1, só o bit mais alto da fração em 1);
 *   a detecção de valor minúsculo (tininess) é feita depois do arredondamento;
 *   UF só é sinalizada quando o resultado é minúsculo e inexato;
 *   em fmadd, infinito vezes zero sinaliza NV mesmo quando a parcela somada é um NaN silencioso;
 *   conversões para inteiro saturam e sinalizam NV fora do intervalo; NaN vira o maior inteiro.
 * As flags usam os mesmos bits do fflags: NV 16, DZ 8, OF 4, UF 2, NX 1.
 */
import { getFormat } from './formats.js';

export const FLAG = Object.freeze({ NX: 1, UF: 2, OF: 4, DZ: 8, NV: 16 });
export const FLAG_NAMES = ['NV', 'DZ', 'OF', 'UF', 'NX'];

/** Nomes das flags ligadas em uma máscara, na ordem do fflags. */
export const flagList = (mask) => FLAG_NAMES.filter((n) => mask & FLAG[n]);

const fmtOf = (f) => (typeof f === 'string' ? getFormat(f) : f);

/** Número de bits de um BigInt positivo. */
export function bitLength(n) {
    return n === 0n ? 0 : n.toString(2).length;
}

const pow2 = (k) => 1n << BigInt(k);
const abs = (n) => (n < 0n ? -n : n);

// Codificação ---------------------------------------------------------------------------------------------------

export function encode(f, sign, expField, frac) {
    return (BigInt(sign) << BigInt(f.bits - 1)) | (BigInt(expField) << BigInt(f.fracBits)) | BigInt(frac);
}

export function canonicalNaN(fmt) {
    const f = fmtOf(fmt);
    if (!f.hasInf) return encode(f, 0, f.expMaxField, f.fracMask);
    return encode(f, 0, f.expMaxField, pow2(f.fracBits - 1));
}

export function infinity(fmt, sign) {
    const f = fmtOf(fmt);
    if (!f.hasInf) throw new Error('formato sem infinito');
    return encode(f, sign, f.expMaxField, 0n);
}

export function maxFinite(fmt, sign) {
    const f = fmtOf(fmt);
    return encode(f, sign, f.emax + f.bias, f.maxSig - pow2(f.p - 1));
}

export const zero = (fmt, sign) => encode(fmtOf(fmt), sign, 0, 0n);

/**
 * Decodifica um padrão de bits.
 * @returns {{fmt, bits: bigint, sign: number, expField: number, frac: bigint, cls: string, sig: bigint,
 *            exp: number, quiet: boolean}} para números finitos, valor = (-1)^sign × sig × 2^exp
 */
export function decode(fmt, bits) {
    const f = fmtOf(fmt);
    const b = BigInt.asUintN(f.bits, BigInt(bits));
    const sign = Number(b >> BigInt(f.bits - 1));
    const expField = Number((b >> BigInt(f.fracBits)) & BigInt(f.expMaxField));
    const frac = b & f.fracMask;
    const v = { fmt: f, bits: b, sign, expField, frac, cls: 'normal', sig: 0n, exp: 0, quiet: false };
    if (!f.hasInf && expField === f.expMaxField && frac === f.fracMask) {
        v.cls = 'nan';
        v.quiet = true;
    } else if (f.hasInf && expField === f.expMaxField) {
        if (frac === 0n) v.cls = 'inf';
        else {
            v.cls = 'nan';
            v.quiet = (frac >> BigInt(f.fracBits - 1)) === 1n;
        }
    } else if (expField === 0) {
        v.cls = frac === 0n ? 'zero' : 'subnormal';
        v.sig = frac;
        v.exp = f.emin - f.fracBits;
    } else {
        v.sig = frac | pow2(f.fracBits);
        v.exp = expField - f.bias - f.fracBits;
    }
    return v;
}

export const isNaN = (v) => v.cls === 'nan';
export const isSignalingNaN = (v) => v.cls === 'nan' && !v.quiet && v.fmt.hasInf;
export const isFinite = (v) => v.cls !== 'nan' && v.cls !== 'inf';

/** Valor exato de um número finito como racional {sign, N, D} (D potência de 2). */
export function toRational(v) {
    if (v.exp >= 0) return { sign: v.sign, N: v.sig << BigInt(v.exp), D: 1n };
    return { sign: v.sign, N: v.sig, D: pow2(-v.exp) };
}

/** Valor como número do JavaScript (exato para todos os formatos até double). */
export function toNumber(v) {
    if (v.cls === 'nan') return NaN;
    if (v.cls === 'inf') return v.sign ? -Infinity : Infinity;
    if (v.cls === 'zero') return v.sign ? -0 : 0;
    // sig tem no máximo 53 bits; a multiplicação por potência de 2 é exata, e dividir em duas etapas evita
    // passar por 2^-1074 diretamente (que perderia bits em subnormais de double).
    const s = Number(v.sig);
    const e = v.exp;
    const r = e < -1000 ? (s * 2 ** (e + 600)) * 2 ** -600 : s * 2 ** e;
    return v.sign ? -r : r;
}

// Arredondamento ---------------------------------------------------------------------------------------------

/** Compara 2·rem com D: -1 menos da metade, 0 exatamente a metade, 1 mais da metade. */
const halfCmp = (rem, D) => {
    const t = rem * 2n;
    return t < D ? -1 : t === D ? 0 : 1;
};

/** Se o significando truncado q deve ser incrementado. */
export function roundsUp(mode, sign, q, cmp, inexact) {
    if (!inexact) return false;
    switch (mode) {
        case 'rne': return cmp > 0 || (cmp === 0 && (q & 1n) === 1n);
        case 'rmm': return cmp >= 0;
        case 'rtz': return false;
        case 'rdn': return sign === 1;
        case 'rup': return sign === 0;
        default: throw new Error(`modo desconhecido: ${mode}`);
    }
}

/** Divide N·2^scale por D: quociente inteiro e resto (racional rem/D' com o mesmo D'). */
function scaledDiv(N, D, scale) {
    if (scale >= 0) {
        const n = N << BigInt(scale);
        return { q: n / D, rem: n % D, D };
    }
    const d = D << BigInt(-scale);
    return { q: N / d, rem: N % d, D: d };
}

/** Expoente e tal que 2^e ≤ N/D < 2^(e+1). */
export function floorLog2(N, D) {
    let e = bitLength(N) - bitLength(D);
    const ge = (k) => (k >= 0 ? N >= D << BigInt(k) : N << BigInt(-k) >= D);
    if (!ge(e)) e--;
    return e;
}

/** Resultado de estouro conforme o modo e o sinal. */
function overflowBits(f, sign, mode, sat) {
    const toInf = mode === 'rne' || mode === 'rmm' || (mode === 'rdn' && sign === 1) || (mode === 'rup' && sign === 0);
    if (sat || !toInf) return maxFinite(f, sign);
    return f.hasInf ? infinity(f, sign) : canonicalNaN(f);
}

/**
 * Arredonda o racional positivo N/D (com o sinal dado) para o formato, no modo pedido.
 * @param {object} opts sat: em formatos de 8 bits, satura no maior finito em vez de produzir infinito ou NaN
 * @returns {{bits: bigint, flags: number, info: object}} info descreve o arredondamento: q (bits mantidos,
 *   com o implícito), lsbExp (expoente do bit menos significativo de q antes do incremento), guard, round e
 *   sticky, cmp, up, tiny, overflow
 */
export function roundRational(fmt, sign, N, D, mode, opts = {}) {
    const f = fmtOf(fmt);
    if (N === 0n) return { bits: zero(f, sign), flags: 0, info: { exactZero: true } };
    const e = floorLog2(N, D);
    const p = f.p;

    // Arredondamento com expoente ilimitado, só para detectar valor minúsculo depois do arredondamento.
    let E1 = e;
    {
        const { q, rem, D: d } = scaledDiv(N, D, p - 1 - e);
        let q1 = q;
        if (roundsUp(mode, sign, q, halfCmp(rem, d), rem !== 0n)) q1 += 1n;
        if (q1 === pow2(p)) E1++;
    }
    const tiny = E1 < f.emin;

    // Arredondamento no formato: abaixo de emin, o bit menos significativo fica fixo (subnormais).
    let E = Math.max(e, f.emin);
    const lsbExp = E - (p - 1);
    const { q, rem, D: d } = scaledDiv(N, D, p - 1 - E);
    const inexact = rem !== 0n;
    const cmp = halfCmp(rem, d);
    const four = rem * 4n;
    const guard = Number(four / d) >> 1;
    const round = Number(four / d) & 1;
    const sticky = four % d !== 0n ? 1 : 0;
    const up = roundsUp(mode, sign, q, cmp, inexact);
    let q2 = up ? q + 1n : q;
    if (q2 === pow2(p)) {
        q2 >>= 1n;
        E++;
    }
    const info = { e, E, q, lsbExp, guard, round, sticky, cmp, up, inexact, tiny, overflow: false };

    let flags = inexact ? FLAG.NX : 0;
    if (E > f.emax || (E === f.emax && q2 > f.maxSig)) {
        info.overflow = true;
        return { bits: overflowBits(f, sign, mode, opts.sat), flags: FLAG.OF | FLAG.NX, info };
    }
    if (tiny && inexact) flags |= FLAG.UF;
    let bits;
    if (q2 >= pow2(p - 1)) bits = encode(f, sign, E + f.bias, q2 - pow2(p - 1));
    else bits = encode(f, sign, 0, q2);
    return { bits, flags, info };
}

// Operações --------------------------------------------------------------------------------------------------

const nanResult = (f, flags) => ({ bits: canonicalNaN(f), flags });

/** Resultado de um zero exato: soma de valores opostos dá +0, exceto no modo rdn (-0). */
const exactZeroSign = (mode) => (mode === 'rdn' ? 1 : 0);

function finish(f, sign, N, D, mode, opts, extra = {}) {
    const r = roundRational(f, sign, N, D, mode, opts);
    return { ...r, exact: { sign, N, D }, ...extra };
}

/** Soma exata de dois valores finitos dados como sig·2^exp com sinal: retorna {S (BigInt com sinal), exp}. */
function exactSum(sa, siga, ea, sb, sigb, eb) {
    const e = Math.min(ea, eb);
    const A = (sa ? -siga : siga) << BigInt(ea - e);
    const B = (sb ? -sigb : sigb) << BigInt(eb - e);
    return { S: A + B, exp: e };
}

const ratFromSigExp = (m, e) => (e >= 0 ? { N: m << BigInt(e), D: 1n } : { N: m, D: pow2(-e) });

/**
 * Operações com os bits dos operandos (BigInt). Retornam {bits, flags} e, quando há um resultado finito
 * calculado, exact ({sign, N, D}, o valor exato antes do arredondamento) e info do arredondamento.
 */
export function add(fmt, aBits, bBits, mode, opts = {}) {
    const f = fmtOf(fmt);
    const a = decode(f, aBits), b = decode(f, bBits);
    return addValues(f, a, b, mode, opts);
}

function addValues(f, a, b, mode, opts) {
    if (a.cls === 'nan' || b.cls === 'nan') return nanResult(f, isSignalingNaN(a) || isSignalingNaN(b) ? FLAG.NV : 0);
    if (a.cls === 'inf' || b.cls === 'inf') {
        if (a.cls === 'inf' && b.cls === 'inf' && a.sign !== b.sign) return nanResult(f, FLAG.NV);
        return { bits: infinity(f, a.cls === 'inf' ? a.sign : b.sign), flags: 0 };
    }
    const { S, exp } = exactSum(a.sign, a.sig, a.exp, b.sign, b.sig, b.exp);
    if (S === 0n) {
        const sign = a.cls === 'zero' && b.cls === 'zero' && a.sign === b.sign ? a.sign : exactZeroSign(mode);
        return { bits: zero(f, sign), flags: 0, exact: { sign, N: 0n, D: 1n } };
    }
    const { N, D } = ratFromSigExp(abs(S), exp);
    return finish(f, S < 0n ? 1 : 0, N, D, mode, opts);
}

export function sub(fmt, aBits, bBits, mode, opts = {}) {
    const f = fmtOf(fmt);
    const b = decode(f, bBits);
    // Subtrair é somar com o sinal trocado; para NaN o sinal não importa (o resultado é canônico).
    return addValues(f, decode(f, aBits), { ...b, sign: b.sign ^ 1 }, mode, opts);
}

export function mul(fmt, aBits, bBits, mode, opts = {}) {
    const f = fmtOf(fmt);
    const a = decode(f, aBits), b = decode(f, bBits);
    const sign = a.sign ^ b.sign;
    if (a.cls === 'nan' || b.cls === 'nan') return nanResult(f, isSignalingNaN(a) || isSignalingNaN(b) ? FLAG.NV : 0);
    if (a.cls === 'inf' || b.cls === 'inf') {
        if (a.cls === 'zero' || b.cls === 'zero') return nanResult(f, FLAG.NV);
        return { bits: infinity(f, sign), flags: 0 };
    }
    if (a.cls === 'zero' || b.cls === 'zero') return { bits: zero(f, sign), flags: 0, exact: { sign, N: 0n, D: 1n } };
    const { N, D } = ratFromSigExp(a.sig * b.sig, a.exp + b.exp);
    return finish(f, sign, N, D, mode, opts);
}

export function div(fmt, aBits, bBits, mode, opts = {}) {
    const f = fmtOf(fmt);
    const a = decode(f, aBits), b = decode(f, bBits);
    const sign = a.sign ^ b.sign;
    if (a.cls === 'nan' || b.cls === 'nan') return nanResult(f, isSignalingNaN(a) || isSignalingNaN(b) ? FLAG.NV : 0);
    if (a.cls === 'inf') {
        if (b.cls === 'inf') return nanResult(f, FLAG.NV);
        return { bits: infinity(f, sign), flags: 0 };
    }
    if (b.cls === 'inf') return { bits: zero(f, sign), flags: 0, exact: { sign, N: 0n, D: 1n } };
    if (b.cls === 'zero') {
        if (a.cls === 'zero') return nanResult(f, FLAG.NV);
        return { bits: f.hasInf ? infinity(f, sign) : canonicalNaN(f), flags: FLAG.DZ };
    }
    if (a.cls === 'zero') return { bits: zero(f, sign), flags: 0, exact: { sign, N: 0n, D: 1n } };
    // (siga·2^ea) / (sigb·2^eb) = siga·2^(ea-eb) / sigb
    const k = a.exp - b.exp;
    const N = k >= 0 ? a.sig << BigInt(k) : a.sig;
    const D = k >= 0 ? b.sig : b.sig << BigInt(-k);
    return finish(f, sign, N, D, mode, opts);
}

/** Raiz quadrada inteira (piso). */
export function isqrt(n) {
    if (n < 2n) return n;
    let x = pow2(Math.ceil(bitLength(n) / 2));
    for (;;) {
        const y = (x + n / x) >> 1n;
        if (y >= x) return x;
        x = y;
    }
}

export function sqrt(fmt, aBits, mode, opts = {}) {
    const f = fmtOf(fmt);
    const a = decode(f, aBits);
    if (a.cls === 'nan') return nanResult(f, isSignalingNaN(a) ? FLAG.NV : 0);
    if (a.cls === 'zero') return { bits: a.bits, flags: 0, exact: { sign: a.sign, N: 0n, D: 1n } };
    if (a.sign === 1) return nanResult(f, FLAG.NV);
    if (a.cls === 'inf') return { bits: a.bits, flags: 0 };
    // sqrt(sig·2^exp): com exp par, = sqrt(sig·2^(2k))·2^((exp-2k)/2). Escolhe k para que a raiz inteira
    // tenha pelo menos p + 3 bits; o resto diferente de zero vira um bit a mais (sticky) e garante o
    // arredondamento correto em todos os modos.
    let m = a.sig, e = a.exp;
    if (e % 2 !== 0) { m <<= 1n; e -= 1; }
    let k = Math.max(0, f.p + 4 - Math.floor(bitLength(m) / 2));
    m <<= BigInt(2 * k);
    e -= 2 * k;
    const r = isqrt(m);
    const exactRoot = r * r === m;
    const rr = exactRoot ? r * 2n : r * 2n + 1n;
    const { N, D } = ratFromSigExp(rr, e / 2 - 1);
    const res = finish(f, 0, N, D, mode, opts);
    // O racional acima é o valor exato só quando a raiz é exata; senão é uma aproximação com sticky.
    res.exact = exactRoot ? res.exact : null;
    res.rootApprox = { N, D };
    return res;
}

/** a × b + c com um único arredondamento (fmadd). */
export function fma(fmt, aBits, bBits, cBits, mode, opts = {}) {
    const f = fmtOf(fmt);
    const a = decode(f, aBits), b = decode(f, bBits), c = decode(f, cBits);
    const ps = a.sign ^ b.sign;
    const infTimesZero = (a.cls === 'inf' && b.cls === 'zero') || (a.cls === 'zero' && b.cls === 'inf');
    if (infTimesZero) return nanResult(f, FLAG.NV);
    if (a.cls === 'nan' || b.cls === 'nan' || c.cls === 'nan')
        return nanResult(f, [a, b, c].some(isSignalingNaN) ? FLAG.NV : 0);
    const pInf = a.cls === 'inf' || b.cls === 'inf';
    if (pInf) {
        if (c.cls === 'inf' && c.sign !== ps) return nanResult(f, FLAG.NV);
        return { bits: infinity(f, ps), flags: 0 };
    }
    if (c.cls === 'inf') return { bits: c.bits, flags: 0 };
    const pZero = a.cls === 'zero' || b.cls === 'zero';
    const { S, exp } = pZero
        ? exactSum(0, 0n, c.exp, c.sign, c.sig, c.exp)
        : exactSum(ps, a.sig * b.sig, a.exp + b.exp, c.sign, c.sig, c.exp);
    if (S === 0n) {
        const sign = pZero && c.cls === 'zero' && ps === c.sign ? ps : exactZeroSign(mode);
        return { bits: zero(f, sign), flags: 0, exact: { sign, N: 0n, D: 1n } };
    }
    const { N, D } = ratFromSigExp(abs(S), exp);
    return finish(f, S < 0n ? 1 : 0, N, D, mode, opts);
}

/** Operação pelo nome: add, sub, mul, div, sqrt, fma. */
export function operate(op, fmt, operands, mode, opts = {}) {
    const [a, b, c] = operands;
    switch (op) {
        case 'add': return add(fmt, a, b, mode, opts);
        case 'sub': return sub(fmt, a, b, mode, opts);
        case 'mul': return mul(fmt, a, b, mode, opts);
        case 'div': return div(fmt, a, b, mode, opts);
        case 'sqrt': return sqrt(fmt, a, mode, opts);
        case 'fma': return fma(fmt, a, b, c, mode, opts);
        default: throw new Error(`operação desconhecida: ${op}`);
    }
}

export const ARITY = { add: 2, sub: 2, mul: 2, div: 2, sqrt: 1, fma: 3 };

// Conversões -------------------------------------------------------------------------------------------------

/** Converte um valor entre formatos (fcvt.s.d e semelhantes). */
export function convert(fromFmt, bits, toFmt, mode, opts = {}) {
    const to = fmtOf(toFmt);
    const v = decode(fromFmt, bits);
    if (v.cls === 'nan') return nanResult(to, isSignalingNaN(v) ? FLAG.NV : 0);
    if (v.cls === 'inf') {
        if (to.hasInf) return { bits: infinity(to, v.sign), flags: 0 };
        // E4M3 não representa infinito: NaN (operação inválida) ou, saturando, o maior finito.
        return opts.sat ? { bits: maxFinite(to, v.sign), flags: FLAG.NX } : nanResult(to, FLAG.NV);
    }
    if (v.cls === 'zero') return { bits: zero(to, v.sign), flags: 0, exact: { sign: v.sign, N: 0n, D: 1n } };
    const { N, D } = toRational(v);
    return finish(to, v.sign, N, D, mode, opts);
}

/** Converte um racional exato (por exemplo, lido de um texto decimal). */
export function fromRational(fmt, sign, N, D, mode, opts = {}) {
    const f = fmtOf(fmt);
    if (N === 0n) return { bits: zero(f, sign), flags: 0, exact: { sign, N: 0n, D: 1n } };
    return finish(f, sign, N, D, mode, opts);
}

export const INT_TYPES = {
    w: { bits: 32, signed: true },
    wu: { bits: 32, signed: false },
    l: { bits: 64, signed: true },
    lu: { bits: 64, signed: false },
};

/** Arredonda um racional para inteiro no modo dado. */
export function roundToInteger(sign, N, D, mode) {
    const q = N / D, rem = N % D;
    const up = roundsUp(mode, sign, q, halfCmp(rem, D), rem !== 0n);
    const m = up ? q + 1n : q;
    return { value: sign ? -m : m, inexact: rem !== 0n };
}

/**
 * Conversão para inteiro (fcvt.w.s, fcvt.wu.s, fcvt.l.s, fcvt.lu.s): fora do intervalo ou NaN, satura e
 * sinaliza NV (NaN e +∞ dão o maior valor; -∞ dá o menor).
 */
export function toInteger(fmt, bits, type, mode) {
    const it = INT_TYPES[type];
    const max = it.signed ? pow2(it.bits - 1) - 1n : pow2(it.bits) - 1n;
    const min = it.signed ? -pow2(it.bits - 1) : 0n;
    const v = decode(fmt, bits);
    if (v.cls === 'nan') return { value: max, flags: FLAG.NV };
    if (v.cls === 'inf') return { value: v.sign ? min : max, flags: FLAG.NV };
    if (v.cls === 'zero') return { value: 0n, flags: 0 };
    const { sign, N, D } = toRational(v);
    const r = roundToInteger(sign, N, D, mode);
    if (r.value > max) return { value: max, flags: FLAG.NV };
    if (r.value < min) return { value: min, flags: FLAG.NV };
    return { value: r.value, flags: r.inexact ? FLAG.NX : 0 };
}

/** Conversão de inteiro (BigInt) para ponto flutuante (fcvt.s.w e semelhantes). */
export function fromInteger(fmt, value, mode, opts = {}) {
    const sign = value < 0n ? 1 : 0;
    return fromRational(fmt, sign, abs(value), 1n, mode, opts);
}

// Vizinhos, ULP e classificação ------------------------------------------------------------------------------

/** Próximo valor representável acima (nextUp). Para NaN, devolve o próprio NaN. */
export function nextUp(fmt, bits) {
    const f = fmtOf(fmt);
    const v = decode(f, bits);
    if (v.cls === 'nan') return v.bits;
    if (v.cls === 'inf') return v.sign ? maxFinite(f, 1) : v.bits;
    if (v.cls === 'zero') return 1n;
    if (v.sign === 0) {
        if (v.bits === maxFinite(f, 0)) return f.hasInf ? infinity(f, 0) : v.bits;
        return v.bits + 1n;
    }
    const mag = v.bits & ~f.signBit;
    return mag === 1n ? zero(f, 0) : v.bits - 1n;
}

export function nextDown(fmt, bits) {
    const f = fmtOf(fmt);
    const neg = (b) => b ^ f.signBit;
    return neg(nextUp(f, neg(BigInt(bits))));
}

/** Distância até o próximo valor de magnitude maior (ULP do valor), como racional {N, D}. */
export function ulp(fmt, bits) {
    const f = fmtOf(fmt);
    const v = decode(f, bits);
    const e = v.cls === 'zero' || v.cls === 'subnormal' ? f.emin - f.fracBits : v.exp;
    return ratFromSigExp(1n, e);
}

/** Classes na ordem do resultado de fclass do RISC-V (bit i ligado para a classe i). */
export const FCLASS = ['-inf', '-normal', '-subnormal', '-zero', '+zero', '+subnormal', '+normal', '+inf', 'snan', 'qnan'];

export function fclass(fmt, bits) {
    const v = decode(fmt, bits);
    if (v.cls === 'nan') return v.quiet ? 9 : 8;
    const s = v.sign ? '-' : '+';
    return FCLASS.indexOf(`${s}${v.cls}`);
}
