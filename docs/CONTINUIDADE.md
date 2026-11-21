# Continuidade técnica do NS2ToolKit

## Atualização prioritária — build local 0.1.10

Pedido de 15/11/2026: eliminar a conexão duplicada da janela homebrew e preservar todas as orientações após a ativação. A nova interface conecta pela tela principal; **Ativar Homebrew** só habilita após 4/4 mantido. A janela compacta usa `painel-kaihen.cjs --session <run>`, sem LOAD/RUN/REMOVE/START. A sequência de mensagens permanece: HEN confirmado → fechar SmileBASIC sem reiniciar, mantendo o PC → aguardar o relatório final de desconexão → abrir jogo nativo de Switch 2 com R, repetir se o primeiro lançamento apenas capturar a política.

`painel-kaihen-held.cjs` implementa a transição, ainda sem teste real no console. O endpoint FS da nova sessão anuncia `kaihen-transition-v1`; sessões antigas são recusadas antes de mutação e continuam utilizáveis para backups. Alterações na aquisição: a sequência de pipeline anterior foi preservada; apenas `engine/switch2/ro/control.cjs` ganhou encaminhamento dos comandos de arquivos/pacotes e anúncio da capacidade. `engine/switch2/ro/package.cjs` é cópia do fork kaiHEN fixado. Não substituir o engine inteiro por um backend diferente durante a depuração.

Antes da transição: validar provas FS/RO, identidade da sessão, estado ativo e saúde; recusar sessão usada por modloader; obter a trava compartilhada. A transição copia clientes do fork e provas específicas para `run/kaihen-runtime-*`, sem sobrescrever arquivos do endpoint ativo. Confere o pacote RO por releitura, renova bindings/tipos, qualifica gate, lança RO e chama `runtime.activate` com o PID anterior verificado por PM. Só depois da troca e do frontend pronto chama o bootstrap HEN conhecido. O host normal continua vivo; o controlador não chama aquisição nem encerra o host. Após mutação mantém marcador de sessão inválida e trava exclusiva; `lockSession().retain()` fecha o descritor sem remover a trava. Não apagar esses marcadores para reutilizar a sessão. Não repetir chamadas nativas após erro incerto.

No host isolado, `test-gate.cjs` agora exporta `main` e só executa no CLI quando chamado diretamente. Isso permite aguardar a qualificação sem importar código que dispare operações nativas, nem encerrar um subprocesso por timeout. Manifesto de integridade atualizado. O modo anterior de aquisição própria permanece disponível pelo controlador para referência/testes; a janela principal usa apenas a sessão mantida.

Validação local: 118 testes Node aprovados (10 novos da transição), compilação C# e simulação das duas janelas aprovadas. Falta teste físico da transição FS → frontend RO → HEN e confirmação de que backups/FTP continuam funcionando antes dela. A release pública continua 0.1.9; não publicar a 0.1.10 como validada sem esses testes. A sessão que já estava aberta antes desta build não pode receber a capacidade nova em tempo de execução; o teste exige reiniciar o console e abrir uma conexão nova com a build 0.1.10.

Atualizado em **14/11/2026**, após a confirmação de abertura do Zelda no console e a preparação do novo assistente de mods. Este documento permite continuar o trabalho sem depender do histórico do chat. É um retrato do estado verificado nesta máquina; antes de editar, conferir novamente o Git, os arquivos e o estado real do console. Os documentos antigos registram etapas anteriores e podem conter tarefas que já foram concluídas.

## 1. Ler primeiro: situação atual e próxima ação

O projeto é um assistente Windows para conexão ns2jb, backup de jogos/saves, restauração delimitada de saves, acesso FTP e geração local de NUP. **Zelda A Link to the Past & Four Swords para GBA abriu no console usando FireRed como base**, pelo iniciador manual corrigido. O objetivo imediato passou a ser um **programa separado que receba o NUP da ferramenta GBA e automatize preparação, envio ao SD e ativação**. Save após fechar/reabrir ainda não foi confirmado.

O mecanismo escolhido para esse teste é um **loader residente de RomFS/ExeFS**, separado do aplicativo público. Ele aplica arquivos do SD ao abrir o FireRed instalado. Isso não reinstala o backup inteiro, não grava diretamente nas NCAs e não altera nome/capa no HOME.

Na tentativa de 10/11, a instalação parou ao procurar os mods. Em 14/11 foi corrigido um erro de caminhos Windows no JavaScript do loader. Após a correção, David confirmou a abertura do Zelda no console. O programa novo **NS2 Mods GBA**, versão de teste 0.1.0, usa o mesmo loader corrigido com envio automatizado. **A próxima ação é testar a nova interface e confirmar o save separadamente. Não apresentar a automação nova como já validada no hardware.**

Não assumir que exista uma conexão ativa. Não reutilizar uma pasta `runs/switch2-*` antiga como se ela ainda estivesse conectada. Não iniciar operações no console apenas porque uma sessão gravada diz `listening`.

## 2. Repositório, versões e alterações que precisam ser preservadas

- Pasta de trabalho: `C:/Users/david/Desktop/Projetos_Flutter/jbns2`.
- GitHub: `https://github.com/davidkalil10/NS2ToolKit.git`.
- Branch atual: `main`. Outra branch a preservar: `costela`, com trabalho de um colaborador no HBLauncher. Não integrar ou apagar essa branch sem uma tarefa específica.
- Última release pública registrada: **0.1.7**, commit `e7bc302b462aa32de75b6e2d780f85d0ba92a727`. A referência local `origin/main` ainda aponta para esse commit; ela não substitui uma consulta futura ao remoto.
- `main` local: `1e4b400`, um commit à frente, com substituição opcional de arquivos comuns do SD. `VERSION` contém **0.1.8**. Essa versão não foi publicada e não comprova validação no console.
- Atualização de trabalho posterior: `VERSION` agora contém **0.1.9**, com o novo modo kaiHEN integrado à janela principal. O HEAD Git acima permanece o checkpoint local anterior; as alterações novas ainda não são uma release pública.
- O experimento Zelda não é uma release nem um recurso integrado à janela principal.

