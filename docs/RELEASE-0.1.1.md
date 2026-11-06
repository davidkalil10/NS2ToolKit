Atualização corretiva do **NS2ToolKit** para Windows x64.

### Instalação

Baixe **NS2ToolKit-v0.1.1-win-x64.zip**, extraia o ZIP inteiro para uma pasta gravável e abra **NS2 Assistente.exe**. Node, Python, compressão e DLLs estão incluídos. O arquivo `.sha256` acompanha o download para conferência de integridade.

Requer Windows 10/11 x64 com .NET Framework 4.x. Mantenha as subpastas junto do executável; o ZIP automático de código-fonte do GitHub não substitui o pacote portátil.

### Correções

- **Continuidade dos backups:** uma recusa conhecida de conteúdo permite escolher outro jogo quando a limpeza é confirmada e os endpoints RPC e FS passam pela verificação de saúde. Timeouts, erros de limpeza e estados incertos continuam exigindo uma sessão nova. A atualização não remove marcas antigas de sessão inválida.
- **Pastas persistentes:** os destinos de jogos e saves são lembrados separadamente entre janelas e reinícios do assistente, em `%LOCALAPPDATA%/NS2ToolKit/settings.json`.
- **Nome e imagem nos NUPs:** o adaptador corrige a numeração TLV para a SPEC v1 e inclui ícones, nomes localizados, versão e publicadora quando disponíveis nos arquivos de controle do próprio backup. Os IDs dos jogos são preservados.

Para corrigir NUPs antigos, gere um novo pacote a partir dos TARs existentes e atualize a lista do emulador. Não é necessário fazer outro dump no console.

### Validação

Passaram **53 testes de backend** e os testes da interface real com os runtimes externos fora do PATH, incluindo persistência das pastas e continuidade após erro recuperável. Cinco NUPs reais foram reconstruídos, verificados integralmente e comparados com as árvores de origem; a exibição corrigida de nome e imagem foi confirmada no Eglantine.

A reutilização da sessão após recusa de conteúdo tem cobertura automatizada; a validação desse fluxo no console continua pendente. A distribuição em outro Windows sem instalações prévias também permanece como etapa adicional.

### Limitações conhecidas

O dump completo de **Split Fiction** ainda falha ao montar o manual da atualização `262144`, que exige um caminho de montagem com conteúdo original ainda não atendido. Esta versão corrige o bloqueio excessivo da sessão após a recusa, mas não resolve a montagem desse conteúdo.

A aquisição do FS continua sensível à temporização. Restauração de saves, FTP dedicado e HBLauncher não fazem parte desta release. A branch de desenvolvimento do launcher permanece separada.

Consulte o [README](https://github.com/davidkalil10/NS2ToolKit/blob/v0.1.1/README.md), os [incidentes conhecidos](https://github.com/davidkalil10/NS2ToolKit/blob/v0.1.1/docs/INCIDENTES.md) e os [créditos e licenças](https://github.com/davidkalil10/NS2ToolKit/blob/v0.1.1/THIRD_PARTY_NOTICES.md).
