const MINUTE = 60_000;

function hhmmToMinutes(value) {
  const [hour, minute] = String(value).split(':').map(Number);
  return hour * 60 + minute;
}

export function businessMinutesBetween(start, end, schedule, holidays = new Set()) {
  let cursor = new Date(start);
  const limit = new Date(end);
  if (cursor >= limit) return 0;
  let total = 0;
  while (cursor < limit) {
    const dayKey = cursor.toISOString().slice(0, 10);
    const periods = holidays.has(dayKey) ? [] : (schedule[cursor.getUTCDay()] || []);
    const minuteOfDay = cursor.getUTCHours() * 60 + cursor.getUTCMinutes();
    if (periods.some(([from, to]) => minuteOfDay >= hhmmToMinutes(from) && minuteOfDay < hhmmToMinutes(to))) {
      total++;
    }
    cursor = new Date(cursor.getTime() + MINUTE);
  }
  return total;
}

export function slaIndicator(elapsedMinutes, targetMinutes, warningPercent = 80) {
  if (elapsedMinutes >= targetMinutes) return 'VENCIDO';
  if (elapsedMinutes >= targetMinutes * (warningPercent / 100)) return 'PROXIMO';
  return 'NO_PRAZO';
}
