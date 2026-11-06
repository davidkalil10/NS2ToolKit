# Empacotamento NUP — adaptador local

**Estado: adaptador CLI testado com dados sintéticos e dois backups próprios. O usuário confirmou funcionamento dos dois no Eglantine `0d86405bd1-nx2`. Integrado ao assistente pelo botão Gerar NUP.** Referência: [a55uka/nup](https://github.com/a55uka/nup), revisão fixada `d40d9cfa50792ba8021d2967d994d1b1c25d62b0`.

## O que o projeto oferece

O [README](https://github.com/a55uka/nup) descreve um contêiner para dumps sem criptografia, com conteúdo base, atualizações e DLC. A ferramenta Python oferece empacotamento, inspeção, extração e verificação. O [manifesto de dependências](https://github.com/a55uka/nup/blob/meow/tools/nup/pyproject.toml) exige Python 3.10+ e zstandard; a licença é MIT.

A [especificação consultada](https://github.com/a55uka/nup/blob/meow/SPEC.md) é 1.0-draft. Cada pacote tem árvore de arquivos e metadados de identidade/versão. O formato prevê hashes de integridade. Uma versão futura pode alterar requisitos: fixar revisão e versão antes de integrar.

## Diferença de layout a resolver

Nosso backup pode produzir `base/program/0/exefs.tar` e `base/program/0/romfs.tar`, além de outras versões e programas. O empacotador documenta árvores extraídas como `base/exefs/` e `base/romfs/`.

O adaptador converte os TARs de `base/program/0` e `updates/<versão>/program/0`. ExeFS/RomFS vão para as árvores canônicas; outras seções são preservadas sob `data/`. DLC e índices diferentes de zero são recusados, sem descarte silencioso.

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
2. Conferir novamente tamanhos e hashes dos arquivos de entrada.
3. Conferir o layout e recusar conteúdos ainda não suportados pelo adaptador.
4. Extrair TARs para área temporária isolada, recusando caminhos absolutos, travessia de diretórios e links. Preservar os arquivos originais.
5. Adaptar somente layouts cuja correspondência tenha sido comprovada. Recusar casos ambíguos ou não suportados com um relatório claro.
6. Executar a ferramenta de referência numa revisão fixada, produzindo um arquivo temporário sem substituir uma saída anterior.
7. Executar a verificação completa; não considerar a checagem rápida de estrutura suficiente para declarar integridade dos arquivos.
8. Promover a saída final somente após sucesso, registrando hashes, origem e conteúdo incluído.

É uma operação local no PC. Não precisa manter uma sessão do Switch aberta.

## Validação

- Passaram oito testes, incluindo cancelamento durante a geração: base/atualização, backup incompleto, hash alterado, programa não suportado, TAR com travessia/link, nomes opcionais inválidos e nomes de pasta/arquivo vindos do manifesto.
- A verificação NUP recalcula os hashes; uma comparação adicional confere caminhos, diretórios, tamanhos e hashes com as árvores preparadas.
- Dois backups próprios foram gerados/verificados: veja [o registro resumido](VALIDACAO-NUP-2026-11-05.md).
- Espaço insuficiente e interrupção têm tratamento no fluxo, mas ainda não passaram por ensaio de falha dedicado. Não tratá-los como validados.

Gerar um pacote íntegro não demonstra que ele será executado por qualquer launcher, emulador ou console. Essa compatibilidade depende do consumidor e exige validação separada. Saves e registros privados não devem ser incluídos no pacote de jogo.

## Metadados e compatibilidade com Eglantine (0.1.1)

`painel_nup_metadata.py` aplica a numeração TLV 1–10 da SPEC v1 às constantes exportadas pela biblioteca fixada, cujo enum começa em zero. O ajuste é limitado ao processo do adaptador; não modifica o submódulo nem arquivos antigos. Além do nome padrão, são adicionados nomes localizados, imagens JPEG/PNG dos arquivos `icon_*.dat`, versão e publicadora quando válidos. O controle da atualização mais recente tem prioridade sobre a base.

Os arquivos originais em `data/control/` continuam preservados. Testes conferem nome no TLV 5 e ícone no TLV 3, os mesmos tipos consultados pelo leitor da revisão Eglantine examinada. A identidade do programa não é alterada. Para atualizar um NUP antigo, gere outro a partir do backup completo existente e faça nova varredura da biblioteca no emulador. O pacote anterior permanece intacto.
