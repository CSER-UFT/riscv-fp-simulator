/**
 * Oráculo independente para os formatos que o TestFloat não cobre (bfloat16, E5M2 e E4M3), e também para
 * half como controle: enumera todos os valores finitos do formato como múltiplos inteiros do menor
 * subnormal, calcula o resultado exato da operação e escolhe o vizinho por comparação racional, sem usar o
 * arredondamento do núcleo. Os formatos de 8 bits são testados exaustivamente nas operações de dois
 * operandos; bfloat16 e half, com operandos sorteados.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fp from '../js/fp/core.js';
import { FORMATS, ROUNDING_MODES } from '../js/fp/formats.js';

const FLAG = fp.FLAG;

/** Tabela do formato: magnitudes positivas finitas em unidades do menor subnormal, em ordem crescente. */
function table(f) {
    const ks = [];
    const nPos = Number(f.signBit);
    for (let i = 0; i < nPos; i++) {
        const E = i >> f.fracBits, F = BigInt(i & ((1 << f.fracBits) - 1));
        if (E === f.expMaxField && (f.hasInf || F === f.fracMask)) break;
        ks.push(E === 0 ? F : ((1n << BigInt(f.fracBits)) + F) << BigInt(E - 1));
    }
    const last = ks.length - 1;
    const EmaxF = f.emax + f.bias;
    // Valor logo depois do maior finito, na mesma grade: o arredondamento para ele é estouro.
    const beyond = (f.maxSig + 1n) << BigInt(EmaxF - 1);
    return { ks, last, beyond, minNormal: 1n << BigInt(f.fracBits) };
}

const TABLES = new Map();
const tab = (f) => (TABLES.has(f.id) ? TABLES.get(f.id) : TABLES.set(f.id, table(f)).get(f.id));

/** Valor (em unidades do menor subnormal) dos bits finitos, como {sign, k}. */
function unitValue(f, bits) {
    const sign = Number(bits >> BigInt(f.bits - 1));
    const i = Number(bits & ~f.signBit);
    return { sign, k: tab(f).ks[i] };
}

/** Escolha entre lo e hi (lo < X < hi, X = n/d) conforme o modo; tie quando X está no meio. */
function pick(mode, sign, X, lo, hi, loEven) {
    const [n, d] = X;
    const cmp = (n * 2n) - (lo + hi) * d; // compara 2X com lo + hi
    switch (mode) {
        case 'rtz': return 'lo';
        case 'rdn': return sign ? 'hi' : 'lo';
        case 'rup': return sign ? 'lo' : 'hi';
        case 'rne': return cmp < 0n ? 'lo' : cmp > 0n ? 'hi' : (loEven ? 'lo' : 'hi');
        case 'rmm': return cmp < 0n ? 'lo' : 'hi';
        default: throw new Error(mode);
    }
}

/**
 * Arredonda a magnitude exata X = n/d (em unidades do menor subnormal), com sinal, por enumeração.
 * @returns {{bits, flags}}
 */
function oracleRound(f, sign, n, d, mode, sat = false) {
    const t = tab(f);
    const sb = BigInt(sign) << BigInt(f.bits - 1);
    if (n === 0n) return { bits: sb, flags: 0 };
    // Maior índice com k ≤ X (busca binária).
    let a = 0, b = t.last;
    if (t.ks[b] * d <= n) a = b;
    else {
        while (b - a > 1) {
            const m = (a + b) >> 1;
            if (t.ks[m] * d <= n) a = m; else b = m;
        }
    }
    const exact = t.ks[a] * d === n;
    let flags = exact ? 0 : FLAG.NX;
    let idx = a;
    if (!exact) {
        const hiK = a === t.last ? t.beyond : t.ks[a + 1];
        const loEven = (a & 1) === 0;
        if (pick(mode, sign, [n, d], t.ks[a], hiK, loEven) === 'hi') idx = a + 1;
    }
    // Estouro: o arredondamento com expoente ilimitado passa do maior finito. Acima de `beyond` isso vale em
    // qualquer modo (mesmo quando o resultado entregue é o maior finito, como em rtz).
    if (idx > t.last || n >= t.beyond * d) {
        let bits;
        if (idx <= t.last || sat) bits = sb | BigInt(t.last);
        else if (f.hasInf) bits = sb | (BigInt(f.expMaxField) << BigInt(f.fracBits));
        else bits = fp.canonicalNaN(f);
        return { bits, flags: FLAG.OF | FLAG.NX };
    }
    // Minúsculo depois do arredondamento com expoente ilimitado: abaixo de 2^emin (minNormal unidades), a
    // grade ilimitada logo abaixo de minNormal tem passo 1/2.
    const K = t.minNormal;
    let tiny = n < K * d;
    if (tiny && n * 2n > (2n * K - 1n) * d) {
        // X entre (2K-1)/2 e K: decide se o arredondamento ilimitado chega a K (K é "par").
        if (pick(mode, sign, [n * 2n, d], 2n * K - 1n, 2n * K, false) === 'hi') tiny = false;
    }
    if (tiny && !exact) flags |= FLAG.UF;
    return { bits: sb | BigInt(idx), flags };
}

