/**
 * Leitura de números em texto como racionais exatos e escrita do valor decimal exato de um número binário.
 *
 * Formas aceitas: decimal (-12.375), notação científica (6.02e23), fração (1/3), potência de 2 (2^-10),
 * hexadecimal de ponto flutuante como em C (0x1.8p3), inf, infinity e nan (com sinal opcional).
 */
import { decode, toRational, fromRational, toNumber, canonicalNaN, infinity, maxFinite, FLAG } from './core.js';
import { getFormat } from './formats.js';

/** Expoente decimal a partir do qual o valor estoura ou some em qualquer formato (até double). */
const DEC_LIMIT = 400;

/**
 * @returns {{kind: 'finite', sign, N, D} | {kind: 'inf', sign} | {kind: 'nan'} | null} null se inválido
 */
export function parseNumber(text) {
    let s = String(text).trim().toLowerCase().replace(/\s+/g, '').replace(/,/g, '.').replace(/−/g, '-');
    if (!s) return null;
    let sign = 0;
    if (s[0] === '+' || s[0] === '-') {
        sign = s[0] === '-' ? 1 : 0;
        s = s.slice(1);
    }
    if (s === 'inf' || s === 'infinity' || s === '∞') return { kind: 'inf', sign };
    if (s === 'nan') return { kind: 'nan' };

    let m = /^(\d+)\/(\d+)$/.exec(s);
    if (m) {
        const D = BigInt(m[2]);
        if (D === 0n) return null;
        return { kind: 'finite', sign, N: BigInt(m[1]), D };
    }
    m = /^2\^([+-]?\d+)$/.exec(s);
    if (m) {
        const k = Math.max(-2000, Math.min(2000, Number(m[1])));
        return k >= 0 ? { kind: 'finite', sign, N: 1n << BigInt(k), D: 1n } : { kind: 'finite', sign, N: 1n, D: 1n << BigInt(-k) };
    }
    m = /^0x([0-9a-f]*)(?:\.([0-9a-f]*))?(?:p([+-]?\d+))?$/.exec(s);
    if (m && (m[1] || m[2])) {
        const intPart = m[1] || '0', fracPart = m[2] || '';
        let N = BigInt(`0x${intPart}${fracPart}`);
        let e = (m[3] ? Number(m[3]) : 0) - 4 * fracPart.length;
        e = Math.max(-3000, Math.min(3000, e));
        return e >= 0 ? { kind: 'finite', sign, N: N << BigInt(e), D: 1n } : { kind: 'finite', sign, N, D: 1n << BigInt(-e) };
    }
    m = /^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/.exec(s);
    if (!m || (!m[1] && !m[2])) return null;
    const intPart = m[1] || '', fracPart = m[2] || '';
    const digits = (intPart + fracPart).replace(/^0+/, '') || '0';
    let N = BigInt(digits);
    let e10 = (m[3] ? Number(m[3]) : 0) - fracPart.length;
    if (N === 0n) return { kind: 'finite', sign, N: 0n, D: 1n };
    // Limita expoentes absurdos: acima de 10^400 qualquer formato estoura; abaixo de 10^-400, qualquer
    // formato arredonda para zero ou para o menor subnormal, como com o valor original.
    const mag = e10 + digits.length - 1;
    if (mag > DEC_LIMIT) { N = 1n; e10 = DEC_LIMIT + 1; }
    if (mag < -DEC_LIMIT) { N = 1n; e10 = -DEC_LIMIT - 1; }
    return e10 >= 0
        ? { kind: 'finite', sign, N: N * 10n ** BigInt(e10), D: 1n }
        : { kind: 'finite', sign, N, D: 10n ** BigInt(-e10) };
}

/**
 * Converte um texto para o formato no modo dado.
 * @returns {{bits, flags, exact, parsed} | null}
 */
export function fromText(fmtId, text, mode, opts = {}) {
    const f = getFormat(fmtId);
    const p = parseNumber(text);
    if (!p) return null;
    if (p.kind === 'nan') return { bits: canonicalNaN(f), flags: 0, parsed: p };
    if (p.kind === 'inf') {
        if (f.hasInf) return { bits: infinity(f, p.sign), flags: 0, parsed: p };
        return opts.sat ? { bits: maxFinite(f, p.sign), flags: FLAG.NX, parsed: p } : { bits: canonicalNaN(f), flags: FLAG.NV, parsed: p };
    }
    return { ...fromRational(f, p.sign, p.N, p.D, mode, opts), parsed: p };
}

