// Teste de integração do serviço da agenda pessoal.
//
// Precisa de um banco DESCARTÁVEL com todas as migrations aplicadas — ele
// insere tenant, operadores e conversas, e não limpa nada ao terminar. Fica
// fora de `backend/test/` de propósito: `npm test` roda só testes puros, que
// não podem depender de um Postgres de pé.
//
//   docker compose exec -T postgres psql -U chatgov -d postgres \
//     -c "CREATE DATABASE chatgov_ag_test;"
//   for f in backend/src/migrations/{schema,evolucoes,019_*,020_*,021_*,022_*,023_*}.sql; do
//     docker compose exec -T postgres psql -U chatgov -d chatgov_ag_test -q < "$f"
//   done
// Do host, com o backend instalado localmente:
//   DATABASE_URL=postgres://.../chatgov_ag_test npm --prefix backend run test:agenda
//
// Ou dentro do container (o node_modules da imagem fica em /app, e o Node o
// encontra subindo a partir de /app/backend/src):
//   docker compose run --rm --no-deps \
//     -v "$PWD/backend:/app/backend:ro" -v "$PWD/scripts:/app/scripts:ro" \
//     -e DATABASE_URL=postgres://chatgov:chatgov@postgres:5432/chatgov_ag_test \
//     backend node /app/scripts/teste-agenda.mjs
import db from '../backend/src/db.js';
import * as ag from '../backend/src/services/agenda.js';

// Trava de segurança: o script escreve no banco a que estiver conectado. Rodar
// isso por engano apontando para produção encheria a base de dados de teste.
const url = process.env.DATABASE_URL || '';
if (!/test/i.test(url)) {
  console.error('Recusando rodar: DATABASE_URL precisa apontar para um banco de teste.');
  console.error(`  DATABASE_URL atual: ${url || '(não definida)'}`);
  process.exit(1);
}

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  ok  ' : ' FALHA'} ${msg}`);
  if (!cond) falhas++;
};

const tenant = await db.one(`INSERT INTO tenants (nome, slug) VALUES ('Teste','teste-ag') RETURNING id`);
const op = await db.one(
  `INSERT INTO operadores (tenant_id, nome, email, senha_hash, papel) VALUES ($1,'Alisson','a@t.com','x','admin') RETURNING id`,
  [tenant.id]
);
const op2 = await db.one(
  `INSERT INTO operadores (tenant_id, nome, email, senha_hash, papel) VALUES ($1,'Outro','b@t.com','x','atendente') RETURNING id`,
  [tenant.id]
);
const contato = await db.one(
  `INSERT INTO contatos (tenant_id, wa_jid, nome, telefone) VALUES ($1,'55@x','João','5569999') RETURNING id`,
  [tenant.id]
);
const conversa = await db.one(
  `INSERT INTO conversas (tenant_id, contato_id) VALUES ($1,$2) RETURNING id`,
  [tenant.id, contato.id]
);

const T = tenant.id, O = op.id;
const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
const emHoras = (h) => new Date(Date.now() + h * 3600000).toISOString();

console.log('\n== criação e validação ==');
const c1 = await ag.criarItem(T, O, {
  titulo: 'Reunião com Compras', inicio: emHoras(2), fim: emHoras(3),
  prioridade: 'alta', lembretes: [{ offset_min: 30 }, { offset_min: 0 }],
  conversa_id: conversa.id, contato_id: contato.id,
});
ok(c1.id && c1.lembretes.length === 2, 'compromisso criado com 2 lembretes');
ok(c1.prioridade === 'alta', 'prioridade gravada');

const tarefa = await ag.criarItem(T, O, {
  tipo: 'tarefa', titulo: 'Enviar relatório mensal', inicio: emHoras(-30),
  fim: emHoras(-29), dia_todo: true, prioridade: 'urgente',
});
ok(tarefa.fim === null, 'tarefa descarta hora final');

await ag.criarItem(T, O, { titulo: 'Reunião de planejamento', inicio: emHoras(72) });
await ag.criarItem(T, op2.id, { titulo: 'Item de outro operador', inicio: emHoras(2) });

for (const [rotulo, corpo] of [
  ['sem título', { inicio: emHoras(1) }],
  ['sem data', { titulo: 'x' }],
  ['data inválida', { titulo: 'x', inicio: 'não é data' }],
  ['fim antes do início', { titulo: 'x', inicio: emHoras(3), fim: emHoras(1) }],
  ['prioridade inválida', { titulo: 'x', inicio: emHoras(1), prioridade: 'altíssima' }],
]) {
  let barrou = false;
  try { await ag.criarItem(T, O, corpo); } catch (e) { barrou = e.name === 'AgendaError'; }
  ok(barrou, `recusa ${rotulo}`);
}