const unitsExp = (f) => f.emin - f.fracBits;

// Operações exatas em unidades u: a = ka·u, b = kb·u.
function oracleOp(f, op, A, B, C, mode) {
    const zeroSign = (sa, sb, same) => (same ? sa : (mode === 'rdn' ? 1 : 0));
    const U = BigInt(-unitsExp(f)); // u = 2^-U
    switch (op) {
        case 'add': case 'sub': {
            const sb = op === 'sub' ? B.sign ^ 1 : B.sign;
            const s = (A.sign ? -A.k : A.k) + (sb ? -B.k : B.k);
            if (s === 0n) return { bits: BigInt(zeroSign(A.sign, sb, A.k === 0n && B.k === 0n && A.sign === sb)) << BigInt(f.bits - 1), flags: 0 };
            return oracleRound(f, s < 0n ? 1 : 0, s < 0n ? -s : s, 1n, mode);
        }
        case 'mul': {
            // a·b = ka·kb·u² = (ka·kb·u)·u → em unidades: ka·kb / 2^U
            const sign = A.sign ^ B.sign;
            return oracleRound(f, sign, A.k * B.k, 1n << U, mode);
        }
        case 'div': {
            const sign = A.sign ^ B.sign;
            // a/b = ka/kb (adimensional) → em unidades: ka·2^U / kb
            return oracleRound(f, sign, A.k << U, B.k, mode);
        }
        case 'fma': {
            // a·b + c em unidades: (ka·kb + kc·2^U) / 2^U
            const p = (A.sign ^ B.sign ? -1n : 1n) * A.k * B.k;
            const s = p + (C.sign ? -C.k : C.k) * (1n << U);
            if (s === 0n) {
                const ps = A.sign ^ B.sign;
                const same = p === 0n && C.k === 0n && ps === C.sign;
                return { bits: BigInt(same ? ps : (mode === 'rdn' ? 1 : 0)) << BigInt(f.bits - 1), flags: 0 };
            }
            return oracleRound(f, s < 0n ? 1 : 0, s < 0n ? -s : s, 1n << U, mode);
        }
        default: throw new Error(op);
    }
}

/** Raiz por enumeração: maior candidato c com c² ≤ x, tudo em unidades. */
function oracleSqrt(f, A, mode) {
    const t = tab(f);
    const U = BigInt(-unitsExp(f));
    // sqrt(ka·u) em unidades = sqrt(ka·2^U). Compara c² com ka·2^U.
    const X = A.k << U;
    let a = 0, b = t.last;
    while (b - a > 1) {
        const m = (a + b) >> 1;
        if (t.ks[m] * t.ks[m] <= X) a = m; else b = m;
    }
    if (t.ks[b] * t.ks[b] <= X) a = b;
    const lo = t.ks[a];
    if (lo * lo === X) return { bits: BigInt(a), flags: 0 };
    const hi = a === t.last ? t.beyond : t.ks[a + 1];
    // Ponto médio m = (lo+hi)/2: sqrt(X) vs m ↔ 4X vs (lo+hi)².
    const c = 4n * X - (lo + hi) * (lo + hi);
    let up;
    if (mode === 'rtz' || mode === 'rdn') up = false;
    else if (mode === 'rup') up = true;
    else if (c !== 0n) up = c > 0n;
    else up = mode === 'rmm' || (a & 1) === 1;
    const idx = up ? a + 1 : a;
    // A raiz de um valor positivo do formato nunca estoura nem é minúscula nestes formatos.
    return { bits: BigInt(idx), flags: FLAG.NX };
}

