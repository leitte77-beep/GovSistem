import {
  ArrowLeft, Calendar, Camera, CheckCircle2, Clock, DollarSign, FileText,
  Fuel, Hash, MapPin, Pause, Play, Plus, QrCode, Square, Tractor,
  Truck, Upload, UserCheck, Wrench, X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { Chip, ErroEstado, Modal } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import type { Maquina, Veiculo } from '../types';
import { corSituacao, formatarData, formatarDataHora, iniciais } from '../utils';

type Ordem = {
  id: string;
  numero_formatado: string;
  situacao: string;
  situacao_rotulo: string;
  data_prevista: string;
  hora_prevista_inicio?: string | null;
  hora_prevista_fim?: string | null;
  horas_autorizadas: number;
  horas_totais?: number;
  horas_produtivas?: number;
  produtor?: string | null;
  propriedade?: string | null;
  endereco?: string | null;
  tipo_servico?: string | null;
  descricao?: string | null;
  iniciada_em?: string | null;
  concluida_em?: string | null;
  pausada_em?: string | null;
  diesel_consumido_litros?: number;
  url_consulta?: string | null;
  maquinas: { id: string; recurso_id: string; recurso_codigo?: string | null; recurso_nome?: string | null; principal: boolean; medidor_inicial?: number | null }[];
  veiculos: { id: string; recurso_id: string; recurso_codigo?: string | null; recurso_nome?: string | null }[];
  apontamentos?: { tipo: string; data: string; descricao?: string }[];
  custo_estimado?: number;
};

const ROTULOS_TIPO: Record<string, string> = {
  produtiva: 'Produtiva',
  parada: 'Parada',
  deslocamento: 'Deslocamento',
  abastecimento: 'Abastecimento',
};

const CORES_TIPO: Record<string, string> = {
  produtiva: 'verde',
  parada: 'vermelho',
  deslocamento: 'laranja',
  abastecimento: 'azul',
};

export function OrdemDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { pode } = useSessao();
  const { avisar } = useAviso();
  const [ordem, setOrdem] = useState<Ordem | null>(null);
  const [erro, setErro] = useState('');
  const [modal, setModal] = useState('');
  const [motivo, setMotivo] = useState('');
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [maquinaId, setMaquinaId] = useState('');
  const [veiculoId, setVeiculoId] = useState('');
  const [horimetroInicial, setHorimetroInicial] = useState('');
  const [horimetroFinal, setHorimetroFinal] = useState('');
  const [quantidadeHoras, setQuantidadeHoras] = useState('');

  function recarregar() {
    api.get<Ordem>(`/ordens/${id}`).then(setOrdem).catch((e) => setErro(e.message));
  }

  useEffect(() => { recarregar(); }, [id]);

  async function abrirModal(tipo: string) {
    setModal(tipo); setMotivo(''); setMaquinaId(''); setVeiculoId('');
    setHorimetroInicial(''); setHorimetroFinal(''); setQuantidadeHoras('');
    try {
      const [m, v] = await Promise.all([
        api.get<{ itens: Maquina[] }>('/maquinas?disponiveis=1&por_pagina=100'),
        api.get<{ itens: Veiculo[] }>('/veiculos?disponiveis=1&por_pagina=100'),
      ]);
      setMaquinas(m.itens); setVeiculos(v.itens);
    } catch { /* opcional */ }
  }

  async function executar() {
    try {
      if (modal === 'iniciar') {
        await api.post(`/ordens/${id}/iniciar`, {
          maquina_id: maquinaId || undefined,
          horimetro_inicial: horimetroInicial ? Number(horimetroInicial) : undefined,
        });
      } else if (modal === 'pausar') {
        await api.post(`/ordens/${id}/pausar`, { motivo });
      } else if (modal === 'retomar') {
        await api.post(`/ordens/${id}/retomar`);
      } else if (modal === 'viagem') {
        await api.post(`/ordens/${id}/viagens`, {
          veiculo_id: veiculoId || undefined,
          origem: motivo,
          destino: 'Propriedade',
        });
      } else if (modal === 'horas') {
        await api.post(`/ordens/${id}/horas-adicionais`, {
          quantidade: Number(quantidadeHoras),
          justificativa: motivo,
        });
      } else if (modal === 'concluir') {
        await api.post(`/ordens/${id}/concluir`, {
          maquina_id: maquinaId || undefined,
          horimetro_final: horimetroFinal ? Number(horimetroFinal) : undefined,
          fim_em: new Date().toISOString(),
          servico_realizado: motivo,
        });
      }
      avisar('sucesso', 'Operação realizada.');
      setModal('');
      recarregar();
    } catch (e: any) { avisar('erro', e.message); }
  }

  if (erro) return <ErroEstado mensagem={erro} tentar={recarregar} />;
  if (!ordem) return null;

  const emExecucao = ['em_execucao', 'pausada'].includes(ordem.situacao);
  const podeExecutar = pode('govinfra.ordens.executar');
  const podeSolicitarHoras = pode('govinfra.horas_adicionais.solicitar');

  /* ── Timeline simulada ───────────────────────────────────────────────── */

  const timeline = [
    { quando: formatarData(ordem.data_prevista), texto: 'Ordem emitida', icone: FileText, cor: 'cinza' },
    ...(ordem.iniciada_em ? [{ quando: formatarDataHora(ordem.iniciada_em), texto: 'Serviço iniciado', icone: Play, cor: 'azul' }] : []),
    ...(ordem.pausada_em ? [{ quando: formatarDataHora(ordem.pausada_em), texto: 'Serviço pausado', icone: Pause, cor: 'laranja' }] : []),
    ...(ordem.concluida_em ? [{ quando: formatarDataHora(ordem.concluida_em), texto: 'Serviço concluído', icone: CheckCircle2, cor: 'verde' }] : []),
  ];

  return (
    <div>
      <button className="botao sutil" onClick={() => navegar('/govinfra/ordens')}>
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* ═══ CABEÇALHO ═══ */}
      <header className="cabecalho-pagina margem-topo">
        <div>
          <h1>Ordem {ordem.numero_formatado}</h1>
          <p>{ordem.tipo_servico || 'Serviço'} · {ordem.produtor || '—'}</p>
        </div>
        <div className="acoes-pagina">
          <Chip cor={corSituacao(ordem.situacao)}>{ordem.situacao_rotulo}</Chip>
          {ordem.url_consulta && (
            <a className="botao pequeno" href={ordem.url_consulta} target="_blank" rel="noreferrer">
              <QrCode size={14} /> Comprovante
            </a>
          )}
        </div>
      </header>

      {/* ═══ LAYOUT PRINCIPAL ═══ */}
      <div className="porteira-grid">
        <div className="porteira-principal">
          {/* ── Info ────────────────────────────────────────────────── */}
          <div className="detalhe-grade">
            <div className="detalhe-campo">
              <div className="rotulo"><UserCheck size={12} /> Produtor</div>
              <div className="valor">{ordem.produtor || '—'}</div>
            </div>
            <div className="detalhe-campo">
              <div className="rotulo"><MapPin size={12} /> Propriedade</div>
              <div className="valor">{ordem.propriedade || '—'}</div>
            </div>
            <div className="detalhe-campo">
              <div className="rotulo"><MapPin size={12} /> Endereço</div>
              <div className="valor">{ordem.endereco || '—'}</div>
            </div>
            <div className="detalhe-campo">
              <div className="rotulo"><Calendar size={12} /> Data prevista</div>
              <div className="valor">{formatarData(ordem.data_prevista)}</div>
            </div>
            <div className="detalhe-campo">
              <div className="rotulo"><Clock size={12} /> Horário</div>
              <div className="valor">{ordem.hora_prevista_inicio || '—'} – {ordem.hora_prevista_fim || '—'}</div>
            </div>
            <div className="detalhe-campo">
              <div className="rotulo"><Hash size={12} /> Horas autorizadas</div>
              <div className="valor">{ordem.horas_autorizadas}h</div>
            </div>
          </div>

          {/* ── Timeline ────────────────────────────────────────────── */}
          {timeline.length > 0 && (
            <section className="drawer-secao" style={{ marginTop: 8 }}>
              <div className="drawer-secao-titulo"><Clock size={13} /> Linha do tempo</div>
              <div className="drawer-timeline">
                {timeline.map((t, i) => (
                  <div key={i} className="drawer-timeline-item">
                    <span className={`drawer-timeline-ponto ${t.cor}`} />
                    <div className="drawer-timeline-conteudo">
                      <strong>{t.texto}</strong>
                      <small>{t.quando}</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Máquinas e veículos ─────────────────────────────────── */}
          {(ordem.maquinas.length > 0 || ordem.veiculos.length > 0) && (
            <section className="drawer-secao">
              <div className="drawer-secao-titulo">Recursos alocados</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ordem.maquinas.map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <Tractor size={15} style={{ color: 'var(--cinza-400)' }} />
                    <span style={{ flex: 1 }}>{m.recurso_nome || m.recurso_codigo}</span>
                    {m.principal && <Chip cor="azul">Principal</Chip>}
                    {m.medidor_inicial != null && <span style={{ fontSize: 11, color: 'var(--cinza-500)' }}>Horímetro ini: {m.medidor_inicial}</span>}
                  </div>
                ))}
                {ordem.veiculos.map((v) => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <Truck size={15} style={{ color: 'var(--cinza-400)' }} />
                    <span>{v.recurso_codigo || v.recurso_nome}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Descrição ───────────────────────────────────────────── */}
          {ordem.descricao && (
            <section className="drawer-secao">
              <div className="drawer-secao-titulo"><FileText size={13} /> Descrição do serviço</div>
              <p style={{ fontSize: 13, color: 'var(--cinza-700)', whiteSpace: 'pre-wrap', margin: 0 }}>{ordem.descricao}</p>
            </section>
          )}

          {/* ── Fotos ───────────────────────────────────────────────── */}
          <section className="drawer-secao">
            <div className="drawer-secao-titulo"><Camera size={13} /> Fotos da execução</div>
            <div className="cacambas-upload-area">
              <Camera size={28} />
              <div className="titulo">Nenhuma foto registrada</div>
              <div className="desc">Registre fotos do antes, durante e depois do serviço para prestação de contas.</div>
              <button type="button" className="botao pequeno margem-topo">
                <Upload size={13} /> Adicionar fotos
              </button>
            </div>
          </section>
        </div>

        {/* ── COLUNA DIREITA ────────────────────────────────────────────── */}
        <aside className="porteira-lateral">
          {/* ── Produção ─────────────────────────────────────────────── */}
          <div className="porteira-cartao">
            <div className="porteira-cartao-titulo"><Clock size={14} /> Produção</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--cinza-600)' }}>Horas produtivas</span>
                <strong>{ordem.horas_produtivas ?? '—'}h</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--cinza-600)' }}>Horas totais</span>
                <strong>{ordem.horas_totais ?? '—'}h</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--cinza-600)' }}>Diesel</span>
                <strong>{ordem.diesel_consumido_litros ?? 0} L</strong>
              </div>
              {ordem.custo_estimado != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderTop: '1px solid var(--cinza-100)', paddingTop: 8 }}>
                  <span style={{ color: 'var(--cinza-600)' }}>Custo estimado</span>
                  <strong style={{ color: 'var(--verde-700)' }}>
                    R$ {ordem.custo_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              )}
            </div>
          </div>

          {/* ── Ações de execução ─────────────────────────────────────── */}
          {podeExecutar && (emExecucao || ordem.situacao === 'emitida') && (
            <div className="porteira-cartao">
              <div className="porteira-cartao-titulo"><Wrench size={14} /> Execução</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ordem.situacao === 'emitida' && (
                  <button className="drawer-acao primario" onClick={() => abrirModal('iniciar')}>
                    <Play size={14} /> Iniciar serviço
                  </button>
                )}
                {ordem.situacao === 'em_execucao' && (
                  <button className="drawer-acao" onClick={() => abrirModal('pausar')}>
                    <Pause size={14} /> Pausar
                  </button>
                )}
                {ordem.situacao === 'pausada' && (
                  <button className="drawer-acao primario" onClick={() => { setModal('retomar'); }}>
                    <Play size={14} /> Retomar
                  </button>
                )}
                {emExecucao && (
                  <button className="drawer-acao" onClick={() => abrirModal('viagem')}>
                    <Truck size={14} /> Registrar viagem
                  </button>
                )}
                {emExecucao && podeSolicitarHoras && (
                  <button className="drawer-acao" onClick={() => abrirModal('horas')}>
                    <Plus size={14} /> Solicitar horas extras
                  </button>
                )}
                {emExecucao && (
                  <button className="drawer-acao" onClick={() => abrirModal('concluir')}>
                    <CheckCircle2 size={14} /> Concluir
                  </button>
                )}
                {ordem.situacao === 'emitida' && (
                  <button className="drawer-acao perigo" onClick={() => abrirModal('cancelar')}>
                    <X size={14} /> Cancelar ordem
                  </button>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ═══ MODAIS ═══ */}
      {modal === 'retomar' && (
        <Modal titulo="Retomar serviço" fechar={() => setModal('')} rodape={
          <div className="modal-rodape-acoes"><button className="botao" onClick={() => setModal('')}>Cancelar</button><button className="botao principal" onClick={executar}>Retomar</button></div>
        }><p>O cronômetro do serviço será reiniciado.</p></Modal>
      )}

      {modal === 'iniciar' && (
        <Modal titulo="Iniciar serviço" fechar={() => setModal('')} rodape={
          <div className="modal-rodape-acoes"><button className="botao" onClick={() => setModal('')}>Cancelar</button><button className="botao principal" onClick={executar}>Iniciar</button></div>
        }>
          <div className="campo"><label>Máquina</label><select value={maquinaId} onChange={(e) => setMaquinaId(e.target.value)}><option value="">Selecione…</option>{maquinas.map((m) => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}</select></div>
          <div className="campo margem-topo"><label>Horímetro inicial</label><input type="number" value={horimetroInicial} onChange={(e) => setHorimetroInicial(e.target.value)} /></div>
        </Modal>
      )}

      {modal === 'pausar' && (
        <Modal titulo="Pausar serviço" fechar={() => setModal('')} rodape={
          <div className="modal-rodape-acoes"><button className="botao" onClick={() => setModal('')}>Cancelar</button><button className="botao principal" onClick={executar}>Pausar</button></div>
        }>
          <div className="campo"><label>Motivo da pausa *</label><select value={motivo} onChange={(e) => setMotivo(e.target.value)}><option value="">Selecione…</option><option>Chuva</option><option>Quebra de equipamento</option><option>Falta de combustível</option><option>Almoço</option><option>Aguardando material</option><option>Impedimento no local</option><option>Outro</option></select></div>
        </Modal>
      )}

      {modal === 'viagem' && (
        <Modal titulo="Registrar viagem" fechar={() => setModal('')} rodape={
          <div className="modal-rodape-acoes"><button className="botao" onClick={() => setModal('')}>Cancelar</button><button className="botao principal" onClick={executar}>Registrar</button></div>
        }>
          <div className="campo"><label>Caminhão</label><select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}><option value="">Selecione…</option>{veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {v.nome}</option>)}</select></div>
          <div className="campo margem-topo"><label>Material / origem</label><input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        </Modal>
      )}

      {modal === 'horas' && (
        <Modal titulo="Solicitar horas adicionais" fechar={() => setModal('')} rodape={
          <div className="modal-rodape-acoes"><button className="botao" onClick={() => setModal('')}>Cancelar</button><button className="botao principal" disabled={!quantidadeHoras || !motivo} onClick={executar}>Solicitar</button></div>
        }>
          <div className="campo"><label>Quantidade de horas *</label><input type="number" min="0.5" step="0.5" value={quantidadeHoras} onChange={(e) => setQuantidadeHoras(e.target.value)} /></div>
          <div className="campo margem-topo"><label>Justificativa *</label><textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        </Modal>
      )}

      {modal === 'concluir' && (
        <Modal titulo="Concluir serviço" fechar={() => setModal('')} rodape={
          <div className="modal-rodape-acoes"><button className="botao" onClick={() => setModal('')}>Cancelar</button><button className="botao principal" onClick={executar}>Concluir</button></div>
        }>
          <div className="campo"><label>Máquina</label><select value={maquinaId} onChange={(e) => setMaquinaId(e.target.value)}><option value="">Selecione…</option>{ordem.maquinas.map((m) => <option key={m.id} value={m.recurso_id}>{m.recurso_nome || m.recurso_codigo || m.recurso_id}</option>)}</select></div>
          <div className="campo margem-topo"><label>Horímetro final</label><input type="number" value={horimetroFinal} onChange={(e) => setHorimetroFinal(e.target.value)} /></div>
          <div className="campo margem-topo"><label>Serviço realizado</label><textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        </Modal>
      )}

      {modal === 'cancelar' && (
        <Modal titulo="Cancelar ordem" fechar={() => setModal('')} rodape={
          <div className="modal-rodape-acoes"><button className="botao" onClick={() => setModal('')}>Voltar</button><button className="botao perigo" onClick={async () => {
            try { await api.post(`/ordens/${id}/cancelar`, { motivo: 'Cancelamento registrado' }); avisar('sucesso', 'Ordem cancelada.'); setModal(''); recarregar(); } catch (e: any) { avisar('erro', e.message); }
          }}>Cancelar ordem</button></div>
        }><p>O cancelamento exige registro em auditoria.</p></Modal>
      )}
    </div>
  );
}
