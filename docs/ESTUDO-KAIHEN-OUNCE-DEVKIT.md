# Estudo: kaiHEN e ounce-devkit

Pesquisa de **14/11/2026**, com leitura dos READMEs, código, scripts de build e releases oficiais. É uma análise estática: não houve instalação do SDK, compilação dos projetos, ativação no console ou mudança no mecanismo atual do NS2ToolKit.

**Atualização após o estudo:** a integração foi solicitada e implementada como modo **Homebrew / kaiHEN no assistente principal**, build local 0.1.9. O host kurumuz/ns2jb `28f03b5` já fornece o inicializador real; sua cópia isolada recebeu adaptações Windows, mantendo o engine dos backups. OunceShell foi incluído como primeiro homebrew de teste. A ordem confirmada nas instruções desse host é aguardar HEN e **fechar SmileBASIC mantendo o host aberto até a desconexão**, diferente do fluxo do loader GBA. [Implementação e roteiro atual](KAIHEN.md). A integração continua sem validação no console; os tópicos de pesquisa abaixo registram a análise inicial.

## Resultado principal

Os projetos fornecem duas partes complementares para homebrew nativo no Switch 2:

| Projeto | Papel | Oportunidade para o NS2ToolKit |
| --- | --- | --- |
| kaiHEN | Ambiente residente, serviços RO/HEN, carregamento NRO, plugins e suporte JIT | Base candidata para iniciar hbmenu e executar homebrew de verdade |
| ounce-devkit | Distribuição de bibliotecas e regras de compilação Switch 2 sobre devkitPro | Recompilar ports próprios e criar programas de teste para esse ambiente |

A recomendação é estudar uma integração delimitada do kaiHEN e validar primeiro um programa mínimo compilado com o devkit. Abertura do hbmenu, execução de um NRO, funcionamento de um port e persistência de seus arquivos são marcos distintos. Essa recomendação não altera a prioridade de testar o aplicativo Mods GBA já preparado.

## Revisões examinadas

| Referência | Revisão |
| --- | --- |
| kaiHEN, tag `20261114d` | `5ac772560698b325551db014478a5a43e941474c` |
| ounce-devkit, tag `devkit-20261115` | `0f38ba80d7ee768c5749278f127749d14ece2036` |
| libounce fixada pelo devkit | `d1718bb7076fb356cb4cb81ab13d035db5367eea` |
| OunceVK fixada pelo devkit | `f5afcd27a98d47a35b7091b097ffd7f46b0be3e4` |
| kaiHEN/libkaihen fixada pelo devkit | `eb81e1912586d32de96678153b7f806fca4a17e9` |

Os checkouts locais estão em `.runtime/research/kaihen-20261114` e `.runtime/research/ounce-devkit-20261114`, fora do Git do aplicativo. As tags foram conferidas contra HEAD dos dois clones.

A versão do SDK se chama 20261115, embora tenha sido consultada ainda em 14/11 no fuso de São Paulo. O número da versão não deve ser convertido em uma data de teste no console.

O ZIP kaiHEN 20261114d publicado foi construído com devkit **20261114**, enquanto o HEAD examinado do SDK já é **20261115**. O arquivo `build/sources` do SDK também fixa uma revisão de libkaihen diferente do HEAD do kaiHEN. Preservar essa distinção ao criar um conjunto reproduzível, em vez de misturar automaticamente os HEADs dos projetos.

## Como o ambiente funciona para quem joga

O PC não transmite continuamente o programa para desenhar a tela. Depois da inicialização e da transferência correta das sessões necessárias, o ambiente e os homebrews executam no próprio console.

Fluxo conceitual, ainda não integrado ao NS2ToolKit:

```text
PC + SmileBASIC / ferramenta de aquisição
    → preparação dos serviços e ativação do kaiHEN
    → entrega das sessões ao ambiente residente
    → encerramento correto da etapa de aquisição
    → abrir jogo nativo segurando R
    → hbloader → hbmenu → homebrew escolhido
```

O HEN intercepta a abertura com R. Na primeira utilização sem política já preparada, permite a abertura normal do jogo e guarda a política necessária no SD; nas seguintes, inicia hbloader, que abre hbmenu. A leitura de `hen/source/game_arm.cpp` confirma o tratamento do botão R e do cache de política. Não concluir que uma primeira abertura do jogo normal seja, sozinha, prova de falha.

### O que permanece ativo

