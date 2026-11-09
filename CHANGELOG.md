# Histórico de versões

## 0.1.7 — em desenvolvimento

- Adiciona raízes virtuais **Jogos** e **Saves** ao FTP, com nome do jogo e ID, somente leitura e download.
- Abre arquivos sob demanda, mantém apenas uma seção/save ativo e preserva a distinção entre usuário, índice e arquivo de save.
- Reaproveita a preparação de acesso ao conteúdo licenciado dos backups de jogos; não modifica arquivos do jogo nem restaura saves pelo FTP.
- Primeira validação em console: inventário, save do FireRed, controle, ExeFS e leitura com retomada de RomFS; desmontagem e saúde da sessão confirmadas.
- Manuais de atualizações ficam indisponíveis neste modo. Outros conteúdos e jogos mantêm suas limitações próprias de montagem.

## 0.1.6 — 8 de novembro de 2026

- Adiciona **Arquivos / FTP**, com botão Montar/Desmontar e abertura do endereço no Explorer.
- Navegação e download no SD e na partição interna USER, conforme os armazenamentos que abrirem.
- Envio opcional de arquivos e pastas novos ao SD, sem sobrescrever ou apagar; verificação de tamanho e hash por releitura. Memória interna somente leitura.
- Ponte FTP local, operações serializadas, bloqueio de operações concorrentes e encerramento com limpeza dos recursos.
- Montagem e navegação FTP confirmadas em console real; listagem de SD e USER conferida. Jogos e saves ainda aparecem na organização do armazenamento, sem montagem por título.

## 0.1.5 — 7 de novembro de 2026

- Adiciona restauração de arquivos de save existentes, do mesmo tamanho, com seleção da pasta e do jogo/usuário lido do console.
- Prepara automaticamente os arquivos editados e faz pré-backup antes da confirmação de escrita; preserva o manifesto de origem.
- Confere identidade, estado atual e hashes, faz um único commit e verifica os arquivos por releitura antes de declarar sucesso.
- Não altera aquisição do FS, não cria nem apaga arquivos no console e não repete escritas incertas.
- Restauração do FireRed validada em console real: arquivo editado substituído, commit, releitura e limpeza confirmados, com funcionamento do save confirmado no jogo. Outros jogos ainda precisam de validação própria.

## 0.1.4 — 7 de novembro de 2026

- Converte DLC base de versão zero em pacotes NUP addon, preservando IDs, arquivos e metadados. Outros programas e atualizações de DLC continuam recusados.
- Verifica todos os layouts antes dos hashes e mostra bytes/percentual durante a conferência, extração, verificação, comparação da origem e hash final.
- Informa também o tamanho gravado durante a compactação de arquivos grandes, sem estimar um tamanho final ainda desconhecido.
- Verifica conteúdo raw/zstd em blocos, evitando carregar arquivos grandes inteiros na memória. Inclui testes de integridade, identidades de DLC, cancelamento e recusa antecipada.
- Reúne os perfis de diagnóstico/compatibilidade e a recuperação de sessão desenvolvidos nas revisões 0.1.2 e 0.1.3. Split Fiction foi exportado sem manuais; o dump do Legends Z-A e a execução do NUP de Split Fiction nos emuladores continuam pendentes.

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
