// Ativação por teclado para elementos que são clicáveis sem ser <button>.
//
// Itens de lista (conversa, canal, compromisso) precisam conter botões
// próprios — fixar, concluir, abrir conversa — e botão dentro de botão é HTML
// inválido. Por isso a linha continua sendo um <div role="button"> e a
// ativação por Enter/Espaço, que o navegador daria de graça num <button>,
// precisa ser escrita à mão.

const ALVOS_INTERATIVOS = 'button, a, input, textarea, select, [role="button"]';

/**
 * onKeyDown que dispara `acao` no Enter e no Espaço.
 *
 * Ignora o evento quando ele nasceu num controle interno (o Enter no botão de
 * fixar deve fixar, não abrir a conversa) e segura o Espaço, que por padrão
 * rolaria a página.
 */
export function ativarComTeclado(acao) {
  return function (evento) {
    if (!acao) return;
    if (evento.key !== 'Enter' && evento.key !== ' ' && evento.key !== 'Spacebar') return;
    const alvo = evento.target;
    if (alvo !== evento.currentTarget && alvo.closest && alvo.closest(ALVOS_INTERATIVOS)) return;
    evento.preventDefault();
    acao(evento);
  };
}