Estado sem commit no momento deste documento: alterações em `SHA256SUMS` e `docs/ROADMAP.md`; novos `docs/JOGOS-MODIFICADOS.md`, `tools/mod-teste/` e este documento. Conferir `git status --short`: arquivos não rastreados também contêm trabalho necessário. Não usar reset/clean/stash destrutivo para começar uma nova tarefa.

Também há o aplicativo separado novo: `Painel-Mods.cs`, `painel-mods.cjs`, `painel-mod-preparar.py`, scripts de compilação/empacotamento/teste e `docs/MODS-GBA.md`. Eles ainda precisam ser incluídos no checkpoint Git antes de uma distribuição pública; não depender apenas de `git diff`, que não mostra o conteúdo de arquivos não rastreados.

O pedido inicial de continuidade foi documental. Pedidos posteriores autorizaram o aplicativo Mods GBA e a integração kaiHEN no toolkit principal, com builds locais para teste. Não houve autorização posterior para publicar essa versão, fazer merge da costela ou ativar programas no console durante os testes automatizados.

## 3. Funções, evidência e limites

| Função | O que faz | Estado e limite |
| --- | --- | --- |
| Conexão 4/4 | Inicia a cadeia ns2jb e mantém RPC/endpoint FS para os módulos | Validada na configuração abaixo; aquisição é sensível a temporização |
| Backup de jogos | Monta conteúdos via OunceCake e exporta TARs com manifesto | Validado em vários jogos; nem todos os conteúdos/montagens funcionam |
| Backup de saves | Lista saves Account/Device e copia arquivos com identidade e hashes | Backup real validado; cobertura não é universal |
| Restaurar save | Substitui arquivos existentes, ajustando o tamanho com pré-backup, commit e releitura | FireRed: restauração de 8.192 para 131.072 bytes confirmada em 15/11; não cria nem remove arquivos |
| Gerar NUP | Detecta backup TAR ou pasta FTP e gera/verifica um pacote local | Ambos os formatos validados no caso FireRed; NUP correto não garante execução em qualquer emulador |
| FTP 0.1.7 | Expõe SD/USER e vistas virtuais de jogos/saves; permite arquivos novos no SD quando habilitado | Navegação e leituras validadas; Jogos/Saves/Interno/Nintendo não recebem escrita |
| Sobrescrita SD 0.1.8 | Substitui arquivo comum do SD após preservar o original no PC | Implementada e testada localmente; teste com arquivo descartável no console pendente |
| Teste Zelda | Aplica ROM e executável modificados pelo ns2jb-modloader | Abertura confirmada no console com iniciador manual corrigido; save pendente |
| NS2 Mods GBA | Recebe NUP, prepara e envia/ativa o mod com interface separada | Implementado como versão de teste; preparação e controles locais testados; automação no console pendente |
| HBLauncher | Frente separada do colaborador, branch costela | Não anunciar lançamento funcional de NRO nem portabilidade automática de homebrew Switch 1 |

Configuração já validada: Switch 2 **23.0.1**, SmileBASIC completo **4.4.9** na memória interna, mais de 20 MiB livres no save e PC/console por Ethernet. Não é preciso executar como administrador. Não prometer suporte a outras versões sem verificá-las.

## 4. Arquitetura e como o aplicativo executa as operações

### Interface e processos

O aplicativo usa **C# / Windows Forms / .NET Framework 4.x**, com backend em **Node.js** e tarefas locais em **Python**. Não é um aplicativo Flutter, apesar do nome da pasta de desenvolvimento.

| Arquivo/grupo | Responsabilidade |
| --- | --- |
| `Painel-NS2.cs`, `Painel-Entry.cs`, `Painel-NS2.ps1` | Janela principal, processos, estado da sessão e entrada do painel |
| `Painel-Backup.cs` | Backup/diagnóstico de jogos e backup de saves |
| `Painel-Restore.cs` | Seleção da pasta e do destino de save, preparação e confirmação |
| `Painel-Nup.cs` | Conversão local pela mesma janela para os dois formatos de entrada |
| `Painel-Ftp.cs` | Montar/desmontar, permissões e abertura no Explorer |
| `painel-runner.cjs` | Executa helpers e converte a linha de entrada `stop` em encerramento cooperativo |
| `painel-progress.cjs` | Eventos, fases, duração, resumo de erros e conferência de limpeza |
| `painel-session.cjs`, `painel-recovery.cjs` | Pré-condições, trava compartilhada, invalidação e verificação de saúde |
| `run.cjs`, `rpc.cjs`, `engine/`, `bootstrap.bas` | Host ns2jb, comunicação, aquisição e snapshots de sessão |

Os helpers emitem linhas `PANEL:` seguidas de JSON com eventos como fase, status, destino, erro e conclusão. A interface interpreta essas linhas e também mantém o texto bruto. A origem do primeiro erro deve ser preservada mesmo quando surgem falhas posteriores na limpeza.

`Runner.RequestCleanup()` envia `stop` ao processo controlado. Isso é diferente de finalizar o processo à força. No Windows, não presumir que Ctrl+C enviado externamente a um processo com entrada redirecionada chegará como SIGINT.

As preferências ficam em `%LOCALAPPDATA%/NS2ToolKit/settings.json`, incluindo destinos separados de jogos, saves e cópias anteriores do FTP. A interface deve preservar os caminhos escolhidos.

### Conexão e ciclo de vida

O host escuta a conexão do SmileBASIC, verifica a aplicação, adquire memória FS, prepara a execução necessária e confirma o teste FS. A interface acompanha as quatro etapas. A sessão só está pronta para os módulos após **4/4 verificado no PC**.

