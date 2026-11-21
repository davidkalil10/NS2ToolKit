# Host kaiHEN isolado

Snapshot do fork kurumuz/ns2jb, revisão `28f03b5895e5569d8fbc35cbed84906b8f0a65b2`. O README de origem está preservado em `host/README.md`. O engine original na raiz do NS2ToolKit permanece separado.

Patches locais: endpoint Windows named pipe, escrita atômica de relatórios (`atomic-file.cjs`) e `NS2_WORKSPACE` para manter as sessões em `runs` do aplicativo. `painel-kaihen.cjs` coordena o host real; não usa a mensagem de deploy da branch de testes como prova de execução.

Na versão 0.1.10, `test-gate.cjs` exporta `main` para chamada aguardada sem executar uma operação nativa no import. O adaptador `package.cjs` foi incorporado também ao endpoint FS original, junto de seu encaminhamento explícito e anúncio de capacidade. `painel-kaihen-held.cjs` usa esses comandos para a transição de uma conexão 4/4 já aberta. Os clientes do host e provas são copiados para uma pasta privada da sessão; o endpoint ativo não é sobrescrito. A transição pela conexão mantida e a abertura do hbmenu foram confirmadas no console em 15/11/2026.

Payloads da release oficial kaiHEN 20261114d ficam no cache privado durante o desenvolvimento e em `payload/` no pacote portátil. `Preparar-Kaihen.ps1` verifica o ZIP e o conteúdo extraído antes de gerar `runtime-manifest.json`. Binários não são baixados durante a ativação. Fontes kaiHEN e licenças acompanham a build; preservar as atribuições dos demais componentes indicados na release.

Este modo tem lifecycle próprio: após HEN confirmado, fechar SmileBASIC mantendo o host até a desconexão. Não aplicar o encerramento do modo de backups ao estágio de inicialização do HEN. Detalhes em `docs/KAIHEN.md`.

## Configuracao central na versao 0.1.11

`kaihen-config.json` e a fonte de versao, URL, hashes, revisoes e lista de fontes. Os manifestos sao gerados a partir dela. O payload agora e kaiHEN 20261117.1; o host Windows permanece fixado em 28f03b5895e5569d8fbc35cbed84906b8f0a65b2 com os patches existentes. Bootstrap e RO foram comparados com 20261114d: contrato de entrada mantido, alteracao no polling de conclusao do lancamento. Reconexao 4/4 e reativacao do hbmenu foram confirmadas no console em 21/11/2026.
