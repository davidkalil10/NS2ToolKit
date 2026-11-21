# Homebrew / kaiHEN no NS2ToolKit

**Versão 0.1.11 — kaiHEN 20261117.1.** A reconexão 4/4 pela tela inicial e a reativação do hbmenu com o pacote atualizado foram confirmadas no console em 21/11/2026. O fluxo guiado e as adaptações Windows foram preservados. Essa confirmação não substitui testes específicos de cada homebrew.

## Usar o novo modo

1. Extraia a pasta portátil completa e abra **NS2 Assistente.exe**.
2. Encerre qualquer sessão anterior e reinicie o console antes deste teste. Mantenha o SD inserido e abra SmileBASIC na memória interna, modo Direct.
3. Confira o endereço Ethernet do PC na janela principal, mantenha **Manter conexão aberta após 4/4** marcado e clique em **Iniciar conexão**. Execute LOAD NS2, RUN, REMOVE e START uma única vez, conforme as instruções da tela inicial. O bootstrap salvo continua sendo o mesmo.
4. Aguarde **4/4 confirmado** e conclua/desmonte qualquer transferência FTP ou backup. Clique em **Ativar Homebrew** e depois **Iniciar kaiHEN**. A janela usa a conexão existente; não repete os quatro comandos nem abre uma nova aquisição. Enquanto aguarda a ativação, mantenha SmileBASIC aberto.
5. Aguarde **kaiHEN iniciado**. Só então feche SmileBASIC normalmente pelo HOME, **sem reiniciar o console**. Mantenha a janela e o PC executando até ela confirmar o fechamento.
6. Abra um **jogo nativo de Switch 2 segurando R**. Split Fiction é um candidato entre os títulos já identificados neste projeto, sem garantia de compatibilidade até o teste. O HEN examinado seleciona IDs no espaço 04; um título Switch 1 não substitui esse primeiro teste.
7. Se o jogo abrir normalmente na primeira vez, feche-o e abra novamente segurando R. O primeiro lançamento pode ser usado para guardar a política necessária. Nas próximas aberturas, deve aparecer o hbmenu.
8. No hbmenu, escolha **OunceShell**. Confira a abertura, imagem, controles, navegação no SD e saída. A primeira verificação é de leitura; não é preciso escrever arquivos ou usar o FTP do OunceShell.

**A ordem após a ativação é própria:** aguardar o HEN e depois fechar SmileBASIC, mantendo o host até a desconexão. Não encerrar a conexão pelo PC nessa etapa nem usar o procedimento do aplicativo GBA. A janela mantém as mensagens de status, confirma o encerramento observado pelo host e só então apresenta a orientação para abrir o hbmenu.

Uma conexão aberta antes desta build não anuncia a capacidade de transição. Nesse caso, o aplicativo recusa a ativação antes de modificar o console e explica que é preciso reiniciar e conectar pela versão nova. Não basta trocar os arquivos do programa com uma sessão antiga aberta.

Na release pública 0.1.9, o modo ainda usa aquisição própria na janela Homebrew / kaiHEN. A partir da 0.1.10, a conexão única é o fluxo validado.

## O que vem incluído

Release oficial **kaiHEN 20261117.1**: RO, HEN, bootstrap, hbloader, hbmenu e OunceShell. O ZIP foi baixado e conferido pelo SHA-256 publicado:

```text
3f7ded0b360b2f0bf97f8e958c3bfe93a8d76dd8d43ce2e8f7d060e647ad0978
```

O host foi obtido do fork kurumuz/ns2jb, revisão `28f03b5895e5569d8fbc35cbed84906b8f0a65b2`, que já implementa `hen.cjs` e `start-hen.cjs`. Fica em `integrations/kaihen/host/`, separado do engine original dos backups. Adaptações locais: named pipe Windows já usado pelo toolkit, substituição atômica de relatórios e diretório de sessões do aplicativo.

