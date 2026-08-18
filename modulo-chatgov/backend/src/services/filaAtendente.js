export const LIMITE_ATENDIMENTOS_ATENDENTE = 5;

const STATUS_ATIVOS = ['EM_ATENDIMENTO', 'AGUARDANDO_CIDADAO', 'AGUARDANDO_SETOR'];

export function decidirRoteamentoAtendente({ online, atendimentosAtivos, limite = LIMITE_ATENDIMENTOS_ATENDENTE }) {
  if (!online) return 'indisponivel';
  return Number(atendimentosAtivos || 0) < limite ? 'direto' : 'fila';
}

export function calcularPosicaoFilaAtendente({ atendimentosAtivos, pessoasAntes }) {
  return Number(atendimentosAtivos || 0) + Number(pessoasAntes || 0) + 1;
}

export function mensagemEntradaFilaAtendente({ atendenteNome, posicao }) {
  if (!atendenteNome || !Number.isInteger(Number(posicao)) || Number(posicao) < 1) return null;
  return `${atendenteNome} está atendendo outras pessoas no momento. Você é o número ${posicao} na ordem de atendimento e será chamado assim que uma vaga abrir.`;
}

export function mensagemAtualizacaoFilaAtendente({ atendenteNome, posicaoAnterior, posicao }) {
  if (!atendenteNome || !Number.isInteger(Number(posicao)) || Number(posicao) < 1) return null;
  if (Number(posicao) >= Number(posicaoAnterior || 0)) return null;
  return `Sua fila com ${atendenteNome} avançou: agora você é o número ${posicao} na ordem de atendimento.`;
}

export function mensagemAtendimentoIniciado(atendenteNome) {
  return `Sua vez chegou! Seu atendimento foi direcionado para ${atendenteNome}, que já pode continuar a conversa com você.`;
}

export function planejarPromocaoFilaAtendente({
  atendimentosAtivos,
  aguardando,
  limite = LIMITE_ATENDIMENTOS_ATENDENTE,
}) {
  const lista = Array.isArray(aguardando) ? aguardando : [];
  const vagas = Math.max(0, limite - Number(atendimentosAtivos || 0));
  const promover = lista.slice(0, vagas);
  const restantes = lista.slice(promover.length);
  const ativosDepois = Number(atendimentosAtivos || 0) + promover.length;
  const atualizarPosicoes = restantes
    .map((item, indice) => ({
      conversaId: item.conversaId,
      posicaoAnterior: Number(item.posicaoNotificada || 0),
      posicao: calcularPosicaoFilaAtendente({ atendimentosAtivos: ativosDepois, pessoasAntes: indice }),
    }))
    .filter((item) => item.posicaoAnterior > 0 && item.posicao < item.posicaoAnterior);

  return { promover, atualizarPosicoes, totalAguardando: restantes.length };
}

async function obterAtendenteBloqueado(tx, tenantId, operadorId) {
  await tx.one('SELECT pg_advisory_xact_lock(hashtext($1)) AS bloqueado', [`fila-atendente:${tenantId}:${operadorId}`]);
  return tx.oneOrNone(
    `SELECT o.id, o.nome,
            (o.online AND o.ultimo_visto > now() - INTERVAL '3 minutes') AS online,
            (SELECT od.departamento_id
             FROM operador_departamentos od
             JOIN departamentos d ON d.id = od.departamento_id AND d.ativo = true
             WHERE od.operador_id = o.id AND od.tenant_id = o.tenant_id
             ORDER BY d.nome LIMIT 1) AS departamento_id,
            (SELECT COUNT(*)::int FROM conversas c
             WHERE c.tenant_id = o.tenant_id AND c.operador_id = o.id
               AND c.deleted_at IS NULL AND c.status_operacional = ANY($3::text[])) AS atendimentos_ativos
     FROM operadores o
     WHERE o.id = $2 AND o.tenant_id = $1 AND o.ativo = true
     FOR UPDATE`,
    [tenantId, operadorId, STATUS_ATIVOS],
  );
}

