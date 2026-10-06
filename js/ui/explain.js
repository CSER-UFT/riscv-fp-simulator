/**
 * Painel "Como cada modo decide", usado na conversão (x é o número digitado) e nas operações (x é o
 * resultado exato).
 */
import { t } from '../i18n/index.js';
import { modeReason, droppedSummary } from '../app/text.js';
import { esc, md } from './common.js';

/**
 * Painel "Como cada modo decide": o significando de x em binário com o corte depois do bit p, os bits
 * G, R e S destacados, a fração de ULP descartada, os vizinhos e uma frase por modo.
 */
export function explainHtml(ex, cur) {
    const p = ex.fmt.p;
    const kept = `<span class="xb-kept"><span class="xb-int">${ex.kept[0]}</span>.${ex.kept.slice(1)}</span>`;
    const d = ex.dropped;
    const dropped = d
        ? `<span class="xb-drop">${d[0] ? `<b class="xb-g" title="G">${d[0]}</b>` : ''}${d[1] ? `<b class="xb-r" title="R">${d[1]}</b>` : ''}<span class="xb-s" title="S">${d.slice(2)}${ex.more ? '…' : ''}</span></span>`
        : '';
    const rows = ex.modes.map((m) => `<tr class="${m.mode === cur ? 'cur' : ''}"><th>${m.mode.toUpperCase()}</th><td><b>${esc(m.text)}</b><br/><code class="sub">${esc(m.hex)}</code></td><td>${md(modeReason(ex, m.mode))}</td></tr>`).join('');
    return `<section class="card span2 explain">
        <h2>${esc(t('rx.title'))} <span class="sub">${esc(t('rx.sub'))}</span></h2>
        <div class="xbits mono">
            <div class="xb-line">${ex.sign ? '−' : '+'}${kept}${d ? '<span class="xb-cut">|</span>' : ''}${dropped} <span class="xb-exp">× 2<sup>${ex.E}</sup></span></div>
            <div class="xb-legend"><span class="xb-kept">${esc(t('rx.kept', { p }))}</span>${d ? `<span class="xb-drop">${esc(t('rx.dropped'))}: <b class="xb-g">G</b> <b class="xb-r">R</b> <span class="xb-s">S</span></span>` : ''}${ex.more ? `<span class="dim">${esc(t('rx.repeating'))}</span>` : ''}</div>
        </div>
        <p class="note">${md(droppedSummary(ex))}</p>
        ${ex.exact ? '' : `<p class="note">${md(t('rx.neighbors', { lo: ex.lo.text, hi: ex.hi.text, loHex: ex.lo.hex, hiHex: ex.hi.hex }))} ${esc(t('rx.cutNote'))}</p>`}
        ${ex.subnormal ? `<p class="note">${esc(t('rx.subnormal'))}</p>` : ''}
        <table class="data why"><tr><th>${esc(t('rx.mode'))}</th><th>${esc(t('rx.result'))}</th><th>${esc(t('rx.why'))}</th></tr>${rows}</table>
        <p class="hint"><button type="button" class="link" data-help="rounding">${esc(t('rx.moreHelp'))}</button></p>
    </section>`;
}

