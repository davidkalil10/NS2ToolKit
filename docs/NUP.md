# Empacotamento NUP — adaptador local

**Estado: adaptador CLI testado com dados sintéticos e dois backups próprios. O usuário confirmou funcionamento dos dois no Eglantine `0d86405bd1-nx2`. Integrado ao assistente pelo botão Gerar NUP.** Referência: [a55uka/nup](https://github.com/a55uka/nup), revisão fixada `d40d9cfa50792ba8021d2967d994d1b1c25d62b0`.

## O que o projeto oferece

O [README](https://github.com/a55uka/nup) descreve um contêiner para dumps sem criptografia, com conteúdo base, atualizações e DLC. A ferramenta Python oferece empacotamento, inspeção, extração e verificação. O [manifesto de dependências](https://github.com/a55uka/nup/blob/meow/tools/nup/pyproject.toml) exige Python 3.10+ e zstandard; a licença é MIT.

A [especificação consultada](https://github.com/a55uka/nup/blob/meow/SPEC.md) é 1.0-draft. Cada pacote tem árvore de arquivos e metadados de identidade/versão. O formato prevê hashes de integridade. Uma versão futura pode alterar requisitos: fixar revisão e versão antes de integrar.

## Diferença de layout a resolver

Nosso backup pode produzir `base/program/0/exefs.tar` e `base/program/0/romfs.tar`, além de outras versões e programas. O empacotador documenta árvores extraídas como `base/exefs/` e `base/romfs/`.

O adaptador converte os TARs de `base/program/0`, `updates/<versão>/program/0` e `dlc/<ID>/0/base/program/0`. ExeFS/RomFS vão para as árvores canônicas; outras seções são preservadas sob `data/`. Cada DLC recebe um pacote `addon` com seu próprio ID, incluindo seções de metadados e diretórios vazios. DLC de versão diferente de zero, atualizações de DLC e índices de programa diferentes de zero continuam recusados, sem descarte silencioso nem perda de versão.

## Executar no assistente

Clique em **Gerar NUP** na janela principal, selecione a pasta de um backup completo com `manifest.json`, escolha o destino e clique em **Gerar e verificar**. O campo de nome é opcional para backups antigos. A janela mostra as fases, permite solicitar cancelamento e abre a pasta final. Não exige uma sessão ativa do Switch. A [build portátil](PORTATIL.md) inclui as dependências.

## Executar no PC pelo terminal

```powershell
git submodule update --init --recursive
python -m pip install --target .runtime/nup-python --only-binary=:all: --no-deps -r requirements-nup.txt
python painel-nup.py "CAMINHO_DO_BACKUP" --out "PASTA_DE_SAIDA"
```

Python validado: 3.13.4, com zstandard 0.25.0. Cada geração cria uma pasta nova com o `.nup` e `build-report.json`. O destino padrão `exports/nup/` é excluído do Git.

Pastas e arquivos usam **Nome do jogo [ID]**. O nome vem do manifesto do backup, do controle quando válido, ou de `--name "Nome do jogo"` para backups antigos. Se não houver nome disponível, usa **Jogo [ID]**. Nomes repetidos recebem `(2)`, `(3)` etc. na pasta; saídas anteriores não são substituídas.

## Fluxo implementado para os layouts suportados

1. Selecionar um backup local e exigir manifesto completo.
2. Conferir o layout e os tamanhos de todas as entradas, recusando conteúdos ainda não suportados antes de ler os arquivos grandes.
3. Conferir novamente os hashes dos arquivos de entrada, com bytes e percentual no acompanhamento.
4. Extrair TARs para área temporária isolada, recusando caminhos absolutos, travessia de diretórios e links. Preservar os arquivos originais.
5. Adaptar somente layouts cuja correspondência tenha sido comprovada. Recusar casos ambíguos ou não suportados com um relatório claro.
6. Executar a ferramenta de referência numa revisão fixada, produzindo um arquivo temporário sem substituir uma saída anterior.
7. Executar a verificação completa; não considerar a checagem rápida de estrutura suficiente para declarar integridade dos arquivos.
8. Promover a saída final somente após sucesso, registrando hashes, origem e conteúdo incluído.

É uma operação local no PC. Não precisa manter uma sessão do Switch aberta.

## Validação

- Passaram 17 testes, incluindo base/atualização e dois DLCs, identidades de DLC, recusa antecipada dos layouts ainda não suportados, cancelamento, progresso, integridade, metadados e extração segura.
- A verificação NUP confere a estrutura com a biblioteca fixada e recalcula tamanho e SHA-256 de cada arquivo em blocos de até 1 MiB, tanto para extents raw quanto zstd. Não carrega arquivos inteiros na memória. Testes cobrem corrupção dos dois codecs e impedem a chamada de leitura integral. Uma comparação adicional confere caminhos, diretórios, tamanhos e hashes com as árvores preparadas.
- Dois backups próprios foram gerados/verificados: veja [o registro resumido](VALIDACAO-NUP-2026-11-05.md).
- Espaço insuficiente e interrupção têm tratamento no fluxo, mas ainda não passaram por ensaio de falha dedicado. Não tratá-los como validados.

Gerar um pacote íntegro não demonstra que ele será executado por qualquer launcher, emulador ou console. Essa compatibilidade depende do consumidor e exige validação separada. Saves e registros privados não devem ser incluídos no pacote de jogo.

## Metadados e compatibilidade com Eglantine (0.1.1)

`painel_nup_metadata.py` aplica a numeração TLV 1–10 da SPEC v1 às constantes exportadas pela biblioteca fixada, cujo enum começa em zero. O ajuste é limitado ao processo do adaptador; não modifica o submódulo nem arquivos antigos. Além do nome padrão, são adicionados nomes localizados, imagens JPEG/PNG dos arquivos `icon_*.dat`, versão e publicadora quando válidos. O controle da atualização mais recente tem prioridade sobre a base.

Os arquivos originais em `data/control/` continuam preservados. Testes conferem nome no TLV 5 e ícone no TLV 3, os mesmos tipos consultados pelo leitor da revisão Eglantine examinada. A identidade do programa não é alterada. Para atualizar um NUP antigo, gere outro a partir do backup completo existente e faça nova varredura da biblioteca no emulador. O pacote anterior permanece intacto.

## Split Fiction: conferência longa e DLC (07/11/2026)

O backup de compatibilidade concluído contém 13 TARs, incluindo DLC em `dlc/0400ca40208c9001/0/base/program/0/`. Na distribuição 0.1.3, a validação alternava checagem de layout e hash por arquivo: a RomFS grande era lida antes de encontrar a entrada DLC, e a interface permanecia sem contagem de bytes. As duas tentativas examinadas terminaram por cancelamento; esses registros não demonstram travamento nem permitem afirmar que a leitura estava progredindo normalmente.

A revisão 0.1.4 verifica todos os layouts antes dos hashes e informa bytes e percentual na conferência das entradas, extração, verificação NUP, comparação da origem e hash final. Adapta o DLC de versão zero desse backup para `dlc/<ID>/0/`, preservando seu ID e conteúdo. O escopo sem manuais continua registrado no relatório. O suporte não abrange outros programas nem atualizações de DLC; execução no emulador deve ser validada separadamente.

### Resultado da geração local em 07/11/2026

O NUP de Split Fiction foi gerado com 71.590.487.701 bytes e SHA-256 `349af14668d0d675008014976c82d692acde746352d05924a414d741732d69be`. O processo terminou com código zero; o relatório confirmou verificação integral e comparação das árvores com a origem. A área temporária foi removida e os TARs foram preservados.

| Pacote | ID | Versão | Arquivos |
| --- | --- | --- | --- |
| Base | `0400CA40208C8000` | 0 | 38 |
| Atualização | `0400CA40208C8000` | 262144 | 17.148 |
| DLC | `0400CA40208C9001` | 0 | 2 |

Nome, ícone, publicadora Electronic Arts e versão de exibição 1.3.0 foram preservados. O relatório mantém a omissão do manual da atualização. A geração e a integridade estão validadas no PC; a execução desse NUP no Eglantine continua pendente.

### Teste nos emuladores: falha de gravação do cache

Em 07/11/2026, o teste no Eglantine e no Lichii exibiu `Failed to open descriptor file ../../../Split/Split.uproject`. Os logs das duas tentativas registraram antes disso falhas `NUP zstd decompression ... to a temporary file failed: cannot write the temporary file`, inclusive para arquivos `pakchunk*-Sage`.

O [leitor NUP do Eglantine](https://github.com/Djihads80/Eglantine/blob/nx2/src/core/file_sys/nup_container.cpp) descompacta arquivos grandes para `CacheDir/nup`. Na instalação examinada, os emuladores usam o cache compartilhado em `%APPDATA%/eden/cache/nup`, no C, com aproximadamente 6 GB livres. O D tinha aproximadamente 181 GB livres. A falha de escrita do cache é comprovada pelo log; falta de espaço no C é a hipótese principal, ainda dependente de novo teste. A ausência do descritor como arquivo solto também foi confirmada no TAR e no NUP; isoladamente, isso não comprova perda na conversão, pois o jogo usa arquivos de conteúdo empacotados.

Com os emuladores fechados, somente a pasta `cache/nup` foi redirecionada por junction para `D:/Games/NS2ToolKit-cache/nup`. A pasta anterior foi preservada como `nup.before-disk-D-<horário>`, e a escrita pelo caminho original foi conferida no destino. O NUP não foi regenerado nem alterado. O próximo teste deve abrir o mesmo arquivo e verificar se as falhas de cache desapareceram. Esta medida não comprova ainda que o jogo inicia.

### Reteste após redirecionamento do cache — 07/11/2026

O erro do descritor deixou de aparecer, mas a interface permaneceu em `Launching`. O último log examinado identifica a build `fix-oot-blackscreen-17ac56ed-743d5bbaed-fix-oot-blackscreen-17ac56ed`, registra o início da execução do título e não repete as falhas de gravação dos temporários. Após solicitação de encerramento, registra que a thread de emulação não terminou e precisou ser encerrada à força. Também há mensagens de serviços ainda simulados e de inicialização criptográfica; isoladamente, elas não identificam a causa do bloqueio.

**Estado de compatibilidade:** NUP gerado/verificado no PC; execução do jogo ainda não validada. Limitação ou regressão do emulador é uma hipótese plausível, sem confirmação de causa e sem justificativa atual para regenerar o mesmo conteúdo.

O cache no D acumulou 32 temporários, totalizando 116.281.779.096 bytes. Depois de confirmar que os emuladores estavam fechados e que os arquivos não estavam abertos, somente esses temporários foram removidos. O D voltou a aproximadamente 181 GB livres; o NUP e os TARs foram preservados. Novos testes devem acompanhar o espaço livre, pois o cache pode permanecer após um encerramento anormal.