console.log('\n== resumo ==');
const r = await ag.resumo(T, O, { hojeInicio: hoje.toISOString(), hojeFim: amanha.toISOString() });
ok(r.hoje.length === 1 && r.hoje[0].titulo === 'Reunião com Compras', 'bloco "hoje" com o compromisso de hoje');
ok(r.pendencias.length === 1 && r.pendencias[0].titulo === 'Enviar relatório mensal', 'bloco "pendências" com o item vencido');
ok(r.proximos.length === 1, 'bloco "próximos" com o item de daqui a 3 dias');
ok(r.contadores.urgentes === 1, 'contador de urgentes');
ok(r.contadores.atrasados === 1, 'contador de atrasados');
ok(r.hoje[0].contato_nome === 'João', 'vínculo traz o nome do contato');
ok(r.hoje[0].lembretes.length === 2, 'lembretes vêm junto no resumo');
ok(!JSON.stringify(r).includes('outro operador'), 'não vaza item de outro operador');

console.log('\n== lembretes ==');
let pend = await ag.lembretesPendentes(T, O);
ok(pend.length === 0, 'nada pendente antes da hora');

const jaVencido = await ag.criarItem(T, O, { titulo: 'Ligar para fornecedor', inicio: emHoras(0.2), lembretes: [{ offset_min: 60 }] });
pend = await ag.lembretesPendentes(T, O);
ok(pend.length === 1 && pend[0].titulo === 'Ligar para fornecedor', 'lembrete vencido aparece');

await ag.reconhecerLembrete(T, O, pend[0].id, { adiarMin: 30 });
ok((await ag.lembretesPendentes(T, O)).length === 0, 'adiar tira da fila');

const lem = await db.one('SELECT * FROM agenda_lembretes WHERE id=$1', [pend[0].id]);
ok(new Date(lem.disparar_em) > new Date(Date.now() + 25 * 60000), 'adiamento reagendou para o futuro');

await db.none('UPDATE agenda_lembretes SET disparar_em = now() - interval \'1 minute\' WHERE id=$1', [pend[0].id]);
ok((await ag.lembretesPendentes(T, O)).length === 1, 'lembrete adiado volta quando vence');
await ag.reconhecerLembrete(T, O, pend[0].id);
ok((await ag.lembretesPendentes(T, O)).length === 0, 'dispensar silencia');

console.log('\n== edição ==');
const novoInicio = emHoras(48);
const editado = await ag.atualizarItem(T, O, c1.id, { inicio: novoInicio, titulo: 'Reunião com Compras (remarcada)' });
ok(editado.titulo.includes('remarcada'), 'título atualizado');
ok(editado.lembretes.length === 2, 'lembretes preservados');
const dif = Math.round((new Date(novoInicio) - new Date(editado.lembretes.find((l) => l.offset_min === 30).disparar_em)) / 60000);
ok(dif === 30, 'lembrete reagendado junto com a nova data');
ok(editado.prioridade === 'alta', 'campo não enviado mantém o valor');

console.log('\n== conclusão ==');
await ag.concluirItem(T, O, jaVencido.id, { observacao: 'Falei com o setor' });
const concl = await ag.getItem(T, O, jaVencido.id);
ok(concl.status === 'concluida' && concl.observacao_final === 'Falei com o setor', 'conclusão registra status e observação');
ok((await ag.listarItens(T, O, { status: 'concluida' })).length === 1, 'filtro de concluídos');
await ag.reabrirItem(T, O, jaVencido.id);
ok((await ag.getItem(T, O, jaVencido.id)).status === 'pendente', 'reabrir volta para pendente');

console.log('\n== isolamento ==');
ok((await ag.getItem(T, op2.id, c1.id)) === null, 'operador não lê item alheio');
let barrouEdicao = false;
try { await ag.atualizarItem(T, op2.id, c1.id, { titulo: 'invadido' }); } catch (e) { barrouEdicao = e.status === 404; }
ok(barrouEdicao, 'operador não edita item alheio');
let barrouExclusao = false;
try { await ag.excluirItem(T, op2.id, c1.id); } catch (e) { barrouExclusao = e.status === 404; }
ok(barrouExclusao, 'operador não exclui item alheio');

console.log('\n== busca e paginação ==');
ok((await ag.listarItens(T, O, { busca: 'relatório' })).length === 1, 'busca por título');
ok((await ag.listarItens(T, O, { limite: 2 })).length === 2, 'limite respeitado');
ok((await ag.listarItens(T, O, { status: 'abertos' })).every((i) => i.status !== 'concluida'), 'filtro de abertos');

console.log('\n== exclusão em cascata ==');
await ag.excluirItem(T, O, c1.id);
ok((await db.manyOrNone('SELECT 1 FROM agenda_lembretes WHERE item_id=$1', [c1.id])).length === 0, 'lembretes somem com o item');

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
