/**
 * Arredondamento estocástico: sempre escolhe um dos dois vizinhos, nunca muda um valor exato e, em média,
 * sobe com probabilidade igual à fração descartada.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../js/fp/core.js';
import { getFormat } from '../js/fp/formats.js';
import { fromText } from '../js/fp/decimal.js';
import { rng } from '../js/app/rng.js';

const SR = core.STOCHASTIC;

test('SR escolhe entre RTZ e o vizinho de maior magnitude, conforme u', () => {
    for (const id of ['half', 'bf16', 'e4m3', 'e5m2', 'single']) {
        for (const text of ['0.1', '-0.1', '1/3', '-2/3', '1e-6', '3.14159', '-100.7', '2^-20', '7']) {
            const neg = text.startsWith('-');
            const lo = fromText(id, text, 'rtz');
            const mag = fromText(id, text, neg ? 'rdn' : 'rup');
            const r0 = fromText(id, text, SR, { u: 0 });
            const r1 = fromText(id, text, SR, { u: 1 - 2 ** -53 });
            if (lo.flags & core.FLAG.NX) {
                assert.equal(r0.bits, mag.bits, `${id} ${text} u=0`);
                assert.equal(r1.bits, lo.bits, `${id} ${text} u≈1`);
            } else {
                assert.equal(r0.bits, lo.bits);
                assert.equal(r1.bits, lo.bits);
            }
        }
    }
});

test('SR é não enviesado: frequência de subida próxima da fração descartada', () => {
    const f = getFormat('bf16');
    const rand = rng(7);
    // 1 + 0.3 ULP em bf16 (ULP de 1 é 2^-7): sobe em cerca de 30% das vezes.
    const N = 1n * 1000n * 128n + 300n, D = 1000n * 128n;
    let up = 0;
    const T = 20000;
    const lo = core.roundRational(f, 0, N, D, 'rtz').bits;
    for (let i = 0; i < T; i++) if (core.roundRational(f, 0, N, D, SR, { u: rand() }).bits !== lo) up++;
    assert.ok(Math.abs(up / T - 0.3) < 0.015, `frequência ${up / T}`);
});

test('soma repetida com SR não para onde RNE para', () => {
    const f = getFormat('bf16');
    const one = fromText('bf16', '1', 'rne').bits;
    const rand = rng(3);
    let s = core.zero(f, 0), d = s;
    for (let k = 0; k < 2000; k++) {
        s = core.add(f, s, one, SR, { u: rand() }).bits;
        d = core.add(f, d, one, 'rne').bits;
    }
    assert.equal(core.toNumber(core.decode(f, d)), 256);
    const v = core.toNumber(core.decode(f, s));
    assert.ok(v > 1700 && v < 2300, `SR deu ${v}`);
});
