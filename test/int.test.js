/** Aritmética inteira: todos os pares de 4 e 6 bits e sorteios de 8 a 32 bits, contra BigInt. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addSub, multiply, divide, parseInt, MUL_ALGOS, DIV_ALGOS, toSigned } from '../js/int/arith.js';

function* pairs(n) {
    for (let a = 0n; a < 1n << BigInt(n); a++)
        for (let b = 0n; b < 1n << BigInt(n); b++) yield [a, b];
}

function* random(n, count, seed) {
    let s = seed;
    const next = () => { s = (s * 1103515245 + 12345) % 2147483648; return BigInt(s); };
    for (let i = 0; i < count; i++) {
        let a = 0n, b = 0n;
        for (let k = 0; k < n; k += 16) { a = (a << 16n) | (next() & 0xffffn); b = (b << 16n) | (next() & 0xffffn); }
        yield [BigInt.asUintN(n, a), BigInt.asUintN(n, b)];
    }
}

function checkAll(n, gen) {
    for (const [a, b] of gen) {
        for (const sub of [false, true]) {
            const r = addSub(n, a, b, sub);
            assert.equal(r.sum, BigInt.asUintN(n, r.exactUnsigned));
            const s = r.exactSigned;
            assert.equal(r.overflow, s < -(1n << BigInt(n - 1)) || s >= 1n << BigInt(n - 1) ? 1 : 0);
            assert.equal(r.unsignedOverflow, r.exactUnsigned < 0n || r.exactUnsigned >= 1n << BigInt(n) ? 1 : 0);
        }
        for (const algo of MUL_ALGOS)
            for (const signed of [false, true]) {
                const m = multiply(algo, n, a, b, signed);
                if (algo === 'booth' && !signed) continue;
                assert.equal(m.product, m.expected, `${algo} ${signed} ${n}: ${a} × ${b}`);
            }
        for (const algo of DIV_ALGOS)
            for (const signed of [false, true]) {
                const d = divide(algo, n, a, b, signed);
                assert.equal(d.quotient, d.expected.q, `${algo} ${signed} ${n}: ${a} / ${b} quociente`);
                assert.equal(d.remainder, d.expected.r, `${algo} ${signed} ${n}: ${a} / ${b} resto`);
            }
    }
}

test('todos os pares de 4 bits', () => checkAll(4, pairs(4)));
test('todos os pares de 6 bits', () => checkAll(6, pairs(6)));
test('sorteios de 8, 16 e 32 bits', () => {
    for (const n of [8, 16, 32]) checkAll(n, random(n, 600, n));
});

test('exemplos do livro: 2 × 3 e 7 ÷ 2 com 4 bits', () => {
    const m = multiply('v1', 4, 2n, 3n, false);
    assert.equal(m.rows.length, 1 + 4 * 3);
    assert.equal(m.rows.at(-1).regs.P, 6n);
    assert.deepEqual(m.rows.slice(1, 4).map((r) => r.step), ['mulAdd', 'shlMcand', 'shrMplier']);
    const d = divide('v1', 4, 7n, 2n, false);
    assert.equal(d.rows.length, 1 + 5 * 3);
    assert.equal(d.quotient, 3n);
    assert.equal(d.remainder, 1n);
    const bo = multiply('booth', 4, 2n, BigInt.asUintN(4, -3n), true);
    assert.equal(toSigned(bo.product, 8), -6n);
});

test('RISC-V: divisão por zero e estouro', () => {
    const z = divide('v1', 8, 77n, 0n, true);
    assert.equal(z.divByZero, true);
    assert.equal(z.quotient, 0xffn);
    assert.equal(z.remainder, 77n);
    const o = divide('v2', 8, 0x80n, 0xffn, true);
    assert.equal(o.overflow, true);
    assert.equal(o.quotient, 0x80n);
    assert.equal(o.remainder, 0n);
});

test('entrada de inteiros', () => {
    assert.equal(parseInt('-1', 8), 0xffn);
    assert.equal(parseInt('0x7f', 8), 0x7fn);
    assert.equal(parseInt('0b1010', 4), 10n);
    assert.equal(parseInt('255', 8), 255n);
    assert.equal(parseInt('256', 8), null);
    assert.equal(parseInt('-129', 8), null);
    assert.equal(parseInt('1.5', 8), null);
});
