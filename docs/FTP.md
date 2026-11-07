# Arquivos do console via FTP

**Estado: build de teste 0.1.6. Protocolo, adaptador simulado e APIs FTP do Windows testados no PC. Montagem dos armazenamentos e transferências no console real ainda pendentes.**

## Usar no assistente

1. Mantenha uma sessão 4/4 aberta e clique em **Arquivos / FTP**.
2. Para enviar arquivos novos ao SD, marque a opção correspondente antes da montagem. Sem ela, todo o acesso é somente leitura.
3. Clique em **Montar FTP**. O assistente consulta os armazenamentos, mostra os que conseguir abrir e solicita a abertura do endereço no Explorer.
4. Navegue em `SD` e `Interno`. Ao terminar, clique em **Desmontar FTP** e aguarde a confirmação de limpeza antes de usar outro módulo ou encerrar a conexão.

**Abrir no Explorer** reabre o endereço; **Copiar endereço** permite usar outro cliente FTP. A janela do Explorer ainda requer teste no ambiente final; os testes locais usam o protocolo real e as APIs WinINet do Windows.

## Escopo

- `SD`: arquivos do cartão; leitura e download, com envio de arquivos e criação de pastas opcionais.
- `Interno`: sistema de arquivos da partição interna USER, somente leitura. Não inclui SYSTEM, calibração ou armazenamento bruto.
- Somente raízes que abriram são anunciadas. Recusas aparecem na janela; não são substituídas por pastas fictícias.
- Saves e conteúdos instalados encontrados nesses armazenamentos podem ser contêineres do sistema. Para backup/restauração de saves e dump de jogos, utilize os módulos próprios.

Não há exclusão, renomeação, sobrescrita ou retomada de upload. Copiar sobre um nome existente é recusado; para a primeira versão, use um nome ou pasta novo. Downloads aceitam retomada por offset. Datas de listagem usam 1970 como referência, pois a consulta de diretórios não fornece timestamps.

## Envio de arquivos novos ao SD

O envio opcional aceita até **1 GiB por arquivo**. O arquivo é recebido primeiro numa área temporária do PC, com limite de espaço livre; só depois é criado no SD, de forma exclusiva. O assistente verifica o envio dos blocos, faz flush, reabre o arquivo e compara tamanho e SHA-256 antes de confirmar a transferência. A memória interna continua bloqueada para escrita em todos os modos.

Se cancelar enquanto o PC recebe os dados, nenhum arquivo é criado no console. Depois que a criação/escrita no SD começa, aguarde a verificação antes de desmontar. Falha nessa etapa pode deixar um arquivo novo incompleto: não há remoção automática nem repetição de chamada incerta. O relatório registra o caminho e o resultado em `ftp-uploads` na pasta privada da sessão. Os dados temporários do PC são removidos após a tentativa.

## Como funciona

O servidor escuta somente em `127.0.0.1`, numa porta livre do PC, e encaminha operações pela sessão RPC existente. Não precisa digitar o IP do Switch nem expor uma porta FTP à rede local. O protocolo é FTP; não adiciona uma unidade com letra ao Windows.

Uma fila serializa as chamadas ao console, e a montagem mantém a trava de operação até a desmontagem. Outros backups/restaurações não são executados ao mesmo tempo. Encerrar fecha conexões de dados e controle, aguarda operações pendentes e confirma a liberação dos recursos auxiliares. Falha incerta ou limpeza não confirmada invalida a sessão.

Os comandos foram conferidos no [libnx, serviços FS](https://github.com/switchbrew/libnx/blob/master/nx/source/services/fs.c): abertura de SD (18), USER (11, partição 30), criação exclusiva de arquivo (0), criação de pasta (2) e leitura/escrita de arquivos. Não foi alterado o mecanismo de aquisição. A integração Windows usa os comportamentos documentados para [sessões FTP WinINet](https://learn.microsoft.com/en-us/windows/win32/wininet/ftp-sessions), incluindo modos passivo e ativo.

## Validação local e próximo teste

- Testes Node: seleção de SD/USER, ausência de SD, permissões, criação exclusiva, releitura, erro sem repetição, desmontagem, liberação da trava e recuperação após recusa conhecida.
- `test-painel-ftp.py`: cliente FTP real contra armazenamento simulado; PASV, EPSV, PORT, UTF-8, listagem, download, retomada, envio, permissões e serialização de clientes.
- `Testar-FTP-Windows.ps1`: WinINet do Windows, com listagem, download binário e upload, em modos passivo e ativo, sem console.
- O teste portátil exercita a alternância Montar/Desmontar, sem abrir o Explorer nem conectar ao Switch.

No console, validar primeiro listagem e cópia de um arquivo pequeno; depois, um envio pequeno para uma pasta nova do SD, comparar bytes, desmontar e confirmar que backups continuam disponíveis na mesma sessão. Desempenho e compatibilidade do Explorer devem ser registrados separadamente dos testes simulados.
