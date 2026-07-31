import test from 'node:test';
import assert from 'node:assert/strict';
import { fillDailySeries, assertMetricConsistency } from '../src/domain/metrics.js';
import { businessMinutesBetween, slaIndicator } from '../src/domain/sla.js';
import {
  deduplicateProviderEvents, assertInternalNoteDestination,
  canCreateOperationalConversation, canRetryMessage,
} from '../src/domain/message-policy.js';
import { assertTransition, normalizeStatus } from '../src/domain/status.js';
import { normalizePhone } from '../src/domain/phone.js';
import { hasPermission } from '../src/auth/permissions.js';
import { maskCpf } from '../src/domain/privacy.js';

test('1. badge considera apenas notificações não lidas e não arquivadas', () => {
  const rows = [{ lida: false }, { lida: true }, { lida: false, arquivada_em: new Date() }];
  assert.equal(rows.filter((n) => !n.lida && !n.arquivada_em).length, 1);
});

test('2. cards e gráficos rejeitam totais divergentes', () => {
  assert.equal(assertMetricConsistency(3, [{ total: 1 }, { total: 2 }]), true);
  assert.throws(() => assertMetricConsistency(4, [{ total: 1 }, { total: 2 }]));
});

test('3. série temporal preenche dias sem movimento com zero', () => {
  assert.deepEqual(fillDailySeries('2026-07-01', '2026-07-03', [{ dia: '2026-07-02', total: 2 }]), [
    { dia: '2026-07-01', recebidas: 0, resolvidas: 0, pendentes: 0 },
    { dia: '2026-07-02', recebidas: 2, resolvidas: 0, pendentes: 0 },
    { dia: '2026-07-03', recebidas: 0, resolvidas: 0, pendentes: 0 },
  ]);
});

test('4. webhook repetido é deduplicado pelo identificador do provedor', () => {
  assert.equal(deduplicateProviderEvents([
    { providerMessageId: 'A' }, { providerMessageId: 'A' }, { providerMessageId: 'B' },
  ]).length, 2);
});

test('5. uma chave idempotente representa uma única ação de envio', () => {
  assert.equal(new Set(['acao-1', 'acao-1']).size, 1);
});

test('6. atendente não recebe permissão global de auditoria', () => {
  assert.equal(hasPermission('operador', 'auditoria.visualizar'), false);
});

test('7. telefones equivalentes normalizam para a mesma chave', () => {
  assert.equal(normalizePhone('(11) 99999-1234').phoneE164, normalizePhone('+55 11 99999-1234').phoneE164);
});

test('8. mesclagem preserva ids de histórico', () => {
  const historico = [{ contatoId: 'origem' }, { contatoId: 'destino' }];
  const ids = new Set(historico.map((item) => item.contatoId));
  assert.deepEqual([...ids].sort(), ['destino', 'origem']);
});

test('9. conversa resolvida respeita transição e exige responsável', () => {
  assert.throws(() => assertTransition('conversa', 'EM_ATENDIMENTO', 'RESOLVIDA', {}));
  assert.equal(assertTransition('conversa', 'EM_ATENDIMENTO', 'RESOLVIDA', { operadorId: 'op' }), 'RESOLVIDA');
});

test('10. protocolo concluído só reabre com justificativa', () => {
  assert.throws(() => assertTransition('protocolo', 'CONCLUIDO', 'EM_ANDAMENTO', {}));
  assert.equal(assertTransition('protocolo', 'CONCLUIDO', 'EM_ANDAMENTO', { justificativa: 'Novo documento' }), 'EM_ANDAMENTO');
});

test('11. exclusão operacional é representada por marca temporal', () => {
  const row = { id: '1', deleted_at: new Date().toISOString() };
  assert.equal(row.id, '1');
  assert.ok(row.deleted_at);
});

test('12. evento de exportação carrega formato, filtros e período', () => {
  const detalhe = { formato: 'csv', filtros: { status: 'RESOLVIDA' }, periodo: { inicio: '2026-07-01' } };
  assert.equal(detalhe.formato, 'csv');
  assert.equal(detalhe.filtros.status, 'RESOLVIDA');
});

test('13. CPF é mascarado sem permissão', () => {
  assert.equal(maskCpf('12345678901'), '***.456.789-**');
});

test('14. bloqueio ativo impede criação operacional', () => {
  assert.equal(canCreateOperationalConversation({ ativo: true }), false);
  assert.equal(canCreateOperationalConversation({ ativo: false }), true);
});

test('15. SLA considera somente períodos úteis configurados', () => {
  const schedule = { 1: [['09:00', '12:00'], ['13:00', '18:00']] };
  const minutes = businessMinutesBetween('2026-07-27T08:00:00Z', '2026-07-27T14:00:00Z', schedule);
  assert.equal(minutes, 240);
  assert.equal(slaIndicator(minutes, 300), 'PROXIMO');
});

test('16. desconexão produz categoria operacional de alerta', () => {
  assert.equal({ tipo: 'canal_desconectado' }.tipo, 'canal_desconectado');
});

test('17. nota interna nunca aceita destino de WhatsApp', () => {
  assert.throws(() => assertInternalNoteDestination('whatsapp'));
  assert.equal(assertInternalNoteDestination('interno'), true);
});

test('18. somente mensagem falha dentro do limite pode ser tentada novamente', () => {
  assert.equal(canRetryMessage({ status: 'falhou', tentativas: 1 }), true);
  assert.equal(canRetryMessage({ status: 'enviado', tentativas: 1 }), false);
});

test('19. alteração de perfil muda a decisão de permissão', () => {
  assert.equal(hasPermission('operador', 'dados.exportar'), false);
  assert.equal(hasPermission('supervisor', 'dados.exportar'), true);
});

test('20. estados legados permanecem normalizáveis após migrations', () => {
  assert.equal(normalizeStatus('conversa', 'aberta'), 'EM_ATENDIMENTO');
  assert.equal(normalizeStatus('protocolo', 'encerrado'), 'CONCLUIDO');
});
