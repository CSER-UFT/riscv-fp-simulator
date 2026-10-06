/**
 * Simulador de Ponto Flutuante RISC-V: vistas (conversão, operações, experimentos, aritmética inteira, ponto
 * fixo e exercícios), estado salvo no navegador, link compartilhável, exportação em LaTeX, idioma e tema.
 */
import { t, LANGUAGES, getLanguage, setLanguage } from './i18n/index.js';
import { Help } from './ui/help.js';
import { esc, copyText } from './ui/common.js';
import * as convert from './ui/convert.js';
import * as ops from './ui/ops.js';
import * as experiments from './ui/experiments.js';
import * as integer from './ui/integer.js';
import * as fixed from './ui/fixed.js';
import * as exercise from './ui/exercise.js';

const VIEWS = { convert, ops, exp: experiments, int: integer, fix: fixed, ex: exercise };
const VIEW_IDS = Object.keys(VIEWS);
const STORE = 'fp.state';

const main = document.getElementById('main');
const nav = document.getElementById('views');
const exportMenu = document.getElementById('export-menu');

function freshState() {
    return { view: 'convert', ...Object.fromEntries(VIEW_IDS.map((v) => [v, VIEWS[v].defaults()])) };
}

/** Mescla um estado parcial (salvo ou do link) sobre os padrões, ignorando chaves desconhecidas. */
function merge(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    const out = { ...base };
    if (VIEW_IDS.includes(patch.view)) out.view = patch.view;
    for (const v of VIEW_IDS) if (patch[v] && typeof patch[v] === 'object') out[v] = { ...base[v], ...patch[v] };
    return out;
}

function loadState() {
    let st = freshState();
    try { st = merge(st, JSON.parse(localStorage.getItem(STORE) ?? 'null')); } catch { /* sem armazenamento */ }
    if (location.hash.startsWith('#s=')) {
        try { st = merge(st, decodeShare(location.hash.slice(3))); } catch { /* link inválido */ }
        history.replaceState(null, '', location.pathname);
    }
    return st;
}

let state = loadState();
let saveTimer = null;

const ctx = {
    save() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* ignora */ }
        }, 200);
    },
    rerender: () => renderView(),
    openLink(link) {
        const { view, ...rest } = link;
        const target = { convert: 'convert', ops: 'ops', int: 'int', fix: 'fix' }[view];
        if (!target) return;
        state[target] = { ...state[target], ...rest, ...(target === 'ops' ? { hex: false } : {}) };
        state.view = target;
        ctx.save();
        renderView();
    },
};

function renderNav() {
    nav.innerHTML = VIEW_IDS.map((v) => `<button type="button" role="tab" class="view-tab ${state.view === v ? 'cur' : ''}" data-view="${v}" aria-selected="${state.view === v}">${esc(t(`view.${v}`))}</button>`).join('');
    for (const b of nav.querySelectorAll('[data-view]')) b.addEventListener('click', () => {
        state.view = b.dataset.view;
        ctx.save();
        renderView();
    });
}

function renderView() {
    renderNav();
    main.dataset.view = state.view;
    VIEWS[state.view].render(main, state[state.view], ctx);
    document.title = `${t(`view.${state.view}`)} · ${t('ui.appName')}`;
}

// Exportação -------------------------------------------------------------------------------------------------

function download(filename, text) {
    const blob = new Blob([text], { type: 'application/x-tex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openExportMenu() {
    const items = exportMenu.querySelector('.menu-items');
    const list = VIEWS[state.view].latex(state[state.view]);
    items.innerHTML = list.length
        ? list.map((x, i) => `<button type="button" data-dl="${i}">${esc(t('ui.downloadTex', { label: x.label }))}</button><button type="button" data-copy="${i}">${esc(t('ui.copyTex', { label: x.label }))}</button>`).join('')
        : `<p class="dim">${esc(t('ui.nothingToExport'))}</p>`;
    for (const b of items.querySelectorAll('[data-dl]')) b.addEventListener('click', (e) => { e.stopPropagation(); const x = list[Number(b.dataset.dl)]; download(x.file, x.text); exportMenu.classList.remove('open'); });
    for (const b of items.querySelectorAll('[data-copy]')) b.addEventListener('click', async (e) => { e.stopPropagation(); await copyText(list[Number(b.dataset.copy)].text); exportMenu.classList.remove('open'); flash(exportMenu.querySelector('.btn'), t('ui.copied')); });
    const r = exportMenu.getBoundingClientRect();
    items.style.top = `${r.bottom}px`;
    items.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
}

exportMenu.querySelector('.btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = exportMenu.classList.toggle('open');
    if (open) openExportMenu();
});
document.addEventListener('click', (e) => { if (!exportMenu.contains(e.target)) exportMenu.classList.remove('open'); });

// Link compartilhável ----------------------------------------------------------------------------------------

function encodeShare(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeShare(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

function flash(el, text) {
    const old = el.textContent;
    el.textContent = text;
    setTimeout(() => { el.textContent = old; }, 1500);
}

document.getElementById('copy-link').addEventListener('click', async (e) => {
    const payload = { view: state.view, [state.view]: state[state.view] };
    const url = `${location.origin}${location.pathname}#s=${encodeShare(payload)}`;
    if (await copyText(url)) flash(e.currentTarget, t('ui.linkCopied'));
});

// Idioma, tema e ajuda ---------------------------------------------------------------------------------------

function applyStaticTexts() {
    document.documentElement.lang = getLanguage() === 'en' ? 'en' : 'pt-BR';
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
    for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}

const langSelect = document.getElementById('lang-select');
langSelect.innerHTML = Object.entries(LANGUAGES).map(([k, v]) => `<option value="${k}" ${k === getLanguage() ? 'selected' : ''}>${v}</option>`).join('');
langSelect.addEventListener('change', () => {
    setLanguage(langSelect.value);
    applyStaticTexts();
    help.render();
    renderView();
});

const themeBtn = document.getElementById('theme-toggle');
function syncThemeIcon() {
    themeBtn.querySelector('.icon').className = `icon ${document.documentElement.dataset.theme === 'dark' ? 'i-sun' : 'i-moon'}`;
}
themeBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('fp.theme', next); } catch { /* ignora */ }
    syncThemeIcon();
});

const readme = document.getElementById('readme');
const help = new Help(readme, () => {});
const HELP_SECTION = { convert: 'convert', ops: 'ops', exp: 'experiments', int: 'integer', fix: 'fixed', ex: 'classroom' };
// Ligações para uma seção da ajuda dentro das vistas (data-help="seção").
main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-help]');
    if (b) help.open(b.dataset.help);
});
document.getElementById('open-help').addEventListener('click', () => {
    if (help.isOverlay()) help.close();
    else help.open(HELP_SECTION[state.view]);
});

// Um link colado na mesma aba só muda o fragmento (#s=...): recarrega o estado sem recarregar a página.
window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#s=')) return;
    try { state = merge(state, decodeShare(location.hash.slice(3))); } catch { /* link inválido */ }
    history.replaceState(null, '', location.pathname);
    if (help.isOverlay()) help.close();
    ctx.save();
    renderView();
});

applyStaticTexts();
syncThemeIcon();
renderView();
