/**
 * Algoritmos de aritmética inteira do capítulo 3 do Patterson e Hennessy, passo a passo:
 *   soma e subtração em complemento de 2, com os vai uns e as condições de estouro;
 *   multiplicação: primeira versão (multiplicando de 2n bits deslocado para a esquerda), versão refinada
 *   (multiplicador na metade direita do produto) e algoritmo de Booth (com sinal);
 *   divisão: primeira versão com restauração (divisor de 2n bits deslocado para a direita), versão
 *   refinada (quociente na metade direita do resto) e divisão sem restauração.
 *
 * Os valores são BigInt; cada linha da tabela guarda o passo (chave e parâmetros) e o conteúdo de cada
 * registrador. A divisão por zero e o estouro seguem o RISC-V (div e rem): quociente com todos os bits em 1
 * e resto igual ao dividendo; -2^(n-1) / -1 dá quociente -2^(n-1) e resto 0.
 */

const mask = (n) => (1n << BigInt(n)) - 1n;
export const toUnsigned = (v, n) => BigInt.asUintN(n, BigInt(v));
export const toSigned = (v, n) => BigInt.asIntN(n, BigInt(v));

/** Interpreta um texto (decimal com sinal, 0x hexadecimal, 0b binário) como padrão de n bits. */
export function parseInt(text, n) {
    const s = String(text).trim().toLowerCase().replace(/[\s_]/g, '');
    if (!/^[+-]?(0x[0-9a-f]+|0b[01]+|\d+)$/.test(s)) return null;
    const neg = s.startsWith('-');
    const body = s.replace(/^[+-]/, '');
    let v = BigInt(body);
    if (neg) v = -v;
    // Fora do intervalo de n bits (com ou sem sinal) é um erro de entrada.
    if (v < -(1n << BigInt(n - 1)) || v > mask(n)) return null;
    return toUnsigned(v, n);
}

// Soma e subtração ----------------------------------------------------------------------------------------------

export function addSub(n, a, b, subtract) {
    const A = toUnsigned(a, n), B = toUnsigned(b, n);
    const Be = subtract ? toUnsigned(~B, n) : B;
    let c = subtract ? 1n : 0n;
    const carries = [c];
    let sum = 0n;
    for (let i = 0; i < n; i++) {
        const x = (A >> BigInt(i)) & 1n, y = (Be >> BigInt(i)) & 1n;
        const s = x ^ y ^ c;
        c = (x & y) | (x & c) | (y & c);
        sum |= s << BigInt(i);
        carries.push(c);
    }
    const carryOut = Number(carries[n]);
    const overflow = Number(carries[n] ^ carries[n - 1]);
    return {
        n, subtract, A, B, Be, sum, carries, carryOut, overflow,
        // Em subtração sem sinal, o vai um final 0 indica empréstimo (resultado negativo).
        unsignedOverflow: subtract ? 1 - carryOut : carryOut,
        exactSigned: subtract ? toSigned(A, n) - toSigned(B, n) : toSigned(A, n) + toSigned(B, n),
        exactUnsigned: subtract ? A - B : A + B,
    };
}

// Multiplicação --------------------------------------------------------------------------------------------------

const row = (iter, step, regs, params = {}) => ({ iter, step, params, regs: { ...regs } });

/** Primeira versão: multiplicando de 2n bits, multiplicador de n bits, produto de 2n bits. */
function mulV1(n, mcand, mplier) {
    const rows = [];
    let Mc = mcand, Mp = mplier, P = 0n;
    rows.push(row(0, 'init', { Mp, Mc, P }));
    for (let i = 1; i <= n; i++) {
        if (Mp & 1n) {
            P = (P + Mc) & mask(2 * n);
            rows.push(row(i, 'mulAdd', { Mp, Mc, P }));
        } else rows.push(row(i, 'mulNop', { Mp, Mc, P }));
        Mc = (Mc << 1n) & mask(2 * n);
        rows.push(row(i, 'shlMcand', { Mp, Mc, P }));
        Mp >>= 1n;
        rows.push(row(i, 'shrMplier', { Mp, Mc, P }));
    }
    return { rows, product: P, regs: [['Mp', n], ['Mc', 2 * n], ['P', 2 * n]] };
}

/** Versão refinada: produto de 2n bits com o multiplicador na metade direita e um bit de vai um. */
function mulV2(n, mcand, mplier) {
    const rows = [];
    let P = mplier, carry = 0n;
    rows.push(row(0, 'init', { Mc: mcand, P }));
    for (let i = 1; i <= n; i++) {
        if (P & 1n) {
            const hi = (P >> BigInt(n)) + mcand;
            carry = hi >> BigInt(n);
            P = ((hi & mask(n)) << BigInt(n)) | (P & mask(n));
            rows.push(row(i, 'mulAddHi', { Mc: mcand, P }, { carry: Number(carry) }));
        } else {
            carry = 0n;
            rows.push(row(i, 'mulNop', { Mc: mcand, P }));
        }
        P = (P >> 1n) | (carry << BigInt(2 * n - 1));
        rows.push(row(i, 'shrProd', { Mc: mcand, P }, { carry: Number(carry) }));
    }
    return { rows, product: P, regs: [['Mc', n], ['P', 2 * n]] };
}

