# Decisões

## D-001 — preservar checkpoints e separar evidência de expectativa

**Estado: adotada.** A tag `checkpoint-2026-11-05` permanece como referência do estado validado. Novas funções e resultados posteriores serão documentados em novos commits, sem substituir essa tag.

Uma confirmação de 4/4, um backup completo e compatibilidade universal são afirmações diferentes. O painel e a documentação devem preservar essa distinção.

## D-002 — não repetir operações nativas de resultado incerto

**Estado: adotada no supervisor de aquisição; extensão planejada aos módulos.** A repetição só é permitida após confirmação de que não deixou recursos pendentes. Após perda de resposta, a aplicação deve orientar recuperação e preservar a causa original.

Aumentar prazos indiscriminadamente e repetir uma chamada após tempo esgotado não são correções aceitas para uma operação cujo resultado é desconhecido.

## D-003 — prioridade inicial: diagnóstico dos backups

**Estado: confirmada pelo usuário.** Diagnóstico de backups, depois backup de saves e então restauração. A instrumentação inicial foi implementada; falhas de montagem ainda precisam de investigação no console.

## D-004 — tratar saves como arquivos gerenciados, com identidade e transação

**Estado: leitura implementada, restauração proposta.** A seleção identifica jogo, usuário e arquivo pelo inventário de saves. A leitura ainda aguarda validação no console.

O primeiro marco deve ser listar e copiar sem escrita no console. Restauração deve exigir backup anterior, plano concreto dos arquivos, verificação da origem e destino, confirmação de substituição e releitura do resultado. Arquivos excedentes e diferenças entre versões precisam de política explícita.

A confirmação de restauração pertence à interface do programa e ocorre depois de apresentar o plano. Não basta disponibilizar uma pasta FTP e considerar que arrastar arquivos restaura corretamente o save.

## D-005 — oferecer acesso a arquivos por escopo

**Estado: proposta; interface FTP dedicada ainda não implementada.** Distinguir exportação de conteúdo do jogo, arquivos do SmileBASIC e saves de outros títulos. Exibir o escopo e o modo de acesso antes de iniciar.

O FTP já usado internamente pelo OunceCake é de leitura. Um serviço com escrita exige tratamento próprio de commit, interrupções e permissões. Não prometer acesso irrestrito ao microSD ou ao armazenamento interno.

## D-006 — uma operação por sessão em cada momento

**Estado: implementada para jogos e saves.** Um lock por sessão impede operações sobrepostas; uma marca local bloqueia reutilização após falha. As janelas modais impedem encerrar a sessão principal por trás delas. Ferramentas externas que não usam esse lock exigem coordenação manual.

## D-007 — dependências fixadas e integração revisada

**Estado: adotada para OunceCake; requisito para futuras integrações.** Manter origem, revisão e licença. Patches externos devem ser analisados individualmente, sobretudo quando alteram IPC ou aquisição do FS. Não aplicar todos os patches de outra ferramenta automaticamente à base validada.

## D-008 — HBLauncher não implica suporte automático a NRO

**Estado: premissa de compatibilidade.** A integração de um launcher será avaliada separadamente da adaptação de cada port. Nenhum binário de Switch 1 será anunciado como compatível apenas por usar a mesma família de arquitetura.

## D-009 — leitura de saves sem patches amplos

**Estado: adotada neste marco.** O módulo seleciona saves Account/Device pelo inventário User. Reutiliza a biblioteca de atributos do ns2-savekit e as APIs de leitura já presentes. Não aplica patches de escrita nem altera a aquisição do FS. As necessidades da restauração serão reavaliadas separadamente.

## D-010 — empacotamento NUP separado da extração e da execução

**Estado: adotada no adaptador CLI de P5.** O empacotador consome backups completos no PC, preserva os originais, verifica a saída e compara as árvores. Dois backups foram testados a pedido do usuário. Não usar empacotamento para ocultar arquivos ausentes. DLC e outros índices são recusados nesta versão. Integridade e compatibilidade no emulador são validações distintas.
