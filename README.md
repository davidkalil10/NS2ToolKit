# NS2ToolKit

Assistente para Windows que orienta a execução do ns2jb no SmileBASIC, acompanha as quatro etapas e permite exportar os arquivos dos seus jogos para o PC usando OunceCake.

## Checkpoint validado — 5 de novembro de 2026

Na configuração do autor, esta versão completou as quatro etapas do ns2jb, com execução no FS verificada e instruções originais restauradas, e manteve a conexão RPC aberta após 4/4.

Um backup real foi concluído: seis arquivos, 34.708.992 bytes recebidos, tamanhos conferidos, hashes SHA-256 locais registrados e encerramento dos recursos do OunceCake sem erro. Veja o [relatório resumido](docs/CHECKPOINT-2026-11-05.md).

O [índice da documentação](docs/README.md) reúne aprendizados, incidentes, decisões, compatibilidade e roadmap. Há falhas conhecidas na preparação de alguns conteúdos, descritas no [registro de incidentes](docs/INCIDENTES.md); os novos módulos de saves, FTP dedicado e HBLauncher estão planejados, ainda não integrados.

É um checkpoint funcional testado em um console. A aquisição do FS continua sensível à temporização e pode falhar. O backup cobre os arquivos anunciados pelo OunceCake, sem prometer cobertura de todo conteúdo instalado ou comparar hashes fornecidos pelo console. Registros da sessão e dados exportados não fazem parte do repositório.

## Obter o programa

```sh
git clone --recurse-submodules https://github.com/davidkalil10/NS2ToolKit.git
```

Se já clonou sem as dependências, execute `git submodule update --init --recursive`. O OunceCake é fixado por revisão em `tools/OunceCake`. O ZIP automático do GitHub não inclui o conteúdo de submódulos: use Git para obter o conjunto completo.

## Requisitos

- Windows, Node.js 22 ou superior e Python 3.9 ou superior para o backup.
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
node --test test.cjs painel.test.cjs
python test-painel-download.py
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\Painel-NS2.ps1 -SelfTest
```

Para gerar o executável Windows Forms/.NET Framework usando o compilador do Windows PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Compilar-Painel.ps1
```

`SHA256SUMS` identifica os arquivos versionados deste checkpoint; o OunceCake é identificado pela revisão do submódulo.

## Origem e créditos

- [ns2jb, por pepsipu](https://pepsipu.com/blog/2026-10-switch2-jailbreak-ns2jb/): pesquisa e cadeia original.
- [Fork de kurumuz](https://gitlab.com/kurumuz/ns2jb), base `81d5bb114c856109dadaf1077d927a9f297fe58d`: mecanismo e runner, com as alterações locais descritas acima. O [README de origem](docs/NS2JB-UPSTREAM.md) foi preservado.
- [OunceCake, por misshexa66](https://github.com/misshexa66/OunceCake), revisão `43dd500a10f7fef62a2c6d60b9f67851d3371dc6`: descoberta, montagem e FTP; licença GPL-2.0 preservada no submódulo.
- [ezBasic, por StonedModder](https://github.com/StonedModder/ezBasic): utilizado no preparo inicial do SmileBASIC, não distribuído aqui.
- [IZ2S Platform](https://github.com/byizmysh/IZ2S-Platform): referência para a rotina experimental de recuperação.

Este repositório não altera nem substitui os avisos e licenças de terceiros. Não é afiliado à Nintendo.
