import { useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { fetchNotificacoesStatus } from '../api/evolucoes';

let cachedConfig = null;
let cachedConfigAt = 0;
const CONFIG_TTL = 60000;

// Ícone usado na notificação desktop (servido de /public).
const ICONE = '/icone-notificacao.svg';
// Arquivo de som customizado (coloque em frontend/public/notificacao.mp3).
// Se não existir, cai no "beep" sintetizado mais alto.
const SOM_URL = '/notificacao.mp3';

async function getConfigCached() {
  if (cachedConfig && Date.now() - cachedConfigAt < CONFIG_TTL) return cachedConfig;
  try {
    const data = await fetchNotificacoesStatus();
    cachedConfig = data.config;
    cachedConfigAt = Date.now();
    return cachedConfig;
  } catch {
    return { push_ativo: true, som_ativado: true };
  }
}

function foraDoNaoPerturbe(config) {
  if (!config?.nao_perturbe_inicio || !config?.nao_perturbe_fim) return true;
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const hora = h + ':' + m;
  return hora < config.nao_perturbe_inicio || hora >= config.nao_perturbe_fim;
}

// ── Áudio ──────────────────────────────────────────────────────────────
// Tenta tocar o arquivo customizado; se faltar/for bloqueado, gera um beep
// sintetizado (mais alto e com duas notas).
let audioEl = null;
let arquivoIndisponivel = false;
let audioDesbloqueado = false;

function getAudioEl() {
  if (audioEl || arquivoIndisponivel) return audioEl;
  try {
    audioEl = new Audio(SOM_URL);
    audioEl.preload = 'auto';
    audioEl.volume = 1.0;
    audioEl.addEventListener('error', () => { arquivoIndisponivel = true; });
  } catch {
    arquivoIndisponivel = true;
  }
  return audioEl;
}

function tocarBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const tocarNota = (freq, inicio, dur, vol) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + inicio);
      // Volume bem mais alto que antes (0.12 -> 0.9).
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
      gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + inicio + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + dur);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + dur);
    };
    tocarNota(880, 0, 0.18, 0.9);
    tocarNota(660, 0.16, 0.28, 0.9);
  } catch { /* silencioso */ }
}

function tocarSom() {
  const el = getAudioEl();
  if (el && !arquivoIndisponivel) {
    try {
      el.currentTime = 0;
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => tocarBeep()); // arquivo ausente, bloqueado ou autoplay negado
      }
      return;
    } catch { /* cai no beep */ }
  }
  tocarBeep();
}

// Navegadores exigem um gesto do usuário antes de liberar áudio. Na primeira
// interação, "destravamos" o elemento de áudio para os toques seguintes saírem.
function desbloquearAudioUmaVez() {
  if (audioDesbloqueado) return;
  audioDesbloqueado = true;
  const el = getAudioEl();
  if (el && !arquivoIndisponivel) {
    const v = el.volume;
    el.volume = 0;
    el.play().then(() => { el.pause(); el.currentTime = 0; el.volume = v; }).catch(() => { el.volume = v; });
  }
}

// ── Título da aba piscando ─────────────────────────────────────────────
const tituloOriginal = typeof document !== 'undefined' ? document.title : '';
let flashTimer = null;
let naoLidas = 0;

function piscarTitulo() {
  if (flashTimer) return;
  let visivel = false;
  flashTimer = setInterval(() => {
    document.title = visivel
      ? tituloOriginal
      : `(${naoLidas}) 💬 Nova mensagem`;
    visivel = !visivel;
  }, 1000);
}

function pararPiscarTitulo() {
  if (flashTimer) {
    clearInterval(flashTimer);
    flashTimer = null;
  }
  naoLidas = 0;
  document.title = tituloOriginal;
}

export function useNotificacoesDesktop({ conversaAtivaId }) {
  const { socket } = useSocket();
  const conversaAtivaRef = useRef(conversaAtivaId);
  conversaAtivaRef.current = conversaAtivaId;

  // Pede permissão e destrava áudio na primeira interação.
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    const destravar = () => desbloquearAudioUmaVez();
    window.addEventListener('click', destravar, { once: true });
    window.addEventListener('keydown', destravar, { once: true });
    return () => {
      window.removeEventListener('click', destravar);
      window.removeEventListener('keydown', destravar);
    };
  }, []);

  // Ao voltar o foco para a aba, para de piscar o título.
  useEffect(() => {
    const aoFocar = () => { if (!document.hidden) pararPiscarTitulo(); };
    window.addEventListener('focus', aoFocar);
    document.addEventListener('visibilitychange', aoFocar);
    return () => {
      window.removeEventListener('focus', aoFocar);
      document.removeEventListener('visibilitychange', aoFocar);
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handler = async (msg) => {
      // O backend só envia 'mensagem:recebida' após a Iris encaminhar para o
      // setor (ou um operador assumir), e apenas para os operadores responsáveis.
      const olhandoEstaConversa = msg.conversa_id === conversaAtivaRef.current && !document.hidden;
      if (olhandoEstaConversa) return; // já está vendo: não precisa avisar

      const config = await getConfigCached();
      if (!foraDoNaoPerturbe(config)) return; // dentro do "não perturbe"

      // Som: toca sempre que não estiver olhando esta conversa (aba oculta OU
      // aba aberta em outra conversa/tela).
      if (config?.som_ativado !== false) {
        tocarSom();
      }

      // Notificação desktop + título piscando: só quando a aba não está visível.
      if (!document.hidden) return;

      naoLidas += 1;
      piscarTitulo();

      const podeNotificar = 'Notification' in window && Notification.permission === 'granted';
      if (!podeNotificar || config?.push_ativo === false) return;

      const nome = msg.contato_nome || msg.contato_telefone || 'Novo atendimento';
      const corpo = msg.trecho || msg.conteudo || 'Nova mensagem recebida';

      try {
        const notif = new Notification(nome, {
          body: corpo,
          icon: ICONE,
          badge: ICONE,
          tag: msg.conversa_id,
          renotify: true,
          data: { conversaId: msg.conversa_id },
          silent: true, // o som é controlado por nós
        });

        notif.onclick = () => {
          window.focus();
          pararPiscarTitulo();
          window.dispatchEvent(new CustomEvent('notificacao:abrir-conversa', {
            detail: { conversaId: msg.conversa_id },
          }));
          notif.close();
        };

        setTimeout(() => notif.close(), 8000);
      } catch { /* alguns navegadores bloqueiam Notification fora de https */ }
    };

    socket.on('mensagem:recebida', handler);
    return () => socket.off('mensagem:recebida', handler);
  }, [socket]);
}
