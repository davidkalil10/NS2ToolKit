# Aplicar um backup de jogo modificado

## Objetivo

Selecionar a pasta de um backup editado no PC e testar suas alterações no Switch 2. Esse objetivo exige aplicar conteúdo de jogo, além da sobrescrita de arquivos comuns do SD implementada experimentalmente na 0.1.8. A restauração de saves existente também é uma operação diferente.

**Estado em 14/11/2026:** Zelda A Link to the Past & Four Swords (BR) abriu no console pelo iniciador separado, após o patch Windows `remote-posix-paths-v1`. A gravação e persistência do save ainda não foram confirmadas. O novo aplicativo **NS2 Mods GBA** automatiza preparação a partir de NUP, envio e ativação; sua automação ainda requer teste no console. Não há restauração integral de jogos. [Guia do novo fluxo](MODS-GBA.md).

## Caso prioritário Zelda A Link to the Past e Four Swords

O caso atual é `D:/teste Antigravity/A Link to the Past & Four Swords (BR) [0100554023408000]`, preparado pelo empacotador descrito em `D:/teste Antigravity/README.md`, `docs/ANALISE-E-ACERTOS.md`, `docs/DECISOES.md` e `docs/ROADMAP.md`. O NUP correspondente funcionou no emulador no teste de 09/11/2026; emulador e build não foram registrados para esse teste específico.

A análise local conferiu os seis TARs com o manifesto e os 43 arquivos com o NUP aprovado. Não foram encontradas divergências entre o backup indicado e esse NUP. Em relação ao FireRed original, há 21 arquivos alterados: a ROM, o executável, o NACP e 18 imagens de controle.

- `romfs/FireRed_e.gba`: 8.388.608 bytes, título interno `GBAZELDA`, Game Code `AZLE`, cabeçalho e checksum conferidos. A imagem contém a assinatura `EEPROM_V122`.
- `exefs/main`: 1.004.667 bytes. Os três segmentos NSO0 passaram na verificação de hashes. Os oito pontos principais de desvio do patch de save correspondem aos destinos descritos no código Python do empacotador; os segmentos fora de `.text` permanecem iguais aos do FireRed original. Essa conferência estática não comprova o comportamento de gravação no console.
- Nome e capas alterados permanecem fora do escopo do loader RomFS/ExeFS consultado.

O plano separado fica em `D:/Games/NS2ToolKit-mods/Zelda-ALttP-FourSwords-BR-sobre-FireRed-0100554023408000/`. Inclui os dois arquivos destinados ao loader, `plano.json` e instruções. Foram preservados o backup editado e o NUP aprovado. Não houve instalação ou transferência para o Switch.

### Save do Zelda e reversibilidade do teste

A documentação do empacotador descreve um patch que aciona gravação e commit para ROMs de GBA que não usam os hooks do FireRed original. Por isso, a aplicação precisa carregar também `exefs/main`, além da ROM. A confirmação de funcionamento do NUP não substitui o teste de salvar, fechar e reabrir no console.

O backup de save disponível do FireRed é Account, rank principal, com `FireRed_e.sav` de 131.072 bytes e `transaction.sav` de 1.024 bytes. O mesmo Title ID e nome de arquivo são usados pelo jogo modificado. O Zelda gravou 8.192 bytes. Em 15/11/2026, o adaptador de restauração foi corrigido para redimensionar arquivos existentes, preservando um pré-backup; a recuperação para 131.072 bytes teve commit e releitura confirmados. Versões anteriores recusam essa diferença. O carregamento do save restaurado pelo FireRed também foi confirmado no console.

O teste inicial deve usar um perfil separado do perfil com progresso do FireRed, além de preservar seu backup. Não declarar reversão completa apenas com base na existência desse backup, sem validar também a compatibilidade de tamanho no momento da restauração. Reiniciar remove o loader residente conforme o comportamento anunciado pelo projeto, mas não desfaz alterações feitas em saves durante a execução.

### Correção de escopo na documentação externa

Os documentos do empacotador descrevem corretamente a necessidade de redirecionamento ou instalação para conteúdo de jogo, mas misturam a restauração de saves com escrita FTP. No NS2ToolKit, Saves continua somente leitura pelo FTP; a gravação de saves ocorre no módulo dedicado, com prebackup, commit e verificação. Algumas decisões antigas também descrevem ExeFS intacto; a versão v3 prepara um main alterado com patch de persistência. Para este caso, os arquivos atuais e seus hashes têm prioridade sobre essas descrições anteriores.

