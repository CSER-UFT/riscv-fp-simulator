/**
 * Exportação em LaTeX: tabelas no padrão do curso (cabeçalho com fundo tabAzul e texto branco, \hline,
 * sem booktabs). Requerem \usepackage[table]{xcolor}; as tabelas largas usam \resizebox (graphicx).
 */
import { t } from '../i18n/index.js';
import { getFormat } from '../fp/formats.js';
import { flagList } from '../fp/core.js';
import { stepText, specialText, regLabel, intStepText } from './text.js';

export const tex = (s) => String(s ?? '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([#$%&_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/−/g, '$-$').replace(/×/g, '$\\times$').replace(/÷/g, '$\\div$')
    .replace(/≥/g, '$\\geq$').replace(/≤/g, '$\\leq$').replace(/⇒/g, '$\\Rightarrow$').replace(/∞/g, '$\\infty$')
    .replace(/Σ/g, '$\\Sigma$').replace(/→/g, '$\\rightarrow$').replace(/·/g, '$\\cdot$')
    .replace(/⊕/g, '$\\oplus$').replace(/√/g, '$\\surd$').replace(/≈/g, '$\\approx$').replace(/…/g, '\\ldots{}')
    .replace(/[₀-₉]/g, (c) => `$_{${c.charCodeAt(0) - 0x2080}}$`).replace(/₋/g, '$_{-}$')
    .replace(/[⁰¹²³⁴-⁹]/g, (c) => `$^{${'⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)}}$`).replace(/⁻/g, '$^{-}$');

/** Texto com marcações (**negrito**, `código`) para LaTeX. */
export const texMd = (s) => tex(s)
    .replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}')
    .replace(/`([^`]+)`/g, '\\texttt{$1}');

const cellTex = (c) => (c && typeof c === 'object' && 'key' in c ? texMd(t(c.key, c.params ?? {})) : tex(c));

const PREAMBLE = (title) => [`% ${tex(title)}`, `% ${t('tex.requires')}`, '\\providecolor{tabAzul}{HTML}{1F4E79}', ''];

function header(cells) {
    return `\\rowcolor{tabAzul}${cells.map((c) => `\\color{white}\\textbf{${c}}`).join(' & ')} \\\\ \\hline`;
}

/** Tabela genérica: cabeçalho e linhas já em LaTeX. */
export function table(head, rows, caption, { cols = null, resize = false } = {}) {
    const spec = cols ?? `|${'l|'.repeat(head.length)}`;
    const out = ['\\begin{table}[htbp]', '\\centering'];
    if (resize) out.push('\\resizebox{\\textwidth}{!}{%');
    out.push(`\\begin{tabular}{${spec}}`, '\\hline', header(head));
    for (const r of rows) out.push(`${r.join(' & ')} \\\\ \\hline`);
    out.push(resize ? '\\end{tabular}}' : '\\end{tabular}', `\\caption{${caption}}`, '\\end{table}', '');
    return out;
}

const flagsTex = (mask) => tex(flagList(mask).join(' ') || '-');
const tt = (s) => `\\texttt{${tex(s)}}`;

/** Bits com fundo por campo (sinal, expoente, fração), uma célula por bit. */
function bitsTable(fmtId, bits, caption) {
    const f = getFormat(fmtId);
    const b = BigInt(bits).toString(2).padStart(f.bits, '0');
    const colors = ['\\providecolor{fpSinal}{HTML}{C9DDF6}', '\\providecolor{fpExp}{HTML}{CFEFD9}', '\\providecolor{fpFrac}{HTML}{FAD9CC}'];
    const cells = [...b].map((ch, i) => `\\cellcolor{${i === 0 ? 'fpSinal' : i <= f.expBits ? 'fpExp' : 'fpFrac'}}${ch}`);
    const idx = [...b].map((_, i) => `{\\tiny ${f.bits - 1 - i}}`);
    return [...colors, '\\begin{table}[htbp]', '\\centering', '\\setlength{\\tabcolsep}{2pt}', '\\resizebox{\\textwidth}{!}{%',
        `\\begin{tabular}{|${'c|'.repeat(f.bits)}}`, '\\hline', `${idx.join(' & ')} \\\\ \\hline`, `${cells.join(' & ')} \\\\ \\hline`,
        '\\end{tabular}}', `\\caption{${caption}}`, '\\end{table}', ''];
}

/** Conversão: bits, campos, os cinco modos e todos os formatos. */
export function conversionLatex(a) {
    const fmt = t(`fmt.${a.fmt.id}`);
    const out = [...PREAMBLE(t('tex.convTitle', { v: a.text, fmt }))];
    out.push(...bitsTable(a.fmt.id, a.bits, tex(t('tex.bitsCaption', { v: a.text, fmt, hex: a.hex, mode: a.mode.toUpperCase() }))));
    const fl = a.fields;
    out.push(...table([tex(t('ui.field')), tex(t('ui.content'))], [
        [tex(t('ui.sign')), String(fl.sign)],
        [tex(t('ui.exponent')), `${tt(fl.expBits)} = ${fl.expField}`],
        [tex(t('ui.bias')), String(fl.bias)],
        [tex(t('ui.realExp')), fl.exp === null ? '-' : String(fl.exp)],
        [tex(t('ui.fraction')), tt(fl.fracBits)],
        [tex(t('ui.storedValue')), tex(a.exactText)],
        [tex(t('ui.relErr')), a.err ? tex(a.err.rel) : '-'],
        [tex(t('ui.flags')), flagsTex(a.flags)],
    ], tex(t('tex.fieldsCaption', { v: a.text, fmt }))));
    out.push(...table([tex(t('ui.mode')), tex(t('ui.bits')), tex(t('ui.value')), tex(t('ui.relErr')), tex(t('ui.flags'))],
        a.modes.map((m) => [`${m.mode.toUpperCase()}`, tt(m.hex), tex(m.short), m.err ? tex(m.err.rel) : '-', flagsTex(m.flags)]),
        tex(t('tex.modesCaption', { v: a.text, fmt }))));
    out.push(...table([tex(t('ui.format')), tex(t('ui.bits')), tex(t('ui.value')), tex(t('ui.relErr')), tex(t('ui.flags'))],
        a.formats.map((m) => [tex(t(`fmt.${m.fmt}`)), tt(m.hex), tex(m.short), m.err ? tex(m.err.rel) : '-', flagsTex(m.flags)]),
        tex(t('tex.formatsCaption', { v: a.text, mode: a.mode.toUpperCase() }))));
    return out.join('\n');
}

/** Operação: operandos, passos do hardware e os cinco modos. */
export function operationLatex(o) {
    const fmt = t(`fmt.${o.fmt.id}`);
    const opName = t(`op.${o.op}`);
    const out = [...PREAMBLE(t('tex.opTitle', { op: opName, fmt }))];
    out.push(...table([tex(t('ui.operand')), tex(t('ui.typed')), tex(t('ui.bits')), tex(t('ui.storedValue'))],
        o.ops.map((x, i) => ['abc'[i], tex(x.text), tt(x.hex), tex(x.exactText)]), tex(t('tex.operandsCaption', { fmt }))));
    const tr = o.trace;
    if (tr.special) out.push(`% ${texMd(specialText(tr))}`, '');
    else {
        const rows = [];
        tr.steps.forEach((s, i) => {
            // Registros longos (produto de double) quebram a cada 8 bits para caber na coluna.
            const regs = (s.regs ?? []).map((r) => `${tex(regLabel(r))}: \\texttt{${tex(regBits(r)).replace(/([01.]{8})(?=[01.])/g, '$1\\allowbreak{}')}}`).join(' \\newline ');
            rows.push([String(i + 1), texMd(stepText(s, tr)), regs]);
        });
        out.push(...table(['\\#', tex(t('ui.step')), tex(t('ui.registers'))], rows, tex(t('tex.stepsCaption', { op: opName, fmt, mode: o.mode.toUpperCase() })), { cols: '|c|p{0.5\\textwidth}|p{0.38\\textwidth}|' }));
    }
    out.push(...table([tex(t('ui.mode')), tex(t('ui.bits')), tex(t('ui.value')), tex(t('ui.relErr')), tex(t('ui.flags'))],
        o.modes.map((m) => [m.mode.toUpperCase(), tt(m.hex), tex(m.short), m.err ? tex(m.err.rel) : '-', flagsTex(m.flags)]),
        tex(t('tex.opModesCaption', { op: opName, fmt }))));
    return out.join('\n');
}

/** Bits de um registro do traço: inteiro.fração|GRS. */
export function regBits(r) {
    const total = r.int + r.w;
    let s = BigInt(r.v).toString(2);
    if (s.length < total) s = s.padStart(total, '0');
    const intLen = s.length - r.w;
    const frac = s.slice(intLen);
    const main = frac.slice(0, frac.length - r.extra);
    const extra = frac.slice(frac.length - r.extra);
    return `${s.slice(0, intLen) || '0'}.${main}${r.extra ? ` ${extra}` : ''}`;
}

/** Algoritmo inteiro: tabela de passos no formato do livro. */
export function integerLatex(res, title) {
    const out = [...PREAMBLE(title)];
    if (res.kind === 'add') {
        const r = res.r;
        const bin = (v, n) => BigInt(v).toString(2).padStart(n, '0');
        const carries = [...r.carries].reverse().map(String).join('');
        out.push(...table(['', tex(t('ui.binary')), tex(t('ui.decimal'))], [
            [tex(t('int.carries')), tt(carries), ''],
            ['A', tt(bin(r.A, r.n)), res.showA],
            [r.subtract ? tex(t('int.notB')) : 'B', tt(bin(r.Be, r.n)), r.subtract ? tex(t('int.plusOne')) : res.showB],
            [tex(t('int.result')), tt(bin(r.sum, r.n)), res.showSum],
        ], tex(title)));
        return out.join('\n');
    }
    const names = res.regs.map(([n]) => n);
    const widths = Object.fromEntries(res.regs);
    const rows = res.rows.map((row) => [String(row.iter), texMd(intStepText(row, res)), ...names.map((n) => tt(BigInt(row.regs[n] ?? 0n).toString(2).padStart(widths[n], '0')))]);
    out.push(...table([tex(t('int.iter')), tex(t('ui.step')), ...names.map((n) => tex(t(`ireg.${n}`)))], rows, tex(title),
        { cols: `|c|p{0.36\\textwidth}|${'l|'.repeat(names.length)}`, resize: true }));
    return out.join('\n');
}

/** Experimento: a tabela de resultados. */
export function experimentLatex(title, result) {
    const out = [...PREAMBLE(title)];
    out.push(...table(result.head.map((h) => tex(t(h))), result.rows.map((r) => r.map(cellTex)), tex(title), { resize: result.head.length > 5 }));
    for (const [key, params] of result.notes ?? []) out.push(`% ${texMd(t(key, params)).replace(/\n/g, ' ')}`);
    return out.join('\n') + '\n';
}

/** Lista de exercícios (com ou sem as respostas). */
export function questionsLatex(qs, withAnswers) {
    const out = [...PREAMBLE(t('tex.exTitle'))];
    out.push('\\begin{enumerate}');
    for (const q of qs) {
        const text = texMd(t(q.text.key, { ...q.text.params, fmt: t(`fmt.${q.text.params.fmt ?? 'single'}`), mode: (q.text.params.mode ?? '').toUpperCase() }));
        out.push(`  \\item ${text}${withAnswers ? ` \\\\ \\textbf{${tex(t('ex.answer'))}:} \\texttt{${tex(q.answer)}}` : ' \\hfill \\underline{\\hspace{4cm}}'}`);
    }
    out.push('\\end{enumerate}', '');
    return out.join('\n');
}
