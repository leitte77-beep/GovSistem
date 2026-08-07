import db from '../db.js';

export async function exportarDadosCidadao(tenantId, cidadaoContaId) {
  const conta = await db.oneOrNone(
    `SELECT cc.cidadao_id, c.nome, c.cpf, c.telefone, c.email
     FROM cidadao_contas cc
     JOIN cidadaos c ON c.id = cc.cidadao_id
     WHERE cc.id = $1 AND cc.tenant_id = $2`,
    [cidadaoContaId, tenantId]
  );
  if (!conta) throw new Error('Conta não encontrada');

  const [protocolos, documentos, mensagens] = await Promise.all([
    db.manyOrNone(
      `SELECT p.numero, p.assunto, p.descricao, p.status_operacional, p.origem,
              p.aberto_em, p.resolvido_em, sv.nome AS servico_nome
       FROM protocolos p
       JOIN cidadaos c ON c.contato_id = p.contato_id
       LEFT JOIN protocolo_servicos sv ON sv.id = p.servico_id
       WHERE c.id = $1 AND p.tenant_id = $2
       ORDER BY p.aberto_em DESC`,
      [conta.cidadao_id, tenantId]
    ),
    db.manyOrNone(
      `SELECT d.nome_amigavel, d.mime_type, d.tamanho_bytes, d.status, d.origem, d.criado_em
       FROM protocolo_documentos d
       JOIN protocolos p ON p.id = d.protocolo_id
       JOIN cidadaos c ON c.contato_id = p.contato_id
       WHERE c.id = $1 AND d.tenant_id = $2 AND d.origem = 'cidadao'
       ORDER BY d.criado_em DESC`,
      [conta.cidadao_id, tenantId]
    ),
    db.manyOrNone(
      `SELECT m.direcao, m.conteudo, m.criado_em
       FROM protocolo_mensagens m
       JOIN protocolos p ON p.id = m.protocolo_id
       JOIN cidadaos c ON c.contato_id = p.contato_id
       WHERE c.id = $1 AND m.tenant_id = $2
       ORDER BY m.criado_em DESC`,
      [conta.cidadao_id, tenantId]
    ),
  ]);

  return {
    data_exportacao: new Date().toISOString(),
    dados_pessoais: {
      nome: conta.nome,
      cpf: conta.cpf ? `***.${conta.cpf.slice(-7)}` : null,
      telefone: conta.telefone,
      email: conta.email,
    },
    protocolos: protocolos.length,
    documentos_enviados: documentos.length,
    mensagens: mensagens.length,
    detalhes: { protocolos, documentos, mensagens },
  };
}

export async function solicitarExclusaoDados(tenantId, cidadaoContaId, motivo) {
  const conta = await db.oneOrNone(
    'SELECT * FROM cidadao_contas WHERE id = $1 AND tenant_id = $2',
    [cidadaoContaId, tenantId]
  );
  if (!conta) throw new Error('Conta não encontrada');

  await db.none(
    `UPDATE cidadao_contas SET conta_ativa = false, deleted_at = now()
     WHERE id = $1`,
    [cidadaoContaId]
  );

  await db.none(
    `UPDATE cidadaos c SET deleted_at = now()
     FROM cidadao_contas cc
     WHERE c.id = cc.cidadao_id AND cc.id = $1 AND c.tenant_id = $2`,
    [cidadaoContaId, tenantId]
  );

  await db.none(
    `INSERT INTO auditoria (tenant_id, acao, entidade, entidade_id, detalhe, origem, ip)
     VALUES ($1, 'lgpd.exclusao_solicitada', 'cidadao_conta', $2, $3, 'portal', $4)`,
    [tenantId, cidadaoContaId, JSON.stringify({ motivo }), '0.0.0.0']
  );

  return { ok: true, mensagem: 'Solicitação de exclusão registrada. Seus dados serão removidos conforme a política de retenção.' };
}

export async function obterPoliticaPrivacidade(tenantId) {
  const config = await db.oneOrNone(
    `SELECT politica_privacidade, termos_uso, dados_encarregado
     FROM tenant_protocolo_config WHERE tenant_id = $1`,
    [tenantId]
  );

  return {
    politica_privacidade: config?.politica_privacidade || 'Política de privacidade não configurada.',
    termos_uso: config?.termos_uso || 'Termos de uso não configurados.',
    encarregado: config?.dados_encarregado || 'Encarregado não configurado.',
    direitos_titular: [
      'Confirmação da existência de tratamento',
      'Acesso aos dados',
      'Correção de dados incompletos, inexatos ou desatualizados',
      'Anonimização, bloqueio ou eliminação de dados desnecessários',
      'Portabilidade dos dados',
      'Eliminação dos dados tratados com consentimento',
      'Informação sobre compartilhamento de dados',
      'Revogação do consentimento',
    ],
  };
}

export async function verificarRetencao(tenantId) {
  const config = await db.oneOrNone(
    'SELECT retencao_protocolo_dias, retencao_documento_dias FROM tenant_protocolo_config WHERE tenant_id = $1',
    [tenantId]
  );

  const prazoDias = config?.retencao_protocolo_dias || 365 * 5; // 5 anos padrão

  const expirados = await db.manyOrNone(
    `SELECT id, numero, resolvido_em
     FROM protocolos
     WHERE tenant_id = $1
       AND status_operacional IN ('CONCLUIDO','CANCELADO')
       AND resolvido_em < now() - interval '1 day' * $2
       AND deleted_at IS NULL
     LIMIT 100`,
    [tenantId, prazoDias]
  );

  return { expirados: expirados.length, prazo_dias: prazoDias, protocolos: expirados };
}
