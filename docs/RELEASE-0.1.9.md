**Homebrew / kaiHEN integrado ao assistente e restauração de saves com ajuste de tamanho.**

### Instalação

Baixe **NS2ToolKit-v0.1.9-win-x64.zip**, extraia o ZIP inteiro e abra **NS2 Assistente.exe**. Node, Python, compressão e DLLs estão incluídos; não é preciso instalar compiladores nem o SDK. Requer Windows 10/11 x64 com .NET Framework 4.x.

### Homebrew / kaiHEN

O botão **Homebrew / kaiHEN** abre um modo próprio na janela principal. Inclui a release oficial kaiHEN 20261114d, hbmenu e OunceShell, com arquivos conferidos por hash. O host fica separado do mecanismo já usado para backups e FTP.

Comece com o console reiniciado e sem uma conexão de backup ativa. Siga as instruções da janela: aguarde a confirmação do HEN, feche SmileBASIC sem reiniciar e mantenha o host aberto até a desconexão. Abra um jogo nativo de Switch 2 segurando R; a primeira abertura pode capturar a política e exigir uma segunda tentativa. Consulte o [guia completo](https://github.com/davidkalil10/NS2ToolKit/blob/main/docs/KAIHEN.md).

A ativação e a abertura do hbmenu foram confirmadas no console em 15/11/2026. OunceShell, outros homebrews e envio por Netloader ainda precisam de testes próprios. O Netloader recebe programas pela rede usando nxlink; o toolkit ainda não inclui um cliente de envio. Um NRO de Switch 1 não ganha compatibilidade automaticamente.

A sessão desse modo é exclusiva e não pode ser reutilizada para backups, saves ou FTP. Para voltar a esses módulos, reinicie o console e inicie uma conexão normal. O aplicativo Mods GBA permanece separado.

### Restauração de saves

Arquivos existentes podem ter tamanho diferente do backup ou do manifesto de origem após uma edição. A restauração prepara o conteúdo selecionado, cria pré-backup completo do console, mostra o ajuste de tamanho na confirmação, grava, faz commit e relê os arquivos para conferir tamanho e SHA-256.

A recuperação do FireRed após um save de 8 KiB gravado pelo Zelda foi validada: retorno a 128 KiB e carregamento no jogo confirmados. A restauração mantém a identidade de jogo/usuário, os limites de 16 MiB por arquivo e 64 MiB por conjunto, e não cria nem apaga arquivos. Consulte [saves](https://github.com/davidkalil10/NS2ToolKit/blob/main/docs/SAVES.md).

### FTP e distribuição

Inclui a substituição experimental de arquivos comuns do SD, desativada por padrão e com cópia anterior no PC. Jogos, Saves, Interno e a pasta Nintendo continuam somente leitura nesse módulo. A restauração de saves usa seu fluxo próprio.

O ZIP inclui licenças e fontes dos componentes kaiHEN, com revisões, hashes e instruções de reconstrução. Não inclui sessões, backups, saves, ROMs ou arquivos de jogos.
