# Adaptador experimental de montagem

Cópias derivadas de `engine/mounts.cjs` e `engine/program.cjs` do OunceCake, revisão `43dd500a10f7fef62a2c6d60b9f67851d3371dc6`, por misshexa66/Hexa e contribuidores, sob GPL-2.0 (LICENSE preservada).

O perfil `full` preserva os caminhos da revisão de origem. O perfil optativo `compatibility` omite somente manuais, registra os caminhos omitidos e tenta abrir diretamente Programas de índice superior a zero. Base, atualizações distintas e todos os índices de programa continuam sendo enumerados; não há seleção global da maior versão nem descarte da melhoria Switch 2. A rota direta é inspirada no fork pulchrasmash `04317dc`, sugerido na discussão upstream, sem importar suas outras mudanças.

A omissão dos manuais é uma seleção explícita de escopo, não uma correção da montagem completa. A abertura direta de programas secundários ainda precisa de validação por título no console; recusas e timeouts continuam sendo erros. Não há fallback automático depois de uma requisição incerta.

As outras dependências continuam importadas do submódulo fixado. Não foram alterados o exploit, os tempos de espera ou o código de manipulação do contexto nativo. Consulte docs/TESTE-MONTAGENS.md para o roteiro.
