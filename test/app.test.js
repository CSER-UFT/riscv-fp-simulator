/**
 * Camada da interface sem DOM: análises, experimentos, exercícios e exportação em LaTeX, em muitos casos,
 * nos dois idiomas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeConversion, analyzeOperation, FORMAT_IDS, ROUNDING_MODES } from '../js/app/analysis.js';
import { EXPERIMENTS } from '../js/app/experiments.js';
import { generate, QUESTION_TYPES } from '../js/app/questions.js';
import { conversionLatex, operationLatex, experimentLatex, questionsLatex, integerLatex, fixedLatex } from '../js/app/latex.js';
import { analyzeFixed } from '../js/app/fixed.js';
import { stepText, intStepText, modeReason, droppedSummary, fixedStepText } from '../js/app/text.js';
import { compute } from '../js/ui/integer.js';
import { setLanguage } from '../js/i18n/index.js';
import * as core from '../js/fp/core.js';

/** Chaves balanceadas e nenhum caractere fora do que o pdflatex aceita com inputenc utf8 e T1. */
function latexOk(s, label) {
    let depth = 0;
    for (const ch of s.replace(/\\[{}]/g, '')) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
        assert.ok(depth >= 0, `${label}: chave fechada sem abrir`);
    }
    assert.equal(depth, 0, `${label}: chaves desbalanceadas`);
    assert.doesNotMatch(s, /undefined|NaN(?!\b)|\[object/, label);
    // Caracteres que o T1/utf8 não define (setas, índices e símbolos matemáticos fora do modo matemático).
    assert.doesNotMatch(s, /[₀-₉₋⁰-⁹⁻⇒→≥≤×÷∞√⊕≈Σ−]/, `${label}: unicode sem tradução para LaTeX`);
    if (s.includes('\\begin{tabular}')) assert.match(s, /\\rowcolor\{tabAzul\}/);
    assert.doesNotMatch(s, /booktabs|toprule|midrule/);
}

const VALUES = ['0.1', '1/3', '-12.375', '16777217', '1e39', '-1e39', '1e-45', '2^-149', '2^-1074', '0x1.8p3', '448', '480', '-0', '0', 'inf', '-inf', 'nan', '65504', '65520', '57344', '3.4e38', '1e-400', '-1e400', '0.0001'];

for (const lang of ['pt', 'en']) {
    test(`conversões e operações em todos os formatos e modos (${lang})`, () => {
        setLanguage(lang);
        for (const id of FORMAT_IDS) {
            for (const v of VALUES) {
                for (const mode of ROUNDING_MODES) {
                    for (const sat of [false, true]) {
                        const a = analyzeConversion(id, v, mode, { sat });
                        assert.ok(a, `${id} ${v}`);
                        assert.equal(a.modes.length, 5);
                        if (a.neighbors) for (const n of [a.neighbors.x, ...a.neighbors.points.map((p) => p.pos)]) assert.ok(Number.isFinite(n), `${id} ${v} ${mode}: posição`);
                    }
                }
                latexOk(conversionLatex(analyzeConversion(id, v, 'rne')), `${id} ${v}`);
            }
            for (const op of ['add', 'sub', 'mul', 'div', 'sqrt', 'fma']) {
                for (const [a, b, c] of [['0.1', '0.2', '0.3'], ['1', '2^-30', '-1'], ['inf', '-inf', '1'], ['-0', '0', '-0'], ['1e30', '1e30', '-1e38'], ['2^-140', '3', '2^-149'], ['nan', '1', '1'], ['-4', '0', '2']]) {
                    const o = analyzeOperation(op, id, [a, b, c], 'rmm');
                    assert.ok(!o.error, `${id} ${op}`);
                    for (const s of o.trace.steps) assert.doesNotMatch(stepText(s, o.trace), /\{\w+\}|undefined|NaN(?!\b)/, `${id} ${op} ${s.key}`);
                    latexOk(operationLatex(o), `${id} ${op} ${a} ${b}`);
                }
            }
        }
        setLanguage('pt');
    });
}

test('aritmética inteira: textos e LaTeX de todos os algoritmos', () => {
    for (const lang of ['pt', 'en']) {
        setLanguage(lang);
        for (const [op, algos] of [['add', ['add']], ['sub', ['sub']], ['mul', ['v1', 'v2', 'booth']], ['div', ['v1', 'v2', 'nonrestoring']]]) {
            for (const algo of algos) {
                for (const [a, b] of [['2', '3'], ['-7', '2'], ['127', '-128'], ['0', '0'], ['-128', '-1']]) {
                    for (const signed of [false, true]) {
                        const res = compute({ op, algo, n: 8, a, b, signed });
                        if (res.error) continue;
                        for (const row of res.rows ?? []) assert.doesNotMatch(intStepText(row, res), /\{\w+\}|undefined/, `${op} ${algo} ${row.step}`);
                        latexOk(integerLatex(res, 'teste'), `${op} ${algo} ${a} ${b}`);
                    }
                }
            }
        }
    }
    setLanguage('pt');
});

test('experimentos com parâmetros padrão e em todos os formatos', () => {
    for (const e of EXPERIMENTS) {
        const fmts = e.fields.includes('fmt') ? FORMAT_IDS : [null];
        for (const fmt of fmts) {
            const p = { ...e.params, ...(fmt ? { fmt } : {}) };
            if (p.n) p.n = '60';
            const r = e.run(p);
            assert.ok(!r.error, `${e.id} ${fmt}`);
            assert.ok(r.rows.length > 0, `${e.id} ${fmt}`);
            for (const row of r.rows) assert.equal(row.length, r.head.length, `${e.id}: colunas`);
            latexOk(experimentLatex(e.id, r), e.id);
        }
        assert.equal(e.run({ ...e.params, value: 'x', a: 'x', base: 'x', step: 'x' }).error ?? (e.fields.some((f) => ['value', 'a', 'base', 'step'].includes(f)) ? 'faltou' : 'value'), 'value');
    }
});

