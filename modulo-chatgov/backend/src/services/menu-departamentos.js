// Menu numerado de departamentos.
//
// Disparado quando o cidadão manda foto, áudio, vídeo ou documento numa
// conversa sem atendente e sem setor — o caso do atendimento que foi resolvido
// e o cidadão voltou. Só texto aciona o bot, então sem isto a mídia fica
// parada no painel sem destino.

export const CABECALHO_MENU_PADRAO = `Recebemos sua mensagem! 📎

Para encaminharmos ao setor responsável, digite o número da opção desejada:`;

export const RODAPE_MENU = 'Digite apenas o número da opção.';

export const MENSAGEM_OPCAO_INVALIDA = 'Não encontrei essa opção. Confira a lista e digite apenas o número do setor desejado:';

/**
 * Monta o texto do menu. `departamentos` precisa vir com { menu_numero, nome },
 * já filtrado por ativos e com número atribuído.
 */
export function montarMenuDepartamentos({ cabecalho, departamentos }) {
  const topo = (cabecalho || '').trim() || CABECALHO_MENU_PADRAO;
  const linhas = [...departamentos]
    .sort((a, b) => a.menu_numero - b.menu_numero)
    .map((d) => `${d.menu_numero} - ${d.nome}`);
  return `${topo}\n\n${linhas.join('\n')}\n\n${RODAPE_MENU}`;
}

/**
 * Lê a resposta do cidadão como escolha de menu.
 *
 * Aceita só o número, eventualmente cercado de pontuação ou de um "opção"
 * ("4", "4.", "opção 4"). Qualquer coisa mais longa que isso é conversa de
 * verdade e volta null, para não sequestrar uma frase que começa com número
 * ("2 semanas atrás eu protocolei...") e mandá-la para o setor errado.
 */
export function interpretarEscolhaMenu(texto) {
  const limpo = String(texto || '')
    .trim()
    .replace(/^op(ç|c)(ã|a)o\s*/i, '')
    .replace(/[.\-)º°]+$/, '')
    .trim();
  if (!/^\d{1,3}$/.test(limpo)) return null;
  const numero = Number.parseInt(limpo, 10);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}