Fluxo normal no console, sempre seguindo os comandos exibidos pelo painel:

```basic
LOAD "NS2"
RUN
REMOVE NSR,&H60000000,&H3FFFFFFF
```

`RUN` mostra `DIST BOOT READY 1015`; `Out of memory` no `REMOVE` é esperado. Executar `REMOVE` uma vez por abertura. Depois usar a linha `V=START(...)` gerada com o endereço do PC. Não repetir RUN/REMOVE após START na mesma sessão. `RPC RUNNING` ou `RPC STOP` no Switch não é prova de sucesso.

`--rpc` mantém o host, o SmileBASIC RPC e o endpoint FS em execução após 4/4. Os módulos dependem dessa sessão. O IP do console é registrado e reaproveitado; não fixar endereços ou portas FTP de uma tentativa anterior.

Uma pasta nova em `runs/switch2-*` guarda o código específico da sessão, configuração da conexão, resultados, provas, inventários e diagnósticos. O host grava `result.json` e o estado de encerramento. **O encerramento libera recursos do console, mas não apaga o histórico do PC.**

### Concorrência e falhas

`painel-operation.lock` é criado de forma exclusiva por operação. FTP montado ocupa essa trava; desmontar antes de usar outro módulo. `painel-session-invalid.json` impede reaproveitamento após operação incerta.

`requireHeldSession()` verifica estados gravados e a marca de invalidação; isso sozinho não prova que um processo/endpoint ainda está vivo. Quando o fluxo exige saúde atual, consultar RPC e identidade do endpoint. Recusas conhecidas de conteúdo só liberam a sessão após limpeza confirmada e teste de saúde.

Não apagar uma trava ou marca para forçar nova tentativa. Após timeout, desconexão ou resultado nativo incerto, não repetir a requisição. Guardar evidências, encerrar e reiniciar antes de nova aquisição. Aumentar timeouts indiscriminadamente não resolve incompatibilidade de montagem.

## 5. Como cada módulo funciona

### Jogos e diagnósticos

`painel-backup.cjs` usa OunceCake para descobrir títulos, preparar montagens e servir conteúdo por FTP de leitura no console. `painel-download.py` transfere para o PC, confere tamanhos, calcula hashes locais e produz a pasta amigável com TARs e manifesto. Não afirmar comparação SHA remoto/local: o backup de jogos não faz essa comparação remota.

`painel-game-diagnostics.cjs` registra inventário sem montar todas as seções e instrumenta chamadas de preparação. `compat/ouncecake/` contém a adaptação local do perfil de compatibilidade, sem substituir silenciosamente o submódulo fixado.

Perfis: `full`, `compatibility` (sem manuais e com rota alternativa delimitada) e `inventory` (diagnóstico). O manifesto deve registrar seções omitidas. Uma operação parcial não pode ser apresentada como backup integral.

Casos conhecidos: Split Fiction foi exportado sem manuais; Legends Z-A ainda falha na montagem CodeFS de programa secundário. O dump e o NUP do Split Fiction avançaram, mas a execução permaneceu em `Launching` nos emuladores. A hipótese de limitação do emulador não foi comprovada como causa única. Consultar `TESTE-MONTAGENS.md` e `INCIDENTES.md` antes de mudar montagens.

### Saves e restauração

`painel-saves.cjs` e `painel-save-reader.cjs` identificam saves Account/Device pelo inventário e copiam arquivos sem aplicar um conjunto amplo de patches de outra ferramenta. Manifesto, identidade e conclusão após limpeza são partes do formato.

`painel-restore.cjs` coordena a janela; `painel-save-restore.cjs` valida a origem e o destino, prepara payload/plano e cria pré-backup do estado do console. A escrita exige confirmação na interface, revalidação, commit e verificação por releitura. O jogo deve estar fechado.

Limites atuais: arquivos já existentes, com redimensionamento do destino ao tamanho do backup; até **16 MiB por arquivo**, **64 MiB por conjunto**, **256 arquivos**. Não há criação ou exclusão. O tamanho local também pode diferir do manifesto: é tratado como edição e preservado no payload do plano. Preservar pré-backup não equivale a rollback automático garantido.

Atualização de 15/11/2026: após salvar no Zelda, `/FireRed_e.sav` ficou com 8.192 bytes e bloqueou a restauração antiga. O adaptador agora registra `beforeSize` no plano, confere o estado original antes da escrita, registra a intenção antes de IFile.SetSize (comando 3), escreve, faz flush, confere tamanhos/hashes, realiza um commit e reabre para releitura. A recuperação autorizada restaurou os dois arquivos da pasta FireRed indicada (save de 131.072 bytes e transaction de 1.024 bytes). Relatório privado em `D:/Games/backups/saves/restauracoes/Pokémon FireRed Version [0100554023408000] (4)/restore-report.json`: complete/committed/verified/cleanupConfirmed verdadeiros; saúde da sessão confirmada depois. Pré-backup do Zelda preservado na subpasta `pre-backup`. O carregamento do save restaurado no FireRed foi confirmado no console. A origem foi preservada, incluindo o save já editado antes deste incidente; não foi buscada uma versão diferente. Testes locais: 18 casos de restauração, incluindo crescimento, redução e falha sem repetição.

A restauração do FireRed editado foi confirmada em console. O objetivo da interface é simples: apontar a pasta modificada, ler os destinos reais do console, escolher jogo/usuário e confirmar o plano. Não exigir que a pessoa monte comandos internos manualmente.

### FTP

`painel-ftp.cjs` prende a sessão e coordena montagem, servidor e limpeza. `painel-ftp-server.cjs` implementa o servidor local; `painel-ftp-storage.cjs`/`painel-ftp-fs.cjs` fazem a adaptação FS. `painel-ftp-virtual.cjs` monta jogos/saves sob demanda usando as APIs dos módulos existentes.

