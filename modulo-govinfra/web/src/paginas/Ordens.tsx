import {
  AlertTriangle, ArrowRight, Calendar, Camera, CheckCircle2, Clock, FileDown, Fuel,
  Grid3X3, LayoutList, MapPin, Pause, Play, Plus, Search, Tractor, Truck, Wrench,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, baixar } from '../api/cliente';
import { CabecalhoPagina, Carregando, Chip, ErroEstado, Esqueleto, Paginacao } from '../componentes/Comuns';
import { useSessao } from '../contexto/SessaoContexto';
import type { OrdemServico, Paginado } from '../types';
import { corSituacao, formatarData, rotuloCurto } from '../utils';

const SITUACOES_ORDEM = ['emitida', 'em_execucao', 'pausada', 'concluida', 'cancelada'];

const ROTULOS_FLUXO = [
  { chave: 'emitida', rotulo: 'Emitida', cor: 'laranja', icone: Plus },
  { chave: 'em_execucao', rotulo: 'Em execução', cor: 'azul', icone: Play },
  { chave: 'pausada', rotulo: 'Pausada', cor: 'amarelo', icone: Pause },
  { chave: 'concluida', rotulo: 'Concluída', cor: 'verde', icone: CheckCircle2 },
  { chave: 'cancelada', rotulo: 'Cancelada', cor: 'cinza', icone: X },
];

type Visualizacao = 'cards' | 'lista';

