# Arquitetura — GovSaúde

## Visão

Monólito modular FastAPI, um processo de API, domínios separados por subpacote.
Rotas finas; regra de negócio em `services/` e `motores/`. Um domínio só acessa
outro pela camada de serviço. A Fase 0 entrega a fundação compartilhada; os
domínios clínicos entram nas fases seguintes.

```
Cliente web / apps
       │  HTTPS + JWT (SSO module_access ou login local)
       ▼
FastAPI /api/govsaude/v1
  middleware: request-id, security headers, rate limit
  auth: SSO + fallback local + RBAC + sigilo
  services: regra de negócio
  models: SQLAlchemy async (PostgreSQL)
       │
       ├── Redis pub/sub (SSE)
       ├── MinIO (anexos privados)
       ├── Celery (integrações, relatórios, importações, manutenção)
       └── Outbox integracao_envios (nunca chamada externa na transação)
```

## Multi-tenancy

- `tenant_id` é `organizacoes.id` e está em toda tabela de negócio.
- `get_tenant_id` é fail-closed; toda query de serviço filtra o tenant.
- Acesso cruzado responde **404**, não 403, para não revelar existência.
- Tabelas nacionais ficam no schema `referencia`, sem `tenant_id`.
- O modelo evita `tenant_id` derivado de join para permitir RLS futura.

## Autenticação e autorização

- SSO: token `module_access` da saas-platform, validado com `SAAS_JWT_SECRET`,
  `module == "govsaude"`, provisionamento JIT de organização/usuário/grupos.
- Fallback local: CPF/e-mail/nome de acesso + bcrypt 12 + política + bloqueio +
  MFA TOTP + janela de horário.
- RBAC: permissão `recurso:acao` ∧ escopo (tenant, estabelecimento, equipe,
  especialidade) ∧ nível de sigilo. Implementado em `core/autorizacao.py`.
- `token_version` revoga tokens locais; logout e “revogar sessões” incrementam.

## Sigilo

Níveis `NORMAL`, `RESTRITO_ESPECIALIDADE`, `SIGILOSO`, `SIGILO_DENUNCIA`.
`velar()` devolve metadados mínimos quando o perfil não pode ver o conteúdo.
`SIGILO_DENUNCIA` exige `*:quebra_sigilo`; a quebra exige justificativa de 20+
caracteres e gera evento `QUEBRA_SIGILO`.

## Integrações

- Porta + adaptador + mapeador + validador por sistema, com versão ativa por
  tenant e vigência.
- Outbox transacional `integracao_envios` com estados
  `PENDENTE → VALIDADO → ENVIANDO → ENVIADO → ACEITO/REJEITADO`.
- Sem artefato oficial: o worker **não envia**; marca
  `PENDENTE_ESPECIFICACAO_OFICIAL` e mantém a pendência documentada.
- Retry só para erro transitório; rejeição de negócio vai para correção humana.

## Dados sensíveis

- Criptografia Fernet de coluna para texto clínico, diagnósticos sigilosos,
  denúncias e notas profissionais.
- CPF/CNS normalizado + HMAC para busca exata + ciphertext + máscara.
- Nunca CPF/CNS/nome/diagnóstico em URL, log, cache ou nome de arquivo.
- Anexos em bucket privado, chave opaca, magic number, lista branca e ClamAV.
- Auditoria append-only particionada mensalmente, com trigger no PostgreSQL.

## Assíncrono

- Jobs: `POST` de execução retorna 202 + `job_id`; `GET /jobs/{id}` dá
  progresso; resultado no MinIO com URL curta.
- SSE: Redis pub/sub por `tenant:estabelecimento:setor`, heartbeat quando não há
  evento; escopo de estabelecimento validado antes de abrir o stream.

## Fase 1

