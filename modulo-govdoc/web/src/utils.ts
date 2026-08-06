export function formatarBytes(valor = 0) {
  if (!valor) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  const indice = Math.min(Math.floor(Math.log(valor) / Math.log(1024)), unidades.length - 1);
  return `${(valor / 1024 ** indice).toLocaleString('pt-BR', { maximumFractionDigits: indice ? 1 : 0 })} ${unidades[indice]}`;
}

export function formatarData(valor?: string, comHora = false) {
  if (!valor) return '—';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return new Intl.DateTimeFormat('pt-BR', comHora ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(data);
}

export function rotulo(valor?: string) {
  if (!valor) return '—';
  return valor.replaceAll('_', ' ').replace(/\b\w/g, (letra) => letra.toUpperCase());
}

export function parametros(valores: Record<string, unknown>) {
  const busca = new URLSearchParams();
  Object.entries(valores).forEach(([chave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== '') busca.set(chave, String(valor));
  });
  const texto = busca.toString();
  return texto ? `?${texto}` : '';
}

export function iniciais(nome = '') {
  return nome.split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase() || 'GD';
}

