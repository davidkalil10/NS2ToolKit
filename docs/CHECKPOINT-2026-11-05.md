# Checkpoint funcional — 5 de novembro de 2026

## Configuração

- Windows, Node.js 22.16.0 e Python 3.13.4.
- Switch 2 sistema 23.0.1 e SmileBASIC completo 4.4.9 na memória interna.
- PC e console conectados por Ethernet.
- ns2jb baseado em kurumuz `81d5bb114c856109dadaf1077d927a9f297fe58d`, com adaptações Windows e interrupção após limpeza incerta.
- OunceCake fixado em `43dd500a10f7fef62a2c6d60b9f67851d3371dc6`.

## Evidência observada localmente

O resultado confirmou `verified: true` no bootstrap e nos testes de execução no FS. Dois desafios de instrução do FS passaram, com `restored: true`. A sessão RPC chegou ao estado `listening`, com endpoint disponível e limpeza desse endpoint adiada enquanto a conexão permanecia aberta. Os arquivos temporários do doador foram limpos.

Um backup real concluiu seis arquivos e 34.708.992 bytes. O manifesto estava com `complete: true`, e o registro do adaptador continha o evento final `complete`, sem evento de erro. Isso confirma a transferência e o encerramento do OunceCake daquela operação. Não significa que a sessão RPC principal já foi encerrada nem que todos os títulos do console foram testados.

Registros integrais, caminhos locais, endereços de rede, identificadores de sessão e dados do jogo ficam fora do Git. Este relatório resume indicadores observados, sem distribuir conteúdo extraído do console.

## Limitações

- A etapa 2 permanece instável; outras tentativas falharam com operações nativas pendentes.
- A rotina de abrir outro jogo após reiniciar foi usada antes do sucesso, mas a relação causal não foi estabelecida.
- Hashes de backup são locais; não há comparação com hash fornecido pelo console.
- A validação cobre uma configuração e um backup, não todos os jogos, redes ou computadores.
- HBLauncher, saves, chaves e imagens instaláveis NSP/XCI não fazem parte deste checkpoint.

Siga o [README](../README.md) para reproduzir, mantendo o executável, os fontes e o submódulo juntos.
