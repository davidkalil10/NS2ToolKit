# Incidentes conhecidos

Atualizado em 5 de novembro de 2026. Os exemplos preservam mensagens técnicas e removem caminhos e inventários pessoais.

## INC-001 — operação nativa não termina na etapa 2

**Estado:** mitigação do fluxo e diagnóstico implementada; confiabilidade do exploit permanece limitada.

Mensagem inicial: `Native batch did not terminate; resources retained`.

Novas tentativas automáticas na mesma sessão produziram mensagens de tempo esgotado e de conexão indisponível. Elas não devem substituir a primeira causa. O supervisor agora bloqueia essas repetições quando a limpeza não está confirmada e guarda o primeiro log.

**Recuperação:** reiniciar completamente o console antes de outra aquisição. Não repetir comandos do bootstrap sobre o estado anterior.

## INC-002 — tempo esgotado ao preparar conteúdo de uma atualização

**Estado:** reproduzido pelo usuário; causa final não estabelecida; diagnóstico pendente.

A captura e o log mostram uma sequência de aberturas de conteúdo até `/updates/<versão>/program/1/romfs`, seguida de `Console response timed out; restart the application`. Não aparece o evento de início da cópia nem a confirmação de servidor FTP pronto naquela tentativa.

**O que sabemos:** a falha antecedeu o download. No [transporte do console](../engine/lib/connection.cjs), a espera após o pareamento é de 120 segundos, e o tempo esgotado invalida a conexão. Existem ainda prazos distintos na [ponte HTTP](../engine/shared/rpc.cjs) e no adaptador do OunceCake. Não há um único prazo global que possa ser aumentado com segurança sem analisar a operação.

**O que não sabemos:** se a operação excedeu o prazo apesar de estar progredindo, se travou, ou se uma condição específica da montagem perdeu a resposta. Não está comprovado que tamanho, rede, versão de atualização ou compatibilidade de conteúdo seja a causa isolada.

**Efeito posterior observado:** falhas adicionais na limpeza e desaparecimento do endpoint local da sessão. Depois de um tempo esgotado nativo, o resultado da operação é incerto; a requisição não deve ser repetida automaticamente.

**Recuperação:** guardar os registros, encerrar a sessão e reiniciar o console. Uma nova tentativa precisa começar de uma sessão nova.

**Próximos dados necessários:** duração e identificação de cada abertura, fase da preparação, revisão da ferramenta, conteúdo base/atualização/DLC e indicação de liveness independente da operação pendente. Não coletar arquivos do jogo para o Git.

## INC-003 — conteúdo exige outra forma de montagem

**Estado:** observado em outros registros; suporte do adaptador pendente.

Mensagem: `Content requires an original-content mount; standalone ES preparation does not apply`.

É uma recusa explícita de um caminho de preparação de conteúdo, distinta de um tempo esgotado. A mesma preparação foi recusada em mais de uma tentativa local. Esperar mais tempo não altera essa recusa.

**Próximo passo:** revisar a combinação base/atualização e o caminho de montagem suportado pela revisão fixada do OunceCake. Uma mudança de fork deve passar por comparação e testes antes de substituir a dependência do checkpoint.

## INC-004 — mensagem técnica repetida ou pouco legível no painel

**Estado:** resumo em português, eventos com horários e duração implementados; teste no console pendente.

O backend pode reunir a falha original e falhas de limpeza. O painel atualmente mostra essa mensagem agregada, podendo repetir o erro e ocupar várias linhas.

**Melhoria implementada:** resumo curto em português, eventos com fase/operação/duração e preservação da primeira causa separada dos erros posteriores. A barra fica indeterminada na preparação e usa bytes na transferência. Isso não corrige por si só as montagens dos incidentes 002 e 003.

## Registro de um novo incidente

Registrar: revisão, operação, fase, resultado esperado, primeiro erro, estado da limpeza, recuperação e evidência mínima anonimizada. Hipóteses devem ser identificadas como hipóteses; uma tentativa bem-sucedida posterior não fecha automaticamente um incidente de compatibilidade.

## INC-005 — Split Fiction: manual da atualização e bloqueio excessivo

Em 06/11/2026, a preparação abriu as seções anteriores e recusou `/updates/262144/program/0/manual` com `GAME_ORIGINAL_CONTENT_REQUIRED`: o caminho de preparação ES isolada não atende a esse conteúdo, que exige montagem com o original. Não foi um timeout de transferência. A limpeza auxiliar foi confirmada.

O adaptador e a interface marcavam qualquer falha como sessão inválida, inclusive essa recusa com limpeza concluída. A correção 0.1.1 só permite reutilização para a recusa conhecida, sem erros de limpeza/restauração e após verificar RPC e identidade do endpoint retido. Não remove marcas antigas de invalidação. A liberação é testada com simulação; o dump completo do manual ainda requer investigação de montagem e teste no console. A falha não é contornada por espera maior.

## INC-006 — nome e ícone ausentes na lista de NUPs

A revisão NUP fixada enumera os tipos TLV a partir de zero, divergindo da própria SPEC seção 5 e do leitor Eglantine `0d86405bd1836f01d708abcdecc564465864a8cd`, que usa 1–10. O nome era escrito no tipo 4 (versão), em vez de 5 (nome), e o adaptador não adicionava os ícones aos metadados. Os IDs de programa nos arquivos examinados estavam corretos.

A correção local ajusta apenas as constantes exportadas da biblioteca no processo do adaptador e inclui imagens/idiomas do controle extraído. O submódulo permanece inalterado. Testes verificam os números binários 0x0001, 0x0003–0x0006 sem depender das constantes corrigidas. Cinco NUPs reais foram reconstruídos, verificados integralmente e comparados com as árvores de origem. A exibição corrigida de nome e imagem foi confirmada em teste manual no Eglantine em 06/11/2026.

Referências: [SPEC v1 fixada](https://github.com/a55uka/nup/blob/d40d9cfa50792ba8021d2967d994d1b1c25d62b0/SPEC.md), [leitor do Eglantine na revisão examinada](https://github.com/Djihads80/Eglantine/blob/0d86405bd1836f01d708abcdecc564465864a8cd/src/core/file_sys/nup_container.cpp).
