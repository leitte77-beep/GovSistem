import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchLembretesPendentes, reconhecerLembrete, concluirItemAgenda } from '../api/agenda';
import { notificarAgendaAtualizada } from '../components/agenda/eventos';

// Intervalo do polling. A precisão que um lembrete precisa é de minutos, não de
// segundos — consultar a cada segundo só renderia carga no banco sem o
// atendente perceber diferença alguma.
const INTERVALO_MS = 60000;

/**
 * Fila de lembretes vencidos.
 *
 * Devolve um por vez (`atual`): vários popups abertos ao mesmo tempo cobrem a
 * tela e o atendente fecha todos no reflexo, perdendo o aviso que importava.
 */
export function useLembretesAgenda({ ativo = true } = {}) {
  const [fila, setFila] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  // Ids já exibidos nesta sessão. Impede que o mesmo lembrete volte à fila a
  // cada rodada do polling enquanto o usuário decide o que fazer com ele.
  const vistosRef = useRef(new Set());

  const buscar = useCallback(async () => {
    try {
      const pendentes = await fetchLembretesPendentes();
      const novos = pendentes.filter((l) => !vistosRef.current.has(l.id));
      if (!novos.length) return;
      for (const l of novos) vistosRef.current.add(l.id);
      setFila((f) => [...f, ...novos]);
      avisarNoSistema(novos[0]);
    } catch {
      // Falha de rede não pode derrubar o ciclo: a próxima rodada tenta de novo.
    }
  }, []);

  useEffect(() => {
    if (!ativo) return undefined;
    buscar();
    const id = setInterval(buscar, INTERVALO_MS);
    return () => clearInterval(id);
  }, [ativo, buscar]);

  const remover = (id) => setFila((f) => f.filter((l) => l.id !== id));

  const dispensar = useCallback(async (lembrete) => {
    remover(lembrete.id);
    setOcupado(true);
    try { await reconhecerLembrete(lembrete.id); } catch {} finally { setOcupado(false); }
  }, []);

  const adiar = useCallback(async (lembrete, minutos) => {
    remover(lembrete.id);
    // Sai da lista de vistos: ele deve voltar a aparecer quando o prazo do
    // adiamento acabar.
    vistosRef.current.delete(lembrete.id);
    setOcupado(true);
    try { await reconhecerLembrete(lembrete.id, minutos); } catch {} finally { setOcupado(false); }
  }, []);

  const concluir = useCallback(async (lembrete) => {
    remover(lembrete.id);
    setOcupado(true);
    try {
      await concluirItemAgenda(lembrete.item_id);
      notificarAgendaAtualizada();
    } catch {} finally { setOcupado(false); }
  }, []);

  return { atual: fila[0] || null, restantes: Math.max(fila.length - 1, 0), ocupado, dispensar, adiar, concluir };
}

/**
 * Notificação do sistema operacional — só quando a permissão JÁ foi concedida
 * em outro fluxo. A agenda não é lugar para pedir permissão de notificação.
 */
function avisarNoSistema(lembrete) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!document.hidden) return; // com a aba à vista, o popup interno basta
    new Notification('Lembrete — ChatGov', {
      body: lembrete.titulo,
      icon: '/icone-notificacao.svg',
      tag: `agenda-${lembrete.id}`,
    });
  } catch {}
}
