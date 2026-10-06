/**
 * Experimentos prontos para a aula. Cada um recebe parâmetros (textos, formato, modo) e devolve uma tabela
 * (cabeçalho por chaves de tradução e linhas de células), observações e, quando faz sentido, uma série para
 * o gráfico. Funções puras: a interface traduz e desenha.
 */
import * as core from '../fp/core.js';
import { FORMATS, FORMAT_IDS, getFormat } from '../fp/formats.js';
import { parseNumber, fromText, displayText, ratToSci, ratToNumber, exactValueText } from '../fp/decimal.js';
import { hex } from './analysis.js';
import { rng } from './rng.js';

const abs = (n) => (n < 0n ? -n : n);
const gcd = (a, b) => { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; };

/** Racional com sinal em forma {s: BigInt numerador com sinal, d: BigInt > 0}. */
const R = (sign, N, D) => ({ s: sign ? -N : N, d: D });
const radd = (a, b) => { const s = a.s * b.d + b.s * a.d, d = a.d * b.d, g = gcd(s, d) || 1n; return { s: s / g, d: d / g }; };
const rmul = (a, b) => { const s = a.s * b.s, d = a.d * b.d, g = gcd(s, d) || 1n; return { s: s / g, d: d / g }; };
const fromParsed = (p) => R(p.sign, p.N, p.D);
const ofBits = (f, bits) => { const v = core.decode(f, bits); const r = core.toRational(v); return R(r.sign, r.N, r.D); };

/** Erro relativo |aprox - exato| / |exato| como texto e número. */
function relErr(f, bits, exact) {
    const v = core.decode(f, bits);
    if (!core.isFinite(v)) return { text: '∞', num: Infinity };
    const a = ofBits(f, bits);
    const d = radd(a, { s: -exact.s, d: exact.d });
    if (d.s === 0n) return { text: '0', num: 0 };
    if (exact.s === 0n) return { text: '∞', num: Infinity };
    const N = abs(d.s) * exact.d, D = d.d * abs(exact.s);
    return { text: ratToSci(0, N, D, 3), num: ratToNumber(0, N, D) };
}

const show = (f, bits) => displayText(f.id, bits);
const exactShow = (r) => {
    if (r.d === 1n) return r.s.toString();
    // Decimal finito quando o denominador só tem fatores 2 e 5; senão, fração.
    let d = r.d;
    while (d % 2n === 0n) d /= 2n;
    while (d % 5n === 0n) d /= 5n;
    if (d !== 1n) return `${r.s}/${r.d}`;
    let k = 0, p = 1n;
    while (p % r.d !== 0n) { p *= 10n; k++; }
    const n = abs(r.s) * (p / r.d);
    const str = n.toString().padStart(k + 1, '0');
    return `${r.s < 0n ? '-' : ''}${str.slice(0, -k)}.${str.slice(-k)}`;
};

function parseAll(texts) {
    const ps = texts.map(parseNumber);
    if (ps.some((p) => !p || p.kind !== 'finite')) return null;
    return ps;
}

// ------------------------------------------------------------------------------------------------------------

/** Soma repetida de um valor, comparando a soma ingênua com a soma compensada de Kahan. */
function sumRepeated({ fmt, mode, value, n }) {
    const f = getFormat(fmt);
    const p = parseAll([value]);
    if (!p) return { error: 'value' };
    const N = Math.max(1, Math.min(10000, Number(n) || 10));
    const conv = fromText(fmt, value, mode);
    const x = conv.bits;
    // O exato é k vezes o valor digitado: o erro inclui o da representação de x e o acumulado nas somas.
    const xr = fromParsed(p[0]);
    const zero = core.zero(f, 0);
    let s = zero, ks = zero, c = zero;
    const rows = [], series = { naive: [], kahan: [] };
    const every = Math.max(1, Math.floor(N / 40));
    for (let k = 1; k <= N; k++) {
        s = core.add(f, s, x, mode).bits;
        // Kahan: y = x - c; t = s + y; c = (t - s) - y; s = t
        const y = core.sub(f, x, c, mode).bits;
        const t = core.add(f, ks, y, mode).bits;
        c = core.sub(f, core.sub(f, t, ks, mode).bits, y, mode).bits;
        ks = t;
        const exact = rmul(xr, { s: BigInt(k), d: 1n });
        const e1 = relErr(f, s, exact), e2 = relErr(f, ks, exact);
        series.naive.push([k, e1.num]);
        series.kahan.push([k, e2.num]);
        if (k <= 10 || k % every === 0 || k === N)
            rows.push([k, exactShow(exact), show(f, s), e1.text, show(f, ks), e2.text]);
    }
    const notes = [['exp.sum.stored', { v: value, stored: exactValueText(fmt, x), fmt }]];
    if (conv.flags & core.FLAG.NX) notes.push(['exp.sum.inexact', { v: value }]);
    return {
        head: ['exp.k', 'exp.exactSum', 'exp.naive', 'exp.relErr', 'exp.kahan', 'exp.relErr'],
        rows,
        notes,
        chart: { kind: 'log', x: 'exp.k', y: 'exp.relErr', series: [['exp.naive', series.naive], ['exp.kahan', series.kahan]] },
    };
}

