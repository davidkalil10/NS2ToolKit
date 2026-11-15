# NS2ToolKit 0.1.10

Ative o homebrew pela mesma conexão 4/4 usada na tela inicial, sem repetir os comandos no SmileBASIC.

- Botão **Ativar Homebrew** disponível quando a conexão compatível está mantida aberta.
- Etapas guiadas para aguardar kaiHEN, fechar SmileBASIC sem reiniciar e abrir um jogo nativo de Switch 2 segurando R para entrar no hbmenu.
- Corrige a validação da prova FS, que recusava sessões saudáveis ao procurar a confirmação de restauração fora das duas tentativas detalhadas.
- Mantém exclusividade da sessão durante a ativação e os registros de falhas; depois de ativar homebrew, reinicie antes de voltar a backups ou FTP.
- Ativação pela conexão mantida e abertura do hbmenu confirmadas em console. A limpeza do endpoint FS após fechar o SmileBASIC registrou erro no teste; os registros são preservados e isso não foi tratado como limpeza concluída.

O portátil Windows x64 inclui as dependências necessárias. Extraia o ZIP em uma pasta nova e use **Abrir NS2.cmd**. Para usar a ativação pela conexão mantida, abra uma nova sessão pelo toolkit desta versão. Créditos e fontes dos componentes acompanham o pacote.
