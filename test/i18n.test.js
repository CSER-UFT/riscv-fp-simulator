/**
 * Dicionários e ajuda: as mesmas chaves nos dois idiomas, toda chave usada no código existe, os mesmos
 * parâmetros em cada tradução e nenhum travessão nos textos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import pt from '../js/i18n/pt.js';
import en from '../js/i18n/en.js';
import helpPt from '../js/help/pt.js';
import helpEn from '../js/help/en.js';
import { EXPERIMENTS } from '../js/app/experiments.js';
import { QUESTION_TYPES } from '../js/app/questions.js';
import { FORMAT_IDS, ROUNDING_MODES } from '../js/fp/formats.js';
import { FLAG_NAMES, FCLASS } from '../js/fp/core.js';

const ROOT = new URL('../js/', import.meta.url);

function files(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const p = new URL(name, dir);
        if (statSync(p).isDirectory()) out.push(...files(new URL(`${name}/`, dir)));
        else if (name.endsWith('.js') && !dir.pathname.includes('/i18n/') && !dir.pathname.includes('/help/')) out.push(p);
    }
    return out;
}

test('mesmas chaves em português e inglês', () => {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(pt).sort());
});

test('mesmos parâmetros {x} nas duas línguas', () => {
    const params = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(pt)) assert.deepEqual(params(en[k]), params(pt[k]), k);
});

test('toda chave literal usada no código existe', () => {
    const missing = new Set();
    for (const f of files(ROOT)) {
        const src = readFileSync(f, 'utf8');
        for (const m of src.matchAll(/\b(?:t|tm)\(\s*'([a-zA-Z][\w.+-]*)'/g)) if (!(m[1] in pt)) missing.add(`${m[1]} (${f.pathname.split('/js/')[1]})`);
        // Em fp/trace.js, `key` nomeia o passo (traduzido como st.<passo>), não uma chave de tradução.
        if (!f.pathname.endsWith('/fp/trace.js')) for (const m of src.matchAll(/key: '([a-zA-Z][\w.+-]*)'/g)) if (!(m[1] in pt)) missing.add(`${m[1]} (${f.pathname.split('/js/')[1]})`);
        for (const m of src.matchAll(/\['(exp\.[\w.]+)'/g)) if (!(m[1] in pt)) missing.add(`${m[1]} (${f.pathname.split('/js/')[1]})`);
    }
    assert.deepEqual([...missing], []);
});

test('chaves montadas dinamicamente existem', () => {
    const need = [];
    for (const id of FORMAT_IDS) need.push(`fmt.${id}`);
    for (const m of ROUNDING_MODES) need.push(`mode.${m}`);
    for (const n of FLAG_NAMES) need.push(`flag.${n}`);
    for (const c of FCLASS) need.push(`cls.${c}`);
    for (const v of ['convert', 'ops', 'exp', 'int', 'ex']) need.push(`view.${v}`);
    for (const e of EXPERIMENTS) {
        need.push(`exp.${e.id}.title`, `exp.${e.id}.short`, `exp.${e.id}.desc`);
        for (const p of e.fields) if (p !== 'fmt' && p !== 'mode') need.push(`exp.param.${p}`);
        const r = e.run(e.params);
        need.push(...r.head);
        for (const [k] of r.notes ?? []) need.push(k);
        if (r.chart?.x) need.push(r.chart.x);
        if (r.chart?.y) need.push(r.chart.y);
        for (const [k] of r.chart?.series ?? []) need.push(k);
    }
    for (const q of QUESTION_TYPES) need.push(`q.type.${q}`, `q.ph.${q}`);
    for (const a of ['v1', 'v2', 'booth']) need.push(`int.algo.mul.${a}`, `int.note.mul.${a}`, `q.intmul.${a}`);
    for (const a of ['v1', 'v2', 'nonrestoring']) need.push(`int.algo.div.${a}`, `int.note.div.${a}`);
    for (const o of ['add', 'sub', 'mul', 'div']) need.push(`int.op.${o}`);
    for (const o of ['add', 'sub', 'mul', 'div', 'sqrt', 'fma']) need.push(`op.${o}`);
    for (const r of ['Mp', 'Mc', 'P', 'x', 'Q', 'D', 'R', 'A']) need.push(`ireg.${r}`);
    for (const s of ['nan', 'inf', 'sqrtNeg', 'zero', 'divZero']) need.push(`st.special.${s}`);
    const missing = need.filter((k) => !(k in pt));
    assert.deepEqual(missing, []);
});

test('ajuda: mesmas seções nos dois idiomas e ligações internas válidas', () => {
    assert.deepEqual(helpEn.sections.map((s) => s.id), helpPt.sections.map((s) => s.id));
    const ids = new Set(helpPt.sections.map((s) => s.id));
    for (const h of [helpPt, helpEn])
        for (const s of h.sections)
            for (const m of s.html.matchAll(/href="#h-([\w-]+)"/g)) assert.ok(ids.has(m[1]), `${s.id} → ${m[1]}`);
    // Seções usadas pelo botão de ajuda de cada vista.
    for (const id of ['convert', 'ops', 'experiments', 'integer', 'classroom']) assert.ok(ids.has(id), id);
});

test('sem travessões nem hífens entre palavras nos textos em português', () => {
    const texts = [...Object.values(pt), ...helpPt.sections.flatMap((s) => [s.title, s.html])];
    for (const s of texts) {
        assert.doesNotMatch(s, /[–—]/, s.slice(0, 80));
        const clean = String(s).replace(/RISC-V|https?:\/\/\S+|<[^>]+>|`[^`]*`|<code>[^<]*<\/code>/g, '');
        assert.doesNotMatch(clean, /[A-Za-zÀ-ú]-[A-Za-zÀ-ú]/, s.slice(0, 80));
    }
});
