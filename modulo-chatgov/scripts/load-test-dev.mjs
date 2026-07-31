const baseUrl = process.env.CHATGOV_DEV_API_URL || 'http://127.0.0.1:13050';
const total = Number(process.env.LOAD_TOTAL || 300);
const concurrency = Number(process.env.LOAD_CONCURRENCY || 25);

if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl) && !/^http:\/\/localhost:\d+$/.test(baseUrl)) {
  throw new Error('Por segurança, o teste de carga aceita somente um destino localhost.');
}

const sessionResponse = await fetch(`${baseUrl}/api/dev/saas/e2e-session`, { method: 'POST' });
if (!sessionResponse.ok) throw new Error('Sessão técnica DEV indisponível.');
const { token } = await sessionResponse.json();

const durations = [];
let errors = 0;
let cursor = 0;

async function worker() {
  while (cursor < total) {
    const current = cursor++;
    const path = current % 3 === 0 ? '/health' : '/api/v2/admin/diagnosticos';
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: path === '/health' ? {} : { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) errors += 1;
      await response.arrayBuffer();
    } catch {
      errors += 1;
    }
    durations.push(performance.now() - started);
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
durations.sort((a, b) => a - b);
const percentile = (p) => durations[Math.min(Math.ceil(durations.length * p) - 1, durations.length - 1)] || 0;
const result = {
  destino: baseUrl,
  requisicoes: total,
  concorrencia: concurrency,
  erros: errors,
  p50_ms: Number(percentile(0.50).toFixed(1)),
  p95_ms: Number(percentile(0.95).toFixed(1)),
  p99_ms: Number(percentile(0.99).toFixed(1)),
};
console.log(JSON.stringify(result, null, 2));

if (errors > 0 || result.p95_ms > 1500) process.exitCode = 1;
