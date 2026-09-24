# Plano de Rollback — Módulo Financeiro GovSistem

## 1. Premissas

- O banco de dados PostgreSQL tem backups diários automáticos
- As migrações são versionadas pelo Alembic e podem ser revertidas
- O código está versionado em git (tagged antes do deploy)
- As variáveis de ambiente são gerenciadas externamente (não no repositório)

## 2. Níveis de Rollback

### Nível 1: Código Apenas (sem alteração de BD)

Quando apenas o código foi alterado (sem migrations novas).

```bash
# 1. Identificar a tag/commit anterior estável
git log --oneline -10

# 2. Fazer checkout da versão anterior
git checkout tags/v1.0.0-stable

# 3. Reconstruir e reiniciar
docker-compose build api
docker-compose up -d api

# 4. Verificar health check
curl http://localhost:9009/api/v1/health
```

### Nível 2: Código + Migration (com downgrade)

Quando o deploy incluiu migrations.

```bash
# 1. Reverter código
git checkout tags/v1.0.0-stable

# 2. Reverter migration (downgrade)
docker-compose exec api alembic downgrade -1

# 3. Verificar se a reversão foi bem-sucedida
docker-compose exec api alembic history

# 4. Reconstruir e reiniciar
docker-compose build api
docker-compose up -d api
```

### Nível 3: Rollback Completo (restauração de BD)

Quando é necessário restaurar o banco de dados.

```bash
# 1. Parar o serviço
docker-compose down api

# 2. Restaurar backup do dia anterior
docker-compose exec -T postgres psql -U saas_user saas_platform < ./backups/saas_platform_$(date -d 'yesterday' +%Y%m%d).sql

# 3. Reverter código
git checkout tags/v1.0.0-stable

# 4. Reconstruir e iniciar
docker-compose build api
docker-compose up -d

# 5. Verificar integridade
docker-compose exec api python -c "from app.models.base import Base; print('OK')"
```

## 3. Verificação Pós-Rollback

- [ ] Health check retorna 200
- [ ] Login funciona
- [ ] Listagem de faturas funciona
- [ ] Webhook responde 200
- [ ] Nenhuma migration pendente (`alembic current`)
- [ ] Dados financeiros consistentes (saldo total = receitas - despesas)

## 4. Comunicação

| Papel | Responsabilidade |
|-------|-----------------|
| Desenvolvedor | Executar rollback técnico |
| Líder Técnico | Aprovar rollback e coordenar equipe |
| Product Owner | Comunicar stakeholders sobre indisponibilidade |
| Suporte | Responder clientes sobre intermitência |

## 5. Critérios para Acionar Rollback

- Erro crítico que impede emissão de cobranças
- Inconsistência contábil (partidas não balanceadas)
- Duplicação de pagamentos
- Falha na validação de webhooks
- Queda de performance superior a 50%

## 6. Teste do Plano de Rollback

O plano deve ser testado trimestralmente:

1. Criar dados de teste em ambiente de staging
2. Executar deploy simulado
3. Executar rollback nível 2
4. Verificar integridade dos dados
5. Documentar tempo total do rollback
