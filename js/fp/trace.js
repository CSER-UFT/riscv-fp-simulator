/**
 * Passos do hardware de ponto flutuante, para exibição (Patterson e Hennessy, capítulo 3).
 *
 * Soma e subtração seguem o caminho de dados clássico: desempacota, troca para que o primeiro operando seja
 * o de maior magnitude, alinha o menor com três bits extras (guard, round e sticky, este acumulando todos os
 * bits que saem pela direita), soma ou subtrai, normaliza, arredonda e renormaliza se o arredondamento
 * gerar vai um. Multiplicação, divisão, raiz e fmadd calculam o significando com bits de sobra (e um bit
 * de sticky quando a conta não é exata) e passam pelo mesmo passo de normalização e arredondamento.
 *
 * Estes passos são uma segunda implementação, independente do núcleo (core.js): os testes conferem que o
 * resultado de cada traço é igual ao do núcleo. As flags exibidas vêm do núcleo.
 */
import { getFormat } from './formats.js';
import * as core from './core.js';

const pow2 = (k) => 1n << BigInt(k);
const bitLength = core.bitLength;

/**
 * Registro exibido: valor inteiro `v` com `w` bits depois da vírgula, `int` bits antes dela e `extra` bits
 * separados no fim (G, R, S). Sinal e expoente opcionais.
 */
const reg = (label, v, { int = 1, w, extra = 0, sign = null, exp = null } = {}) => ({ label, v, int, w, extra, sign, exp });

/** Operando desempacotado: significando com o bit implícito e expoente do bit implícito. */
function unpack(f, bits, label) {
    const d = core.decode(f, bits);
    const hidden = d.cls === 'normal' ? 1 : 0;
    const E = d.cls === 'normal' ? d.expField - f.bias : f.emin;
    return { label, d, sign: d.sign, sig: d.sig, E, hidden, cls: d.cls };
}

/** Resultado especial (NaN, infinito, zero) decidido sem passar pelo caminho de dados. */
function special(f, op, ops, mode, opts, reason) {
    const r = core.operate(op, f, ops.map((o) => o.d.bits), mode, opts);
    return { special: reason, steps: [], resultBits: r.bits };
}

function specialReason(op, ops) {
    const cls = ops.map((o) => o.cls);
    if (cls.includes('nan')) return 'nan';
    if (op === 'sqrt' && ops[0].sign === 1 && cls[0] !== 'zero') return 'sqrtNeg';
    if (cls.includes('inf')) return 'inf';
    return null;
}

/** Codifica (sinal, expoente do bit implícito, significando de p bits) ou trata estouro. */
function encodeResult(f, sign, E, kept, mode, opts) {
    if (E > f.emax || (E === f.emax && kept > f.maxSig)) {
        const toInf = mode === 'rne' || mode === 'rmm' || (mode === 'rdn' && sign === 1) || (mode === 'rup' && sign === 0);
        const bits = opts.sat || !toInf ? core.maxFinite(f, sign) : (f.hasInf ? core.infinity(f, sign) : core.canonicalNaN(f));
        return { bits, overflow: true };
    }
    if (kept >= pow2(f.p - 1)) return { bits: core.encode(f, sign, E + f.bias, kept - pow2(f.p - 1)), overflow: false };
    return { bits: core.encode(f, sign, 0, kept), overflow: false };
}

/** Decide o incremento pelos bits G, R e S (e o bit menos significativo, para o empate). */
function decide(mode, sign, lsb, G, R, S) {
    const any = G | R | S;
    switch (mode) {
        case 'rne': return G === 1 && (R | S | lsb) === 1;
        case 'rmm': return G === 1;
        case 'rtz': return false;
        case 'rdn': return any === 1 && sign === 1;
        case 'rup': return any === 1 && sign === 0;
        default: throw new Error(mode);
    }
}

/**
 * Normaliza um significando exato v/2^w (com expoente E do bit de peso 2^0), arredonda para p bits e monta o
 * resultado. Acrescenta os passos de normalização e arredondamento.
 */
