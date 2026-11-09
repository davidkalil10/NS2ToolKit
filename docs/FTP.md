# Arquivos do console via FTP

**Release 0.1.6:** protocolo, adaptador simulado e APIs FTP do Windows testados no PC; montagem e listagem de SD e USER confirmadas no console real em 08/11/2026. O registro abaixo distingue esses testes da validação das raízes virtuais da 0.1.7.

**Desenvolvimento 0.1.7:** raízes virtuais Jogos/Saves implementadas e primeira leitura validada no FireRed em console real. A release pública 0.1.6 permanece como referência do acesso direto a SD/USER.

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

### Jogos e saves na navegação

Na release 0.1.6, o FTP expõe o armazenamento como ele está organizado pelo sistema. `Interno/Contents`, `Interno/save` e `Interno/saveMeta` não são os diretórios de arquivos já montados pelos módulos de backup. Seus nomes e identificadores não oferecem, por si, a mesma identificação amigável de jogo, usuário e save apresentada no assistente.

O backup de saves consulta o inventário e abre o save selecionado por um serviço específico, obtendo uma árvore de arquivos como `FireRed_e.sav`. O backup de jogos resolve e abre as seções do conteúdo selecionado, incluindo base e atualização quando aplicável. O FTP atual abre apenas as raízes SD e USER; não executa essas montagens por jogo ou save.

A build 0.1.7 acrescenta a opção **Mostrar jogos e saves por nome**, marcada por padrão. Desmarcar mantém o acesso direto da 0.1.6. As novas raízes são somente leitura:

```text
Jogos/
  Nome do jogo [ID]/
    Base/programa 0/romfs/
    Base/programa 0/exefs/
    Atualizações/65536/programa 0/romfs/
    DLC/ID/versão/Base/programa 0/romfs/
Saves/
  Nome do jogo [ID]/
    Usuário identificador - Principal - índice 0 [save identificador]/
      arquivos do save
```

As pastas são virtuais: não criam diretórios novos no console. A listagem consulta o inventário; a abertura de uma seção ou save ocorre quando seu conteúdo é solicitado. Apenas uma seção/save permanece aberto por vez. O leitor reaproveita a seleção de conteúdo e o tratamento de licença dos backups. RomFS usa leitura das tabelas do sistema de arquivos, sem baixar o jogo inteiro para montar a árvore.

O nome vem do inventário de jogos disponíveis. Saves de títulos sem nome disponível usam `Jogo [ID]`. Usuários são identificados pelo UID, sem prometer a exibição do apelido do perfil; tipo, rank, índice e ID do save impedem misturar arquivos distintos. O save é aberto pelo comando de leitura 53. A restauração continua no módulo próprio, que oferece cópia de segurança, commit e verificação; copiar arquivos sobre contêineres em `Interno/save` não equivale a esse procedimento.

Os números em Atualizações e DLC são as versões internas do conteúdo. Manuais de atualizações são recusados neste modo devido às limitações conhecidas dessa montagem. Recusas conhecidas de acesso aparecem como erro FTP; falhas de transporte ou limpeza incerta encerram o FTP e exigem recuperação da sessão. O inventário é mantido durante a montagem: desmonte e monte novamente após alterar os títulos disponíveis.

### Verificação no console em 08/11/2026

Uma consulta FTP somente de leitura confirmou `/SD` e `/Interno`. A raiz do SD apresentou `Nintendo`; USER apresentou `PRF2SAFE.RCV`, `temp`, `Album`, `Contents`, `save` e `saveMeta`. Foram consultadas somente essas listagens de raiz, sem download, upload, alteração de arquivo ou montagem adicional de jogo/save. O endereço local e a porta pertencem à sessão e não devem ser fixados no aplicativo.

Na implementação 0.1.7, outra consulta somente leitura encontrou 16 jogos e 38 títulos com saves. No FireRed, listou `transaction.sav` e `FireRed_e.sav`; duas leituras de `FireRed_e.sav` (131.072 bytes) produziram o mesmo SHA-256. Foram lidas as seções control, RomFS e ExeFS, com download de `control.nacp` e `main.npdm`. A retomada dos últimos 8.192 bytes de `FireRed_e.gba` foi repetida e comparada. A montagem foi encerrada com confirmação de limpeza, liberação da trava e verificação da saúde da sessão 4/4. Não houve escrita de arquivos no console nem restauração de save. Esse teste não valida todos os jogos, DLCs ou atualizações.

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
- Na 0.1.7, `painel-ftp-virtual.test.cjs` cobre abertura sob demanda, usuários/arquivos distintos, offset de RomFS, preparação de licença limitada, recusa de escrita e ordem de limpeza. `test-painel-ftp-virtual.py` usa FTP real contra armazenamento simulado para nomes UTF-8, downloads, retomada e permissões.

No console, validar primeiro listagem e cópia de um arquivo pequeno; depois, um envio pequeno para uma pasta nova do SD, comparar bytes, desmontar e confirmar que backups continuam disponíveis na mesma sessão. Desempenho e compatibilidade do Explorer devem ser registrados separadamente dos testes simulados.
