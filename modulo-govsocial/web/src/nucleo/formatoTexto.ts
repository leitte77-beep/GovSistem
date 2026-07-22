/**
 * Normalização de rótulos vindos do backend (§4). Aplicada na fronteira de
 * ingestão (ex.: CarregadorUnidades) para que TODOS os pontos de exibição
 * (seletor, "Exibindo", breadcrumb, relatório) mostrem o mesmo texto — uma
 * única fonte, uma única correção.
 *
 * Não força um text-transform (Title Case / UPPERCASE) sobre o nome inteiro:
 * unidades legitimamente usam siglas (CRAS, CREAS, SEDE) que uma normalização
 * "inteligente" de capitalização quebraria. A regra aqui é cirúrgica —
 * corrige apenas acentuação de palavras conhecidas, preservando a
 * capitalização original do restante do texto.
 *
 * TODO(backend): corrigir na origem (tabela `units`) o registro sem acento;
 * este é um remendo de exibição, não a fonte da verdade.
 */
const CORRECOES_ACENTO: [RegExp, string][] = [[/assistencia/gi, "assistência"]];

function aplicarCapitalizacao(original: string, substituto: string): string {
  if (original === original.toUpperCase()) return substituto.toUpperCase();
  if (original[0] === original[0].toUpperCase()) {
    return substituto.charAt(0).toUpperCase() + substituto.slice(1);
  }
  return substituto;
}

export function normalizarNomeUnidade(nome: string): string {
  let texto = nome.trim().replace(/\s+/g, " ");
  for (const [padrao, substituto] of CORRECOES_ACENTO) {
    texto = texto.replace(padrao, (encontrado) => aplicarCapitalizacao(encontrado, substituto));
  }
  return texto;
}
