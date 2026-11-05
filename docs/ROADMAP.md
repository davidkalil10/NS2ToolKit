# Roadmap

Atualizado em 5 de novembro de 2026. As prioridades abaixo são propostas; os módulos marcados como planejados não estão no executável atual.

## Referência já validada

- [x] Painel Windows e execução ns2jb 4/4.
- [x] Sessão RPC mantida aberta e encerramento solicitado pelo painel.
- [x] Cópia real de arquivos de jogos com tamanho conferido e manifesto.
- [x] Parada de aquisição após limpeza incerta e preservação do primeiro erro.
- [x] Checkpoint publicado e dependência OunceCake fixada.

## P0 — entender e apresentar melhor falhas de backup

**Estado: diagnóstico inicial concluído; implementação pendente.** Ver [INC-002 e INC-003](INCIDENTES.md).

- Registrar horários, duração e identificador de cada etapa de preparação.
- Mostrar separadamente descoberta, montagem, indexação, FTP, transferência e limpeza.
- Exibir o primeiro erro em português e manter os erros de limpeza como detalhes.
- Distinguir operação recusada, operação lenta e sessão invalidada.
- Comparar o suporte da revisão fixada com alternativas para atualizações, múltiplos programas e conteúdo composto.
- Não alterar limites ou mecanismo de montagem sem um caso reproduzível e teste dedicado.

**Critérios de conclusão:** diagnóstico legível dos dois casos conhecidos; nenhum falso sucesso; nenhum replay de chamada incerta; casos anteriormente bem-sucedidos continuam funcionando; evidência no console para qualquer correção de compatibilidade.

## P1 — backup de saves

**Estado: viabilidade pesquisada; integração não iniciada.** Base candidata: [ns2-savekit](https://github.com/dougchansan/ns2-savekit).

- Fixar uma revisão e revisar somente as alterações de mecanismo necessárias.
- Descobrir usuários e arquivos de saves sem confundir catálogo de jogos com inventário de saves.
- Exibir identidade do jogo/usuário, selecionar destino e copiar para pasta nova.
- Registrar manifesto, hashes e estado incompleto em interrupções.
- Ignorar backups e identificadores pessoais no Git.

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

## Ordem de execução

Proposta inicial: P0 → P1 → P2. FTP de leitura pode ser antecipado após P0; HBLauncher depende da escolha do port e de um ambiente de compilação compatível. Registrar mudanças de prioridade em [Decisões](DECISOES.md).
