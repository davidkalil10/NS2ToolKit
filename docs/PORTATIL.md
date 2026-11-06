# Distribuição portátil para Windows x64

O pacote ZIP inclui o assistente, fontes, ferramentas fixadas e os runtimes Node 22.16.0 e Python 3.13.4, com zstandard 0.25.0 e suas bibliotecas nativas/licenças. Não requer instalar Node, Python, Git, compiladores ou pacotes pelo pip na máquina de uso.

Extraia o ZIP inteiro para uma pasta gravável e abra **NS2 Assistente.exe**. Mantenha as subpastas junto do executável. Não execute de dentro do ZIP. Requer Windows 10/11 x64 com .NET Framework 4.x, componente do Windows utilizado pela interface atual. Não é um executável único: a distribuição é uma pasta portátil com as dependências incluídas.

O assistente prioriza `runtime/node/node.exe` e `runtime/python/python.exe`. O Python embutido usa `python313._pth` para isolar sua biblioteca; não depende do PATH, de PYTHONHOME ou de uma instalação Python externa. O módulo de download dos jogos recebe esse mesmo Python pelo assistente. Os processos Node filhos usam `process.execPath` e permanecem no runtime incluído.

## Produzir o pacote (máquina de desenvolvimento)

```powershell
git submodule update --init --recursive
python -m pip install --target .runtime/nup-python --only-binary=:all: --no-deps -r requirements-nup.txt
powershell -NoProfile -ExecutionPolicy Bypass -File Empacotar-Portatil.ps1
```

A compilação exige Git, Windows PowerShell e a dependência de compressão na máquina de desenvolvimento. O script obtém arquivos oficiais com versões e SHA-256 fixados; pode usar `-Offline` se já estiverem em `.runtime/portable-cache/`. Compila a interface, copia somente arquivos versionados e dependências explícitas, expande o Python embutido e inclui as DLLs do pacote oficial. Registros, jogos, saves, `.git`, ambientes locais e exportações não são copiados.

Antes de gerar o ZIP, executa `Testar-Portatil.ps1` com PATH sem Node/Python: confere a seleção dos runtimes, executa o teste do processo Node, gera e verifica um NUP sintético pela janela real e confirma que um backup incompleto é recusado. Esse teste não se conecta ao console. Validar em outro Windows sem instalações prévias continua sendo uma etapa adicional de distribuição.

Saídas novas em `dist/`, sem substituir pacotes anteriores. Para gerar a pasta e o ZIP em outro disco, use `-OutputRoot "D:\Games\NS2ToolKit-releases"`; os arquivos temporários da geração e da compilação do pacote ficam nesse destino. O cache de runtimes permanece em `.runtime/portable-cache/`.

O pacote contém:

- Pasta portátil e ZIP com nome único.
- `portable-build.json`: versões e origem da compilação.
- `PORTABLE-SHA256SUMS`: hashes dos arquivos distribuídos, separados dos hashes Git de `SHA256SUMS`.
- Arquivo `.zip.sha256`: integridade do ZIP.

O pacote inclui fontes das dependências e seus avisos. As revisões permanecem as dos submódulos; consulte [os créditos](../THIRD_PARTY_NOTICES.md). Node e Python são redistribuídos nos formatos oficiais; o assistente não os instala no sistema.

## Gerar NUP pelo assistente

1. Abra **Gerar NUP** na janela principal, mesmo sem iniciar conexão.
2. Escolha a pasta de um jogo contendo `manifest.json` e os TARs do backup completo.
3. Escolha a pasta de saída. Para backups antigos, preencha opcionalmente o nome do jogo.
4. Clique em **Gerar e verificar**. Aguarde a conferência dos arquivos, geração e verificação completa.
5. Clique em **Abrir pasta**. O NUP usa **Nome [ID]**, junto de `build-report.json`.

O cancelamento é cooperativo: aguarda a operação atual da biblioteca antes de limpar temporários. Uma geração cancelada ou com erro não recebe confirmação de sucesso. O backup original permanece somente leitura. As limitações de conteúdo são as do [adaptador NUP](NUP.md).
