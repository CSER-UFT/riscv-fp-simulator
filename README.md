# Simulador de Ponto Flutuante RISC-V

**Acesse:** [cser-uft.github.io/riscv-fp-simulator](https://cser-uft.github.io/riscv-fp-simulator/)

Simulador didático de aritmética de computadores, desenvolvido para o curso de **Ciência da Computação** da **Universidade Federal do Tocantins**. Mostra como um número é guardado em ponto flutuante, como o hardware soma, multiplica, divide e arredonda, a diferença entre os cinco modos de arredondamento do RISC-V e os algoritmos de aritmética inteira do capítulo 3 do Patterson e Hennessy.

É o terceiro simulador da família, ao lado do [Simulador de Processadores RISC-V](https://github.com/CSER-UFT/riscv-simulator) (monociclo, pipeline, Tomasulo e caches) e do [Simulador de Paralelismo de Dados RISC-V](https://github.com/CSER-UFT/riscv-dlp-simulator) (vetorial, GPU e TPU).

O simulador roda inteiramente no navegador (HTML e JavaScript, sem dependências nem etapa de compilação) e pode ser publicado diretamente no GitHub Pages. A interface está em português e em inglês, com tema claro e tema escuro.

## Formatos

| Formato | Bits | Expoente | Fração | Maior finito |
|---|---|---|---|---|
| double (binary64) | 64 | 11 | 52 | ≈ 1,8 × 10^308 |
| single (binary32) | 32 | 8 | 23 | ≈ 3,4 × 10^38 |
| half (binary16) | 16 | 5 | 10 | 65504 |
| bfloat16 | 16 | 8 | 7 | ≈ 3,4 × 10^38 |
| FP8 E5M2 (OCP) | 8 | 5 | 2 | 57344 |
| FP8 E4M3 (OCP) | 8 | 4 | 3 | 448 (sem infinito) |

Os cinco modos de arredondamento do RISC-V (rne, rtz, rdn, rup, rmm), as flags do fflags (NV, DZ, OF, UF, NX) e as escolhas da especificação RISC-V: NaN canônico, detecção de valor minúsculo depois do arredondamento, NV em ∞ × 0 no fmadd e conversões para inteiro com saturação. Nos formatos de 8 bits, opção de saturar no maior finito.

## Vistas

* **Conversão**: um número (decimal, notação científica, fração como `1/3`, potência de 2, hexadecimal como `0x1.8p3`, `inf`, `nan`) convertido para um formato: bits clicáveis coloridos por campo, campos, fórmula, valor exato armazenado, menor decimal que recupera os bits, erros absoluto, relativo e em ULPs, bits guard, round e sticky, reta numérica com os vizinhos e os modos que escolhem cada um, os cinco modos lado a lado, o mesmo número em todos os formatos, conversão para inteiro (`fcvt.w`, `fcvt.l`) e limites do formato.
* **Operações**: fadd, fsub, fmul, fdiv, fsqrt e fmadd com os passos do hardware: desempacotar, trocar, alinhar com guard, round e sticky, somar, normalizar, arredondar (com a explicação da decisão em cada modo), renormalizar e empacotar. Resultado exato, erro, reta numérica, os cinco modos, a instrução RISC-V equivalente e, no fmadd, a comparação com fmul seguida de fadd.
* **Experimentos**: soma repetida com e sem a soma de Kahan, associatividade, cancelamento catastrófico, fmadd contra fmul + fadd, contagem que para em 2^p, a mesma soma em seis formatos (precisão e computação aproximada) e espaçamento entre vizinhos, com tabelas e gráficos.
* **Aritmética inteira**: soma e subtração em complemento de 2 com vai uns e estouro; multiplicação na primeira versão, na versão refinada e por Booth; divisão com restauração, refinada e sem restauração; com e sem sinal, de 4 a 32 bits, com a tabela de passos no formato do livro e as regras do RISC-V para divisão por zero e estouro.
* **Ponto fixo**: formatos Qm.n e UQm.n de 2 a 64 bits; conversão e as quatro operações mostradas como conta inteira (produto com 2n bits de fração deslocado e arredondado, dividendo deslocado antes da divisão), nos cinco modos, com estouro por saturação ou dando a volta; comparação com os formatos de ponto flutuante do mesmo tamanho e gráfico do erro relativo ao longo da faixa.
* **Exercícios**: listas sorteadas com semente (número para bits, bits para número, expoente, resultado de operação, flags, multiplicação e divisão inteiras), correção automática, solução comentada e atalho para abrir cada questão no simulador.

Em todas as vistas: **Exportar** em LaTeX (cabeçalho com fundo `tabAzul` e texto branco, `\hline`, sem booktabs) e **Copiar link** com os valores atuais.

## Como é calculado

Todo resultado é calculado primeiro de forma exata, como um racional com inteiros de tamanho arbitrário (`BigInt`), e só então arredondado; o simulador não usa o ponto flutuante do JavaScript para calcular. Os passos do hardware são uma segunda implementação, conferida contra o núcleo exato.

## Verificação

```
npm test
```

* O núcleo é comparado com vetores do [TestFloat 3e](http://www.jhauser.us/arithmetic/TestFloat.html) de John Hauser, gerados com o SoftFloat especializado para RISC-V, em half, single e double, nos cinco modos: soma, subtração, multiplicação, divisão, raiz, fmadd e conversões entre formatos e com inteiros (veja `test/vectors/README.md`).
* Para bfloat16 e FP8, que o TestFloat não cobre, um oráculo independente enumera todos os valores do formato e escolhe o vizinho correto por comparação exata; os formatos de 8 bits são testados com todos os pares de operandos.
* Os passos do hardware são conferidos contra o núcleo em todos os formatos e modos e nos vetores do TestFloat.
* A aritmética inteira é testada em todos os pares de 4 e 6 bits e em sorteios de 8 a 32 bits.
* O ponto fixo é testado em seis formatos de 8 bits, com todos os pares de operandos, nos cinco modos e nos dois tratamentos de estouro, contra um oráculo que calcula piso e teto do valor exato.
* Os testes também cobrem leitura e escrita decimal, experimentos, exercícios, exportação em LaTeX e os dicionários de tradução.

## Como utilizar localmente

```
npm start
```

e abra `http://localhost:8000`. Ou publique a pasta no GitHub Pages: o workflow `.github/workflows/pages.yml` executa os testes e publica a cada push no branch principal (em Settings > Pages, escolha "GitHub Actions" como fonte).

## Estrutura

```
js/fp/formats.js         formatos (half, single, double, bfloat16, E5M2, E4M3) e modos
js/fp/core.js            núcleo exato: arredondamento, operações, conversões, flags
js/fp/decimal.js         leitura de texto como racional e valor decimal exato
js/fp/trace.js           passos do hardware (guard, round, sticky)
js/int/arith.js          algoritmos de aritmética inteira passo a passo
js/fx/fixed.js           ponto fixo Qm.n: conversão, operações, saturação e volta
js/app/                  análises, experimentos, exercícios, textos e exportação em LaTeX (sem DOM)
js/ui/                   vistas da interface, reta numérica, gráficos e ajuda
js/i18n/, js/help/       textos e manual em português e inglês
test/                    testes (node:test) e vetores do TestFloat
```

## Licença

GPL 3.0.
