# NUP a partir da pasta copiada por FTP

## Estado em 9 de novembro de 2026

Um NUP do Pokémon FireRed Version foi gerado a partir da pasta copiada pelo Explorer na navegação FTP virtual. A estrutura e os hashes de todos os arquivos foram verificados no PC, e o ensaio do pacote foi aprovado. A detecção dos dois formatos foi integrada à mesma janela Gerar NUP na 0.1.7, com testes de regressão do fluxo TAR.

## Entrada e resultado

| Campo | Resultado |
| --- | --- |
| Entrada | `Downloads/Pokémon FireRed Version [0100554023408000]/Base/programa 0/` |
| Identidade NPDM | `0100554023408000` |
| Escopo | Base, programa 0; sem atualizações ou DLC na pasta fornecida |
| Arquivos de entrada | 43 |
| Tamanho dos arquivos de entrada | 34.661.475 bytes |
| Saída | `D:/Games/backups/nup/Pokémon FireRed Version [0100554023408000] (FTP)/Pokémon FireRed Version [0100554023408000].nup` |
| Tamanho do NUP | 19.897.400 bytes |
| SHA-256 | `0680315e3b31293068e0dea97971541a36aeb23b45f1ec953c658f37f45ae0a6` |
| Metadados | Pokémon FireRed Version; Nintendo; versão 1.0.0; ícone presente; tipos TLV 1–10 |

O relatório `build-report.json` e o arquivo `.sha256` ficam junto do NUP. A entrada não foi alterada e nenhuma saída anterior foi substituída. Os temporários foram criados e removidos no D.

## Adaptação da árvore

O ensaio aceitou exclusivamente a estrutura deste FireRed, com uma base e programa 0. `Base/programa 0/exefs` e `romfs` foram adaptados para `base/exefs` e `base/romfs`. As demais seções presentes foram preservadas em `base/data/<seção>`, como no conversor de TARs. Diretórios vazios também foram preservados.

Foram recusados links, pontos de nova análise e seções desconhecidas. O ID foi conferido com `main.npdm`. Antes da geração, a árvore preparada foi comparada à pasta original; depois, o pacote foi comparado à árvore esperada por caminhos, diretórios, tamanhos e SHA-256. A verificação profunda descompactou e recalculou os hashes de todos os arquivos. Outra leitura confirmou que a pasta original continuava idêntica.

Essa validação comprova a preservação dos arquivos fornecidos. Sem o console conectado ou um manifesto remoto, não comprova que a cópia FTP incluiu todo conteúdo que existia no console.

## Aprendizado sobre os nomes comprimidos

O `control.nacp` do FireRed usa formato de texto 1 no byte `0x3215`. A área inicial contém o tamanho de um fluxo DEFLATE raw, seguido dos textos comprimidos. O leitor de nomes do OunceCake já trata esse formato em `tools/OunceCake/engine/content.cjs`, função `applicationName`.

No ensaio inicial, a leitura Python pressupunha textos diretos nas primeiras entradas do NACP. Os textos foram descomprimidos com limite de saída e validação do fluxo para preencher os metadados do NUP. A leitura limitada foi incorporada a `painel_nup_metadata.py` na 0.1.7 e é compartilhada pelos dois formatos. O NACP original continua preservado byte a byte no pacote.

## Decisões e próximos passos

- [x] Aprovar o ensaio FireRed. O emulador e sua build não foram registrados para este teste específico.
- [x] Integrar a identificação automática de manifesto/TARs e pasta FTP, com a mesma seleção de pasta na interface.
- [x] Incorporar leitura limitada de NACP comprimido e testes de fluxo inválido, tamanho excessivo e conteúdo preservado.
- [x] Validar layouts de base, atualizações e DLC base versão zero, programa 0, com comparação de árvores entre TAR e pasta. Outros layouts são recusados.
- [x] Validar o portátil pela interface com PATH sem Node/Python externos, usando a mesma janela para TAR e pasta FTP. O resultado integrado do FireRed preserva a mesma árvore e os mesmos metadados do pacote aprovado.
- [ ] Iniciar o estudo de sobrescrita por escopo após essa entrega. A permissão de sobrescrita não deve ser aplicada a todas as raízes por consequência da criação de arquivos no SD.

O teste foi executado por um script pontual em `.runtime/convert-firered-folder.py`, com uma cópia local em `experimentos/nup-pasta-ftp/`. Ele não é um novo ponto de entrada público do conversor. A biblioteca NUP permanece fixada na revisão `d40d9cfa50792ba8021d2967d994d1b1c25d62b0`.
