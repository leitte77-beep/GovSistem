import db from '../db.js';
import { criarProtocolo, gerarCredencialAcesso, tramitarProtocolo, enviarMensagemPublica, criarAnotacaoInterna, criarPendencia, enfileirarNotificacao } from './protocolo-v2.js';
import { buscarOuCriarCidadao, criarContaCidadao } from './cidadao.js';

export async function seedProtocolos(tenantId) {
  console.log('[Seed] Inserindo dados demo de protocolos...');

  // Verifica se já tem dados
  const existente = await db.oneOrNone(
    'SELECT COUNT(*)::int as cnt FROM protocolo_servicos WHERE tenant_id = $1', [tenantId]
  );
  if (existente && existente.cnt > 2) {
    console.log('[Seed] Dados demo já existem, pulando...');
    return;
  }

  // 1. Categorias
  await db.none(`INSERT INTO protocolo_categorias (tenant_id, nome, descricao) VALUES ($1,'Documentos e Certidões','Emissão de certidões, declarações e documentos oficiais') ON CONFLICT DO NOTHING`, [tenantId]);
  await db.none(`INSERT INTO protocolo_categorias (tenant_id, nome, descricao) VALUES ($1,'Licenças e Alvarás','Licenças de funcionamento, alvarás e autorizações') ON CONFLICT DO NOTHING`, [tenantId]);
  await db.none(`INSERT INTO protocolo_categorias (tenant_id, nome, descricao) VALUES ($1,'Infraestrutura','Solicitações de obras, reparos e serviços urbanos') ON CONFLICT DO NOTHING`, [tenantId]);
  await db.none(`INSERT INTO protocolo_categorias (tenant_id, nome, descricao) VALUES ($1,'Tributação','IPTU, ISS, taxas e tributos municipais') ON CONFLICT DO NOTHING`, [tenantId]);
  await db.none(`INSERT INTO protocolo_categorias (tenant_id, nome, descricao) VALUES ($1,'Saúde','Vigilância sanitária, cartão SUS, agendamentos') ON CONFLICT DO NOTHING`, [tenantId]);

  const categorias = await db.manyOrNone('SELECT id, nome FROM protocolo_categorias WHERE tenant_id = $1', [tenantId]);

  // 2. Departamentos (garantir que existem)
  let deptos = await db.manyOrNone("SELECT id, nome FROM departamentos WHERE tenant_id = $1 AND ativo = true", [tenantId]);
  if (deptos.length === 0) {
    await db.none("INSERT INTO departamentos (tenant_id, nome, cor) VALUES ($1,'Protocolo Geral','#2563EB')", [tenantId]);
    await db.none("INSERT INTO departamentos (tenant_id, nome, cor) VALUES ($1,'Tributação','#D97706')", [tenantId]);
    await db.none("INSERT INTO departamentos (tenant_id, nome, cor) VALUES ($1,'Obras','#DC2626')", [tenantId]);
    await db.none("INSERT INTO departamentos (tenant_id, nome, cor) VALUES ($1,'Saúde','#16A34A')", [tenantId]);
    deptos = await db.manyOrNone("SELECT id, nome FROM departamentos WHERE tenant_id = $1 AND ativo = true", [tenantId]);
  }

  // 3. Serviços com campos
  const servicos = [
    {
      nome: 'Certidão Negativa de Débitos Municipais',
      descricao: 'Emissão de certidão negativa de débitos para pessoa física ou jurídica.',
      prazo: 10,
      categoria: 'Documentos e Certidões',
      campos: [
        { rotulo: 'Tipo de pessoa', tipo: 'selecao', obrigatorio: true, opcoes: ['Física', 'Jurídica'] },
        { rotulo: 'CPF/CNPJ', tipo: 'texto', obrigatorio: true },
        { rotulo: 'Finalidade', tipo: 'texto_longo', obrigatorio: false, placeholder: 'Ex: Participação em licitação, matrícula escolar...' },
      ],
    },
    {
      nome: 'Alvará de Funcionamento',
      descricao: 'Solicitação de alvará para estabelecimentos comerciais, industriais e de serviços.',
      prazo: 30,
      categoria: 'Licenças e Alvarás',
      campos: [
        { rotulo: 'CNPJ da empresa', tipo: 'texto', obrigatorio: true },
        { rotulo: 'Razão social', tipo: 'texto', obrigatorio: true },
        { rotulo: 'Endereço do estabelecimento', tipo: 'texto_longo', obrigatorio: true },
        { rotulo: 'Atividade principal', tipo: 'texto', obrigatorio: true },
        { rotulo: 'Área construída (m²)', tipo: 'numero', obrigatorio: false },
      ],
    },
    {
      nome: 'Solicitação de Tapa-Buraco',
      descricao: 'Solicitação de reparo asfáltico em via pública.',
      prazo: 15,
      categoria: 'Infraestrutura',
      campos: [
        { rotulo: 'Endereço completo', tipo: 'texto_longo', obrigatorio: true },
        { rotulo: 'Ponto de referência', tipo: 'texto', obrigatorio: false },
        { rotulo: 'Tamanho aproximado', tipo: 'selecao', obrigatorio: false, opcoes: ['Pequeno (até 50cm)', 'Médio (50cm a 1m)', 'Grande (mais de 1m)'] },
      ],
    },
    {
      nome: 'Revisão de IPTU',
      descricao: 'Solicitação de revisão do valor do IPTU do imóvel.',
      prazo: 45,
      categoria: 'Tributação',
      campos: [
        { rotulo: 'Inscrição imobiliária', tipo: 'texto', obrigatorio: true },
        { rotulo: 'Endereço do imóvel', tipo: 'texto_longo', obrigatorio: true },
        { rotulo: 'Motivo da revisão', tipo: 'texto_longo', obrigatorio: true },
      ],
    },
    {
      nome: 'Declaração de Isenção de Taxas',
      descricao: 'Declaração para isenção de taxas municipais para entidades filantrópicas.',
      prazo: 20,
      categoria: 'Documentos e Certidões',
      campos: [
        { rotulo: 'CNPJ da entidade', tipo: 'texto', obrigatorio: true },
        { rotulo: 'Registro no conselho', tipo: 'texto', obrigatorio: false },
      ],
    },
  ];

  for (const s of servicos) {
    const cat = categorias.find(c => c.nome === s.categoria);
    const dept = deptos[Math.floor(Math.random() * deptos.length)];

    const svc = await db.one(
      `INSERT INTO protocolo_servicos (tenant_id, nome, descricao, departamento_id, categoria_id, prazo_estimado_dias, disponivel)
       VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
      [tenantId, s.nome, s.descricao, dept?.id, cat?.id, s.prazo]
    );

    for (let i = 0; i < s.campos.length; i++) {
      const c = s.campos[i];
      await db.none(
        `INSERT INTO protocolo_servico_campos (tenant_id, servico_id, nome_campo, rotulo, tipo, obrigatorio, opcoes, placeholder, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [tenantId, svc.id, `campo_${i+1}`, c.rotulo, c.tipo, c.obrigatorio || false,
         c.opcoes ? JSON.stringify(c.opcoes) : null, c.placeholder || null, i]
      );
    }
  }

  // 4. SLAs
  await db.none(`INSERT INTO sla_regras (tenant_id, nome, prazo_horas, prioridade) VALUES ($1,'Padrão - Normal',48,'NORMAL') ON CONFLICT DO NOTHING`, [tenantId]);
  await db.none(`INSERT INTO sla_regras (tenant_id, nome, prazo_horas, prioridade) VALUES ($1,'Alta Prioridade',24,'ALTA') ON CONFLICT DO NOTHING`, [tenantId]);
  await db.none(`INSERT INTO sla_regras (tenant_id, nome, prazo_horas, prioridade) VALUES ($1,'Urgente',8,'URGENTE') ON CONFLICT DO NOTHING`, [tenantId]);

  // 5. Feriados
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const feriados = [
    { nome: 'Confraternização Universal', data: `${ano}-01-01` },
    { nome: 'Tiradentes', data: `${ano}-04-21` },
    { nome: 'Dia do Trabalhador', data: `${ano}-05-01` },
    { nome: 'Independência do Brasil', data: `${ano}-09-07` },
    { nome: 'Nossa Senhora Aparecida', data: `${ano}-10-12` },
    { nome: 'Finados', data: `${ano}-11-02` },
    { nome: 'Proclamação da República', data: `${ano}-11-15` },
    { nome: 'Natal', data: `${ano}-12-25` },
    { nome: 'Aniversário do Município', data: `${ano}-06-15` },
  ];
  for (const f of feriados) {
    await db.none(
      `INSERT INTO feriados (tenant_id, nome, data, tipo, recorrente)
       VALUES ($1,$2,$3,'feriado',true) ON CONFLICT (tenant_id, data) DO NOTHING`,
      [tenantId, f.nome, f.data]
    );
  }

  // 6. Etiquetas
  await db.none(`INSERT INTO protocolo_etiquetas (tenant_id, nome, cor) VALUES ($1,'Urgente','#DC2626') ON CONFLICT DO NOTHING`, [tenantId]);
  await db.none(`INSERT INTO protocolo_etiquetas (tenant_id, nome, cor) VALUES ($1,'Prioritário','#D97706') ON CONFLICT DO NOTHING`, [tenantId]);
  await db.none(`INSERT INTO protocolo_etiquetas (tenant_id, nome, cor) VALUES ($1,'Idoso','#2563EB') ON CONFLICT DO NOTHING`, [tenantId]);
  await db.none(`INSERT INTO protocolo_etiquetas (tenant_id, nome, cor) VALUES ($1,'PcD','#7C3AED') ON CONFLICT DO NOTHING`, [tenantId]);

  // 7. Cidadãos demo
  const cidadaos = [
    { nome: 'Maria da Silva', cpf: '123.456.789-00', telefone: '11988887777', email: 'maria@email.com' },
    { nome: 'João Santos', cpf: '987.654.321-00', telefone: '11977776666', email: 'joao@email.com' },
    { nome: 'Empresa ABC Ltda', cnpj: '12.345.678/0001-90', telefone: '11966665555', email: 'abc@email.com' },
  ];

  for (const cd of cidadaos) {
    const cidadao = await buscarOuCriarCidadao(tenantId, {
      nome: cd.nome,
      cpf: cd.cpf || null,
      cnpj: cd.cnpj || null,
      telefone: cd.telefone,
      email: cd.email,
      tipoPessoa: cd.cnpj ? 'juridica' : 'fisica',
    });
    if (cd.email) {
      try { await criarContaCidadao(tenantId, cidadao.id, cd.email, '123456'); } catch {}
    }
  }

  // 8. Protocolos demo em vários status
  const servicosList = await db.manyOrNone('SELECT id, nome, departamento_id FROM protocolo_servicos WHERE tenant_id = $1', [tenantId]);
  const cidadaosList = await db.manyOrNone('SELECT id, nome FROM cidadaos WHERE tenant_id = $1', [tenantId]);
  const operadores = await db.manyOrNone('SELECT id, nome FROM operadores WHERE tenant_id = $1 LIMIT 3', [tenantId]);

  if (servicosList.length > 0 && cidadaosList.length > 0 && operadores.length > 0) {
    const protocolos = [
      { cidadao: cidadaosList[0], servico: servicosList[0], assunto: 'Certidão para matrícula escolar', prioridade: 'NORMAL', origem: 'portal', status: 'CONCLUIDO' },
      { cidadao: cidadaosList[1], servico: servicosList[1], assunto: 'Alvará para novo restaurante', prioridade: 'ALTA', origem: 'whatsapp', status: 'EM_ANDAMENTO' },
      { cidadao: cidadaosList[2], servico: servicosList[3], assunto: 'Revisão IPTU 2026 - Galpão Industrial', prioridade: 'NORMAL', origem: 'presencial', status: 'ABERTO' },
      { cidadao: cidadaosList[0], servico: servicosList[2], assunto: 'Tapa-buraco Rua das Flores, 450', prioridade: 'URGENTE', origem: 'whatsapp', status: 'EM_ANDAMENTO' },
    ];

    for (const p of protocolos) {
      try {
        // Resolve contato_id do cidadão
        let contatoId = null;
        if (p.cidadao) {
          const c = await db.oneOrNone('SELECT contato_id FROM cidadaos WHERE id = $1', [p.cidadao.id]);
          contatoId = c?.contato_id || null;
        }

        const proto = await criarProtocolo(tenantId, {
          assunto: p.assunto,
          descricao: `Solicitação de ${p.servico.nome} — Protocolo demo gerado automaticamente.`,
          servicoId: p.servico.id,
          departamentoId: p.servico.departamento_id,
          contatoId,
          operadorId: operadores[0].id,
          prioridade: p.prioridade,
          origem: p.origem,
        });

        await gerarCredencialAcesso(tenantId, proto.id);

        // Movimentações conforme status
        if (p.status === 'EM_ANDAMENTO' || p.status === 'CONCLUIDO') {
          await tramitarProtocolo(tenantId, proto.id, {
            tipo: 'distribuicao',
            setorDestinoId: p.servico.departamento_id,
            operadorId: operadores[0].id,
            statusPosterior: 'EM_ANDAMENTO',
          });

          await enviarMensagemPublica(tenantId, proto.id, {
            operadorId: operadores[0].id,
            conteudo: `Prezado(a), sua solicitação de "${p.servico.nome}" foi recebida e está em análise. O prazo estimado é de ${p.servico.prazo_estimado_dias || 15} dias úteis.`,
          });

          if (p.status === 'CONCLUIDO') {
            await db.none(
              `UPDATE protocolos SET status = 'concluido', status_operacional = 'CONCLUIDO', resolvido_em = now()
               WHERE id = $1`, [proto.id]
            );
            await enviarMensagemPublica(tenantId, proto.id, {
              operadorId: operadores[0].id,
              conteudo: 'Sua solicitação foi concluída. O documento está disponível para download no portal.',
            });
          }

          await criarAnotacaoInterna(tenantId, proto.id, {
            operadorId: operadores[0].id,
            conteudo: 'Documentação verificada. Dados do cidadão conferem com o cadastro.',
          });
        }
      } catch (e) {
        console.warn(`[Seed] Erro ao criar protocolo demo "${p.assunto}":`, e.message);
      }
    }
  }

  // 9. Tipo de protocolo
  await db.none(`INSERT INTO protocolo_tipos (tenant_id, nome, descricao, prazo_padrao_dias, externo) VALUES ($1,'Solicitação','Solicitação externa do cidadão',15,true) ON CONFLICT DO NOTHING`, [tenantId]);
  await db.none(`INSERT INTO protocolo_tipos (tenant_id, nome, descricao, prazo_padrao_dias, externo) VALUES ($1,'Processo Interno','Tramitação administrativa interna',30,false) ON CONFLICT DO NOTHING`, [tenantId]);

  console.log('[Seed] Dados demo de protocolos inseridos com sucesso!');
}
