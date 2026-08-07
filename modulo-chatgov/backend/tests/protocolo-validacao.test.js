import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarCPF, validarCNPJ, validarEmail, validarCriacaoProtocolo,
} from '../src/domain/protocolo-validacao.js';

const campoComErro = (erros, campo) => erros.some((e) => e.campo === campo);

describe('validarCPF', () => {
  test('aceita CPF válido com e sem máscara', () => {
    assert.equal(validarCPF('529.982.247-25'), true);
    assert.equal(validarCPF('52998224725'), true);
  });

  test('rejeita dígito verificador errado', () => {
    assert.equal(validarCPF('529.982.247-26'), false);
  });

  test('rejeita sequências repetidas e tamanho inválido', () => {
    assert.equal(validarCPF('111.111.111-11'), false);
    assert.equal(validarCPF('123'), false);
    assert.equal(validarCPF(''), false);
  });
});

describe('validarCNPJ', () => {
  test('aceita CNPJ válido', () => {
    assert.equal(validarCNPJ('11.222.333/0001-81'), true);
  });

  test('rejeita dígito verificador errado e repetição', () => {
    assert.equal(validarCNPJ('11.222.333/0001-82'), false);
    assert.equal(validarCNPJ('11111111111111'), false);
  });
});

describe('validarEmail', () => {
  test('aceita e-mail bem formado', () => {
    assert.equal(validarEmail('cidadao@exemplo.gov.br'), true);
  });

  test('rejeita malformados', () => {
    assert.equal(validarEmail('sem-arroba'), false);
    assert.equal(validarEmail('a@b'), false);
    assert.equal(validarEmail(''), false);
  });
});

describe('validarCriacaoProtocolo — origem', () => {
  const base = { assunto: 'Poda de árvore', nome_cidadao: 'Maria', telefone_cidadao: '44999887766' };

  test('exige origem explícita (não assume whatsapp)', () => {
    const { erros } = validarCriacaoProtocolo(base);
    assert.ok(campoComErro(erros, 'origem'), 'origem ausente deveria ser erro');
  });

  test('rejeita origem whatsapp sem conversa vinculada', () => {
    const { erros } = validarCriacaoProtocolo({ ...base, origem: 'whatsapp' });
    assert.ok(campoComErro(erros, 'origem'));
  });

  test('aceita origem whatsapp quando criado a partir de uma conversa', () => {
    const { erros } = validarCriacaoProtocolo({
      ...base, origem: 'whatsapp', conversa_id: 'c0ffee00-0000-4000-8000-000000000000',
    });
    assert.equal(erros.length, 0, JSON.stringify(erros));
  });

  test('rejeita origem fora da lista permitida', () => {
    const { erros } = validarCriacaoProtocolo({ ...base, origem: 'pombo-correio' });
    assert.ok(campoComErro(erros, 'origem'));
  });

  test('aceita presencial e normaliza para minúsculas', () => {
    const { erros, normalizado } = validarCriacaoProtocolo({ ...base, origem: 'PRESENCIAL' });
    assert.equal(erros.length, 0, JSON.stringify(erros));
    assert.equal(normalizado.origem, 'presencial');
  });
});

describe('validarCriacaoProtocolo — solicitante', () => {
  test('bloqueia protocolo externo sem nenhum solicitante', () => {
    const { erros } = validarCriacaoProtocolo({ assunto: 'Pedido', origem: 'presencial' });
    assert.ok(campoComErro(erros, 'cidadao_id'));
  });

  test('permite protocolo interno sem cidadão', () => {
    const { erros } = validarCriacaoProtocolo({
      assunto: 'Requisição de material',
      origem: 'interno',
      tipo: 'INTERNO',
      departamento_id: 'dep00000-0000-4000-8000-000000000000',
    });
    assert.equal(erros.length, 0, JSON.stringify(erros));
  });

  test('protocolo interno exige unidade ou servidor solicitante', () => {
    const { erros } = validarCriacaoProtocolo({
      assunto: 'Requisição de material', origem: 'interno', tipo: 'INTERNO',
    });
    assert.ok(campoComErro(erros, 'departamento_id'));
  });

  test('aceita externo identificado só por CPF', () => {
    const { erros } = validarCriacaoProtocolo({
      assunto: 'Pedido', origem: 'presencial',
      nome_cidadao: 'João', cpf_cidadao: '529.982.247-25',
    });
    assert.equal(erros.length, 0, JSON.stringify(erros));
  });

  test('propaga CPF inválido como erro de campo', () => {
    const { erros } = validarCriacaoProtocolo({
      assunto: 'Pedido', origem: 'presencial',
      nome_cidadao: 'João', cpf_cidadao: '111.111.111-11',
    });
    assert.ok(campoComErro(erros, 'cpf_cidadao'));
  });

  test('normaliza telefone para E.164', () => {
    const { normalizado } = validarCriacaoProtocolo({
      assunto: 'Pedido', origem: 'telefone',
      nome_cidadao: 'Ana', telefone_cidadao: '(44) 99988-7766',
    });
    assert.equal(normalizado.telefone, '+5544999887766');
  });

  test('reporta telefone inválido', () => {
    const { erros } = validarCriacaoProtocolo({
      assunto: 'Pedido', origem: 'telefone', nome_cidadao: 'Ana', telefone_cidadao: '123',
    });
    assert.ok(campoComErro(erros, 'telefone_cidadao'));
  });
});

describe('validarCriacaoProtocolo — assunto e prazo', () => {
  const solicitante = { nome_cidadao: 'Maria', telefone_cidadao: '44999887766', origem: 'presencial' };

  test('exige assunto', () => {
    const { erros } = validarCriacaoProtocolo({ ...solicitante });
    assert.ok(campoComErro(erros, 'assunto'));
  });

  test('rejeita assunto muito curto', () => {
    const { erros } = validarCriacaoProtocolo({ ...solicitante, assunto: 'ab' });
    assert.ok(campoComErro(erros, 'assunto'));
  });

  test('rejeita prazo no passado', () => {
    const ontem = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { erros } = validarCriacaoProtocolo({ ...solicitante, assunto: 'Pedido', prazo: ontem });
    assert.ok(campoComErro(erros, 'prazo'));
  });

  test('aceita prazo futuro', () => {
    const futuro = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { erros } = validarCriacaoProtocolo({ ...solicitante, assunto: 'Pedido', prazo: futuro });
    assert.equal(erros.length, 0, JSON.stringify(erros));
  });

  test('rejeita prazo_dias fora de faixa', () => {
    const { erros } = validarCriacaoProtocolo({ ...solicitante, assunto: 'Pedido', prazo_dias: 0 });
    assert.ok(campoComErro(erros, 'prazo_dias'));
  });

  test('rejeita prioridade inválida', () => {
    const { erros } = validarCriacaoProtocolo({
      ...solicitante, assunto: 'Pedido', prioridade: 'URGENTÍSSIMO',
    });
    assert.ok(campoComErro(erros, 'prioridade'));
  });
});
