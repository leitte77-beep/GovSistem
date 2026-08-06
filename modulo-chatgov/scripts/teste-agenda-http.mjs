// Teste ponta a ponta das rotas /api/agenda contra o ambiente de DEV.
//
// Complementa scripts/teste-agenda.mjs: aquele exercita o serviço direto no
// banco, este passa pelo HTTP e prova que as rotas estão montadas, que o
// middleware de auth as protege e que os erros de validação chegam ao cliente
// com a mensagem que o formulário exibe.
//
//   ./scripts/dev.sh up
//   node scripts/teste-agenda-http.mjs
//
// Depende de ENABLE_DEV_E2E_AUTH=true, que só existe no compose de dev.
const base = process.env.CHATGOV_DEV_URL || 'http://127.0.0.1:13050';
const s = await fetch(`${base}/api/dev/saas/e2e-session`, { method: 'POST' }).then((r) => r.json());
const h = { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' };
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? '  ok  ' : ' FALHA'} ${m}`); if (!c) falhas++; };

const hoje = new Date(); hoje.setHours(0,0,0,0);
const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);
const emH = (n) => new Date(Date.now() + n*3600000).toISOString();

const criado = await fetch(`${base}/api/agenda/itens`, { method:'POST', headers:h, body: JSON.stringify({
  titulo:'Reunião com Licitação', inicio: emH(2), fim: emH(3), prioridade:'alta', lembretes:[{offset_min:30}],
})}).then(r=>r.json());
ok(criado.id && criado.lembretes.length===1, 'POST /itens cria com lembrete');

const qs = new URLSearchParams({ hoje_inicio: hoje.toISOString(), hoje_fim: amanha.toISOString(), dias:'7' });
const resumo = await fetch(`${base}/api/agenda/resumo?${qs}`, { headers:h }).then(r=>r.json());
ok(resumo.hoje.some(i=>i.id===criado.id), 'GET /resumo devolve o item no bloco de hoje');
ok(typeof resumo.contadores.atrasados === 'number', 'resumo traz contadores');

const semJanela = await fetch(`${base}/api/agenda/resumo`, { headers:h });
ok(semJanela.status === 400, 'resumo sem janela do dia é recusado com 400');

const ruim = await fetch(`${base}/api/agenda/itens`, { method:'POST', headers:h, body: JSON.stringify({ inicio: emH(1) })});
ok(ruim.status === 400, 'POST sem título devolve 400');
ok((await ruim.json()).erro.includes('Título'), 'mensagem de erro chega ao formulário');

const patch = await fetch(`${base}/api/agenda/itens/${criado.id}`, { method:'PATCH', headers:h, body: JSON.stringify({ inicio: emH(6) })}).then(r=>r.json());
ok(new Date(patch.fim) - new Date(patch.inicio) === 3600000, 'PATCH remarcando início preserva a duração');

await fetch(`${base}/api/agenda/itens/${criado.id}/concluir`, { method:'POST', headers:h, body: JSON.stringify({ observacao:'feito' })});
const depois = await fetch(`${base}/api/agenda/itens/${criado.id}`, { headers:h }).then(r=>r.json());
ok(depois.status==='concluida', 'POST /concluir muda o status');

const pend = await fetch(`${base}/api/agenda/lembretes/pendentes`, { headers:h }).then(r=>r.json());
ok(Array.isArray(pend) && !pend.some(l=>l.item_id===criado.id), 'lembrete de item concluído não toca');

await fetch(`${base}/api/agenda/itens/${criado.id}`, { method:'DELETE', headers:h });
ok((await fetch(`${base}/api/agenda/itens/${criado.id}`, { headers:h })).status===404, 'DELETE remove o item');

console.log(falhas===0 ? '\nE2E HTTP: TUDO PASSOU' : `\nE2E HTTP: ${falhas} falha(s)`);
process.exit(falhas===0?0:1);
