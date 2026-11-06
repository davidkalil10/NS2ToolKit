# Backup de saves — primeira implementação

**Estado:** integrado e testado com sessões simuladas; validação no console pendente. Restauração ainda não está disponível.

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
- Cada tentativa cria uma pasta nova, com arquivos em `data/`, parciais em `.partial/` e identidade no manifesto.
- Nomes incompatíveis com Windows são codificados; o manifesto preserva a relação entre caminho original e local.
- O save do próprio aplicativo que hospeda o exploit pode estar ocupado e não abrir.

## Verificação

A leitura usa as rotinas existentes do mecanismo, que conferem cada bloco com hash calculado no console. O copiador também calcula SHA-256 e relê o arquivo no PC. Ao final, confere novamente estrutura e tamanhos anunciados.

`dataVerified: true` confirma essas verificações. `complete: true` só é gravado depois do encerramento confirmado dos recursos auxiliares. Isso não é um teste de restauração nem uma promessa de snapshot atômico diante de outros escritores.

Falhas preservam arquivos recebidos e deixam o manifesto incompleto. Uma operação incerta bloqueia novas operações pelo painel naquela sessão, até reiniciar o console e criar uma sessão nova.

## Integração

Referência: [ns2-savekit](https://github.com/dougchansan/ns2-savekit), revisão `700814ff37fa8f11f12e77b65dc8a33d421e8dd1`, licença MIT preservada no submódulo. Utilizamos a biblioteca de atributos de save e o formato de inventário documentado pelo projeto.

Não foram aplicados os patches de escrita, enumeração de contas ou aquisição do FS desse projeto. O usuário vem do inventário de saves. Os arquivos do mecanismo em `engine/` permanecem iguais aos do checkpoint funcional.

## Validação pendente

- Conferir a identificação de um save conhecido na lista real.
- Copiar um save pequeno e comparar estrutura e manifesto.
- Validar separadamente Account e Device.
- Confirmar limpeza e saúde da sessão após a leitura.
- Só depois planejar restauração e seu teste de ida e volta.
