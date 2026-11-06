# Documentação do NS2ToolKit

Este diretório registra evidências, decisões e trabalho planejado. Uma função só deve ser apresentada como validada depois de teste no console e verificação do resultado no PC.

| Documento | Finalidade |
| --- | --- |
| [Checkpoint de 05/11/2026](CHECKPOINT-2026-11-05.md) | Configuração e resultados do primeiro checkpoint funcional |
| [Aprendizados](APRENDIZADOS.md) | O que foi observado, o que isso permite concluir e o que permanece incerto |
| [Incidentes](INCIDENTES.md) | Falhas conhecidas, diagnóstico e recuperação |
| [Decisões](DECISOES.md) | Escolhas adotadas e propostas ainda não implementadas |
| [Roadmap](ROADMAP.md) | Ordem sugerida das melhorias e critérios de conclusão |
| [Compatibilidade](COMPATIBILIDADE.md) | Limites de homebrew, saves e acesso a arquivos |
| [Backup de saves](SAVES.md) | Uso, escopo e validação pendente do novo módulo de leitura |
| [Empacotamento NUP](NUP.md) | Interface e adaptador CLI, uso e limites dos layouts suportados |
| [Validação NUP](VALIDACAO-NUP-2026-11-05.md) | Resultados dos dois backups próprios gerados/verificados |
| [README do ns2jb de origem](NS2JB-UPSTREAM.md) | Instruções preservadas da base utilizada |

## Como manter estes documentos

- Diferenciar **observado localmente**, **documentado pelo fornecedor**, **hipótese** e **planejado**.
- Registrar data, revisão do código, operação, resultado esperado e resultado observado.
- Não versionar saves, jogos, inventários pessoais, identificadores de usuário, endereços de rede ou logs brutos.
- Conservar o primeiro erro: falhas de limpeza posteriores não substituem a causa inicial.
- Atualizar o roadmap apenas quando houver evidência para mudar o estado de um item.
- Preservar as tags de checkpoints; melhorias posteriores recebem novos commits e novas validações.

As fontes externas foram consultadas em **5 de novembro de 2026**. Elas podem evoluir e devem ser conferidas novamente antes da integração.

- [Distribuição portátil e geração de NUP pela interface](PORTATIL.md).

- [Perfis experimentais de montagem e roteiro de teste](TESTE-MONTAGENS.md).
