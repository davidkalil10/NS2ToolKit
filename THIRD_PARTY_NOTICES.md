# Componentes de terceiros

## ns2jb e fork de kurumuz

A cadeia original é de [pepsipu](https://gitlab.com/pepsipu/ns2jb). O código base utilizado vem do [fork de kurumuz](https://gitlab.com/kurumuz/ns2jb), revisão `81d5bb114c856109dadaf1077d927a9f297fe58d`, com modificações locais documentadas no README.

O snapshot de origem não continha uma licença de projeto no diretório raiz. Este repositório não atribui uma licença nova ao código de origem. Seu [README](docs/NS2JB-UPSTREAM.md), comentários e atribuições foram preservados.

## OunceCake

- Origem: https://github.com/misshexa66/OunceCake
- Autor: misshexa66 / Hexa e contribuidores.
- Revisão: `43dd500a10f7fef62a2c6d60b9f67851d3371dc6`.
- Licença: [GPL versão 2, preservada no submódulo](tools/OunceCake/LICENSE).
- Uso: descoberta, preparação e servidor FTP para conteúdo de jogos.
- O próprio projeto credita [Atmosphère](https://github.com/Atmosphere-NX/Atmosphere); essa atribuição e seu código de origem permanecem no submódulo.

## ns2-savekit

- Origem: https://github.com/dougchansan/ns2-savekit
- Copyright (c) 2026 dougchansan.
- Revisão: `700814ff37fa8f11f12e77b65dc8a33d421e8dd1`.
- Licença: [MIT, preservada no submódulo](tools/ns2-savekit/LICENSE).
- Uso neste marco: biblioteca de atributos e referência do inventário de saves. Não foram aplicados os patches de escrita.
- Avisos adicionais do projeto: [NOTICE](tools/ns2-savekit/NOTICE).

## NUP

- Origem: https://github.com/a55uka/nup
- Copyright (c) 2026 a55uka.
- Revisão: `d40d9cfa50792ba8021d2967d994d1b1c25d62b0`.
- Licença: [MIT, preservada no submódulo](tools/nup/LICENSE).
- Uso: biblioteca de empacotamento e verificação, mantida sem modificações no submódulo. O adaptador local 0.1.1 corrige, no próprio processo, as constantes TLV exportadas dessa revisão para corresponder à SPEC v1 (1–10); detalhes em docs/NUP.md.

## Compressão

[python-zstandard](https://github.com/indygreg/python-zstandard), por Gregory Szorc e contribuidores, é uma dependência preparada separadamente no desenvolvimento e incluída na build portátil em versão fixada (`0.25.0`), sob BSD-3-Clause. Ela utiliza [Zstandard](https://github.com/meta/zstd). As licenças, copyrights e avisos presentes no pacote instalado devem ser preservados ao redistribuir essa dependência. A pasta privada `.runtime/` não é publicada neste repositório.

## Referências sem código incorporado

ezBasic foi utilizado no preparo inicial do console. IZ2S Platform, HBLauncher/SDK e ftpd-sb foram consultados para recuperação e estudo de funcionalidades. Seus repositórios são vinculados no README; essas referências não anunciam integração nem transferem autoria ao NS2ToolKit.

## Runtimes da distribuição portátil

A distribuição portátil inclui Node.js 22.16.0 (OpenJS Foundation e contribuidores; licença MIT e avisos de componentes em `runtime/node/LICENSE.txt`) e CPython 3.13.4 (Python Software Foundation e contribuidores; licenças em `runtime/python/LICENSE.txt`). O pacote oficial Python inclui suas extensões e bibliotecas de runtime. python-zstandard 0.25.0 é incluído com sua licença em `runtime/python/zstandard-0.25.0.dist-info/licenses/LICENSE`. Fontes e avisos das ferramentas permanecem em `tools/`. As dependências são preparadas pelo script de [build portátil](docs/PORTATIL.md); seus binários não entram no Git.

## Adaptação experimental de montagem

`compat/ouncecake/` contém cópias derivadas de mounts/program da revisão OunceCake fixada, com licença GPL-2.0 preservada no diretório. O perfil completo mantém o submódulo original. A rota optativa para programas secundários foi informada pela revisão `04317dc` do [fork pulchrasmash](https://gitlab.com/pulchrasmash/ouncecake), sugerido na discussão upstream; não foi importado o fork completo. Veja [o escopo do experimento](docs/TESTE-MONTAGENS.md).
