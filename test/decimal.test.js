/** Leitura de texto como racional exato, valor decimal exato e menor texto que recupera os bits. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, fromText, exactValueText, shortestText, exactDecimal, ratToSci } from '../js/fp/decimal.js';
import * as fp from '../js/fp/core.js';
import { FORMATS, FORMAT_IDS, ROUNDING_MODES } from '../js/fp/formats.js';

const bitsOfDouble = (x) => {
    const v = new DataView(new ArrayBuffer(8));
    v.setFloat64(0, x);
    return v.getBigUint64(0);
};
const bitsOfSingle = (x) => {
    const v = new DataView(new ArrayBuffer(4));
    v.setFloat32(0, x);
    return BigInt(v.getUint32(0));
};

test('formas de entrada', () => {
    assert.deepEqual(parseNumber('-12.375'), { kind: 'finite', sign: 1, N: 12375n, D: 1000n });
    assert.deepEqual(parseNumber('1/3'), { kind: 'finite', sign: 0, N: 1n, D: 3n });
    assert.deepEqual(parseNumber('2^-3'), { kind: 'finite', sign: 0, N: 1n, D: 8n });
    assert.deepEqual(parseNumber('0x1.8p3'), { kind: 'finite', sign: 0, N: 24n, D: 2n });
    assert.deepEqual(parseNumber('6.02e2'), { kind: 'finite', sign: 0, N: 602n, D: 1n });
    assert.deepEqual(parseNumber('0,5'), { kind: 'finite', sign: 0, N: 5n, D: 10n });
    assert.deepEqual(parseNumber('-inf'), { kind: 'inf', sign: 1 });
    assert.deepEqual(parseNumber('NaN'), { kind: 'nan' });
    for (const bad of ['', 'abc', '1/0', '1.2.3', 'e5', '0x'])
        assert.equal(parseNumber(bad), null, bad);
});

test('valores conhecidos em single', () => {
    const r = fromText('single', '0.1', 'rne');
    assert.equal(r.bits, 0x3dcccccdn);
    assert.equal(r.flags, fp.FLAG.NX);
    assert.equal(exactValueText('single', r.bits), '0.100000001490116119384765625');
    assert.equal(fromText('single', '0.1', 'rtz').bits, 0x3dccccccn);
    assert.equal(fromText('single', '-0.1', 'rdn').bits, 0xbdcccccdn);
    assert.equal(fromText('single', '-0.1', 'rup').bits, 0xbdccccccn);
    assert.equal(fromText('single', '16777217', 'rne').bits, 0x4b800000n); // empate: fica o par (2^24)
    assert.equal(fromText('single', '16777217', 'rmm').bits, 0x4b800001n);
    assert.equal(fromText('single', '1e39', 'rne').bits, 0x7f800000n);
    assert.equal(fromText('single', '1e39', 'rtz').bits, 0x7f7fffffn);
    assert.equal(fromText('single', '1e-50', 'rne').bits, 0n);
    assert.equal(fromText('single', '1e-50', 'rne').flags, fp.FLAG.UF | fp.FLAG.NX);
    assert.equal(fromText('single', '1e-50', 'rup').bits, 1n);
    assert.equal(fromText('single', '1e-1000000', 'rup').bits, 1n);
    assert.equal(fromText('double', '1e1000000', 'rtz').bits, 0x7fefffffffffffffn);
    assert.equal(shortestText('single', 0x3dcccccdn), '0.1');
    assert.equal(shortestText('half', 0x3555n), '0.3333');
    assert.equal(exactValueText('double', 1n), exactDecimal(0, 1n, 1n << 1074n));
    assert.equal(ratToSci(0, 1n, 3n, 4), '3.333e-1');
    assert.equal(ratToSci(1, 1n, 10n ** 400n, 3), '-1e-400');
});

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

test('double e single: leitura igual à do JavaScript e menor texto igual a String(x)', () => {
    const r = rng(3);
    for (let i = 0; i < 4000; i++) {
        const x = (r() - 0.5) * 10 ** Math.floor(r() * 80 - 40);
        const s = String(x);
        assert.equal(fromText('double', s, 'rne').bits, bitsOfDouble(x), s);
        assert.equal(shortestText('double', bitsOfDouble(x)), s.replace('e+', 'e'), s);
        // Um texto com poucos algarismos lido direto em single: Math.fround(Number(t)) só erra em empates
        // duplos, impossíveis com até 7 algarismos.
        const t = x.toPrecision(1 + Math.floor(r() * 7));
        assert.equal(fromText('single', t, 'rne').bits, bitsOfSingle(Math.fround(Number(t))), t);
    }
});

test('leitura correta em todos os formatos e modos: o resultado é o vizinho certo do valor exato', () => {
    const r = rng(9);
    for (let i = 0; i < 1500; i++) {
        const digits = String(Math.floor(r() * 1e9));
        const text = `${r() < 0.3 ? '-' : ''}${digits.slice(0, 1 + Math.floor(r() * 8))}e${Math.floor(r() * 20) - 12}`;
        const p = parseNumber(text);
        for (const id of FORMAT_IDS) {
            const f = FORMATS[id];
            for (const mode of ROUNDING_MODES) {
                const res = fromText(id, text, mode);
                const v = fp.decode(f, res.bits);
                if (!fp.isFinite(v) || v.cls === 'zero') continue;
                // x está entre o resultado e o vizinho na direção certa conforme o modo.
                const q = fp.toRational(v);
                const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
                const c = cmp(p.N * q.D, q.N * p.D); // |x| vs |resultado|
                if (mode === 'rtz') assert.ok(c >= 0, `${text} ${id} rtz`);
                if (mode === 'rup') assert.ok(p.sign ? c >= 0 : c <= 0, `${text} ${id} rup`);
                if (mode === 'rdn') assert.ok(p.sign ? c <= 0 : c >= 0, `${text} ${id} rdn`);
                if (c === 0) assert.equal(res.flags & fp.FLAG.NX, 0);
            }
        }
    }
});
