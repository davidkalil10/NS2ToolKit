**Restauração de saves no NS2ToolKit**, com pré-backup automático e verificação após a escrita.

### Instalação

Baixe **NS2ToolKit-v0.1.5-win-x64.zip**, extraia o ZIP inteiro e abra **NS2 Assistente.exe**. Node, Python, compressão e DLLs estão incluídos. Requer Windows 10/11 x64 com .NET Framework 4.x. O arquivo `.sha256` permite conferir o download.

### Restaurar um save

Com a sessão 4/4 mantida aberta, entre em **Backup de saves → Restaurar save**. Escolha a pasta do backup ou sua subpasta `data`, leia os destinos do console e selecione jogo e usuário. Clique em **Restaurar save**.

O assistente identifica os arquivos editados, preserva uma cópia preparada e faz um pré-backup completo do estado atual do console. A confirmação mostra os arquivos e o destino antes de qualquer escrita. Após confirmar, verifica o envio dos blocos, faz um único commit, reabre o save em leitura e confere novamente os arquivos e a limpeza.

O manifesto de origem é preservado. Arquivos cujo hash foi alterado são preparados como edições; os demais arquivos do console permanecem no estado atual. Quando a pasta contém somente arquivos originais, o fluxo prepara todos os arquivos do backup para restaurar uma versão anterior.

### Validação

- **FireRed em console real:** restauração de `FireRed_e.sav` editado, com pré-backup, commit, releitura e limpeza confirmados, seguida de funcionamento no jogo. `transaction.sav` não foi substituído.
- **84 testes de backend:** 59 Node, 8 de download e 17 de NUP, incluindo falhas de escrita/commit, integridade, identidade, cancelamento e recusa de planos alterados.
- Interface real e runtimes incluídos testados com dependências externas fora do PATH. A pasta `data` é reconhecida e normalizada automaticamente.

### Escopo e limites

A restauração atende arquivos existentes do mesmo tamanho, no mesmo jogo e usuário, com a mesma identidade de arquivo de save. Até 256 arquivos, 16 MiB por arquivo e 64 MiB no conjunto. Não cria, remove ou redimensiona arquivos e não transfere saves entre jogos ou usuários.

O módulo foi feito para outros jogos dentro desse escopo, mas **apenas o FireRed foi validado no console até esta release**. A confirmação dos bytes gravados não garante que um jogo aceite um save editado, convertido ou de outra versão.

É possível cancelar antes da escrita. Depois que ela começa, aguarde commit e verificação; não encerre a conexão. Uma falha após início da escrita exige sessão nova e análise do relatório. O pré-backup é preservado; não há rollback automático nem repetição de escritas incertas.

As limitações de dump do Legends Z-A e de execução do NUP de Split Fiction nos emuladores permanecem. O mecanismo de aquisição não foi alterado. FTP dedicado e HBLauncher não estão incluídos.

Consulte o [guia de saves](https://github.com/davidkalil10/NS2ToolKit/blob/v0.1.5/docs/SAVES.md), o [README](https://github.com/davidkalil10/NS2ToolKit/blob/v0.1.5/README.md) e os [créditos e licenças](https://github.com/davidkalil10/NS2ToolKit/blob/v0.1.5/THIRD_PARTY_NOTICES.md).
