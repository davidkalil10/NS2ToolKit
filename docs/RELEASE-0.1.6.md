**Navegação FTP no NS2ToolKit**, com montagem/desmontagem pelo assistente e abertura no Explorer.

### Instalação

Baixe **NS2ToolKit-v0.1.6-win-x64.zip**, extraia o ZIP inteiro e abra **NS2 Assistente.exe**. O pacote inclui Node, Python, compressão e DLLs. Requer Windows 10/11 x64 com .NET Framework 4.x. O arquivo `.sha256` permite conferir o download.

### Arquivos por FTP

Com uma sessão 4/4 mantida aberta, entre em **Arquivos / FTP** e clique em **Montar FTP**. O Explorer abre o endereço local. As raízes `SD` e `Interno` aparecem conforme os armazenamentos disponíveis. Ao terminar, use **Desmontar FTP** e aguarde a limpeza antes de usar outro módulo.

Por padrão, o acesso é somente leitura. A opção de envio permite criar arquivos e pastas novos no SD, sem sobrescrever, apagar ou renomear. Cada arquivo enviado tem limite de 1 GiB e passa por verificação de tamanho e hash após a escrita. A memória interna continua somente leitura.

### Validação e limites

- Montagem e navegação confirmadas em console real, com listagem das raízes SD e USER.
- Protocolo FTP, adaptador simulado, envio/verificação, desmontagem e cliente WinINet testados localmente. Esses testes não substituem a validação de transferências reais de todos os tamanhos.
- Jogos e saves ainda aparecem como armazenados pelo sistema. Esta versão não oferece pastas virtuais por título; backup e restauração continuam nos módulos próprios.
- O servidor escuta somente em `127.0.0.1`, usa a sessão RPC aberta e não exige portas no roteador. Outros módulos ficam bloqueados durante a montagem.
- Preserva os recursos de backup, restauração de saves e geração NUP da versão 0.1.5. Não altera o mecanismo de aquisição do FS nem inclui HBLauncher.

Veja [uso e limitações do FTP](https://github.com/davidkalil10/NS2ToolKit/blob/main/docs/FTP.md).