O Explorer se conecta a `ftp://127.0.0.1:<porta-da-sessão>/`. É um servidor no PC que encaminha operações para o console, não um mapeamento de unidade com letra. O FTP usado internamente pelo backup de jogos é outro fluxo.

Raízes: **SD** (arquivos comuns), **Interno** (USER, leitura), **Jogos** e **Saves** (vistas virtuais com nomes/IDs, leitura). Conteúdo instalado não é uma árvore de arquivos comuns regraváveis; as vistas abrem ExeFS, RomFS, Control e saves por serviços do console. Arrastar arquivos sobre NCA ou liberar STOR em Jogos não implementa restauração de jogo.

A 0.1.7 permite criação de arquivos/pastas novos no SD mediante opção. A 0.1.8 acrescenta sobrescrita opcional em `painel-ftp-overwrite.cjs`: receber o novo arquivo no PC, preservar original e manifesto no PC, revalidar o destino, ajustar tamanho, escrever/flush e conferir SHA por releitura. Limite de 1 GiB para original e substituto. Não é atômica; não há replay/rollback automático após incerteza. SD/Nintendo, Interno, Jogos e Saves continuam protegidos.

### Conversão NUP

`painel-nup.py` é o adaptador principal. `painel_nup_folder.py` reconhece a árvore copiada por FTP; `painel_nup_metadata.py` lê o controle e prepara metadados. `painel_names.py`/`painel-names.cjs` padronizam nomes de pastas/arquivos.

A mesma seleção de pasta aceita backup TAR com `manifest.json` ou pasta FTP com `Base/programa 0`. A presença de manifesto tem significado; não ignorar um manifesto inválido para converter como se fosse outra origem. Aceita base/atualizações do programa 0 e DLC base versão zero; layouts desconhecidos são recusados.

O conversor confere a origem, gera NUP, verifica o contêiner e compara arquivos com a origem, produzindo `build-report.json`. Pastas e arquivos usam Nome [ID]. A fonte é preservada. Uma pasta FTP pode já ter sido copiada incompleta; verificar a árvore local não comprova que ela contém todos os arquivos remotos.

Correções locais importantes: tipos TLV de metadados da biblioteca fixada são ajustados no adaptador, e ícones/títulos são extraídos inclusive de controle comprimido. Não desfazer esse ajuste porque o submódulo usa constantes diferentes. Control/NACP é binário, não deve ser editado com Notepad. Metadados de apresentação do contêiner NUP e conteúdo Control do jogo são coisas distintas.

## 6. Experimento prioritário: Zelda sobre FireRed

### Entradas e arquivos preparados

| Conteúdo | Local nesta máquina |
| --- | --- |
| Ferramenta externa e documentação do empacotador GBA | `D:/teste Antigravity/` |
| Backup modificado atual | `D:/teste Antigravity/A Link to the Past & Four Swords (BR) [0100554023408000]` |
| Referência FireRed original | `D:/teste Antigravity/Pokémon FireRed Version [0100554023408000]` |
| Pacote para teste no console | `D:/Games/NS2ToolKit-mods/Zelda-ALttP-FourSwords-BR-sobre-FireRed-0100554023408000/teste-windows/` |
| Plano/comparação anterior ao teste | Pasta pai do pacote acima, `plano.json` |
| NUP aprovado no emulador | `D:/Games/backups/nup/A Link to the Past & Four Swords (BR) [0100554023408000]/A Link to the Past & Four Swords (BR) [0100554023408000].nup` |
| Caso Emerald anterior, fora da prioridade atual | `D:/Games/NS2ToolKit-mods/Emerald-sobre-FireRed-0100554023408000/` |

David informou ter backups do jogo e do save guardados. Não refazer essa pergunta como bloqueio. Não executar os EXEs/scripts externos do empacotador sem revisar; sua documentação e fontes são referência para a análise.

O Title ID de base é **0100554023408000**. A ROM permanece com o nome `FireRed_e.gba`, mas seu conteúdo é Zelda: 8.388.608 bytes, título GBA `GBAZELDA`, código `AZLE`, assinatura `EEPROM_V122`. O executável NSO `main`, 1.004.667 bytes, também foi modificado pelo empacotador para gravação de save. Copiar só a ROM não reproduz esse pacote.

A comparação local conferiu os seis TARs/manifesto e os 43 arquivos contra o NUP aprovado. Frente ao FireRed original, mudaram 21 arquivos: ROM, main, NACP e 18 ícones. Os segmentos NSO e os oito pontos principais do patch passaram na verificação estática. Isso não prova execução ou persistência no hardware.

### O que o loader aplica

Base externa: `SebaaMG/ns2jb-modloader`, revisão **9395c91e9f5bb6c01df242fdbf7db194cf94b3c6**, GPL-2.0. Checkout original para revisão: `.runtime/ns2jb-modloader-review`. Cópia usada no teste: subpasta `loader/` do pacote D. Fontes, licenças e componentes pré-compilados estão preservados.

O pacote de SD contém apenas:

```text
SD:/ns2jb-modloader/contents/0100554023408000/
  romfs/FireRed_e.gba
  exefs/main
```

NACP e ícones não são aplicados por esse fluxo. O HOME continua mostrando FireRed. O jogo instalado continua necessário. Não há instalação persistente ou geração de NSP/XCI nesse experimento.

O loader qualifica o runtime FS, lê o inventário de mods do SD, prepara a estrutura residente, instala os hooks e restaura o RO de sistema para entregar a execução ao jogo. **Não usar `--keep-rpc` como sucesso:** essa opção deixa a entrega pendente. Só `READY` com estado `ready` e título correto autoriza o próximo passo.

### Iniciador e correção Windows

