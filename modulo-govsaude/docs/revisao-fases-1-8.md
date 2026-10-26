# Revisão das Fases 1–8 contra o catálogo oficial

Data: 2026-10-26. Fonte: Anexo B (requisitos B.1–B.12) e Anexo H (roteiro de
PoC, Lote 02) do Termo de Referência de Farol/PR, transcritos em
`docs/catalogo-lote02.md`.

## Método

1. Transcrição dos 411 requisitos do Anexo B para o repositório.
2. Comparação, requisito a requisito, do texto oficial com o que cada fase
   entrega (rotas, regras e testes), resultando na nova matriz
   `docs/rastreabilidade.md`.
3. Leitura dos cenários de PoC do Lote 02 que tocam as Fases 1–8 para
   priorizar lacunas.
4. Verificação no código de duplicidades, rotas sem ID e desvios das regras
   invioláveis.

## Principal achado

Até aqui os IDs eram **inferidos** da descrição das fases. Comparados com o
catálogo, havia muitos números trocados nas Fases 2, 4, 5, 6, 7 e 8. Exemplos:
retroativo do PEC citado como B.6-056 (é B.6-036), curva ABC como B.4-039 (é
B.4-026) e retroativo odontológico como B.3-013 (é B.3-016). A matriz, as
docstrings das Fases 5, 7 e 8, as descrições das configurações e os nomes dos
testes foram corrigidos.

## Corrigido nesta revisão

| Item | Problema | Correção |
|---|---|---|
| Alergias/problemas duplicados | A Fase 5 tinha tabelas próprias (`alergias`, `problemas_clinicos`) paralelas às do cadastro (Fase 2). A alergia cadastrada na recepção não gerava alerta na prescrição | O PEC passa a usar `cidadao_alergias`/`cidadao_condicoes`. A alergia ganhou `codigo` do agente para o alerta. O profissional com `prontuario:editar` registra alergia/condição. O atendimento exibe as alergias ativas (B.6-015) |
| Sigilo por especialidade (B.6-035; PoC cenário 1) | Só havia o booleano `sigiloso` | `nivel_sigilo` (`NORMAL`, `RESTRITO_ESPECIALIDADE`, `SIGILOSO`) + `especialidade_id` no atendimento e nos registros. Só a especialidade autorizada (ou quem tem permissão de sigilo) vê; os demais recebem 404 ou a linha do tempo velada |
| Recepção → triagem → consulta (PoC cenário 3) | Fila (Fase 4) e atendimento do PEC (Fase 5) não se ligavam | `fila_id` no atendimento: mesmo cidadão, fila ativa, uma fila gera um atendimento e a unidade é herdada |
| Controlados (B.4-035) | Qualquer perfil com `estoque:movimentar` movimentava controlado | Nova permissão `estoque:controlados` (perfil farmacêutico) exigida para movimentar, dispensar e estornar controlado |
| Baixa de vencido (B.4-012) | O lote vencido ou bloqueado não podia sair do estoque, salvo por ajuste | Tipos `VENCIMENTO` (exige lote vencido) e `QUEBRA`; perda/quebra/vencimento retiram lote indisponível |
| B.4-004/007/023/027 | Faltavam estoque ideal, centro de custo, comprovante e pedidos pendentes no saldo | Implementados; a sugestão de compra usa o ideal antes do máximo |
| B.3-022 | Faltava a lista de procedimentos odontológicos atrasados | `GET /odontologia/procedimentos?atrasados=true` |
| B.6-017 | Plano de cuidados sem vigência | `vigencia_inicio`/`vigencia_fim` |

As migrações `0006` e `0009` foram editadas em vez de criar uma nova, porque o
GovSaúde ainda não está na `master` e nenhum ambiente deveria tê-las aplicado.
Se algum ambiente de teste rodou a branch, as tabelas órfãs `alergias` e
`problemas_clinicos` devem ser removidas manualmente.