const finiteBits = (f) => {
    const out = [];
    for (let i = 0n; i <= f.mask; i++) {
        const v = fp.decode(f, i);
        if (fp.isFinite(v)) out.push(i);
    }
    return out;
};

function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function compare(f, label, got, exp) {
    if (got.bits !== exp.bits || got.flags !== exp.flags)
        assert.fail(`${f.id} ${label}: esperado 0x${exp.bits.toString(16)} flags ${exp.flags}, obtido 0x${got.bits.toString(16)} flags ${got.flags}`);
}

for (const id of ['e4m3', 'e5m2']) {
    test(`oráculo ${id}: soma, subtração, multiplicação e divisão exaustivas, raiz e fma`, () => {
        const f = FORMATS[id];
        const all = finiteBits(f);
        let n = 0;
        for (const mode of ROUNDING_MODES) {
            for (const a of all) {
                const A = unitValue(f, a);
                for (const b of all) {
                    const B = unitValue(f, b);
                    for (const op of ['add', 'sub', 'mul']) {
                        compare(f, `${op} ${mode} 0x${a.toString(16)} 0x${b.toString(16)}`, fp.operate(op, f, [a, b], mode), oracleOp(f, op, A, B, null, mode));
                        n++;
                    }
                    if (B.k !== 0n && A.k !== 0n) {
                        compare(f, `div ${mode} 0x${a.toString(16)} 0x${b.toString(16)}`, fp.div(f, a, b, mode), oracleOp(f, 'div', A, B, null, mode));
                        n++;
                    }
                }
                if (A.sign === 0 && A.k !== 0n) compare(f, `sqrt ${mode} 0x${a.toString(16)}`, fp.sqrt(f, a, mode), oracleSqrt(f, A, mode));
            }
            const r = rng(7);
            for (let i = 0; i < 20000; i++) {
                const [a, b, c] = [0, 1, 2].map(() => all[Math.floor(r() * all.length)]);
                compare(f, `fma ${mode} ${a} ${b} ${c}`, fp.fma(f, a, b, c, mode), oracleOp(f, 'fma', unitValue(f, a), unitValue(f, b), unitValue(f, c), mode));
            }
        }
        assert.ok(n > 500000);
    });
}

for (const id of ['bf16', 'half']) {
    test(`oráculo ${id}: operações com operandos sorteados`, () => {
        const f = FORMATS[id];
        const all = finiteBits(f);
        const r = rng(id === 'bf16' ? 11 : 13);
        // Metade dos sorteios perto de 1 e de emin, onde aparecem cancelamento, empates e subnormais.
        const near = all.filter((b) => { const e = Number((b >> BigInt(f.fracBits)) & BigInt(f.expMaxField)); return e < 4 || Math.abs(e - f.bias) < 3; });
        const draw = () => (r() < 0.5 ? near : all)[Math.floor(r() * (r() < 0.5 ? near.length : all.length)) % (r() < 0.5 ? near.length : all.length)] ?? all[0];
        for (const mode of ROUNDING_MODES) {
            for (let i = 0; i < 6000; i++) {
                const a = draw(), b = draw(), c = draw();
                const A = unitValue(f, a), B = unitValue(f, b), C = unitValue(f, c);
                for (const op of ['add', 'sub', 'mul'])
                    compare(f, `${op} ${mode} ${a} ${b}`, fp.operate(op, f, [a, b], mode), oracleOp(f, op, A, B, null, mode));
                if (A.k && B.k) compare(f, `div ${mode} ${a} ${b}`, fp.div(f, a, b, mode), oracleOp(f, 'div', A, B, null, mode));
                compare(f, `fma ${mode} ${a} ${b} ${c}`, fp.fma(f, a, b, c, mode), oracleOp(f, 'fma', A, B, C, mode));
                if (A.sign === 0 && A.k) compare(f, `sqrt ${mode} ${a}`, fp.sqrt(f, a, mode), oracleSqrt(f, A, mode));
            }
        }
    });
}

