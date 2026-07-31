function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

export function fillDailySeries(start, end, rows = []) {
  const values = new Map(rows.map((row) => [isoDate(row.dia), {
    recebidas: Number(row.recebidas || row.total || 0),
    resolvidas: Number(row.resolvidas || 0),
    pendentes: Number(row.pendentes || 0),
  }]));
  const result = [];
  const cursor = new Date(`${isoDate(start)}T12:00:00.000Z`);
  const limit = new Date(`${isoDate(end)}T12:00:00.000Z`);
  while (cursor <= limit) {
    const dia = isoDate(cursor);
    result.push({ dia, ...(values.get(dia) || { recebidas: 0, resolvidas: 0, pendentes: 0 }) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function assertMetricConsistency(total, groups) {
  const groupedTotal = groups.reduce((sum, item) => sum + Number(item.total || 0), 0);
  if (Number(total) !== groupedTotal) {
    throw new Error(`Métricas divergentes: total=${total}, grupos=${groupedTotal}`);
  }
  return true;
}
