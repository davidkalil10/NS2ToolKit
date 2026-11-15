# Host kaiHEN isolado

Snapshot do fork kurumuz/ns2jb, revisão `28f03b5895e5569d8fbc35cbed84906b8f0a65b2`. O README de origem está preservado em `host/README.md`. O engine original na raiz do NS2ToolKit permanece separado.

Patches locais: endpoint Windows named pipe, escrita atômica de relatórios (`atomic-file.cjs`) e `NS2_WORKSPACE` para manter as sessões em `runs` do aplicativo. `painel-kaihen.cjs` coordena o host real; não usa a mensagem de deploy da branch de testes como prova de execução.

Payloads da release oficial kaiHEN 20261114d ficam no cache privado durante o desenvolvimento e em `payload/` no pacote portátil. `Preparar-Kaihen.ps1` verifica o ZIP e o conteúdo extraído antes de gerar `runtime-manifest.json`. Binários não são baixados durante a ativação. Fontes kaiHEN e licenças acompanham a build; preservar as atribuições dos demais componentes indicados na release.

Este modo tem lifecycle próprio: após HEN confirmado, fechar SmileBASIC mantendo o host até a desconexão. Não aplicar o encerramento do modo de backups ao estágio de inicialização do HEN. Detalhes em `docs/KAIHEN.md`.
