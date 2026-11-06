# NS2ToolKit

Assistente para Windows que orienta a execução do ns2jb no SmileBASIC, acompanha as quatro etapas e permite exportar os arquivos dos seus jogos para o PC usando OunceCake.

## Checkpoint validado — 5 de novembro de 2026

Na configuração do autor, esta versão completou as quatro etapas do ns2jb, com execução no FS verificada e instruções originais restauradas, e manteve a conexão RPC aberta após 4/4.

Um backup real foi concluído: seis arquivos, 34.708.992 bytes recebidos, tamanhos conferidos, hashes SHA-256 locais registrados e encerramento dos recursos do OunceCake sem erro. Veja o [relatório resumido](docs/CHECKPOINT-2026-11-05.md).

O [índice da documentação](docs/README.md) reúne aprendizados, incidentes, decisões, compatibilidade e roadmap. Há falhas conhecidas na preparação de conteúdos, descritas no [registro de incidentes](docs/INCIDENTES.md). A versão em desenvolvimento inclui backup de saves somente leitura, ainda em validação no console. Restauração, FTP dedicado e HBLauncher permanecem planejados.

É um checkpoint funcional testado em um console. A aquisição do FS continua sensível à temporização e pode falhar. O backup cobre os arquivos anunciados pelo OunceCake, sem prometer cobertura de todo conteúdo instalado ou comparar hashes fornecidos pelo console. Registros da sessão e dados exportados não fazem parte do repositório.

## Obter o programa

```sh
git clone --recurse-submodules https://github.com/davidkalil10/NS2ToolKit.git
```

Se já clonou sem as dependências, execute `git submodule update --init --recursive`. OunceCake, ns2-savekit e NUP são fixados por revisão em `tools/`. O ZIP automático do GitHub não inclui submódulos: use Git para obter o conjunto completo.

## Versão portátil

A build portátil inclui Node, Python, compressão e suas DLLs: extraia o ZIP inteiro e abra **NS2 Assistente.exe**. Não é necessário instalar essas dependências no PC de uso. Requer Windows 10/11 x64 com .NET Framework 4.x. Veja [distribuição e build portátil](docs/PORTATIL.md). O código-fonte e o ZIP automático do GitHub continuam exigindo preparação das dependências.

## Requisitos

- Windows. Usando o código-fonte: Node.js 22 ou superior e Python 3.10 ou superior. A build portátil inclui ambos.
- Switch 2 com sistema 23.0.1 e SmileBASIC completo 4.4.9.
- SmileBASIC na memória interna, com mais de 20 MiB livres no save.
- PC e Switch por Ethernet, na mesma rede local.
- O `bootstrap.bas` correspondente salvo como `NS2` no slot 0 do SmileBASIC.

A configuração validada usa Windows, Node.js 22.16.0 e Python 3.13.4. O ns2jb de origem documenta Linux/macOS; este repositório inclui adaptações para Windows. Não é necessário executar como administrador.

## Executar

1. Reinicie completamente o Switch, abra o SmileBASIC e entre no modo Direct.
2. Abra **NS2 Assistente.exe** com dois cliques. Mantenha-o junto dos outros arquivos nesta pasta.
3. Confira o endereço Ethernet do PC. Para usar o backup, marque **Manter conexão aberta após 4/4**.
4. Marque a confirmação de preparo, clique em **Iniciar conexão** e aguarde o PC ficar pronto.
5. Digite no console, uma linha por vez:

   ```basic
   LOAD "NS2"
   RUN
   REMOVE NSR,&H60000000,&H3FFFFFFF
   ```

   Confirme o carregamento. `RUN` deve mostrar `DIST BOOT READY 1015`. O erro `Out of memory` de `REMOVE` é esperado.

6. Digite a linha `V=START(...)` exibida pelo painel, com o endereço calculado para sua rede.
7. Deixe o PC e o SmileBASIC abertos e aguarde a confirmação final.

**Copiar** copia para o PC; o botão não digita no console. Execute `REMOVE` uma única vez por abertura do aplicativo. Depois de `START`, não repita `RUN` ou `REMOVE` na mesma sessão.

No modo normal, a conexão encerra após verificar e limpar a demonstração. No modo RPC, ela permanece disponível após 4/4. `RPC RUNNING` ou `RPC STOP` no Switch, isoladamente, não comprova sucesso: confira o resultado no PC.