/**
 * Algoritmo de Booth (base 2): produto de 2n + 1 bits (um bit a mais na metade alta, para que somar ou
 * subtrair o multiplicando -2^(n-1) não estoure) mais o bit extra à direita (x, o P-1 do livro).
 */
function booth(n, mcand, mplier) {
    const rows = [];
    const W = 2 * n + 1;
    let P = mplier, x = 0n;
    const Mc = mcand;
    const McS = toSigned(Mc, n);
    const hi = () => toSigned(P >> BigInt(n), n + 1);
    const setHi = (v) => { P = (toUnsigned(v, n + 1) << BigInt(n)) | (P & mask(n)); };
    rows.push(row(0, 'init', { Mc, P, x }));
    for (let i = 1; i <= n; i++) {
        const pair = `${P & 1n}${x}`;
        if (pair === '10') {
            setHi(hi() - McS);
            rows.push(row(i, 'boothSub', { Mc, P, x }, { pair }));
        } else if (pair === '01') {
            setHi(hi() + McS);
            rows.push(row(i, 'boothAdd', { Mc, P, x }, { pair }));
        } else rows.push(row(i, 'boothNop', { Mc, P, x }, { pair }));
        x = P & 1n;
        // Deslocamento aritmético: o bit de sinal se repete.
        P = (P >> 1n) | (P & (1n << BigInt(W - 1)));
        rows.push(row(i, 'boothShift', { Mc, P, x }));
    }
    return { rows, product: P & mask(2 * n), regs: [['Mc', n], ['P', W], ['x', 1]] };
}

export const MUL_ALGOS = ['v1', 'v2', 'booth'];

/**
 * Multiplicação de a por b (padrões de n bits).
 * @param {boolean} signed nas versões 1 e 2, multiplica as magnitudes e corrige o sinal no fim (Booth
 *   sempre trata os operandos como números com sinal)
 */
export function multiply(algo, n, a, b, signed) {
    const A = toUnsigned(a, n), B = toUnsigned(b, n);
    const sa = signed && toSigned(A, n) < 0n, sb = signed && toSigned(B, n) < 0n;
    let out;
    if (algo === 'booth') out = booth(n, A, B);
    else {
        const ma = sa ? toUnsigned(-toSigned(A, n), n) : A;
        const mb = sb ? toUnsigned(-toSigned(B, n), n) : B;
        out = algo === 'v1' ? mulV1(n, ma, mb) : mulV2(n, ma, mb);
        if (sa !== sb) {
            out.product = toUnsigned(-out.product, 2 * n);
            out.rows.push(row(n, 'negate', { ...out.rows.at(-1).regs, P: out.product }));
        }
        out.magnitudes = { ma, mb, sa, sb };
    }
    const expected = algo === 'booth' || signed ? toUnsigned(toSigned(A, n) * toSigned(B, n), 2 * n) : A * B;
    return { ...out, algo, n, A, B, signed: algo === 'booth' ? true : signed, expected };
}

// Divisão ----------------------------------------------------------------------------------------------------

/**
 * Primeira versão: divisor de 2n bits na metade esquerda, deslocado para a direita; n + 1 repetições.
 * O teste "resto < 0" usa o empréstimo da subtração (um bit além dos 2n), porque com divisores grandes
 * (bit mais alto em 1) o bit de sinal dos 2n bits não basta.
 */
function divV1(n, dividend, divisor) {
    const rows = [];
    const W = 2 * n;
    let D = divisor << BigInt(n), R = dividend, Q = 0n;
    const show = () => ({ Q, D, R: R & mask(W) });
    rows.push(row(0, 'init', show()));
    for (let i = 1; i <= n + 1; i++) {
        R -= D;
        rows.push(row(i, 'divSub', show(), { negative: R < 0n }));
        if (R < 0n) {
            R += D;
            Q = (Q << 1n) & mask(n);
            rows.push(row(i, 'divRestore', show()));
        } else {
            Q = ((Q << 1n) | 1n) & mask(n);
            rows.push(row(i, 'divSet', show()));
        }
        D >>= 1n;
        rows.push(row(i, 'shrDiv', show()));
    }
    return { rows, quotient: Q, remainder: R, regs: [['Q', n], ['D', W], ['R', W]] };
}

/**
 * Versão refinada: resto de 2n + 1 bits com o quociente entrando pela direita; divisor de n bits. O bit a
 * mais guarda o vai um do deslocamento quando o resto parcial passa de 2^(n-1).
 */
