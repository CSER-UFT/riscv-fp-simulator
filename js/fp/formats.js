/**
 * Formatos de ponto flutuante binário.
 *
 * Os formatos da IEEE 754 (half, single e double) e o bfloat16 seguem as regras usuais: expoente todo em 1
 * reservado para infinito e NaN, expoente zero para zero e subnormais. Os dois formatos de 8 bits seguem a
 * especificação OCP (Open Compute Project) usada em aprendizado de máquina:
 *   E5M2: como a IEEE 754 (tem infinitos e NaN);
 *   E4M3: sem infinitos; o único NaN de cada sinal é S.1111.111, e o expoente 1111 vale para números
 *         normais, o que aumenta o maior valor finito para 448.
 */

/** Modos de arredondamento do RISC-V (campo rm das instruções e frm do fcsr), na ordem da codificação. */
export const ROUNDING_MODES = ['rne', 'rtz', 'rdn', 'rup', 'rmm'];

/**
 * @typedef {object} Format
 * @property {string} id
 * @property {number} bits largura total
 * @property {number} expBits bits do expoente
 * @property {number} fracBits bits da fração (sem o bit implícito)
 * @property {number} bias
 * @property {boolean} hasInf se há infinitos (E4M3 não tem)
 * @property {string|null} suffix sufixo da instrução RISC-V (h, s, d) ou null
 */

function make(id, bits, expBits, opts = {}) {
    const fracBits = bits - 1 - expBits;
    const bias = (1 << (expBits - 1)) - 1;
    const hasInf = opts.hasInf ?? true;
    const p = fracBits + 1;
    const expMaxField = (1 << expBits) - 1;
    const f = {
        id, bits, expBits, fracBits, bias, hasInf, p,
        suffix: opts.suffix ?? null,
        group: opts.group,
        emin: 1 - bias,
        // Maior expoente de números normais: na IEEE 754, o campo todo em 1 é reservado.
        emax: (hasInf ? expMaxField - 1 : expMaxField) - bias,
        // Maior significando (com o bit implícito) no maior expoente: no E4M3, a fração 111 é o NaN.
        maxSig: hasInf ? (1n << BigInt(p)) - 1n : (1n << BigInt(p)) - 2n,
        expMaxField,
        mask: (1n << BigInt(bits)) - 1n,
        signBit: 1n << BigInt(bits - 1),
        fracMask: (1n << BigInt(fracBits)) - 1n,
        hexDigits: Math.ceil(bits / 4),
    };
    return Object.freeze(f);
}

export const FORMATS = Object.freeze({
    half: make('half', 16, 5, { suffix: 'h', group: 'ieee' }),
    single: make('single', 32, 8, { suffix: 's', group: 'ieee' }),
    double: make('double', 64, 11, { suffix: 'd', group: 'ieee' }),
    bf16: make('bf16', 16, 8, { group: 'ml' }),
    e5m2: make('e5m2', 8, 5, { group: 'ml' }),
    e4m3: make('e4m3', 8, 4, { hasInf: false, group: 'ml' }),
});

/** Ordem de exibição: do maior para o menor. */
export const FORMAT_IDS = ['double', 'single', 'half', 'bf16', 'e5m2', 'e4m3'];

export function getFormat(id) {
    const f = FORMATS[id];
    if (!f) throw new Error(`formato desconhecido: ${id}`);
    return f;
}
