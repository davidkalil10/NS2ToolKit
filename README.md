# NS2ToolKit

Assistente para Windows para executar o ns2jb no SmileBASIC, fazer backup de jogos e saves do Nintendo Switch 2 e gerar pacotes NUP no PC.

## Download

Baixe o **pacote portátil Windows x64** na [página de releases](https://github.com/davidkalil10/NS2ToolKit/releases/latest), extraia o ZIP inteiro para uma pasta gravável e abra **NS2 Assistente.exe**. Mantenha as subpastas junto do executável.

O pacote inclui Node, Python, compressão e as DLLs necessárias. Não é preciso instalar essas ferramentas, Git ou compiladores no PC de uso. Requer Windows 10/11 x64 com .NET Framework 4.x. O ZIP de código-fonte gerado automaticamente pelo GitHub não inclui os runtimes nem os submódulos; use o pacote portátil para executar o assistente.

## Recursos

- Conexão ns2jb com acompanhamento das quatro etapas e opção de manter a sessão RPC aberta.
- Backup dos arquivos de jogos com OunceCake, transferência FTP de leitura e detecção automática do IP do console.
- Backup de saves Account/Device em modo somente leitura, com identificação do jogo e usuário.
- Restauração de arquivos de save existentes, com pré-backup automático, confirmação e verificação após commit; validada no FireRed.
- **Arquivos / FTP** com Montar/Desmontar, navegação no Explorer e envio opcional de arquivos novos ao SD. Montagem e navegação confirmadas no console; jogos e saves ainda seguem a organização do armazenamento.
- Geração de NUP pela interface, com conferência dos backups de entrada e verificação integral do pacote.
- Pastas com **Nome do jogo [ID]**, registros de execução e preservação de operações incompletas.

## Configuração compatível

- Switch 2 com sistema **23.0.1** e **SmileBASIC completo 4.4.9**.
- SmileBASIC instalado na memória interna, com mais de 20 MiB livres no save.
- PC e Switch por Ethernet, na mesma rede local.
- `bootstrap.bas` correspondente salvo como **NS2** no slot 0 do SmileBASIC.

Conexão 4/4, backup de jogos, leitura de saves e restauração de um save editado do FireRed foram validados nessa configuração. Dois NUPs, incluindo conteúdo base e atualização, foram testados no Eglantine **0d86405bd1-nx2**, build de 04/11/2026. A compatibilidade de outros jogos, versões e ambientes requer testes específicos.

Não é necessário executar o assistente como administrador. Se o Windows solicitar acesso à rede, permita a comunicação na rede privada utilizada pelo console. Não é necessário desativar o firewall ou abrir portas no roteador.

## Iniciar uma sessão

1. Reinicie completamente o Switch, abra o SmileBASIC e entre no modo Direct.
2. Abra **NS2 Assistente.exe** e confira o endereço Ethernet do PC.
3. Marque **Manter conexão aberta após 4/4** para utilizar os módulos de backup.
4. Marque a confirmação de preparo, clique em **Iniciar conexão** e aguarde o PC ficar pronto.
5. Digite no console, uma linha por vez:

   ```basic
   LOAD "NS2"
   RUN
   REMOVE NSR,&H60000000,&H3FFFFFFF
   ```

   Confirme o carregamento. `RUN` deve mostrar `DIST BOOT READY 1015`. O erro `Out of memory` de `REMOVE` é esperado.

6. Digite a linha `V=START(...)` exibida pelo painel, com o endereço calculado para a rede.
7. Mantenha o SmileBASIC aberto e aguarde a confirmação **4/4** no assistente.

O botão **Copiar** copia o comando para o PC. Execute `REMOVE` uma única vez por abertura do aplicativo. Após `START`, não repita `RUN` ou `REMOVE` na mesma sessão.

`RPC RUNNING` ou `RPC STOP` no Switch, isoladamente, não comprova sucesso. Confira a verificação no assistente. Ao terminar os backups, feche a janela do módulo, clique em **Encerrar conexão**, aguarde a limpeza e reinicie o console.

## Backup de jogos

1. Com a sessão mantida aberta e 4/4 confirmado, clique em **Backup dos jogos**.
2. O endereço do Switch é preenchido a partir da conexão. Clique em **Listar jogos**.
3. Escolha o jogo, selecione o destino e clique em **Fazer backup**.
4. Aguarde a confirmação final, incluindo o encerramento dos recursos de transferência.

Cada operação cria uma pasta **Nome do jogo [ID]** com arquivos TAR, manifesto e registros. Os tamanhos são conferidos e os hashes SHA-256 são calculados no PC. O módulo não compara hashes remotos. A pasta escolhida é lembrada nas próximas aberturas. Operações incompletas preservam os arquivos parciais e não recebem confirmação de sucesso.

Sessões iniciadas com versões antigas podem não ter o IP registrado. Nesse caso, informe o IPv4 do Switch manualmente ou inicie uma sessão nova com a versão atual.

## Backup de saves

1. Com a sessão mantida aberta e 4/4 confirmado, clique em **Backup de saves**.
2. Clique em **Listar saves** e confira o jogo, o identificador do usuário e o tipo.
3. Escolha o destino e clique em **Fazer backup**.

As pastas usam **Nome do jogo [ID]**. Repetições recebem `(2)`, `(3)` e assim por diante, sem substituir backups anteriores. O manifesto preserva a identidade do save e do usuário.

O destino dos saves é lembrado separadamente do destino dos jogos. As preferências ficam em `%LOCALAPPDATA%/NS2ToolKit/settings.json`.

A leitura confere os blocos no console, calcula hashes locais, relê os arquivos no PC e verifica novamente a estrutura. O manifesto só indica conclusão após a limpeza dos recursos. **Restaurar save** permite selecionar a pasta e o jogo/usuário lido do console; cria um pré-backup automático e pede confirmação antes da escrita. Aceita arquivos existentes do mesmo tamanho, até 16 MiB por arquivo e 64 MiB no conjunto, com no máximo 256 arquivos. O fluxo foi validado no FireRed; a aceitação de saves editados por outros jogos exige teste próprio. Consulte [escopo e verificação dos saves](docs/SAVES.md).

## Gerar NUP

A geração funciona localmente no PC, sem conectar o Switch.

1. Clique em **Gerar NUP** na janela principal.
2. Selecione a pasta de um backup completo, contendo `manifest.json` e os TARs.
3. Escolha a pasta de saída. O nome é opcional para backups antigos sem título no manifesto.
4. Clique em **Gerar e verificar**. Ao concluir, use **Abrir pasta**.

O pacote e sua pasta usam **Nome do jogo [ID]**. O relatório `build-report.json` registra os hashes, as verificações e a presença de nome/ícone nos metadados. O adaptador usa os identificadores TLV da especificação v1 e incorpora imagens do próprio backup. NUPs gerados antes da 0.1.1 precisam ser gerados novamente para receber a correção; os TARs existentes podem ser reutilizados. Saídas anteriores e backups de origem são preservados. O adaptador aceita `base/program/0`, `updates/<versão>/program/0` e DLC base em `dlc/<ID>/0/base/program/0`; outros índices de programa, versões e atualizações de DLC são recusados. Consulte [formatos e uso pelo terminal](docs/NUP.md).

## Limitações e recuperação

A aquisição do FS depende de temporização e pode falhar. Algumas combinações de conteúdo também apresentam falhas de preparação no OunceCake. Após uma falha que invalide a sessão, preserve os registros em `runs/`, encerre a conexão e reinicie o console antes de tentar novamente. O assistente bloqueia repetições quando a limpeza não está confirmada. Uma recusa conhecida de conteúdo permite escolher outro jogo após confirmação da limpeza e verificação dos endpoints; timeouts e falhas desconhecidas ainda exigem uma sessão nova.

O backup de jogos não inclui saves ou chaves e não gera imagens NSP/XCI instaláveis. O FTP mantém o armazenamento interno somente leitura e permite apenas criação no SD quando habilitada; veja [uso e limitações](docs/FTP.md). HBLauncher ainda não está integrado. A restauração de saves não cria nem apaga arquivos e exige o mesmo jogo/usuário e arquivos do mesmo tamanho. O acesso ao console é temporário e depende do PC e do SmileBASIC em execução. Use seus próprios jogos e console.

Consulte [incidentes conhecidos](docs/INCIDENTES.md), [compatibilidade](docs/COMPATIBILIDADE.md), [roadmap](docs/ROADMAP.md) e o [índice da documentação](docs/README.md).

## Perfis experimentais em desenvolvimento

Os perfis integrados na 0.1.4 oferecem inventário sem montagem, registros por chamada e um modo de compatibilidade que omite manuais e testa outra rota para programas secundários. A exportação do Split Fiction sem manuais foi validada no console; o dump do Legends Z-A continua pendente. Veja [resultados e limitações](docs/TESTE-MONTAGENS.md). A exportação com manuais omitidos é identificada no manifesto.

## Desenvolvimento

```sh
git clone --recurse-submodules https://github.com/davidkalil10/NS2ToolKit.git
```

O código-fonte requer Node.js 22+, Python 3.10+ e as dependências fixadas nos submódulos. Para preparar o compressor:

```powershell
python -m pip install --target .runtime/nup-python --only-binary=:all: --no-deps -r requirements-nup.txt
```

Testes:

```powershell
node --test test.cjs painel.test.cjs painel-modules.test.cjs painel-mounts.test.cjs
python test-painel-download.py
python test-painel-nup.py
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\Painel-NS2.ps1 -SelfTest
```

Para compilar a interface, execute `Compilar-Painel.ps1`. Para produzir a distribuição com dependências incluídas, execute `Empacotar-Portatil.ps1`; veja o [guia da build portátil](docs/PORTATIL.md).

`SHA256SUMS` identifica os arquivos versionados. A distribuição inclui seus próprios hashes em `PORTABLE-SHA256SUMS`. Jogos, saves e registros de sessões não fazem parte do repositório nem da release.

## Créditos, projetos de origem e dependências

O NS2ToolKit integra e adapta o trabalho dos projetos abaixo. Os créditos pela pesquisa, mecanismo, formatos e bibliotecas originais pertencem aos respectivos autores e contribuidores.

| Projeto e autor | Como é utilizado |
| --- | --- |
| [ns2jb — pepsipu / Sammy Hajhamid](https://gitlab.com/pepsipu/ns2jb) | Pesquisa e cadeia original; [artigo técnico](https://pepsipu.com/blog/2026-10-switch2-jailbreak-ns2jb/) |
| [ns2jb — fork de kurumuz](https://gitlab.com/kurumuz/ns2jb) | Base do mecanismo e runner, com adaptações Windows e recuperação locais. Revisão `81d5bb114c856109dadaf1077d927a9f297fe58d`; [README original preservado](docs/NS2JB-UPSTREAM.md) |
| [OunceCake — misshexa66 / Hexa](https://github.com/misshexa66/OunceCake) | Descoberta, montagem e exportação FTP do conteúdo dos jogos. Revisão `43dd500a10f7fef62a2c6d60b9f67851d3371dc6`; [licença GPL-2.0](https://github.com/misshexa66/OunceCake/blob/43dd500a10f7fef62a2c6d60b9f67851d3371dc6/LICENSE) |
| [ns2-savekit — dougchansan](https://github.com/dougchansan/ns2-savekit) | Referência do inventário e biblioteca de atributos usada no módulo de leitura de saves. Revisão `700814ff37fa8f11f12e77b65dc8a33d421e8dd1`; [licença MIT](https://github.com/dougchansan/ns2-savekit/blob/700814ff37fa8f11f12e77b65dc8a33d421e8dd1/LICENSE) |
| [NUP — a55uka](https://github.com/a55uka/nup) | Formato e implementação de referência para empacotamento, leitura e verificação. Revisão `d40d9cfa50792ba8021d2967d994d1b1c25d62b0`; [licença MIT](https://github.com/a55uka/nup/blob/d40d9cfa50792ba8021d2967d994d1b1c25d62b0/LICENSE) |
| [python-zstandard — indygreg e contribuidores](https://github.com/indygreg/python-zstandard) | Biblioteca Python 0.25.0 usada na compressão dos NUPs; licença BSD-3-Clause |
| [Zstandard — Meta e contribuidores](https://github.com/meta/zstd) | Implementação da compressão utilizada pela dependência Python; seus avisos permanecem na distribuição da biblioteca |

Referências utilizadas no preparo e na pesquisa, sem incorporar seu código ao NS2ToolKit:

- [ezBasic — StonedModder](https://github.com/StonedModder/ezBasic): digitação inicial do bootstrap usando um Switch 1.
- [IZ2S Platform — byizmysh](https://github.com/byizmysh/IZ2S-Platform): referência para a rotina experimental de recuperação.
- [HBLauncher e SDK — ravensclawx](https://github.com/ravensclawx/HBLauncher) e [ftpd-sb](https://github.com/ravensclawx/ftpd-sb): pesquisa de compatibilidade para o roadmap; ainda não integrados.

Veja também [os avisos e o escopo dos componentes de terceiros](THIRD_PARTY_NOTICES.md). Este repositório preserva as licenças e atribuições de cada componente; não aplica uma licença única aos projetos de origem. Não é afiliado à Nintendo.
