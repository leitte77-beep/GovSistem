# Runbook — GovSaúde (Fases 0, 1, 2 e 4)

## Subir localmente

```bash
cp modulo-govsaude/.env.example modulo-govsaude/api/.env
cd modulo-govsaude/api
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head
python scripts/seed.py
uvicorn app.main:app --reload --port 8210
```

Docs: `http://localhost:8210/docs` · Health: `/api/govsaude/health`.

## Docker

```bash
export GOVSAUDE_SECRET_KEY="$(openssl rand -hex 32)"
export SAAS_JWT_SECRET="<mesmo SECRET_KEY da saas-platform>"
export GOVSAUDE_INTERNAL_API_KEY="$(openssl rand -hex 24)"
export GOVSAUDE_FIELD_ENCRYPTION_KEY="$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
export GOVSAUDE_CPF_HMAC_KEY="$(openssl rand -hex 32)"
docker compose -p infra -f infra/docker-compose.govsaude.yml up -d --build
```

A API aplica migrações no entrypoint. Worker/beat sobem depois do healthcheck.

## Banco e migrações

```bash
alembic upgrade head
alembic current
alembic downgrade -1      # apenas em ambiente controlado
```

Testes de trigger/partição exigem PostgreSQL real:

```bash
export GOVSAUDE_TEST_POSTGRES_URL=postgresql://govsaude_user:senha@localhost:5432/govsaude_test
alembic upgrade head
pytest -m postgres
```

## Fase 1 — migração e operação

A migração `0002_rede_atencao_fase1` cria as tabelas de rede/cadastros-base,
escalas/plantões, prioridades, restrições de horário, especialidades por
profissional, importações CNES e a referência `cnes_estabelecimentos`. Ela é
idempotente porque a `0001` usa `create_all` em instalações novas.

```bash
alembic upgrade head
alembic downgrade -1   # remove apenas o que a Fase 1 introduziu
```

### Importação CNES

1. Obtenha o arquivo oficial no DATASUS/CNES. Não faça scraping.
2. Coloque o arquivo em `api/scripts/dados_oficiais/cnes/`.
3. Crie `api/app/integracoes/especificacoes/cnes/<versao>/manifest.json`
   mapeando as colunas oficiais (ver README da pasta).
4. `POST /api/govsaude/v1/importacoes/cnes` (perfil com
   `integracao:gerenciar`) → `202` + `job_id`.
5. Acompanhe em `GET /api/govsaude/v1/jobs/{job_id}` e consulte o relatório em
   `GET /api/govsaude/v1/importacoes/cnes/{job_id}`.
6. Sem manifesto/arquivo, o status é `PENDENTE_ESPECIFICACAO_OFICIAL`; nada é
   importado. A importação é idempotente pelo hash do arquivo e confere
   `lidos = válidos + rejeitados` e `válidos = criados + atualizados + ignorados`.

### Prioridades

`python scripts/seed.py` (e o provisionamento de tenant) cria, de forma
idempotente, `ELETIVA` e `PRIORITARIA` como prioridades **configuráveis e não
legais**. O gestor deve cadastrar a prioridade legal com `base_legal` pela API
`/prioridades`. O código não possui prioridades fixas.

### Escalas/plantões

Conflito de sobreposição retorna `409` com `codigo=conflito_turno` e a lista de
`conflitos` **visíveis no escopo do usuário**. Se o conflito estiver em unidade
fora do escopo, a resposta traz `conflito_fora_escopo=true` e não expõe IDs.
A checagem e a gravação são serializadas por advisory lock transacional no
PostgreSQL. A exceção exige `forcar_conflito=true` + justificativa de 20+
caracteres; o autor e o instante ficam gravados e auditados. Ao editar para um
horário sem conflito, a justificativa de exceção anterior é limpa.

### Restrições de horário

A lista `dias_semana` descreve a **janela permitida**: dia fora da lista ou
horário fora de `hora_inicio`/`hora_fim` bloqueia. Restrições sem
`estabelecimento_id` valem no login e em rotas sem unidade; restrições com
unidade são aplicadas nas rotas/operações com contexto de estabelecimento.
A criação de profissional exige `estabelecimento_id` e cria o primeiro vínculo
na mesma transação.

### Qualidade do schema

```bash
alembic check
```

O `env.py` usa `include_schemas=True` (compara `referencia`) e
`include_object` para ignorar tabelas de extensões PostGIS/tiger/topology,
partições mensais e `alembic_version`. O comando deve terminar com
`No new upgrade operations detected.`

## Fase 2 — cadastro único

A migração `0003_cidadao_cadastro_unico` cria `cidadaos`, documentos, contatos,
endereços, fotos, planos, alergias, condições, duplicidades, unificações,
baixas e `referencia.ceps`.

### Política de foto e deduplicação

- `cidadao.uso_foto`: `{"permitir": true, "obrigatoria": false}` por tenant.
- `cidadao.duplicidade_pesos`: pesos de nome, nascimento, mãe, CPF e CNS.
- `cidadao.duplicidade_limiar`: pontuação mínima (default 60).

Ajuste por `PUT /api/govsaude/v1/configuracoes/{chave}` com `If-Match`.

### Busca e privacidade

- Busca de cidadão é `POST /api/govsaude/v1/cidadaos/busca` (nome, CPF ou CNS no
  corpo), nunca em URL.
- CPF/CNS/documentos/contatos/carteiras são mascarados nos DTOs.
- Leitura de cidadão e dados sensíveis gera `READ_SENSIVEL`.
- Documentos usam permissão `cidadao:ver_documento`; recepção não a possui.

### CADSUS e CEP