| Ação | Comportamento previsto e limites |
| --- | --- |
| Fechar o hbmenu ou um homebrew | O ambiente HEN é um processo separado; o programa pode terminar sem desinstalar o ambiente. O caminho de retorno de cada aplicação deve ser testado |
| Fechar e reabrir SmileBASIC após entrega concluída | SmileBASIC não é a residência do HEN. O ambiente foi projetado para permanecer ativo durante aquela inicialização |
| Desconectar o PC após entrega concluída | O desenho do HEN mantém sessões no console; não requer uma chamada do PC para cada abertura do launcher |
| Fechar SmileBASIC durante aquisição/ativação | Interrompe a conexão ainda em uso; não equivale ao encerramento correto após a entrega |
| Reiniciar ou desligar completamente o console | Os processos residentes deixam de existir. A entrada ns2jb baseada em PC/SmileBASIC precisa ser repetida; estes repositórios não demonstram um boot automático persistente para nosso aparelho |
| Arquivos no SD após reiniciar | Binários, homebrews e políticas salvas podem continuar no SD; a presença desses arquivos não significa HEN ativo |

Persistência **durante o boot** e arquivos persistidos no SD são coisas diferentes de um desbloqueio que inicia automaticamente ao ligar. Suspensão/retomada não foi validada nesta análise e não deve ser equiparada a um teste de reinicialização.

