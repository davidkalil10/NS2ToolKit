**Jogos e saves por nome no FTP e conversão automática de pastas para NUP.**

### Instalação

Baixe **NS2ToolKit-v0.1.7-win-x64.zip**, extraia o ZIP inteiro e abra **NS2 Assistente.exe**. Node, Python, compressão e DLLs estão incluídos. Requer Windows 10/11 x64 com .NET Framework 4.x.

### Gerar NUP com a mesma seleção de pasta

Em **Gerar NUP**, escolha a pasta de origem e o destino e clique em **Gerar e verificar**. O assistente identifica automaticamente o backup com `manifest.json` e TARs ou a pasta copiada pelo FTP, contendo `Base/programa 0`. Não há uma nova opção de formato.

Os dois fluxos preservam arquivos, diretórios e metadados, conferem identidade e integridade e mantêm saídas anteriores. Títulos NACP comprimidos são reconhecidos para nome e publicadora. O ensaio FireRed copiado por FTP foi aprovado; 29 testes cobrem os dois formatos, metadados e equivalência das árvores.

São suportados base, atualizações e DLC base versão zero, sempre do programa 0. Outros layouts são recusados sem descarte silencioso. Uma cópia FTP interrompida pode estar incompleta: o conversor verifica os arquivos fornecidos, sem consultar o console para comprovar a totalidade do conteúdo remoto. Um manifesto incompleto continua sendo recusado.

### Navegação FTP por jogo e save

A opção **Mostrar jogos e saves por nome** acrescenta as raízes Jogos e Saves, somente leitura. As seções e saves abrem sob demanda; o assistente fecha o acesso anterior antes de trocar de seção. Usuários, índices e arquivos de save permanecem distintos.

No FireRed, foram validadas leitura de save, seções de controle e ExeFS, retomada de RomFS e desmontagem com saúde da sessão confirmada. Outros jogos e conteúdos podem manter limitações de montagem; manuais de atualizações não abrem neste modo.

Não há sobrescrita de arquivos no FTP. Jogos, saves e memória interna continuam somente leitura; o envio opcional ao SD aceita apenas arquivos e pastas novos. A restauração de saves permanece no módulo próprio, com pré-backup, commit e verificação.

Mais detalhes: [NUP](https://github.com/davidkalil10/NS2ToolKit/blob/main/docs/NUP.md) e [FTP](https://github.com/davidkalil10/NS2ToolKit/blob/main/docs/FTP.md).
