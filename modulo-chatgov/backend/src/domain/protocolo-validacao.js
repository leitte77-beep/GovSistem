import { normalizePhone } from './phone.js';

// Origens aceitas — espelha o CHECK ck_prot_origem da migration 024.
export const ORIGENS_VALIDAS = Object.freeze([
  'whatsapp', 'portal', 'presencial', 'telefone', 'email', 'app',
  'interno', 'importacao', 'api', 'assistente_virtual', 'outro',
]);

export const PRIORIDADES_VALIDAS = Object.freeze(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE']);

export const NIVEIS_ACESSO_VALIDOS = Object.freeze([
  'publico', 'restrito_cidadao', 'restrito_setor', 'sigiloso',
]);

export function limparDocumento(valor) {
  return String(valor || '').replace(/\D/g, '');
}

export function validarCPF(valor) {
  const cpf = limparDocumento(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  for (const [tamanho, posicaoDigito] of [[9, 9], [10, 10]]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) {
      soma += Number(cpf[i]) * (tamanho + 1 - i);
    }
    const resto = (soma * 10) % 11;
    const digito = resto === 10 || resto === 11 ? 0 : resto;
    if (digito !== Number(cpf[posicaoDigito])) return false;
  }
  return true;
}

export function validarCNPJ(valor) {
  const cnpj = limparDocumento(valor);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  for (const tamanho of [12, 13]) {
    let soma = 0;
    let peso = tamanho - 7;
    for (let i = 0; i < tamanho; i++) {
      soma += Number(cnpj[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    const digito = resto < 2 ? 0 : 11 - resto;
    if (digito !== Number(cnpj[tamanho])) return false;
  }
  return true;
}

export function validarEmail(valor) {
  const email = String(valor || '').trim();
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/**
 * Valida o payload de criação de protocolo.
 *
 * Retorna { erros, normalizado }. `erros` é uma lista de { campo, mensagem }
 * para que o frontend possa exibir a mensagem abaixo do campo correspondente,
 * em vez de um alerta genérico.
 */
export function validarCriacaoProtocolo(body = {}) {
  const erros = [];
  const push = (campo, mensagem) => erros.push({ campo, mensagem });

  const tipo = String(body.tipo || '').toUpperCase();
  const ehInterno = tipo === 'INTERNO' || body.externo === false;

  // ─── Assunto ───────────────────────────────────────────────
  const assunto = String(body.assunto || '').trim();
  if (!assunto) {
    push('assunto', 'Informe o assunto do protocolo.');
  } else if (assunto.length < 3) {
    push('assunto', 'O assunto deve ter ao menos 3 caracteres.');
  } else if (assunto.length > 300) {
    push('assunto', 'O assunto deve ter no máximo 300 caracteres.');
  }

  // ─── Origem ────────────────────────────────────────────────
  // Sem fallback silencioso para "whatsapp": a origem precisa ser explícita.
  const origem = String(body.origem || '').trim().toLowerCase();
  if (!origem) {
    push('origem', 'Informe a origem do protocolo.');
  } else if (!ORIGENS_VALIDAS.includes(origem)) {
    push('origem', `Origem inválida. Valores aceitos: ${ORIGENS_VALIDAS.join(', ')}.`);
  } else if (origem === 'whatsapp' && !body.conversa_id) {
    push('origem', 'A origem "whatsapp" só pode ser usada em protocolos criados a partir de uma conversa.');
  }

  // ─── Prioridade / nível de acesso ──────────────────────────
  const prioridade = String(body.prioridade || 'NORMAL').toUpperCase();
  if (!PRIORIDADES_VALIDAS.includes(prioridade)) {
    push('prioridade', `Prioridade inválida. Valores aceitos: ${PRIORIDADES_VALIDAS.join(', ')}.`);
  }

  const nivelAcesso = body.nivel_acesso ? String(body.nivel_acesso).toLowerCase() : null;
  if (nivelAcesso && !NIVEIS_ACESSO_VALIDOS.includes(nivelAcesso)) {
    push('nivel_acesso', 'Nível de acesso inválido.');
  }

  // ─── Solicitante ───────────────────────────────────────────
  const cpf = body.cpf_cidadao ? limparDocumento(body.cpf_cidadao) : '';
  const cnpj = body.cnpj_cidadao ? limparDocumento(body.cnpj_cidadao) : '';
  const nome = String(body.nome_cidadao || '').trim();
  let telefone = null;

  if (body.telefone_cidadao) {
    // normalizePhone lança em entrada inválida.
    try {
      telefone = normalizePhone(body.telefone_cidadao).phoneE164;
    } catch (err) {
      push('telefone_cidadao', `${err.message}. Use DDD + número.`);
    }
  }

  if (cpf && !validarCPF(cpf)) push('cpf_cidadao', 'CPF inválido.');
  if (cnpj && !validarCNPJ(cnpj)) push('cnpj_cidadao', 'CNPJ inválido.');
  if (body.email_cidadao && !validarEmail(body.email_cidadao)) {
    push('email_cidadao', 'E-mail inválido.');
  }

  if (ehInterno) {
    // Protocolo interno não exige cidadão, mas exige quem está solicitando.
    if (!body.departamento_id && !body.unidade_solicitante && !body.servidor_solicitante_id) {
      push('departamento_id', 'Protocolo interno exige a unidade ou o servidor solicitante.');
    }
  } else {
    // Protocolo externo sempre precisa de um solicitante identificável.
    const temIdentificacao = Boolean(body.cidadao_id || body.contato_id || cpf || cnpj || (nome && telefone));
    if (!temIdentificacao) {
      push('cidadao_id',
        'Protocolo externo exige um solicitante. Selecione um cidadão existente ou informe nome e telefone, CPF ou CNPJ. '
        + 'Se não há solicitante externo, marque o protocolo como interno.');
    } else if (!body.cidadao_id && !body.contato_id && !nome) {
      push('nome_cidadao', 'Informe o nome do solicitante.');
    }
  }

  // ─── Prazo ─────────────────────────────────────────────────
  if (body.prazo) {
    const prazo = new Date(body.prazo);
    if (isNaN(prazo.getTime())) {
      push('prazo', 'Data de prazo inválida.');
    } else {
      // Compara pelo fim do dia para não rejeitar um prazo definido para hoje.
      const fimDeHoje = new Date();
      fimDeHoje.setHours(23, 59, 59, 999);
      if (prazo < fimDeHoje && prazo.toDateString() !== new Date().toDateString()) {
        push('prazo', 'O prazo não pode ser anterior à data atual.');
      }
    }
  }

  if (body.prazo_dias !== undefined && body.prazo_dias !== null && body.prazo_dias !== '') {
    const dias = Number(body.prazo_dias);
    if (!Number.isFinite(dias) || dias <= 0 || dias > 3650) {
      push('prazo_dias', 'Prazo em dias deve ser um número entre 1 e 3650.');
    }
  }

  return {
    erros,
    normalizado: {
      assunto,
      origem,
      prioridade,
      nivelAcesso,
      ehInterno,
      cpf: cpf || null,
      cnpj: cnpj || null,
      telefone,
      nome: nome || null,
      email: body.email_cidadao ? String(body.email_cidadao).trim().toLowerCase() : null,
    },
  };
}
