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

**Estado:** observado; melhoria de interface planejada.

O backend pode reunir a falha original e falhas de limpeza. O painel atualmente mostra essa mensagem agregada, podendo repetir o erro e ocupar várias linhas.

**Melhoria proposta:** título curto em português, primeira causa em destaque, indicação de fase e duração, detalhes de limpeza separados e botão de registros. A barra de download deve distinguir preparação sem total conhecido de cópia com contagem de bytes.

## Registro de um novo incidente

Registrar: revisão, operação, fase, resultado esperado, primeiro erro, estado da limpeza, recuperação e evidência mínima anonimizada. Hipóteses devem ser identificadas como hipóteses; uma tentativa bem-sucedida posterior não fecha automaticamente um incidente de compatibilidade.
