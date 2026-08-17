/**
 * Obtém a conversa operacional ativa do contato ou cria uma nova.
 *
 * Conversas RESOLVIDAS/ARQUIVADAS são ciclos encerrados e nunca são reabertas
 * implicitamente por uma mensagem nova. O índice único parcial da migration
 * 029 garante atomicamente que chamadas concorrentes criem apenas uma ativa.
 */
export async function obterOuCriarConversaAtiva(conn, {
  tenantId,
  contatoId,
  status = 'fila',
  statusOperacional = 'NOVA',
  naoLidas = 0,
  incrementarNaoLidas = false,
  ultimaMensagem = null,
  ultimaMensagemEm = new Date(),
  departamentoId = null,
  operadorId = null,
  atualizarAtribuicao = false,
}) {
  return conn.one(
    `INSERT INTO conversas
       (tenant_id, contato_id, departamento_id, operador_id, status,
        status_operacional, nao_lidas, ultima_mensagem, ultima_mensagem_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (tenant_id, contato_id)
       WHERE deleted_at IS NULL
         AND status_operacional NOT IN ('RESOLVIDA', 'ARQUIVADA')
     DO UPDATE SET
       nao_lidas = CASE
         WHEN $10 THEN conversas.nao_lidas + 1
         ELSE conversas.nao_lidas
       END,
       departamento_id = CASE
         WHEN $11 THEN COALESCE($3, conversas.departamento_id)
         ELSE conversas.departamento_id
       END,
       operador_id = CASE
         WHEN $11 THEN COALESCE(conversas.operador_id, $4)
         ELSE conversas.operador_id
       END,
       ultima_mensagem = COALESCE($8, conversas.ultima_mensagem),
       ultima_mensagem_em = GREATEST(
         COALESCE(conversas.ultima_mensagem_em, $9),
         $9
       )
     RETURNING *`,
    [
      tenantId,
      contatoId,
      departamentoId,
      operadorId,
      status,
      statusOperacional,
      naoLidas,
      ultimaMensagem,
      ultimaMensagemEm,
      incrementarNaoLidas,
      atualizarAtribuicao,
    ]
  );
}

/**
 * Mensagens `fromMe` sincronizadas foram enviadas fora do painel e não trazem
 * identidade de atendente. Se não houver ciclo ativo, elas permanecem no ciclo
 * mais recente em vez de abrir um atendimento invisível sem responsável.
 */
export async function obterConversaParaSaidaSincronizada(conn, {
  tenantId,
  contatoId,
  ultimaMensagem,
  ultimaMensagemEm = new Date(),
}) {
  const existente = await conn.oneOrNone(
    `SELECT * FROM conversas
     WHERE tenant_id = $1 AND contato_id = $2 AND deleted_at IS NULL
     ORDER BY
       (criado_em <= $3) DESC,
       criado_em DESC
     LIMIT 1
     FOR UPDATE`,
    [tenantId, contatoId, ultimaMensagemEm]
  );

  if (existente) {
    return conn.one(
      `UPDATE conversas
       SET ultima_mensagem = COALESCE($1, ultima_mensagem),
           ultima_mensagem_em = GREATEST(COALESCE(ultima_mensagem_em, $2), $2)
       WHERE id = $3 AND tenant_id = $4 AND deleted_at IS NULL
       RETURNING *`,
      [ultimaMensagem, ultimaMensagemEm, existente.id, tenantId]
    );
  }

  // Primeiro contato iniciado diretamente no aparelho: mantém visibilidade na
  // fila, pois não há operador confiável para atribuir como participante.
  return obterOuCriarConversaAtiva(conn, {
    tenantId,
    contatoId,
    status: 'fila',
    statusOperacional: 'NOVA',
    naoLidas: 0,
    ultimaMensagem,
    ultimaMensagemEm,
  });
}
