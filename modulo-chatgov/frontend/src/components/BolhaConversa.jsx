import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Reply, Smile, RotateCcw, AlertTriangle, Smartphone, UserRound, Phone, BookUser, MessageSquare, Loader2, Check } from 'lucide-react';
import { Tick } from './Tick';
import { T } from '../theme';
import { formatarHora } from '../utils/arquivo';
import { MediaPreview, MediaLightbox } from './MediaPreview';

const REACOES_RAPIDAS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function contatosDaMensagem(conteudo) {
  try {
    const contatos = JSON.parse(conteudo || '[]');
    return Array.isArray(contatos) ? contatos : [];
  } catch {
    return [];
  }
}

function CartaoContato({ contato, entrada, onSalvarContato, onIniciarConversa }) {
  const [salvando, setSalvando] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState('');
  const telefone = contato.telefone || '';
  const href = telefone ? `tel:${telefone.replace(/[^+\d]/g, '')}` : null;

  const salvar = async (e) => {
    e.stopPropagation();
    if (!telefone || salvando || salvo) return;
    setErro('');
    setSalvando(true);
    try {
      await onSalvarContato?.(contato);
      setSalvo(true);
    } catch (error) {
      setErro(error.message || 'Não foi possível salvar o contato.');
    } finally {
      setSalvando(false);
    }
  };

  const iniciar = async (e) => {
    e.stopPropagation();
    if (!telefone || iniciando) return;
    setErro('');
    setIniciando(true);
    try {
      await onIniciarConversa?.(contato);
    } catch (error) {
      setErro(error.message || 'Não foi possível iniciar a conversa.');
      setIniciando(false);
    }
  };

  const botao = {
    border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 9px',
    background: entrada ? T.surface : (T.bubbleMediaBg || 'rgba(255,255,255,0.65)'),
    color: T.textSecondary, cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  };

  return React.createElement('div', {
    style: {
      padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`,
      background: entrada ? T.surfaceAlt : (T.bubbleMediaBg || 'rgba(255,255,255,0.55)'),
    },
  },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
      React.createElement('span', {
        style: {
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          display: 'grid', placeItems: 'center', background: `${T.primary}18`, color: T.primary,
        },
      }, React.createElement(UserRound, { size: 19 })),
      React.createElement('div', { style: { minWidth: 0, flex: 1 } },
        React.createElement('div', {
          style: { fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        }, contato.nome || 'Contato'),
        telefone && React.createElement('div', { style: { marginTop: 2, fontSize: 12, color: T.textMuted } }, telefone),
      ),
      href && React.createElement('a', {
        href, onClick: (e) => e.stopPropagation(), 'aria-label': `Ligar para ${contato.nome || telefone}`,
        title: 'Ligar', style: { color: T.primary, display: 'flex', padding: 5, borderRadius: '50%' },
      }, React.createElement(Phone, { size: 16 })),
    ),
    telefone && React.createElement('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
      React.createElement('button', {
        type: 'button', onClick: salvar, disabled: salvando || salvo,
        style: { ...botao, flex: 1, opacity: salvando ? 0.65 : 1, color: salvo ? T.success : T.textSecondary },
      },
        salvando ? React.createElement(Loader2, { size: 13, className: 'spin' }) : React.createElement(salvo ? Check : BookUser, { size: 13 }),
        salvo ? 'Na agenda' : 'Salvar na agenda'),
      React.createElement('button', {
        type: 'button', onClick: iniciar, disabled: iniciando,
        style: { ...botao, flex: 1, background: T.primary, borderColor: T.primary, color: '#fff', opacity: iniciando ? 0.7 : 1 },
      },
        iniciando ? React.createElement(Loader2, { size: 13, className: 'spin' }) : React.createElement(MessageSquare, { size: 13 }),
        iniciando ? 'Abrindo...' : 'Iniciar conversa'),
    ),
    !telefone && React.createElement('div', {
      role: 'status',
      style: { marginTop: 7, fontSize: 11, lineHeight: 1.35, color: T.warning },
    }, 'Telefone indisponível neste cartão. Reenvie o contato para habilitar as ações.'),
    erro && React.createElement('div', { role: 'alert', style: { marginTop: 6, fontSize: 11, color: T.danger } }, erro),
  );
}

function ContatoCompartilhado({ conteudo, entrada, onSalvarContato, onIniciarConversa }) {
  const contatos = contatosDaMensagem(conteudo);
  if (contatos.length === 0) {
    return React.createElement('div', { style: { fontSize: 13, color: T.textMuted } }, 'Contato compartilhado');
  }

  return React.createElement('div', {
    style: { display: 'flex', flexDirection: 'column', gap: 7, minWidth: 220, maxWidth: 300 },
  }, contatos.map((contato, indice) => React.createElement(CartaoContato, {
    key: `${contato.nome || 'contato'}-${contato.telefone || ''}-${indice}`,
    contato, entrada, onSalvarContato, onIniciarConversa,
  })));
}

// Marca as ocorrências do termo buscado sem alterar o texto original. Compara
// sem acento e sem caixa, mas recorta o trecho pelo índice para preservar a
// grafia da mensagem.
function realcarTermo(texto, termo) {
  const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const alvo = semAcento(termo);
  if (!alvo) return texto;
  const base = semAcento(texto);
  const partes = [];
  let cursor = 0;
  let achado = base.indexOf(alvo);
  while (achado !== -1) {
    if (achado > cursor) partes.push(texto.slice(cursor, achado));
    partes.push(React.createElement('mark', {
      key: `${achado}-${partes.length}`,
      style: { background: '#FDE68A', color: '#111827', borderRadius: 2, padding: '0 1px' },
    }, texto.slice(achado, achado + alvo.length)));
    cursor = achado + alvo.length;
    achado = base.indexOf(alvo, cursor);
  }
  if (cursor < texto.length) partes.push(texto.slice(cursor));
  return partes;
}

export function BolhaConversa({ msg, podeExcluir, onExcluir, onResponder, onReagir, onRetry, respondida, nomeContato, compacto, realce, onSalvarContato, onIniciarConversa, destacado }) {
  const entrada = msg.direcao === 'entrada';
  const [hover, setHover] = useState(false);
  const [showReacoes, setShowReacoes] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  // No celular (touch) não há hover, então não precisamos reservar 60px laterais
  // para os botões de ação — isso só roubava largura útil da bolha.
  const reserva = compacto ? 8 : 60;

  const acaoIconStyle = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: T.textMuted, borderRadius: '50%' };

  const abrirLightbox = (src, t, mime, nome) => setLightbox({ src, tipo: t, mime, nome });
  const fecharLightbox = () => setLightbox(null);
  const bolhaRef = useRef(null);

  useEffect(() => {
    if (destacado && bolhaRef.current) {
      const el = bolhaRef.current;
      el.style.animation = 'none';
      el.offsetHeight;
      el.style.animation = 'chatgov-destaque 0.6s ease-out';
      el.style.background = `${T.primary}15`;
      el.style.boxShadow = `inset 0 0 0 2px ${T.primary}`;
      const timer = setTimeout(() => {
        el.style.background = '';
        el.style.boxShadow = '';
        el.style.animation = '';
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [destacado]);

  // Mensagem excluída: bolha neutra com aviso, sem conteúdo.
  if (msg.excluida) {
    return React.createElement(React.Fragment, null,
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: entrada ? 'flex-start' : 'flex-end',
          marginBottom: 4,
          paddingLeft: entrada ? 0 : reserva,
          paddingRight: entrada ? reserva : 0,
        },
      },
        React.createElement('div', {
          className: 'cg-bolha',
          style: {
            background: T.surfaceMuted, color: T.textMuted,
            padding: '6px 10px', borderRadius: 8, fontSize: 13, fontStyle: 'italic',
            border: `1px dashed ${T.border}`,
          },
        }, '🚫 Mensagem excluída'),
      ),
    );
  }

  const hasMedia = !!(msg.media_url || msg.mediaUrl);

  return React.createElement(React.Fragment, null,
    React.createElement('div', {
      id: `chatgov-msg-${msg.id}`,
      ref: bolhaRef,
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: {
        display: 'flex',
        justifyContent: entrada ? 'flex-start' : 'flex-end',
        alignItems: 'center',
        gap: 6,
        marginBottom: msg.reacao ? 12 : 4,
        paddingLeft: entrada ? 0 : reserva,
        paddingRight: entrada ? reserva : 0,
        borderRadius: 8,
      },
    },
      // Ações no hover: reagir, responder e excluir (excluir só p/ mensagens do operador/gestor).
      (hover || showReacoes) && React.createElement('div', {
        style: { order: entrada ? 1 : -1, position: 'relative', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
      },
        onReagir && React.createElement('button', {
          onClick: () => setShowReacoes((v) => !v), 'aria-label': 'Reagir', title: 'Reagir',
          style: acaoIconStyle,
        }, React.createElement(Smile, { size: 15 })),
        onResponder && React.createElement('button', {
          onClick: onResponder, 'aria-label': 'Responder', title: 'Responder',
          style: acaoIconStyle,
        }, React.createElement(Reply, { size: 15 })),
        !entrada && podeExcluir && React.createElement('button', {
          onClick: onExcluir, 'aria-label': 'Excluir mensagem', title: 'Excluir mensagem',
          style: acaoIconStyle,
        }, React.createElement(Trash2, { size: 15 })),
        showReacoes && onReagir && React.createElement('div', {
          style: {
            position: 'absolute', bottom: '100%', [entrada ? 'left' : 'right']: 0, marginBottom: 4,
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20,
            boxShadow: T.shadowMd, padding: '4px 6px', display: 'flex', gap: 2, zIndex: 30,
          },
        }, REACOES_RAPIDAS.map((em) => React.createElement('button', {
          key: em, onClick: () => { onReagir(em); setShowReacoes(false); },
          style: { fontSize: 18, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 3px', lineHeight: 1 },
        }, em))),
      ),
      React.createElement('div', {
        className: 'cg-bolha',
        style: {
          background: entrada ? T.surface : T.bubbleOut,
          color: T.text,
          padding: '6px 8px 4px 8px',
          borderRadius: entrada ? '0px 8px 8px 8px' : '8px 0px 8px 8px',
          position: 'relative',
          boxShadow: '0 1px 1px rgba(17,27,33,0.06)',
        },
      },
        msg.operador_nome && !entrada && React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 },
        },
          React.createElement('span', {
            style: { fontSize: 12, fontWeight: 600, color: T.bubbleOutAuthor || T.primary },
          }, msg.operador_nome),
          (msg.operador_departamentos || []).slice(0, 2).map((d) =>
            React.createElement('span', {
              key: d.nome,
              style: { fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: T.bubbleOutTagBg || `${d.cor}22`, color: d.cor, filter: T.bubbleOutTagBg !== 'transparent' ? 'brightness(1.6) saturate(1.15)' : undefined },
            }, d.nome)),
        ),
        // Enviada fora do painel (celular/WhatsApp Web): o WhatsApp não informa quem
        // digitou, então marcamos a origem em vez de atribuir a um atendente.
        !entrada && !msg.operador_nome && msg.origem === 'whatsapp' && React.createElement('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2,
            fontSize: 11, fontWeight: 600, fontStyle: 'italic', color: T.textMuted,
          },
          title: 'Mensagem enviada pelo aplicativo do WhatsApp, fora do painel — o autor não é identificado',
        },
          React.createElement(Smartphone, { size: 11 }),
          React.createElement('span', null, 'Enviada pelo WhatsApp'),
        ),
        // Preview da mensagem citada (responder).
        (respondida || msg.respondendo_a) && React.createElement('div', {
          style: {
            borderLeft: entrada ? `3px solid ${T.primary}` : `3px solid ${T.bubbleOutReplyBorder || T.primary}`,
            background: entrada ? 'rgba(0,0,0,0.05)' : (T.bubbleOutReplyBg || 'rgba(0,0,0,0.05)'),
            borderRadius: 4, padding: '3px 8px', marginBottom: 4, maxWidth: 260,
          },
        },
          React.createElement('div', { style: { fontSize: 11, fontWeight: 600, color: T.primary } },
            respondida ? (respondida.direcao === 'saida' ? (respondida.operador_nome || 'Operador') : (nomeContato || 'Cidadão')) : 'Mensagem'),
          React.createElement('div', { style: { fontSize: 12.5, color: entrada ? T.textMuted : (T.bubbleOutReplyText || T.textMuted), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            respondida ? (respondida.conteudo || `[${respondida.tipo || 'mídia'}]`) : '↩'),
        ),
        hasMedia && React.createElement('div', { style: { marginBottom: msg.conteudo ? 4 : 0 } },
          React.createElement(MediaPreview, { msg, isMe: !entrada, onOpenLightbox: abrirLightbox }),
        ),
        msg.tipo === 'contato' && React.createElement(ContatoCompartilhado, {
          conteudo: msg.conteudo, entrada, onSalvarContato, onIniciarConversa,
        }),
        msg.conteudo && msg.tipo !== 'contato' && React.createElement('div', {
          style: { fontSize: 14.2, lineHeight: '19px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
        }, realce ? realcarTermo(msg.conteudo, realce) : msg.conteudo),
        React.createElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 3,
            marginTop: 2,
            marginLeft: 20,
          },
        },
          React.createElement('span', {
            style: { fontSize: 10.5, color: entrada ? T.textMuted : (T.bubbleOutMeta || T.textMuted), lineHeight: '15px' },
          }, formatarHora(msg.criado_em)),
          !entrada && React.createElement(Tick, { status: msg.status }),
        ),
        msg.status === 'falhou' && React.createElement('div', {
          role: 'alert',
          style: { marginTop: 5, display: 'flex', alignItems: 'center', gap: 5, color: T.danger, fontSize: 11, borderTop: `1px solid ${T.danger}40`, paddingTop: 4 },
        },
          React.createElement(AlertTriangle, { size: 13 }),
          React.createElement('span', null, msg.falha_detalhe || 'Falha no envio'),
          onRetry && msg.tipo === 'texto' && React.createElement('button', {
            onClick: onRetry,
            title: 'Tentar novamente',
            style: { marginLeft: 'auto', border: 0, background: 'transparent', color: T.danger, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 700 },
          }, React.createElement(RotateCcw, { size: 12 }), 'Tentar novamente'),
        ),
        // Reação (emoji) sobreposta no canto inferior da bolha.
        msg.reacao && React.createElement('span', {
          style: {
            position: 'absolute', bottom: -10, [entrada ? 'left' : 'right']: 8,
            background: T.surface, borderRadius: 12, padding: '1px 5px', fontSize: 13,
            boxShadow: '0 1px 3px rgba(0,0,0,0.18)', border: `1px solid ${T.border}`,
          },
        }, msg.reacao),
      ),
    ),
    lightbox && React.createElement(MediaLightbox, { src: lightbox.src, tipo: lightbox.tipo, mime: lightbox.mime, nome: lightbox.nome, onClose: fecharLightbox }),
  );
}
