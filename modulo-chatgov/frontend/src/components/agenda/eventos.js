import { useEffect } from 'react';

// A agenda aparece em três lugares ao mesmo tempo (painel central, popup de
// lembrete, modal de login) e nenhum deles é pai do outro. Um evento no window
// é o caminho mais curto para os três se manterem sincronizados sem levantar um
// contexto global só para isso — mesmo padrão já usado em
// 'notificacao:abrir-conversa'.
const EVENTO = 'agenda:atualizada';

export function notificarAgendaAtualizada() {
  window.dispatchEvent(new CustomEvent(EVENTO));
}

export function useAgendaAtualizada(callback) {
  useEffect(() => {
    const handler = () => callback();
    window.addEventListener(EVENTO, handler);
    return () => window.removeEventListener(EVENTO, handler);
  }, [callback]);
}
