// Recusa automática de chamadas do WhatsApp.
//
// O ChatGov atende só por mensagem. Como a conta é multi-dispositivo, a
// ligação toca ao mesmo tempo no servidor e no aparelho do órgão — recusar
// pelo servidor derruba a chamada para todos, então o aparelho para de tocar
// em um ou dois segundos. Aqui ficam o texto e as regras de formatação; quem
// escuta o evento e responde é o gateway.

// {orgao} e {telefone} são trocados no envio. O texto fica editável por órgão
// (tenant_config.chamadas_mensagem); este é o que vale enquanto ninguém mexer.
export const MENSAGEM_CHAMADA_PADRAO = `Olá! 😊

Informamos que este número de WhatsApp da {orgao} é destinado exclusivamente ao atendimento por mensagens.

Para atendimento por ligação telefônica, pedimos a gentileza de entrar em contato pelo telefone fixo:

📞 {telefone}

Caso precise falar com algum departamento específico, informe por mensagem que teremos prazer em orientá-lo e encaminhar ao setor responsável.

Agradecemos a compreensão!
{orgao}`;

/**
 * Formata o número da sessão do WhatsApp (E.164 sem '+', ex.: 554435631101)
 * como telefone brasileiro legível: (44) 3563-1101.
 * Devolve null quando não dá para reconhecer um número discável.
 */
export function formatarTelefoneBR(numero) {
  const digitos = String(numero || '').replace(/\D/g, '');
  if (!digitos) return null;

  // O WhatsApp entrega com o código do país na frente. Só tiramos o 55 quando
  // sobra número suficiente para DDD + assinante, senão um fixo já sem país
  // (4435631101) seria mutilado.
  const semPais = digitos.startsWith('55') && digitos.length > 10 ? digitos.slice(2) : digitos;
  if (semPais.length < 10 || semPais.length > 11) return null;

  const ddd = semPais.slice(0, 2);
  const assinante = semPais.slice(2);
  // Fixo tem 8 dígitos e celular 9. Celulares antigos ficam gravados no
  // WhatsApp SEM o nono dígito, e nesse caso saem como 9737-2117 mesmo: é o
  // número que o próprio WhatsApp conhece, e inventar o nono aqui produziria
  // um telefone que não existe.
  const meio = assinante.slice(0, assinante.length - 4);
  const fim = assinante.slice(-4);
  return `(${ddd}) ${meio}-${fim}`;
}

/**
 * Resolve o nome do órgão que aparece na mensagem. O cadastro está em caixa
 * alta ("PREFEITURA DE FAROL"), que no meio de uma frase parece grito — por
 * isso o campo de exibição, quando preenchido, tem prioridade.
 */
export function resolverNomeOrgao({ nomeExibicao, nomeTenant }) {
  const escolhido = (nomeExibicao || '').trim() || (nomeTenant || '').trim();
  return escolhido || null;
}

/**
 * Telefone que vai no aviso: o configurado pelo órgão ou, na falta dele, o
 * próprio número conectado — que na maioria dos municípios é o mesmo fixo.
 */
export function resolverTelefoneOrgao({ telefoneConfigurado, numeroSessao }) {
  const manual = (telefoneConfigurado || '').trim();
  if (manual) return manual;
  return formatarTelefoneBR(numeroSessao);
}

export function montarMensagemChamada({ template, orgao, telefone }) {
  const texto = (template || '').trim() || MENSAGEM_CHAMADA_PADRAO;
  return texto
    .replaceAll('{orgao}', orgao || '')
    .replaceAll('{telefone}', telefone || '')
    .trim();
}
