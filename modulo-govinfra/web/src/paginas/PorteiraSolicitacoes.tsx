import {
  AlertTriangle, ArrowLeft, Calendar, CheckCircle2, Clock, FileText,
  Flag, Info, Plus, Search, Tractor, Upload, UserCheck, Wrench, X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { CabecalhoPagina, Carregando, Chip, ErroEstado, Paginacao, Vazio } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import type { Beneficiario, Paginado, SolicitacaoServico } from '../types';
import { corSituacao, formatarData, iniciais, rotuloCurto } from '../utils';

const SITUACOES = [
  'protocolada', 'em_analise', 'aguardando_vistoria', 'aprovada', 'reprovada',
  'agendada', 'em_execucao', 'pausada', 'aguardando_horas_adicionais', 'concluida', 'cancelada',
];

const PRIORIDADES = [
  { chave: 'baixa', rotulo: 'Baixa', cor: 'cinza', icone: Flag },
  { chave: 'normal', rotulo: 'Normal', cor: 'azul', icone: Info },
  { chave: 'alta', rotulo: 'Alta', cor: 'laranja', icone: AlertTriangle },
  { chave: 'urgente', rotulo: 'Urgente', cor: 'vermelho', icone: AlertTriangle },
];

export function PorteiraSolicitacoes() {
  const { pode } = useSessao();
  const { avisar } = useAviso();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const [termo, setTermo] = useState('');
  const [situacao, setSituacao] = useState(params.get('situacao') || '');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Paginado<SolicitacaoServico> | null>(null);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [programas, setProgramas] = useState<any[]>([]);
  const [tipos, setTipos] = useState<any[]>([]);
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([]);
  const [benefSel, setBenefSel] = useState<Beneficiario | null>(null);
  const [programaSel, setProgramaSel] = useState<string>('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const canCreate = pode('govinfra.porteira.criar');

  function carregar(paginaAtual: number, filtros: { termo?: string; situacao?: string } = {}) {
    const t = filtros.termo ?? termo;
    const s = filtros.situacao ?? situacao;
    setErro('');
    const qs = new URLSearchParams({ pagina: String(paginaAtual), por_pagina: '15' });
    if (t) qs.set('termo', t);
    if (s) qs.set('situacao', s);
    api.get<Paginado<SolicitacaoServico>>(`/porteira/solicitacoes?${qs.toString()}`)
      .then(setDados).catch((e) => setErro(e.message));
  }

  useEffect(() => { carregar(1); }, []);

  const debounceBusca = useCallback((valor: string) => {
    setTermo(valor);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => carregar(1, { termo: valor }), 300);
  }, [situacao]);

  async function abrirCriar() {
    setCriando(true);
    setBenefSel(null);
    setProgramaSel('');
    try {
      const [p, t, b] = await Promise.all([
        api.get<any[]>('/porteira/programas'),
        api.get<any[]>('/porteira/tipos-servico'),
        api.get<{ itens: Beneficiario[] }>('/porteira/beneficiarios?por_pagina=100'),
      ]);
      setProgramas(p); setTipos(t); setBeneficiarios(b.itens);
    } catch (e: any) { avisar('erro', e.message); }
  }

  function handleBeneficiario(id: string) {
    const b = beneficiarios.find((x) => x.id === id) || null;
    setBenefSel(b);
  }

  async function criar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api.post('/porteira/solicitacoes', {
        programa_id: fd.get('programa_id'),
        beneficiario_id: fd.get('beneficiario_id'),
        imovel_id: fd.get('imovel_id') || undefined,
        tipo_servico_id: fd.get('tipo_servico_id'),
        descricao: fd.get('descricao'),
        motivo: fd.get('motivo'),
        horas_estimadas: Number(fd.get('horas_estimadas')) || undefined,
        data_desejada: fd.get('data_desejada') || undefined,
        data_segunda_opcao: fd.get('data_segunda_opcao') || undefined,
        prioridade: fd.get('prioridade') || 'normal',
      });
      avisar('sucesso', 'Solicitação registrada com protocolo.');
      setCriando(false);
      carregar(1);
    } catch (err: any) { avisar('erro', err.message); } finally { setSalvando(false); }
  }

  /* ── Programa ativo selecionado ──────────────────────────────────────── */

  return (
    <div>
      <button className="botao sutil" onClick={() => navegar('/govinfra/porteira')}><ArrowLeft size={16} /> Voltar</button>
      <CabecalhoPagina
        titulo="Solicitações do Porteira Adentro"
        descricao="Solicitações de serviço rural: análise, vistoria, aprovação e execução."
        acoes={canCreate && (
          <button className="botao principal" onClick={abrirCriar}><Plus size={17} /> Nova solicitação</button>
        )}
      />

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div className="barra-filtros">
        <div className="campo-com-icone">
          <Search size={17} />
          <input value={termo} onChange={(e) => debounceBusca(e.target.value)} placeholder="Protocolo, CPF, produtor, propriedade, comunidade…" />
        </div>
        <select value={situacao} onChange={(e) => { setSituacao(e.target.value); carregar(1, { situacao: e.target.value }); }}>
          <option value="">Todas as situações</option>
          {SITUACOES.map((s) => <option key={s} value={s}>{rotuloCurto(s)}</option>)}
        </select>
      </div>

      <div className="porteira-sol-chips">
        {[
          { chave: 'protocolada', rotulo: 'Pendentes' },
          { chave: 'em_analise', rotulo: 'Em análise' },
          { chave: 'aguardando_vistoria', rotulo: 'Vistoria' },
          { chave: 'aprovada', rotulo: 'Aprovadas' },
          { chave: 'em_execucao', rotulo: 'Em execução' },
        ].map(({ chave, rotulo }) => (
          <button
            key={chave}
            className={`porteira-sol-chip${situacao === chave ? ' ativo' : ''}`}
            onClick={() => { setSituacao(situacao === chave ? '' : chave); carregar(1, { situacao: situacao === chave ? '' : chave }); }}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {erro && <ErroEstado mensagem={erro} tentar={() => carregar(1)} />}
      {!dados && !erro && <Carregando />}
      {dados && dados.total === 0 && (
        <Vazio titulo="Nenhuma solicitação encontrada"
          texto={termo || situacao ? 'Ajuste os filtros.' : 'Cadastre a primeira solicitação de serviço rural.'}
          acao={canCreate && <button className="botao principal" onClick={abrirCriar}><Plus size={16} /> Nova solicitação</button>}
        />
      )}
      {dados && dados.total > 0 && (
        <>
          <div className="tabela-envolve">
            <table className="tabela tabela-clicavel"><thead><tr>
              <th>Protocolo</th><th>Produtor</th><th>Propriedade</th><th>Serviço</th><th>Horas</th><th>Data</th><th>Situação</th>
            </tr></thead>
              <tbody>{dados.itens.map((s) => (
                <tr key={s.id} onClick={() => navegar(`/govinfra/porteira/solicitacoes/${s.id}`)}>
                  <td><strong>{s.protocolo_formatado}</strong></td>
                  <td>{s.produtor || '—'}</td><td>{s.propriedade || '—'}</td><td>{s.tipo_servico || '—'}</td>
                  <td className="numerico">{s.horas_estimadas ?? '—'}</td><td>{formatarData(s.data_desejada)}</td>
                  <td><Chip cor={corSituacao(s.situacao)}>{s.situacao_rotulo}</Chip></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <Paginacao pagina={dados.pagina} paginas={dados.paginas} mudar={(p) => { setPagina(p); carregar(p); }} />
        </>
      )}

      {/* ═══ MODAL: NOVA SOLICITAÇÃO ═══ */}
      {criando && (
        <div className="modal-fundo" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setCriando(false)}>
          <section className="modal largo" role="dialog" aria-modal="true" aria-label="Nova solicitação de serviço" style={{ width: 'min(1100px, calc(100vw - 32px))' }}>
            <header className="modal-cabecalho-premium">
              <div className="modal-cabecalho-premium-esq">
                <h2>Nova solicitação — Porteira Adentro</h2>
                <p>Cadastre uma solicitação para análise técnica e posterior agendamento do serviço.</p>
              </div>
              <button className="modal-botao-fechar" aria-label="Fechar" onClick={() => setCriando(false)}>
                <X size={18} />
              </button>
            </header>

            <div className="modal-corpo" style={{ padding: '20px 24px', display: 'flex', gap: 24 }}>
              {/* ── FORMULÁRIO ──────────────────────────────────────────── */}
              <form id="form-solicitacao" style={{ flex: '1 1 60%' }} onSubmit={criar}>
                <div className="cacambas-form-grade" style={{ gap: '18px 20px' }}>
                  {/* ── Programa ────────────────────────────────────── */}
                  <div className="cacambas-form-secao" style={{ marginBottom: 4 }}>
                    <div className="cacambas-form-secao-header">
                      <div className="cacambas-form-secao-icone"><Tractor size={16} /></div>
                      <div className="cacambas-form-secao-texto">
                        <span className="cacambas-form-secao-titulo">Programa</span>
                        <span className="cacambas-form-secao-desc">Selecione o programa municipal de apoio ao produtor.</span>
                      </div>
                    </div>
                  </div>
                  <div className="campo campo-full">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {programas.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={`cadastro-chip ${programaSel === p.id ? 'ativo' : ''}`}
                          onClick={() => setProgramaSel(p.id)}
                        >
                          <Tractor size={13} /> {p.nome}
                        </button>
                      ))}
                    </div>
                    <input type="hidden" name="programa_id" value={programaSel || ''} />
                  </div>

                  {/* ── Beneficiário ────────────────────────────────── */}
                  <div className="cacambas-form-secao">
                    <div className="cacambas-form-secao-header">
                      <div className="cacambas-form-secao-icone"><UserCheck size={16} /></div>
                      <div className="cacambas-form-secao-texto">
                        <span className="cacambas-form-secao-titulo">Beneficiário</span>
                        <span className="cacambas-form-secao-desc">Selecione o produtor rural vinculado ao programa.</span>
                      </div>
                    </div>
                  </div>
                  <div className="campo campo-full">
                    <label className="cacambas-label">Produtor <span className="asterisco">*</span></label>
                    <select className="cacambas-select" name="beneficiario_id" required
                      onChange={(e) => handleBeneficiario(e.target.value)}>
                      <option value="">Selecione o produtor…</option>
                      {beneficiarios.map((b: Beneficiario) => (
                        <option key={b.id} value={b.id}>
                          {b.pessoa?.nome || '—'} — saldo {b.saldo_total_disponivel}h
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* ── Serviço ─────────────────────────────────────── */}
                  <div className="cacambas-form-secao">
                    <div className="cacambas-form-secao-header">
                      <div className="cacambas-form-secao-icone"><Wrench size={16} /></div>
                      <div className="cacambas-form-secao-texto">
                        <span className="cacambas-form-secao-titulo">Serviço solicitado</span>
                        <span className="cacambas-form-secao-desc">Tipo de serviço, horas estimadas e prioridade.</span>
                      </div>
                    </div>
                  </div>
                  <div className="campo">
                    <label className="cacambas-label">Tipo de serviço <span className="asterisco">*</span></label>
                    <select className="cacambas-select" name="tipo_servico_id" required>
                      <option value="">Selecione…</option>
                      {tipos.map((t: any) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </select>
                  </div>
                  <div className="campo">
                    <label className="cacambas-label">Horas estimadas</label>
                    <div className="cacambas-input-envolve">
                      <Clock size={16} className="cadastro-input-icone" />
                      <input className="cacambas-input" name="horas_estimadas" type="number" min="0.5" step="0.5" placeholder="4" />
                    </div>
                    {benefSel && benefSel.saldo_total_disponivel > 0 && (
                      <div className="cacambas-feedback ok">Saldo disponível: {benefSel.saldo_total_disponivel}h</div>
                    )}
                  </div>
                  <div className="campo">
                    <label className="cacambas-label">Prioridade</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {PRIORIDADES.map((p) => {
                        const Icon = p.icone;
                        return (
                          <label key={p.chave} className={`cadastro-chip ${p.chave === 'normal' ? 'ativo' : ''}`} style={{ cursor: 'pointer' }}>
                            <input type="radio" name="prioridade" value={p.chave} defaultChecked={p.chave === 'normal'} style={{ display: 'none' }} />
                            <Icon size={13} /> {p.rotulo}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Datas ───────────────────────────────────────── */}
                  <div className="cacambas-form-secao">
                    <div className="cacambas-form-secao-header">
                      <div className="cacambas-form-secao-icone"><Calendar size={16} /></div>
                      <div className="cacambas-form-secao-texto">
                        <span className="cacambas-form-secao-titulo">Datas desejadas</span>
                        <span className="cacambas-form-secao-desc">Informe até duas opções de data para facilitar o agendamento.</span>
                      </div>
                    </div>
                  </div>
                  <div className="campo">
                    <label className="cacambas-label">Data desejada</label>
                    <div className="cacambas-input-envolve">
                      <Calendar size={16} className="cadastro-input-icone" />
                      <input className="cacambas-input" name="data_desejada" type="date" />
                    </div>
                  </div>
                  <div className="campo">
                    <label className="cacambas-label">Segunda opção</label>
                    <div className="cacambas-input-envolve">
                      <Calendar size={16} className="cadastro-input-icone" />
                      <input className="cacambas-input" name="data_segunda_opcao" type="date" />
                    </div>
                  </div>

                  {/* ── Descrição ────────────────────────────────────── */}
                  <div className="cacambas-form-secao">
                    <div className="cacambas-form-secao-header">
                      <div className="cacambas-form-secao-icone"><FileText size={16} /></div>
                      <div className="cacambas-form-secao-texto">
                        <span className="cacambas-form-secao-titulo">Detalhes</span>
                        <span className="cacambas-form-secao-desc">Descrição do serviço e observações complementares.</span>
                      </div>
                    </div>
                  </div>
                  <div className="campo campo-full">
                    <label className="cacambas-label">Descrição do serviço <span className="asterisco">*</span></label>
                    <textarea className="cacambas-textarea" name="descricao" required rows={4}
                      placeholder="Descreva o serviço solicitado: nivelamento, cascalhamento, abertura de estrada, etc." />
                  </div>
                  <div className="campo campo-full">
                    <label className="cacambas-label">Observações / ocorrências</label>
                    <textarea className="cacambas-textarea" name="motivo" rows={2}
                      placeholder="Informações sobre acesso, árvores, cercas, solo molhado…" />
                  </div>
                </div>
              </form>

              {/* ── PAINEL DE ELEGIBILIDADE ──────────────────────────────── */}
              <aside style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="porteira-cartao" style={{ padding: 14 }}>
                  <div className="porteira-cartao-titulo"><CheckCircle2 size={14} /> Elegibilidade</div>
                  {!benefSel ? (
                    <p style={{ fontSize: 12.5, color: 'var(--cinza-400)', lineHeight: 1.5, margin: 0 }}>
                      Selecione um beneficiário para verificar automaticamente elegibilidade, saldo, bloqueios e disponibilidade.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div className="porteira-beneficiario-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
                          {iniciais(benefSel.pessoa?.nome)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cinza-800)' }}>
                            {benefSel.pessoa?.nome || '—'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--cinza-500)' }}>
                            {benefSel.programa_nome || '—'}
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: 12 }}>
                        <span style={{ color: 'var(--verde-700)' }}>✔</span>{' '}
                        <span style={{ color: 'var(--verde-700)' }}>Cadastro ativo</span>
                      </div>

                      {benefSel.saldo_total_disponivel > 0 ? (
                        <div style={{ fontSize: 12 }}>
                          <span>✔</span>{' '}
                          <span>Saldo disponível: <strong>{benefSel.saldo_total_disponivel}h</strong></span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12 }}>
                          <AlertTriangle size={12} style={{ color: 'var(--vermelho-600)' }} />{' '}
                          <span style={{ color: 'var(--vermelho-700)' }}>Saldo esgotado</span>
                        </div>
                      )}

                      {benefSel.bloqueios_ativos && benefSel.bloqueios_ativos > 0 ? (
                        <div style={{ fontSize: 12 }}>
                          <AlertTriangle size={12} style={{ color: 'var(--vermelho-600)' }} />{' '}
                          <span style={{ color: 'var(--vermelho-700)' }}>
                            {benefSel.bloqueios_ativos} bloqueio(s) ativo(s)
                          </span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12 }}>
                          <span style={{ color: 'var(--verde-700)' }}>✔</span>{' '}
                          <span>Sem bloqueios</span>
                        </div>
                      )}

                      <div style={{ fontSize: 12 }}>
                        <span>✔</span>{' '}
                        <span>Situação: <Chip cor={benefSel.situacao === 'ativo' ? 'verde' : 'vermelho'}>{benefSel.situacao}</Chip></span>
                      </div>

                      {benefSel.validade_ate && (
                        <div style={{ fontSize: 12 }}>
                          <Calendar size={12} />{' '}
                          <span>Validade: {formatarData(benefSel.validade_ate)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="porteira-cartao" style={{ padding: 14 }}>
                  <div className="porteira-cartao-titulo"><Tractor size={14} /> Equipamento sugerido</div>
                  <p style={{ fontSize: 12.5, color: 'var(--cinza-400)', lineHeight: 1.5, margin: 0 }}>
                    Após selecionar o tipo de serviço, o sistema recomendará o equipamento mais adequado com base na distância e disponibilidade.
                  </p>
                </div>

                <div className="porteira-cartao" style={{ padding: 14 }}>
                  <div className="porteira-cartao-titulo"><Upload size={14} /> Anexos</div>
                  <div className="cacambas-upload-area" style={{ padding: '16px 12px' }}>
                    <Upload size={22} />
                    <div className="titulo">Anexar fotos do local</div>
                    <div className="desc">Facilita a análise e vistoria prévia.</div>
                  </div>
                </div>
              </aside>
            </div>

            <footer className="modal-rodape-premium">
              <span className="modal-rodape-premium-esq">O protocolo é gerado automaticamente.</span>
              <div className="modal-rodape-premium-dir">
                <button className="botao" onClick={() => setCriando(false)}>Cancelar</button>
                <button className="botao principal" form="form-solicitacao" disabled={salvando}>
                  {salvando ? 'Registrando…' : 'Registrar solicitação'}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