function normalizeRound(f, sign, v, w, E, mode, opts, steps, stickyLabel = null) {
    const F = f.fracBits;
    // Posição do 1 mais à esquerda: valor em [1, 2) depois de ajustar E.
    const lead = bitLength(v) - 1 - w; // v/2^w está em [2^lead, 2^(lead+1))
    let E1 = E + lead;
    let w1 = w + lead; // agora v/2^w1 está em [1, 2)
    let shiftNote = { by: lead };
    let denorm = 0;
    if (E1 < f.emin) {
        denorm = f.emin - E1;
        w1 += denorm;
        E1 = f.emin;
    }
    // Garante pelo menos F + 3 bits depois da vírgula, para separar G, R e S.
    let vv = v;
    if (w1 < F + 3) {
        vv <<= BigInt(F + 3 - w1);
        w1 = F + 3;
    }
    steps.push({ key: 'normalize', params: { shift: shiftNote.by, E: E1, denorm, sticky: stickyLabel }, regs: [reg('norm', vv, { w: w1, sign, exp: E1 })] });
    const low = w1 - F;
    const kept = vv >> BigInt(low);
    const rest = vv & (pow2(low) - 1n);
    const G = Number(rest >> BigInt(low - 1));
    const R = Number((rest >> BigInt(low - 2)) & 1n);
    const S = (rest & (pow2(low - 2) - 1n)) !== 0n ? 1 : 0;
    return roundAndPack(f, sign, kept, E1, G, R, S, mode, opts, steps);
}

function roundAndPack(f, sign, kept, E, G, R, S, mode, opts, steps) {
    const lsb = Number(kept & 1n);
    const up = decide(mode, sign, lsb, G, R, S);
    let k2 = up ? kept + 1n : kept;
    let E2 = E;
    steps.push({ key: 'round', params: { G, R, S, lsb, up, mode, inexact: (G | R | S) === 1 }, regs: [reg('kept', kept, { w: f.fracBits, sign, exp: E }), reg('rounded', k2, { w: f.fracBits, sign, exp: E })] });
    if (k2 === pow2(f.p)) {
        k2 >>= 1n;
        E2++;
        steps.push({ key: 'renormalize', params: { E: E2 }, regs: [reg('rounded', k2, { w: f.fracBits, sign, exp: E2 })] });
    }
    const enc = encodeResult(f, sign, E2, k2, mode, opts);
    steps.push({ key: enc.overflow ? 'overflow' : (k2 < pow2(f.p - 1) ? 'packSubnormal' : (k2 === 0n ? 'packZero' : 'pack')), params: { E: E2, bits: enc.bits } });
    return enc.bits;
}

// Soma e subtração -------------------------------------------------------------------------------------------

function addTrace(f, a, b, subtract, mode, opts) {
    const steps = [];
    const sb = subtract ? b.sign ^ 1 : b.sign;
    steps.push({ key: 'unpack', regs: [reg('a', a.sig, { w: f.fracBits, sign: a.sign, exp: a.E }), reg('b', b.sig, { w: f.fracBits, sign: b.sign, exp: b.E })], params: { subtract } });
    let big = { ...a }, small = { ...b, sign: sb };
    const swap = b.E > a.E || (b.E === a.E && b.sig > a.sig);
    if (swap) [big, small] = [small, big];
    if (swap) steps.push({ key: 'swap', params: {} });
    const d = big.E - small.E;
    const X = big.sig << 3n;
    const Y0 = small.sig << 3n;
    let Y = d >= bitLength(Y0) + 1 ? 0n : Y0 >> BigInt(d);
    const lost = d === 0 ? 0n : Y0 & (pow2(Math.min(d, bitLength(Y0) + 1)) - 1n);
    const sticky = lost !== 0n;
    if (sticky) Y |= 1n;
    steps.push({ key: 'align', params: { d, sticky }, regs: [reg('big', X, { w: f.fracBits + 3, extra: 3, sign: big.sign, exp: big.E }), reg('aligned', Y, { w: f.fracBits + 3, extra: 3, sign: small.sign, exp: big.E })] });
    const same = big.sign === small.sign;
    let Z = same ? X + Y : X - Y;
    let E = big.E;
    const sign = big.sign;
    steps.push({ key: same ? 'addSig' : 'subSig', regs: [reg('sum', Z, { int: 2, w: f.fracBits + 3, extra: 3, sign, exp: E })] });
    if (Z === 0n) {
        const zs = a.sig === 0n && b.sig === 0n && a.sign === sb ? a.sign : (mode === 'rdn' ? 1 : 0);
        const bits = core.zero(f, zs);
        steps.push({ key: 'exactZero', params: { sign: zs, bits } });
        return { steps, resultBits: bits };
    }
    // Normalização: vai um desloca 1 para a direita (o bit que sai vai para o sticky); zeros à esquerda
    // deslocam para a esquerda enquanto o expoente permitir.
    const top = pow2(f.p + 2); // 1.xxx com 3 bits extras
    let shift = 0;
    if (Z >= top << 1n) {
        Z = (Z >> 1n) | (Z & 1n);
        E++;
        shift = -1;
    } else {
        while (Z < top && E > f.emin) {
            Z <<= 1n;
            E--;
            shift++;
        }
    }
    steps.push({ key: 'normalizeAdd', params: { shift, E, subnormal: Z < top }, regs: [reg('norm', Z, { w: f.fracBits + 3, extra: 3, sign, exp: E })] });
    const kept = Z >> 3n;
    const G = Number((Z >> 2n) & 1n), R = Number((Z >> 1n) & 1n), S = Number(Z & 1n);
    const bits = roundAndPack(f, sign, kept, E, G, R, S, mode, opts, steps);
    return { steps, resultBits: bits };
}

