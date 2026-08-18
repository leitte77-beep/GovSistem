/**
 * Setor que um atendimento deve herdar quando ninguém escolheu um destino.
 *
 * O atendente quase sempre fala em nome do próprio setor, então deixar a
 * conversa "sem setor" só porque o campo ficou em branco tira o atendimento
 * dos relatórios por secretaria e da fila do setor. Herdar o cadastro do
 * operador resolve o caso comum.
 *
 * Só herda quando não há ambiguidade: com dois setores não dá para adivinhar
 * em nome de qual ele está falando, e carimbar o errado é pior que não
 * carimbar — nesse caso quem escolhe é a tela (que mostra o campo preenchido
 * e editável antes de enviar).
 */
export async function departamentoPadraoDoOperador(conn, { operadorId, tenantId }) {
  if (!operadorId || !tenantId) return null;
  const deps = await conn.manyOrNone(
    `SELECT d.id FROM operador_departamentos od
     JOIN departamentos d ON d.id = od.departamento_id AND d.ativo = true
     WHERE od.operador_id = $1 AND d.tenant_id = $2
     ORDER BY d.nome`,
    [operadorId, tenantId]
  );
  return deps.length === 1 ? deps[0].id : null;
}
