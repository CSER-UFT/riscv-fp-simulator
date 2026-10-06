/**
 * Ajuda do simulador, em português. Cada seção vira um item do índice.
 * O texto evita hífens e travessões por padrão de estilo do projeto.
 */
export default {
    title: 'Simulador de Ponto Flutuante RISC-V',
    lead: 'Simulador didático de aritmética de computadores: conversão para ponto flutuante nos formatos da IEEE 754 e nos formatos reduzidos do aprendizado de máquina, operações com os passos do hardware, os cinco modos de arredondamento do RISC-V e os algoritmos de aritmética inteira. Desenvolvido para o curso de <strong>Ciência da Computação</strong> da <strong>Universidade Federal do Tocantins</strong>.',
    searchPlaceholder: 'Buscar na ajuda',
    noResults: 'Nenhuma seção contém esse termo.',
    tocTitle: 'Conteúdo',
    close: 'Fechar ajuda',
    sections: [
        {
            id: 'start',
            title: 'Primeiros passos',
            html: `
<p>O simulador tem cinco vistas, nas abas do topo:</p>
<dl>
    <dt>Conversão</dt><dd>Digite um número e veja como ele fica guardado em um formato: os bits, os campos, o valor exato armazenado, o erro, os vizinhos na reta numérica e o resultado nos cinco modos de arredondamento e em todos os formatos.</dd>
    <dt>Operações</dt><dd>Soma, subtração, multiplicação, divisão, raiz quadrada e fmadd, com os passos do hardware: alinhamento, bits guard, round e sticky, normalização e arredondamento.</dd>
    <dt>Experimentos</dt><dd>Situações clássicas de aula: erro acumulado, soma de Kahan, associatividade, cancelamento, fmadd, contagem que para, comparação de precisões e espaçamento entre vizinhos.</dd>
    <dt>Aritmética inteira</dt><dd>Soma e subtração em complemento de 2, multiplicação (primeira versão, refinada e Booth) e divisão (com e sem restauração), com a tabela de passos do livro.</dd>
    <dt>Exercícios</dt><dd>Listas sorteadas com correção automática e exportação em LaTeX.</dd>
</dl>
<p>Tudo é recalculado enquanto se digita. O estado de cada vista fica guardado no navegador; <strong>Copiar link</strong> gera um endereço que abre a vista atual com os mesmos valores, e <strong>Exportar</strong> gera as tabelas em LaTeX.</p>
<p class="tip">Sugestão para começar: na Conversão, digite <code>0.1</code> e observe o erro e a reta numérica; troque o formato para half e depois para FP8 E4M3. Em seguida, nas Operações, use o exemplo <em>0.1 + 0.2</em>.</p>`,
        },
        {
            id: 'representation',
            title: 'Como um número é guardado',
            html: `
<p>Um número binário de ponto flutuante tem três campos: o <strong>sinal</strong> s (1 bit), o <strong>expoente</strong> E (com viés, o <em>bias</em>) e a <strong>fração</strong> F. Para os números normais, o valor é</p>
<pre><code>(−1)^s × 1,F × 2^(E − bias)</code></pre>
<p>O 1 antes da vírgula não é guardado: é o <strong>bit implícito</strong>. Por isso a <strong>precisão</strong> p é o número de bits da fração mais 1 (24 em single). O expoente com viés deixa os números positivos ordenados como inteiros: comparar dois floats positivos é comparar os seus bits.</p>
<table>
    <tr><th>Expoente</th><th>Fração</th><th>Significado</th></tr>
    <tr><td>todo em 0</td><td>0</td><td>zero (+0 ou −0)</td></tr>
    <tr><td>todo em 0</td><td>diferente de 0</td><td>subnormal: 0,F × 2^(1 − bias), sem o bit implícito</td></tr>
    <tr><td>entre os extremos</td><td>qualquer</td><td>normal</td></tr>
    <tr><td>todo em 1</td><td>0</td><td>infinito</td></tr>
    <tr><td>todo em 1</td><td>diferente de 0</td><td>NaN (silencioso se o bit mais alto da fração é 1, sinalizador se é 0)</td></tr>
</table>
<p>Os <strong>subnormais</strong> preenchem o intervalo entre zero e o menor normal com o mesmo espaçamento do primeiro intervalo de normais (<em>underflow gradual</em>): perdem precisão, mas garantem que x − y = 0 só quando x = y.</p>
<p>Na vista de Conversão, os bits aparecem coloridos por campo e podem ser clicados para inverter; o campo hexadecimal aceita um padrão digitado. A tabela de campos mostra o expoente com e sem viés, o significando e a fórmula com os valores.</p>`,
        },
        {
            id: 'formats',
            title: 'Os formatos',
            html: `
<table>
    <tr><th>Formato</th><th>Bits</th><th>Expoente</th><th>Fração</th><th>Bias</th><th>Maior finito</th><th>Menor normal</th></tr>
    <tr><td>double (binary64)</td><td>64</td><td>11</td><td>52</td><td>1023</td><td>≈ 1,8 × 10^308</td><td>2^−1022</td></tr>
    <tr><td>single (binary32)</td><td>32</td><td>8</td><td>23</td><td>127</td><td>≈ 3,4 × 10^38</td><td>2^−126</td></tr>
    <tr><td>half (binary16)</td><td>16</td><td>5</td><td>10</td><td>15</td><td>65504</td><td>2^−14</td></tr>
    <tr><td>bfloat16</td><td>16</td><td>8</td><td>7</td><td>127</td><td>≈ 3,4 × 10^38</td><td>2^−126</td></tr>
    <tr><td>FP8 E5M2</td><td>8</td><td>5</td><td>2</td><td>15</td><td>57344</td><td>2^−14</td></tr>
    <tr><td>FP8 E4M3</td><td>8</td><td>4</td><td>3</td><td>7</td><td>448</td><td>2^−6</td></tr>
</table>
<p><strong>half</strong>, <strong>single</strong> e <strong>double</strong> são os formatos binários da IEEE 754. O <strong>bfloat16</strong> é a metade de cima de um single: tem a mesma faixa (8 bits de expoente) e só 8 bits de precisão, e é usado em treinamento de redes neurais porque converter de single é só descartar bits. Os formatos de 8 bits seguem a especificação <strong>OCP</strong> (Open Compute Project) usada em aceleradores de aprendizado de máquina: o <strong>E5M2</strong> se comporta como um half encurtado (tem infinito e NaN); o <strong>E4M3</strong> não tem infinito, usa o expoente 1111 para números normais e reserva só o padrão S.1111.111 para NaN, o que leva o maior finito a 448.</p>
<p>Em formatos de 8 bits, a opção <strong>Saturar</strong> faz um estouro dar o maior finito em vez de infinito ou NaN, como no modo <em>satfinite</em> da especificação OCP.</p>
<p>Comparar o mesmo número em todos os formatos (tabela no fim da Conversão e o experimento <em>Precisão e formato</em>) mostra a troca usada em <strong>computação aproximada</strong>: cada bit a menos de fração dobra o erro relativo máximo; cada bit a menos de expoente reduz a faixa pela raiz quadrada.</p>`,
        },
        {
            id: 'rounding',
            title: 'Os cinco modos de arredondamento',
            html: `
<p>Quando o valor exato x não é representável, ele fica entre dois vizinhos representáveis. O modo de arredondamento escolhe um deles:</p>
<table>
    <tr><th>RISC-V</th><th>IEEE 754</th><th>Escolhe</th></tr>
    <tr><td><code>rne</code> (000)</td><td>roundTiesToEven</td><td>o mais próximo; no empate, o de bit menos significativo 0 (par). É o padrão.</td></tr>
    <tr><td><code>rtz</code> (001)</td><td>roundTowardZero</td><td>o de menor magnitude (trunca)</td></tr>
    <tr><td><code>rdn</code> (010)</td><td>roundTowardNegative</td><td>o menor (em direção a −∞)</td></tr>
    <tr><td><code>rup</code> (011)</td><td>roundTowardPositive</td><td>o maior (em direção a +∞)</td></tr>
    <tr><td><code>rmm</code> (100)</td><td>roundTiesToAway</td><td>o mais próximo; no empate, o de maior magnitude</td></tr>
</table>
<p>No RISC-V, o modo vem no campo rm de cada instrução de ponto flutuante; o valor 111 (<code>dyn</code>) usa o modo guardado no campo frm do registrador fcsr.</p>
<p>A <strong>reta numérica</strong> mostra x, os dois vizinhos mais próximos (e mais um de cada lado), o ponto médio entre eles e, abaixo de cada vizinho, os modos que o escolhem. Com RNE, o erro é no máximo meio ULP; com os modos dirigidos, até um ULP. O empate do RNE evita o viés: em média, metade dos empates sobe e metade desce.</p>
<p>Exemplos para testar: <code>16777217</code> em single (empate exato entre 16777216 e 16777218); <code>-0.1</code> em RDN e RUP (para números negativos, para baixo afasta do zero); <code>1e39</code> em single (estouro: infinito em RNE, o maior finito em RTZ).</p>`,
        },
        {
            id: 'flags',
            title: 'Flags (exceções)',
            html: `
<p>A IEEE 754 define cinco exceções. No RISC-V elas não interrompem o programa: cada uma liga um bit no campo fflags do fcsr, que fica ligado até ser limpo.</p>
<dl>
    <dt>NV, operação inválida</dt><dd>Não há resultado razoável: ∞ − ∞, 0 × ∞, 0 ÷ 0, ∞ ÷ ∞, raiz de negativo, qualquer operação com NaN sinalizador, conversão para inteiro fora do intervalo. O resultado é o NaN canônico.</dd>
    <dt>DZ, divisão por zero</dt><dd>x ÷ 0 com x finito diferente de zero. O resultado é infinito (NaN no E4M3).</dd>
    <dt>OF, estouro</dt><dd>O resultado arredondado, com expoente ilimitado, passa do maior finito. Sempre vem com NX.</dd>
    <dt>UF, valor minúsculo</dt><dd>O resultado é minúsculo (abaixo do menor normal) e inexato. O RISC-V detecta o valor minúsculo <em>depois</em> do arredondamento.</dd>
    <dt>NX, inexato</dt><dd>O resultado arredondado é diferente do exato.</dd>
</dl>
<p>Detalhes do RISC-V seguidos pelo simulador: todo NaN gerado é o <strong>NaN canônico</strong> (sinal 0, expoente todo em 1, só o bit mais alto da fração em 1); em fmadd, ∞ × 0 sinaliza NV mesmo quando c é um NaN silencioso; conversões para inteiro saturam (NaN e +∞ dão o maior inteiro, −∞ dá o menor).</p>`,
        },
        {
            id: 'convert',
            title: 'A vista de Conversão',
            html: `
<p>O campo de número aceita decimal (<code>-12.375</code>), notação científica (<code>6.02e23</code>), fração (<code>1/3</code>), potência de 2 (<code>2^-10</code>), hexadecimal de ponto flutuante como em C (<code>0x1.8p3</code> = 1,5 × 2³), <code>inf</code> e <code>nan</code>. O valor é lido como um racional exato e arredondado uma única vez para o formato escolhido.</p>
<dl>
    <dt>Bits</dt><dd>Sinal, expoente e fração coloridos. Clique em um bit para inverter o seu valor, ou digite o padrão em hexadecimal.</dd>
    <dt>Campos</dt><dd>Classe (como o resultado de <code>fclass</code>), sinal, expoente com e sem viés, fração, significando e a fórmula.</dd>
    <dt>Valor e erro</dt><dd>O valor digitado, o valor armazenado exato (todos os algarismos: um binário com k bits depois da vírgula tem k algarismos decimais depois da vírgula), o menor decimal que, lido de volta, dá os mesmos bits, e os erros absoluto, relativo e em ULPs. Também os bits guard, round e sticky da conversão.</dd>
    <dt>Reta numérica, modos e formatos</dt><dd>Veja <a href="#h-rounding">Os cinco modos de arredondamento</a> e <a href="#h-formats">Os formatos</a>.</dd>
    <dt>Conversão para inteiro</dt><dd>O resultado de <code>fcvt.w</code>, <code>fcvt.wu</code>, <code>fcvt.l</code> e <code>fcvt.lu</code> no modo escolhido.</dd>
    <dt>Limites do formato</dt><dd>Maior finito, menor normal, menor subnormal, épsilon da máquina e precisão.</dd>
</dl>`,
        },
        {
            id: 'ops',
            title: 'Operações e o hardware',
            html: `
<p>Os operandos são convertidos para o formato no modo RNE, como constantes de um programa (a tabela avisa quando algum foi arredondado). Com a opção <strong>Operandos em hexadecimal</strong>, os bits são digitados diretamente. A vista mostra a instrução RISC-V equivalente, por exemplo <code>fadd.s fa0, fa1, fa2, rtz</code>.</p>
<h3>Soma e subtração</h3>
<p>Os passos seguem o caminho de dados do Patterson e Hennessy:</p>
<ol>
    <li>desempacota os operandos com o bit implícito;</li>
    <li>troca para que o primeiro tenha a maior magnitude;</li>
    <li>alinha o menor, deslocando o seu significando para a direita pela diferença dos expoentes;</li>
    <li>soma ou subtrai os significandos;</li>
    <li>normaliza (para a direita no vai um, para a esquerda depois de um cancelamento);</li>
    <li>arredonda;</li>
    <li>renormaliza se o arredondamento gerar vai um, e verifica estouro.</li>
</ol>
<p>No alinhamento, o hardware guarda só <strong>três bits extras</strong>: <strong>guard</strong> (G), o primeiro depois do último bit mantido; <strong>round</strong> (R), o seguinte; e <strong>sticky</strong> (S), o OU de todos os bits que saíram pela direita. Esses três bits bastam para arredondar corretamente em qualquer modo: G e R dizem se o descarte é menor, igual ou maior que meio ULP, e S distingue o empate exato de um valor um pouco acima. Na tela, eles aparecem destacados no fim de cada registro.</p>
<h3>Multiplicação, divisão, raiz e fmadd</h3>
<p>A multiplicação soma os expoentes e multiplica os significandos (o produto exato tem 2p bits); a divisão subtrai os expoentes e divide os significandos, e o resto diferente de zero vira o sticky; a raiz divide o expoente por 2 (deslocando o significando quando o expoente é ímpar). Em todos, o resultado passa pelos mesmos passos de normalização e arredondamento.</p>
<p>O <strong>fmadd</strong> calcula a × b + c com um único arredondamento: o produto exato não é arredondado antes da soma. A vista compara com fmul seguida de fadd; o exemplo <em>fmadd</em> mostra um caso em que só o fmadd dá o valor certo.</p>
<p>Os passos são calculados por uma implementação separada do núcleo exato, e os testes conferem que as duas dão sempre o mesmo resultado.</p>`,
        },
        {
            id: 'experiments',
            title: 'Experimentos',
            html: `
<dl>
    <dt>Soma repetida</dt><dd>Soma o mesmo valor n vezes e compara com k × x, com e sem a soma compensada de Kahan. Com 0,1 em single, o erro cresce de forma irregular; Kahan o mantém no nível do erro de representação.</dd>
    <dt>Associatividade</dt><dd>(a + b) + c contra a + (b + c): com 10⁸, −10⁸ e 1,5 em single, uma ordem dá 1,5 e a outra dá 0.</dd>
    <dt>Cancelamento catastrófico</dt><dd>(1 + x) − 1 para x cada vez menor: o erro relativo cresce até 100% quando x some na soma.</dd>
    <dt>fmadd contra fmul + fadd</dt><dd>Um caso em que o produto arredondado perde o único bit que importava.</dd>
    <dt>Contagem que para</dt><dd>s = s + 1 até não mudar: para em 2^p (2048 em half, 256 em bfloat16, 16 em E4M3).</dd>
    <dt>Precisão e formato</dt><dd>A soma harmônica em seis formatos, com o erro de cada um e o ponto em que a soma estagna.</dd>
    <dt>Espaçamento entre vizinhos</dt><dd>O ULP ao longo das potências de 10.</dd>
</dl>
<p>Cada experimento tem parâmetros editáveis, tabela, observações e, quando faz sentido, um gráfico com eixo logarítmico (passe o mouse para ler os valores). A tabela pode ser exportada em LaTeX.</p>`,
        },
        {
            id: 'integer',
            title: 'Aritmética inteira',
            html: `
<p>A vista reproduz os algoritmos do capítulo 3 do Patterson e Hennessy, com uma linha por passo e os registradores em binário (os que mudaram ficam destacados). Larguras de 4 a 32 bits; operandos em decimal com sinal, <code>0x</code> ou <code>0b</code>.</p>
<dl>
    <dt>Soma e subtração</dt><dd>Mostra os vai uns de cada bit, o resultado com e sem sinal, o vai um final (C) e o estouro com sinal (V = vai um que entra no bit de sinal ⊕ vai um que sai). A subtração soma o complemento de 2.</dd>
    <dt>Multiplicação, primeira versão</dt><dd>Multiplicando de 2n bits deslocado para a esquerda, multiplicador deslocado para a direita, produto de 2n bits; n iterações de três passos (1a ou 1, 2, 3), exatamente como na tabela do exemplo 2 × 3 do livro.</dd>
    <dt>Multiplicação refinada</dt><dd>O multiplicador fica na metade direita do produto; o multiplicando é somado à metade esquerda e o produto inteiro desloca para a direita.</dd>
    <dt>Booth</dt><dd>Com sinal: o par (bit atual, bit anterior) decide entre somar (01), subtrair (10) ou nada (00, 11); depois um deslocamento aritmético. A metade esquerda tem um bit a mais para o caso do multiplicando −2^(n−1).</dd>
    <dt>Divisão, primeira versão</dt><dd>Divisor de 2n bits que começa na metade esquerda e anda para a direita; n + 1 iterações; se o resto fica negativo, restaura. O exemplo 7 ÷ 2 reproduz a tabela do livro.</dd>
    <dt>Divisão refinada e sem restauração</dt><dd>Na refinada, quociente e resto dividem um registro. Na sem restauração, um resto negativo é corrigido somando o divisor na iteração seguinte, em vez de restaurar.</dd>
</dl>
<p>Com sinal, multiplicação e divisão trabalham com as magnitudes e ajustam os sinais no fim (o resto tem o sinal do dividendo). Divisão por zero e estouro seguem o RISC-V: não há exceção; o quociente de x ÷ 0 tem todos os bits em 1 e o resto é x; −2^(n−1) ÷ −1 dá o próprio dividendo e resto 0.</p>`,
        },
        {
            id: 'classroom',
            title: 'Recursos para aula',
            html: `
<dl>
    <dt>Exercícios</dt><dd>Questões sorteadas dos tipos escolhidos: número para bits, bits para número, expoente, resultado de uma operação em um modo, flags, registro do produto em uma iteração da multiplicação e quociente e resto de uma divisão. As respostas aceitam formas equivalentes (hexadecimal com ou sem 0x, qualquer decimal que dê os mesmos bits, flags em qualquer ordem). <strong>Solução</strong> mostra a resposta comentada e <strong>Abrir no simulador</strong> abre a questão na vista correspondente. A mesma semente gera a mesma lista.</dd>
    <dt>Exportar</dt><dd>Em cada vista, gera as tabelas em LaTeX (para baixar ou copiar): bits, campos, modos e formatos da conversão; operandos, passos e modos da operação; a tabela do experimento; a tabela de passos da aritmética inteira; a lista de exercícios em branco ou com gabarito. As tabelas usam cabeçalho com fundo <code>tabAzul</code> e texto branco, <code>\\hline</code>, sem booktabs, e requerem os pacotes <code>xcolor</code> (opção <code>table</code>) e <code>graphicx</code>.</dd>
    <dt>Copiar link</dt><dd>Gera um endereço com a vista e os valores atuais (no exercício, a semente e as opções).</dd>
</dl>`,
        },
        {
            id: 'riscv',
            title: 'Ponto flutuante no RISC-V',
            html: `
<p>As extensões <strong>F</strong> (single) e <strong>D</strong> (double) acrescentam 32 registradores f0 a f31 e o registrador de controle <strong>fcsr</strong>, com os campos frm (modo de arredondamento, bits 7 a 5) e fflags (bits 4 a 0: NV, DZ, OF, UF, NX). A extensão <strong>Zfh</strong> traz as mesmas operações para half; a <strong>Zfbfmin</strong> só converte entre bfloat16 e single.</p>
<table>
    <tr><th>Instrução</th><th>Operação</th></tr>
    <tr><td><code>fadd.s</code>, <code>fsub.s</code>, <code>fmul.s</code>, <code>fdiv.s</code></td><td>as quatro operações, com o modo no campo rm</td></tr>
    <tr><td><code>fsqrt.s</code></td><td>raiz quadrada</td></tr>
    <tr><td><code>fmadd.s</code>, <code>fmsub.s</code>, <code>fnmadd.s</code>, <code>fnmsub.s</code></td><td>multiplica e soma com um arredondamento</td></tr>
    <tr><td><code>fcvt.w.s</code>, <code>fcvt.s.w</code>, <code>fcvt.d.s</code>...</td><td>conversões entre inteiros e formatos</td></tr>
    <tr><td><code>fclass.s</code></td><td>classifica o valor (10 bits, um por classe)</td></tr>
    <tr><td><code>frcsr</code>, <code>fscsr</code>, <code>frrm</code>, <code>fsflags</code></td><td>leem e escrevem o fcsr</td></tr>
</table>
<p>Os valores mais estreitos ficam nos registradores de 64 bits com os bits de cima em 1 (<em>NaN boxing</em>): assim um single mal usado como double é lido como NaN.</p>
<p>Este simulador é o complemento do <a href="https://cser-uft.github.io/riscv-simulator/" target="_blank" rel="noopener">Simulador de Processadores RISC-V</a> (monociclo, pipeline, Tomasulo e caches) e do <a href="https://cser-uft.github.io/riscv-dlp-simulator/" target="_blank" rel="noopener">Simulador de Paralelismo de Dados RISC-V</a> (vetorial, GPU e TPU).</p>`,
        },
        {
            id: 'limits',
            title: 'Como o simulador calcula',
            html: `
<ul>
    <li>Todo resultado é calculado primeiro de forma exata, com inteiros de tamanho arbitrário (o valor como um racional), e só depois arredondado. O simulador não usa o ponto flutuante do JavaScript para calcular.</li>
    <li>O núcleo foi conferido com os vetores do <strong>TestFloat</strong> de Berkeley (gerados pelo SoftFloat especializado para RISC-V) em half, single e double, nos cinco modos, para as operações e as conversões. Para bfloat16 e FP8, um segundo verificador enumera todos os valores do formato e escolhe o vizinho correto por comparação exata; os formatos de 8 bits são testados com todos os pares de operandos.</li>
    <li>Os formatos FP8 seguem a especificação OCP; operações com eles usam as mesmas regras da IEEE 754 (o hardware de aprendizado de máquina costuma acumular em precisão maior).</li>
    <li>Na divisão inteira, a primeira versão testa o sinal do resto pelo empréstimo da subtração, e a versão refinada usa um bit a mais no resto: sem isso, divisores com o bit mais alto em 1 dariam resultados errados (os exemplos do livro usam números pequenos e não chegam a esse caso).</li>
</ul>`,
        },
        {
            id: 'glossary',
            title: 'Glossário',
            html: `
<dl>
    <dt>Bias</dt><dd>Valor somado ao expoente para que ele seja guardado sem sinal: 2^(bits do expoente − 1) − 1.</dd>
    <dt>Bit implícito</dt><dd>O 1 antes da vírgula dos números normais, que não é guardado.</dd>
    <dt>Épsilon da máquina</dt><dd>Distância de 1 ao próximo número representável: 2^(1 − p).</dd>
    <dt>Guard, round e sticky</dt><dd>Os três bits extras que o hardware guarda para arredondar: o primeiro e o segundo bits descartados e o OU de todos os demais.</dd>
    <dt>NaN canônico</dt><dd>O NaN que o RISC-V produz em toda operação: sinal 0, expoente todo em 1, fração 100…0.</dd>
    <dt>Precisão (p)</dt><dd>Bits do significando, contando o implícito: 11 em half, 24 em single, 53 em double, 8 em bfloat16.</dd>
    <dt>Subnormal</dt><dd>Número com expoente zero, sem bit implícito, menor que o menor normal.</dd>
    <dt>ULP</dt><dd>Unidade na última posição: a distância entre um número e o seu vizinho de maior magnitude.</dd>
</dl>`,
        },
    ],
};
