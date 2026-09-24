import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Copy, Check, User, Phone, IdCard, MapPin, Calendar, Tag, Building2,
  UserCheck, FileText, MessageSquare, Ban, Loader2, Pencil,
} from 'lucide-react';
import { T } from '../theme';
import { fetchFichaCidadao, fetchHistoricoConversa, editarContato } from '../api';
import { CONVERSA_STATUS_UI, conversationStatus } from '../domain/status';

// Cor da bolinha na linha do tempo por tipo de evento.
const COR_EVENTO = {
  inicio: '#7C3AED',
  protocolo: '#0369A1',
  acao: '#1D4ED8',
  status: '#B45309',
  nota: '#6B7280',
  resolvida: '#047857',
  arquivada: '#4B5563',
};

function formatarData(iso, comHora = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  const data = d.toLocaleDateString('pt-BR');
  return comHora ? `${data} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : data;
}

// Linha rótulo/valor. Valor ausente aparece como "—" em vez de sumir: a lacuna
// no cadastro é informação para quem atende.
function Linha({ icone, rotulo, valor, acao }) {
  return React.createElement('div', {
    style: { display: 'flex', gap: 9, alignItems: 'flex-start', padding: '7px 0' },
  },
    React.createElement(icone, { size: 14, color: T.textMuted, style: { flexShrink: 0, marginTop: 2 } }),
    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
      React.createElement('div', { style: { fontSize: 10.5, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 } }, rotulo),
      React.createElement('div', { style: { fontSize: 13, color: valor ? T.text : T.textMuted, wordBreak: 'break-word' } }, valor || '—'),
    ),
    acao,
  );
}

function BotaoCopiar({ texto, rotulo }) {
  const [copiado, setCopiado] = useState(false);
  if (!texto) return null;
  return React.createElement('button', {
    type: 'button',
    title: `Copiar ${rotulo}`,
    'aria-label': `Copiar ${rotulo}`,
    onClick: () => {
      navigator.clipboard?.writeText(String(texto)).then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1600);
      }).catch(() => {});
    },
    style: {
      background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
      display: 'flex', color: copiado ? T.success : T.textMuted, borderRadius: 4, flexShrink: 0,
    },
  }, React.createElement(copiado ? Check : Copy, { size: 14 }));
}

function Secao({ titulo, children, contador }) {
  return React.createElement('div', { style: { padding: '12px 16px', borderTop: `1px solid ${T.border}` } },
    React.createElement('div', {
      style: { fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: T.textSecondary, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 },
    },
      titulo,
      contador !== undefined && React.createElement('span', {
        style: { background: T.surfaceMuted, borderRadius: 10, padding: '0 6px', fontSize: 10, color: T.textMuted },
      }, contador),
    ),
    children,
  );
}

export function PainelCidadao({ conversa, etiquetas = [], onFechar, onContatoAtualizado, onAbrirConversa }) {
  const [ficha, setFicha] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroEdicao, setErroEdicao] = useState('');
  const [form, setForm] = useState({ nome: '', telefone: '', cpf: '', data_nascimento: '', endereco: '', bairro: '' });
  const painelRef = useRef(null);

  const carregar = useCallback(async () => {
    if (!conversa?.id) return;
    setCarregando(true);
    setErro('');
    try {
      // O histórico é complementar: se falhar, a ficha ainda aparece.
      const [dados, hist] = await Promise.all([
        fetchFichaCidadao(conversa.id),
        fetchHistoricoConversa(conversa.id).catch(() => ({ eventos: [] })),
      ]);
      setFicha(dados);
      setHistorico(hist.eventos || []);
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar a ficha.');
    } finally {
      setCarregando(false);
    }
  }, [conversa?.id]);

  useEffect(() => { carregar(); }, [carregar]);

  const contato = ficha?.contato;
  const telefone = contato?.phone_display || contato?.telefone || conversa?.contato_telefone;
  const protocoloAtual = ficha?.conversa?.protocolo_numero || conversa?.protocolo_numero;

  const abrirEdicao = () => {
    setForm({
      nome: contato?.nome || conversa?.contato_nome || '',
      telefone: contato?.phone_e164 || contato?.telefone || conversa?.contato_telefone || '',
      cpf: contato?.cpf || '',
      data_nascimento: contato?.data_nascimento ? String(contato.data_nascimento).slice(0, 10) : '',
      endereco: contato?.endereco || '',
      bairro: contato?.bairro || '',
    });
    setErroEdicao('');
    setEditando(true);
    requestAnimationFrame(() => painelRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  const salvarEdicao = async () => {
    if (!contato?.id) return;
    setSalvando(true);
    setErroEdicao('');
    try {
      const atualizado = await editarContato(contato.id, form);
      setFicha((atual) => ({ ...atual, contato: atualizado }));
      setEditando(false);
      onContatoAtualizado?.(atualizado);
    } catch (e) {
      setErroEdicao(e.message || 'Não foi possível atualizar o cadastro.');
    } finally {
      setSalvando(false);
    }
  };

  const campo = (rotulo, chave, opcoes = {}) => React.createElement('label', {
    style: { display: 'block', marginBottom: 9, fontSize: 10.5, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  },
    rotulo,
    React.createElement('input', {
      type: opcoes.type || 'text', value: form[chave],
      onChange: (e) => setForm((atual) => ({ ...atual, [chave]: e.target.value })),
      placeholder: opcoes.placeholder,
      style: {
        display: 'block', width: '100%', marginTop: 4, padding: '8px 9px',
        borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: T.surfaceMuted,
        color: T.text, fontSize: 12.5, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
        textTransform: 'none', letterSpacing: 0, fontWeight: 400,
      },
    }),
  );

  return React.createElement('aside', {
    ref: painelRef,
    'aria-label': 'Dados do cidadão',
    style: {
      width: 300, flexShrink: 0, height: '100%', overflowY: 'auto',
      background: T.surface, borderLeft: `1px solid ${T.border}`,
    },
  },
    // Cabeçalho
    React.createElement('div', {
      style: { padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, position: 'sticky', top: 0, background: T.surface, zIndex: 2, borderBottom: `1px solid ${T.border}` },
    },
      React.createElement(User, { size: 15, color: T.primary }),
      React.createElement('span', { style: { flex: 1, fontSize: 13, fontWeight: 700, color: T.text } }, 'Dados do cidadão'),
      React.createElement('button', {
        onClick: onFechar, 'aria-label': 'Fechar painel do cidadão', title: 'Fechar',
        style: { background: 'transparent', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 4, display: 'flex' },
      }, React.createElement(X, { size: 16 })),
    ),

    carregando && React.createElement('div', {
      style: { padding: 24, display: 'flex', justifyContent: 'center', color: T.textMuted },
    }, React.createElement(Loader2, { size: 20, style: { animation: 'girar 1s linear infinite' } })),

    erro && React.createElement('div', { style: { padding: 16, fontSize: 12.5, color: T.danger } }, erro),

    !carregando && !erro && React.createElement(React.Fragment, null,
      // Bloqueio aparece antes de tudo: muda o que o atendente pode fazer.
      ficha?.bloqueio && React.createElement('div', {
        role: 'alert',
        style: { margin: 12, padding: '9px 11px', borderRadius: T.radiusSm, background: T.dangerSoft, display: 'flex', gap: 8, alignItems: 'flex-start' },
      },
        React.createElement(Ban, { size: 15, color: T.danger, style: { flexShrink: 0, marginTop: 1 } }),
        React.createElement('div', { style: { fontSize: 12, color: T.danger } },
          React.createElement('strong', null, 'Contato bloqueado'),
          ficha.bloqueio.motivo && React.createElement('div', { style: { fontWeight: 400 } }, ficha.bloqueio.motivo),
        ),
      ),

      // Cadastro
      React.createElement('div', { style: { padding: '4px 16px 10px' } },
        editando
          ? React.createElement('div', { style: { paddingTop: 8 } },
              React.createElement('div', { style: { fontSize: 12.5, fontWeight: 800, color: T.text, marginBottom: 10 } }, 'Editar dados do cidadão'),
              campo('Nome', 'nome', { placeholder: 'Nome completo' }),
              campo('Telefone', 'telefone', { type: 'tel', placeholder: '+55 (44) 99999-9999' }),
              campo('CPF', 'cpf', { placeholder: '000.000.000-00' }),
              campo('Data de nascimento', 'data_nascimento', { type: 'date' }),
              campo('Endereço', 'endereco', { placeholder: 'Rua, número e complemento' }),
              campo('Bairro / comunidade', 'bairro', { placeholder: 'Bairro ou comunidade' }),
              erroEdicao && React.createElement('div', { role: 'alert', style: { color: T.danger, fontSize: 11.5, marginBottom: 8 } }, erroEdicao),
              React.createElement('div', { style: { display: 'flex', gap: 7, marginBottom: 4 } },
                React.createElement('button', {
                  type: 'button', onClick: () => setEditando(false), disabled: salvando,
                  style: { flex: 1, padding: '8px 10px', borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: 'transparent', color: T.textSecondary, cursor: 'pointer', fontWeight: 700, fontSize: 12 },
                }, 'Cancelar'),
                React.createElement('button', {
                  type: 'button', onClick: salvarEdicao, disabled: salvando,
                  style: { flex: 1, padding: '8px 10px', borderRadius: T.radiusSm, border: 'none', background: T.primary, color: '#fff', cursor: salvando ? 'wait' : 'pointer', opacity: salvando ? 0.7 : 1, fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 },
                }, salvando && React.createElement(Loader2, { size: 13, className: 'spin' }), salvando ? 'Salvando...' : 'Salvar'),
              ),
            )
          : React.createElement(React.Fragment, null,
              React.createElement(Linha, { icone: User, rotulo: 'Nome', valor: contato?.nome || conversa?.contato_nome }),
              React.createElement(Linha, {
                icone: Phone, rotulo: 'Telefone', valor: telefone,
                acao: React.createElement(BotaoCopiar, { texto: telefone, rotulo: 'telefone' }),
              }),
              React.createElement(Linha, { icone: IdCard, rotulo: 'CPF', valor: contato?.cpf }),
              React.createElement(Linha, { icone: Calendar, rotulo: 'Data de nascimento', valor: formatarData(contato?.data_nascimento) }),
              React.createElement(Linha, { icone: MapPin, rotulo: 'Endereço', valor: contato?.endereco }),
              React.createElement(Linha, { icone: MapPin, rotulo: 'Bairro / comunidade', valor: contato?.bairro }),
              React.createElement(Linha, {
                icone: Calendar, rotulo: 'Primeiro contato',
                valor: formatarData(ficha?.primeiro_contato_em),
              }),
            ),
      ),

      // Atendimento atual
      React.createElement(Secao, { titulo: 'Atendimento atual' },
        React.createElement(Linha, {
          icone: FileText, rotulo: 'Protocolo', valor: protocoloAtual ? `#${protocoloAtual}` : null,
          acao: React.createElement(BotaoCopiar, { texto: protocoloAtual, rotulo: 'protocolo' }),
        }),
        React.createElement(Linha, { icone: Building2, rotulo: 'Setor', valor: ficha?.conversa?.departamento_nome }),
        React.createElement(Linha, { icone: UserCheck, rotulo: 'Atendente', valor: ficha?.conversa?.operador_nome }),
      ),

      // Etiquetas (vêm do painel, que já as mantém sincronizadas)
      React.createElement(Secao, { titulo: 'Etiquetas', contador: etiquetas.length },
        etiquetas.length === 0
          ? React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'Nenhuma etiqueta.')
          : React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 5 } },
              etiquetas.map((et) => React.createElement('span', {
                key: et.id,
                style: { fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: `${et.cor}22`, color: et.cor },
              }, et.nome))),
      ),

      // Protocolos anteriores
      React.createElement(Secao, { titulo: 'Protocolos', contador: ficha?.protocolos?.length || 0 },
        (ficha?.protocolos || []).length === 0
          ? React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'Nenhum protocolo registrado.')
          : ficha.protocolos.map((p) => React.createElement('div', {
              key: p.numero,
              style: { padding: '6px 0', borderBottom: `1px solid ${T.surfaceMuted}` },
            },
              React.createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                React.createElement('span', { style: { fontSize: 12, fontWeight: 700, color: T.primary, fontVariantNumeric: 'tabular-nums' } }, `#${p.numero}`),
                React.createElement('span', { style: { fontSize: 10.5, color: T.textMuted, marginLeft: 'auto' } }, formatarData(p.aberto_em)),
              ),
              React.createElement('div', { style: { fontSize: 11.5, color: T.textSecondary } },
                p.assunto || 'Sem assunto', p.departamento_nome ? ` · ${p.departamento_nome}` : '', ` · ${p.status}`),
            )),
      ),

      // Atendimentos anteriores
      React.createElement(Secao, { titulo: 'Atendimentos recentes', contador: ficha?.atendimentos?.length || 0 },
        (ficha?.atendimentos || []).length === 0
          ? React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'Nenhum atendimento anterior.')
          : ficha.atendimentos.map((a) => {
              const st = CONVERSA_STATUS_UI[conversationStatus(a)];
              return React.createElement('button', {
                key: a.id,
                onClick: () => onAbrirConversa?.(a.id),
                title: 'Abrir este atendimento',
                style: {
                  width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                  cursor: onAbrirConversa ? 'pointer' : 'default', padding: '6px 0',
                  borderBottom: `1px solid ${T.surfaceMuted}`, fontFamily: 'inherit',
                },
              },
                React.createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                  st && React.createElement('span', {
                    style: { fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: st.background, color: st.color, textTransform: 'uppercase' },
                  }, st.label),
                  React.createElement('span', { style: { fontSize: 10.5, color: T.textMuted, marginLeft: 'auto' } }, formatarData(a.ultima_mensagem_em || a.criado_em)),
                ),
                React.createElement('div', { style: { fontSize: 11.5, color: T.textSecondary, marginTop: 2 } },
                  a.departamento_nome || 'Sem setor', a.operador_nome ? ` · ${a.operador_nome}` : ''),
              );
            }),
      ),

      // Linha do tempo das movimentações
      React.createElement(Secao, { titulo: 'Histórico de movimentações', contador: historico.length },
        historico.length === 0
          ? React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, 'Sem movimentações registradas.')
          : React.createElement('div', { style: { position: 'relative', paddingLeft: 14 } },
              // Fio vertical ligando os pontos da timeline.
              React.createElement('div', {
                style: { position: 'absolute', left: 3, top: 6, bottom: 6, width: 1, background: T.border },
              }),
              historico.map((ev, i) => React.createElement('div', {
                key: `${ev.criado_em}-${i}`,
                style: { position: 'relative', paddingBottom: 10 },
              },
                React.createElement('span', {
                  style: {
                    position: 'absolute', left: -14, top: 4, width: 7, height: 7, borderRadius: '50%',
                    background: COR_EVENTO[ev.tipo] || T.textMuted,
                  },
                }),
                React.createElement('div', { style: { fontSize: 12.5, color: T.text, fontWeight: 600, lineHeight: 1.3 } }, ev.titulo),
                React.createElement('div', { style: { fontSize: 11, color: T.textMuted } },
                  formatarData(ev.criado_em, true),
                  ev.operador_nome ? ` · ${ev.operador_nome}` : ''),
                ev.detalhe && React.createElement('div', {
                  style: { fontSize: 11.5, color: T.textSecondary, fontStyle: 'italic' },
                }, ev.detalhe),
              )),
            ),
      ),

      // Ações rápidas
      React.createElement(Secao, { titulo: 'Ações' },
        React.createElement('button', {
          onClick: abrirEdicao,
          style: {
            width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px',
            borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: 'transparent',
            color: T.textSecondary, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          },
        }, React.createElement(Pencil, { size: 14 }), 'Editar cadastro do contato'),
      ),
    ),
  );
}
