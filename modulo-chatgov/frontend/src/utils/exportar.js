// Exportação compartilhada: nasceu dentro da tela de Relatórios, saiu para cá
// quando o Dashboard passou a exportar também — duas cópias divergiriam no
// primeiro ajuste de separador ou de encoding.

export function celulaCsv(valor) {
  const texto = valor == null ? '' : String(valor);
  return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

// Excel brasileiro abre CSV com ponto e vírgula; o BOM evita acento quebrado.
export function montarCsv(linhas) {
  return '﻿' + (linhas || []).map((linha) => (linha || []).map(celulaCsv).join(';')).join('\r\n');
}

export function baixarArquivo(conteudo, nome, mime) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Nome previsível e ordenável: quem baixa toda semana quer os arquivos em ordem.
export function nomeArquivoExport(prefixo, inicio, fim) {
  const limpar = (v) => String(v || '').replace(/[^0-9-]/g, '');
  const de = limpar(inicio);
  const ate = limpar(fim);
  const base = de && ate && de !== ate ? `${de}_a_${ate}` : (de || ate || 'periodo');
  return `${prefixo}_${base}`;
}