/** (a + b) + c contra a + (b + c). */
function associativity({ fmt, mode, a, b, c }) {
    const f = getFormat(fmt);
    const ps = parseAll([a, b, c]);
    if (!ps) return { error: 'value' };
    const [A, B, C] = [a, b, c].map((t) => fromText(fmt, t, mode).bits);
    const ab = core.add(f, A, B, mode).bits, left = core.add(f, ab, C, mode).bits;
    const bc = core.add(f, B, C, mode).bits, right = core.add(f, A, bc, mode).bits;
    const exact = radd(radd(ofBits(f, A), ofBits(f, B)), ofBits(f, C));
    return {
        head: ['exp.expr', 'exp.partial', 'exp.result', 'exp.relErr'],
        rows: [
            ['(a + b) + c', `a + b = ${show(f, ab)}`, show(f, left), relErr(f, left, exact).text],
            ['a + (b + c)', `b + c = ${show(f, bc)}`, show(f, right), relErr(f, right, exact).text],
            [{ key: 'exp.exact' }, '', exactShow(exact), '0'],
        ],
        notes: [[left === right ? 'exp.assoc.same' : 'exp.assoc.diff', {}]],
    };
}

/** Cancelamento: (1 + x) - 1 para x cada vez menor. */
function cancellation({ fmt, mode, base, steps }) {
    const f = getFormat(fmt);
    const ps = parseAll([base]);
    if (!ps) return { error: 'value' };
    const K = Math.max(1, Math.min(60, Number(steps) || 12));
    const one = fromText(fmt, '1', mode).bits;
    const rows = [], series = [];
    for (let k = 1; k <= K; k++) {
        const t = `${base}e-${k}`;
        const x = fromText(fmt, t, mode).bits;
        const v = core.decode(f, x);
        if (v.cls === 'zero') { rows.push([t, show(f, x), '-', '-', '-']); continue; }
        const s = core.add(f, one, x, mode).bits;
        const d = core.sub(f, s, one, mode).bits;
        const e = relErr(f, d, ofBits(f, x));
        series.push([k, e.num]);
        rows.push([t, show(f, x), show(f, s), show(f, d), e.text]);
    }
    return {
        head: ['exp.x', 'exp.stored', 'exp.onePlus', 'exp.minusOne', 'exp.relErr'],
        rows,
        notes: [['exp.cancel.note', {}]],
        chart: { kind: 'log', x: 'exp.kDigits', y: 'exp.relErr', series: [['exp.minusOne', series]] },
    };
}

/** fmadd (um arredondamento) contra fmul seguida de fadd (dois). */
function fmaVsMulAdd({ fmt, mode, a, b, c }) {
    const f = getFormat(fmt);
    const ps = parseAll([a, b, c]);
    if (!ps) return { error: 'value' };
    const [A, B, C] = [a, b, c].map((t) => fromText(fmt, t, mode).bits);
    const p = core.mul(f, A, B, mode);
    const s = core.add(f, p.bits, C, mode);
    const m = core.fma(f, A, B, C, mode);
    const exact = radd(rmul(ofBits(f, A), ofBits(f, B)), ofBits(f, C));
    const fl = (x) => core.flagList(x).join(' ') || '-';
    return {
        head: ['exp.expr', 'exp.partial', 'exp.result', 'exp.relErr', 'exp.flags'],
        rows: [
            ['fmul + fadd', `a × b = ${show(f, p.bits)}`, show(f, s.bits), relErr(f, s.bits, exact).text, fl(p.flags | s.flags)],
            ['fmadd', `a × b = ${exactShow(rmul(ofBits(f, A), ofBits(f, B)))}`, show(f, m.bits), relErr(f, m.bits, exact).text, fl(m.flags)],
            [{ key: 'exp.exact' }, '', exactShow(exact), '0', ''],
        ],
        notes: [[s.bits === m.bits ? 'exp.fma.same' : 'exp.fma.diff', {}]],
    };
}

