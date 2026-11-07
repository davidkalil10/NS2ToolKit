Atualização do **NS2ToolKit** para Windows x64, com diagnóstico de backups, perfil de compatibilidade e geração de NUP com DLC.

### Instalação

Baixe **NS2ToolKit-v0.1.4-win-x64.zip**, extraia o ZIP inteiro e abra **NS2 Assistente.exe**. Node, Python, compressão e DLLs estão incluídos. O arquivo `.sha256` permite conferir a integridade do download.

Requer Windows 10/11 x64 com .NET Framework 4.x. Mantenha as subpastas junto do executável. O ZIP automático de código-fonte não substitui o portátil.

### Novidades e correções

- **Diagnóstico dos jogos:** inventário de base, atualizações, DLC e índices de programa, com registros da duração das operações.
- **Perfil de compatibilidade sem manuais:** permite exportar o conteúdo selecionado quando a preparação do manual impede o fluxo. As omissões são registradas no manifesto; a exportação não equivale a um dump integral com manuais.
- **Continuidade após recusa conhecida:** libera outra operação apenas quando a limpeza e a saúde da sessão são confirmadas, inclusive na resposta CodeFS `0x408` identificada. Timeouts e limpeza incerta continuam exigindo uma sessão nova.
- **NUP com DLC:** adapta DLC base de versão zero para pacotes addon com seus próprios IDs, arquivos e metadados. Atualizações de DLC, outras versões de DLC e programas diferentes de zero continuam recusados.
- **Arquivos grandes:** confere o conteúdo raw/zstd em blocos, com uso limitado de memória; mostra bytes e percentual nas fases de leitura e o tamanho gravado durante a compactação.
- **Resposta final da interface:** consome as mensagens finais do processo antes de apresentar sucesso ou erro, evitando falsos resultados de falha.

### Validação

Passaram **70 testes de backend**: 45 Node, 8 de download e 17 de NUP. O portátil passa pelos testes da interface com Node/Python externos fora do PATH.

No console, o perfil sem manuais concluiu a exportação do Split Fiction (13 TARs, 74,2 GB). A mesma sessão continuou utilizável depois de uma recusa do Legends Z-A. O NUP de Split Fiction foi gerado com base, atualização e DLC, verificado integralmente e comparado com a origem; nome e ícone foram preservados.

### Limitações conhecidas

- **Legends Z-A:** a abertura de CodeFS do programa secundário ainda falha. A recuperação da sessão não resolve esse dump.
- **Split Fiction nos emuladores:** a execução ainda não foi validada; o último teste ficou em `Launching`. Integridade do NUP e compatibilidade de execução são verificações distintas.
- Emuladores podem descompactar arquivos do NUP para um cache grande. Falhas de escrita desse cache foram identificadas localmente; acompanhar espaço livre e temporários após encerramentos anormais. O assistente não altera automaticamente as pastas dos emuladores.
- A aquisição do FS permanece sensível à temporização. Restauração de saves, FTP dedicado e HBLauncher não estão incluídos.

Consulte o [README](https://github.com/davidkalil10/NS2ToolKit/blob/v0.1.4/README.md), o [fluxo NUP e resultados](https://github.com/davidkalil10/NS2ToolKit/blob/v0.1.4/docs/NUP.md), os [perfis de montagem](https://github.com/davidkalil10/NS2ToolKit/blob/v0.1.4/docs/TESTE-MONTAGENS.md) e os [créditos e licenças](https://github.com/davidkalil10/NS2ToolKit/blob/v0.1.4/THIRD_PARTY_NOTICES.md).