Base documental: [HEN e game arming](https://github.com/ouncebrew/kaihen/blob/5ac772560698b325551db014478a5a43e941474c/hen/README.md) e [código de game arming](https://github.com/ouncebrew/kaihen/blob/5ac772560698b325551db014478a5a43e941474c/hen/source/game_arm.cpp).

## Componentes do kaiHEN

### RO e carregamento de NRO

`ro/` implementa `ldr:ro`: inicialização do cliente, registros NRR, carga/descarga NRO e mapeamento de código. Também encaminha a obtenção de uma sessão HEN ao processo chamador. Seu mapper aceita o layout NRO0 delimitado na implementação; não é um carregador genérico de ELF.

`ro/source/session.cpp`, `mapping.cpp` e `image.cpp` contêm o trabalho efetivo de validação/mapeamento, com registros de propriedade e falhas parciais. A presença de testes de host não comprova esses mapeamentos em nosso console.

### HEN, arquivos e serviços

`hen/` mantém as sessões recebidas na inicialização, coordena a abertura dos jogos e oferece uma interface aos homebrews. O protocolo examinado é **versão 6**, definido em `libkaihen/include/kaihen/protocol.h`.

Cada programa recebe uma sessão própria do proxy SM, em vez de compartilhar diretamente a sessão SM original do FS. O acesso ao FS usa clones de uma raiz já inicializada; reinicializar indiscriminadamente a identidade dessa raiz prejudicaria outros clientes. Essa separação é relevante para uma integração confiável, mas não transforma os programas em aplicações com acesso mínimo.

O projeto declara acesso amplo, inclusive à NAND. Ao integrar, preservar os limites que o NS2ToolKit já aplica ao FTP e aos saves; não ampliar permissões da nossa interface apenas porque um backend passou a alcançar mais serviços.

### Bootstrap e obrigação da ferramenta de aquisição

`bootstrap/source/startup.hpp` define `BootstrapInput` e `BootstrapArgs`. O bootstrap espera memória/handles/configurações válidos da aquisição: armazenamento retido, configuração do Loader, montagem, sessões de serviços, processo FS e outros recursos. `BootstrapInput` tem verificações de layout no próprio código.

Logo, copiar o ZIP para o SD ou enviar um `.nro` pelo nosso FTP não constitui a ativação do kaiHEN. Precisamos preparar o RO adequado e implementar ou adaptar um host que preencha esse contrato e confirme a entrega. Os repositórios estudados fornecem os componentes desse ambiente; nosso `run.cjs` atual não contém essa integração.

O código também distingue erro principal de falhas de restauração. A futura interface deve preservar essa distinção, de acordo com as decisões já adotadas no NS2ToolKit.

### Plugins e JIT

Plugins são NSOs em `/kaihen/plugins`, executados como processos separados. A API em `libkaihen/PLUGINS.md` define inicialização, sessões, prontidão e serviço IPC opcional. São programas nativos próprios; a existência desse mecanismo não comprova compatibilidade com plugins de outro ambiente.

O suporte JIT é relevante para emuladores e runtimes. `libkaihen/JIT.md` descreve o provedor para a API Jit compatível com libnx, usando RO para publicar código e lidar com aliases/gravação. É necessário ligar o provedor apropriado e respeitar sincronização entre threads e caches. Não é aceleração automática de todo NRO existente.

### Distribuição publicada e OunceShell

A release inclui RO, HEN, bootstrap, hbloader, hbmenu e **OunceShell**, gerenciador de arquivos com FTP. O `Dockerfile` fixa as revisões de hbloader, hbmenu e OunceShell; `release/Makefile` compila o conjunto e reúne as licenças.

Na release examinada, o FTP do OunceShell usa ftpd e expõe o SD na raiz. Há um problema conhecido declarado: nomes não ASCII, incluindo acentos, podem não aparecer nas listagens, embora operações por nome ainda sejam possíveis. Isso é especialmente relevante para nossos nomes amigáveis em português. Não substituir o FTP atual com base apenas na existência de outro servidor.

O layout interno do ZIP não define sozinho o procedimento de instalação de uma ferramenta de aquisição. O código usa caminhos como `/kaihen/bin/game/main` e gera pacotes/cache. Uma integração futura deve mapear esses destinos e seus hashes, sem presumir que basta extrair o ZIP na raiz do SD.

Fonte: [release kaiHEN 20261114d](https://github.com/ouncebrew/kaihen/releases/tag/20261114d). Os binários da release não foram baixados nem tiveram seus hashes comparados nesta análise.

## ounce-devkit e o caminho para ports

O SDK reúne **libounce**, **OunceVK** e **libkaihen**, reaproveitando compilador e ferramentas do devkitPro. Seu instalador adiciona bibliotecas/regras Switch 2; não é um compilador C++ inteiramente novo.

Os arquivos efetivamente examinados incluem `install.sh`, `build/sources`, `build/make-devkit.sh`, toolchains CMake/shell e os exemplos. A análise não compreende uma auditoria integral dos repositórios transitivos libounce/OunceVK.

### Reaproveitamento do código de Switch 1

O caminho documentado para Makefiles libnx seleciona `libounce/switch2_rules`. As regras redirecionam as bibliotecas para o alvo Switch 2. A camada gráfica documentada oferece Vulkan e EGL/OpenGL/OpenGL ES. Também há configuração CMake/Meson/autotools.

Os exemplos incluem um programa Vulkan, triângulo OpenGL ES e um plugin com cliente. São bons marcos iniciais: compilação, imagem, controles, saída e depois comunicação/arquivos.

Para avaliar um port concreto:

| Base do port | Avaliação inicial |
| --- | --- |
| C/C++, APIs libnx e bibliotecas portáveis | Candidato a recompilação com adaptação menor, conforme dependências e APIs usadas |
| SDL2 + renderer OpenGL/OpenGL ES | Caminho documentado promissor; validar criação da janela, entrada, áudio e arquivos |
| Vulkan | Há camada e exemplo; testar extensões, shaders e sincronização do programa específico |
| GPU/serviços de Switch 1 usados diretamente | Exige revisão; o suporte de alto nível do SDK não comprova compatibilidade com essas interfaces |
| Emulador com JIT | Requer integração do provedor kaiHEN, além da adaptação normal do port |
| Apenas binário NRO, sem fonte | Não existe garantia de compatibilidade universal documentada pelos dois projetos |

Portanto, o objetivo realista para os jogos próprios de David é **recompilar/adaptar o código-fonte para esse ambiente**, testar um port simples e ampliar a cobertura. Converter nome/extensão de NUP para NRO não faz parte desse processo.

Esta matriz é uma avaliação de viabilidade derivada da arquitetura, não uma lista de ports testados no NS2ToolKit. Fonte do caminho suportado: [ounce-devkit na revisão examinada](https://github.com/ouncebrew/ounce-devkit/blob/0f38ba80d7ee768c5749278f127749d14ece2036/README.md).

### Versões e limitações de build

O SDK 20261114 inclui uma correção OunceVK para espera de GPU; a release informa que o driver é ligado estaticamente e os programas precisam ser recompilados para incorporar a correção. O SDK 20261115 acrescenta configuração da faixa de coordenadas touch em libounce. Esses anúncios não comprovam funcionamento dos nossos ports ou alteram jogos comerciais já compilados.

Para builds reproduzíveis, fixar a versão do SDK, os commits de `build/sources`, o compilador e a combinação de runtime HEN. Não misturar uma mudança gráfica e uma mudança de aquisição no mesmo teste inicial.

Fonte: [releases do ounce-devkit](https://github.com/ouncebrew/ounce-devkit/releases).

### Windows e instalação

`install.sh` prevê MSYS/MINGW, devkitPro pacman e um diretório `DEVKITPRO`; também há caminho por Docker/Podman. O script pode instalar pacotes e substituir as pastas libounce/portlibs Switch 2. Ele não foi executado.

Nesta máquina, a verificação local encontrou comandos `wsl.exe` e `bash.exe` do Windows; isso não comprova distro WSL ou toolchain funcionando. Docker/Podman não foram encontrados no PATH. DevkitA64, libounce e bash MSYS2 não foram localizados nos caminhos padrão `C:/devkitPro` verificados. Isso não prova ausência em outros diretórios.

Separar ambiente **de desenvolvimento**, necessário para compilar ports, do programa Windows **de uso**, que pode distribuir componentes pré-compilados e conferidos. O usuário final não precisa receber um ambiente Docker inteiro apenas para iniciar homebrew já compilado.

## Relação com nosso loader GBA e a branch costela

### Mods GBA e HEN são mecanismos diferentes

O Zelda validado utiliza o emulador GBA do FireRed instalado, redirecionando a ROM e main por um loader RomFS/ExeFS. kaiHEN organiza homebrew NRO e serviços próprios. Nenhum dos dois repositórios anuncia uma correção para nosso dump Z-A ou uma conversão NUP → formato instalável de Switch 1.

Nosso loader de mods envolve FS/Loader e restauração do RO original. kaiHEN mantém seu RO próprio para carregamento/JIT. Há recursos em comum e ainda não existe teste de coexistência. **Recomendação inicial: modos separados em inicializações diferentes do console**, mantendo o caminho GBA validado até existir estudo específico de coexistência.

Não considerar compatíveis automaticamente protocolos privados só porque algum número de comando se repete. O kaiHEN expõe comandos `ro:dmnt` de leitura/escrita FS delimitados; nossos helpers atuais usam um conjunto maior e outro contrato de resposta. É necessário revisar handles, serviços e restauração, não apenas trocar um arquivo RO por outro.

### Trabalho local do colaborador

A referência local `costela` examinada continua no commit `093f4a3`. Sua interface e seu mini-SDK são trabalho independente a preservar. Essa leitura não consultou atualizações remotas posteriores da branch.

No `painel-homebrew.cjs` dessa revisão, o caminho de deploy consulta status, lê o payload local e emite um evento de conclusão; não há a transferência/execução correspondente entre a leitura e esse evento. Portanto, essa mensagem não é evidência de execução no console. Uma integração pode reaproveitar a interface, mas precisa conectá-la ao fluxo real de inicialização/validação, corrigindo a semântica do sucesso. Não fazer merge ou descartar a branch como efeito colateral deste estudo.

## Próximo experimento proposto

1. Preservar o checkpoint dos mods GBA e concluir o teste da nova automação separadamente.
2. Selecionar uma combinação fixada kaiHEN/SDK e revisar um host de aquisição compatível com o contrato do bootstrap.
3. Definir preparação SD, validação de firmware/serviços, propriedade dos handles, entrega e recuperação, antes de expor um botão de sucesso.
4. Em uma inicialização separada, confirmar HEN/RO prontos e protocolo esperado, sem depender apenas da mensagem do PC.
5. Confirmar o primeiro lançamento com R, hbmenu nas aberturas seguintes e funcionamento após fechar SmileBASIC/encerrar o PC corretamente.
6. Executar um exemplo mínimo compilado com o SDK: imagem, controles, sair e reabrir; depois um arquivo de teste no SD.
7. Escolher um port próprio pequeno, com fonte e dependências identificadas. Validar áudio, vídeo, entrada, desempenho e saves em etapas.
8. Só então integrar o fluxo ao NS2ToolKit e estudar coexistência com o modloader.

Nenhum desses marcos foi executado neste estudo. A documentação dos fornecedores e seus testes próprios não devem ser convertidos em evidência de validação no nosso aparelho. Não foi encontrada uma matriz suficiente de firmwares nesses READMEs para garantir compatibilidade com a configuração 23.0.1 sem qualificação.

## Licenças e fontes para retomar

kaiHEN usa GPL-2.0-only com a exceção declarada no projeto; libkaihen usa ISC. O repositório ounce-devkit usa MIT; as bibliotecas instaladas têm licenças próprias. OunceShell tem licença própria e o pacote agrega outras dependências. Preservar fontes, versões e avisos por componente quando houver uma integração real.

Leitura prioritária:

- [kaiHEN README](https://github.com/ouncebrew/kaihen/blob/5ac772560698b325551db014478a5a43e941474c/README.md), `hen/README.md` e `ro/README.md`.
- [Contrato do bootstrap](https://github.com/ouncebrew/kaihen/blob/5ac772560698b325551db014478a5a43e941474c/bootstrap/source/startup.hpp).
- [Protocolo libkaihen](https://github.com/ouncebrew/kaihen/blob/5ac772560698b325551db014478a5a43e941474c/libkaihen/include/kaihen/protocol.h), `JIT.md` e `PLUGINS.md`.
- [Fontes fixadas do SDK](https://github.com/ouncebrew/ounce-devkit/blob/0f38ba80d7ee768c5749278f127749d14ece2036/build/sources), `install.sh` e `toolchain/cmake/Switch2.cmake`.
- [Continuidade do NS2ToolKit](CONTINUIDADE.md), [mods GBA](MODS-GBA.md) e [roadmap](ROADMAP.md).
