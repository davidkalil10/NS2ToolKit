# Homebrew / kaiHEN no NS2ToolKit

**Versão 0.1.9 — integração na janela principal de backups, saves e FTP.** O aplicativo Mods GBA continua separado. A ativação e a abertura do hbmenu foram confirmadas no console em 15/11/2026. Execução do OunceShell, de outros homebrews e transferências por Netloader ainda precisam de validação própria.

## Usar o novo modo

1. Extraia a pasta portátil completa e abra **NS2 Assistente.exe**.
2. Encerre qualquer sessão anterior e reinicie o console antes deste teste. Mantenha o SD inserido e abra SmileBASIC na memória interna, modo Direct.
3. Confira o endereço Ethernet do PC na janela principal e clique em **Homebrew / kaiHEN**. Não inicie antes a conexão de backup: este modo abre sua própria aquisição.
4. Marque a confirmação e clique em **Iniciar kaiHEN**. Quando o PC estiver pronto, execute as quatro linhas exibidas: LOAD NS2, RUN, REMOVE e START. O bootstrap NS2 já usado pelo toolkit é o mesmo; não é preciso redigitá-lo.
5. Aguarde **kaiHEN iniciado**. Só então feche SmileBASIC normalmente pelo HOME, **sem reiniciar o console**. Mantenha a janela e o PC executando até ela confirmar o fechamento.
6. Abra um **jogo nativo de Switch 2 segurando R**. Split Fiction é um candidato entre os títulos já identificados neste projeto, sem garantia de compatibilidade até o teste. O HEN examinado seleciona IDs no espaço 04; um título Switch 1 não substitui esse primeiro teste.
7. Se o jogo abrir normalmente na primeira vez, feche-o e abra novamente segurando R. O primeiro lançamento pode ser usado para guardar a política necessária. Nas próximas aberturas, deve aparecer o hbmenu.
8. No hbmenu, escolha **OunceShell**. Confira a abertura, imagem, controles, navegação no SD e saída. A primeira verificação é de leitura; não é preciso escrever arquivos ou usar o FTP do OunceShell.

**A ordem deste modo é própria:** aguardar o HEN e depois fechar SmileBASIC, mantendo o host até a desconexão. Não usar como atalho o encerramento do host do modo de backups ou o procedimento do aplicativo GBA.

## O que vem incluído

Release oficial **kaiHEN 20261114d**: RO, HEN, bootstrap, hbloader, hbmenu e OunceShell. O ZIP foi baixado e conferido pelo SHA-256 publicado:

```text
9d0d1a7c6d91d018576121a9513f691ff397883a58090b585f0384965144f38f
```

O host foi obtido do fork kurumuz/ns2jb, revisão `28f03b5895e5569d8fbc35cbed84906b8f0a65b2`, que já implementa `hen.cjs` e `start-hen.cjs`. Fica em `integrations/kaihen/host/`, separado do engine original dos backups. Adaptações locais: named pipe Windows já usado pelo toolkit, substituição atômica de relatórios e diretório de sessões do aplicativo.

O controlador `painel-kaihen.cjs` usa o host como módulo, seleciona o RO do pacote e chama o inicializador real. `Painel-Kaihen.cs` implementa a janela acessada pelo botão do assistente principal. A branch costela foi preservada; não foi feito merge de um deploy sem implementação nativa.

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

O código da revisão incluída implementa o receptor em `common/netloader.c`. A presença da opção no menu foi confirmada; o envio/lançamento pelo Netloader ainda não foi testado nesta configuração. O toolkit 0.1.9 não inclui um cliente nxlink nem um botão de envio de homebrew. Referência: [receptor da versão incluída](https://github.com/ouncebrew/ounce-hbmenu/blob/d7e10c028b53da17867615ee0a3c453b9cf9464a/common/netloader.c).
