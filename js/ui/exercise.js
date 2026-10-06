/**
 * Vista de exercícios: questões sorteadas com semente (o link reproduz a lista), correção na hora,
 * solução comentada, atalho para abrir a questão no simulador e exportação em LaTeX.
 */
import { t } from '../i18n/index.js';
import { generate, QUESTION_TYPES } from '../app/questions.js';
import { questionsLatex } from '../app/latex.js';
import { FORMAT_IDS, ROUNDING_MODES } from '../fp/formats.js';
import { esc, tm, fmtName } from './common.js';

export const defaults = () => ({ seed: 1 + Math.floor(Math.random() * 9999), count: 8, types: [...QUESTION_TYPES], formats: ['half', 'single', 'bf16', 'e4m3'], modes: [...ROUNDING_MODES] });

const params = (q) => ({ ...q.text.params, fmt: q.text.params.fmt ? fmtName(q.text.params.fmt) : '', mode: (q.text.params.mode ?? '').toUpperCase() });

export function render(el, st, ctx) {
    const qs = generate(st);
    const checks = (name, all, cur, label) => all.map((x) => `<label class="check-chip"><input type="checkbox" data-${name}="${x}" ${cur.includes(x) ? 'checked' : ''}/>${esc(label(x))}</label>`).join('');
    el.innerHTML = `
        <section class="card form">
            <div class="row">
                <label class="field"><span>${esc(t('ex.count'))}</span><input id="ex-count" type="number" min="1" max="40" value="${st.count}"/></label>
                <label class="field"><span>${esc(t('ex.seed'))}</span><input id="ex-seed" type="number" min="1" value="${st.seed}"/></label>
                <button type="button" class="btn primary" id="ex-new">${esc(t('ex.new'))}</button>
            </div>
            <div class="chips"><span class="chips-label">${esc(t('ex.types'))}</span>${checks('type', QUESTION_TYPES, st.types, (x) => t(`q.type.${x}`))}</div>
            <div class="chips"><span class="chips-label">${esc(t('ui.formats'))}</span>${checks('fmt', FORMAT_IDS, st.formats, fmtName)}</div>
            <div class="chips"><span class="chips-label">${esc(t('ui.modes'))}</span>${checks('mode', ROUNDING_MODES, st.modes, (x) => x.toUpperCase())}</div>
        </section>
        <section class="card">
            <h2>${esc(t('ex.title'))} <span class="sub">${esc(t('ex.sub'))}</span></h2>
            ${qs.length ? `<ol class="questions">${qs.map((q, i) => `<li data-q="${i}">
                <p>${tm(q.text.key, params(q))}</p>
                <div class="answer-row"><input class="ans" data-i="${i}" placeholder="${esc(t(`q.ph.${q.type}`))}" spellcheck="false" autocomplete="off"/>
                    <span class="verdict"></span>
                    <button type="button" class="btn small" data-sol="${i}">${esc(t('ex.showSolution'))}</button>
                    <button type="button" class="btn small" data-open="${i}">${esc(t('ex.open'))}</button></div>
                <p class="solution hidden"></p></li>`).join('')}</ol>
            <div class="row"><button type="button" class="btn primary" id="ex-check">${esc(t('ex.check'))}</button><span id="ex-score" class="score"></span></div>`
        : `<p class="note warn">${esc(t('ex.none'))}</p>`}
        </section>`;
    const $ = (s) => el.querySelector(s);
    const regen = () => { ctx.save(); render(el, st, ctx); };
    $('#ex-count').addEventListener('change', (e) => { st.count = Math.max(1, Math.min(40, Number(e.target.value) || 8)); regen(); });
    $('#ex-seed').addEventListener('change', (e) => { st.seed = Math.max(1, Number(e.target.value) || 1); regen(); });
    $('#ex-new').addEventListener('click', () => { st.seed = 1 + Math.floor(Math.random() * 99999); regen(); });
    for (const [name, key] of [['type', 'types'], ['fmt', 'formats'], ['mode', 'modes']]) {
        for (const c of el.querySelectorAll(`[data-${name}]`)) c.addEventListener('change', () => {
            st[key] = [...el.querySelectorAll(`[data-${name}]:checked`)].map((x) => x.dataset[name]);
            regen();
        });
    }
    const verdict = (i) => {
        const inp = el.querySelector(`.ans[data-i="${i}"]`);
        const v = inp.value.trim();
        const box = inp.parentElement.querySelector('.verdict');
        if (!v) { box.textContent = ''; box.className = 'verdict'; return null; }
        const ok = qs[i].check(v);
        box.textContent = ok ? t('ex.right') : t('ex.wrong');
        box.className = `verdict ${ok ? 'ok' : 'bad'}`;
        return ok;
    };
    for (const inp of el.querySelectorAll('.ans')) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') verdict(Number(inp.dataset.i)); });
    $('#ex-check')?.addEventListener('click', () => {
        let right = 0;
        qs.forEach((_, i) => { if (verdict(i)) right++; });
        $('#ex-score').textContent = t('ex.score', { r: right, n: qs.length });
    });
    for (const b of el.querySelectorAll('[data-sol]')) b.addEventListener('click', () => {
        const q = qs[Number(b.dataset.sol)];
        const p = b.closest('li').querySelector('.solution');
        p.innerHTML = `${esc(t('ex.answer'))}: <code>${esc(q.answer)}</code>. ${tm(q.solution.key, q.solution.params)}`;
        p.classList.toggle('hidden');
    });
    for (const b of el.querySelectorAll('[data-open]')) b.addEventListener('click', () => ctx.openLink(qs[Number(b.dataset.open)].link));
}

export function latex(st) {
    const qs = generate(st);
    if (!qs.length) return [];
    return [
        { id: 'ex', label: t('tex.exBlank'), file: 'exercicios.tex', text: questionsLatex(qs, false) },
        { id: 'exAns', label: t('tex.exAnswers'), file: 'exercicios-gabarito.tex', text: questionsLatex(qs, true) },
    ];
}
