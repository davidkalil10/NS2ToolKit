# Aprendizados

Atualizado em 5 de novembro de 2026.

## Preparo do SmileBASIC

**Observado localmente:** a digitação automática perdeu algumas quebras de linha. `NEXT without FOR` foi resolvido separando os comandos no editor; depois apareceu `DIST BOOT READY 1015`.

**Conclusão:** salvar e carregar um arquivo não comprova que ele foi digitado corretamente. A mensagem de bootstrap e as verificações do PC são etapas diferentes da validação.

## Armazenamento e rede

**Observado localmente:** SmileBASIC estava inicialmente no microSD Express. Foi movido para a memória interna. PC e console usam Ethernet.

**Documentado:** esses são requisitos da [base ns2jb utilizada](NS2JB-UPSTREAM.md). Eles não garantem que toda aquisição do FS passe.

## Windows e o painel

**Observado localmente:** foram necessários caminhos temporários adequados ao Windows, named pipes e tolerância limitada a bloqueios transitórios de renomeação de relatórios.

Falhas na etapa 2 ocorreram tanto pelo painel quanto diretamente com `node run.cjs --rpc`. Isso afasta a janela como causa exclusiva. Não demonstra que todas as diferenças entre hosts ou sistemas operacionais sejam irrelevantes.

## Aquisição do FS

Uma tentativa com operação nativa pendente não pode ser tratada como uma tentativa limpa. O supervisor foi ajustado para parar quando a limpeza não é confirmada e preservar o primeiro erro.

**Observado localmente:** reiniciar, abrir outro jogo por aproximadamente 10 segundos, fechá-lo e abrir SmileBASIC antecedeu uma execução bem-sucedida. **Não comprovado:** que essa rotina tenha causado o sucesso ou aumente a taxa de acerto.

## O que 4/4 comprova

O [checkpoint](CHECKPOINT-2026-11-05.md) confirmou os desafios executados pelo ns2jb e uma sessão RPC mantida aberta. Isso não é uma certificação de todos os jogos, versões de conteúdo, saves ou ferramentas futuras.

O texto exibido no console pode permanecer após a conexão falhar. O estado deve ser decidido pelos resultados e pela saúde da sessão no PC.

## Backup de jogos

**Observado localmente:** houve cópias concluídas tanto no teste inicial de aproximadamente 35 MB quanto numa transferência posterior de aproximadamente 1,83 GB. Houve também falhas de preparação de conteúdo, antes de iniciar o copiador.

**Conclusão:** tamanho do jogo não explica sozinho o conjunto de resultados. É necessário separar descoberta, montagem do conteúdo, indexação, início do FTP, transferência e limpeza.

O manifesto confirma que os arquivos anunciados foram recebidos com os tamanhos esperados; os hashes são locais. Não há hash remoto para comparação independente, nem confirmação de que toda combinação de conteúdo instalado foi exposta.

## Funcionalidades possíveis não equivalem a módulos integrados

- O [HBLauncher](https://github.com/ravensclawx/HBLauncher) fornece um ambiente próprio de aplicativos. Sua presença em vídeos não comprova que um binário de outro ambiente seja compatível.
- O [ns2-savekit](https://github.com/dougchansan/ns2-savekit) oferece uma base de leitura e escrita de saves, mas requer adaptação ao mecanismo utilizado aqui e validação por operação.
- O servidor do OunceCake rejeita comandos de escrita. Adicionar um botão FTP não concede acesso de gravação ao armazenamento inteiro.

Esses pontos orientam o [roadmap](ROADMAP.md); eles não anunciam funções já presentes no executável.