## Backup dos seus jogos

1. Inicie com **Manter conexão aberta após 4/4** ativado e espere a confirmação de 4/4.
2. Clique em **Backup dos jogos** e informe o endereço IPv4 do **Switch**, mostrado nas configurações de Internet do console. É diferente do IP do PC.
3. Clique em **Listar jogos**, escolha o título e a pasta de destino.
4. Clique em **Fazer backup** e aguarde a conclusão, incluindo o encerramento dos recursos do OunceCake.

Cada tentativa cria uma pasta nova. A cópia produz arquivos `.tar`, um `manifest.json` e registros. Cópias incompletas ficam com `.part`; o manifesto só recebe `complete: true` depois de receber todos os arquivos anunciados e conferir seus tamanhos. Os SHA-256 são calculados no PC, sem hash remoto para comparação independente.

Este fluxo não exporta saves ou chaves e não produz uma imagem NSP/XCI instalável. Use seus próprios jogos e console, conforme as instruções do OunceCake.

Termine o backup antes de encerrar a conexão. Feche a janela de backup, use **Encerrar conexão**, aguarde a limpeza e reinicie o console ao terminar.

## Backup de saves (novo módulo em validação)

Após 4/4 com conexão mantida aberta, clique em **Backup de saves**, depois **Listar saves**, confira jogo e usuário, escolha o destino e clique em **Fazer backup**. Não precisa informar o IP do Switch. A versão atual copia saves Account/Device do espaço User e não oferece restauração. Consulte [escopo, manifesto e validação pendente](docs/SAVES.md).

## Gerar NUP no assistente

O [adaptador NUP](docs/NUP.md) foi testado com dois backups próprios, com verificação completa e comparação de árvores. O usuário confirmou funcionamento no Eglantine `0d86405bd1-nx2` (build de 04/11/2026). Consome base/programa 0 e atualizações/programa 0; DLC e outros índices ainda são recusados. Clique em **Gerar NUP**, escolha a pasta do backup completo (com `manifest.json`), escolha o destino e clique em **Gerar e verificar**. Ao concluir, use **Abrir pasta**. Não requer conexão com o console; a opção pelo terminal continua disponível.

Novos backups guardam o nome do jogo no manifesto. Pastas e NUPs usam **Nome do jogo [ID]**, tratando caracteres inválidos do Windows e acrescentando `(2)` à pasta em caso de repetição, sem substituir arquivos anteriores. Para backups antigos, o gerador aceita `--name "Nome do jogo"`.

## Se a etapa 2 falhar

Preserve a pasta da tentativa em `runs/` e reinicie o console antes de repetir. O supervisor local para após limpeza incerta; `switch2/acquisition-attempt-1.log` preserva a primeira causa da falha.

Uma rotina usada antes do sucesso foi reiniciar, abrir outro jogo por cerca de 10 segundos, fechá-lo completamente e só então abrir o SmileBASIC. É um experimento, sem garantia de sucesso.

Não é necessário desativar o firewall ou abrir portas no roteador. Se o Windows solicitar acesso à rede, permita a comunicação na rede privada utilizada pelo console.

## Alterações locais

- Painel Windows com seleção de rede, comandos, progresso e registros.
- Encerramento normal de RPC verificado por comando enviado ao processo.
- Diretórios temporários e pipes compatíveis com Windows.
- Repetições limitadas para substituir relatórios sob bloqueios transitórios do Windows.
- Interrupção das tentativas automáticas após limpeza incerta, preservando o primeiro erro.
- Backup com OunceCake e FTP binário, conferência de tamanhos, hashes locais e preservação de cópias parciais.

HBLauncher não está incluído. O acesso é temporário e depende do PC e do SmileBASIC em execução.

## Testes e compilação

```powershell
node --test test.cjs painel.test.cjs painel-modules.test.cjs
python test-painel-download.py
python test-painel-nup.py
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\Painel-NS2.ps1 -SelfTest
```

Para gerar o executável Windows Forms/.NET Framework usando o compilador do Windows PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Compilar-Painel.ps1
```

`SHA256SUMS` identifica os arquivos versionados; as três dependências em `tools/` são identificadas pelas revisões fixadas dos submódulos.

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