// Multiplicação, divisão, raiz e fmadd ------------------------------------------------------------------------

function mulTrace(f, a, b, mode, opts) {
    const steps = [];
    const sign = a.sign ^ b.sign;
    steps.push({ key: 'unpack', regs: [reg('a', a.sig, { w: f.fracBits, sign: a.sign, exp: a.E }), reg('b', b.sig, { w: f.fracBits, sign: b.sign, exp: b.E })] });
    steps.push({ key: 'mulExp', params: { Ea: a.E, Eb: b.E, E: a.E + b.E, bias: f.bias, sign } });
    const P = a.sig * b.sig;
    steps.push({ key: 'mulSig', regs: [reg('product', P, { int: 2, w: 2 * f.fracBits, sign, exp: a.E + b.E })] });
    const bits = normalizeRound(f, sign, P, 2 * f.fracBits, a.E + b.E, mode, opts, steps);
    return { steps, resultBits: bits };
}

/** Desloca um significando subnormal até o bit implícito, ajustando o expoente. */
function normalizeOperand(o, f) {
    let sig = o.sig, E = o.E, sh = 0;
    while (sig < pow2(f.fracBits)) { sig <<= 1n; E--; sh++; }
    return { ...o, sig, E, sh };
}

function divTrace(f, a0, b0, mode, opts) {
    const steps = [];
    const sign = a0.sign ^ b0.sign;
    steps.push({ key: 'unpack', regs: [reg('a', a0.sig, { w: f.fracBits, sign: a0.sign, exp: a0.E }), reg('b', b0.sig, { w: f.fracBits, sign: b0.sign, exp: b0.E })] });
    const a = normalizeOperand(a0, f), b = normalizeOperand(b0, f);
    if (a.sh || b.sh) steps.push({ key: 'normOperands', params: { sa: a.sh, sb: b.sh }, regs: [reg('a', a.sig, { w: f.fracBits, exp: a.E }), reg('b', b.sig, { w: f.fracBits, exp: b.E })] });
    steps.push({ key: 'divExp', params: { Ea: a.E, Eb: b.E, E: a.E - b.E, sign } });
    const K = f.p + 3;
    const num = a.sig << BigInt(K);
    const q = num / b.sig, r = num % b.sig;
    steps.push({ key: 'divSig', params: { remainder: r !== 0n }, regs: [reg('quotient', q, { int: 2, w: K, sign, exp: a.E - b.E }), reg('remainder', r, { int: 0, w: f.p + 1 })] });
    const v = (q << 1n) | (r !== 0n ? 1n : 0n);
    const bits = normalizeRound(f, sign, v, K + 1, a.E - b.E, mode, opts, steps, r !== 0n ? 'remainder' : null);
    return { steps, resultBits: bits };
}

function sqrtTrace(f, a0, mode, opts) {
    const steps = [];
    steps.push({ key: 'unpack', regs: [reg('a', a0.sig, { w: f.fracBits, sign: a0.sign, exp: a0.E })] });
    let a = normalizeOperand(a0, f);
    if (a.sh) steps.push({ key: 'normOperands', params: { sa: a.sh, sb: 0 }, regs: [reg('a', a.sig, { w: f.fracBits, exp: a.E })] });
    let sig = a.sig, E = a.E, odd = false;
    if (E % 2 !== 0) { sig <<= 1n; E -= 1; odd = true; }
    // sig/2^F está em [1, 4); raiz com K bits depois da vírgula: isqrt(sig · 2^(2K - F)).
    const K = f.p + 3;
    const M = sig << BigInt(2 * K - f.fracBits);
    const root = core.isqrt(M);
    const r = M - root * root;
    steps.push({ key: 'sqrtExp', params: { E: a.E, odd, half: E / 2 }, regs: odd ? [reg('a', sig, { int: 2, w: f.fracBits, exp: E })] : [] });
    steps.push({ key: 'sqrtSig', params: { remainder: r !== 0n }, regs: [reg('root', root, { w: K })] });
    const v = (root << 1n) | (r !== 0n ? 1n : 0n);
    const bits = normalizeRound(f, 0, v, K + 1, E / 2, mode, opts, steps, r !== 0n ? 'remainder' : null);
    return { steps, resultBits: bits };
}

