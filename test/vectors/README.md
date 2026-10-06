# Vetores de teste

Gerados com o TestFloat 3e de John Hauser (Berkeley), ligado ao SoftFloat 3e compilado com
`SPECIALIZE_TYPE=RISCV` (NaN canônico do RISC-V e saturação das conversões para inteiro):

```
testfloat_gen -<modo> -tininessafter -exact <função>
```

Para cada um dos cinco modos (`rnear_even`, `rminMag`, `rmin`, `rmax`, `rnear_maxMag`, que correspondem a
rne, rtz, rdn, rup e rmm), a sequência completa do nível 1 é amostrada: uma linha a cada 50 nas operações
de dois operandos, uma a cada 8000 em `mulAdd` e todas nas demais. Cada linha começa pelo modo, seguido dos
operandos, do resultado esperado e das flags em hexadecimal (NV 16, DZ 8, OF 4, UF 2, NX 1).

Os formatos bfloat16, E5M2 e E4M3 não existem no TestFloat; eles são verificados pelo oráculo de
`test/oracle.test.js`, que enumera todos os valores do formato.