## Resultado do caso FireRed e Emerald

A entrada `Pokémon Emerald Version [0100554023408000]` contém `manifest.json` e seis TARs em `base/program/0`. A comparação dos 43 arquivos com o NUP FireRed aprovado identificou alterações em:

- `romfs/FireRed_e.gba`, 16.777.216 bytes: o cabeçalho agora identifica `POKEMON EMER`, código `BPEE`.
- `exefs/main`, 1.056.368 bytes: executável NSO0 modificado, com os três segmentos e seus hashes validados pelo leitor do projeto de referência.
- `control/control.nacp` e 18 imagens `control/icon_*.dat`: alterações de apresentação.

Não houve arquivos adicionados ou removidos. O ID permanece `0100554023408000`, correspondente ao jogo de origem. Um teste com esse ID usa o destino de save do FireRed; preservar o save atual antes de qualquer execução no console faz parte do roteiro.

## Por que a pasta Jogos não funciona como uma pasta comum

O FTP abre sistemas de arquivos e storages fornecidos pelos serviços de conteúdo. ExeFS, RomFS e Control são vistas de conteúdo instalado; os arquivos expostos não correspondem a arquivos soltos regraváveis no SD. Os contêineres NCA possuem criptografia, hashes e assinatura: copiar os bytes de um arquivo editado para uma posição do conteúdo instalado não reproduz o fluxo de backup ao contrário. Veja a [estrutura NCA](https://switchbrew.org/wiki/NCA_Format).

Liberar STOR na raiz virtual Jogos, por si, não implementa a instalação de conteúdo modificado. Não mapear gravações FTP para offsets de NCA ou para a partição USER como tentativa de restauração.

## Candidato para executar as alterações

O [ns2jb-modloader](https://github.com/SebaaMG/ns2jb-modloader), revisão examinada `9395c91e9f5bb6c01df242fdbf7db194cf94b3c6`, oferece carregamento de RomFS e ExeFS pelo SD usando uma sessão ns2jb. O checkout original permanece em `.runtime/ns2jb-modloader-review`; a cópia corrigida do pacote separado foi usada na abertura confirmada do Zelda. Ainda não é uma dependência da release pública do assistente principal.

O layout correspondente aos arquivos do caso é:

```text
ns2jb-modloader/
  contents/
    0100554023408000/
      romfs/FireRed_e.gba
      exefs/main
```

O README do projeto descreve um loader residente até a reinicialização, incluindo um procedimento próprio de entrega da sessão antes de abrir o jogo. Isso não equivale a reinstalar permanentemente o conteúdo. O suporte anunciado é RomFS/ExeFS; Control, nome e capa do HOME não estão cobertos por esse plano.

O projeto documenta Linux/WSL como ambiente de PC. A revisão detectou que a descoberta automática consulta `/proc`; o iniciador experimental usa explicitamente `--run-dir` para evitar essa descoberta. A conferência local funciona no runtime Windows incluído, mas não comprova o funcionamento de toda a instalação nesse ambiente. A entrega ao jogo usa o procedimento do loader e o encerramento cooperativo do assistente, sem finalizar o processo à força.

## Roteiro do teste Zelda no console

Pacote preparado: `D:/Games/NS2ToolKit-mods/Zelda-ALttP-FourSwords-BR-sobre-FireRed-0100554023408000/teste-windows/`. O iniciador `Ativar-Zelda.cmd` não instala programas no Windows. O runtime Node, fontes/licenças do loader fixado e arquivos do mod estão incluídos. Não distribuir esse pacote com os arquivos do jogo.

1. Conectar o assistente normalmente em 4/4, mantendo o SmileBASIC aberto. Abrir FTP com a opção **Permitir arquivos e pastas novos no SD**. Copiar a pasta `ns2jb-modloader`, que está dentro de `teste-windows/sd-card-root/`, para `/SD/` no FTP. O destino deve ficar `/SD/ns2jb-modloader/contents/0100554023408000/romfs/FireRed_e.gba` e `.../exefs/main`. Não copiar em Jogos ou Nintendo. Se houver outro mod com o mesmo ID, não misturar os arquivos nem aceitar uma cópia incompleta como pronta.
2. Desmontar o FTP e fechar sua janela, mantendo o assistente conectado em 4/4. Clicar em **Abrir registros** no assistente e copiar o caminho da pasta ativa `runs/switch2-...`.
3. Abrir `Ativar-Zelda.cmd` e colar esse caminho. Aguardar `READY` e a mensagem **PRONTO PARA TESTAR**. O iniciador mantém uma reserva de operação nessa sessão: ela não deve mais ser usada para FTP, backups ou saves. Erros depois do início nativo invalidam a sessão e não são repetidos automaticamente.
4. Somente após READY: clicar em **Encerrar conexão** no assistente e aguardar a limpeza. Fechar o SmileBASIC pelo menu HOME **sem reiniciar o console**; abrir o FireRed instalado e selecionar o perfil de teste. Manter o SD inserido. Nome/capa do FireRed continuam no HOME. Se a ativação falhar, encerrar a conexão e reiniciar antes de outra tentativa.
5. Conferir abertura do Zelda, entrada no jogo, gravação, fechamento e reabertura no mesmo perfil. Uma inicialização sem erro não comprova persistência do save. Para desativar o loader e voltar a abrir o conteúdo original instalado, reiniciar o console. Saves não são revertidos por essa reinicialização.

Os avisos genéricos do assistente sobre reiniciar não substituem a entrega específica acima após READY; reiniciar nessa etapa desativa o mod. Não fechar à força o assistente nem usar Interromper enquanto o loader estiver trabalhando. Os registros do iniciador ficam em `teste-windows/logs/`; o loader também mantém seus diagnósticos locais e na sessão.

### Verificação do iniciador

`tools/mod-teste/iniciar.cjs` valida o pacote por hashes, confere os componentes pré-compilados, verifica layout e segmentos NSO e exige sessão ativa com prova FS correspondente. A reserva `painel-operation.lock` impede concorrência com ferramentas do painel. O endpoint de status é consultado antes de iniciar operações nativas. Não há descoberta automática Linux, encerramento forçado do host nem uso de `--keep-rpc` como sucesso.

Seis testes simulados aprovados cobrem concorrência com FTP, sessão desconectada, reserva após READY, falha nativa sem repetição, retorno sem READY e caminhos inválidos. O pacote final de 125 arquivos passou na conferência usando seu runtime Windows, inclusive pela entrada PowerShell. Nenhum desses testes constitui validação no hardware; a compatibilidade nativa e a entrega ao jogo continuam pendentes do teste acima.

### Correção Windows em 14/11/2026

A tentativa de 10/11 parou em `scanning SD mod metadata`, com `No supported mods found`, antes da instalação residente. O diagnóstico local registrou leitura nativa concluída (`complete: true`, sete entradas, resultado zero) e liberação do runtime de inventário. Isso não é uma inicialização do jogo nem confirmação de todos os arquivos esperados.

Foi reproduzida uma falha determinística no coletor JavaScript: `collectMods` aplicava `path.resolve`/`path.join` do Windows a caminhos remotos POSIX. A árvore do SD usava `/ns2jb-modloader/...`, mas o coletor procurava um caminho com unidade e barras invertidas. O mesmo inventário preenchido produz o erro original antes da correção e passa após o ajuste.

O patch local `remote-posix-paths-v1`, reproduzível por `tools/mod-teste/patch-loader.cjs`, altera apenas a resolução e o percurso de caminhos remotos em `lib/mods.cjs`; arquivos locais continuam usando as regras do sistema hospedeiro. O patch exige o hash da fonte examinada e não modifica código nativo nem seus componentes pré-compilados. A revisão upstream permanece fixada, com a alteração local explicitada em `pacote.json`.

O pacote no mesmo caminho foi atualizado, preservando logs e estado anteriores. A conferência agora também simula a árvore remota e executa a preparação lazy antes de qualquer conexão. Os 11 testes aprovados incluem reprodução do erro em Windows, caminhos POSIX em ambos os ambientes e arquivos remotos aninhados com UTF-8. O PowerShell é salvo com BOM UTF-8, o terminal usa UTF-8 e uma falha do Node não gera mais uma segunda exceção PowerShell redundante. A entrada PowerShell foi testada com sessão deliberadamente inexistente, sem contato com o console.

A tentativa antiga não deve ser reutilizada nem ter suas travas removidas para forçar uma repetição. O novo teste exige reinicialização e uma nova conexão 4/4. Os arquivos do mod já copiados corretamente para o SD não mudaram. A ativação residente, a entrega ao jogo e a persistência do save seguem pendentes de validação no console.

### Histórico das sessões

`runs` é preservado pelo host após o encerramento: cada sessão inclui fontes próprias do host, provas de aquisição e diagnósticos. A limpeza nativa restaura/libera recursos do console, mas não remove esse histórico do PC. Uma sessão ativa depende dos arquivos de sua pasta. A retenção atual é ilimitada; uma futura limpeza deve distinguir sessões ativas, encerradas e operações incertas antes de remover dados. Nenhuma sessão foi apagada durante esta investigação.

## Plano local preparado

`D:/Games/NS2ToolKit-mods/Emerald-sobre-FireRed-0100554023408000/` contém os dois arquivos do plano, um `plano.json` e instruções. O backup editado foi preservado. Os bytes extraídos foram comparados por SHA-256; `collectMods` reconheceu um arquivo RomFS e um ExeFS. `decodeNso` confirmou estrutura e hashes dos três segmentos de main. Os componentes pré-compilados do loader passaram na conferência de checksums.

Esses resultados são verificações locais, sem conexão com o console. O plano registra explicitamente que as alterações em Control ficaram fora do pacote e que a instalação não está pronta; não deve ser apresentado como restauração integral bem-sucedida.

## Abertura confirmada e automatização

Em 14/11/2026 foi confirmada a abertura normal do Zelda no Switch 2 com o pacote corrigido. O processo utiliza NUP/backup GBA preparado, extração de `romfs/FireRed_e.gba` e `exefs/main`, cópia para a pasta do mod no SD, nova sessão 4/4, ativação com a correção POSIX para Windows e abertura do FireRed após READY sem reiniciar.

Na sessão `switch2-RUQXgv`, os registros confirmaram residente verificado, entrega pronta e protocolo do RO restaurado verificado. A abertura foi confirmada manualmente. O host registrou `disconnected` e erro de limpeza do endpoint; o encerramento cooperativo completo não foi confirmado nessa execução. O roteiro do novo teste mantém a orientação de encerrar pelo assistente antes de fechar SmileBASIC. [Evidência e limites](MODS-GBA.md).

Essa confirmação encerra a pendência de inicialização desse caso no fluxo manual. Não confirma save após fechar/reabrir, compatibilidade de outras ROMs ou troca automática de mod. Control/NACP não foi aplicado por esse mecanismo.

A etapa seguinte foi autorizada: aplicativo separado que recebe o **.nup da ferramenta GBA**, confere a entrada, prepara a pasta e envia/ativa o mod pela sessão existente. O formato solicitado foi esclarecido como NUP, não NRO. A interface oferece detecção de conexão sem digitar IP/pasta de sessão e dispensa cópia manual por FTP. [Fluxo, implementação e limites](MODS-GBA.md).

## Decisões e próximos passos

1. Priorizar o objetivo de aplicar o backup modificado; manter a sobrescrita SD como uma função independente e ainda experimental.
2. Revisar instalação residente, funções FS requeridas, trava compartilhada de operação, encerramento incerto e entrega da sessão em Windows.
3. Definir um plano de aplicação visível por arquivo, distinguindo RomFS/ExeFS suportados de alterações em Control ou metadados não suportados. Uma aplicação parcial exige escopo explícito; não descartar alterações silenciosamente.
4. Integrar a preparação da pasta de origem ao fluxo do assistente somente com essas condições delimitadas. TARs e pastas extraídas podem alimentar o mesmo plano de arquivos.
5. Manter os backups já preservados. Inicialização do Zelda confirmada no fluxo manual; validar save, retorno ao original e a nova automação separadamente.
6. Investigar separadamente nome/capa no console. Não prometer que um loader RomFS/ExeFS aplicará o NACP modificado.

O motor ns2jb não foi substituído e não foi publicada release com esse recurso. A abertura confirmada usa o loader residente do experimento; o aplicativo principal público permanece separado.
