/**
 * Textos explicativos dos passos (com marcações **negrito** e `código`), usados pela interface e pela
 * exportação em LaTeX. Sem DOM.
 */
import { t } from '../i18n/index.js';
import { flagList } from '../fp/core.js';
import { hex } from './analysis.js';

/** Explicação da decisão de arredondamento a partir de G, R, S e do bit menos significativo. */
export function roundReason(p, sign) {
    if (!p.inexact) return t('st.round.exact');
    const half = p.G === 1 && (p.R | p.S) === 0;
    switch (p.mode) {
        case 'rne':
            if (p.G === 0) return t('st.round.below');
            if (!half) return t('st.round.above');
            return t(p.lsb ? 'st.round.tieOdd' : 'st.round.tieEven');
        case 'rmm': return t(p.G ? 'st.round.away' : 'st.round.below');
        case 'rtz': return t('st.round.rtz');
        case 'rdn': return t(sign ? 'st.round.awayNeg' : 'st.round.truncPos', { dir: t('st.dir.down') });
        case 'rup': return t(sign ? 'st.round.truncNeg' : 'st.round.awayPos', { dir: t('st.dir.up') });
        default: return '';
    }
}

/** Título e explicação de um passo do traço de ponto flutuante. */
export function stepText(step, tr) {
    const p = step.params ?? {};
    const f = tr.fmt;
    const signOf = () => step.regs?.[0]?.sign ?? 0;
    switch (step.key) {
        case 'unpack': return t('st.unpack', { emin: f.emin });
        case 'swap': return t('st.swap');
        case 'align': return t(p.d === 0 ? 'st.alignNone' : 'st.align', { d: p.d }) + (p.sticky ? ` ${t('st.alignSticky')}` : '');
        case 'addSig': return t('st.addSig');
        case 'subSig': return t('st.subSig');
        case 'normalizeAdd':
            return (p.shift < 0 ? t('st.normCarry', { E: p.E }) : p.shift === 0 ? t('st.normNone') : t('st.normLeft', { n: p.shift, E: p.E }))
                + (p.subnormal ? ` ${t('st.normSub', { emin: f.emin })}` : '');
        case 'normalize': {
            let s = p.shift === 0 ? t('st.normNone') : p.shift > 0 ? t('st.normRight', { n: p.shift, E: p.E }) : t('st.normLeft', { n: -p.shift, E: p.E });
            if (p.denorm) s += ` ${t('st.denorm', { n: p.denorm, emin: f.emin })}`;
            if (p.sticky) s += ` ${t('st.stickyRem')}`;
            return s;
        }
        case 'round':
            return `${t('st.round', { mode: p.mode.toUpperCase(), G: p.G, R: p.R, S: p.S, lsb: p.lsb })} ${roundReason(p, signOf())}`;
        case 'renormalize': return t('st.renorm', { E: p.E });
        case 'pack': return t('st.pack', { E: p.E, bias: f.bias, field: p.E + f.bias, hex: hex(f.id, p.bits) });
        case 'packSubnormal': return t('st.packSub', { hex: hex(f.id, p.bits) });
        case 'packZero': return t('st.packZero', { hex: hex(f.id, p.bits) });
        case 'overflow': return t(f.hasInf ? 'st.overflow' : 'st.overflowE4M3', { hex: hex(f.id, p.bits), mode: tr.mode.toUpperCase() });
        case 'exactZero': return t('st.exactZero', { s: p.sign ? '−0' : '+0' });
        case 'mulExp': return t('st.mulExp', { Ea: p.Ea, Eb: p.Eb, E: p.E, s: p.sign });
        case 'mulSig': return t('st.mulSig', { n: 2 * f.p });
        case 'normOperands': return t('st.normOperands');
        case 'divExp': return t('st.divExp', { Ea: p.Ea, Eb: p.Eb, E: p.E, s: p.sign });
        case 'divSig': return t(p.remainder ? 'st.divSigRem' : 'st.divSigExact', { n: f.p + 3 });
        case 'sqrtExp': return t(p.odd ? 'st.sqrtOdd' : 'st.sqrtEven', { E: p.E, h: p.half });
        case 'sqrtSig': return t(p.remainder ? 'st.sqrtSigRem' : 'st.sqrtSigExact', { n: f.p + 3 });
        case 'fmaProduct': return t('st.fmaProduct', { n: 2 * f.p });
        case 'fmaAdd': return t('st.fmaAdd');
        default: return step.key;
    }
}

export function specialText(tr) {
    return t(`st.special.${tr.special}`, { hex: hex(tr.fmt.id, tr.result.bits), flags: flagList(tr.result.flags).join(' ') || '-' });
}

export const regLabel = (r) => t(`reg.${r.label}`);

/** Explicação de um passo dos algoritmos inteiros. */
export function intStepText(row, res) {
    const p = row.params ?? {};
    const key = `ist.${row.step}`;
    return t(key, { ...p, neg: p.negative ? t('ist.negYes') : t('ist.negNo'), n: res.n });
}

/**
 * Por que o modo `mode` escolhe o resultado que escolhe, com os números do caso (texto com marcações).
 * @param {object} ex resultado de roundingExplain
 */
export function modeReason(ex, mode) {
    if (ex.exact) return t('rx.exact');
    const lo = ex.lo.text, hi = ex.hi.text;
    const beyond = ex.r > 1;
    const near = (pick) => {
        if (beyond) return t('rx.beyond', { lo, hi });
        // O mais próximo é o valor da grade logo depois do maior finito: estouro.
        if (ex.overflow && pick === hi) return t('rx.nearOver', { lo, hi, dlo: ex.dLo, dhi: ex.dHi });
        return t('rx.near', { pick, lo, hi, dlo: ex.dLo, dhi: ex.dHi });
    };
    switch (mode) {
        case 'rne':
            if (ex.half) return t('rx.tieEven', { lo, hi, llo: ex.lo.lsb ?? '-', lhi: ex.hi.lsb ?? '-', pick: ex.modes[0].text });
            return near(ex.modes[0].text);
        case 'rmm':
            if (ex.half) return t('rx.tieAway', { hi });
            return near(ex.modes[4].text);
        case 'rtz': return t('rx.rtz', { lo }) + (ex.overflow ? ` ${t('rx.rtzOver')}` : '');
        case 'rdn': return t(ex.sign ? 'rx.downNeg' : 'rx.downPos', { lo, hi });
        case 'rup': return t(ex.sign ? 'rx.upNeg' : 'rx.upPos', { lo, hi });
        default: return '';
    }
}

/** Resumo da parte descartada: G, R, S e quanto ela vale em ULPs. */
export function droppedSummary(ex) {
    if (ex.exact) return t('rx.noDrop');
    // Além do próximo valor da grade, o corte depois do bit p não corresponde a nenhum vizinho do formato.
    if (ex.r >= 1) return t('rx.overRange', { lo: ex.lo.text });
    const rel = ex.r > 1 ? t('rx.relBeyond') : ex.half ? t('rx.relHalf') : ex.G ? t('rx.relAbove') : t('rx.relBelow');
    return t('rx.grs', { G: ex.G, R: ex.R, S: ex.S, r: ex.r > 1 ? '>1' : ex.dLo, rel });
}