/** Expansão decimal exata de um racional cujo denominador é potência de 2 (ou inteiro). */
export function exactDecimal(sign, N, D) {
    const s = sign ? '-' : '';
    if (D === 1n) return s + N.toString();
    // N / 2^k = N·5^k / 10^k
    const k = D.toString(2).length - 1;
    if (1n << BigInt(k) !== D) throw new Error('denominador não é potência de 2');
    const digits = (N * 5n ** BigInt(k)).toString().padStart(k + 1, '0');
    const int = digits.slice(0, digits.length - k);
    const frac = digits.slice(digits.length - k).replace(/0+$/, '');
    return s + int + (frac ? `.${frac}` : '');
}

/** Valor decimal exato de um padrão de bits ("NaN", "+∞" para especiais). */
export function exactValueText(fmtId, bits) {
    const v = decode(fmtId, bits);
    if (v.cls === 'nan') return 'NaN';
    if (v.cls === 'inf') return v.sign ? '-∞' : '+∞';
    if (v.cls === 'zero') return v.sign ? '-0' : '0';
    const r = toRational(v);
    return exactDecimal(r.sign, r.N, r.D);
}

/**
 * Menor texto decimal que, lido no modo rne, devolve os mesmos bits (o que um printf bem feito mostraria).
 */
export function shortestText(fmtId, bits) {
    const v = decode(fmtId, bits);
    if (v.cls === 'nan') return 'NaN';
    if (v.cls === 'inf') return v.sign ? '-inf' : 'inf';
    const x = toNumber(v);
    if (v.cls === 'zero') return v.sign ? '-0' : '0';
    for (let k = 1; k <= 17; k++) {
        const t = x.toPrecision(k);
        const back = fromText(fmtId, t, 'rne');
        if (back && back.bits === v.bits) {
            // Prefere a escrita do JavaScript (sem expoente entre 1e-7 e 1e21), se ela recuperar os mesmos bits.
            const js = String(Number(t)).replace('e+', 'e');
            const again = fromText(fmtId, js, 'rne');
            return again && again.bits === v.bits ? js : t.replace('e+', 'e');
        }
    }
    return String(x).replace('e+', 'e');
}

/** Valor aproximado de um racional como número JavaScript (para gráficos e erros relativos). */
export function ratToNumber(sign, N, D) {
    if (N === 0n) return sign ? -0 : 0;
    // Mantém 64 bits significativos de N e de D para não estourar.
    const bn = N.toString(2).length, bd = D.toString(2).length;
    const sn = Math.max(0, bn - 64), sd = Math.max(0, bd - 64);
    const x = (Number(N >> BigInt(sn)) / Number(D >> BigInt(sd))) * 2 ** (sn - sd);
    return sign ? -x : x;
}

/**
 * Texto de um racional em notação científica com `digits` algarismos significativos, sem passar por double
 * (funciona para erros minúsculos, como 1e-400).
 */
export function ratToSci(sign, N, D, digits = 6) {
    if (N === 0n) return '0';
    // Encontra k com 10^k ≤ N/D < 10^(k+1).
    let k = N.toString().length - D.toString().length;
    const ge = (kk) => (kk >= 0 ? N >= D * 10n ** BigInt(kk) : N * 10n ** BigInt(-kk) >= D);
    if (!ge(k)) k--;
    const scale = digits - 1 - k;
    const num = scale >= 0 ? N * 10n ** BigInt(scale) : N;
    const den = scale >= 0 ? D : D * 10n ** BigInt(-scale);
    let q = num / den;
    if ((num % den) * 2n >= den) q += 1n;
    let str = q.toString();
    if (str.length > digits) { str = str.slice(0, digits); k++; }
    const mant = str.length > 1 ? `${str[0]}.${str.slice(1)}`.replace(/\.?0+$/, '') : str;
    return `${sign ? '-' : ''}${mant}e${k}`;
}
