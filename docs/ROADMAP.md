# Roadmap

Atualizado em 6 de novembro de 2026. Prioridade: diagnóstico → backup de saves → restauração. Implementação e validação no console são estados separados.

## Referência já validada

- [x] Painel Windows e execução ns2jb 4/4.
- [x] Sessão RPC mantida aberta e encerramento solicitado pelo painel.
- [x] Cópia real de arquivos de jogos com tamanho conferido e manifesto.
- [x] Parada de aquisição após limpeza incerta e preservação do primeiro erro.
- [x] Checkpoint publicado e dependência OunceCake fixada.

## P0 — entender e apresentar melhor falhas de backup

**Estado: instrumentação implementada e testada localmente; validação das novas informações no console pendente.** Ver [INC-002 e INC-003](INCIDENTES.md). A correção dos caminhos de montagem ainda está pendente.

- [x] Registrar horários, duração e as aberturas anunciadas pelo OunceCake.
- [x] Diferenciar preparação sem total conhecido, transferência com contagem de bytes e limpeza. Detalhes internos de montagem/indexação dependem dos eventos do OunceCake.
- [x] Exibir resumo do erro em português e preservar a primeira causa e os erros de limpeza nos registros.
- Distinguir operação recusada, operação lenta e sessão invalidada.
- Comparar o suporte da revisão fixada com alternativas para atualizações, múltiplos programas e conteúdo composto.
- Não alterar limites ou mecanismo de montagem sem um caso reproduzível e teste dedicado.

**Critérios de conclusão:** diagnóstico legível dos dois casos conhecidos; nenhum falso sucesso; nenhum replay de chamada incerta; casos anteriormente bem-sucedidos continuam funcionando; evidência no console para qualquer correção de compatibilidade.

## P1 — backup de saves

**Estado: leitura implementada, com backup concluído em console real em 6 de novembro de 2026.** Veja [SAVES.md](SAVES.md). A biblioteca de atributos do ns2-savekit foi fixada por revisão, sem aplicar seus patches de escrita.

- [x] Fixar a dependência e revisar os patches; este marco de leitura não precisa aplicá-los.
- [x] Obter usuários e arquivos pelo inventário de saves, separado do catálogo de jogos.
- [x] Exibir jogo/usuário, selecionar destino e criar pasta com nome do jogo e ID.
- [x] Aproveitar o IP da conexão inicial para os backups de jogos.
- [x] Registrar manifesto, hashes, releitura local e cópias incompletas.
- [x] Excluir o destino padrão do Git; cache e identidades ficam na pasta local da sessão.

**Critérios de conclusão:** cópia no console sem escrita no save de origem; verificação dos arquivos; teste com mais de um arquivo de save e recusa de sessão inválida; compatibilidade Windows confirmada.

## P2 — restauração de saves

**Estado: planejado; depende de P1.**

- Conferir identidade, integridade e compatibilidade do backup.
- Fazer uma cópia do estado atual antes de qualquer substituição.
- Mostrar um plano e pedir confirmação da operação concreta.
- Realizar a escrita com commit apropriado e verificar por releitura.
- Definir como lidar com arquivos extras, diretórios, conflitos e versões.
- Tratar falhas e recuperação sem declarar rollback garantido antes de comprová-lo.

**Critérios de conclusão:** teste de ida e volta em save de teste; hashes conferidos após restauração; cancelamento antes da escrita; recusa de backup incompleto ou usuário incorreto; pré-backup preservado em falha.

## P3 — navegação e FTP

**Estado: planejado.**

Primeiro marco: sessão FTP de leitura para conteúdo selecionado, com endereço visível e encerramento explícito. Segundo marco: gerenciador de arquivos com escopo e permissões claros. Escrita deve ser avaliada separadamente de navegação.

- Expor apenas o escopo realmente montado.
- Testar listagem, download, interrupção e fechamento antes do encerramento do RPC.
- Verificar clientes Windows, sem depender de uma promessa de compatibilidade com todas as versões do Explorer.
- Avaliar um cliente dedicado e/ou navegador integrado se o Explorer não atender ao fluxo.
- Não oferecer “restaurar save por FTP” como substituto de P2.

**Critérios de conclusão:** cliente consegue navegar e copiar no escopo anunciado; tentativas de escrita em escopo de leitura são recusadas; operações simultâneas são bloqueadas; nenhuma promessa de acesso total ao cartão.

## P4 — HBLauncher e ports próprios

**Estado: pesquisa preliminar.**

- Fixar launcher/SDK e validar o ambiente de compilação e a ligação com nossa sessão.
- Abrir primeiro um exemplo mínimo e retornar ao launcher.
- Escolher um port real do usuário, com código-fonte e dependências conhecidos.
- Mapear entrada, vídeo, áudio, arquivos e gravação usados pelo port.
- Adaptar e medir cada parte, sem prometer suporte genérico a binários NRO.

**Critérios de conclusão:** exemplo mínimo validado no console e relatório de viabilidade do port escolhido. Uma demonstração de outro jogo não valida automaticamente esse port.

## P5 — gerar NUP a partir de backups locais

**Estado: adaptador CLI implementado, dois backups gerados/verificados e funcionamento informado pelo usuário no Eglantine `0d86405bd1-nx2`. Interface gráfica integrada e testada com dados sintéticos.** Veja [o fluxo atual](NUP.md) e a [validação](VALIDACAO-NUP-2026-11-05.md).

- [x] Exigir backup completo e conferir sua integridade.
- [x] Adaptar base/atualizações do programa 0, preservando outras seções em data/.
- [x] Conferir identidade e recusar DLC/outros índices sem descarte silencioso.
- [x] Fixar dependências, preservar originais e criar uma pasta nova por geração.
- [x] Verificar NUP integralmente e comparar sua árvore com a origem adaptada.
- [x] Registrar conteúdo/hashes e o teste informado pelo usuário na build identificada do Eglantine.
- [x] Nomear backups e saídas com Nome do jogo [ID], sem substituir pastas anteriores.
- [x] Integrar a geração NUP ao painel; retorno do primeiro teste no emulador já recebido.
- [x] Gerar ZIP portátil com Node, Python, DLLs e compressor incluídos; teste com PATH isolado.
- [ ] Validar o pacote em outro Windows sem instalações prévias de Node/Python.
- [ ] Avaliar DLC/múltiplos programas com casos próprios de teste.

**Critérios de conclusão:** teste sintético de ida e volta, entradas inválidas recusadas e um backup próprio empacotado/verificado, com os casos não suportados claramente informados.

## Ordem de execução

Ordem confirmada: P0 → P1 → P2, validando a leitura antes da restauração. Por solicitação posterior do usuário, o teste CLI de NUP com dois backups locais foi antecipado, sem operações no console. A interface NUP foi adicionada a pedido do usuário; FTP e HBLauncher continuam para etapas posteriores.

## Experimento atual — Z-A e Split Fiction

Perfis separados, inventário sem montagem e registros por chamada estão implementados na branch `fix/game-backup-mounts`. Testes locais passaram; a validação de montagem no console e a correção do dump integral continuam pendentes. [Roteiro e limitações](TESTE-MONTAGENS.md).
