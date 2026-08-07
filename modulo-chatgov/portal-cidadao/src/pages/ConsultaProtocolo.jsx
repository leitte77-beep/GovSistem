import React, { useState, useEffect, useRef } from 'react';
import { T } from '../theme.js';
import { api, getToken } from '../api.js';

const STATUS_LABELS = {
  ABERTO: 'Solicitação recebida', EM_ANDAMENTO: 'Em análise',
  PENDENTE: 'Aguardando sua resposta', CONCLUIDO: 'Concluída', CANCELADO: 'Cancelada',
};

function formatarData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 14,
  borderRadius: T.radiusSm, border: `1.5px solid ${T.borderStrong}`,
  background: T.surfaceAlt, color: T.text, outline: 'none', fontFamily: T.font,
};

export function ConsultaProtocolo({ navigate }) {
  const [proto, setProto] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [novaMsg, setNovaMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aba, setAba] = useState('geral');
  const fimRef = useRef(null);

  useEffect(() => {
    const protoId = window.location.hash.split('/')[1];
    if (!protoId || !getToken()) { setErro('Acesso expirado'); setLoading(false); return; }
    Promise.all([
      api.detalhesProtocolo(protoId).catch(() => null),
      api.mensagensProtocolo(protoId).catch(() => []),
      api.documentosProtocolo(protoId).catch(() => []),
    ]).then(([p, m, d]) => {
      if (!p) { setErro('Sessão expirada. Consulte novamente.'); setLoading(false); return; }
      setProto(p); setMsgs(Array.isArray(m) ? m : []); setDocs(Array.isArray(d) ? d : []);
    }).catch(e => setErro(e.message)).finally(() => setLoading(false));
  }, []);

  const enviarMsg = async () => {
    if (!novaMsg.trim()) return;
    setEnviando(true);
    try {
      const id = window.location.hash.split('/')[1];
      const m = await api.enviarMensagem(id, novaMsg.trim());
      setMsgs(prev => [...prev, m]);
      setNovaMsg('');
      setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) { setErro(e.message); }
    finally { setEnviando(false); }
  };

  return React.createElement('div', {
    style: { maxWidth: T.maxWidth, margin: '0 auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 },
  },
    // Header
    React.createElement('div', { style: { textAlign: 'center' } },
      React.createElement('button', {
        onClick: () => navigate(''),
        style: { background: 'none', border: 'none', color: T.primary, fontSize: 14, cursor: 'pointer', fontWeight: 600, padding: '8px' },
      }, '← Voltar'),
    ),

    loading
      ? React.createElement('div', { style: { textAlign: 'center', padding: 40, color: T.textMuted } }, 'Carregando...')
      : erro
      ? React.createElement('div', {
          style: { textAlign: 'center', padding: 40, background: T.dangerSoft, borderRadius: T.radius, color: T.danger, fontSize: 14 },
        }, erro, React.createElement('br'), React.createElement('br'),
          React.createElement('button', {
            onClick: () => navigate(''),
            style: { padding: '10px 20px', borderRadius: T.radiusSm, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 12 },
          }, 'Nova consulta'),
        )
      : proto && React.createElement(React.Fragment, null,
          // Card do protocolo
          React.createElement('div', {
            style: { background: T.surface, borderRadius: T.radiusLg, padding: 24, boxShadow: T.shadowMd, border: `1px solid ${T.border}` },
          },
            React.createElement('div', { style: { fontSize: 12, fontWeight: 700, color: T.primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 } },
              'Protocolo ', React.createElement('span', { style: { fontFamily: 'monospace' } }, proto.numero)),
            React.createElement('h1', { style: { fontSize: 18, fontWeight: 700, color: T.text, margin: '0 0 4px' } }, proto.assunto || 'Sem assunto'),
            React.createElement('div', { style: { display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: T.primary, background: T.primarySoft, marginBottom: 12 } },
              STATUS_LABELS[proto.status] || proto.status || '—'),
            proto.descricao && React.createElement('p', { style: { fontSize: 13.5, color: T.textSecondary, lineHeight: 1.5, margin: '0 0 12px' } }, proto.descricao),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: T.textMuted, borderTop: `1px solid ${T.border}`, paddingTop: 12 } },
              React.createElement('span', null, 'Setor: ', React.createElement('strong', { style: { color: T.text } }, proto.setor_atual_nome || '—')),
              proto.prazo_em && React.createElement('span', null, 'Prazo: ', React.createElement('strong', { style: { color: T.text } }, formatarData(proto.prazo_em))),
              React.createElement('span', null, 'Aberto em: ', React.createElement('strong', { style: { color: T.text } }, formatarData(proto.aberto_em))),
            ),
          ),

          // Pendências
          proto.pendencias && proto.pendencias.length > 0 && React.createElement('div', {
            style: { background: T.warningSoft, borderRadius: T.radius, padding: 16, border: `1px solid ${T.warningSoft}` },
          },
            React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: T.warning, marginBottom: 8 } }, 'Pendências'),
            proto.pendencias.map(p => React.createElement('div', { key: p.titulo, style: { fontSize: 13, color: T.text, marginBottom: 4 } },
              React.createElement('strong', null, p.titulo), p.descricao ? ` — ${p.descricao}` : '',
            )),
          ),

          // Abas: Mensagens / Documentos
          React.createElement('div', { style: { display: 'flex', gap: 0, borderBottom: `1px solid ${T.border}` } },
            ['geral', 'documentos'].map(a => React.createElement('button', {
              key: a,
              onClick: () => setAba(a),
              style: {
                flex: 1, padding: '10px', border: 'none', background: 'transparent',
                color: aba === a ? T.primary : T.textMuted, fontSize: 13, fontWeight: aba === a ? 700 : 500,
                borderBottom: aba === a ? `2px solid ${T.primary}` : '2px solid transparent',
                cursor: 'pointer', fontFamily: T.font,
              },
            }, a === 'geral' ? 'Mensagens' : 'Documentos')),
          ),

          aba === 'geral' && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            msgs.length === 0
              ? React.createElement('div', { style: { textAlign: 'center', padding: 24, color: T.textMuted, fontSize: 13 } }, 'Nenhuma mensagem')
              : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto', padding: '0 0 12px' } },
                  msgs.map(m => React.createElement('div', {
                    key: m.id,
                    style: {
                      padding: '10px 14px', borderRadius: T.radiusSm, fontSize: 13, lineHeight: 1.4,
                      background: m.direcao === 'saida' ? T.primarySoft : T.surfaceAlt,
                      alignSelf: m.direcao === 'entrada' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                    },
                  },
                    React.createElement('div', { style: { color: T.text, whiteSpace: 'pre-wrap' } }, m.conteudo),
                    React.createElement('div', { style: { fontSize: 10, color: T.textMuted, marginTop: 4 } }, formatarData(m.criado_em)),
                  )),
                  React.createElement('div', { ref: fimRef }),
                ),
            React.createElement('div', { style: { display: 'flex', gap: 6 } },
              React.createElement('input', {
                value: novaMsg, onChange: (e) => setNovaMsg(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMsg(); } },
                placeholder: 'Escreva sua mensagem...',
                style: { ...inputStyle, flex: 1 },
              }),
              React.createElement('button', {
                onClick: enviarMsg, disabled: enviando || !novaMsg.trim(),
                style: { padding: '10px 16px', borderRadius: T.radiusSm, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 600, cursor: (enviando || !novaMsg.trim()) ? 'default' : 'pointer' },
              }, 'Enviar'),
            ),
          ),

          aba === 'documentos' && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
            docs.length === 0
              ? React.createElement('div', { style: { textAlign: 'center', padding: 24, color: T.textMuted, fontSize: 13 } }, 'Nenhum documento disponível')
              : docs.map(d => React.createElement('div', {
                  key: d.id,
                  style: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px', borderRadius: T.radiusSm, background: T.surfaceAlt, border: `1px solid ${T.border}` },
                },
                  React.createElement('div', { style: { flex: 1 } },
                    React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: T.text } }, d.nome_amigavel),
                    React.createElement('div', { style: { fontSize: 11, color: T.textMuted, marginTop: 2 } },
                      d.status, d.tamanho_bytes ? ` · ${(d.tamanho_bytes / 1024).toFixed(1)} KB` : '',
                    ),
                  ),
                  React.createElement('div', { style: { fontSize: 10.5, color: T.textMuted } }, formatarData(d.criado_em)),
                )),
          ),
        ),
  );
}
