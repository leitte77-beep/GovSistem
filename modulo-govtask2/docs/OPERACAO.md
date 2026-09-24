# Operação do GovTask v2

## Onde ele roda

| Peça | Valor |
|---|---|
| Pasta | `modulo-govtask2/` |
| Compose | `infra/docker-compose.prod.yml` (serviços `govtask2-db-init`, `govtask2-api`, `govtask2-web`) |
| Banco | `govtask2`, no mesmo Postgres dos demais módulos, criado pelo `db-init` |
| Volume de anexos | `govtask2_uploads` |
| Porta da API no host | `8106` (só para o SaaS sincronizar via `host.docker.internal`) |
| Domínio | `govtask.govsistem.com.br` |
| Prefixo da API | `/api/govtask` |

**Em 23/09/2026 este módulo substituiu o GovTask original.** O anterior
(`modulo-govtask/`, banco `govtask`, volume `infra_govtask_uploads`, porta
8101) foi desligado e **removido permanentemente**: containers, imagens,
volumes, banco e diretório. O código continua recuperável pelo git — o
último commit dele é `90bbe9f`.

Backup do que foi apagado, feito antes da remoção, em
`backups/govtask-desativacao-2026-09-23/` (dump SQL de 85 tabelas com 16
demandas, e tar com os 8 arquivos de upload).

O nome `govtask2` sobrevive só internamente: nome do serviço no compose, do
banco e das variáveis de ambiente. Nada disso aparece para o usuário, e foi
mantido assim de propósito para que a troca de domínio não dependesse de
apagar o banco antigo no mesmo instante.

## Configuração (já aplicada em produção)

No `.env` da infra:

```
GOVTASK2_POSTGRES_DB=govtask2
GOVTASK2_SECRET_KEY=<gerado no deploy>
GOVTASK2_INTERNAL_API_KEY=<igual, byte a byte, ao INTERNAL_API_KEY do saas-platform>
GOVTASK2_PUBLIC_URL=https://govtask.govsistem.com.br
```

No `.env` do `saas-platform`:

```
GOVTASK_MODULE_INTERNAL_API_URL=http://host.docker.internal:8106/api/govtask
```

O registro do módulo na tabela `modules` do SaaS **não mudou**: slug
`govtask`, base_url `https://govtask.govsistem.com.br`. Era o ponto do
desenho — o módulo novo assumiu o prefixo `/api/govtask` justamente para ser
substituto direto, sem alteração de código na plataforma.

> **Cuidado com a chave interna.** No primeiro deploy o sync falhou com 401
> porque o `INTERNAL_API_KEY` do `infra/.env` estava defasado em relação ao
> do `saas-platform`, e a linha `GOVTASK_INTERNAL_API_KEY` daquele arquivo
> começava com um espaço — o que faz o Compose ignorá-la silenciosamente. Por
> isso `GOVTASK2_INTERNAL_API_KEY` é declarada explicitamente, sem depender
> do fallback. Sintoma: SSO emite o token, mas o usuário "não existe" no
> módulo.

## Subir

```bash
# Sempre como usuário ubuntu — o Compose v2 não está disponível via sudo.
cd infra
docker compose -f docker-compose.prod.yml up -d --build govtask2-api govtask2-web
```

**Nunca usar `--remove-orphans`**: os módulos GovFrota e GovPro vivem em
arquivos de compose separados, e a flag derruba os vizinhos.

Depois de recriar qualquer container de módulo, a borda continua apontando
para o IP antigo e responde 502 até recarregar:

```bash
docker exec infra-nginx-1 nginx -s reload
```

## Migrations

```bash
docker compose -f docker-compose.prod.yml exec govtask2-api alembic upgrade head
```

A `0001_inicial` cria o esquema inteiro. `alembic check` não deve apontar
diferença entre os modelos e a migration — se apontar, a migration está
desalinhada e o deploy vai divergir do que os testes exercitam.

## Provisionar um tenant

A plataforma faz isso sozinha, mas para conferir na mão:

```bash
curl -X POST https://govtask.govsistem.com.br/api/govtask/internal/sync-organization \
  -H "X-Internal-Key: $GOVTASK2_INTERNAL_API_KEY" -H "Content-Type: application/json" \
  -d '{"organization_id":"<uuid>","name":"Prefeitura X","slug":"prefeitura-x"}'
```

Se a chave interna divergir da da plataforma, o login por SSO funciona mas o
usuário não existe no módulo, e o erro aparece depois, como falha de chave
estrangeira. É a primeira coisa a conferir quando "o usuário não entra".

## Armadilhas já conhecidas (e já resolvidas no código)

- **`MissingGreenlet` ao gravar na timeline.** `pedido.andamentos.append()`
  num pedido já persistido dispara lazy load, que em sessão assíncrona
  estoura. O serviço usa `db.add()` — ver `services/pedidos.py`.
- **Resposta sem o dado que acabou de ser gravado.** A sessão usa
  `expire_on_commit=False`, então o commit não invalida as coleções já
  carregadas e a releitura devolve o estado antigo. `_buscar` usa
  `populate_existing=True` — ver `api/v1/pedidos.py`.
- **Serialização disparando lazy load.** Toda relação que aparece na resposta
  precisa estar no `_carregado()`; quem reclama é o Pydantic, longe da causa.
- **Testes falhando só em conjunto.** O engine assíncrono guarda conexões
  presas ao event loop que as abriu. O fixture `banco` chama
  `engine.dispose()` no fim de cada teste.

## Os dados do módulo antigo

Não foram migrados. Eram 16 demandas, todas de teste ("Convênio Teste",
"Construção Escola" repetida, "aquisição teste de carro"), com última
atividade em 19/08/2026.

Se algum dia for preciso recuperá-los, o dump está em
`backups/govtask-desativacao-2026-09-23/govtask-db.sql` e os anexos em
`govtask-uploads.tar.gz`. Restaurar é `createdb` + `psql -f`, não um
downgrade de migration.

Uma importação para o modelo novo não é trivial e provavelmente não
compensa: o modelo antigo (Demanda com etapas configuráveis, convênios,
obras e contratos como entidades próprias) não tem correspondência de um
para um com o vai e vem daqui. O mapeamento mínimo seria
`Demanda → Pedido`, `Etapa → Encaminhamento` e `Documento → Anexo`, com as
demandas cuja trilha não bate com nenhuma das três entrando como `OUTRO`.

## Migração do modelo de fases para o vai e vem

A migration `0006_vai_e_vem` converte o que já estava em curso: `fases_pedido`
vira `encaminhamentos`, as fases futuras (PENDENTE) somem — não há mais
sequência obrigatória — e cada pedido é reconciliado com o seu encaminhamento
aberto. Anexos e andamentos passam a apontar para o encaminhamento, e nascem
`medicoes` (obra) e `notificacoes` (sino do Assessor). O downgrade reconstrói
a forma antiga de forma best-effort.
