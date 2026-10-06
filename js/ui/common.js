/**
 * Utilidades da interface: escape de HTML, marcações simples das mensagens, seletores, bits e flags.
 */
import { t } from '../i18n/index.js';
import { FORMATS, FORMAT_IDS, ROUNDING_MODES, getFormat } from '../fp/formats.js';
import { FLAG_NAMES, FLAG } from '../fp/core.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]);

/** Marcações das mensagens: **negrito**, //itálico// e `código`. */
export const md = (s) => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\/\/([^/]+)\/\//g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

/** Tradução com marcações. */
export const tm = (key, params) => md(t(key, params));

/** Célula que pode ser texto ou {key, params} para traduzir. */
export const cell = (c) => (c && typeof c === 'object' && 'key' in c ? tm(c.key, c.params ?? {}) : esc(c));

export const fmtName = (id) => t(`fmt.${id}`);
export const modeName = (m) => t(`mode.${m}`);

export function options(pairs, cur) {
    return pairs.map(([k, v]) => `<option value="${esc(k)}" ${String(k) === String(cur) ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

export const formatOptions = (cur, ids = FORMAT_IDS) => options(ids.map((id) => [id, `${fmtName(id)} (${FORMATS[id].bits} bits)`]), cur);
export const modeOptions = (cur) => options(ROUNDING_MODES.map((m) => [m, `${m.toUpperCase()}: ${modeName(m)}`]), cur);

/** Distintivos das flags (todas, com as ligadas destacadas). */
export function flagsHtml(mask, { all = true } = {}) {
    const items = FLAG_NAMES.filter((n) => all || mask & FLAG[n]).map((n) => `<span class="flag ${mask & FLAG[n] ? 'on' : ''}" title="${esc(t(`flag.${n}`))}">${n}</span>`);
    if (!all && items.length === 0) return `<span class="dim">${esc(t('ui.noFlags'))}</span>`;
    return `<span class="flags">${items.join('')}</span>`;
}

/** Bits de um padrão como texto binário, com espaços separando sinal, expoente e fração. */
export function bitsText(fmtId, bits) {
    const f = getFormat(fmtId);
    const b = BigInt(bits).toString(2).padStart(f.bits, '0');
    return `${b[0]} ${b.slice(1, 1 + f.expBits)} ${b.slice(1 + f.expBits)}`;
}

/**
 * Bits clicáveis, coloridos por campo. data-bit guarda a posição (0 = menos significativo).
 * @param {boolean} editable
 */
export function bitsHtml(fmtId, bits, { editable = false } = {}) {
    const f = getFormat(fmtId);
    const b = BigInt(bits).toString(2).padStart(f.bits, '0');
    const cells = [...b].map((ch, i) => {
        const pos = f.bits - 1 - i;
        const field = i === 0 ? 'sign' : i <= f.expBits ? 'exp' : 'frac';
        const first = i === 0 || i === 1 || i === 1 + f.expBits;
        const tag = editable ? 'button type="button"' : 'span';
        const close = editable ? 'button' : 'span';
        return `<${tag} class="bit ${field} ${ch === '1' ? 'one' : ''} ${first ? 'first' : ''}" data-bit="${pos}" title="${esc(t('ui.bitN', { n: pos }))}">${ch}</${close}>`;
    }).join('');
    const legend = `<div class="bit-legend"><span class="sign">${esc(t('ui.sign'))}</span><span class="exp">${esc(t('ui.exponent'))} (${f.expBits})</span><span class="frac">${esc(t('ui.fraction'))} (${f.fracBits})</span></div>`;
    return `<div class="bits ${f.bits > 32 ? 'wide' : ''}">${cells}</div>${legend}`;
}

/**
 * Registro do traço como bits: parte inteira, vírgula, fração e bits extras (G, R, S) destacados.
 */
export function regHtml(r) {
    const total = r.int + r.w;
    let s = BigInt(r.v).toString(2);
    if (s.length < total) s = s.padStart(total, '0');
    const intLen = s.length - r.w;
    const intPart = s.slice(0, intLen) || '0';
    const frac = s.slice(intLen);
    const main = frac.slice(0, frac.length - r.extra);
    const extra = frac.slice(frac.length - r.extra);
    const grs = r.extra ? `<span class="grs">${[...extra].map((c, i) => `<span title="${['G', 'R', 'S'][i] ?? ''}">${c}</span>`).join('')}</span>` : '';
    // Frações longas (produto de double) ficam quebradas em grupos de 4 para ler.
    const group = (x) => x.replace(/(.{4})(?=.)/g, '$1&#8203;');
    return `<span class="reg"><span class="int">${intPart}</span>.<span class="fr">${group(main)}</span>${grs}</span>`;
}

/** Número em notação curta para tabelas. */
export function num(x, digits = 4) {
    if (!Number.isFinite(x)) return String(x);
    if (x === 0) return '0';
    const a = Math.abs(x);
    if (a >= 1e-3 && a < 1e6) return String(Number(x.toPrecision(digits)));
    return x.toExponential(digits - 1).replace('e+', 'e');
}

/** Copia para a área de transferência, com recurso para navegadores sem permissão. */
export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        window.prompt('', text);
        return false;
    }
}
