Primeira release pública do **NS2ToolKit**, assistente para Windows x64.

### Instalação

Baixe **NS2ToolKit-v0.1.0-win-x64.zip**, extraia o conteúdo inteiro para uma pasta gravável e abra **NS2 Assistente.exe**. Node, Python, compressão e DLLs estão incluídos. Mantenha as subpastas junto do executável. O arquivo `.sha256` permite conferir a integridade do download.

Requer Windows 10/11 x64 com .NET Framework 4.x. Os arquivos automáticos “Source code” do GitHub não substituem o pacote portátil.

### Recursos

- Execução ns2jb com acompanhamento 4/4 e conexão RPC mantida aberta.
- Backup dos arquivos de jogos com OunceCake e IP do Switch detectado pela sessão.
- Backup de saves somente leitura, com pastas **Nome do jogo [ID]** e preservação da identidade do usuário no manifesto.
- Geração e verificação integral de NUP pela interface, sem conexão com o console.
- Pastas novas a cada backup, preservação de parciais e registros de diagnóstico.

### Validação

Conexão, backup de jogos e backup de saves validados em Switch 2 **23.0.1**, com SmileBASIC completo **4.4.9** na memória interna e rede Ethernet. Dois NUPs, incluindo conteúdo base e atualização, testados no Eglantine **0d86405bd1-nx2**.

Passaram 49 testes de backend. A distribuição portátil também passa por um teste da interface real com Node/Python externos fora do PATH: geração e verificação de NUP sintético, recusa de backup incompleto e preenchimento automático do IP. Validação em outro Windows sem instalações prévias continua pendente.

### Limitações

A aquisição do FS é sensível à temporização. Alguns jogos apresentam falhas de preparação de conteúdo no OunceCake. Após uma sessão invalidada, preserve os registros e reinicie o console antes de tentar novamente.

Restauração de saves, FTP dedicado e HBLauncher não estão incluídos. O gerador NUP aceita base/programa 0 e atualizações/programa 0; DLC e outros índices são recusados. A transferência dos jogos confere tamanhos e registra hashes locais, sem comparar hashes remotos.

Consulte o [README](https://github.com/davidkalil10/NS2ToolKit#readme), os [créditos e licenças](https://github.com/davidkalil10/NS2ToolKit/blob/v0.1.0/THIRD_PARTY_NOTICES.md) e os [incidentes conhecidos](https://github.com/davidkalil10/NS2ToolKit/blob/v0.1.0/docs/INCIDENTES.md).