Fontes locais do iniciador: `tools/mod-teste/`. O pacote D inclui Node próprio em `runtime/node.exe`, scripts, `pacote.json`, layout SD e loader. Não depende de instalar Node no Windows.

- `iniciar.cjs`: verifica hashes/layout/NSO, simula caminhos remotos, exige prova de sessão correspondente, consulta status e prende a trava compartilhada antes de chamar o loader com `--sd --run-dir <sessão> --title 0100554023408000`.
- `patch-loader.cjs`: patch reproduzível **remote-posix-paths-v1**, aplicado somente a `loader/lib/mods.cjs`. Usa `path.posix` para recursos remotos e preserva caminhos nativos para disco local. Exige o hash da revisão original antes de transformar a fonte. Não aplicar de novo sobre arquivo já corrigido.
- `Iniciar-Teste.ps1`: prompt da sessão e transcript; UTF-8 com BOM para Windows PowerShell 5.1 e saída UTF-8. Falha do Node não gera segunda exceção PowerShell redundante.
- `Ativar-Zelda.cmd`: muda a página de código para UTF-8, abre o iniciador e mantém a janela visível.

Tentativa real de referência: `runs/switch2-6X5rgy`. Diagnóstico do loader: `loader/logs/20261110T120305Z-switch2-6X5rgy.install.json`. Falha em `scanning SD mod metadata`, após aquisição/leitura nativa. `sd-scan.json` registrou sete entradas, resultado zero e liberação do runtime; não houve confirmação de instalação residente.

O coletor original usava `path.resolve('/ns2jb-modloader')` e `path.join` do Windows, procurando uma unidade/caminho do PC em vez das chaves POSIX da árvore SD. Esse bug foi reproduzido com inventário preenchido e corrigido. O pacote D já está atualizado; não substituir seu arquivo corrigido por uma cópia limpa do upstream sem reaplicar o patch.

Após iniciar operações nativas, o iniciador conserva `painel-operation.lock`: no sucesso a sessão está sendo entregue ao jogo e não deve receber outros módulos; na falha o wrapper também cria a marca de invalidação. Não remover esses arquivos para contornar o bloqueio. Mesmo que o diagnóstico upstream diga `requiresInspectionOrReboot: false`, o wrapper atual continua conservador após o início nativo.

### Procedimento do próximo teste

1. Reiniciar o console e iniciar uma **nova** sessão 4/4 com SmileBASIC aberto. A pasta antiga não serve para nova tentativa.
2. Caso ainda não estejam no SD, montar FTP com criação de arquivos novos e copiar `sd-card-root/ns2jb-modloader` do pacote para `/SD/`. Não colocar em Jogos, Nintendo nem duplicar o nível de pastas. Os bytes da ROM/main não mudaram na correção Windows; não é necessário recopiá-los se já estiverem corretos.
3. Desmontar FTP, mantendo o host 4/4. Usar **Abrir registros** para obter o caminho da sessão atual.
4. Executar `Ativar-Zelda.cmd`, informar esse caminho e aguardar `READY` e **PRONTO PARA TESTAR**.
5. Só após READY: **Encerrar conexão** no assistente, aguardar a limpeza e fechar SmileBASIC pelo HOME **sem reiniciar**. Abrir FireRed no perfil de teste com SD inserido. Os avisos genéricos de reinicialização não substituem essa entrega específica do loader.
6. Conferir ROM correta, entrada no jogo, salvar, fechar e reabrir. Registrar cada resultado separadamente. Para voltar a carregar o conteúdo original instalado, reiniciar o console; isso não reverte os saves.
7. Se houver falha, preservar logs do iniciador, `loader/logs`, `loader/state/<sessão>` e `runs/<sessão>`. Examinar a primeira fase com erro antes de modificar qualquer mecanismo.

O mesmo Title ID usa o destino de save do FireRed, incluindo `FireRed_e.sav`. O original tem 131.072 bytes; Zelda/EEPROM pode gravar outro tamanho. A restauração atual recusa diferença de tamanho. Por isso o roteiro usa perfil de teste separado e não promete reversão completa apenas por existir um backup.

Validação do iniciador manual em 14/11: **11 testes Node aprovados**, incluindo reprodução do erro original Windows, versão corrigida em Windows/POSIX e nomes remotos aninhados UTF-8. Após essa correção, abertura do Zelda foi confirmada no console. O save ainda não foi confirmado. O novo aplicativo separado está documentado em [MODS-GBA.md](MODS-GBA.md).

### Novo aplicativo separado: NS2 Mods GBA

Entrada solicitada: **.nup gerado pela ferramenta GBA**, não NRO. `Painel-Mods.cs` fornece a janela; `painel-mod-preparar.py` valida o NUP e extrai ROM/main; `painel-mods.cjs` verifica os segmentos NSO, detecta sessões, envia ao SD pelos adaptadores existentes e chama o loader corrigido. `Compilar-Mods.ps1` e `Empacotar-Mods.ps1` produzem um EXE separado numa pasta portátil, sem substituir o assistente principal.

O programa mantém o ID FireRed fixado, exige um pacote base, reutiliza arquivos idênticos por SHA, faz cópia no PC antes de sobrescrever mod diferente e recusa arquivos extras/patches globais. Depois de READY, a conexão é encerrada no assistente principal e SmileBASIC é fechado sem reiniciar. Não há encerramento forçado do host de outro processo. A nova automação ainda precisa ser testada no console.

Teste local real: NUP Zelda preparado com runtimes incluídos e PATH sem Node/Python externos; ROM e main extraídos com hashes correspondentes ao pacote manual. A preparação fica em `D:/Games/NS2ToolKit-mods/Preparados/`. A distribuição separada fica em `D:/Games/NS2ToolKit-mods/NS2-Mods-GBA-0.1.0-teste-*/`. O cache `.runtime/nup-python` apresentou acesso negado nesta sessão; os testes/build utilizaram o Python/compressor incluído no portátil 0.1.8 em D, sem alterar ACLs.