/** Contagem que para de crescer: s = s + passo até s + passo = s, em cada formato. */
function stagnation({ mode, step }) {
    const ps = parseAll([step]);
    if (!ps) return { error: 'value' };
    const LIMIT = 100000;
    const rows = FORMAT_IDS.map((id) => {
        const f = FORMATS[id];
        const inc = fromText(id, step, mode).bits;
        let s = core.zero(f, 0), k = 0;
        for (; k < LIMIT; k++) {
            const t = core.add(f, s, inc, mode).bits;
            if (t === s) break;
            s = t;
            if (!core.isFinite(core.decode(f, s))) break;
        }
        const big = 1n << BigInt(f.p);
        const exact = core.fromInteger(f, big + 1n, 'rne');
        const stopped = k < LIMIT;
        return [id, f.p, stopped ? show(f, s) : { key: 'exp.notStopped', params: { n: LIMIT } }, stopped ? k : '-', `2^${f.p} = ${big}`, (exact.flags & core.FLAG.NX) ? { key: 'exp.notExact' } : { key: 'exp.exactYes' }];
    });
    return {
        head: ['exp.format', 'exp.precision', 'exp.stopValue', 'exp.iterations', 'exp.maxInt', 'exp.maxIntPlusOne'],
        rows,
        notes: [['exp.stag.note', {}]],
    };
}

/**
 * Arredondamento estocástico: a mesma soma repetida no modo escolhido e no estocástico (SR), este repetido
 * com sementes diferentes. Com RNE a soma para quando o valor somado fica abaixo de meio ULP; com SR cada
 * soma sobe com probabilidade igual à fração descartada e a soma segue crescendo, certa em média.
 */
function stochastic({ fmt, mode, value, n, runs, seed }) {
    const f = getFormat(fmt);
    const p = parseAll([value]);
    if (!p) return { error: 'value' };
    const N = Math.max(1, Math.min(5000, Number(n) || 1000));
    const M = Math.max(1, Math.min(50, Number(runs) || 10));
    const x = fromText(fmt, value, mode).bits;
    const xr = ofBits(f, x); // o valor armazenado: aqui interessa só o erro das somas
    const zero = core.zero(f, 0);
    const rand = rng(Number(seed) || 1);
    const num = (r) => ratToNumber(r.s < 0n ? 1 : 0, abs(r.s), r.d);
    const val = (b) => num(ofBits(f, b));
    let s = zero, stall = null;
    const sr = new Array(M).fill(zero);
    const every = Math.max(1, Math.floor(N / 25));
    const rows = [], series = { exact: [], det: [], mean: [] };
    for (let k = 1; k <= N; k++) {
        const s2 = core.add(f, s, x, mode).bits;
        if (s2 === s && stall === null) stall = k;
        s = s2;
        for (let j = 0; j < M; j++) sr[j] = core.add(f, sr[j], x, core.STOCHASTIC, { u: rand() }).bits;
        const exact = rmul(xr, { s: BigInt(k), d: 1n });
        // Média exata das execuções: soma dos racionais dividida por M.
        let mean = { s: 0n, d: 1n };
        for (const b of sr) mean = radd(mean, ofBits(f, b));
        mean = rmul(mean, { s: 1n, d: BigInt(M) });
        series.exact.push([k, num(exact)]);
        series.det.push([k, val(s)]);
        series.mean.push([k, num(mean)]);
        if (k % every === 0 || k === N) {
            const d = radd(mean, { s: -exact.s, d: exact.d });
            const errMean = d.s === 0n ? '0' : exact.s === 0n ? '∞' : ratToSci(0, abs(d.s) * exact.d, d.d * abs(exact.s), 3);
            const vals = sr.map(val);
            rows.push([k, exactShow(exact), show(f, s), relErr(f, s, exact).text, show(f, sr[0]), String(Number(num(mean).toPrecision(6))), errMean,
                `${Math.min(...vals)} … ${Math.max(...vals)}`]);
        }
    }
    const notes = [];
    if (stall !== null) notes.push(['exp.stoch.stall', { k: stall, s: show(f, s), mode: mode.toUpperCase() }]);
    notes.push(['exp.stoch.unbiased', { m: M }]);
    return {
        head: ['exp.k', 'exp.exactSum', 'exp.stoch.det', 'exp.relErr', 'exp.stoch.one', 'exp.stoch.mean', 'exp.relErr', 'exp.stoch.range'],
        rows,
        notes,
        chart: { kind: 'log', x: 'exp.k', y: 'exp.stoch.sum', sub: 'exp.stoch.chartSub', envelope: 'exp.stoch.envelope', series: [['exp.exactSum', series.exact], ['exp.stoch.det', series.det], ['exp.stoch.mean', series.mean]] },
    };
}

