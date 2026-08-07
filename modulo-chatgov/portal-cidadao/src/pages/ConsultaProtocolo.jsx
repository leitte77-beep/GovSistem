import React, { useState, useEffect, useRef } from 'react';
import { T } from '../theme.js';
import { api, getToken } from '../api.js';

// Como cada situação é apresentada ao cidadão: rótulo em linguagem comum,
// cor e a posição dentro do andamento (para a barra de progresso).
const STATUS = {
  ABERTO: { label: 'Solicitação recebida', cor: T.primary, fundo: T.primarySoft, etapa: 1 },
  EM_ANDAMENTO: { label: 'Em análise', cor: T.primary, fundo: T.primarySoft, etapa: 2 },
  PENDENTE: { label: 'Aguardando sua resposta', cor: T.warning, fundo: T.warningSoft, etapa: 2 },
  CONCLUIDO: { label: 'Concluída', cor: T.success, fundo: T.successSoft, etapa: 3 },
  CANCELADO: { label: 'Cancelada', cor: T.danger, fundo: T.dangerSoft, etapa: 3 },
};

const ETAPAS = ['Recebida', 'Em análise', 'Concluída'];

const MAX_MB = 20;
const EXTENSOES = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.odt,.ods';

function formatarData(iso, comHora = true) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