Referência da abertura bem-sucedida: sessão `switch2-RUQXgv`, registro de instalação `20261115T013415Z-switch2-RUQXgv.install.json`, estado `ready`, residente e protocolo do RO verificados. O horário UTC corresponde à noite de 14/11 em São Paulo. O host terminou como `disconnected`, com erro de limpeza FS; não afirmar limpeza final confirmada. A nova automação deve validar também o encerramento pelo assistente antes de fechar SmileBASIC. Não suprimir esse erro genericamente apenas porque o jogo abriu.

## 7. Armazenamento, privacidade e histórico

`runs`, `.runtime`, `experimentos`, `exports`, backups, saves e NUPs são excluídos do Git. Não incluir dumps, saves, logs brutos, memória capturada, identidades de usuário ou credenciais em commits/releases. Não compartilhar `runs` integralmente como se fossem apenas mensagens de texto.

Em 14/11 havia 30 pastas em `runs`, aproximadamente 383 MiB. Não existe retenção automática. Durante a execução, a sessão depende de sua pasta; mesmo encerrada, uma falha pode precisar de evidências. Nenhum run foi apagado nesta correção. Há tarefa no roadmap para mostrar uso de espaço e limpar sessões encerradas com proteção das ativas e dos incidentes.

David prefere arquivos grandes no **disco D**: o C tem pouco espaço e o D já apresentou desconexões quando ficou cheio. Antes de reconstruir NUP grande, conferir espaço e saídas existentes. Não criar cópias gigantes por conveniência nem apagar backups originais. Pedidos anteriores de substituir NUP específico não autorizam remover todos os NUPs.

Builds portáteis ficam em `D:/Games/NS2ToolKit-releases`. Não apagar versões ou diretórios externos como parte implícita de documentação/diagnóstico.

## 8. Desenvolvimento, testes e distribuição

Começar com leituras locais:

```powershell
git status --short
git log -5 --oneline
git branch -avv
git submodule status
```

Para o trabalho atual, sem console:

```powershell
node --test tools/mod-teste/iniciar.test.cjs tools/mod-teste/patch-loader.test.cjs
```

Os testes do patch usam o checkout original fixado em `.runtime/ns2jb-modloader-review`; se ausente, parte da suíte é marcada como não executada. Isso não equivale a aprovação completa. Um clone novo precisa obter essa revisão e conferir fontes/licenças. Não atualizar automaticamente para o upstream mais recente durante um diagnóstico.

Conferência do pacote D, sem conexão: executar `Iniciar-Teste.ps1 -Verificar` pelo Windows PowerShell, a partir da pasta do pacote. Essa verificação não instala o loader.

Outras suítes, conforme o componente alterado:

```powershell
node --test test.cjs painel.test.cjs painel-modules.test.cjs painel-mounts.test.cjs painel-restore.test.cjs painel-ftp.test.cjs painel-ftp-virtual.test.cjs
python test-painel-download.py
python test-painel-nup.py
python test-painel-ftp.py
python test-painel-ftp-virtual.py
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\Painel-NS2.ps1 -SelfTest
```

A geração NUP requer o compressor de `requirements-nup.txt`; o ambiente local de dependências fica em `.runtime/nup-python`. Testes automatizados/simulados e verificações pela janela não substituem teste no hardware. Alteração só de documentação exige conferência de conteúdo, links e checksums, não execução de toda a suíte.

Compilação da interface: `Compilar-Painel.ps1`. A fonte C# é combinada e compilada para `NS2 Assistente.exe`; esse executável também é rastreado. Não misturar fontes novos com executável antigo numa release.

Distribuição: `Empacotar-Portatil.ps1 -Offline -OutputRoot 'D:/Games/NS2ToolKit-releases'`, se o cache existir. O portátil inclui Node **22.16.0**, Python **3.13.4**, zstandard **0.25.0**, DLLs, fontes e licenças. Requer .NET Framework do Windows; não é um EXE único. O teste de empacotamento usa PATH sem Node/Python externos.

O empacotador coleta arquivos versionados: fontes novos não rastreados podem ficar de fora. Antes de uma publicação autorizada, conferir conteúdo Git, versão, executable, estado limpo, testes, metadados do pacote e créditos. `SHA256SUMS` descreve fontes; `PORTABLE-SHA256SUMS` descreve bytes da distribuição; `.zip.sha256` confere o ZIP. Ao atualizar `SHA256SUMS`, preservar entradas de dependências já existentes, em vez de substituir por uma lista incompleta.

## 9. Dependências fixadas e material de referência

| Componente | Revisão | Papel |
| --- | --- | --- |
| ns2jb, fork kurumuz | `81d5bb114c856109dadaf1077d927a9f297fe58d` | Base de host/cadeia original, com adaptações locais |
| OunceCake | `43dd500a10f7fef62a2c6d60b9f67851d3371dc6` | Inventário, montagem e exportação de jogos |
| ns2-savekit | `700814ff37fa8f11f12e77b65dc8a33d421e8dd1` | Biblioteca de atributos de saves; não importar todos os patches automaticamente |
| a55uka/nup | `d40d9cfa50792ba8021d2967d994d1b1c25d62b0` | Biblioteca do contêiner NUP, com ajustes no adaptador local |
| SebaaMG/ns2jb-modloader | `9395c91e9f5bb6c01df242fdbf7db194cf94b3c6` + patch local | Somente experimento RomFS/ExeFS, fora da release |

OunceCake/savekit/nup são submódulos. O loader experimental é uma cópia privada local com patch reproduzível. Não confundir esses modelos de dependência. Créditos/licenças do projeto estão no README e em `THIRD_PARTY_NOTICES.md`; preservar atribuições ao integrar qualquer código.

## 10. Próximos marcos e assuntos separados

