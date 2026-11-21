# Atualização do kaiHEN

## Versão 0.1.11

Este portátil inclui **kaiHEN 20261117.1**, cujo ZIP oficial tem SHA-256 `3f7ded0b360b2f0bf97f8e958c3bfe93a8d76dd8d43ce2e8f7d060e647ad0978`. Reconexão 4/4 e reativação do hbmenu com esta versão foram confirmadas no console em 21/11/2026.

A atualização mantém o host Windows e a transição pela conexão 4/4. A comparação dos fontes do bootstrap e do frontend RO com 20261114d não encontrou alteração no contrato de entrada usado pelo host. O bootstrap muda a consulta de conclusão do lançamento para uma flag atômica. A validação posterior confirmou o fluxo 4/4 → ativação → hbmenu no console. Outros comportamentos exigem testes específicos.

## Testar no console

1. Extraia o novo ZIP em outra pasta. Preserve o portátil 0.1.10 para comparação ou retorno.
2. Reinicie o console para encerrar o kaiHEN anterior. Abrir outro portátil no PC não atualiza o HEN que já está rodando.
3. Abra o SmileBASIC e faça a conexão 4/4 pelo novo portátil. O programa `NS2` salvo e os comandos continuam os mesmos nesta atualização; use o endereço de rede mostrado pelo assistente.
4. Clique em **Ativar Homebrew**. A janela deve mostrar **kaiHEN 20261117.1**. Siga as mensagens até poder fechar o SmileBASIC, sem reiniciar novamente.
5. Abra um jogo nativo de Switch 2 segurando R; se o jogo abrir normalmente, feche-o e repita com R para abrir o hbmenu.
6. Teste um NRO de Switch 2 já aprovado, como um dos Heroes Lore. Confira controles, áudio, abertura e saída. Teste Netloader separadamente se desejar.

A reinicialização e a nova ativação não apagam os NROs ou saves. Não é necessário repetir a digitação do programa BASIC. Não use backups ou FTP da conexão antiga depois da transição para HEN; reinicie antes de voltar a esses módulos.

## Configuração única

`integrations/kaihen/kaihen-config.json` define:

- versão e revisão do kaiHEN;
- URL, nome e hash do ZIP oficial;
- revisão do host e adaptações locais;
- perfil de compatibilidade e contrato do bootstrap;
- revisões, URLs e hashes das fontes correspondentes.

`runtime-manifest.json` e `source-manifest.json` são gerados, não editados manualmente. O aplicativo confere o hash da configuração e os arquivos do pacote. Mudanças apenas em um manifesto ou em um binário são recusadas. A versão exibida na janela, a versão registrada na sessão e os dados de `portable-build.json` vêm da mesma configuração.

## Preparar próximas atualizações

Na pasta de fontes do toolkit:

1. Leia as notas da release oficial e compare o contrato do bootstrap, o frontend RO, o hbloader e as bibliotecas com a versão validada. Atualize o host/perfil quando necessário.
2. Atualize somente `kaihen-config.json` com as revisões e os hashes verificados, incluindo fontes/licenças correspondentes. Não marque uma revisão incompatível com o perfil antigo apenas para fazê-la passar.
3. Execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Atualizar-Kaihen.ps1
```

O comando prepara as fontes, baixa o ZIP para arquivo temporário, confere o SHA-256, valida nomes e limites do arquivo e extrai em uma pasta nova. Só aceita o cache depois de conferir os arquivos. Não conecta ao console. `-Offline` usa exclusivamente arquivos já conferidos no cache.

4. Gere outro portátil:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Empacotar-Portatil.ps1 -Offline -OutputRoot D:\Games\NS2ToolKit-releases
```

5. Teste a ativação no console antes de publicar. A configuração facilita a troca de versões, mas não garante compatibilidade com mudanças futuras de protocolo, firmware ou SDK.

Não há atualização silenciosa para “latest”. O comando de manutenção exige a pasta de fontes: um portátil extraído deve ser substituído por outro pacote completo, evitando misturar arquivos antigos e novos. As pastas de cache usam a versão no nome e a preparação não remove o cache anterior. Se a atualização for recusada, corrija/reverta a configuração e gere novamente; o aplicativo não deve usar um pacote parcialmente preparado.

## Verificações locais

Os testes cobrem configuração inválida, perfil incompatível, fontes ausentes ou duplicadas, manifesto divergente, alteração de host/payload e ZIP corrompido. O teste de corrupção confirma que o manifesto anterior permanece intacto. O empacotamento testa as janelas e os runtimes incluídos, sem abrir conexão com o console.

Fontes oficiais: [kaiHEN 20261117.1](https://github.com/ouncebrew/kaihen/releases/tag/20261117.1) e [receita de compilação](https://github.com/ouncebrew/kaihen/blob/20261117.1/Dockerfile).