test('oráculo: conversão de double para todos os formatos pequenos, inclusive saturação em FP8', () => {
    const r = rng(5);
    const buf = new DataView(new ArrayBuffer(8));
    for (const id of ['half', 'bf16', 'e5m2', 'e4m3']) {
        const f = FORMATS[id];
        const t = tab(f);
        const D = FORMATS.double;
        const cases = [];
        // Valores do formato, pontos médios entre vizinhos e perturbações de 1 ULP do double ao redor deles.
        for (let i = 0; i < t.ks.length; i += Math.max(1, Math.floor(t.ks.length / 3000))) {
            const k = t.ks[i];
            const k2 = i < t.last ? t.ks[i + 1] : t.beyond;
            for (const [n, d] of [[k, 1n], [k + k2, 2n]]) {
                const x = Number(n) / Number(d) * 2 ** unitsExp(f);
                if (!Number.isFinite(x) || x === 0) continue;
                buf.setFloat64(0, x);
                const bits = buf.getBigUint64(0);
                cases.push(bits, bits + 1n, bits - 1n);
            }
        }
        for (let i = 0; i < 3000; i++) {
            buf.setFloat64(0, (r() - 0.5) * 2 ** Math.floor(r() * 40 - 20) * 2 ** (f.bias / 2));
            cases.push(buf.getBigUint64(0));
        }
        for (const bits of cases) {
            for (const sat of [false, true]) {
                for (const mode of ROUNDING_MODES) {
                    const v = fp.decode(D, bits);
                    if (!fp.isFinite(v)) continue;
                    const got = fp.convert(D, bits, f, mode, { sat });
                    let exp;
                    if (v.cls === 'zero') exp = { bits: BigInt(v.sign) << BigInt(f.bits - 1), flags: 0 };
                    else {
                        // valor em unidades de f: sig·2^exp / 2^unitsExp(f)
                        const sh = v.exp - unitsExp(f);
                        exp = sh >= 0 ? oracleRound(f, v.sign, v.sig << BigInt(sh), 1n, mode, sat) : oracleRound(f, v.sign, v.sig, 1n << BigInt(-sh), mode, sat);
                    }
                    if (!sat || f.bits === 8) compare(f, `convert ${mode}${sat ? ' sat' : ''} 0x${bits.toString(16)}`, got, exp);
                }
            }
        }
    }
});

test('E4M3: sem infinito, maior finito 448, estouro vira NaN ou satura', () => {
    const f = FORMATS.e4m3;
    assert.equal(fp.toNumber(fp.decode(f, fp.maxFinite(f, 0))), 448);
    assert.equal(fp.canonicalNaN(f), 0x7fn);
    const big = fp.fromRational(f, 0, 470n, 1n, 'rne');
    assert.equal(big.bits, 0x7fn);
    assert.equal(big.flags, FLAG.OF | FLAG.NX);
    assert.equal(fp.fromRational(f, 0, 464n, 1n, 'rne').bits, 0x7en); // empate entre 448 (par) e 480: fica 448
    assert.equal(fp.fromRational(f, 0, 470n, 1n, 'rne', { sat: true }).bits, 0x7en);
    assert.equal(fp.fromRational(f, 1, 10000n, 1n, 'rtz').bits, 0xfen);
    assert.equal(fp.div(f, 0x38n, 0n, 'rne').bits, 0x7fn); // 1/0: DZ e NaN
    assert.equal(fp.div(f, 0x38n, 0n, 'rne').flags, FLAG.DZ);
    assert.equal(fp.toNumber(fp.decode(FORMATS.e5m2, fp.maxFinite(FORMATS.e5m2, 0))), 57344);
    assert.equal(fp.toNumber(fp.decode(FORMATS.bf16, 1n)), 2 ** -133);
});
