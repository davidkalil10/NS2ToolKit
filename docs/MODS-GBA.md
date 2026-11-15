# Mods GBA a partir de NUP

Atualizado em **14/11/2026**. Aplicativo separado: **NS2 Mods GBA**, versão inicial de teste 0.1.0. Não substitui o NS2 Assistente nem a release pública do NS2ToolKit.

## Resultado confirmado

**Zelda A Link to the Past & Four Swords (BR) abriu no Switch 2 usando o FireRed como base.** A confirmação foi recebida após a correção Windows `remote-posix-paths-v1`, no fluxo manual com `Ativar-Zelda.cmd`.

Esse resultado confirma a viabilidade do carregamento da ROM e do executável modificados no console. Salvar, fechar e reabrir ainda não foi confirmado nesse teste. Outras ROMs, versões do empacotador e jogos precisam de validação própria.

Referência técnica: sessão `switch2-RUQXgv`; diagnóstico `20261115T013415Z-switch2-RUQXgv.install.json`. A instalação terminou em aproximadamente 22 segundos, com estado `ready`, residente verificado, `readyForGameHandoff: true` e protocolo do RO restaurado verificado. O horário UTC corresponde a 14/11/2026, 22:34, em São Paulo. A abertura do jogo foi confirmada manualmente; o loader não observa essa tela.

O host dessa sessão terminou com motivo `disconnected` e erro de limpeza do endpoint FS. Portanto, **a limpeza final do host não foi confirmada nesse registro**. Não atribuir esse erro a uma causa específica sem investigação. O próximo teste da interface deve conferir também o encerramento solicitado pelo assistente, antes de fechar SmileBASIC; não registrar apenas a abertura do jogo como validação de todo o ciclo.

O novo programa automatiza a preparação e o envio anteriormente manuais. Seu teste local não substitui a validação dessa nova automação no console.

## O que preparar na ferramenta GBA

Gerar um **arquivo .nup**, mantendo o **Title ID do FireRed: 0100554023408000**. A ferramenta GBA é responsável pela ROM, pelo executável modificado e pelos patches de save. O assistente de mods não modifica esses patches nem converte a ROM.

A primeira versão aceita um único pacote base com:

- `romfs/FireRed_e.gba`: a ROM GBA preparada, mesmo quando seu conteúdo é outro jogo.
- `exefs/main`: o executável preparado pela ferramenta GBA.
- `exefs/main.npdm`: usado para conferir a identidade do jogo base; não é enviado como mod.

NUP com outro ID, múltiplos pacotes, atualizações ou DLC é recusado nesta versão. NRO é outro formato e não é uma entrada deste programa.

Nome e capa do NUP podem identificar o novo jogo no emulador. **No HOME do console, nome e capa continuam como FireRed**: o loader usado aqui aplica RomFS/ExeFS, sem substituir Control.

## Usar o programa

1. Abra **NS2 Mods GBA.exe**, mantendo a pasta portátil completa. Node, Python, compressor, DLLs e loader estão incluídos. Não requer administrador nem instalações adicionais desses componentes.
2. Em **Escolher NUP**, selecione o arquivo gerado pela ferramenta GBA. Escolha onde salvar a preparação e as cópias anteriores, preferencialmente no disco D.
3. Clique em **Preparar mod**. A operação é local: confere o NUP, prepara os dois arquivos e apresenta o plano. Ainda não altera o console.
4. Reinicie o console para uma nova aquisição e conecte pelo **NS2 Assistente** normalmente até **4/4**, mantendo SmileBASIC aberto. Desmonte qualquer FTP e aguarde outros backups terminarem.
5. No programa de mods, clique em **Atualizar**. A conexão é detectada nas pastas configuradas, sem digitar IP ou nome da sessão. Se o assistente foi extraído em outro local, use **Localizar assistente** e selecione a pasta que contém seu executável e `runs`.
6. Confira o mod, selecione a conexão e confirme que o jogo está fechado e será usado um perfil de teste. Clique em **Enviar e ativar** e confira a confirmação concreta.
7. Aguarde a mensagem **Mod ativado**. O programa envia o necessário, verifica os bytes no SD e executa o loader. Não use FTP ou outros módulos durante essa operação.
8. No **assistente principal**, clique em **Encerrar conexão** e aguarde a limpeza. Depois feche o SmileBASIC pelo HOME **sem reiniciar o console** e abra o FireRed no perfil de teste. Mantenha o SD inserido.