O controlador `painel-kaihen.cjs` usa o host como módulo, seleciona o RO do pacote e chama o inicializador real. `Painel-Kaihen.cs` implementa a janela acessada pelo botão do assistente principal. A branch costela foi preservada; não foi feito merge de um deploy sem implementação nativa.

Na conexão única, `painel-kaihen-held.cjs` verifica a sessão FS e sua prova nativa, obtém a trava compartilhada com os outros módulos e confere a capacidade `kaihen-transition-v1`. A aquisição FS normal permanece com a sequência anterior; foram incorporados ao seu controlador apenas os comandos de arquivos/pacotes do fork kaiHEN e o anúncio dessa capacidade. A transição cria cópia privada dos clientes do fork e dos registros correspondentes, sem sobrescrever o código do endpoint ativo. Prepara o novo RO, confere o pacote por releitura, requalifica o gate, identifica por PID o RO anterior e o substitui pelo frontend kaiHEN. Depois segue o mesmo bootstrap e a mesma verificação nativa de HEN. A sessão de backups é marcada como exclusiva antes da mutação e continua bloqueada até reiniciar. Erros nativos não são repetidos automaticamente.

Não é preciso instalar ounce-devkit, compiladores ou Docker para testar o pacote pré-compilado. Essas ferramentas serão necessárias na frente de adaptação dos ports.

## Estados e provas

- Chegar à etapa 4/4 não significa HEN iniciado.
- A interface exige frontend RO verificado, resultado nativo de bootstrap concluído, thread reunida, sessão/PID correspondentes e restauração de canal/gate confirmada ou recibo pendente explicitamente transferido ao HEN, conforme o protocolo upstream.
- **kaiHEN iniciado** confirma a inicialização documentada, não a abertura do hbmenu ou do OunceShell. A abertura do hbmenu já foi confirmada no console; a do OunceShell continua pendente.
- Após a entrega, o host permanece até SmileBASIC fechar. Uma desconexão esperada é registrada separadamente da prova de HEN. Erros do host e de cleanup não são apagados nem convertidos em “limpeza confirmada”.
- A sessão é exclusiva: recebe marca e trava para impedir uso pelos módulos de backup, FTP e mods. Não apagar essas marcas para tentar reaproveitá-la.
- Cancelar é permitido apenas enquanto o host aguarda a conexão. Depois de conectado, aguarde a operação; se houver falha, siga a orientação de fechamento/reinicialização e preserve os registros.

Os relatórios ficam em `runs/switch2-*`, incluindo `switch2/ro/hen-startup.json`, `painel-kaihen.json` e o log da janela. O relatório mantém `launcherOpened: false` e `homebrewOpened: false`, pois a interface não observa automaticamente o console. A confirmação recebida durante o teste deve ser registrada à parte.

## Persistência e convivência

Depois da entrega, o HEN executa no console durante aquela inicialização. Não é preciso chamar o PC para cada NRO. Fechar/reabrir SmileBASIC não equivale a reiniciar o console. Ao reiniciar ou desligar completamente, é necessário ativar novamente; os arquivos no SD podem permanecer.

Esse modo não instala homebrew como ícone permanente no HOME e não converte NUP em NRO. Não foi validada a coexistência com o loader dos mods GBA; iniciar os modos em boots separados. Para voltar a usar backups/FTP pelo fluxo original, reinicie e abra uma nova sessão normal.

O iniciador prepara/substitui arquivos de ambiente em `/hbmenu.nro`, `/kaihen/bin/` e `/switch/ounceshell/ounceshell.nro`, além dos arquivos de estado do HEN. Isso não é restauração de jogo nem save. O backend nativo tem acesso amplo; manter os testes iniciais em homebrew conhecido e operações de leitura.

## Limitações conhecidas dos projetos de origem