function divV2(n, dividend, divisor) {
    const rows = [];
    const W = 2 * n + 1;
    let R = dividend;
    const hiOf = (x) => x >> BigInt(n);
    const loOf = (x) => x & mask(n);
    rows.push(row(0, 'init', { D: divisor, R }));
    R <<= 1n;
    rows.push(row(0, 'shlRem', { D: divisor, R }));
    for (let i = 1; i <= n; i++) {
        const hi = hiOf(R) - divisor;
        if (hi < 0n) {
            rows.push(row(i, 'divSubHi', { D: divisor, R: ((hi & mask(n + 1)) << BigInt(n)) | loOf(R) }, { negative: true }));
            R = (R << 1n) & mask(W);
            rows.push(row(i, 'divRestoreShl', { D: divisor, R }));
        } else {
            R = (hi << BigInt(n)) | loOf(R);
            rows.push(row(i, 'divSubHi', { D: divisor, R }, { negative: false }));
            R = ((R << 1n) | 1n) & mask(W);
            rows.push(row(i, 'divSetShl', { D: divisor, R }));
        }
    }
    R = ((hiOf(R) >> 1n) << BigInt(n)) | loOf(R);
    rows.push(row(n, 'finalShift', { D: divisor, R }));
    return { rows, quotient: loOf(R), remainder: hiOf(R), regs: [['D', n], ['R', W]] };
}

/** Divisão sem restauração: resto parcial A de n + 1 bits com sinal e quociente Q. */
function divNonRestoring(n, dividend, divisor) {
    const rows = [];
    const W = n + 1;
    let A = 0n, Q = dividend;
    const D = divisor;
    rows.push(row(0, 'init', { D, A, Q }));
    for (let i = 1; i <= n; i++) {
        const neg = (A >> BigInt(W - 1)) & 1n;
        A = ((A << 1n) | (Q >> BigInt(n - 1))) & mask(W);
        Q = (Q << 1n) & mask(n);
        rows.push(row(i, 'nrShift', { D, A, Q }));
        A = (neg ? A + D : A - D) & mask(W);
        rows.push(row(i, neg ? 'nrAdd' : 'nrSub', { D, A, Q }));
        if (!((A >> BigInt(W - 1)) & 1n)) Q |= 1n;
        rows.push(row(i, 'nrSetQ', { D, A, Q }, { q: Number(Q & 1n) }));
    }
    if ((A >> BigInt(W - 1)) & 1n) {
        A = (A + D) & mask(W);
        rows.push(row(n, 'nrCorrect', { D, A, Q }));
    }
    return { rows, quotient: Q, remainder: A & mask(n), regs: [['D', n], ['A', W], ['Q', n]] };
}

export const DIV_ALGOS = ['v1', 'v2', 'nonrestoring'];

/**
 * Divisão de a por b (padrões de n bits). Com sinal: divide as magnitudes; o quociente é negativo quando os
 * sinais diferem, e o resto tem o sinal do dividendo.
 */
export function divide(algo, n, a, b, signed) {
    const A = toUnsigned(a, n), B = toUnsigned(b, n);
    const allOnes = mask(n);
    if (B === 0n) return { algo, n, A, B, signed, rows: [], divByZero: true, quotient: allOnes, remainder: A, expected: { q: allOnes, r: A }, regs: [] };
    const minS = 1n << BigInt(n - 1);
    if (signed && A === minS && B === allOnes)
        return { algo, n, A, B, signed, rows: [], overflow: true, quotient: A, remainder: 0n, expected: { q: A, r: 0n }, regs: [] };
    const sa = signed && toSigned(A, n) < 0n, sb = signed && toSigned(B, n) < 0n;
    // A magnitude de -2^(n-1) não cabe em n bits com sinal, mas cabe como número sem sinal de n bits.
    const ma = sa ? toUnsigned(-toSigned(A, n), n) : A;
    const mb = sb ? toUnsigned(-toSigned(B, n), n) : B;
    const run = algo === 'v1' ? divV1 : algo === 'v2' ? divV2 : divNonRestoring;
    const out = run(n, ma, mb);
    let q = out.quotient, r = out.remainder;
    if (signed) {
        if (sa !== sb) q = toUnsigned(-q, n);
        if (sa) r = toUnsigned(-r, n);
        if (sa || sb) out.rows.push(row(out.rows.at(-1).iter, 'signFix', out.rows.at(-1).regs, { q, r }));
    }
    let expected;
    if (signed) {
        const x = toSigned(A, n), y = toSigned(B, n);
        // Divisão truncada em direção a zero, como no RISC-V e em C.
        const qq = x / y;
        expected = { q: toUnsigned(qq, n), r: toUnsigned(x - qq * y, n) };
    } else expected = { q: A / B, r: A % B };
    return { ...out, algo, n, A, B, signed, quotient: q, remainder: r, magnitudes: { ma, mb, sa, sb }, expected };
}
