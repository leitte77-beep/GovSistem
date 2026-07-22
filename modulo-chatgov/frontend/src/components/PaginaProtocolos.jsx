import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, Search, X, FileText, Clock, User, Building2, Hash } from 'lucide-react';
import { T } from '../theme';
import { fetchProtocolos, fetchProtocolo, atualizarStatusProtocolo, fetchDepartamentos } from '../api';

// Status canônicos do protocolo. 'concluido' e 'cancelado' fecham o protocolo no backend
// (atualizarStatusProtocolo grava fechado_em); 'aberto' e 'em_andamento' mantêm-no em aberto.
const STATUS_PROT = {
  aberto: { label: 'Aberto', cor: T.warning, bg: T.warningSoft },
  em_andamento: { label: 'Em andamento', cor: T.primary, bg: T.primarySoft },
  concluido: { label: 'Concluído', cor: T.success, bg: T.successSoft },
  encerrado: { label: 'Encerrado', cor: T.textSecondary, bg: T.surfaceMuted },
  cancelado: { label: 'Cancelado', cor: T.danger, bg: T.dangerSoft },
};

const STATUS_INFO = (s) => STATUS_PROT[s] || { label: s || '—', cor: T.textMuted, bg: T.surfaceMuted };

// Próximos status oferecidos no detalhe (fluxo de atendimento).
const TRANSICOES = ['aberto', 'em_andamento', 'concluido', 'cancelado'];

function formatarData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Badge({ status }) {
  const info = STATUS_INFO(status);
  return React.createElement('span', {
    style: {
      display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 999,
      fontSize: 11.5, fontWeight: 700, color: info.cor, background: info.bg, whiteSpace: 'nowrap',
    },
  }, info.label);
}

