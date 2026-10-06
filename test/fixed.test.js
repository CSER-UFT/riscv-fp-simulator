/**
 * Ponto fixo: todos os pares de operandos em formatos de 8 bits (com e sem sinal), nos cinco modos e nos dois
 * tratamentos de estouro, contra um oráculo independente que calcula o piso e o teto do valor exato e
 * escolhe entre eles pela regra de cada modo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixedFormat, fromBits, operate, fromRational, rawToRational } from '../js/fx/fixed.js';
import { ROUNDING_MODES } from '../js/fp/formats.js';
import { FLAG } from '../js/fp/core.js';

/** Piso de N/D para D > 0 e N com sinal. */
function floorDiv(N, D) {
    const q = N / D;
    return (N % D !== 0n && N < 0n) ? q - 1n : q;
}

/** Escolhe o inteiro do arredondamento de N/D (D > 0) pelo modo, sem usar o núcleo. */
function oracleRound(N, D, mode) {
    const lo = floorDiv(N, D);
    const hi = lo + 1n;
    const exact = lo * D === N;
    if (exact) return { v: lo, inexact: false };
    const twice = 2n * N - (lo + hi) * D; // sinal de x - meio
    let v;
    switch (mode) {
        case 'rdn': v = lo; break;
        case 'rup': v = hi; break;
        case 'rtz': v = N < 0n ? hi : lo; break;
        case 'rne': v = twice < 0n ? lo : twice > 0n ? hi : (lo % 2n === 0n ? lo : hi); break;
        case 'rmm': v = twice < 0n ? lo : twice > 0n ? hi : (N < 0n ? lo : hi); break;
        default: throw new Error(mode);
    }
    return { v, inexact: true };
}

function oracleFit(fx, v, overflow) {
    if (v >= fx.min && v <= fx.max) return { raw: v, of: false };
    if (overflow === 'sat') return { raw: v > fx.max ? fx.max : fx.min, of: true };
    const span = 1n << BigInt(fx.bits);
    let w = ((v - fx.min) % span + span) % span + fx.min;
    return { raw: w, of: true };
}

const FORMATS = [[3, 4, true], [0, 7, true], [7, 0, true], [4, 4, false], [8, 0, false], [1, 6, true]];

test('ponto fixo de 8 bits: todos os pares, cinco modos, saturação e volta', () => {
    for (const [m, n, signed] of FORMATS) {
        const fx = fixedFormat(m, n, signed);
        assert.equal(fx.bits, 8);
        const all = [];
        for (let b = 0n; b < 256n; b++) all.push(fromBits(fx, b));
        for (const mode of ROUNDING_MODES)
            for (const overflow of ['sat', 'wrap'])
                for (const a of all)
                    for (const b of all)
                        for (const op of ['add', 'sub', 'mul', 'div']) {
                            if (op === 'div' && b === 0n) continue;
                            const got = operate(fx, op, a, b, mode, overflow);
                            let N, D;
                            if (op === 'add') { N = a + b; D = 1n; }
                            if (op === 'sub') { N = a - b; D = 1n; }
                            if (op === 'mul') { N = a * b; D = 1n << BigInt(n); }
                            if (op === 'div') { N = (a << BigInt(n)) * (b < 0n ? -1n : 1n); D = b < 0n ? -b : b; }
                            const r = oracleRound(N, D, mode);
                            const f = oracleFit(fx, r.v, overflow);
                            const flags = (f.of ? FLAG.OF : 0) | (r.inexact ? FLAG.NX : 0);
                            if (got.raw !== f.raw || got.flags !== flags)
                                assert.fail(`${fx.name} ${mode} ${overflow} ${a} ${op} ${b}: esperado ${f.raw} flags ${flags}, obtido ${got.raw} flags ${got.flags}`);
                        }
    }
});

test('conversão de racionais e casos conhecidos', () => {
    const q = fixedFormat(3, 4, true); // Q3.4: de -8 a 7.9375, passo 0.0625
    assert.equal(q.name, 'Q3.4');
    const c = fromRational(q, 0, 1n, 10n, 'rne'); // 0.1 → 1.6 unidades → 2 (0.125)
    assert.equal(c.raw, 2n);
    assert.equal(c.flags, FLAG.NX);
    assert.equal(fromRational(q, 0, 1n, 10n, 'rtz').raw, 1n);
    assert.equal(fromRational(q, 0, 100n, 1n, 'rne').raw, 127n); // satura em 7.9375
    assert.equal(fromRational(q, 0, 100n, 1n, 'rne').flags, FLAG.OF);
    assert.equal(fromRational(q, 0, 8n, 1n, 'rne', 'wrap').raw, -128n); // 8 dá a volta para -8
    assert.deepEqual(rawToRational(q, -3n), { sign: 1, N: 3n, D: 16n });
    // Multiplicação: 1.5 × 2.25 = 3.375 exato em Q3.4 (24 × 36 = 864, deslocado 4 = 54).
    assert.equal(operate(q, 'mul', 24n, 36n, 'rne').raw, 54n);
    // Divisão por zero satura com OF.
    assert.equal(operate(q, 'div', 5n, 0n, 'rne').raw, 127n);
    assert.equal(operate(q, 'div', -5n, 0n, 'rne').raw, -128n);
    assert.equal(operate(q, 'div', 0n, 0n, 'rne').raw, 0n);
});
