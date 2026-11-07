# Histórico de versões

## 0.1.4 — experimental, em validação

- Converte DLC base de versão zero em pacotes NUP addon, preservando IDs, arquivos e metadados. Outros programas e atualizações de DLC continuam recusados.
- Verifica todos os layouts antes dos hashes e mostra bytes/percentual durante a conferência, extração, verificação, comparação da origem e hash final.
- Informa também o tamanho gravado durante a compactação de arquivos grandes, sem estimar um tamanho final ainda desconhecido.
- Verifica conteúdo raw/zstd em blocos, evitando carregar arquivos grandes inteiros na memória. Inclui testes de integridade, identidades de DLC, cancelamento e recusa antecipada.

## 0.1.3 — experimental, em validação

- Conserva a causa nativa das recusas de montagem e permite continuar após CodeFS 0x408 somente com limpeza e saúde da sessão confirmadas.
- Registra temporariamente o arquivo selecionado para abrir CodeFS secundário e restaura a seleção anterior, sem usar a alteração do mapa de programas do FS nesse caminho.
- Reproduz em testes a recusa observada no Z-A, a preservação da sessão e a restauração da seleção em sucesso e erro.
- Validação em console: após a recusa de CodeFS no Z-A, a mesma sessão permitiu diagnóstico e exportação do Split Fiction sem manuais (13 TARs, 74,2 GB). A montagem secundária do Z-A continua pendente.

## 0.1.2 — experimental, em validação

- Corrige a leitura das mensagens finais dos processos na interface, evitando falhas aparentes quando a confirmação chega junto do encerramento.
- Inventário de base/atualizações/programas sem montagem e registros de chamadas durante a preparação.
- Perfil completo preservado; perfil optativo sem manuais e com abertura direta dos programas secundários, ainda pendente de teste no console.
- Escopo selecionado e omissões registrados no manifesto e no relatório NUP.

## 0.1.1 — 6 de novembro de 2026

- Preserva a sessão após recusa conhecida de conteúdo, quando a limpeza e a saúde dos endpoints são confirmadas. Timeouts e estados incertos continuam bloqueados.
- Lembra separadamente os destinos de jogos e saves entre janelas e reinícios do assistente.
- Corrige os identificadores TLV do adaptador NUP para a especificação v1 e inclui ícones, nomes localizados, versão e publicadora quando disponíveis no controle do próprio backup.
- Adiciona testes de recuperação da sessão, preferências e metadados binários independentes dos identificadores da biblioteca.

## 0.1.0 — 6 de novembro de 2026

Primeira release pública do NS2ToolKit para Windows x64.

- Assistente ns2jb com acompanhamento das quatro etapas e sessão RPC mantida aberta.
- Backup de jogos com OunceCake e detecção do IP do console pela conexão inicial.
- Backup de saves somente leitura, validado em console real, com nome do jogo e ID nas pastas.
- Geração e verificação de NUP pela interface, com comparação do conteúdo de origem.
- Distribuição portátil com Node, Python, compressão, bibliotecas nativas, fontes e licenças.
- Diagnóstico de falhas, preservação de cópias incompletas e bloqueio após limpeza incerta.

Restauração de saves, FTP dedicado e HBLauncher ainda não estão incluídos. Alguns conteúdos apresentam falhas conhecidas de preparação; a aquisição do FS permanece sensível à temporização. Consulte o README e a documentação antes de iniciar.