function formatarTamanho(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function diasRestantes(prazo) {
  if (!prazo) return null;
  const d = new Date(prazo);
  if (isNaN(d)) return null;
  return Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
}

const protocoloDaUrl = () => window.location.hash.split('/')[1];

export function ConsultaProtocolo({ navigate }) {
  const [proto, setProto] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [docs, setDocs] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [novaMsg, setNovaMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aba, setAba] = useState('andamento');
  const [enviandoDoc, setEnviandoDoc] = useState(false);
  const [erroDoc, setErroDoc] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const [baixando, setBaixando] = useState('');
  const fimRef = useRef(null);
  const inputArquivo = useRef(null);

  const carregar = React.useCallback(() => {
    const id = protocoloDaUrl();
    if (!id || !getToken()) { setErro('Sessão expirada. Consulte novamente.'); setLoading(false); return; }
    Promise.all([
      api.detalhesProtocolo(id).catch(() => null),
      api.mensagensProtocolo(id).catch(() => []),
      api.documentosProtocolo(id).catch(() => []),
      api.timelineProtocolo(id).catch(() => []),
    ]).then(([p, m, d, t]) => {
      if (!p) { setErro('Sessão expirada. Consulte novamente.'); return; }
      setProto(p);
      setMsgs(Array.isArray(m) ? m : []);
      setDocs(Array.isArray(d) ? d : []);
      setTimeline(Array.isArray(t) ? t : []);
    }).catch(e => setErro(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const enviarMsg = async () => {
    if (!novaMsg.trim() || enviando) return;
    setEnviando(true);
    setErro('');
    try {
      const m = await api.enviarMensagem(protocoloDaUrl(), novaMsg.trim());
      setMsgs(prev => [...prev, m]);
      setNovaMsg('');
      setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    } catch (e) { setErro(e.message); } finally { setEnviando(false); }
  };

  const baixar = async (doc) => {
    setErroDoc('');
    setBaixando(doc.id);
    try {
      await api.baixarDocumento(protocoloDaUrl(), doc.id, doc.nome_amigavel);
    } catch (e) { setErroDoc(e.message); } finally { setBaixando(''); }
  };

  const enviarArquivos = async (lista) => {
    const arquivos = Array.from(lista || []);
    if (arquivos.length === 0) return;
    setErroDoc('');
    setAviso('');
    setEnviandoDoc(true);

    const falhas = [];
    for (const arquivo of arquivos) {
      if (arquivo.size > MAX_MB * 1024 * 1024) {
        falhas.push(`${arquivo.name} (maior que ${MAX_MB} MB)`);
        continue;
      }
      try {
        await api.enviarDocumento(protocoloDaUrl(), arquivo);
      } catch (e) {
        falhas.push(`${arquivo.name} — ${e.message}`);
      }
    }

    setEnviandoDoc(false);
    if (inputArquivo.current) inputArquivo.current.value = '';
    if (falhas.length > 0) setErroDoc(falhas.join(' · '));
    if (falhas.length < arquivos.length) {
      setAviso('Documento enviado. O setor responsável fará a análise.');
      carregar();
    }
  };

  // ── blocos visuais ────────────────────────────────────────────
  const cartao = (filhos, extra = {}) => React.createElement('div', {
    style: {
      background: T.surface, borderRadius: T.radiusLg, border: `1px solid ${T.border}`,
      boxShadow: T.shadowMd, ...extra,
    },
  }, filhos);

  const situacao = STATUS[proto?.status] || { label: proto?.status || '—', cor: T.textMuted, fundo: T.surfaceMuted, etapa: 1 };
  const dias = diasRestantes(proto?.prazo_em);
  const concluido = proto?.status === 'CONCLUIDO' || proto?.status === 'CANCELADO';

  const barraProgresso = React.createElement('div', {
    style: { display: 'flex', alignItems: 'center', gap: 0, margin: '20px 0 4px' },
  },
    ETAPAS.map((nome, i) => {
      const alcancada = situacao.etapa >= i + 1;
      const cor = proto?.status === 'CANCELADO' && i === 2 ? T.danger : (alcancada ? situacao.cor : T.borderStrong);
      return React.createElement(React.Fragment, { key: nome },
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 76 } },
          React.createElement('div', {
            style: {
              width: 26, height: 26, borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
              background: alcancada ? cor : T.surface, color: alcancada ? '#fff' : T.textMuted,
              border: `2px solid ${cor}`, transition: 'all .2s',
            },
          }, alcancada ? '✓' : i + 1),
          React.createElement('span', {
            style: { fontSize: 11, fontWeight: alcancada ? 700 : 500, color: alcancada ? T.text : T.textMuted, textAlign: 'center' },
          }, nome),
        ),
        i < ETAPAS.length - 1 && React.createElement('div', {
          style: { flex: 1, height: 3, borderRadius: 2, background: situacao.etapa > i + 1 ? situacao.cor : T.border, marginBottom: 18 },
        }),
      );
    }),
  );

  const abas = [
    { id: 'andamento', nome: 'Andamento' },
    { id: 'mensagens', nome: `Mensagens${msgs.length ? ` (${msgs.length})` : ''}` },
    { id: 'documentos', nome: `Documentos${docs.length ? ` (${docs.length})` : ''}` },
  ];

  const banner = (texto, cor, fundo) => React.createElement('div', {
    style: {
      padding: '10px 14px', borderRadius: T.radiusSm, background: fundo,
      color: cor, fontSize: 13, border: `1px solid ${cor}33`, lineHeight: 1.45,
    },
  }, texto);

  return React.createElement('div', {
    style: {
      maxWidth: 780, margin: '0 auto', padding: '16px 16px 48px',
      display: 'flex', flexDirection: 'column', gap: 14,
    },
  },
    React.createElement('div', null,
      React.createElement('button', {
        onClick: () => navigate(''),
        style: {
          background: 'none', border: 'none', color: T.primary, fontSize: 14,
          cursor: 'pointer', fontWeight: 600, padding: '10px 4px', fontFamily: T.font,
        },
      }, '← Consultar outro protocolo'),
    ),

    loading
      ? cartao(React.createElement('div', { style: { padding: 48, textAlign: 'center', color: T.textMuted, fontSize: 14 } }, 'Carregando…'))
      : erro
        ? cartao(React.createElement('div', { style: { padding: 40, textAlign: 'center' } },
            React.createElement('div', { style: { fontSize: 32, marginBottom: 10 } }, '🔒'),
            React.createElement('div', { style: { color: T.text, fontSize: 15, fontWeight: 600, marginBottom: 6 } }, erro),
            React.createElement('div', { style: { color: T.textMuted, fontSize: 13, marginBottom: 18 } },
              'Informe novamente o número do protocolo e o código de acesso.'),
            React.createElement('button', {
              onClick: () => navigate(''),
              style: {
                padding: '11px 22px', borderRadius: T.radiusSm, border: 'none',
                background: T.primary, color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: T.font,
              },
            }, 'Consultar protocolo'),
          ))
        : proto && React.createElement(React.Fragment, null,

          // ── Cabeçalho ────────────────────────────────────────
          cartao(React.createElement('div', { style: { padding: '22px 24px 18px' } },
            React.createElement('div', {
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
            },
              React.createElement('div', { style: { minWidth: 0 } },
                React.createElement('div', {
                  style: { fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 4 },
                }, 'Protocolo'),
                React.createElement('div', {
                  style: { fontFamily: 'ui-monospace, monospace', fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: '.5px' },
                }, proto.numero),
              ),
              React.createElement('span', {
                style: {
                  padding: '6px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700,
                  color: situacao.cor, background: situacao.fundo, whiteSpace: 'nowrap',
                },
              }, situacao.label),
            ),

            React.createElement('h1', {
              style: { fontSize: 19, fontWeight: 700, color: T.text, margin: '14px 0 6px', lineHeight: 1.3 },
            }, proto.assunto || 'Solicitação'),

            proto.descricao && React.createElement('p', {
              style: { fontSize: 14, color: T.textSecondary, lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap' },
            }, proto.descricao),

            barraProgresso,

            React.createElement('div', {
              style: {
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 14, borderTop: `1px solid ${T.border}`, marginTop: 16, paddingTop: 16,
              },
            },
              [
                ['Serviço', proto.servico_nome],
                ['Setor responsável', proto.setor_atual_nome],
                ['Aberto em', formatarData(proto.aberto_em)],
                ['Prazo', proto.prazo_em ? formatarData(proto.prazo_em, false) : 'Sem prazo definido'],
              ].map(([rotulo, valor]) => React.createElement('div', { key: rotulo },
                React.createElement('div', {
                  style: { fontSize: 10.5, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 },
                }, rotulo),
                React.createElement('div', { style: { fontSize: 13.5, color: T.text, fontWeight: 600 } }, valor || '—'),
              )),
            ),

            !concluido && dias !== null && dias <= 3 && React.createElement('div', { style: { marginTop: 14 } },
              banner(
                dias < 0 ? 'O prazo previsto para esta solicitação já passou. Ela continua em análise.'
                  : dias === 0 ? 'O prazo previsto para esta solicitação termina hoje.'
                  : `Faltam ${dias} dia(s) para o prazo previsto.`,
                dias < 0 ? T.danger : T.warning,
                dias < 0 ? T.dangerSoft : T.warningSoft,
              ),
            ),
          )),

          // ── Pendências ───────────────────────────────────────
          proto.pendencias && proto.pendencias.length > 0 && cartao(
            React.createElement('div', { style: { padding: '18px 24px' } },
              React.createElement('div', {
                style: { fontSize: 14, fontWeight: 700, color: T.warning, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 },
              }, '⚠️ Pendências — precisamos de você'),
              React.createElement('div', { style: { fontSize: 12.5, color: T.textSecondary, marginBottom: 12 } },
                'Envie o que foi solicitado pela aba Documentos para dar andamento.'),
              proto.pendencias.map((p, i) => React.createElement('div', {
                key: i,
                style: {
                  padding: '12px 14px', borderRadius: T.radiusSm, background: T.warningSoft,
                  marginBottom: 8, border: `1px solid ${T.warning}33`,
                },
              },
                React.createElement('div', { style: { fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 3 } }, p.titulo),
                p.descricao && React.createElement('div', { style: { fontSize: 13, color: T.textSecondary, lineHeight: 1.45 } }, p.descricao),
                p.prazo_em && React.createElement('div', { style: { fontSize: 11.5, color: T.warning, fontWeight: 600, marginTop: 6 } },
                  `Responder até ${formatarData(p.prazo_em, false)}`),
              )),
            ),
            { borderColor: `${T.warning}55` },
          ),

          aviso && banner(aviso, T.success, T.successSoft),

          // ── Abas ─────────────────────────────────────────────
          cartao(React.createElement(React.Fragment, null,
            React.createElement('div', {
              style: { display: 'flex', borderBottom: `1px solid ${T.border}`, padding: '0 8px' },
            },
              abas.map(a => React.createElement('button', {
                key: a.id,
                onClick: () => setAba(a.id),
                style: {
                  flex: 1, padding: '15px 8px', border: 'none', background: 'transparent',
                  color: aba === a.id ? T.primary : T.textSecondary,
                  fontSize: 13.5, fontWeight: aba === a.id ? 700 : 600,
                  borderBottom: aba === a.id ? `2.5px solid ${T.primary}` : '2.5px solid transparent',
                  cursor: 'pointer', fontFamily: T.font, marginBottom: -1, transition: 'color .15s',
                },
              }, a.nome)),
            ),

            React.createElement('div', { style: { padding: '20px 24px 24px' } },

              // ── Andamento ────────────────────────────────────
              aba === 'andamento' && (timeline.length === 0
                ? React.createElement('div', { style: { textAlign: 'center', padding: '28px 0', color: T.textMuted, fontSize: 13.5 } },
                    'O andamento aparecerá aqui conforme a solicitação for analisada.')
                : React.createElement('div', { style: { display: 'flex', flexDirection: 'column' } },
                    timeline.map((e, i) => React.createElement('div', {
                      key: i,
                      style: { display: 'flex', gap: 14, position: 'relative', paddingBottom: i === timeline.length - 1 ? 0 : 20 },
                    },
                      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 } },
                        React.createElement('div', {
                          style: {
                            width: 11, height: 11, borderRadius: '50%', marginTop: 4,
                            background: i === timeline.length - 1 ? T.primary : T.borderStrong,
                            boxShadow: i === timeline.length - 1 ? `0 0 0 4px ${T.primarySoft}` : 'none',
                          },
                        }),
                        i < timeline.length - 1 && React.createElement('div', {
                          style: { width: 2, flex: 1, background: T.border, marginTop: 4 },
                        }),
                      ),
                      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                        React.createElement('div', { style: { fontSize: 13.5, fontWeight: 700, color: T.text } }, e.titulo),
                        e.descricao && React.createElement('div', {
                          style: { fontSize: 13, color: T.textSecondary, marginTop: 2, lineHeight: 1.45 },
                        }, e.descricao),
                        React.createElement('div', { style: { fontSize: 11.5, color: T.textMuted, marginTop: 3 } }, formatarData(e.data)),
                      ),
                    )),
                  )),

              // ── Mensagens ────────────────────────────────────
              aba === 'mensagens' && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
                msgs.length === 0
                  ? React.createElement('div', { style: { textAlign: 'center', padding: '24px 0', color: T.textMuted, fontSize: 13.5 } },
                      'Nenhuma mensagem ainda. Use o campo abaixo para falar com o setor responsável.')
                  : React.createElement('div', {
                      style: { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto', paddingRight: 4 },
                    },
                      msgs.map(m => {
                        const daPrefeitura = m.direcao === 'saida';
                        return React.createElement('div', {
                          key: m.id,
                          style: { display: 'flex', flexDirection: 'column', alignItems: daPrefeitura ? 'flex-start' : 'flex-end' },
                        },
                          React.createElement('div', {
                            style: {
                              padding: '11px 14px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, maxWidth: '82%',
                              background: daPrefeitura ? T.surfaceAlt : T.primarySoft,
                              color: T.text, whiteSpace: 'pre-wrap',
                              borderBottomLeftRadius: daPrefeitura ? 4 : 14,
                              borderBottomRightRadius: daPrefeitura ? 14 : 4,
                            },
                          }, m.conteudo),
                          React.createElement('div', { style: { fontSize: 10.5, color: T.textMuted, margin: '4px 6px 0' } },
                            `${daPrefeitura ? 'Prefeitura' : 'Você'} · ${formatarData(m.criado_em)}`),
                        );
                      }),
                      React.createElement('div', { ref: fimRef }),
                    ),

                React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-end' } },
                  React.createElement('textarea', {
                    value: novaMsg,
                    onChange: (e) => setNovaMsg(e.target.value),
                    onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMsg(); } },
                    placeholder: 'Escreva sua mensagem para o setor responsável…',
                    rows: 2,
                    style: {
                      flex: 1, boxSizing: 'border-box', padding: '11px 14px', fontSize: 13.5,
                      borderRadius: T.radiusSm, border: `1.5px solid ${T.borderStrong}`,
                      background: T.surfaceAlt, color: T.text, outline: 'none',
                      fontFamily: T.font, resize: 'vertical', lineHeight: 1.45,
                    },
                  }),
                  React.createElement('button', {
                    onClick: enviarMsg,
                    disabled: enviando || !novaMsg.trim(),
                    style: {
                      padding: '12px 20px', borderRadius: T.radiusSm, border: 'none',
                      background: (enviando || !novaMsg.trim()) ? T.borderStrong : T.primary,
                      color: '#fff', fontSize: 13.5, fontWeight: 600,
                      cursor: (enviando || !novaMsg.trim()) ? 'default' : 'pointer',
                      fontFamily: T.font, whiteSpace: 'nowrap',
                    },
                  }, enviando ? 'Enviando…' : 'Enviar'),
                ),
              ),

              // ── Documentos ───────────────────────────────────
              aba === 'documentos' && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
                erroDoc && banner(erroDoc, T.danger, T.dangerSoft),

                // Envio pelo cidadão
                React.createElement('div', {
                  onClick: () => !enviandoDoc && inputArquivo.current?.click(),
                  onDragOver: (e) => { e.preventDefault(); setArrastando(true); },
                  onDragLeave: () => setArrastando(false),
                  onDrop: (e) => { e.preventDefault(); setArrastando(false); enviarArquivos(e.dataTransfer.files); },
                  style: {
                    border: `2px dashed ${arrastando ? T.primary : T.borderStrong}`,
                    borderRadius: T.radius, padding: '26px 16px', textAlign: 'center',
                    cursor: enviandoDoc ? 'default' : 'pointer',
                    background: arrastando ? T.primarySoft : T.surfaceAlt, transition: 'all .15s',
                  },
                },
                  React.createElement('input', {
                    ref: inputArquivo, type: 'file', multiple: true, accept: EXTENSOES,
                    style: { display: 'none' },
                    onChange: (e) => enviarArquivos(e.target.files),
                  }),
                  React.createElement('div', { style: { fontSize: 26, marginBottom: 6 } }, enviandoDoc ? '⏳' : '📎'),
                  React.createElement('div', { style: { fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 } },
                    enviandoDoc ? 'Enviando documento…' : 'Enviar um documento'),
                  React.createElement('div', { style: { fontSize: 12.5, color: T.textMuted, lineHeight: 1.45 } },
                    `Arraste o arquivo aqui ou clique para escolher · PDF, imagens e documentos até ${MAX_MB} MB`),
                ),

                docs.length === 0
                  ? React.createElement('div', { style: { textAlign: 'center', padding: '20px 0', color: T.textMuted, fontSize: 13.5 } },
                      'Nenhum documento disponível ainda. Os arquivos liberados pela prefeitura aparecerão aqui.')
                  : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                      docs.map(d => React.createElement('div', {
                        key: d.id,
                        style: {
                          display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
                          borderRadius: T.radiusSm, background: T.surface,
                          border: `1px solid ${T.border}`, flexWrap: 'wrap',
                        },
                      },
                        React.createElement('div', { style: { fontSize: 20, flexShrink: 0 } },
                          (d.mime_type || '').includes('pdf') ? '📄' : (d.mime_type || '').startsWith('image/') ? '🖼️' : '📁'),
                        React.createElement('div', { style: { flex: 1, minWidth: 140 } },
                          React.createElement('div', {
                            style: { fontSize: 13.5, fontWeight: 600, color: T.text, wordBreak: 'break-word' },
                          }, d.nome_amigavel),
                          React.createElement('div', { style: { fontSize: 11.5, color: T.textMuted, marginTop: 2 } },
                            [formatarTamanho(d.tamanho_bytes), formatarData(d.criado_em, false)].filter(Boolean).join(' · ')),
                        ),
                        React.createElement('button', {
                          onClick: () => baixar(d),
                          disabled: baixando === d.id,
                          style: {
                            padding: '9px 16px', borderRadius: T.radiusSm,
                            border: `1.5px solid ${T.primary}`, background: 'transparent',
                            color: T.primary, fontSize: 13, fontWeight: 600,
                            cursor: baixando === d.id ? 'default' : 'pointer',
                            fontFamily: T.font, whiteSpace: 'nowrap', flexShrink: 0,
                          },
                        }, baixando === d.id ? 'Baixando…' : 'Baixar'),
                      )),
                    ),
              ),
            ),
          )),

          React.createElement('div', {
            style: { textAlign: 'center', fontSize: 11.5, color: T.textMuted, lineHeight: 1.6, padding: '4px 12px' },
          }, 'Guarde o número do protocolo e o código de acesso para consultar novamente. Não compartilhe seu código de acesso.'),
        ),
  );
}