`POST /cidadaos/consulta-cadsus` usa a porta CADSUS. Sem contrato/credencial
oficial, retorna `PENDENTE_ESPECIFICACAO_OFICIAL` e ainda informa se há match
local por CPF/CNS. Se CPF e CNS apontarem para cidadãos diferentes, retorna
`CONFLITO_CPF_CNS` e exige avaliação de unificação. `POST /cidadaos/consulta-cep`
consulta `referencia.ceps`; sem base importada, retorna pendência. Nada é
inventado.

### Unificação

1. A deduplicação cria pares `PENDENTE` com pontuação e motivos.
2. A decisão humana (`MESMO`/`DIFERENTE`) é auditada.
3. `POST /cidadaos/{origem}/unificar` grava `dados_antes_destino` e marca a
   origem com `unificado_para_id`.
4. `POST /cidadaos/unificacoes/{id}/reverter` restaura o destino, limpa a
   origem e mantém a unificação no histórico como `REVERTIDA`.

## Fase 4 — agenda, recepção, fila e painel

A migração `0004_agenda_recepcao_fila_painel` cria protocolos de risco, agendas,
horários, bloqueios, agendamentos, fila, eventos, painéis e chamadas. Como as
anteriores, é idempotente em relação ao metadata atual.

```bash
alembic upgrade head
alembic downgrade -1   # remove apenas as tabelas da Fase 4
```

### Operação diária

- Crie agendas em `POST /agendas` com ao menos um horário; consulte
  `GET /agendas/{id}/disponibilidade?data_inicio=&data_fim=`.
- Agendamentos usam `Idempotency-Key` opcional no `POST`; atualizações exigem
  `If-Match` com a versão atual.
- O comprovante (`POST /agendamentos/{id}/comprovante`) devolve um token
  `GS4-AGD-...` para QR/Code128. O cartão do cidadão
  (`POST /recepcao/cartao`) devolve `GS4-CID-...`. Esses tokens não contêm
  CPF/CNS/nome.
- `POST /recepcao/check-in` recebe o código, o setor e o método. Repetir o
  mesmo código devolve a fila ativa existente.
- A fila (`GET /filas`) expõe `regra_ordenacao`; use
  `GET /tempo-real/filas` para SSE do painel.
- A biometria retorna `PENDENTE_ESPECIFICACAO_OFICIAL` até haver provedor
  configurado; use sempre as alternativas indicadas na resposta.

### Falta automática

A tarefa `govsaude.marcar_faltas_automaticas` roda a cada 15 minutos pelo beat.
Ela marca `FALTOU` quando `agenda.falta_automatica=true` e o horário passou da
tolerância; caso contrário, marca `VENCIDO`. A reversão
(`POST /agendamentos/{id}/reverter-falta`) exige justificativa de 20+
caracteres e gera auditoria. Para executar manualmente:

```python
from app.core.database import async_session
from app.services.agendamentos import marcar_faltas_automaticas

async def rodar():
    async with async_session() as db:
        print(await marcar_faltas_automaticas(db))
```

### Painéis e SSE

- Se o Redis cair, as transações continuam; o evento SSE é descartado e o
  heartbeat mantém a conexão. Monitore `govsaude` no Redis e o endpoint
  `/api/govsaude/health`.
- O painel usa `nome_abreviado`; o texto `texto_voz` é próprio para síntese de
  voz e não inclui CPF/CNS.
- Bloqueios de agenda podem ser criados/cancelados; o cancelamento exige
  motivo e é auditado.

## Referências oficiais

1. Coloque CSVs oficiais em `api/scripts/dados_oficiais/` (ver README local).
2. `python scripts/importar_referencias.py`
3. Confira `referencia.versoes_referencia` e a API `/referencia/*`.

Sem arquivo, o script imprime `PENDENTE_ESPECIFICACAO_OFICIAL`; nada é inventado.
Para desenvolvimento/teste há um recorte explicitamente fictício:

```bash
ALLOW_FICTICIO=1 python scripts/seed_referencia_ficticia.py
```

## Rotação de chaves

1. Gere nova `FIELD_ENCRYPTION_KEY`.
2. Mova a atual para `FIELD_ENCRYPTION_KEY_OLD`.
3. Suba com a nova chave; leitura continua com `MultiFernet`.
4. Execute a rotina de reencriptação (Fase de endurecimento) e remova a antiga.

`CPF_HMAC_KEY` **não** pode ser trocada sem reindexar os hashes de busca; planeje
janela e migração.

## Partições de auditoria

O beat executa `govsaude.manter_particoes_auditoria` mensalmente. Para forçar:

```sql
SELECT govsaude_criar_particao_auditoria((CURRENT_DATE + interval '2 months')::date);
```

Monitorar o default `audit_trail_default`: ele não deve acumular volume. Se
acumular, criar a partição do mês e mover/recriar conforme procedimento do DBA.

## Saúde e incidentes

- `/api/govsaude/health`: banco + armazenamento.
- `/health/live`: processo; `/health/ready`: prontidão.
- Logs estruturados com `X-Request-ID`; nunca contêm CPF/CNS/nome/diagnóstico.
- Auditoria: consultar `/api/govsaude/v1/auditoria` como DPO/auditor.
- Suspeita de vazamento: preservar logs/auditoria, revogar sessões
  (`POST /usuarios/{id}/revogar-sessoes`), girar segredos, acionar DPO.

## Backup

- PostgreSQL: dump diário criptografado + teste de restauração.
- MinIO: versionamento/backup do bucket privado.
- Guardar por prazo compatível com a retenção do prontuário (mín. 20 anos).
