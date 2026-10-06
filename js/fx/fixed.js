/**
 * Ponto fixo binário no formato Qm.n (convenção da ARM): com sinal, 1 bit de sinal, m bits inteiros e n
 * bits de fração (1 + m + n bits, complemento de 2); sem sinal (UQm.n), m + n bits. O valor é o inteiro
 * guardado vezes 2^-n: a resolução é fixa (um ULP vale sempre 2^-n), ao contrário do ponto flutuante.
 *
 * Os resultados são calculados de forma exata e arredondados para inteiro (em unidades de 2^-n) em um dos
 * cinco modos. Fora da faixa, o resultado satura no extremo ou dá a volta (estouro em complemento de 2,
 * como faz uma soma inteira comum). Flags no mesmo padrão do ponto flutuante: OF (estouro) e NX (inexato).
 */
import { roundToInteger, FLAG } from '../fp/core.js';

export const OVERFLOW_MODES = ['sat', 'wrap'];

/**
 * @param {number} m bits inteiros (sem contar o sinal)
 * @param {number} n bits de fração
 * @param {boolean} signed
 */
export function fixedFormat(m, n, signed) {
    const bits = (signed ? 1 : 0) + m + n;
    if (m < 0 || n < 0 || bits < 2 || bits > 64) throw new Error('formato de ponto fixo inválido');
    const raw = 1n << BigInt(bits);
    return {
        m, n, signed, bits,
        name: `${signed ? 'Q' : 'UQ'}${m}.${n}`,
        min: signed ? -(raw >> 1n) : 0n,
        max: signed ? (raw >> 1n) - 1n : raw - 1n,
        mask: raw - 1n,
    };
}

/** Valor guardado (inteiro com sinal, em unidades de 2^-n) a partir dos bits. */
export function fromBits(fx, bits) {
    const b = BigInt.asUintN(fx.bits, BigInt(bits));
    return fx.signed ? BigInt.asIntN(fx.bits, b) : b;
}

export const toBits = (fx, raw) => BigInt.asUintN(fx.bits, raw);

/** Valor exato como racional {sign, N, D}. */
export function rawToRational(fx, raw) {
    const s = raw < 0n ? 1 : 0;
    return { sign: s, N: s ? -raw : raw, D: 1n << BigInt(fx.n) };
}

/** Encaixa um inteiro na faixa: satura ou dá a volta. */
function fit(fx, v, overflow) {
    if (v >= fx.min && v <= fx.max) return { raw: v, flags: 0 };
    if (overflow === 'sat') return { raw: v > fx.max ? fx.max : fx.min, flags: FLAG.OF };
    return { raw: fromBits(fx, v), flags: FLAG.OF };
}

/**
 * Arredonda o racional (sign, N/D) para o formato: inteiro mais próximo de x·2^n no modo pedido.
 * @returns {{raw: bigint, bits: bigint, flags: number, unrounded: bigint}} unrounded é o valor arredondado
 *   antes de encaixar na faixa
 */
export function fromRational(fx, sign, N, D, mode, overflow = 'sat') {
    const { value, inexact } = roundToInteger(sign, N << BigInt(fx.n), D, mode);
    const r = fit(fx, value, overflow);
    return { raw: r.raw, bits: toBits(fx, r.raw), flags: r.flags | (inexact ? FLAG.NX : 0), unrounded: value };
}

/**
 * Operações sobre os valores guardados (inteiros em unidades de 2^-n). Cada uma devolve também os passos
 * da conta inteira, para exibição: soma e subtração são exatas antes do encaixe; a multiplicação tem 2n
 * bits de fração e é deslocada n posições para a direita com arredondamento; a divisão desloca o
 * dividendo n posições para a esquerda antes de dividir.
 */
export function operate(fx, op, a, b, mode, overflow = 'sat') {
    const steps = [];
    let exact; // valor exato em unidades de 2^-n, como racional {N, D} com sinal em N
    if (op === 'add' || op === 'sub') {
        const s = op === 'add' ? a + b : a - b;
        steps.push({ key: op === 'add' ? 'fxAdd' : 'fxSub', a, b, value: s });
        exact = { N: s, D: 1n };
    } else if (op === 'mul') {
        const p = a * b;
        steps.push({ key: 'fxMul', a, b, value: p, fracBits: 2 * fx.n });
        exact = { N: p, D: 1n << BigInt(fx.n) };
        steps.push({ key: 'fxShift', n: fx.n });
    } else if (op === 'div') {
        if (b === 0n) {
            // Divisão por zero: satura no extremo do sinal do dividendo (zero ÷ zero dá zero), com OF.
            const raw = a > 0n ? fx.max : a < 0n ? fx.min : 0n;
            return { raw, bits: toBits(fx, raw), flags: FLAG.OF, steps: [{ key: 'fxDivZero' }], exact: null };
        }
        const num = a << BigInt(fx.n);
        steps.push({ key: 'fxDiv', a, b, value: num });
        exact = { N: num, D: b };
    } else throw new Error(`operação desconhecida: ${op}`);
    let N = exact.N, D = exact.D;
    if (D < 0n) { N = -N; D = -D; }
    const sign = N < 0n ? 1 : 0;
    const { value, inexact } = roundToInteger(sign, sign ? -N : N, D, mode);
    if (inexact) steps.push({ key: 'fxRound', value, mode });
    const r = fit(fx, value, overflow);
    if (r.flags) steps.push({ key: overflow === 'sat' ? 'fxSat' : 'fxWrap', value, raw: r.raw });
    return { raw: r.raw, bits: toBits(fx, r.raw), flags: r.flags | (inexact ? FLAG.NX : 0), steps, exact: { sign, N: sign ? -N : N, D: D << BigInt(fx.n) } };
}

export const FX_OPS = ['add', 'sub', 'mul', 'div'];
