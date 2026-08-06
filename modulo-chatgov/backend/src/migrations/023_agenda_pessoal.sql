-- ============================================================
-- AGENDA PESSOAL DO ATENDENTE
-- ============================================================
-- Um item de agenda é sempre de UMA pessoa (operador_id). Isso é o que separa
-- esta tabela de `eventos_calendario`, que é o calendário corporativo do tenant
-- (evento de setor, sem dono) e de `reunioes`, que tem lista de participantes.
-- A agenda compartilhada (setor/equipe) é etapa posterior e entra como coluna
-- de visibilidade + tabela de compartilhamento, sem quebrar o que existe aqui.

CREATE TABLE IF NOT EXISTS agenda_itens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    operador_id   UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,

    -- compromisso: tem hora marcada | tarefa: tem prazo | lembrete: só o aviso
    tipo          TEXT NOT NULL DEFAULT 'compromisso',
    titulo        TEXT NOT NULL,
    descricao     TEXT DEFAULT '',

    -- `inicio` é o instante que a agenda ordena, seja hora do compromisso ou
    -- prazo da tarefa. Guardar num campo só evita COALESCE em toda consulta.
    inicio        TIMESTAMPTZ NOT NULL,
    fim           TIMESTAMPTZ,
    dia_todo      BOOLEAN NOT NULL DEFAULT false,

    prioridade    TEXT NOT NULL DEFAULT 'normal',
    -- "atrasado" não é status gravado: é derivado de inicio < now() com status
    -- ainda pendente. Gravar exigiria um job varrendo a tabela para envelhecer
    -- os itens, e o valor ficaria errado entre uma varredura e outra.
    status        TEXT NOT NULL DEFAULT 'pendente',
    categoria     TEXT,

    -- Vínculos com o atendimento. Todos ON DELETE SET NULL: perder a conversa
    -- não pode apagar o compromisso do servidor.
    conversa_id   UUID REFERENCES conversas(id) ON DELETE SET NULL,
    contato_id    UUID REFERENCES contatos(id) ON DELETE SET NULL,
    protocolo_id  UUID REFERENCES protocolos(id) ON DELETE SET NULL,

    concluido_em     TIMESTAMPTZ,
    concluido_por    UUID REFERENCES operadores(id) ON DELETE SET NULL,
    observacao_final TEXT,

    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT agenda_itens_tipo_chk
      CHECK (tipo IN ('compromisso', 'tarefa', 'lembrete')),
    CONSTRAINT agenda_itens_prioridade_chk
      CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
    CONSTRAINT agenda_itens_status_chk
      CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada'))
);

-- A consulta quente é sempre "meus itens desta janela de tempo".
CREATE INDEX IF NOT EXISTS idx_agenda_op_inicio ON agenda_itens(operador_id, inicio);
CREATE INDEX IF NOT EXISTS idx_agenda_tenant ON agenda_itens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agenda_conversa ON agenda_itens(conversa_id)
  WHERE conversa_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agenda_lembretes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    item_id      UUID NOT NULL REFERENCES agenda_itens(id) ON DELETE CASCADE,
    operador_id  UUID NOT NULL REFERENCES operadores(id) ON DELETE CASCADE,

    -- Minutos antes de `inicio`. Guardado só para reconstruir o formulário e
    -- para recalcular `disparar_em` quando a data do item muda.
    offset_min   INTEGER NOT NULL DEFAULT 0,
    -- Instante materializado do disparo. É o que a consulta de polling filtra,
    -- e é o que o "adiar 10 min" reescreve — por isso não dá para derivar de
    -- inicio - offset na hora da leitura.
    disparar_em  TIMESTAMPTZ NOT NULL,
    disparado_em TIMESTAMPTZ,

    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice parcial: o polling só enxerga o que ainda não foi reconhecido, então
-- ele varre um punhado de linhas mesmo com a tabela grande.
CREATE INDEX IF NOT EXISTS idx_agenda_lem_pendentes
  ON agenda_lembretes(operador_id, disparar_em)
  WHERE disparado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_agenda_lem_item ON agenda_lembretes(item_id);

-- Isolamento por tenant, no mesmo padrão das demais tabelas do módulo.
ALTER TABLE agenda_itens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_lembretes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_agenda_itens ON agenda_itens;
CREATE POLICY iso_agenda_itens ON agenda_itens
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS iso_agenda_lembretes ON agenda_lembretes;
CREATE POLICY iso_agenda_lembretes ON agenda_lembretes
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
