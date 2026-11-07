# Elliot — compatibilidade de saves entre PC e Switch

## Estado em 7 de novembro de 2026

**Análise inicial concluída; teste no emulador pendente. Conversão de progresso e restauração no console ainda não validadas.** O caso disponível compara o jogo completo no PC com a **Debut Demo** no Switch (`0400CAA023DB0000`), não com a versão completa de Switch.

Antes da análise, foram criadas cópias separadas dos dois conjuntos, verificadas por SHA-256. Os arquivos de save e seus manifestos com identidades de usuário permanecem fora do repositório.

## Arquivos observados

| Origem | Arquivos | Cabeçalho |
| --- | --- | --- |
| PC completo | `Game0.sav`, `Game1.sav`, `Game2.sav`, `System.sav` | `SaveDataVer`, seguido de byte `01` |
| Switch Debut Demo | `Game0`, `System` | `SaveDataVer`, seguido de byte `01` |
| Switch Debut Demo | `EnhancedInputUserSettings` | `GVAS` |

O cabeçalho compartilhado indica relação entre os formatos, mas não comprova compatibilidade de conteúdo. Existem diferenças adicionais de bytes no início dos arquivos; o `Game0` de PC tem aproximadamente 2,17 MB, enquanto o da demo tem aproximadamente 192 kB. Esses dados não permitem separar diferenças de progresso, versão do jogo e plataforma.

## Experimento preparado

Foi criado um pacote separado para teste manual na demo do emulador:

- `Game0.sav` do PC copiado como `Game0`.
- `System.sav` do PC copiado como `System`.
- `EnhancedInputUserSettings` preservado da referência de Switch.

Nenhum byte desses arquivos foi transformado. Os demais slots de PC permanecem na cópia preservada. O relatório identifica a origem completa e o destino demo, marca a conversão como não validada e não permite restauração no console. O pacote não utiliza o formato de manifesto de backup do assistente.

Antes de instalar os arquivos no emulador, é necessário preservar sua pasta de save atual e fechar o jogo. O teste deve conferir carregamento, local, progresso e inventário; ausência de mensagem de erro não basta. Em recusa ou travamento, restaurar a cópia anterior. A demo pode não conter mapas, dados ou lógica usados pelo progresso completo; mudar o nome do arquivo não remove essa diferença.

## Próximas etapas

1. Validar ou rejeitar o experimento no emulador com registro do resultado.
2. Se a demo rejeitar os dados, comparar com um save da versão completa de Switch antes de atribuir a falha ao formato da plataforma. Não fabricar um save compatível por alteração arbitrária dos campos.
3. Só após um candidato carregável, avançar ao fluxo de restauração no console: plano de arquivos e identidade, pré-backup do estado atual, confirmação concreta, escrita com commit e verificação por releitura.

A revisão inicial do ns2-savekit mostra que a escrita depende de descritores IPC adicionais. A integração deve adaptar somente os recursos necessários, preservando o mecanismo de aquisição já validado; não aplicar o conjunto inteiro de patches de aquisição para habilitar essa funcionalidade.