Após a ativação, reiniciar desativa o loader. Por isso, os avisos genéricos do assistente sobre reiniciar não substituem o passo 8. Para ativar outro mod, comece com reinicialização e nova conexão 4/4. Não reutilize a sessão entregue ao jogo.

## O que acontece em cada etapa

### Preparação no PC

O leitor valida cabeçalho, tabela de conteúdo, limites e hashes dos arquivos do NUP. A entrada é somente leitura. São conferidos ID do pacote, ID no NPDM, estrutura/checksum GBA e segmentos/hashes NSO do executável. O programa também testa os caminhos remotos POSIX usados pelo loader no Windows.

Uma nova pasta com nome amigável recebe:

```text
Nome do jogo [0100554023408000]-identificador/
  mod.json
  sd-card-root/
    ns2jb-modloader/
      contents/
        0100554023408000/
          romfs/FireRed_e.gba
          exefs/main
```

`mod.json` registra origem, escopo, tamanhos e hashes. A preparação só fica pronta após todas as verificações do backend. O NUP original e preparações anteriores são preservados. Outras seções do NUP são verificadas, mas não enviadas ao console; o plano é explicitamente limitado à ROM e main.

### Envio e verificação no SD

Uma trava exclusiva impede concorrência com FTP/backups da mesma sessão. O programa confirma a disponibilidade do jogo base no inventário do console e abre o SD pelas APIs já utilizadas pelo FTP.

O destino é `SD:/ns2jb-modloader/contents/0100554023408000/`. Arquivos idênticos por tamanho e SHA-256 são relidos e reaproveitados. Arquivos novos são criados e verificados. Antes de substituir um arquivo diferente, seu conteúdo anterior é copiado e conferido no PC em `copias-anteriores-sd/`, dentro da preparação.

Essas cópias são dos **arquivos anteriores do mod no SD**, não um novo backup completo do jogo instalado ou do save. A substituição não é atômica e não há rollback automático após perda de resposta. Se uma transferência falhar, o loader não é ativado.

Arquivos extras na pasta do mod são recusados para evitar misturar dois conjuntos. Patches globais IPS não vazios também são recusados neste fluxo. O programa não apaga esses arquivos nem tenta decidir quais devem ser removidos.

### Ativação temporária

Após encerrar o acesso auxiliar de envio e confirmar a saúde da sessão, o programa chama o **ns2jb-modloader** com o título selecionado e a pasta de sessão explícita. O loader instala o redirecionamento residente e prepara a entrega ao jogo restaurando o RO de sistema.

Apenas `READY`, acompanhado do estado `ready` para o FireRed, confirma ativação. Chegar a uma etapa intermediária, retornar código zero sem esse estado ou manter RPC aberto não é suficiente.

O encerramento do host continua no assistente principal, que é o dono desse processo. O novo programa não o finaliza à força. Após a entrega, a sessão fica reservada e não deve receber outras operações.

## Saves e retorno ao FireRed

O mod usa o mesmo jogo base e destino de save do FireRed. Abrir Zelda com esse ID não cria automaticamente um save separado por nome do novo jogo. Usar um perfil de teste evita misturar o progresso principal.

O FireRed original tem `FireRed_e.sav` de 131.072 bytes. Outra ROM pode produzir tamanho diferente. Em 15/11/2026, a restauração do NS2ToolKit passou a ajustar o tamanho de arquivos existentes após pré-backup verificado; a recuperação de 8.192 para 131.072 bytes foi confirmada por commit e releitura. Versões anteriores recusam esse caso. Consulte [saves](SAVES.md) para os limites e a validação no jogo.

Para voltar ao conteúdo original instalado, reinicie o console. Isso desativa o redirecionamento, mas não desfaz alterações feitas no save durante o jogo. Para confirmar a persistência do novo jogo, salvar, fechar e reabrir deve ser um teste separado da abertura inicial.

## Diagnóstico e recuperação

