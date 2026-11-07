# Backup e restauração de saves

**Estado:** backup validado no console em 6 de novembro de 2026. Restauração adicionada na build de teste 0.1.5, com testes locais; escrita no console ainda pendente de validação. A release pública 0.1.4 oferece apenas backup.

## Como usar

1. Feche a versão anterior do painel e abra o executável atualizado.
2. Inicie uma sessão nova, com **Manter conexão aberta após 4/4** ativado.
3. Após confirmar 4/4, clique em **Backup de saves** e depois **Listar saves**.
4. Escolha um item conferindo jogo, identificador do usuário e tipo. Jogos sem nome disponível aparecem pelo identificador.
5. Escolha uma pasta no PC, clique em **Fazer backup** e aguarde a confirmação final, depois da limpeza.

Não é necessário informar o IP do Switch neste módulo. O programa `NS2` salvo no SmileBASIC não precisa ser redigitado.

O destino padrão `saves-backups/` é excluído do Git. Para destinos personalizados, prefira uma pasta fora do repositório: saves e inventários pessoais não devem ser publicados.

## Escopo

- Somente leitura: não cria, substitui, remove ou faz commit de arquivos de save no console.
- Espaço User (1), tipos Account (1) e Device (3). Outros tipos e espaços ficam fora desta primeira versão.
- Abertura de um save por identidade, sem varrer combinações de usuários.
- Cada tentativa cria uma pasta **Nome do jogo [ID]**, com sufixos `(2)`, `(3)` em repetições, sem sobrescrever outro backup. Contém arquivos em `data/`, parciais em `.partial/` e identidade no manifesto.
- Nomes incompatíveis com Windows são codificados; o manifesto preserva a relação entre caminho original e local.
- O save do próprio aplicativo que hospeda o exploit pode estar ocupado e não abrir.

## Verificação

A leitura usa as rotinas existentes do mecanismo, que conferem cada bloco com hash calculado no console. O copiador também calcula SHA-256 e relê o arquivo no PC. Ao final, confere novamente estrutura e tamanhos anunciados.

`dataVerified: true` confirma essas verificações. `complete: true` só é gravado depois do encerramento confirmado dos recursos auxiliares. Isso não é um teste de restauração nem uma promessa de snapshot atômico diante de outros escritores.

Falhas preservam arquivos recebidos e deixam o manifesto incompleto. Uma operação incerta bloqueia novas operações pelo painel naquela sessão, até reiniciar o console e criar uma sessão nova.

## Integração

Referência: [ns2-savekit](https://github.com/dougchansan/ns2-savekit), revisão `700814ff37fa8f11f12e77b65dc8a33d421e8dd1`, licença MIT preservada no submódulo. Utilizamos a biblioteca de atributos de save e o formato de inventário documentado pelo projeto.

Não foram aplicados os patches de escrita, enumeração de contas ou aquisição do FS desse projeto. O usuário vem do inventário de saves. Os arquivos do mecanismo em `engine/` permanecem iguais aos do checkpoint funcional.

O adaptador experimental de restauração usa os comandos já disponíveis para abrir arquivos existentes em leitura/escrita, enviar blocos, flush e commit. Não cria arquivos nem depende dos patches de criação/descritores adicionais do ns2-savekit. O mecanismo de aquisição e os submódulos permanecem inalterados.

## Restaurar na build de teste 0.1.5

1. Com a sessão 4/4 mantida aberta e o jogo fechado, abra **Backup de saves → Restaurar save**.
2. Escolha a pasta do backup do assistente ou sua subpasta `data`. Leia os destinos do console e confira o jogo e usuário selecionados.
3. Clique em **Restaurar save**. O assistente confere a pasta, preserva os arquivos preparados e cria um pré-backup completo do estado atual do console.
4. Confira a confirmação com o destino e os arquivos que serão substituídos. A escrita só começa após **Sim**.

Quando arquivos do backup foram editados, somente os arquivos cujo hash difere do manifesto original são preparados. Se não há edições, são preparados todos os arquivos desse backup, permitindo devolver uma versão anterior. O manifesto original não é reescrito nem recebe hashes novos para ocultar edições.

Pré-backups, plano, cópias dos arquivos e relatório ficam em `restauracoes`, ao lado da pasta de origem. A seleção de `data` é normalizada para a pasta que contém `manifest.json`. O programa exige o mesmo jogo, usuário, tipo, índice, rank e identificador de arquivo de save; não retargeta identidades entre usuários ou títulos.

### Escopo e confirmação de sucesso

- Substituição de arquivos existentes, com o mesmo tamanho da origem. Sem criação, remoção, redimensionamento ou alteração de diretórios.
- Até 256 arquivos, 16 MiB por arquivo e 64 MiB no conjunto.
- O plano confirma os hashes do pré-backup e dos arquivos preparados; mudanças posteriores no save do console exigem nova preparação.
- Confere o envio de cada bloco com hash no console, descarrega os arquivos, verifica a árvore, faz um único commit, reabre o save em leitura e confere novamente todos os arquivos, inclusive os que não foram substituídos.
- Sucesso só é apresentado depois de commit, releitura e limpeza confirmados. Isso confirma os bytes persistidos; a aceitação pelo jogo precisa de teste separado.
- Pode cancelar antes da primeira escrita. Depois que ela começa, o programa termina commit/verificação em vez de interromper a transação. Não encerre a conexão ou o aplicativo nessa etapa.
- Erro após início de escrita ou commit exige inspeção e sessão nova. Não existe promessa de rollback automático: o pré-backup é preservado, e chamadas incertas não são repetidas.

### Primeiro caso: FireRed

O backup de referência contém `FireRed_e.sav` (131.072 bytes) e `transaction.sav` (1.024 bytes). Somente o primeiro foi editado; o fluxo prepara sua substituição e mantém o segundo conforme o estado atual do console. Uma cópia verificada do conjunto editado foi preservada antes do desenvolvimento.

Testes simulados cobrem integridade dos planos, identidade de destino, mudanças no console, erro de escrita sem repetição, falha de commit, divergência de releitura, cancelamento e limpeza. A interface real foi testada com leitura local desse backup, sem iniciar conexão ou escrita no console.

## Cobertura de validação

O fluxo de backup foi concluído em console real em 6 de novembro de 2026. A identidade e os hashes permanecem no manifesto privado do backup. A validação não cobre restauração.

Testes adicionais:
- Validar separadamente Account e Device.
- Confirmar limpeza e saúde da sessão após a leitura.
- Validar a restauração experimental com teste de ida e volta e aceitação do save no jogo.
