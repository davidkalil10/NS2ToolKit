# Validação local de NUP — 5 de novembro de 2026

Resumo dos testes com dois backups próprios indicados pelo usuário. Não inclui títulos da biblioteca, conteúdo de jogos, caminhos privados ou pacotes gerados.

| Caso | TARs | Bytes do backup | Pacotes | Arquivos empacotados | Bytes do NUP |
| --- | ---: | ---: | --- | ---: | ---: |
| Base | 6 | 34.708.992 | 1 base | 43 | 18.232.299 |
| Base e atualização | 11 | 1.834.491.904 | Base + atualização NCM 65536 | 640 + 638 | 400.266.846 |

Em ambos, manifesto completo e hashes/tamanhos dos TARs foram conferidos. A identidade dos programas correspondeu ao manifesto. O NUP passou na verificação completa da implementação de referência, e seus diretórios, arquivos, tamanhos e hashes corresponderam à árvore extraída e adaptada.

Os relatórios finais ficaram com `complete`, `deep_verified` e `source_trees_matched` verdadeiros. Os TARs originais permaneceram sem alteração e a área temporária foi removida.

No primeiro caso, o nome opcional extraído do controle não era UTF-8 válido. Esse metadado foi omitido, mantendo intacta toda a árvore de arquivos. A saída final foi novamente verificada. O adaptador passou a rejeitar nomes opcionais inválidos em vez de inserir caracteres de substituição.

Ferramentas: Python 3.13.4, zstandard 0.25.0 e NUP `d40d9cfa50792ba8021d2967d994d1b1c25d62b0` (versão Python 0.1.0).

**Teste informado pelo usuário:** ambos os NUPs funcionaram no **Eglantine `0d86405bd1-nx2`**, build de **4 de novembro de 2026**, compilador **MSVC 19.44.35229.0**, conforme identificação mostrada na janela About. O teste de execução foi relatado pelo usuário; não foi operado ou inspecionado diretamente pelo agente. Isso não certifica outras builds ou todos os jogos.

Depois desse teste, as pastas e os arquivos foram renomeados para **Nome do jogo [ID]**. Os hashes dos NUPs permaneceram iguais antes e depois da renomeação. Os manifestos dos backups receberam o nome do jogo, sem alterar os TARs.