// ─── Painel de detalhe (drawer à direita / overlay no mobile) ───────────────
function DetalheProtocolo({ numero, ehMobile, onClose, onChanged }) {
  const [proto, setProto] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [novoStatus, setNovoStatus] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const p = await fetchProtocolo(numero);
      setProto(p);
      setNovoStatus(p.status || '');
    } catch (e) {
      setErro(e.message || 'Erro ao carregar protocolo.');
    } finally {
      setCarregando(false);
    }
  }, [numero]);

  useEffect(() => { carregar(); }, [carregar]);

  const aplicarStatus = async () => {
    if (!proto || !novoStatus) return;
    setSalvando(true);
    setErro('');
    try {
      await atualizarStatusProtocolo(proto.id, { status: novoStatus, descricao: descricao.trim() || undefined });
      setDescricao('');
      await carregar();
      onChanged && onChanged();
    } catch (e) {
      setErro(e.message || 'Erro ao atualizar status.');
    } finally {
      setSalvando(false);
    }
  };

  const painelStyle = ehMobile
    ? { position: 'fixed', inset: 0, zIndex: 200, background: T.surface, display: 'flex', flexDirection: 'column' }
    : { width: 420, minWidth: 420, height: '100%', background: T.surface, borderLeft: `1px solid ${T.borderStrong}`, display: 'flex', flexDirection: 'column', flexShrink: 0 };

  const linhaInfo = (Icone, rotulo, valor) => React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10 } },
    React.createElement(Icone, { size: 15, style: { color: T.textMuted, marginTop: 2, flexShrink: 0 } }),
    React.createElement('div', { style: { minWidth: 0 } },
      React.createElement('div', { style: { fontSize: 11, color: T.textMuted, fontWeight: 600 } }, rotulo),
      React.createElement('div', { style: { fontSize: 13.5, color: T.text, fontWeight: 600, wordBreak: 'break-word' } }, valor || '—'),
    ),
  );

  return React.createElement('div', { style: painelStyle },
    // Cabeçalho do drawer
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 },
    },
      React.createElement(FileText, { size: 18, style: { color: T.primary } }),
      React.createElement('span', { style: { fontSize: 15, fontWeight: 700, color: T.text, flex: 1 } }, proto ? proto.numero : 'Protocolo'),
      React.createElement('button', {
        onClick: onClose, 'aria-label': 'Fechar',
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'transparent', color: T.textSecondary, cursor: 'pointer' },
      }, React.createElement(X, { size: 18 })),
    ),

    React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 } },
      erro && React.createElement('div', { role: 'alert', style: { padding: '10px 12px', background: T.dangerSoft, color: T.danger, borderRadius: T.radiusSm, fontSize: 13 } }, erro),

      carregando
        ? React.createElement('div', { style: { textAlign: 'center', padding: 40, color: T.textMuted } }, React.createElement(Loader2, { size: 24, className: 'spin' }))
        : proto && React.createElement(React.Fragment, null,
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
              React.createElement(Badge, { status: proto.status }),
              proto.prioridade && proto.prioridade !== 'normal' && React.createElement('span', { style: { fontSize: 11.5, color: T.textMuted, fontWeight: 600 } }, `Prioridade: ${proto.prioridade}`),
            ),

            proto.assunto && React.createElement('div', { style: { fontSize: 14, color: T.text, fontWeight: 600 } }, proto.assunto),

            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
              linhaInfo(User, 'Cidadão', proto.contato_nome || proto.contato_telefone),
              proto.contato_telefone && linhaInfo(Hash, 'Telefone', proto.contato_telefone),
              linhaInfo(Building2, 'Departamento', proto.departamento_nome),
              linhaInfo(User, 'Atendente', proto.operador_nome),
              linhaInfo(Clock, 'Aberto em', formatarData(proto.aberto_em)),
              proto.fechado_em && linhaInfo(Clock, 'Fechado em', formatarData(proto.fechado_em)),
            ),

            // Alterar status
            React.createElement('div', { style: { borderTop: `1px solid ${T.border}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 } },
              React.createElement('div', { style: { fontSize: 12, fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase' } }, 'Alterar status'),
              React.createElement('select', {
                value: novoStatus, onChange: (e) => setNovoStatus(e.target.value),
                style: { padding: '8px 10px', borderRadius: T.radiusSm, border: `1px solid ${T.borderStrong}`, fontSize: 13, color: T.text, background: T.surface, outline: 'none', fontFamily: 'inherit' },
              },
                TRANSICOES.map((s) => React.createElement('option', { key: s, value: s }, STATUS_INFO(s).label)),
              ),
              React.createElement('textarea', {
                value: descricao, onChange: (e) => setDescricao(e.target.value),
                placeholder: 'Observação do andamento (opcional)', rows: 2,
                style: { padding: '8px 10px', borderRadius: T.radiusSm, border: `1px solid ${T.borderStrong}`, fontSize: 13, color: T.text, background: T.surface, outline: 'none', fontFamily: 'inherit', resize: 'vertical' },
              }),
              React.createElement('button', {
                onClick: aplicarStatus, disabled: salvando || novoStatus === proto.status,
                style: {
                  alignSelf: 'flex-start', padding: '8px 16px', borderRadius: T.radiusSm, border: 'none',
                  background: (salvando || novoStatus === proto.status) ? T.surfaceMuted : T.primary,
                  color: (salvando || novoStatus === proto.status) ? T.textMuted : '#fff',
                  fontSize: 13, fontWeight: 600, cursor: (salvando || novoStatus === proto.status) ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                },
              }, salvando && React.createElement(Loader2, { size: 14, className: 'spin' }), 'Registrar andamento'),
            ),

            // Timeline de andamentos
            React.createElement('div', { style: { borderTop: `1px solid ${T.border}`, paddingTop: 14 } },
              React.createElement('div', { style: { fontSize: 12, fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase', marginBottom: 12 } }, 'Acompanhamento'),
              (proto.andamentos || []).length === 0
                ? React.createElement('div', { style: { fontSize: 13, color: T.textMuted } }, 'Sem andamentos registrados.')
                : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 0 } },
                    (proto.andamentos || []).map((a, i, arr) => React.createElement('div', { key: a.id, style: { display: 'flex', gap: 12 } },
                      // Trilho + marcador
                      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 } },
                        React.createElement('div', { style: { width: 11, height: 11, borderRadius: '50%', background: STATUS_INFO(a.status).cor, marginTop: 3 } }),
                        i < arr.length - 1 && React.createElement('div', { style: { width: 2, flex: 1, background: T.border, minHeight: 16 } }),
                      ),
                      React.createElement('div', { style: { paddingBottom: 16, minWidth: 0 } },
                        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                          React.createElement(Badge, { status: a.status }),
                          React.createElement('span', { style: { fontSize: 11.5, color: T.textMuted } }, formatarData(a.criado_em)),
                        ),
                        a.descricao && React.createElement('div', { style: { fontSize: 13, color: T.text, marginTop: 4, wordBreak: 'break-word' } }, a.descricao),
                        a.operador_nome && React.createElement('div', { style: { fontSize: 11.5, color: T.textMuted, marginTop: 2 } }, `por ${a.operador_nome}`),
                      ),
                    )),
                  ),
            ),
          ),
    ),
  );
}

// ─── Página principal ───────────────────────────────────────────────────────
export function PaginaProtocolos({ breakpoint }) {
  const ehMobile = breakpoint === 'mobile';
  const [lista, setLista] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroDepto, setFiltroDepto] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');
  const [selecionado, setSelecionado] = useState(null); // número do protocolo aberto

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const params = {};
      if (filtroStatus) params.status = filtroStatus;
      if (filtroDepto) params.departamento_id = filtroDepto;
      if (buscaAtiva) params.busca = buscaAtiva;
      setLista(await fetchProtocolos(params));
    } catch (e) {
      setErro(e.message || 'Erro ao carregar protocolos.');
    } finally {
      setCarregando(false);
    }
  }, [filtroStatus, filtroDepto, buscaAtiva]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    fetchDepartamentos().then(setDepartamentos).catch(() => {});
  }, []);

  const inputBase = {
    padding: '8px 10px', borderRadius: T.radiusSm, border: `1px solid ${T.borderStrong}`,
    fontSize: 13, color: T.text, background: T.surface, outline: 'none', fontFamily: 'inherit',
  };

  const conteudo = React.createElement('div', {
    style: { flex: 1, minWidth: 0, height: '100%', overflowY: 'auto', overflowX: 'hidden', background: T.bg, padding: ehMobile ? 14 : 20 },
  },
    // Cabeçalho
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 } },
      React.createElement(FileText, { size: 22, style: { color: T.primary } }),
      React.createElement('h2', { style: { fontSize: 20, fontWeight: 700, color: T.text, margin: 0, flex: 1 } }, 'Protocolos'),
      React.createElement('button', {
        onClick: carregar, disabled: carregando, 'aria-label': 'Atualizar',
        style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: T.radiusSm, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 600, cursor: carregando ? 'default' : 'pointer' },
      }, React.createElement(RefreshCw, { size: 14, className: carregando ? 'spin' : undefined }), !ehMobile && 'Atualizar'),
    ),

    // Filtros
    React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 } },
      React.createElement('form', {
        onSubmit: (e) => { e.preventDefault(); setBuscaAtiva(busca.trim()); },
        style: { position: 'relative', flex: '1 1 220px', minWidth: 180 },
      },
        React.createElement(Search, { size: 15, style: { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.textMuted } }),
        React.createElement('input', {
          value: busca, onChange: (e) => setBusca(e.target.value),
          placeholder: 'Buscar nº, cidadão ou CPF…',
          style: { ...inputBase, width: '100%', boxSizing: 'border-box', paddingLeft: 32 },
        }),
      ),
      React.createElement('select', { value: filtroStatus, onChange: (e) => setFiltroStatus(e.target.value), style: inputBase },
        React.createElement('option', { value: '' }, 'Todos os status'),
        Object.keys(STATUS_PROT).map((s) => React.createElement('option', { key: s, value: s }, STATUS_PROT[s].label)),
      ),
      React.createElement('select', { value: filtroDepto, onChange: (e) => setFiltroDepto(e.target.value), style: inputBase },
        React.createElement('option', { value: '' }, 'Todos os setores'),
        departamentos.map((d) => React.createElement('option', { key: d.id, value: d.id }, d.secretaria_nome ? `${d.secretaria_nome} › ${d.nome}` : d.nome)),
      ),
    ),

    erro && React.createElement('div', { role: 'alert', style: { padding: '10px 14px', background: T.dangerSoft, color: T.danger, borderRadius: T.radiusSm, fontSize: 13, marginBottom: 14 } }, erro),

    carregando && lista.length === 0
      ? React.createElement('div', { style: { textAlign: 'center', padding: 60, color: T.textMuted } }, React.createElement(Loader2, { size: 26, className: 'spin' }))
      : lista.length === 0
      ? React.createElement('div', { style: { textAlign: 'center', padding: 60, color: T.textMuted, fontSize: 14 } },
          React.createElement(FileText, { size: 40, style: { color: T.borderStrong, marginBottom: 12 } }),
          React.createElement('div', null, 'Nenhum protocolo encontrado.'),
        )
      : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, maxWidth: '100%' } },
          lista.map((p) => React.createElement('button', {
            key: p.id,
            onClick: () => setSelecionado(p.numero),
            style: {
              display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left', width: '100%',
              padding: '12px 14px', borderRadius: T.radius, cursor: 'pointer',
              background: selecionado === p.numero ? T.primarySoft : T.surface,
              border: `1px solid ${selecionado === p.numero ? T.primary : T.border}`,
              flexWrap: 'wrap', minWidth: 0, boxSizing: 'border-box',
            },
          },
            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                React.createElement('span', { style: { fontSize: 14, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' } }, p.numero),
                React.createElement(Badge, { status: p.status }),
                React.createElement('span', { style: { fontSize: 10.5, color: T.textMuted, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, formatarData(p.aberto_em)),
              ),
              React.createElement('div', { style: { fontSize: 13, color: T.textSecondary, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                (p.contato_nome || p.contato_telefone || 'Cidadão'),
                p.departamento_nome ? ` · ${p.departamento_nome}` : '',
                p.assunto ? ` · ${p.assunto}` : '',
              ),
            ),
          )),
        ),
  );

  // Layout: master-detail no desktop, overlay no mobile.
  return React.createElement('div', { style: { display: 'flex', flex: 1, minHeight: 0, height: '100%', width: '100%' } },
    conteudo,
    selecionado && React.createElement(DetalheProtocolo, {
      numero: selecionado,
      ehMobile,
      onClose: () => setSelecionado(null),
      onChanged: carregar,
    }),
  );
}
