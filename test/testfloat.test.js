/**
 * Núcleo de ponto flutuante contra os vetores do TestFloat 3e de Berkeley (John Hauser), gerados com o
 * SoftFloat especializado para RISC-V, detecção de valor minúsculo depois do arredondamento e os cinco modos.
 * Cada linha: modo, operandos, resultado esperado e flags (mesmos bits do fflags). Veja test/vectors/README.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as fp from '../js/fp/core.js';

const DIR = new URL('./vectors/', import.meta.url);
const FMT = { f16: 'half', f32: 'single', f64: 'double' };
const INT = { i32: 'w', ui32: 'wu', i64: 'l', ui64: 'lu' };
const INT_BITS = { i32: 32, ui32: 32, i64: 64, ui64: 64 };

function lines(file) {
    return gunzipSync(readFileSync(new URL(file, DIR))).toString().trim().split('\n').map((l) => l.split(' '));
}

const hex = (s) => BigInt(`0x${s}`);
const show = (b) => `0x${b.toString(16)}`;

function check(name, rows, run) {
    let n = 0;
    for (const [mode, ...f] of rows) {
        const expFlags = parseInt(f.at(-1), 16);
        const expected = hex(f.at(-2));
        const args = f.slice(0, -2).map(hex);
        const r = run(mode, args);
        if (r.bits !== expected || r.flags !== expFlags) {
            assert.fail(`${name} ${mode} (${f.slice(0, -2).join(' ')}): esperado ${show(expected)} flags ${expFlags}, obtido ${show(r.bits)} flags ${r.flags}`);
        }
        n++;
    }
    return n;
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.txt.gz'));

for (const file of files) {
    const name = file.replace('.txt.gz', '');
    test(`TestFloat ${name}`, () => {
        const rows = lines(file);
        let m;
        let n;
        if ((m = /^(f16|f32|f64)_(add|sub|mul|div|sqrt|mulAdd)$/.exec(name))) {
            const fmt = FMT[m[1]];
            const op = m[2] === 'mulAdd' ? 'fma' : m[2];
            n = check(name, rows, (mode, args) => fp.operate(op, fmt, args, mode));
        } else if ((m = /^(f16|f32|f64)_to_(f16|f32|f64)$/.exec(name))) {
            n = check(name, rows, (mode, [a]) => fp.convert(FMT[m[1]], a, FMT[m[2]], mode));
        } else if ((m = /^(f16|f32|f64)_to_(i32|ui32|i64|ui64)$/.exec(name))) {
            const bits = INT_BITS[m[2]];
            n = check(name, rows, (mode, [a]) => {
                const r = fp.toInteger(FMT[m[1]], a, INT[m[2]], mode);
                return { bits: BigInt.asUintN(bits, r.value), flags: r.flags };
            });
        } else if ((m = /^(i32|ui32|i64|ui64)_to_(f16|f32|f64)$/.exec(name))) {
            const bits = INT_BITS[m[1]];
            const signed = m[1][0] === 'i';
            n = check(name, rows, (mode, [a]) => fp.fromInteger(FMT[m[2]], signed ? BigInt.asIntN(bits, a) : a, mode));
        } else {
            assert.fail(`arquivo de vetores não reconhecido: ${file}`);
        }
        assert.ok(n > 500, `${name}: poucos vetores (${n})`);
    });
}
