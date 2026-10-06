/**
 * Os passos do hardware (trace.js) são uma segunda implementação: o resultado de cada traço tem de ser igual
 * ao do núcleo, em todos os formatos e modos, inclusive com subnormais, cancelamento e estouro.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { traceOp } from '../js/fp/trace.js';
import { FORMATS, FORMAT_IDS, ROUNDING_MODES } from '../js/fp/formats.js';
import { fromText } from '../js/fp/decimal.js';

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

/** Sorteia bits com viés para expoentes próximos (cancelamento) e extremos (subnormais e estouro). */
function drawer(f, r) {
    return (ref) => {
        const x = r();
        const sign = r() < 0.5 ? 1n : 0n;
        let E;
        if (x < 0.3 && ref !== undefined) E = Math.max(0, Math.min(f.expMaxField, ref + Math.floor(r() * 5) - 2));
        else if (x < 0.45) E = Math.floor(r() * 3);
        else if (x < 0.55) E = f.expMaxField - 1 - Math.floor(r() * 2);
        else E = Math.floor(r() * (f.expMaxField + 1));
        let F = BigInt(Math.floor(r() * 2 ** Math.min(30, f.fracBits)));
        if (f.fracBits > 30) F = (F << BigInt(f.fracBits - 30)) | BigInt(Math.floor(r() * 2 ** (f.fracBits - 30)));
        if (r() < 0.1) F = r() < 0.5 ? 0n : f.fracMask;
        return { E, bits: (sign << BigInt(f.bits - 1)) | (BigInt(E) << BigInt(f.fracBits)) | F };
    };
}

for (const id of FORMAT_IDS) {
    test(`traço = núcleo (${id})`, () => {
        const f = FORMATS[id];
        const r = rng(id.length * 31);
        const draw = drawer(f, r);
        const N = f.bits === 64 ? 400 : 1500;
        for (const mode of ROUNDING_MODES) {
            for (let i = 0; i < N; i++) {
                const a = draw();
                const b = draw(a.E);
                const c = draw(a.E + b.E - f.bias);
                for (const op of ['add', 'sub', 'mul', 'div', 'sqrt', 'fma']) {
                    for (const sat of f.bits === 8 ? [false, true] : [false]) {
                        const tr = traceOp(op, id, [a.bits, b.bits, c.bits], mode, { sat });
                        if (tr.resultBits !== tr.result.bits)
                            assert.fail(`${id} ${op} ${mode}${sat ? ' sat' : ''} 0x${a.bits.toString(16)} 0x${b.bits.toString(16)} 0x${c.bits.toString(16)}: traço 0x${tr.resultBits.toString(16)}, núcleo 0x${tr.result.bits.toString(16)}`);
                    }
                }
            }
        }
    });
}

test('traço = núcleo nos vetores do TestFloat de single', () => {
    for (const [file, op] of [['f32_add', 'add'], ['f32_sub', 'sub'], ['f32_mul', 'mul'], ['f32_div', 'div'], ['f32_sqrt', 'sqrt'], ['f32_mulAdd', 'fma']]) {
        const rows = gunzipSync(readFileSync(new URL(`./vectors/${file}.txt.gz`, import.meta.url))).toString().trim().split('\n');
        for (const row of rows) {
            const [mode, ...f] = row.split(' ');
            const args = f.slice(0, -2).map((h) => BigInt(`0x${h}`));
            const tr = traceOp(op, 'single', args, mode);
            assert.equal(tr.resultBits, BigInt(`0x${f.at(-2)}`), `${file} ${row}`);
        }
    }
});

test('passos da soma: alinhamento com sticky e arredondamento por G, R e S', () => {
    // 1 + 2^-27 em single: o 1 do menor operando sai pela direita e fica só no sticky.
    const one = fromText('single', '1', 'rne').bits;
    const tiny = fromText('single', '2^-27', 'rne').bits;
    const tr = traceOp('add', 'single', [one, tiny], 'rup');
    const align = tr.steps.find((s) => s.key === 'align');
    assert.equal(align.params.d, 27);
    assert.equal(align.params.sticky, true);
    const round = tr.steps.find((s) => s.key === 'round');
    assert.deepEqual([round.params.G, round.params.R, round.params.S, round.params.up], [0, 0, 1, true]);
    assert.equal(tr.resultBits, 0x3f800001n);
    // 1.5 + 2^-24 em rne: G = 1, R = S = 0 → empate; o bit menos significativo de 1.5 é 0, fica.
    const t2 = traceOp('add', 'single', [fromText('single', '1.5', 'rne').bits, fromText('single', '2^-24', 'rne').bits], 'rne');
    const r2 = t2.steps.find((s) => s.key === 'round').params;
    assert.deepEqual([r2.G, r2.R, r2.S, r2.lsb, r2.up], [1, 0, 0, 0, false]);
});