- Preparação rejeitada: corrigir a entrada na ferramenta GBA; não houve operação no console.
- Nenhuma conexão encontrada: conferir 4/4, SmileBASIC aberto, FTP desmontado e pasta correta do assistente. Sessões encerradas não são oferecidas.
- Arquivos extras ou jogo base ausente: após limpeza e teste de saúde, a recusa conhecida pode preservar a sessão para uso posterior. Nenhum arquivo extra é apagado automaticamente.
- Falha nativa, timeout ou ausência de READY após início incerto: preservar os registros, encerrar a conexão e reiniciar antes da próxima tentativa. Não repetir a requisição nem apagar travas para forçar o uso.

O programa registra mensagens em `logs/` na sua pasta. Cada preparação pode conter `envio-*.json`, `copias-anteriores-sd/` e `ativacao.json`. O loader mantém seus próprios logs/estado; o assistente mantém `runs`. Esses registros não são apagados automaticamente nem devem ser publicados sem revisão.

`ativacao.json` registra ativação e mantém `gameLaunchVerified: false`: o programa não observa automaticamente a tela ou o save do jogo. A confirmação de execução recebida de um teste deve ser documentada separadamente.

## Desenvolvimento e evidência

- Interface: `Painel-Mods.cs`, aplicativo separado que reutiliza Runner/Checks/preferências do painel.
- Preparação: `painel-mod-preparar.py`, leitura integral delimitada de NUP e extração dos três arquivos de validação, com saída de dois arquivos.
- Coordenação: `painel-mods.cjs`, descoberta de sessões, verificação, envio e ativação.
- Transferência: reaproveita `painel-ftp-storage.cjs` e `painel-ftp-overwrite.cjs`, sem servidor FTP nem cópia manual no Explorer.
- Compilação/distribuição: `Compilar-Mods.ps1` e `Empacotar-Mods.ps1`.

Limites desta primeira versão: NUP de até 512 MiB no disco e 256 MiB de conteúdo descomprimido, até 64 MiB por arquivo lido, ROM de até 32 MiB, executável com até 64 MiB de segmentos descomprimidos, um pacote base e o ID fixado. Outros jogos-base e formatos de mods requerem uma nova análise de escopo.

A aplicação usa o mesmo loader e a correção que permitiram abrir Zelda. O novo envio automático, a troca por outro mod e a interface ainda precisam de teste no console. Os testes locais cobrem preparação, integridade, concorrência, recusas e entrega ao loader, sem transformar simulação em evidência de hardware.

Verificações locais desta entrega: 45 testes Node nas suítes de mods, FTP e iniciador/patch; sete testes Python de preparação; NUP real Zelda preparado com PATH sem Node/Python externos; janela real testada para preparação, bloqueio sem sessão/confirmação e recuperação de erro. Os dois arquivos preparados coincidem com os do pacote manual que abriu o jogo.

Para repetir a verificação local:

```powershell
node --test painel-mods.test.cjs painel-ftp.test.cjs tools/mod-teste/iniciar.test.cjs tools/mod-teste/patch-loader.test.cjs
python test-painel-mod-preparar.py
```

Usar Python 3.13.4 com zstandard 0.25.0, inclusive o runtime de um portátil existente quando o cache local não estiver acessível. `Testar-Mods.ps1` testa a janela com um NUP indicado e uma sessão apenas simulada, sem chamar a ativação. `Empacotar-Mods.ps1` recebe `-PythonModules` para selecionar uma cópia local já disponível do compressor. A build não baixa dependências novas nem substitui a revisão do loader.

## Créditos e revisões

- [ns2jb-modloader — SebaaMG](https://github.com/SebaaMG/ns2jb-modloader), GPL-2.0, revisão `9395c91e9f5bb6c01df242fdbf7db194cf94b3c6`, com patch local `remote-posix-paths-v1`.
- [OunceCake](https://github.com/misshexa66/OunceCake), revisão `43dd500a10f7fef62a2c6d60b9f67851d3371dc6`, adaptadores de sessão/FS e inventário.
- [nup — a55uka](https://github.com/a55uka/nup), revisão `d40d9cfa50792ba8021d2967d994d1b1c25d62b0`, leitor e formato.
- Host ns2jb, runtimes e demais atribuições: [README](../README.md) e [avisos](../THIRD_PARTY_NOTICES.md).

Fontes e licenças acompanham a pasta portátil. ROMs, NUPs, saves e preparações pessoais não fazem parte do pacote de distribuição.
