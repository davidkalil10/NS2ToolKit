# Perfis experimentais de exportação — 0.1.3

**Estado: testes locais concluídos; validação no console pendente.** A main e a release 0.1.1 permanecem preservadas. Os tempos de espera e o mecanismo de aquisição do FS não foram alterados.

## Origem dos dois casos

- Split Fiction: recusa de `/updates/262144/program/0/manual`, que exige uma montagem com conteúdo original não atendida pelo caminho ES isolado. O perfil experimental omite os manuais por escolha explícita; não resolve a montagem completa desse documento.
- Pokémon Legends: Z-A: o log local chega a `/updates/65536/program/1/romfs` e perde a resposta, depois de preparar outra atualização. A [issue upstream #10](https://github.com/misshexa66/OunceCake/issues/10) registra a mesma sequência com Z-A em cartucho. A [discussão #6](https://github.com/misshexa66/OunceCake/issues/6) identifica o conteúdo adicional em Program[1]. A numeração menor da versão de outro pacote não permite descartá-lo: pacotes com IDs distintos podem formar juntos uma edição Switch 2.

O [fork recomendado na discussão](https://gitlab.com/pulchrasmash/ouncecake), revisão examinada `04317dc`, tenta abrir programas secundários diretamente. Essa rota foi adaptada de forma optativa, sem importar a versão completa do fork nem alterar as rotinas de registro/contexto do mecanismo.

## Perfis na janela Backup dos jogos

| Perfil | Comportamento |
| --- | --- |
| Completo (padrão) | Mantém a preparação upstream já usada na versão estável. Adiciona inventário e registros das chamadas. |
| Compatibilidade: sem manuais | Enumera a base, atualizações e todos os programas; omite somente manuais, registra cada caminho omitido e tenta a abertura direta dos programas secundários. |
| Diagnóstico: apenas inventário | Lê metadados de conteúdo, sem montar os arquivos do jogo nem iniciar FTP. |

A compatibilidade é experimental e não garante que cada programa secundário seja independente da base. Uma recusa ou tempo esgotado continua sendo erro. Não há repetição automática de requisições incertas. Nenhuma atualização é escolhida apenas por ter o maior número de versão global.

## Roteiro no console

1. Abra o assistente de teste e obtenha 4/4 com conexão mantida aberta. O arquivo NS2 do SmileBASIC continua o mesmo.
2. Mantenha o cartucho do Z-A inserido e suas atualizações instaladas. Em Backup dos jogos, liste os jogos, escolha Z-A e selecione **Diagnóstico: apenas inventário**.
3. Clique em **Coletar diagnóstico**, aguarde a conclusão e use Abrir pasta. O relatório `game-plan-<ID>-<horário>.json` identifica os pacotes, versões, armazenamentos e índices de programa. Não contém contas ou chaves do console.
4. Na mesma sessão saudável, selecione **Compatibilidade: sem manuais**, escolha o destino no D e faça a exportação. As pastas de backups anteriores são preservadas.
5. Para Split Fiction, teste também o perfil de compatibilidade. Confira `scope.omittedSections` no manifesto: a exportação não inclui os manuais anunciados.
6. Em falha, preserve `painel-backup-*.log` e o inventário. Os eventos `native_begin`, `native_end` e `native_error` identificam a chamada e sua duração. Após timeout ou limpeza incerta, encerre a conexão e reinicie o console.

Uma exportação concluída neste perfil significa que todos os arquivos anunciados dentro do escopo escolhido foram copiados. Não significa backup integral de todas as seções. O gerador NUP preserva o escopo no relatório e continua recusando índices de programa diferentes de zero; a geração de NUP multi-programa é uma frente separada.

## Implementação e validação

As cópias derivadas de mounts/program ficam em `compat/ouncecake/`, com fonte e licença GPL-2.0 preservadas. O perfil completo continua usando o submódulo original. `painel-game-diagnostics.cjs` registra inventário e chamadas na preparação, sem enviar parâmetros binários, endereços ou conteúdo dos arquivos aos registros.

Passaram 62 testes de backend: 45 Node, 8 de download e 9 de NUP. A cobertura inclui rota padrão versus direta, preservação dos dois IDs de atualização com versões diferentes, omissões no manifesto, inventário sem montagem e restauração dos wrappers após erro. A distribuição ainda passa pela validação da interface e runtimes incluídos. Esses testes não demonstram sucesso de montagem no console.

## Resultado do teste de Z-A e revisão 0.1.3

No teste de 06/11/2026, o perfil 0.1.2 abriu a RomFS do programa secundário da atualização 393216. A chamada seguinte de CodeFS respondeu em 8 ms com resultado bruto `0xd7400408` (canônico `0x408`), e a limpeza foi confirmada. O wrapper descartava a causa tipada, e a política de continuidade não classificava esse resultado; por isso o assistente invalidou a sessão mesmo sem timeout.

A revisão 0.1.3 conserva a causa e reconhece essa resposta específica de CodeFS após verificar a limpeza e os endpoints. Mensagem de texto semelhante sem resultado nativo tipado não basta para liberar uma sessão. Falhas agregadas, timeout e erro de restauração continuam bloqueando.

Para abrir CodeFS secundário, o adaptador agora registra temporariamente o caminho selecionado no resolvedor do loader e restaura a seleção anterior no encerramento. Nesse caminho não altera o mapa de índices de programa do FS. Os testes verificam restauração tanto em sucesso quanto na resposta 0x408. Ainda não há confirmação de dump completo do Z-A no console.