/** A mesma conta (soma harmônica) em todos os formatos, com o erro de cada um. */
function precisionCompare({ mode, n }) {
    const N = Math.max(1, Math.min(5000, Number(n) || 100));
    let exact = { s: 0n, d: 1n };
    for (let k = 1; k <= N; k++) exact = radd(exact, { s: 1n, d: BigInt(k) });
    const rows = [], bars = [];
    for (const id of FORMAT_IDS) {
        const f = FORMATS[id];
        let s = core.zero(f, 0), stall = null;
        const one = fromText(id, '1', mode).bits;
        for (let k = 1; k <= N; k++) {
            const t = core.div(f, one, core.fromInteger(f, BigInt(k), mode).bits, mode).bits;
            const s2 = core.add(f, s, t, mode).bits;
            if (s2 === s && stall === null) stall = k;
            s = s2;
        }
        const e = relErr(f, s, exact);
        rows.push([id, f.bits, f.p, show(f, s), e.text, stall ?? '-']);
        bars.push([id, e.num]);
    }
    return {
        head: ['exp.format', 'exp.bits', 'exp.precision', 'exp.result', 'exp.relErr', 'exp.stall'],
        rows,
        notes: [['exp.harm.exact', { n: N, v: ratToSci(0, exact.s, exact.d, 10) }], ['exp.harm.note', {}]],
        chart: { kind: 'bars', y: 'exp.relErr', bars },
    };
}

/** Espaçamento entre vizinhos (ULP) ao longo das potências de 10. */
function spacing({ fmt }) {
    const f = getFormat(fmt);
    const rows = [];
    for (let k = -8; k <= 12; k++) {
        const t = `1e${k}`;
        const r = fromText(fmt, t, 'rne');
        const v = core.decode(f, r.bits);
        if (!core.isFinite(v) || v.cls === 'zero') continue;
        const u = core.ulp(f, r.bits);
        const val = core.toRational(v);
        rows.push([t, show(f, r.bits), hex(fmt, r.bits), ratToSci(0, u.N, u.D, 4), ratToSci(0, u.N * val.D, u.D * val.N, 3)]);
    }
    return {
        head: ['exp.value', 'exp.stored', 'exp.bitsHex', 'exp.ulp', 'exp.ulpRel'],
        rows,
        notes: [['exp.spacing.note', { p: f.p }]],
    };
}

export const EXPERIMENTS = [
    { id: 'sum', run: sumRepeated, params: { fmt: 'single', mode: 'rne', value: '0.1', n: '1000' }, fields: ['fmt', 'mode', 'value', 'n'] },
    { id: 'assoc', run: associativity, params: { fmt: 'single', mode: 'rne', a: '1e8', b: '-1e8', c: '1.5' }, fields: ['fmt', 'mode', 'a', 'b', 'c'] },
    { id: 'cancel', run: cancellation, params: { fmt: 'single', mode: 'rne', base: '1.2345678', steps: '10' }, fields: ['fmt', 'mode', 'base', 'steps'] },
    { id: 'fma', run: fmaVsMulAdd, params: { fmt: 'single', mode: 'rne', a: '1.000244140625', b: '1.000244140625', c: '-1.00048828125' }, fields: ['fmt', 'mode', 'a', 'b', 'c'] },
    { id: 'stag', run: stagnation, params: { mode: 'rne', step: '1' }, fields: ['mode', 'step'] },
    { id: 'stoch', run: stochastic, params: { fmt: 'bf16', mode: 'rne', value: '1', n: '1000', runs: '10', seed: '1' }, fields: ['fmt', 'mode', 'value', 'n', 'runs', 'seed'] },
    { id: 'precision', run: precisionCompare, params: { mode: 'rne', n: '200' }, fields: ['mode', 'n'] },
    { id: 'spacing', run: spacing, params: { fmt: 'half' }, fields: ['fmt'] },
];

export const experimentById = (id) => EXPERIMENTS.find((e) => e.id === id) ?? EXPERIMENTS[0];
