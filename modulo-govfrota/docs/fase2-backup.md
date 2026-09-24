# GovFrota — Estratégia de Backup (Fase 2)

O GovFrota tem **dois** tipos de dado que precisam ser protegidos juntos:

1. **PostgreSQL** (dados relacionais: veículos, motoristas, abastecimentos,
   estoque, movimentações, auditoria, configurações).
2. **Arquivos** (fotos de abastecimento, notas fiscais, XML, documentos) —
   no backend `minio` (objeto) ou `local` (volume).

> ⚠️ O backup do banco **sem** os arquivos é incompleto. O backup dos arquivos
> **sem** o banco também é incompleto. Os dois precisam ser restaurados em
> conjunto e de preferência no **mesmo ponto no tempo**.

## Por que em conjunto

Os arquivos são referenciados pela tabela `anexos` (coluna `caminho` guarda a
chave do objeto). Se o banco voltar a um ponto anterior aos arquivos, haverá
referências órfãs; se os arquivos voltarem a um ponto anterior ao banco,
haverá anexos cujos metadados não existem mais. Por isso, o RPO (objetivo de
ponto de recuperação) deve ser igual para os dois.

---

## 1. PostgreSQL

### Backup lógico (pg_dump)

```bash
# dentro do contêiner do postgres (ou com acesso ao host)
docker exec -t govfrota-postgres pg_dump -U "$POSTGRES_USER" -d govfrota \
  --format=custom --no-owner --compress=6 -f /backups/govfrota-$(date +%F).dump
```

### Restauração

```bash
# recria o banco se necessário
docker exec -i govfrota-postgres pg_restore -U "$POSTGRES_USER" -d govfrota \
  --clean --if-exists /backups/govfrota-<DATA>.dump
```

### Retenção sugerida

| Nível | Frequência | Retenção |
|-------|------------|----------|
| Diário | 1×/dia (madrugada) | 7 dias |
| Semanal | 1×/semana | 4 semanas |
| Mensal | 1×/mês | 12 meses |
| Fora do servidor | cópia após cada backup | — |

Assegure que **pelo menos uma cópia** de cada dump seja copiada para fora do
servidor (bucket de backup, armazenamento remoto, etc.).

---

## 2. MinIO / arquivos

O bucket `govfrota-files` (padrão `MINIO_BUCKET`) é **privado**. Nenhuma
estratégia de backup pode torná-lo público.

### Sincronização de objetos (mc mirror)

```bash
# dentro do contêiner minio-init (cliente `mc`)
mc alias set local http://minio:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
# para um diretório (somente novo, preservando exclusões)
mc mirror --overwrite --preserve \
  local/govfrota-files /backups/minio/govfrota-files
```

Para snapshots versionados, prefira copiar para um bucket de backup:

```bash
mc mb --ignore-existing local/backup-govfrota
mc mirror --overwrite local/govfrota-files local/backup-govfrota/$(date +%F)
```

### Restauração

```bash
mc mirror --overwrite /backups/minio/govfrota-files local/govfrota-files
```

### Retenção

Mantenha snapshots diários por 7 dias e mensais por 12 meses (mesma política
do banco), sempre fora do servidor primário.

---

## 3. Orquestração

> ⚠️ **Não criar automação externa perigosa sem conhecer a infraestrutura
> existente.** Esta seção documenta o que deve existir; a automação concreta
> (cron, scripts) deve ser alinhada ao ambiente antes de ativar.

Recomenda-se um job agendado (ex.: cron) que:

1. Gere o `pg_dump` do GovFrota.
2. Rode `mc mirror` do bucket privado.
3. Copie ambos para fora do servidor.
4. Aplique a política de retenção (apague backups antigos).
5. Grave um log e um alerta em caso de falha.

Toda restauração deve ser **testada** em ambiente isolado antes de qualquer
procedimento de emergência.

---

## 4. Backend local (desenvolvimento)

Quando `STORAGE_BACKEND=local`, os arquivos vivem no volume `uploads`
(`STORAGE_LOCAL_PATH`). Nesse caso o backup dos arquivos é um
`tar`/cópia do diretório, seguindo a mesma política de retenção.