test('exercícios: a resposta canônica é aceita, respostas erradas não, e a semente reproduz a lista', () => {
    for (let seed = 1; seed <= 60; seed++) {
        const qs = generate({ seed, count: 14 });
        assert.equal(qs.length, 14);
        for (const q of qs) {
            assert.ok(q.check(q.answer), `semente ${seed} ${q.type}: ${q.answer}`);
            assert.ok(!q.check('0x12345 lixo'), `semente ${seed} ${q.type}: aceitou lixo`);
        }
        assert.deepEqual(generate({ seed, count: 14 }).map((q) => q.answer), qs.map((q) => q.answer));
        latexOk(questionsLatex(qs, true), `exercícios ${seed}`);
    }
    // Formas equivalentes.
    const enc = generate({ seed: 5, count: 1, types: ['encode'], formats: ['single'], modes: ['rne'] })[0];
    assert.ok(enc.check(enc.answer.toLowerCase().replace('0x', '')));
    const fl = generate({ seed: 8, count: 1, types: ['flags'], formats: ['e4m3'], modes: ['rne'] })[0];
    assert.ok(fl.check(fl.answer.split(' ').reverse().join(', ')));
    for (const ty of QUESTION_TYPES) assert.ok(generate({ seed: 2, count: 3, types: [ty] }).every((q) => q.type === ty));
});

test('explicação dos modos: empate, negativos, estouro, exato e textos sem lacunas', () => {
    setLanguage('pt');
    const ex = (f, v) => analyzeConversion(f, v, 'rne').explain;
    const tie = ex('single', '16777217');
    assert.equal(tie.half, true);
    assert.deepEqual([tie.G, tie.R, tie.S], [1, 0, 0]);
    assert.equal(tie.lo.lsb, 0);
    assert.match(modeReason(tie, 'rne'), /par/);
    assert.deepEqual(tie.modes.map((m) => m.side), ['lo', 'lo', 'lo', 'hi', 'hi']);
    const neg = ex('single', '-0.1');
    assert.deepEqual(neg.modes.map((m) => m.side), ['hi', 'lo', 'hi', 'lo', 'hi']);
    assert.equal(neg.dLo, '0.8');
    const over = ex('single', '1e39');
    assert.equal(over.overflow, true);
    assert.match(droppedSummary(over), /fora da grade/);
    assert.match(modeReason(ex('e4m3', '470'), 'rne'), /estouro/);
    assert.equal(ex('single', '0.5').exact, true);
    const sub = ex('single', '1e-46');
    assert.equal(sub.subnormal, true);
    assert.equal(sub.kept, '0'.repeat(24));
    // Os bits mantidos são o truncamento: igual ao significando do vizinho lo.
    for (const id of FORMAT_IDS)
        for (const v of VALUES) {
            const a = analyzeConversion(id, v, 'rne');
            if (!a?.explain) continue;
            for (const lang of ['pt', 'en']) {
                setLanguage(lang);
                for (const m of ROUNDING_MODES) assert.doesNotMatch(modeReason(a.explain, m), /\{\w+\}|undefined|NaN ULP/, `${id} ${v} ${m}`);
                assert.doesNotMatch(droppedSummary(a.explain), /\{\w+\}|undefined/, `${id} ${v}`);
            }
            setLanguage('pt');
            const e = a.explain;
            if (!e.exact && e.r < 1) {
                const lo = BigInt(`0b${e.kept}`);
                const d = core.decode(id, e.lo.bits);
                assert.equal(d.sig, lo, `${id} ${v}: bits mantidos = lo`);
            }
        }
});

test('ponto fixo: análise, textos dos passos e LaTeX', () => {
    for (const lang of ['pt', 'en']) {
        setLanguage(lang);
        for (const [m, n, signed] of [[3, 4, true], [0, 15, true], [7, 8, true], [8, 8, false], [15, 16, true], [31, 32, true], [2, 3, true]]) {
            for (const op of ['conv', 'add', 'sub', 'mul', 'div']) {
                for (const [a, b] of [['0.1', '2.25'], ['6', '3'], ['-1', '0'], ['1/3', '-0.7'], ['0', '0'], ['1e9', '1e-9']]) {
                    for (const overflow of ['sat', 'wrap']) {
                        const r = analyzeFixed({ m, n, signed, op, a, b, overflow, mode: 'rne' });
                        assert.ok(!r.error, `${m}.${n} ${op} ${a} ${b}`);
                        for (const s of r.result?.steps ?? []) assert.doesNotMatch(fixedStepText(s, r.fx), /\{\w+\}|undefined|NaN/, `${s.key}`);
                        latexOk(fixedLatex(r), `fixo ${m}.${n} ${op} ${a} ${b}`);
                    }
                }
            }
        }
    }
    setLanguage('pt');
    assert.equal(analyzeFixed({ m: 3, n: 4, signed: true, op: 'conv', a: 'x', mode: 'rne', overflow: 'sat' }).error, 'operand');
    assert.equal(analyzeFixed({ m: 40, n: 40, signed: true, op: 'conv', a: '1', mode: 'rne', overflow: 'sat' }).error, 'format');
    const r = analyzeFixed({ m: 7, n: 8, signed: true, op: 'mul', a: '1.5', b: '0.1', mode: 'rne', overflow: 'sat' });
    assert.equal(r.result.value, '0.15234375');
    assert.equal(r.floats.map((f) => f.fmt).join(), 'half,bf16');
});