**Pedido mais recente:** integrar kaiHEN no toolkit principal de backups/FTP, mantendo Mods GBA separado. Isso foi implementado em `Painel-Kaihen.cs`/`painel-kaihen.cjs`, com botão na `MainWindow`, host isolado em `integrations/kaihen/host` (kurumuz `28f03b5895e5569d8fbc35cbed84906b8f0a65b2`) e release oficial 20261114d verificada. `Preparar-Kaihen.ps1` confere ZIP e extração; `Empacotar-Portatil.ps1` inclui payloads/licenças e roda testes locais. Não há SDK instalado nem ativação de console executada. O teste deve validar HEN, hbmenu e OunceShell separadamente. Aguardar HEN iniciado e fechar SmileBASIC mantendo o host até a desconexão; não usar a ordem de encerramento do app GBA. Ver [KAIHEN.md](KAIHEN.md).

Build de teste preparada: `D:/Games/NS2ToolKit-releases/NS2ToolKit-v0.1.9-portatil-win-x64-20261114-235804-fe8d8b/`, com ZIP ao lado. Passaram 99 testes Node (89 anteriores + 10 kaiHEN), o self-test C#, o teste portátil NUP com PATH isolado, a verificação de hashes kaiHEN no portátil e os cenários simulados da janela. O engine original dos backups permaneceu sem diff. O próximo passo é o teste manual no console por essa build, sem confundir HEN iniciado com hbmenu/OunceShell abertos. Nenhuma nova release foi publicada.

Estudo novo, sem integração: [kaiHEN e ounce-devkit](ESTUDO-KAIHEN-OUNCE-DEVKIT.md). Checkouts privados em `.runtime/research/`, com kaiHEN `5ac7725`/tag 20261114d e SDK `0f38ba8`/tag devkit-20261115. O HEN foi projetado como ambiente residente por boot, ativado pela aquisição; após entrega, o launcher é aberto no console via jogo nativo com R, sem PC em cada abertura. Reabrir SmileBASIC não equivale a reativar após reboot. Integração, firmware e ciclo de encerramento ainda não foram testados no nosso ambiente. Não misturar o RO do HEN com o fluxo de mods GBA sem estudo de coexistência. A referência local da branch costela permanece preservada; sua mensagem de deploy não comprova transmissão/execução na revisão examinada.

1. **Agora:** validar o novo programa de mods no console. Abertura do Zelda já foi confirmada no fluxo manual; gravação/persistência do save é um marco separado.
2. Resolver a primeira falha reproduzível restante, se houver, sem alterar de uma vez aquisição, loader e empacotador. Registrar revisão, fase, limpeza e resultado.
3. O fluxo simples foi implementado em aplicativo separado para NUP GBA/FireRed. Ampliar formatos/jogos-base ou integrar ao assistente principal após validar essa automação. Mostrar o escopo RomFS/ExeFS e ausência de Control. Publicação exige tarefa própria e evidência de hardware.
4. Retomar validação da sobrescrita SD 0.1.8 com arquivo descartável, separada do modloader. Escrever um arquivo comum com sucesso não valida restauração de conteúdo instalado.
5. Desenvolver gestão de histórico `runs`; manter diagnósticos úteis e proteger sessões ativas.
6. Continuar compatibilidade de Z-A, montagens completas e cobertura NUP/DLC conforme roadmap, sem usar o sucesso de outro título como prova.

Pesquisas anteriores: Elliot completo PC versus Debut Demo Switch resultou em save reconhecido, mas mapa preto/conteúdo ausente no emulador. Não foi uma conversão de formato validada e não foi restaurado no console; consultar `ELLIOT-SAVES.md`. O estudo de port de TAE/NUP para Switch 1 está separado em `experimentos/tae-switch1`; reempacotar um NUP não converte automaticamente um jogo de Switch 2 para Switch 1.

## 11. Convenções para continuar o trabalho

- Escrever documentação de produto de forma direta e profissional, sem narrativa de conversa com IA. Nos registros técnicos, distinguir fato, hipótese e próximo teste.
- Manter a interface simples: escolher pasta/destino, acompanhar progresso e receber uma mensagem útil. Detalhes de IPC e caminhos internos pertencem ao diagnóstico.
- Evitar pedir confirmação repetida de trabalho já autorizado. Pedir informação apenas quando ela faltar e não puder ser encontrada nos arquivos.
- Preservar alterações existentes, a branch costela, os backups e os checkpoints. Não publicar ou executar contra hardware como efeito colateral de ler esta documentação.
- Separar: integridade do arquivo, montagem, ativação do loader, inicialização do jogo, funcionamento e persistência do save. São resultados diferentes.
- Após cada avanço relevante, atualizar este documento, o documento específico, o roadmap e seus checksums. Não marcar um resultado pendente como concluído para encerrar uma tarefa.

## 12. Documentos para aprofundar

- [Jogos modificados e caso Zelda](JOGOS-MODIFICADOS.md): comparação dos arquivos, limites, roteiro e correção Windows.
- [NS2 Mods GBA](MODS-GBA.md): processo completo que abriu o Zelda e novo programa portátil baseado em NUP.
- [FTP](FTP.md): permissões e sobrescrita experimental.
- [Saves](SAVES.md): formato, limites e restauração.
- [NUP](NUP.md) e [teste com pasta FTP](TESTE-NUP-PASTA-FTP.md): formatos aceitos e evidência.
- [Montagens](TESTE-MONTAGENS.md) e [incidentes](INCIDENTES.md): Split Fiction, Z-A e metadados.
- [Portátil](PORTATIL.md): dependências e processo de distribuição.
- [Roadmap](ROADMAP.md), [aprendizados](APRENDIZADOS.md) e [decisões](DECISOES.md): histórico; conferir datas dos estados antigos.
- [Índice](README.md) e [README principal](../README.md): visão de uso e créditos.