function fmaTrace(f, a, b, c, mode, opts) {
    const steps = [];
    const ps = a.sign ^ b.sign;
    steps.push({ key: 'unpack', regs: [reg('a', a.sig, { w: f.fracBits, sign: a.sign, exp: a.E }), reg('b', b.sig, { w: f.fracBits, sign: b.sign, exp: b.E }), reg('c', c.sig, { w: f.fracBits, sign: c.sign, exp: c.E })] });
    const P = a.sig * b.sig;
    const EP = a.E + b.E;
    steps.push({ key: 'fmaProduct', regs: [reg('product', P, { int: 2, w: 2 * f.fracBits, sign: ps, exp: EP })] });
    // Soma exata do produto (2F bits de fração) com c (F bits), alinhados no menor expoente do bit menos
    // significativo: nada é descartado antes do único arredondamento.
    const lp = EP - 2 * f.fracBits, lc = c.E - f.fracBits;
    const l = Math.min(lp, lc);
    const A = (ps ? -P : P) << BigInt(lp - l);
    const C = (c.sign ? -c.sig : c.sig) << BigInt(lc - l);
    const S = A + C;
    const w = -l; // valor = S · 2^l
    steps.push({ key: 'fmaAdd', params: { shift: Math.abs(lp - lc) }, regs: [reg('sum', S < 0n ? -S : S, { int: Math.max(1, bitLength(S < 0n ? -S : S) - w), w: Math.max(0, w), sign: S < 0n ? 1 : 0, exp: 0 })] });
    if (S === 0n) {
        const pZero = a.sig === 0n || b.sig === 0n;
        const zs = pZero && c.sig === 0n && ps === c.sign ? ps : (mode === 'rdn' ? 1 : 0);
        const bits = core.zero(f, zs);
        steps.push({ key: 'exactZero', params: { sign: zs, bits } });
        return { steps, resultBits: bits };
    }
    const sign = S < 0n ? 1 : 0;
    const mag = S < 0n ? -S : S;
    const bits = w >= 0
        ? normalizeRound(f, sign, mag, w, 0, mode, opts, steps)
        : normalizeRound(f, sign, mag << BigInt(-w), 0, 0, mode, opts, steps);
    return { steps, resultBits: bits };
}

/**
 * Traço de uma operação. ops são os bits dos operandos.
 * @returns {{op, fmt, mode, operands, special: string|null, steps: object[], resultBits: bigint,
 *            result: {bits, flags}}} result vem do núcleo (com as flags)
 */
export function traceOp(op, fmtId, opsBits, mode, opts = {}) {
    const f = getFormat(fmtId);
    const ops = opsBits.slice(0, core.ARITY[op]).map((bits, i) => unpack(f, bits, 'abc'[i]));
    const result = core.operate(op, f, ops.map((o) => o.d.bits), mode, opts);
    const reason = specialReason(op, ops);
    let tr;
    if (reason) tr = special(f, op, ops, mode, opts, reason);
    else if (op === 'mul' && ops.some((o) => o.cls === 'zero')) tr = special(f, op, ops, mode, opts, 'zero');
    else if (op === 'div' && ops[1].cls === 'zero') tr = special(f, op, ops, mode, opts, 'divZero');
    else if (op === 'div' && ops[0].cls === 'zero') tr = special(f, op, ops, mode, opts, 'zero');
    else if (op === 'sqrt' && ops[0].cls === 'zero') tr = special(f, op, ops, mode, opts, 'zero');
    else if (op === 'add' || op === 'sub') tr = addTrace(f, ops[0], ops[1], op === 'sub', mode, opts);
    else if (op === 'mul') tr = mulTrace(f, ops[0], ops[1], mode, opts);
    else if (op === 'div') tr = divTrace(f, ops[0], ops[1], mode, opts);
    else if (op === 'sqrt') tr = sqrtTrace(f, ops[0], mode, opts);
    else tr = fmaTrace(f, ops[0], ops[1], ops[2], mode, opts);
    return { op, fmt: f, mode, operands: ops, special: tr.special ?? null, steps: tr.steps, resultBits: tr.resultBits, result };
}
