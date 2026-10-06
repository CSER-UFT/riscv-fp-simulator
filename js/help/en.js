/**
 * Simulator help, in English. Each section becomes an entry in the table of contents.
 */
export default {
    title: 'RISC-V Floating Point Simulator',
    lead: 'Teaching simulator for computer arithmetic: conversion to floating point in the IEEE 754 formats and in the reduced formats of machine learning, operations with the hardware steps, the five RISC-V rounding modes and the integer arithmetic algorithms. Developed for the <strong>Computer Science</strong> program at the <strong>Federal University of Tocantins</strong> (Brazil).',
    searchPlaceholder: 'Search the help',
    noResults: 'No section contains that term.',
    tocTitle: 'Contents',
    close: 'Close help',
    sections: [
        {
            id: 'start',
            title: 'Getting started',
            html: `
<p>The simulator has five views, in the tabs at the top:</p>
<dl>
    <dt>Conversion</dt><dd>Type a number and see how it is stored in a format: the bits, the fields, the exact stored value, the error, the neighbors on the number line and the result in the five rounding modes and in every format.</dd>
    <dt>Operations</dt><dd>Addition, subtraction, multiplication, division, square root and fmadd, with the hardware steps: alignment, guard, round and sticky bits, normalization and rounding.</dd>
    <dt>Experiments</dt><dd>Classic classroom situations: accumulated error, Kahan summation, associativity, cancellation, fmadd, counting that stops, precision comparison and spacing between neighbors.</dd>
    <dt>Integer arithmetic</dt><dd>Two's complement addition and subtraction, multiplication (first version, refined and Booth) and division (restoring and nonrestoring), with the step table of the book.</dd>
    <dt>Exercises</dt><dd>Random lists with automatic grading and LaTeX export.</dd>
</dl>
<p>Everything is recomputed as you type. The state of each view is kept in the browser; <strong>Copy link</strong> creates an address that opens the current view with the same values, and <strong>Export</strong> produces the tables in LaTeX.</p>
<p class="tip">To start: in Conversion, type <code>0.1</code> and look at the error and the number line; switch the format to half and then to FP8 E4M3. Then, in Operations, use the <em>0.1 + 0.2</em> example.</p>`,
        },
        {
            id: 'representation',
            title: 'How a number is stored',
            html: `
<p>A binary floating point number has three fields: the <strong>sign</strong> s (1 bit), the <strong>exponent</strong> E (biased) and the <strong>fraction</strong> F. For normal numbers, the value is</p>
<pre><code>(−1)^s × 1.F × 2^(E − bias)</code></pre>
<p>The 1 before the point is not stored: it is the <strong>implicit bit</strong>. That is why the <strong>precision</strong> p is the number of fraction bits plus 1 (24 in single). The biased exponent keeps positive numbers ordered like integers: comparing two positive floats is comparing their bits.</p>
<table>
    <tr><th>Exponent</th><th>Fraction</th><th>Meaning</th></tr>
    <tr><td>all zeros</td><td>0</td><td>zero (+0 or −0)</td></tr>
    <tr><td>all zeros</td><td>nonzero</td><td>subnormal: 0.F × 2^(1 − bias), without the implicit bit</td></tr>
    <tr><td>in between</td><td>any</td><td>normal</td></tr>
    <tr><td>all ones</td><td>0</td><td>infinity</td></tr>
    <tr><td>all ones</td><td>nonzero</td><td>NaN (quiet if the top fraction bit is 1, signaling if it is 0)</td></tr>
</table>
<p><strong>Subnormals</strong> fill the gap between zero and the smallest normal with the same spacing as the first interval of normals (<em>gradual underflow</em>): they lose precision, but guarantee that x − y = 0 only when x = y.</p>
<p>In the Conversion view, the bits are colored by field and can be clicked to flip; the hexadecimal field accepts a typed pattern. The fields table shows the biased and unbiased exponent, the significand and the formula with the values.</p>`,
        },
        {
            id: 'formats',
            title: 'The formats',
            html: `
<table>
    <tr><th>Format</th><th>Bits</th><th>Exponent</th><th>Fraction</th><th>Bias</th><th>Largest finite</th><th>Smallest normal</th></tr>
    <tr><td>double (binary64)</td><td>64</td><td>11</td><td>52</td><td>1023</td><td>≈ 1.8 × 10^308</td><td>2^−1022</td></tr>
    <tr><td>single (binary32)</td><td>32</td><td>8</td><td>23</td><td>127</td><td>≈ 3.4 × 10^38</td><td>2^−126</td></tr>
    <tr><td>half (binary16)</td><td>16</td><td>5</td><td>10</td><td>15</td><td>65504</td><td>2^−14</td></tr>
    <tr><td>bfloat16</td><td>16</td><td>8</td><td>7</td><td>127</td><td>≈ 3.4 × 10^38</td><td>2^−126</td></tr>
    <tr><td>FP8 E5M2</td><td>8</td><td>5</td><td>2</td><td>15</td><td>57344</td><td>2^−14</td></tr>
    <tr><td>FP8 E4M3</td><td>8</td><td>4</td><td>3</td><td>7</td><td>448</td><td>2^−6</td></tr>
</table>
<p><strong>half</strong>, <strong>single</strong> and <strong>double</strong> are the IEEE 754 binary formats. <strong>bfloat16</strong> is the upper half of a single: it has the same range (8 exponent bits) and only 8 bits of precision, and it is used to train neural networks because converting from single just drops bits. The 8 bit formats follow the <strong>OCP</strong> (Open Compute Project) specification used in machine learning accelerators: <strong>E5M2</strong> behaves like a shortened half (it has infinity and NaN); <strong>E4M3</strong> has no infinity, uses exponent 1111 for normal numbers and reserves only the pattern S.1111.111 for NaN, which brings the largest finite up to 448.</p>
<p>In 8 bit formats, the <strong>Saturate</strong> option makes an overflow give the largest finite instead of infinity or NaN, like the <em>satfinite</em> mode of the OCP specification.</p>
<p>Comparing the same number in every format (table at the end of Conversion and the <em>Precision and format</em> experiment) shows the trade off used in <strong>approximate computing</strong>: each fraction bit fewer doubles the maximum relative error; each exponent bit fewer takes the square root of the range.</p>`,
        },
        {
            id: 'rounding',
            title: 'The five rounding modes',
            html: `
<h3>Why round</h3>
<p>A format with precision p keeps only p significand bits. Almost every real number (0.1, 1/3, √2, the exact result of a division) needs more bits, often infinitely many. Between two neighboring representable numbers there is nothing representable: the exact value x falls between a neighbor with smaller magnitude, which we call <strong>lo</strong>, and the next one, <strong>hi</strong>. The distance between them is one <strong>ULP</strong> (<em>unit in the last place</em>): the weight of the last kept bit. Rounding means choosing lo or hi, and the <strong>rounding mode</strong> is the rule for that choice.</p>
<p>Written in binary, x has its significand cut after bit p. The bits before the cut are exactly lo (the truncation). The bits after the cut tell where x lies between lo and hi: if the first of them is 0, x is in the lower half; if it is 1 and all the others are 0, x is exactly halfway; if it is 1 and some later bit is 1, x is in the upper half. Choosing hi means adding 1 to the last kept bit.</p>
<p>In the Conversion view, the <strong>How each mode decides</strong> panel shows this cut for the typed number, the discarded fraction of an ULP and one sentence per mode with the numbers of the case. The same panel appears in Operations, for the exact result.</p>

<h3>The integer analogy</h3>
<p>The modes are the same as rounding to an integer, which is the case with ULP = 1. The table shows the effect of each:</p>
<table>
    <tr><th>x</th><th>RNE</th><th>RTZ</th><th>RDN</th><th>RUP</th><th>RMM</th></tr>
    <tr><td>2.3</td><td>2</td><td>2</td><td>2</td><td>3</td><td>2</td></tr>
    <tr><td>2.5</td><td>2</td><td>2</td><td>2</td><td>3</td><td>3</td></tr>
    <tr><td>2.7</td><td>3</td><td>2</td><td>2</td><td>3</td><td>3</td></tr>
    <tr><td>3.5</td><td>4</td><td>3</td><td>3</td><td>4</td><td>4</td></tr>
    <tr><td>−2.5</td><td>−2</td><td>−2</td><td>−3</td><td>−2</td><td>−3</td></tr>
    <tr><td>−2.7</td><td>−3</td><td>−2</td><td>−3</td><td>−2</td><td>−3</td></tr>
</table>
<p>In binary, the only difference is that the "decimal place" is a bit and a tie happens when the discarded part is exactly 1000…0.</p>

<h3>Each mode</h3>
<dl>
    <dt>RNE: to nearest, ties to even (<code>rne</code>, rm = 000)</dt>
    <dd>Picks the neighbor nearest to x. On an exact tie, picks the one ending in bit 0 (the "even" one). It is the default mode of IEEE 754 and RISC-V, the only one programs normally use. The error is at most half an ULP, that is, a relative error of at most 2^−p (the <em>unit roundoff</em>, half the machine epsilon). Ties to even avoid bias: half the ties go up and half go down. Rounding 0.5, 1.5, 2.5 and 3.5 to integers, RNE gives 0, 2, 2 and 4 (sum 8, equal to the exact sum); always rounding ties up would give 1, 2, 3 and 4 (sum 10). In a loop with millions of additions, that bias accumulates.</dd>
    <dt>RTZ: toward zero (<code>rtz</code>, rm = 001)</dt>
    <dd>Drops the bits after the cut without looking at them: the result is always lo, the neighbor with smaller magnitude. It is the simplest in hardware. The error is less than one ULP and the result is never larger in magnitude than the exact one. It is the rule of floating point to integer conversion in C, <code>(int)x</code>, which the compiler translates to <code>fcvt.w.s</code> with <code>rtz</code>. On overflow it gives the largest finite, never infinity.</dd>
    <dt>RDN: down, toward −∞ (<code>rdn</code>, rm = 010)</dt>
    <dd>Picks the smaller neighbor (to the left on the line). For positive x it is the same as truncating (lo); for negative x it moves away from zero (hi, the more negative one). The result is never larger than the exact one.</dd>
    <dt>RUP: up, toward +∞ (<code>rup</code>, rm = 011)</dt>
    <dd>Picks the larger neighbor. For positive x it moves away from zero (hi); for negative x it truncates (lo). The result is never smaller than the exact one. RDN and RUP together are the basis of <strong>interval arithmetic</strong>: computing the lower bound with RDN and the upper bound with RUP, the true value is guaranteed to lie between the two.</dd>
    <dt>RMM: to nearest, ties away from zero (<code>rmm</code>, rm = 100)</dt>
    <dd>Like RNE, but on a tie it picks the one with larger magnitude (hi). It is "school" rounding (2.5 becomes 3 and −2.5 becomes −3). It entered IEEE 754 in 2008, mainly for the decimal formats (commercial computations); in binary it is rarely used, but RISC-V offers it.</dd>
</dl>
<p>In RISC-V, the mode comes in the rm field of each floating point instruction (for example, <code>fadd.s fa0, fa1, fa2, rtz</code>); the value 111 (<code>dyn</code>), which the assembler uses when the mode is omitted, takes the mode kept in the frm field of the fcsr register, changed with <code>fsrm</code>.</p>

<h3>The rule by the G, R and S bits</h3>
<p>The hardware does not keep every discarded bit: it keeps the <strong>guard</strong> (G, the first one), the <strong>round</strong> (R, the second) and the <strong>sticky</strong> (S, the OR of all the others). With them and the sign, each mode decides whether to add 1 to the truncated significand:</p>
<table>
    <tr><th>G R S</th><th>Discarded part</th><th>RNE</th><th>RMM</th><th>RTZ</th><th>RDN</th><th>RUP</th></tr>
    <tr><td>0 0 0</td><td>zero (exact)</td><td>keep</td><td>keep</td><td>keep</td><td>keep</td><td>keep</td></tr>
    <tr><td>0 x x</td><td>less than half</td><td>keep</td><td>keep</td><td>keep</td><td rowspan="3">add 1 if x &lt; 0</td><td rowspan="3">add 1 if x &gt; 0</td></tr>
    <tr><td>1 0 0</td><td>exactly half</td><td>add 1 if the last bit is 1</td><td>add 1</td><td>keep</td></tr>
    <tr><td>1 with R or S = 1</td><td>more than half</td><td>add 1</td><td>add 1</td><td>keep</td></tr>
</table>
<p>Why three bits are enough: G tells whether the discarded part is below or above half an ULP; R and S together tell whether it is exactly half an ULP (a tie) or slightly more. R is needed only because, after a subtraction, normalization may shift the result one place to the left, and then G becomes the last kept bit and R becomes the new G. Adding 1 to the significand may produce a carry (1.111…1 + 1 = 10.000…0): the result is shifted one place right and the exponent grows by 1; this may lead to overflow.</p>

<h3>Properties</h3>
<ul>
    <li><strong>Maximum error</strong>: half an ULP in the nearest modes (RNE, RMM) and less than one ULP in the directed ones (RTZ, RDN, RUP).</li>
    <li><strong>Symmetry</strong>: RNE, RMM and RTZ are symmetric, rounding −x gives −(rounding x). RDN and RUP are not: RDN(−x) = −RUP(x).</li>
    <li><strong>Monotonicity</strong>: in every mode, if x ≤ y, then rounding x ≤ rounding y.</li>
    <li><strong>Exact result</strong>: when x is representable, every mode gives x, and the NX flag is not set.</li>
    <li><strong>Sign of zero</strong>: when the exact sum is zero (x − x), the result is +0 in every mode except RDN, which gives −0.</li>
</ul>

<h3>Overflow and tiny values</h3>
<p>On overflow, the exact value exceeds the largest finite. The nearest modes give infinity; RTZ gives the largest finite; RDN gives the largest finite for positives and −∞ for negatives; RUP, the opposite. In E4M3, which has no infinity, NaN takes the place of infinity (or the largest finite, with the saturate option). On the other end, a tiny value may round to zero, to the smallest subnormal or to the smallest normal, depending on the mode: type <code>1e-46</code> in single and compare RNE (zero) with RUP (the smallest subnormal).</p>

<h3>Double rounding</h3>
<p>Rounding twice (first to a wider format, then to the narrower one) can give a different result from rounding once. Example: x = 1 + 2^−24 + 2^−60, typed as <code>0x1.000001000000001p0</code>. Directly to single, x is slightly above the midpoint between 1 and the next neighbor, and RNE gives <code>0x3F800001</code>. Going through double first, the 2^−60 is lost (double has 52 fraction bits) and exactly the midpoint remains; the tie goes to even, and the final result is 1 (<code>0x3F800000</code>). This is why fmadd, with a single rounding, can differ from fmul followed by fadd, and why compilers are careful when computing in more precision than requested.</p>

<h3>Things to try</h3>
<ul>
    <li><code>16777217</code> in single: exact tie between 16777216 and 16777218; RNE keeps the even one (16777216) and RMM the one with larger magnitude.</li>
    <li><code>0.1</code> and <code>-0.1</code> in RDN and RUP: for negatives, "down" moves away from zero.</li>
    <li><code>1e39</code> in single: overflow; compare RNE (infinity) with RTZ (the largest finite).</li>
    <li><code>470</code> and <code>464</code> in E4M3: overflow to NaN and a tie that stays at 448 (the largest finite is even).</li>
    <li>In Operations, the <em>tie</em> example (1 + 2^−24 in single) and the <em>sticky</em> example (1 + 2^−27).</li>
</ul>`,
        },
        {
            id: 'flags',
            title: 'Flags (exceptions)',
            html: `
<p>IEEE 754 defines five exceptions. In RISC-V they do not interrupt the program: each one sets a bit in the fflags field of fcsr, which stays set until cleared.</p>
<dl>
    <dt>NV, invalid operation</dt><dd>There is no reasonable result: ∞ − ∞, 0 × ∞, 0 ÷ 0, ∞ ÷ ∞, square root of a negative, any operation with a signaling NaN, conversion to integer out of range. The result is the canonical NaN.</dd>
    <dt>DZ, divide by zero</dt><dd>x ÷ 0 with finite nonzero x. The result is infinity (NaN in E4M3).</dd>
    <dt>OF, overflow</dt><dd>The rounded result, with unbounded exponent, exceeds the largest finite. Always comes with NX.</dd>
    <dt>UF, underflow</dt><dd>The result is tiny (below the smallest normal) and inexact. RISC-V detects tininess <em>after</em> rounding.</dd>
    <dt>NX, inexact</dt><dd>The rounded result differs from the exact one.</dd>
</dl>
<p>RISC-V details followed by the simulator: every generated NaN is the <strong>canonical NaN</strong> (sign 0, exponent all ones, only the top fraction bit set); in fmadd, ∞ × 0 raises NV even when c is a quiet NaN; conversions to integer saturate (NaN and +∞ give the largest integer, −∞ the smallest).</p>`,
        },
        {
            id: 'convert',
            title: 'The Conversion view',
            html: `
<p>The number field accepts decimal (<code>-12.375</code>), scientific notation (<code>6.02e23</code>), fraction (<code>1/3</code>), power of 2 (<code>2^-10</code>), C style hexadecimal floating point (<code>0x1.8p3</code> = 1.5 × 2³), <code>inf</code> and <code>nan</code>. The value is read as an exact rational and rounded only once to the chosen format.</p>
<dl>
    <dt>Bits</dt><dd>Sign, exponent and fraction in colors. Click a bit to flip it, or type the pattern in hexadecimal.</dd>
    <dt>Fields</dt><dd>Class (as the result of <code>fclass</code>), sign, biased and unbiased exponent, fraction, significand and the formula.</dd>
    <dt>Value and error</dt><dd>The typed value, the exact stored value (every digit: a binary with k bits after the point has k decimal digits after the point), the shortest decimal that reads back to the same bits, and the absolute, relative and ULP errors. Also the guard, round and sticky bits of the conversion.</dd>
    <dt>Number line, modes and formats</dt><dd>See <a href="#h-rounding">The five rounding modes</a> and <a href="#h-formats">The formats</a>.</dd>
    <dt>Conversion to integer</dt><dd>The result of <code>fcvt.w</code>, <code>fcvt.wu</code>, <code>fcvt.l</code> and <code>fcvt.lu</code> in the chosen mode.</dd>
    <dt>Format limits</dt><dd>Largest finite, smallest normal, smallest subnormal, machine epsilon and precision.</dd>
</dl>`,
        },
        {
            id: 'ops',
            title: 'Operations and the hardware',
            html: `
<p>Operands are converted to the format in RNE mode, like constants in a program (the table warns when one was rounded). With the <strong>Operands in hexadecimal</strong> option, the bits are typed directly. The view shows the equivalent RISC-V instruction, for example <code>fadd.s fa0, fa1, fa2, rtz</code>.</p>
<h3>Addition and subtraction</h3>
<p>The steps follow the Patterson and Hennessy datapath:</p>
<ol>
    <li>unpack the operands with the implicit bit;</li>
    <li>swap so that the first one has the larger magnitude;</li>
    <li>align the smaller one, shifting its significand right by the exponent difference;</li>
    <li>add or subtract the significands;</li>
    <li>normalize (right on a carry, left after a cancellation);</li>
    <li>round;</li>
    <li>renormalize if rounding produced a carry, and check for overflow.</li>
</ol>
<p>During alignment, the hardware keeps only <strong>three extra bits</strong>: <strong>guard</strong> (G), the first one after the last kept bit; <strong>round</strong> (R), the next one; and <strong>sticky</strong> (S), the OR of every bit that left on the right. These three bits are enough to round correctly in any mode: G and R tell whether the discarded part is below, equal to or above half an ULP, and S tells an exact tie from a value slightly above. On screen, they are highlighted at the end of each register.</p>
<h3>Multiplication, division, square root and fmadd</h3>
<p>Multiplication adds the exponents and multiplies the significands (the exact product has 2p bits); division subtracts the exponents and divides the significands, and a nonzero remainder becomes sticky; the square root halves the exponent (shifting the significand when the exponent is odd). In all of them, the result goes through the same normalization and rounding steps.</p>
<p><strong>fmadd</strong> computes a × b + c with a single rounding: the exact product is not rounded before the addition. The view compares it with fmul followed by fadd; the <em>fmadd</em> example shows a case where only fmadd gives the right value.</p>
<p>The steps are computed by an implementation separate from the exact core, and the tests check that both always give the same result.</p>`,
        },
        {
            id: 'experiments',
            title: 'Experiments',
            html: `
<dl>
    <dt>Repeated sum</dt><dd>Adds the same value n times and compares with k × x, with and without Kahan compensated summation. With 0.1 in single, the error grows irregularly; Kahan keeps it at the level of the representation error.</dd>
    <dt>Associativity</dt><dd>(a + b) + c versus a + (b + c): with 10⁸, −10⁸ and 1.5 in single, one order gives 1.5 and the other gives 0.</dd>
    <dt>Catastrophic cancellation</dt><dd>(1 + x) − 1 for smaller and smaller x: the relative error grows up to 100% when x vanishes in the sum.</dd>
    <dt>fmadd versus fmul + fadd</dt><dd>A case where the rounded product loses the only bit that mattered.</dd>
    <dt>Counting that stops</dt><dd>s = s + 1 until it stops changing: it stops at 2^p (2048 in half, 256 in bfloat16, 16 in E4M3).</dd>
    <dt>Precision and format</dt><dd>The harmonic sum in six formats, with the error of each one and the point where the sum stalls.</dd>
    <dt>Spacing between neighbors</dt><dd>The ULP along the powers of 10.</dd>
</dl>
<p>Each experiment has editable parameters, a table, notes and, when it makes sense, a chart with a logarithmic axis (hover to read the values). The table can be exported in LaTeX.</p>`,
        },
        {
            id: 'integer',
            title: 'Integer arithmetic',
            html: `
<p>The view reproduces the algorithms of chapter 3 of Patterson and Hennessy, with one row per step and the registers in binary (those that changed are highlighted). Widths from 4 to 32 bits; operands in signed decimal, <code>0x</code> or <code>0b</code>.</p>
<dl>
    <dt>Addition and subtraction</dt><dd>Shows the carry of each bit, the signed and unsigned result, the final carry (C) and signed overflow (V = carry into the sign bit ⊕ carry out of it). Subtraction adds the two's complement.</dd>
    <dt>Multiplication, first version</dt><dd>2n bit multiplicand shifted left, multiplier shifted right, 2n bit product; n iterations of three steps (1a or 1, 2, 3), exactly as in the 2 × 3 table of the book.</dd>
    <dt>Refined multiplication</dt><dd>The multiplier sits in the right half of the product; the multiplicand is added to the left half and the whole product shifts right.</dd>
    <dt>Booth</dt><dd>Signed: the pair (current bit, previous bit) decides between adding (01), subtracting (10) or nothing (00, 11); then an arithmetic shift. The left half has one extra bit for the multiplicand −2^(n−1).</dd>
    <dt>Division, first version</dt><dd>2n bit divisor that starts in the left half and moves right; n + 1 iterations; if the remainder goes negative, restore. The 7 ÷ 2 example reproduces the table of the book.</dd>
    <dt>Refined and nonrestoring division</dt><dd>In the refined version, quotient and remainder share one register. In nonrestoring division, a negative remainder is corrected by adding the divisor in the next iteration instead of restoring.</dd>
</dl>
<p>When signed, multiplication and division work on the magnitudes and fix the signs at the end (the remainder has the sign of the dividend). Division by zero and overflow follow RISC-V: there is no exception; the quotient of x ÷ 0 has all bits set and the remainder is x; −2^(n−1) ÷ −1 gives the dividend itself and remainder 0.</p>`,
        },
        {
            id: 'fixed',
            title: 'Fixed point',
            html: `
<p>In binary fixed point the number is an <strong>integer</strong> with an agreed scale factor: in <code>Qm.n</code> (ARM convention) there is 1 sign bit, m integer bits and n fraction bits, in two's complement, and the value is the stored integer divided by 2^n. Unsigned <code>UQm.n</code> has m + n bits. The binary point is not stored anywhere: only the programmer knows where it is.</p>
<table>
    <tr><th>Format</th><th>Bits</th><th>Range</th><th>Resolution</th></tr>
    <tr><td>Q3.4</td><td>8</td><td>−8 to 7.9375</td><td>2^−4 = 0.0625</td></tr>
    <tr><td>Q0.15</td><td>16</td><td>−1 to 0.99997</td><td>2^−15</td></tr>
    <tr><td>Q7.8</td><td>16</td><td>−128 to 127.996</td><td>2^−8</td></tr>
    <tr><td>UQ8.8</td><td>16</td><td>0 to 255.996</td><td>2^−8</td></tr>
</table>
<p>The difference from floating point is the spacing: in fixed point the ULP is the same across the whole range, so the <em>absolute</em> rounding error is bounded (half an ULP in RNE) and the <em>relative</em> error grows as the number gets smaller. In Q7.8, 0.001 becomes 0 (100% relative error), while in half, with the same 16 bits, the error is around 4 × 10^−4. For large numbers it is the other way around: 200.7 in UQ8.8 gives 200.69921875; in half it gives 200.75.</p>
<dl>
    <dt>Addition and subtraction</dt><dd>They are the ordinary integer addition of the stored values (the same RISC-V <code>add</code>), always exact. The only problem is overflow: 6 + 3 in Q3.4 goes past 7.9375.</dd>
    <dt>Multiplication</dt><dd>The product of two integers with n fraction bits has 2n fraction bits. It is shifted n bits right, and the bits shifted out decide the rounding, with the same five modes as floating point. In Q7.8, 1.5 × 0.1 gives 0.15234375, because 0.1 had already been stored as 0.1015625.</dd>
    <dt>Division</dt><dd>The dividend is shifted n bits left before the integer division, so the quotient comes out with n fraction bits. Division by zero saturates at the end of the range with the sign of the dividend (0 ÷ 0 gives 0) and raises OF.</dd>
    <dt>Overflow</dt><dd>With <strong>saturation</strong> the result stays at the largest (or smallest) representable value, as DSP instructions and the RISC-V P extension do. <strong>Wrapping around</strong> keeps only the low bits, as in ordinary integer addition: 6 + 3 in Q3.4 gives −7. In both cases the OF flag is raised; NX means rounding happened.</dd>
</dl>
<p>The comparison table shows the floating point formats with the same number of bits (8 bits: E5M2 and E4M3; 16: half and bf16; 32: single; 64: double), with the same operands and mode. The chart goes through three values per decade, from a quarter of the ULP (which already rounds to zero) up to the largest value of the format, and shows the relative error of each representation.</p>`,
        },
        {
            id: 'classroom',
            title: 'Classroom tools',
            html: `
<dl>
    <dt>Exercises</dt><dd>Random questions of the chosen types: number to bits, bits to number, exponent, result of an operation in a mode, flags, product register at one iteration of multiplication, and quotient and remainder of a division. Answers accept equivalent forms (hexadecimal with or without 0x, any decimal that gives the same bits, flags in any order). <strong>Solution</strong> shows the commented answer and <strong>Open in the simulator</strong> opens the question in the matching view. The same seed gives the same list.</dd>
    <dt>Export</dt><dd>In each view, produces the tables in LaTeX (to download or copy): bits, fields, modes and formats of the conversion; operands, steps and modes of the operation; the experiment table; the integer arithmetic step table; bits, steps and comparison for fixed point; the exercise list, blank or with answers. Tables use a header with a <code>tabAzul</code> background and white text, <code>\\hline</code>, without booktabs, and require the <code>xcolor</code> (option <code>table</code>) and <code>graphicx</code> packages.</dd>
    <dt>Copy link</dt><dd>Creates an address with the view and the current values (for exercises, the seed and the options).</dd>
</dl>`,
        },
        {
            id: 'riscv',
            title: 'Floating point in RISC-V',
            html: `
<p>The <strong>F</strong> (single) and <strong>D</strong> (double) extensions add 32 registers f0 to f31 and the control register <strong>fcsr</strong>, with the fields frm (rounding mode, bits 7 to 5) and fflags (bits 4 to 0: NV, DZ, OF, UF, NX). The <strong>Zfh</strong> extension brings the same operations to half; <strong>Zfbfmin</strong> only converts between bfloat16 and single.</p>
<table>
    <tr><th>Instruction</th><th>Operation</th></tr>
    <tr><td><code>fadd.s</code>, <code>fsub.s</code>, <code>fmul.s</code>, <code>fdiv.s</code></td><td>the four operations, with the mode in the rm field</td></tr>
    <tr><td><code>fsqrt.s</code></td><td>square root</td></tr>
    <tr><td><code>fmadd.s</code>, <code>fmsub.s</code>, <code>fnmadd.s</code>, <code>fnmsub.s</code></td><td>multiply and add with one rounding</td></tr>
    <tr><td><code>fcvt.w.s</code>, <code>fcvt.s.w</code>, <code>fcvt.d.s</code>...</td><td>conversions between integers and formats</td></tr>
    <tr><td><code>fclass.s</code></td><td>classifies the value (10 bits, one per class)</td></tr>
    <tr><td><code>frcsr</code>, <code>fscsr</code>, <code>frrm</code>, <code>fsflags</code></td><td>read and write fcsr</td></tr>
</table>
<p>Narrower values live in the 64 bit registers with the upper bits set to 1 (<em>NaN boxing</em>): a single misused as a double reads as NaN.</p>
<p>This simulator complements the <a href="https://cser-uft.github.io/riscv-simulator/" target="_blank" rel="noopener">RISC-V Processor Simulator</a> (single cycle, pipeline, Tomasulo and caches) and the <a href="https://cser-uft.github.io/riscv-dlp-simulator/" target="_blank" rel="noopener">RISC-V Data Parallelism Simulator</a> (vector, GPU and TPU).</p>`,
        },
        {
            id: 'limits',
            title: 'How the simulator computes',
            html: `
<ul>
    <li>Every result is first computed exactly, with arbitrary size integers (the value as a rational), and only then rounded. The simulator does not use JavaScript floating point for computation.</li>
    <li>The core was checked against the Berkeley <strong>TestFloat</strong> vectors (generated by SoftFloat specialized for RISC-V) in half, single and double, in the five modes, for operations and conversions. For bfloat16 and FP8, a second checker enumerates every value of the format and picks the right neighbor by exact comparison; the 8 bit formats are tested with every pair of operands.</li>
    <li>The FP8 formats follow the OCP specification; operations on them use the same IEEE 754 rules (machine learning hardware usually accumulates in higher precision).</li>
    <li>In integer division, the first version tests the sign of the remainder through the borrow of the subtraction, and the refined version uses one extra remainder bit: without that, divisors with the top bit set would give wrong results (the book examples use small numbers and never reach that case).</li>
</ul>`,
        },
        {
            id: 'glossary',
            title: 'Glossary',
            html: `
<dl>
    <dt>Bias</dt><dd>Value added to the exponent so that it is stored unsigned: 2^(exponent bits − 1) − 1.</dd>
    <dt>Implicit bit</dt><dd>The 1 before the point of normal numbers, which is not stored.</dd>
    <dt>Machine epsilon</dt><dd>Distance from 1 to the next representable number: 2^(1 − p).</dd>
    <dt>Guard, round and sticky</dt><dd>The three extra bits the hardware keeps for rounding: the first and second discarded bits and the OR of all the others.</dd>
    <dt>Canonical NaN</dt><dd>The NaN RISC-V produces in every operation: sign 0, exponent all ones, fraction 100…0.</dd>
    <dt>Precision (p)</dt><dd>Significand bits, counting the implicit one: 11 in half, 24 in single, 53 in double, 8 in bfloat16.</dd>
    <dt>Subnormal</dt><dd>Number with zero exponent, no implicit bit, smaller than the smallest normal.</dd>
    <dt>ULP</dt><dd>Unit in the last place: the distance between a number and its neighbor of larger magnitude.</dd>
</dl>`,
        },
    ],
};
