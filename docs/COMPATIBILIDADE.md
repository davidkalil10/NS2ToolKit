# Compatibilidade e possibilidades

Atualização de 15 de novembro de 2026. **Documentado por um projeto externo** não significa **validado no NS2ToolKit**. O histórico de HBLauncher abaixo registra a pesquisa inicial; a frente atual é [kaiHEN e ounce-devkit](ESTUDO-KAIHEN-OUNCE-DEVKIT.md), com [modo kaiHEN integrado](KAIHEN.md).

| Função | Situação no NS2ToolKit |
| --- | --- |
| ns2jb 4/4 e RPC mantido | Validado na configuração do checkpoint |
| Backup de arquivos de jogos | Validado em alguns casos; falhas conhecidas de preparação de conteúdo |
| Backup de saves | Somente leitura; backup concluído em console real em 06/11/2026 |
| Restauração de saves | Integrada, com pré-backup, commit e releitura; validada no FireRed, incluindo recuperação de 8 KiB para 128 KiB com carregamento confirmado no jogo |
| FTP para navegação externa | Integrado; SD/USER e vistas Jogos/Saves, com limites próprios de escrita |
| Homebrew / kaiHEN | Na 0.1.10, ativa pela conexão 4/4 mantida; hbmenu e Netloader com ports recompilados validados no console. OunceShell permanece sem validação própria |
| Empacotar backups em NUP | Dois backups verificados; funcionamento relatado no Eglantine 0d86405bd1-nx2; interface integrada e testada com dados sintéticos |
| Executar NRO de Switch 1 diretamente | Não é uma capacidade comprovada deste projeto ou do SDK pesquisado |
| Acesso irrestrito de leitura/escrita ao microSD | Não demonstrado e não prometido |

## HBLauncher e ports feitos para Switch 1

O [HBLauncher atual](https://github.com/ravensclawx/HBLauncher) apresenta um catálogo e oferece entrada e renderização Vulkan dentro do processo do SmileBASIC, após uma sessão externa verificada. A documentação descreve demonstrações e ports mantidos separadamente; o processo de build utiliza Linux.

O [SDK nativo](https://github.com/ravensclawx/HBLauncher/blob/main/docs/SDK.md) usa uma imagem AArch64 com partes de código/dados, manifesto e entrada própria, sob ABI versionada. Isso é um contrato diferente de copiar um NRO para um ambiente de homebrew de Switch 1.

**Inferência para nossos ports:** sem suporte específico de carregamento e APIs, não basta transferir o binário. A avaliação deve partir do código-fonte. Dependências de libnx, SDL, APIs gráficas, áudio, threads e sistema de arquivos podem exigir adaptação ou substituição. Algumas partes independentes de plataforma podem ser reaproveitadas, mas recompilar sozinho não garante funcionamento.

Checklist por port: licença/fontes; formato atual; bibliotecas; entrada; vídeo; áudio; arquivos; gravação; consumo de memória; ambiente de compilação e teste mínimo no console.

## Saves

O [ns2-savekit](https://github.com/dougchansan/ns2-savekit) documenta descoberta, cópia, escrita e verificação de saves por uma sessão ns2jb. Suas [notas de integração](https://github.com/dougchansan/ns2-savekit/blob/main/docs/PATCHED-ENGINE.md) exigem mudanças no mecanismo, incluindo IPC e enumeração; a sessão deve ser iniciada depois dessas alterações. A compatibilidade com nossa base Windows precisa de revisão.

A [restauração descrita pelo projeto](https://github.com/dougchansan/ns2-savekit/blob/main/docs/RESTORE.md) faz pré-backup, prepara um manifesto, grava e relê para verificar. Há uma limitação relevante: arquivos ausentes no backup não são automaticamente removidos do destino. Uma restauração por substituição não deve ser apresentada como espelho exato sem política explícita.

O [módulo de leitura](SAVES.md) já está integrado. Usa o inventário para selecionar o usuário e não aplica os patches de escrita. A restauração com confirmação permanece para a etapa seguinte. Nenhuma escrita em saves do console foi feita neste desenvolvimento.

## FTP e navegador de arquivos

| Caminho | Escopo documentado | Escrita |
| --- | --- | --- |
| OunceCake | Conteúdo de jogo selecionado e montado | Não; servidor de leitura |
| ftpd-sb | Arquivos de save e temporários do SmileBASIC; romfs do SmileBASIC | Save/tmp permitem escrita; romfs é de leitura |
| Futuro módulo de saves | Arquivo de save selecionado por identidade | Somente após integração transacional e confirmação |

O [ftpd-sb](https://github.com/ravensclawx/ftpd-sb) documenta transferência com cliente FTP, mas não expõe o cartão SD nem os saves de outros jogos. Ele depende de uma versão compatível do HBLauncher/SDK. Seu escopo não deve ser confundido com acesso global ao armazenamento.

Podemos oferecer conexão externa e navegação mais simples, porém a compatibilidade com o Explorer deve ser testada na versão de Windows utilizada. Para adicionar ou substituir arquivos, é necessário definir onde eles serão gravados e como essa gravação é confirmada pelo console.
