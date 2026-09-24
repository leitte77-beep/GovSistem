import {
  BookOpen, CheckCircle2, ChevronRight, Clock, Droplets, FileText, Fuel,
  Hash, History, Pencil, Save, Search, Settings, Tractor, UserCheck, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/cliente';
import { Carregando, Chip, Drawer, ErroEstado } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import type { ConfiguracaoItem } from '../types';
import { formatarDataHora } from '../utils';

/* ── Ícone por área ──────────────────────────────────────────────────────── */

const AREA_ICONES: Record<string, any> = {
  cacambas: Settings,
  porteira: Tractor,
  combustivel: Fuel,
  geral: BookOpen,
  agenda: Clock,
  auditoria: FileText,
};

const AREA_ROTULOS: Record<string, string> = {
  cacambas: 'Caçambas',
  porteira: 'Porteira Adentro',
  combustivel: 'Combustível',
  geral: 'Geral',
  agenda: 'Agenda',
  auditoria: 'Auditoria',
};

/* ══════════════════════════════════════════════════════════════════════════════
   Configurações — Painel administrativo
   ══════════════════════════════════════════════════════════════════════════════ */

export function Configuracoes() {
  const { pode } = useSessao();
  const { avisar } = useAviso();
  const [areas, setAreas] = useState<{ area: string; configuracoes: ConfiguracaoItem[] }[] | null>(null);
  const [erro, setErro] = useState('');
  const [termo, setTermo] = useState('');
  const [editando, setEditando] = useState<ConfiguracaoItem | null>(null);
  const [valor, setValor] = useState<any>('');
  const [justificativa, setJustificativa] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [inlineChave, setInlineChave] = useState<string | null>(null);
  const [inlineValor, setInlineValor] = useState<any>('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    api.get<{ areas: { area: string; configuracoes: ConfiguracaoItem[] }[] }>('/configuracoes')
      .then((r) => setAreas(r.areas))
      .catch((e) => setErro(e.message));
  }, []);

  const todas = useMemo(
    () => (areas || []).flatMap((g) => g.configuracoes),
    [areas],
  );

  const filtradas = useMemo(() => {
    if (!areas) return [];
    if (!termo) return areas;
    const t = termo.toLowerCase();
    return areas
      .map((g) => ({
        ...g,
        configuracoes: g.configuracoes.filter(
          (c) =>
            c.rotulo.toLowerCase().includes(t) ||
            c.chave.toLowerCase().includes(t) ||
            (c.descricao || '').toLowerCase().includes(t),
        ),
      }))
      .filter((g) => g.configuracoes.length > 0);
  }, [areas, termo]);

  const podeEditar = pode('govinfra.configuracoes.editar');

  const debounceBusca = useCallback((valor: string) => {
    setTermo(valor);
    clearTimeout(timerRef.current);
  }, []);

  /* ── Abrir drawer ──────────────────────────────────────────────────────── */

  function abrirDrawer(item: ConfiguracaoItem) {
    setEditando(item);
    setValor(item.valor);
    setJustificativa('');
  }

  /* ── Salvar ────────────────────────────────────────────────────────────── */

  async function salvar() {
    if (!editando) return;
    setSalvando(true);
    try {
      await api.put(`/configuracoes/${editando.chave}`, { valor, justificativa: justificativa || undefined });
      avisar('sucesso', 'Configuração atualizada e registrada na auditoria.');
      const alvo = editando;
      setEditando(null);
      const r = await api.get<{ areas: { area: string; configuracoes: ConfiguracaoItem[] }[] }>('/configuracoes');
      setAreas(r.areas);
    } catch (e: any) { avisar('erro', e.message); } finally { setSalvando(false); }
  }

  /* ── Salvar inline ─────────────────────────────────────────────────────── */

  async function salvarInline(item: ConfiguracaoItem) {
    setSalvando(true);
    try {
      await api.put(`/configuracoes/${item.chave}`, { valor: inlineValor, justificativa: 'Alteração rápida' });
      avisar('sucesso', `${item.rotulo} atualizado.`);
      const r = await api.get<{ areas: { area: string; configuracoes: ConfiguracaoItem[] }[] }>('/configuracoes');
      setAreas(r.areas);
      setInlineChave(null);
    } catch (e: any) { avisar('erro', e.message); } finally { setSalvando(false); }
  }

  function iniciarInline(item: ConfiguracaoItem) {
    if (!podeEditar || !item.editavel) return;
    setInlineChave(item.chave);
    setInlineValor(item.valor);
  }

  /* ── Render valor ──────────────────────────────────────────────────────── */

  function renderValor(item: ConfiguracaoItem) {
    if (inlineChave === item.chave) {
      if (item.tipo === 'booleano') {
        return (
          <span className="config-inline-edit">
            <select value={inlineValor ? '1' : '0'} onChange={(e) => setInlineValor(e.target.value === '1')}>
              <option value="0">Não</option>
              <option value="1">Sim</option>
            </select>
            <button className="botao pequeno principal" onClick={() => salvarInline(item)} disabled={salvando}>
              <CheckCircle2 size={13} />
            </button>
            <button className="botao pequeno sutil" onClick={() => setInlineChave(null)}>
              <X size={13} />
            </button>
          </span>
        );
      }
      if (item.tipo === 'numero') {
        return (
          <span className="config-inline-edit">
            <input type="number" step="any" value={inlineValor ?? ''} onChange={(e) => setInlineValor(Number(e.target.value))} autoFocus />
            <button className="botao pequeno principal" onClick={() => salvarInline(item)} disabled={salvando}>
              <CheckCircle2 size={13} />
            </button>
            <button className="botao pequeno sutil" onClick={() => setInlineChave(null)}>
              <X size={13} />
            </button>
          </span>
        );
      }
      return (
        <span className="config-inline-edit">
          <input type="text" value={inlineValor ?? ''} onChange={(e) => setInlineValor(e.target.value)} autoFocus />
          <button className="botao pequeno principal" onClick={() => salvarInline(item)} disabled={salvando}>
            <CheckCircle2 size={13} />
          </button>
          <button className="botao pequeno sutil" onClick={() => setInlineChave(null)}>
            <X size={13} />
          </button>
        </span>
      );
    }

    if (typeof item.valor === 'boolean') {
      return (
        <span className={`config-valor-chip ${item.valor ? 'ligado' : 'desligado'}`}>
          {item.valor ? 'Sim' : 'Não'}
        </span>
      );
    }
    if (Array.isArray(item.valor)) {
      return <Chip cor="cinza">{item.valor.length} item(ns)</Chip>;
    }
    if (typeof item.valor === 'object' && item.valor !== null) {
      return <code className="config-json">{JSON.stringify(item.valor).slice(0, 60)}{JSON.stringify(item.valor).length > 60 ? '…' : ''}</code>;
    }
    return <span className="config-valor">{String(item.valor ?? '—')}</span>;
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  if (erro) return <ErroEstado mensagem={erro} tentar={() => window.location.reload()} />;
  if (!areas) return <Carregando />;

  return (
    <div>
      {/* ═══ CABEÇALHO ═══ */}
      <header className="config-cabecalho">
        <div>
          <h1>Configurações</h1>
          <p>Gerencie as regras operacionais do sistema. Cada alteração é auditada automaticamente.</p>
        </div>
        <div className="config-cabecalho-busca">
          <Search size={16} />
          <input
            value={termo}
            onChange={(e) => debounceBusca(e.target.value)}
            placeholder="Pesquisar configuração…"
          />
          {termo && <button className="config-busca-limpar" onClick={() => setTermo('')}><X size={13} /></button>}
        </div>
      </header>

      {/* ═══ SEÇÕES ═══ */}
      {filtradas.length === 0 ? (
        <div className="vazio">
          <Settings size={42} />
          <div className="titulo">Nenhuma configuração encontrada</div>
        </div>
      ) : (
        <div className="config-grade">
          {filtradas.map((grupo) => {
            const Icone = AREA_ICONES[grupo.area] || Settings;
            const rotulo = AREA_ROTULOS[grupo.area] || grupo.area;
            return (
              <section key={grupo.area} className="config-area-card">
                <header className="config-area-cabecalho">
                  <div className="config-area-icon"><Icone size={18} /></div>
                  <div>
                    <h2>{rotulo}</h2>
                    <span>{grupo.configuracoes.length} configurações</span>
                  </div>
                </header>
                <div className="config-area-itens">
                  {grupo.configuracoes.map((item) => (
                    <div
                      key={item.chave}
                      className={`config-item ${inlineChave === item.chave ? 'editando' : ''} ${podeEditar && item.editavel ? 'editavel' : ''}`}
                    >
                      <div className="config-item-esq">
                        <span className="config-item-rotulo">{item.rotulo}</span>
                        {item.descricao && <span className="config-item-desc">{item.descricao}</span>}
                      </div>
                      <div className="config-item-dir">
                        <div
                          className="config-item-valor"
                          onClick={() => iniciarInline(item)}
                          title={podeEditar && item.editavel ? 'Clique para alterar' : undefined}
                        >
                          {renderValor(item)}
                        </div>
                        {podeEditar && item.editavel && inlineChave !== item.chave && (
                          <button
                            className="config-item-editar"
                            onClick={() => abrirDrawer(item)}
                            title="Editar com detalhes"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ═══ DRAWER DE EDIÇÃO ═══ */}
      <Drawer
        titulo={editando?.rotulo || 'Editar'}
        aberto={!!editando}
        fechar={() => setEditando(null)}
      >
        {editando && (
          <>
            <div className="drawer-secao">
              <div className="drawer-secao-titulo"><Settings size={13} /> Configuração</div>
              <div className="drawer-grade">
                <div className="drawer-campo">
                  <span className="drawer-campo-rotulo">Chave</span>
                  <span className="drawer-campo-valor"><code>{editando.chave}</code></span>
                </div>
                <div className="drawer-campo">
                  <span className="drawer-campo-rotulo">Área</span>
                  <span className="drawer-campo-valor">{AREA_ROTULOS[editando.area] || editando.area}</span>
                </div>
              </div>
              {editando.descricao && (
                <p className="texto-sutil margem-topo">{editando.descricao}</p>
              )}
            </div>

            <div className="drawer-secao">
              <div className="drawer-secao-titulo">Valor</div>
              {editando.tipo === 'booleano' && (
                <label className="caixa-marcacao">
                  <input type="checkbox" checked={!!valor} onChange={(e) => setValor(e.target.checked)} />
                  <span>{valor ? 'Ligado' : 'Desligado'}</span>
                </label>
              )}
              {editando.tipo === 'numero' && (
                <div className="campo">
                  <label>Valor numérico</label>
                  <input type="number" step="any" value={valor ?? ''} onChange={(e) => setValor(Number(e.target.value))} />
                </div>
              )}
              {editando.tipo === 'texto' && (
                <div className="campo">
                  <label>Valor texto</label>
                  <textarea rows={3} value={valor ?? ''} onChange={(e) => setValor(e.target.value)} />
                </div>
              )}
              {editando.tipo === 'lista' && (
                <div className="campo">
                  <label>Valores (um por linha)</label>
                  <textarea
                    rows={5}
                    value={Array.isArray(valor) ? valor.join('\n') : String(valor ?? '')}
                    onChange={(e) => setValor(e.target.value.split('\n').filter(Boolean))}
                  />
                </div>
              )}
              {editando.tipo === 'objeto' && (
                <div className="campo">
                  <label>JSON</label>
                  <textarea
                    rows={8}
                    className="mono"
                    value={JSON.stringify(valor, null, 2)}
                    onChange={(e) => { try { setValor(JSON.parse(e.target.value)); } catch { /* JSON inválido: aguarda */ } }}
                  />
                </div>
              )}
            </div>

            <div className="drawer-secao">
              <div className="drawer-secao-titulo"><FileText size={13} /> Justificativa</div>
              <div className="campo">
                <textarea
                  rows={2}
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Descreva o motivo da alteração (obrigatório para auditoria)"
                />
                <div className="ajuda">Cada alteração fica registrada na auditoria com data, usuário e IP.</div>
              </div>
            </div>

            <div className="drawer-acoes">
              <button className="botao principal" onClick={salvar} disabled={salvando}>
                <Save size={14} /> {salvando ? 'Salvando…' : 'Salvar alteração'}
              </button>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