export async function solicitarAtendente(conn, {
  tenantId,
  conversaId,
  operadorId,
  limite = LIMITE_ATENDIMENTOS_ATENDENTE,
}) {
  return conn.tx(async (tx) => {
    const atendente = await obterAtendenteBloqueado(tx, tenantId, operadorId);
    if (!atendente || !atendente.online) return { tipo: 'indisponivel', atendente: atendente || null };

    const roteamento = decidirRoteamentoAtendente({
      online: atendente.online,
      atendimentosAtivos: atendente.atendimentos_ativos,
      limite,
    });

    if (roteamento === 'direto') {
      const conversa = await tx.oneOrNone(
        `UPDATE conversas SET operador_id = $1, operador_solicitado_id = $1,
             fila_operador_entrou_em = NULL, fila_operador_posicao_notificada = NULL,
             departamento_id = COALESCE($4, departamento_id), status = 'aberta',
             status_operacional = 'EM_ATENDIMENTO'
         WHERE id = $2 AND tenant_id = $3 AND operador_id IS NULL AND deleted_at IS NULL
           AND status_operacional NOT IN ('RESOLVIDA', 'ARQUIVADA')
         RETURNING id`,
        [operadorId, conversaId, tenantId, atendente.departamento_id || null],
      );
      if (!conversa) return { tipo: 'concorrencia', atendente };
      await tx.none(
        `INSERT INTO conversa_participantes (conversa_id, operador_id, papel, adicionado_por, tenant_id)
         VALUES ($1, $2, 'dono', $2, $3)
         ON CONFLICT (conversa_id, operador_id) DO UPDATE SET papel = 'dono'`,
        [conversaId, operadorId, tenantId],
      );
      return { tipo: 'direto', atendente, totalAguardando: await contarFilaAtendente(tx, tenantId, operadorId) };
    }

    const anterior = await tx.oneOrNone(
      `SELECT operador_solicitado_id, fila_operador_posicao_notificada
       FROM conversas WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [conversaId, tenantId],
    );
    if (!anterior) return { tipo: 'concorrencia', atendente };

    await tx.none(
      `UPDATE conversas SET operador_id = NULL, operador_solicitado_id = $1,
         fila_operador_entrou_em = CASE
           WHEN operador_solicitado_id IS DISTINCT FROM $1 THEN now()
           ELSE COALESCE(fila_operador_entrou_em, now()) END,
         departamento_id = COALESCE($4, departamento_id), status = 'fila',
         status_operacional = 'NA_FILA'
       WHERE id = $2 AND tenant_id = $3`,
      [operadorId, conversaId, tenantId, atendente.departamento_id || null],
    );

    const ordem = await tx.one(
      `SELECT COUNT(*)::int AS pessoas_antes
       FROM conversas atual
       JOIN conversas fila ON fila.tenant_id = atual.tenant_id
        AND fila.operador_solicitado_id = $3 AND fila.operador_id IS NULL
        AND fila.deleted_at IS NULL AND fila.status_operacional = 'NA_FILA'
        AND fila.id <> atual.id
        AND (fila.fila_operador_entrou_em < atual.fila_operador_entrou_em
          OR (fila.fila_operador_entrou_em = atual.fila_operador_entrou_em AND fila.id::text < atual.id::text))
       WHERE atual.id = $2 AND atual.tenant_id = $1`,
      [tenantId, conversaId, operadorId],
    );
    const posicao = calcularPosicaoFilaAtendente({
      atendimentosAtivos: atendente.atendimentos_ativos,
      pessoasAntes: ordem.pessoas_antes,
    });
    const deveNotificarCidadao = String(anterior.operador_solicitado_id || '') !== String(operadorId)
      || Number(anterior.fila_operador_posicao_notificada || 0) !== posicao;
    await tx.none(
      `UPDATE conversas SET fila_operador_posicao_notificada = $1
       WHERE id = $2 AND tenant_id = $3`,
      [posicao, conversaId, tenantId],
    );

    return {
      tipo: 'fila', atendente, posicao, deveNotificarCidadao,
      totalAguardando: await contarFilaAtendente(tx, tenantId, operadorId),
    };
  });
}

export async function contarFilaAtendente(conn, tenantId, operadorId) {
  const row = await conn.one(
    `SELECT COUNT(*)::int AS total FROM conversas
     WHERE tenant_id = $1 AND operador_solicitado_id = $2 AND operador_id IS NULL
       AND deleted_at IS NULL AND status_operacional = 'NA_FILA'`,
    [tenantId, operadorId],
  );
  return Number(row.total || 0);
}

export async function promoverFilaAtendente(conn, {
  tenantId,
  operadorId,
  limite = LIMITE_ATENDIMENTOS_ATENDENTE,
}) {
  return conn.tx(async (tx) => {
    const atendente = await obterAtendenteBloqueado(tx, tenantId, operadorId);
    if (!atendente) return { atendente: null, promovidas: [], posicoesAlteradas: [], totalAguardando: 0 };

    const aguardando = await tx.manyOrNone(
      `SELECT c.id AS conversa_id, c.fila_operador_posicao_notificada,
              co.wa_jid
       FROM conversas c
       JOIN contatos co ON co.id = c.contato_id AND co.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1 AND c.operador_solicitado_id = $2
         AND c.operador_id IS NULL AND c.deleted_at IS NULL
         AND c.status_operacional = 'NA_FILA'
       ORDER BY c.fila_operador_entrou_em, c.id
       FOR UPDATE OF c`,
      [tenantId, operadorId],
    );
    const normalizados = aguardando.map((item) => ({
      ...item,
      conversaId: item.conversa_id,
      posicaoNotificada: item.fila_operador_posicao_notificada,
    }));
    const plano = planejarPromocaoFilaAtendente({
      atendimentosAtivos: atendente.atendimentos_ativos,
      aguardando: normalizados,
      limite,
    });

    for (const item of plano.promover) {
      await tx.none(
        `UPDATE conversas SET operador_id = $1, status = 'aberta',
           status_operacional = 'EM_ATENDIMENTO', fila_operador_entrou_em = NULL,
           fila_operador_posicao_notificada = NULL
         WHERE id = $2 AND tenant_id = $3`,
        [operadorId, item.conversaId, tenantId],
      );
      await tx.none(
        `INSERT INTO conversa_participantes (conversa_id, operador_id, papel, adicionado_por, tenant_id)
         VALUES ($1, $2, 'dono', $2, $3)
         ON CONFLICT (conversa_id, operador_id) DO UPDATE SET papel = 'dono'`,
        [item.conversaId, operadorId, tenantId],
      );
    }
    for (const item of plano.atualizarPosicoes) {
      await tx.none(
        `UPDATE conversas SET fila_operador_posicao_notificada = $1
         WHERE id = $2 AND tenant_id = $3`,
        [item.posicao, item.conversaId, tenantId],
      );
    }

    const porId = new Map(normalizados.map((item) => [item.conversaId, item]));
    return {
      atendente,
      promovidas: plano.promover.map((item) => porId.get(item.conversaId)),
      posicoesAlteradas: plano.atualizarPosicoes.map((item) => ({ ...porId.get(item.conversaId), ...item })),
      totalAguardando: plano.totalAguardando,
    };
  });
}