export function Ordens() {
  const { pode } = useSessao();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const [termo, setTermo] = useState('');
  const [situacao, setSituacao] = useState(params.get('situacao') || '');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Paginado<OrdemServico> | null>(null);
  const [erro, setErro] = useState('');
  const [modo, setModo] = useState<Visualizacao>(
    (localStorage.getItem('ordens.modo') as Visualizacao) || 'cards',
  );
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  function carregar(paginaAtual: number, filtros: { termo?: string; situacao?: string } = {}) {
    const t = filtros.termo ?? termo;
    const s = filtros.situacao ?? situacao;
    setErro('');
    const qs = new URLSearchParams({ pagina: String(paginaAtual), por_pagina: '20' });
    if (t) qs.set('termo', t);
    if (s) qs.set('situacao', s);
    api.get<Paginado<OrdemServico>>(`/ordens?${qs.toString()}`)
      .then(setDados).catch((e) => setErro(e.message));
  }

  useEffect(() => { carregar(1); }, []);

  const debounceBusca = useCallback((valor: string) => {
    setTermo(valor);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => carregar(1, { termo: valor }), 300);
  }, [situacao]);

  function mudarModo(novo: Visualizacao) {
    setModo(novo);
    localStorage.setItem('ordens.modo', novo);
  }

  const contagens = useMemo(() => {
    if (!dados) return {};
    const mapa: Record<string, number> = {};
    dados.itens.forEach((o) => { mapa[o.situacao] = (mapa[o.situacao] || 0) + 1; });
    return mapa;
  }, [dados]);

  /* ── Ícone por situação ────────────────────────────────────────────────── */

  function IconeFluxo(sit: string) {
    const f = ROTULOS_FLUXO.find((r) => r.chave === sit);
    if (!f) return null;
    return <f.icone size={13} />;
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div>
      <CabecalhoPagina
        titulo="Ordens de serviço"
        descricao="Centro de controle das operações de campo: emitir, executar, acompanhar e concluir serviços."
        acoes={
          <div style={{ display: 'flex', gap: 8 }}>
            {pode('govinfra.ordens.emitir') && (
              <button className="botao principal" onClick={() => navegar('/govinfra/porteira/solicitacoes')}>
                <Plus size={17} /> Emitir nova ordem
              </button>
            )}
            <button className="botao sutil" title="Exportar">
              <FileDown size={16} />
            </button>
          </div>
        }
      />

      {/* ═══ FLUXO VISUAL ═══ */}
      <div className="cacambas-stats">
        <button
          className={`cacambas-stat ${situacao === '' ? 'ativo' : ''}`}
          onClick={() => { setSituacao(''); carregar(1, { situacao: '' }); }}
        >
          <span className="cacambas-stat-valor">{dados?.total ?? '—'}</span>
          <span className="cacambas-stat-rotulo">Total</span>
        </button>
        {ROTULOS_FLUXO.map((f) => (
          <button
            key={f.chave}
            className={`cacambas-stat ${f.cor} ${situacao === f.chave ? 'ativo' : ''}`}
            onClick={() => {
              const nova = situacao === f.chave ? '' : f.chave;
              setSituacao(nova);
              carregar(1, { situacao: nova });
            }}
          >
            <span className="cacambas-stat-icone"><f.icone size={15} /></span>
            <span className="cacambas-stat-valor">{contagens[f.chave] || 0}</span>
            <span className="cacambas-stat-rotulo">{f.rotulo}</span>
          </button>
        ))}
      </div>

      {/* ═══ BUSCA + CHIPS ═══ */}
      <div className="cacambas-busca">
        <Search size={19} />
        <input
          value={termo}
          onChange={(e) => debounceBusca(e.target.value)}
          placeholder="Buscar por nº da ordem, produtor, CPF, protocolo, operador, máquina ou comunidade…"
          aria-label="Buscar ordem de serviço"
        />
        {termo && (
          <button className="cacambas-busca-limpar" onClick={() => { setTermo(''); carregar(1, { termo: '' }); }}>
            <X size={14} />
          </button>
        )}
      </div>

      <div className="cacambas-chips">
        {SITUACOES_ORDEM.map((s) => (
          <button
            key={s}
            className={`cacambas-chip${situacao === s ? ' ativo' : ''}`}
            onClick={() => {
              setSituacao(situacao === s ? '' : s);
              carregar(1, { situacao: situacao === s ? '' : s });
            }}
          >
            {IconeFluxo(s)} {rotuloCurto(s)}
          </button>
        ))}
      </div>

      {/* ═══ TOOLBAR ═══ */}
      <div className="cacambas-toolbar">
        <span className="cacambas-contador">
          {dados ? `${dados.total} ordem(ns) encontrada(s)` : ''}
        </span>
        <div className="cacambas-toolbar-dir">
          <div className="cacambas-alternador">
            <button className={modo === 'cards' ? 'ativo' : ''} onClick={() => mudarModo('cards')}>
              <Grid3X3 size={16} />
            </button>
            <button className={modo === 'lista' ? 'ativo' : ''} onClick={() => mudarModo('lista')}>
              <LayoutList size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ═══ CONTEÚDO ═══ */}
      {erro && <ErroEstado mensagem={erro} tentar={() => carregar(1)} />}
      {!dados && !erro && (
        <div className="cacambas-skeleton">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="cacambas-skeleton-card"><Esqueleto linhas={4} /></div>
          ))}
        </div>
      )}
      {dados && dados.total === 0 && (
        <div className="cacambas-vazio">
          <Tractor size={48} />
          <h3>Nenhuma ordem de serviço</h3>
          <p>
            {termo || situacao
              ? 'Nenhum resultado para os filtros aplicados. Ajuste a busca ou limpe os filtros.'
              : 'As ordens de serviço são emitidas a partir de solicitações aprovadas do Porteira Adentro. Cada ordem representa uma operação de campo com máquina, operador e controle de horas.'}
          </p>
          <div className="cacambas-vazio-acoes">
            {pode('govinfra.ordens.emitir') && (
              <button className="botao principal" onClick={() => navegar('/govinfra/porteira/solicitacoes')}>
                <Plus size={16} /> Emitir primeira ordem
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Cards ──────────────────────────────────────────────────────── */}
      {dados && dados.total > 0 && modo === 'cards' && (
        <>
          <div className="cacambas-grade">
            {dados.itens.map((o) => {
              const f = ROTULOS_FLUXO.find((r) => r.chave === o.situacao);
              return (
                <article key={o.id} className="cacambas-card" onClick={() => navegar(`/govinfra/ordens/${o.id}`)}>
                  <div className="cacambas-card-cabecalho">
                    <div className="cacambas-card-nome">
                      <span className="cacambas-card-codigo">{o.numero_formatado}</span>
                      <span className="cacambas-card-modelo">{o.tipo_servico || 'Serviço'}</span>
                    </div>
                    <Chip cor={corSituacao(o.situacao)}>{o.situacao_rotulo}</Chip>
                  </div>
                  <div className="cacambas-card-corpo">
                    <div className="cacambas-card-linha">
                      <MapPin size={14} /> <span>{o.propriedade || o.produtor || '—'}</span>
                    </div>
                    <div className="cacambas-card-linha">
                      <Calendar size={14} /> <span>{formatarData(o.data_prevista)}</span>
                    </div>
                    <div className="cacambas-card-linha">
                      <Clock size={14} /> <span>{o.horas_autorizadas}h autorizadas</span>
                    </div>
                    {o.situacao === 'em_execucao' && (
                      <div className="cacambas-card-linha destaque">
                        <Play size={14} /> <span>Em andamento</span>
                      </div>
                    )}
                    {o.situacao === 'emitida' && (
                      <div className="cacambas-card-linha">
                        <Clock size={14} /> <span>Aguardando início</span>
                      </div>
                    )}
                  </div>
                  <div className="cacambas-card-rodape">
                    <span style={{ fontSize: 11, color: 'var(--cinza-500)' }}>
                      {o.produtor} {o.propriedade ? `· ${o.propriedade}` : ''}
                    </span>
                    <button
                      className="botao pequeno sutil"
                      onClick={(e) => { e.stopPropagation(); navegar(`/govinfra/ordens/${o.id}`); }}
                    >
                      Gerenciar
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <Paginacao pagina={dados.pagina} paginas={dados.paginas} mudar={(p) => { setPagina(p); carregar(p); }} />
        </>
      )}

      {/* ── Lista ──────────────────────────────────────────────────────── */}
      {dados && dados.total > 0 && modo === 'lista' && (
        <>
          <div className="tabela-envolve">
            <table className="tabela tabela-clicavel">
              <thead>
                <tr>
                  <th>Número</th><th>Produtor</th><th>Propriedade</th>
                  <th>Serviço</th><th>Data</th><th>Horas</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((o) => (
                  <tr key={o.id} onClick={() => navegar(`/govinfra/ordens/${o.id}`)}>
                    <td><strong>{o.numero_formatado}</strong></td>
                    <td>{o.produtor || '—'}</td>
                    <td>{o.propriedade || '—'}</td>
                    <td>{o.tipo_servico || '—'}</td>
                    <td>{formatarData(o.data_prevista)}</td>
                    <td className="numerico">{o.horas_autorizadas}h</td>
                    <td><Chip cor={corSituacao(o.situacao)}>{o.situacao_rotulo}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={dados.pagina} paginas={dados.paginas} mudar={(p) => { setPagina(p); carregar(p); }} />
        </>
      )}
    </div>
  );
}