- A primeira abertura com R pode executar o jogo normalmente para capturar a política; a segunda é o teste do launcher.
- A release do OunceShell registra problema de listagem com nomes não ASCII. Não substituir nosso FTP nem concluir perda de arquivos por essa listagem.
- Há relatos externos de `textInit() failed: 2345-0011` no hbmenu e de falha de takeover em determinadas configurações de SD. São relatos, não uma causa demonstrada no nosso aparelho. Registrar fase, título usado, mídia e logs antes de alterar o ambiente.
- Um NRO de Switch 1 não recebe garantia de compatibilidade apenas por aparecer no menu. O caminho para os ports próprios é recompilar/adaptar com ounce-devkit, depois de validar este ambiente.

## Desenvolvimento

`Preparar-Kaihen.ps1 -Offline` confere o ZIP em `.runtime/kaihen-cache`, compara os arquivos extraídos e gera o manifesto de integridade. Sem `-Offline`, pode baixar a release fixada. O pacote portátil copia esses arquivos e suas licenças; não obtém “latest” durante o uso.

`painel-kaihen.test.cjs` cobre prova nativa, estágios, falhas, ciclo de fechamento e integridade sem abrir conexão com o console. `Testar-Kaihen.ps1` usa workers simulados para validar a janela e a presença do botão no toolkit principal. Eles não demonstram funcionamento do HEN no hardware.

Referências: [kaiHEN 20261114d](https://github.com/ouncebrew/kaihen/releases/tag/20261114d), [host ns2jb fixado](https://gitlab.com/kurumuz/ns2jb/-/tree/28f03b5895e5569d8fbc35cbed84906b8f0a65b2), [estudo dos projetos](ESTUDO-KAIHEN-OUNCE-DEVKIT.md).

## Netloader

A opção Netloader do hbmenu recebe um arquivo homebrew do PC pela rede e prepara sua execução. O cliente usual é `nxlink`; é útil para testar novas compilações sem copiar o arquivo manualmente para o SD. A conexão é diretamente com o console, independente da ponte FTP do NS2ToolKit. Não converte formatos e não adapta NROs de Switch 1: o executável precisa ser compatível com o ambiente Switch 2.

O código da revisão incluída implementa o receptor em `common/netloader.c`. Transferência e execução dos ports recompilados Heroes Lore Zero, Wind of Soltia, Heroes Lore 2 e Heroes Lore 3 foram confirmadas no console. O toolkit não inclui um botão de envio de homebrew; os testes usaram um cliente externo. Referência: [receptor da versão incluída](https://github.com/ouncebrew/ounce-hbmenu/blob/d7e10c028b53da17867615ee0a3c453b9cf9464a/common/netloader.c).

## Correcao da prova FS na transicao 4/4 (15/11/2026)

O arquivo detalhado `fs-execution-*.json` confirma restauracao por tentativa em `trials[i].restored`; ele nao possui `restored` global. O resumo `fs-execution-current.json` possui esse campo global. A preflight do modo de sessao mantida deve validar os dois trials detalhados como `verified === true` e `restored === true`, alem da identidade da sessao, em vez de exigir o campo global no arquivo detalhado. A validacao anterior bloqueava uma conexao 4/4 saudavel antes de qualquer mutacao com a mensagem "A prova nativa FS nao corresponde a conexao". A correcao mantem os checks de saude, capacidades do endpoint e exclusividade. Teste de regressao cobre prova realista sem `restored` global e rejeita trials incompletos ou nao restaurados.

## Atualizacoes do pacote

Versao, URL, SHA-256, revisoes, fontes e perfil de compatibilidade ficam em `integrations/kaihen/kaihen-config.json`. O aplicativo mostra a versao dessa configuracao e recusa manifesto que nao corresponda a ela. Consulte [manutencao e roteiro de teste](ATUALIZAR-KAIHEN.md). Preparar os arquivos no PC nao atualiza o HEN que ja esta rodando: reinicie o console e ative novamente para testar o novo pacote. O programa NS2 salvo no SmileBASIC continua o mesmo nesta atualizacao.
