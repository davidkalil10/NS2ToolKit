# Histórico de versões

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