## Lacunas abertas, por prioridade

### Afetavam cenários críticos da PoC — fechadas

| Lacuna | Entrega | Teste |
|---|---|---|
| 1. Anexos genéricos (B.12-054, B.6-029, B.3-012) | `/anexos`: PDF/imagem validados (lista branca, magic number, antivírus), classificação, autoria, sigilo herdado do atendimento, listagem velada, download auditado, baixa lógica | `test_lacunas_revisao.py::test_b12_054_b6_029_*` |
| 2. Impressão/relatórios (B.12-055, B.6-047/048/049, B.3-017/019/021, B.4-028) | `/relatorios/*` em JSON/CSV/XLSX/PDF com orientação e comparativo do período anterior; ficha odontológica em PDF | `test_b6_048_049_b12_055_*`, `test_b3_017_019_021_*`, `test_b6_047_*` |
| 3. Rastreabilidade por lote (B.4-036) | `/estoque/lotes/{id}/rastreabilidade` | `test_b4_019_028_036_*` |
| 4. Prescrição para a farmácia (B.4-019) | `/estoque/cidadaos/{id}/prescricoes` (só itens, saldo no local, já dispensado) | idem |
| 5. Visita do ACS (B.1-019) | Motivos, busca ativa, acompanhamento, controle ambiental, medições (IMC calculado), desfecho, domínios configuráveis | `test_b1_019_*` |

O aplicativo offline (B.1-031/032, B.11) continua para a Fase 15.

### Funcionais (não críticas na PoC)

- Fase 2: filiação completa (só mãe), local de trabalho, cadastro de
  logradouros/bairros (B.1-003/004/006).
- Fase 3: transferências territoriais, estratificação de risco familiar,
  metas por ACS/grupo, trajetos, dashboards (B.1-012, 017, 025…030).
- Fase 4: visão resumida do cidadão na recepção (B.6-002) e relatório
  agregado de tempos (B.6-047).
- Fase 5: protocolos estruturados (B.6-009), regras de exame (B.6-018),
  observação/internação (B.6-028), ocorrências, produção programada e
  benefícios (B.6-042…044), busca no prontuário (B.6-058), modelos de
  documento/receituário (B.6-032/034).
- Fase 6: seeds de planejamento reprodutivo e climatério (B.2-007/008),
  fornecimento ↔ dispensação (B.2-010), relatórios por recortes (B.2-012).
- Fase 7: estratificação de risco, assinatura, modelos de documento,
  integração com estoque, sigilo por nível (B.3-014/015/023/025/026).
- Fase 8: kits/etiquetas/código de barras, livros 344/BMPO, integração
  contábil, importação de tabelas, APIs de equipamentos, contingência (B.4-008,
  010, 011, 013, 024, 025, 029, 038…040, 043).

### Qualidade e conformidade às regras do projeto

- **Regra 1 (ID na rota):** resolvido — todas as rotas de negócio citam o
  requisito na docstring; só health, jobs, sync interno e configuração
  (infraestrutura transversal, isenta pela regra) não citam.
- **Lint:** resolvido em `app/` (`ruff check app alembic` limpo); os testes
  antigos ainda têm linhas longas.
- **Regra 3 (nada de DELETE físico):** `agendas.py` apaga os horários da
  grade ao editá-la. Não é dado clínico, mas perde o histórico da grade.
  Recomenda-se vigência por horário.
- Especialidades não têm CRUD; hoje vêm de seed ou do banco.

## Recomendação antes da Fase 9 (situação inicial)

Atacar primeiro as lacunas 1–4 da PoC, que são transversais e baratas perto
do peso delas no aceite (cenários 1, 3, 4 e 6 somam 44 dos 100 pontos), e
colocar IDs nas docstrings das Fases 1–4 e 6. A visita do ACS (item 5) pode ir
junto com a Fase 15, que trata do aplicativo offline.