## Checkpoint de release 0.1.9 — 15/11/2026

A recuperação do save FireRed foi aprovada dentro do jogo. Abertura do hbmenu via modo kaiHEN também confirmada no console, com opção Netloader visível. Não inferir execução do OunceShell nem funcionamento do Netloader a partir dessa confirmação. A sessão de HEN não deve ser reaproveitada para backups, saves ou FTP. O pedido atual autoriza publicar main e release 0.1.9. A restauração aceita redimensionamento de arquivos existentes e arquivos locais editados de outro tamanho, com pré-backup e confirmação; não cria nem apaga arquivos. O pacote inclui fontes/licenças dos componentes kaiHEN verificadas por manifesto, sem dados de runs/backups. O aplicativo Mods GBA continua separado.

## Correcao e teste real da transicao 4/4 para kaiHEN — 15/11/2026

Sessao `switch2-okUzX3`: preflight recusava com "A prova nativa FS nao corresponde a conexao" porque esperava `restored` global no arquivo detalhado de execucao. O engine grava essa confirmacao em cada um dos dois trials. Corrigido `painel-kaihen-held.cjs` para exigir os dois trials verificados/restaurados e a mesma sessao, sem remover validacao de saude/capacidade/exclusividade. Fixture de teste ajustada ao formato real e regressao adicionada; 21 testes de kaihen/held/session aprovados.

A mesma sessao foi aproveitada sem nova aquisicao: preflight live aprovado, RO anterior PID 209 promovido para frontend kaiHEN PID 210, pacote remoto relido/verificado, bootstrap HEN PID 211 confirmado, gateRestorePending=false. David fechou SmileBASIC conforme orientado; host confirmou disconnected. Houve erro de limpeza do endpoint FS no host depois do fechamento, preservado em `result.json`/`painel-kaihen.json` (nao afirmar cleanup limpo). Abertura efetiva de hbmenu por R aguardando confirmacao; nao retomar backups/FTP nesta sessao.

HL3: build antiga 043b047 falhou por startup/bibliotecas Switch 1 puxados via sdl2.pc. Build corrigida 49b6629 passou gate OUN0 e mapa de linkagem; arquivo no D em NS2ToolKit-homebrew/Heroes-Lore-3-Switch2-49b6629. Ainda nao enviada apos reboot; aguardar hbmenu/Netloader. Historico e provas no repositorio isolado `.runtime/hl3-switch2`, branch codex/switch2-action.

Confirmacao posterior: David abriu o hbmenu com R apos a transicao usando a mesma sessao 4/4. Isso valida a ativacao/HOME/fechamento/takeover deste teste, mantendo o erro de cleanup registrado. Netloader confirmado em 192.168.18.139:28280 e build HL3 corrigida 49b6629 enviada com recebimento aceito; gameplay e ausencia do aviso aguardando retorno.

## Publicacao autorizada 0.1.10

Conexao unica 4/4 → kaiHEN → fechamento SmileBASIC → hbmenu foi aprovada. Correcao de prova FS por trial incluida. HL3 49b6629 tambem aprovado em console e publicado na release v1.0.8 do jogo; pipeline integrado a main do HL3. Toolkit 0.1.10 autorizado para main/release, com verificacao completa do portatil antes de publicar. O erro de cleanup apos desconexao permanece documentado; nao afirmar cleanup confirmado.

## Teste local 0.1.11 — kaiHEN 20261117.1 (21/11/2026)

Pedido: atualizar pacote kaiHEN e centralizar configuracao; gerar portatil de teste, sem publicar release ate aprovacao em console. Console permanece com hbmenu antigo aberto; nenhuma conexao ou escrita no console foi feita nesta etapa.

Fonte unica: `integrations/kaihen/kaihen-config.json`. `kaihen-config.cjs` valida descriptor, perfil, URLs e hashes; preparadores, aplicativo e empacotador consomem essa fonte. `Atualizar-Kaihen.ps1` coordena fontes, pacote e testes no checkout; portateis completos devem ser gerados novamente. Download temporario, extracao em pasta versionada nova, recusa de cache divergente e manifestos escritos por arquivo temporario. Perfil desconhecido e contrato de bootstrap diferente recusados; revisar host antes de aceitar futuros protocolos.

Payload oficial 20261117.1, SHA 3f7ded0b360b2f0bf97f8e958c3bfe93a8d76dd8d43ce2e8f7d060e647ad0978, commit 3695f364f9270686aa72cc39627bb1281752b2d3. Host Windows 28f03b5895e5569d8fbc35cbed84906b8f0a65b2 e patches preservados. Bootstrap/RO comparados com 20261114d: mudanca de polling para flag atomica, sem mudanca no contrato de entrada. Fontes SDK20261117: libounce39406be, OunceVK114e929, libkaihenddbf020; hbloader2d38bcb, hbmenu43845d2; revisoes/hashes completos no config.

Proximo passo: validar portatil local e fornecer caminho no D. Depois aguardar teste de David: reiniciar console, conectar 4/4 pelo novo portatil, ativar HEN e abrir hbmenu por R. Nao alterar BASIC NS2 salvo. Ver docs/ATUALIZAR-KAIHEN.md. Nao publicar, taguear ou substituir release 0.1.10 antes da confirmacao. Corrigir protocolos nao cobertos conforme evidencias, sem repetir operacoes nativas incertas.

## Aprovacao e publicacao 0.1.11 — 21/11/2026

David testou o portatil 0.1.11 com kaiHEN 20261117.1 e confirmou reconexao 4/4 e reativacao do hbmenu. Autorizou gerar a release. Codigo de ativacao/configuracao comparado com o ZIP de teste e identico; apenas documentacao de aprovacao e metadados de distribuicao sao finalizados. Nao inferir validacao individual de NROs, OunceShell ou novas APIs fsp-ldr a partir da abertura do menu.