A Fase 1 adiciona o subpacote `app/models/rede.py` (serviços/classificações,
horários, escalas, plantões, prioridades, restrições de horário, especialidades
por profissional e importações CNES), os serviços em `app/services/` e os
routers `api/v1/rede.py` e `api/v1/importacoes.py`. Os modelos de fundação
(`estabelecimentos`, `setores`, `equipes`, `profissionais`,
`vinculos_profissionais`, `entes_consorciados`) foram **estendidos**, não
recriados. O importador CNES fica em `app/integracoes/cnes/` e é orientado por
manifesto de layout oficial; sem artefato, retorna
`PENDENTE_ESPECIFICACAO_OFICIAL`.

## Fase 2

O subpacote `app/models/cidadao.py` concentra o cadastro único, documentos,
contatos, endereços, fotos, planos, alergias, condições, duplicidades,
unificações e histórico de baixa. Os serviços em `services/cidadaos.py`,
`cidadao_detalhes.py`, `deduplicacao.py`, `cidadao_fotos.py`,
`consulta_cadsus.py` e `consulta_cep.py` mantêm as rotas finas. A porta CADSUS
fica em `app/integracoes/cadsus/`. A tabela `referencia.ceps` é preenchida
somente por importação oficial; sem base, a consulta é pendente.

## Fase 4

O subpacote `app/models/agenda.py` concentra agenda, horários, bloqueios,
agendamentos, protocolos/níveis de risco, fila, eventos, painéis e chamadas. As
regras ficam em `services/agendas.py`, `agendamentos.py`, `filas.py`,
`paineis.py` e `recepcao.py`; as rotas apenas orquestram. A fila é ordenada em
memória a partir de snapshots de risco/prioridade gravados na entrada e expõe a
regra aplicada. A recepção grava o estado do agendamento e a entrada na fila na
mesma transação; o SSE usa o canal por estabelecimento/setor já existente. A
falta automática é uma tarefa Celery idempotente por estado. Biometria é uma
porta com adaptador pendente: não há template biométrico no banco.

## Fase 6

O subpacote `app/models/programa.py` concentra programas/linhas de cuidado,
itens previstos, inscrições, programação previsto × realizado e busca ativa. O
`app/motores/formularios.py` implementa apenas o subconjunto de JSON Schema
necessário às fichas (sem dependência nova). `app/services/programas.py`
concentra elegibilidade, geração idempotente de programação, indicadores,
lista nominal e estimativa de demanda; `app/services/formularios.py` mantém os
formulários versionados. As rotas ficam em `api/v1/programas.py`,
`inscricoes_programa.py`, `programacoes_programa.py`, `buscas_ativas.py` e
`formularios.py`.

Os seeds nacionais (`garantir_programas_padrao`) criam somente a **estrutura**
dos cinco modelos (mulher, criança, hipertensão, diabetes, gestante), com
formulário próprio, **inativos** e sem periodicidade, faixa etária ou condição
oficial. O tenant valida o protocolo, preenche as regras e ativa o programa.
Elegibilidade bloqueia a inscrição sem justificativa; a exceção é auditada. A
geração de programação é idempotente pelo índice parcial
`(tenant, inscrição, item, data)` e a remarcação preserva o registro anterior
como `REMARCADO`. Toda leitura nominal é filtrada por escopo de estabelecimento
e mascara CPF/CNS; `dados_clinicos` e observações livres só aparecem para quem
tem `programa:gerenciar` ou `prontuario:ler`.

## Decisões relevantes da Fase 0

1. **IDs do módulo preservam o UUID da plataforma** quando o payload traz UUID,
   para que os tokens SSO continuem válidos sem tradução.
2. **Senha local é opcional**: usuários SSO não têm senha; o fallback existe
   para o cenário B.12-052.
3. **Auditoria mensal** via função `govsaude_criar_particao_auditoria`; o beat
   mantém partições futuras. O default captura atrasos e deve ser monitorado.
4. **Referência sem dados fictícios**: seeds de produção só importam arquivos
   oficiais; testes usam recortes explícitos.
