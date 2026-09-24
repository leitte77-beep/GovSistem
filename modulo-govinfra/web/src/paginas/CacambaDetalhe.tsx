import {
  ArrowLeft, Calendar, ClipboardList, Clock, History,
  MapPin, Pencil, QrCode, Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { Carregando, Chip, ErroEstado, Modal, Paginacao } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import type { Cacamba, Paginado } from '../types';
import { corSituacao, formatarData, formatarDataHora, iconeSituacao, rotuloCurto } from '../utils';

const ICONES: Record<string, React.FC<{ size?: number }>> = {
  CheckCircle2: Calendar, Truck: MapPin, Wrench, Clock, Calendar,
  MapPin, QrCode, History, ClipboardList,
} as any;

function IconeSituacao({ situacao, size = 14 }: { situacao: string; size?: number }) {
  const nome = iconeSituacao(situacao);
  const Comp = ICONES[nome] || Calendar;
  return <Comp size={size} />;
}

export function CacambaDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { pode } = useSessao();
  const { avisar } = useAviso();
  const [cacamba, setCacamba] = useState<Cacamba | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<Paginado<any> | null>(null);
  const [erro, setErro] = useState('');
  const [mudando, setMudando] = useState('');
  const [motivo, setMotivo] = useState('');
  const [historico, setHistorico] = useState(false);
  const [paginaHist, setPaginaHist] = useState(1);

  useEffect(() => {
    api.get<Cacamba>(`/cacambas/${id}`).then(setCacamba).catch((e) => setErro(e.message));
    api.get<Paginado<any>>(`/cacambas/${id}/movimentacoes?por_pagina=20`).then(setMovimentacoes).catch(() => undefined);
  }, [id]);

  if (erro) return <ErroEstado mensagem={erro} tentar={() => window.location.reload()} />;
  if (!cacamba) return <Carregando />;

  async function mudarSituacao(situacao: string) {
    try {
      await api.post(`/cacambas/${id}/situacao`, { situacao, motivo, localizacao: cacamba!.localizacao_atual || undefined });
      avisar('sucesso', `Caçamba marcada como ${situacao.replaceAll('_', ' ')}.`);
      setMudando(''); setMotivo('');
      const atualizada = await api.get<Cacamba>(`/cacambas/${id}`);
      setCacamba(atualizada);
      api.get<Paginado<any>>(`/cacambas/${id}/movimentacoes?por_pagina=20`).then(setMovimentacoes).catch(() => undefined);
    } catch (e: any) { avisar('erro', e.message); }
  }

  async function carregarHistorico(pagina: number) {
    setPaginaHist(pagina);
    api.get<Paginado<any>>(`/cacambas/${id}/movimentacoes?pagina=${pagina}&por_pagina=20`)
      .then(setMovimentacoes).catch(() => undefined);
  }

  const transicoes: Record<string, { rotulo: string; destino: string }[]> = {
    disponivel: [
      { rotulo: 'Reservar', destino: 'reservada' },
      { rotulo: 'Enviar para limpeza', destino: 'em_limpeza' },
      { rotulo: 'Abrir manutenção', destino: 'em_manutencao' },
      { rotulo: 'Enviar para vistoria', destino: 'em_vistoria' },
      { rotulo: 'Marcar indisponível', destino: 'indisponivel' },
    ],
    reservada: [
      { rotulo: 'Liberar reserva', destino: 'disponivel' },
      { rotulo: 'Ag. entrega', destino: 'aguardando_entrega' },
    ],
    aguardando_entrega: [
      { rotulo: 'Iniciar transporte', destino: 'em_transporte_entrega' },
      { rotulo: 'Cancelar', destino: 'disponivel' },
    ],
    em_transporte_entrega: [
      { rotulo: 'Confirmar entrega', destino: 'em_uso' },
      { rotulo: 'Cancelar', destino: 'disponivel' },
    ],
    em_uso: [
      { rotulo: 'Solicitar retirada', destino: 'aguardando_retirada' },
    ],
    aguardando_retirada: [
      { rotulo: 'Iniciar retirada', destino: 'em_transporte_retorno' },
      { rotulo: 'Voltar para uso', destino: 'em_uso' },
    ],
    em_transporte_retorno: [
      { rotulo: 'Chegou ao pátio', destino: 'disponivel' },
      { rotulo: 'Enviar para limpeza', destino: 'em_limpeza' },
      { rotulo: 'Enviar para vistoria', destino: 'em_vistoria' },
      { rotulo: 'Abrir manutenção', destino: 'em_manutencao' },
      { rotulo: 'Marcar indisponível', destino: 'indisponivel' },
    ],
    em_limpeza: [
      { rotulo: 'Liberar', destino: 'disponivel' },
      { rotulo: 'Enviar para vistoria', destino: 'em_vistoria' },
      { rotulo: 'Abrir manutenção', destino: 'em_manutencao' },
    ],
    em_vistoria: [
      { rotulo: 'Liberar', destino: 'disponivel' },
      { rotulo: 'Abrir manutenção', destino: 'em_manutencao' },
      { rotulo: 'Marcar indisponível', destino: 'indisponivel' },
    ],
    em_manutencao: [
      { rotulo: 'Liberar', destino: 'disponivel' },
      { rotulo: 'Marcar indisponível', destino: 'indisponivel' },
      { rotulo: 'Enviar para vistoria', destino: 'em_vistoria' },
    ],
    indisponivel: [
      { rotulo: 'Liberar', destino: 'disponivel' },
      { rotulo: 'Abrir manutenção', destino: 'em_manutencao' },
    ],
  };

  const opcoes = transicoes[cacamba.situacao] || [{ rotulo: 'Liberar', destino: 'disponivel' }];

  return (
    <div>
      <button className="botao sutil" onClick={() => navegar('/govinfra/cacambas')}>
        <ArrowLeft size={16} /> Voltar
      </button>

      <header className="cabecalho-pagina margem-topo">
        <div>
          <h1>Caçamba {cacamba.codigo}</h1>
          <p>{cacamba.identificacao_visual || cacamba.modelo || cacamba.tipo || '—'}</p>
        </div>
        <div className="acoes-pagina">
          <Chip cor={corSituacao(cacamba.situacao)}>
            <IconeSituacao situacao={cacamba.situacao} size={12} />
            {cacamba.situacao_rotulo}
          </Chip>
          {pode('govinfra.cacambas.movimentar') && (
            <button className="botao" onClick={() => setMudando(cacamba.situacao)}>
              Alterar situação
            </button>
          )}
          <button className="botao" onClick={() => setHistorico(true)}>
            <History size={16} /> Histórico
          </button>
        </div>
      </header>

      {/* Status e alertas */}
      {cacamba.solicitacao_atual?.atrasada && (
        <div className="aviso erro margem-baixo">
          <Clock size={18} />
          <div className="texto">
            <div className="titulo">Retirada atrasada</div>
            Retirada prevista para {formatarData(cacamba.solicitacao_atual.data_prevista_retirada)} — {cacamba.dias_em_uso} dias em uso
          </div>
        </div>
      )}
      {cacamba.situacao === 'em_manutencao' && (
        <div className="aviso atencao margem-baixo">
          <Wrench size={18} />
          <div className="texto">
            <div className="titulo">Caçamba em manutenção</div>
            Bloqueada para novos agendamentos até ser liberada.
          </div>
        </div>
      )}

      {/* Detalhes */}
      <div className="detalhe-grade">
        <div className="detalhe-campo">
          <div className="rotulo">Patrimônio</div>
          <div className="valor">{cacamba.patrimonio || '—'}</div>
        </div>
        <div className="detalhe-campo">
          <div className="rotulo">Capacidade</div>
          <div className="valor">{cacamba.capacidade_m3 ? `${cacamba.capacidade_m3} m³` : '—'}</div>
        </div>
        <div className="detalhe-campo">
          <div className="rotulo">Tipo</div>
          <div className="valor">{cacamba.tipo || '—'}</div>
        </div>
        <div className="detalhe-campo">
          <div className="rotulo">Modelo</div>
          <div className="valor">{cacamba.modelo || '—'}</div>
        </div>
        <div className="detalhe-campo">
          <div className="rotulo">Estado de conservação</div>
          <div className="valor">{cacamba.estado_conservacao || '—'}</div>
        </div>
        <div className="detalhe-campo">
          <div className="rotulo">Localização padrão</div>
          <div className="valor">
            <MapPin size={13} style={{ marginRight: 4 }} />
            {cacamba.localizacao_padrao || '—'}
          </div>
        </div>
        <div className="detalhe-campo">
          <div className="rotulo">Localização atual</div>
          <div className="valor">{cacamba.localizacao_atual || '—'}</div>
        </div>
        <div className="detalhe-campo">
          <div className="rotulo">Última vistoria</div>
          <div className="valor">{formatarData((cacamba as any).ultima_vistoria_em)}</div>
        </div>
        <div className="detalhe-campo">
          <div className="rotulo">Próxima vistoria</div>
          <div className="valor">{formatarData(cacamba.proxima_vistoria_em)}</div>
        </div>
        <div className="detalhe-campo">
          <div className="rotulo">QR Code</div>
          <div className="valor">
            {cacamba.qr_code ? (
              <a href={`/consulta/${cacamba.qr_code}`} target="_blank" rel="noreferrer">
                <QrCode size={14} /> ver
              </a>
            ) : '—'}
          </div>
        </div>
      </div>

      {/* Ações rápidas */}
      {pode('govinfra.cacambas.movimentar') && (
        <section className="secao-painel margem-topo">
          <h2>Ações rápidas</h2>
          <div className="barra-acoes">
            {opcoes.map((a) => (
              <button
                key={a.destino}
                className="botao"
                onClick={() => {
                  const promptMotivo = window.prompt(`Motivo para "${a.rotulo}":`);
                  if (promptMotivo === null) return;
                  setMotivo(promptMotivo);
                  mudarSituacao(a.destino);
                }}
              >
                <IconeSituacao situacao={a.destino} size={14} />
                {a.rotulo}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Uso atual */}
      {cacamba.solicitacao_atual && (
        <section className="secao-painel">
          <h2>Uso atual</h2>
          <div className="detalhe-grade">
            <div className="detalhe-campo">
              <div className="rotulo">Protocolo</div>
              <div className="valor">{cacamba.solicitacao_atual.protocolo}</div>
            </div>
            <div className="detalhe-campo">
              <div className="rotulo">Endereço</div>
              <div className="valor">{cacamba.solicitacao_atual.endereco || '—'}</div>
            </div>
            <div className="detalhe-campo">
              <div className="rotulo">Dias em uso</div>
              <div className="valor">{cacamba.dias_em_uso ?? '—'}</div>
            </div>
            <div className="detalhe-campo">
              <div className="rotulo">Retirada prevista</div>
              <div className="valor">{formatarData(cacamba.solicitacao_atual.data_prevista_retirada)}</div>
            </div>
          </div>
        </section>
      )}

      {/* Histórico de movimentações */}
      {movimentacoes && movimentacoes.total > 0 && (
        <section className="secao-painel">
          <h2>Últimas movimentações</h2>
          <div className="tabela-envolve">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>De</th>
                  <th>Para</th>
                  <th>Motivo</th>
                  <th>Localização</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.itens.map((m: any) => (
                  <tr key={m.id}>
                    <td>{formatarDataHora(m.created_at || m.criada_em)}</td>
                    <td>
                      <Chip cor={m.situacao_anterior ? corSituacao(m.situacao_anterior) : 'cinza'}>
                        {m.situacao_anterior ? rotuloCurto(m.situacao_anterior) : '—'}
                      </Chip>
                    </td>
                    <td>
                      <Chip cor={corSituacao(m.situacao_nova)}>
                        {rotuloCurto(m.situacao_nova)}
                      </Chip>
                    </td>
                    <td>{m.motivo || '—'}</td>
                    <td>{m.localizacao_nova || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao
            pagina={movimentacoes.pagina}
            paginas={movimentacoes.paginas}
            mudar={carregarHistorico}
          />
        </section>
      )}

      {/* Observações */}
      {cacamba.observacoes && (
        <section className="secao-painel">
          <h2>Observações</h2>
          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--cinza-700)', fontSize: '13px' }}>{cacamba.observacoes}</p>
        </section>
      )}

      {/* Modal de alteração de situação */}
      {mudando && (
        <Modal
          titulo={`Alterar situação (atual: ${cacamba.situacao_rotulo})`}
          fechar={() => setMudando('')}
          rodape={
            <div className="modal-rodape-acoes">
              <button className="botao" onClick={() => setMudando('')}>Cancelar</button>
              <button
                className="botao principal"
                onClick={() => mudarSituacao(mudando)}
                disabled={mudando === cacamba.situacao}
              >
                Confirmar
              </button>
            </div>
          }
        >
          <div className="campo">
            <label>Nova situação</label>
            <select value={mudando} onChange={(e) => setMudando(e.target.value)}>
              {opcoes.map((a) => (
                <option key={a.destino} value={a.destino}>{a.rotulo}</option>
              ))}
            </select>
          </div>
          <div className="campo margem-topo">
            <label>Motivo / observação</label>
            <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </Modal>
      )}

      {/* Modal de histórico completo */}
      {historico && (
        <Modal titulo="Histórico completo de movimentações" fechar={() => setHistorico(false)} largo>
          {movimentacoes && movimentacoes.itens.length === 0 ? (
            <p className="texto-sutil">Nenhuma movimentação registrada.</p>
          ) : null}
          {movimentacoes && (
            <div className="tabela-envolve">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>De</th>
                    <th>Para</th>
                    <th>Motivo</th>
                    <th>Usuário</th>
                    <th>Localização</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentacoes.itens.map((m: any) => (
                    <tr key={m.id}>
                      <td>{formatarDataHora(m.created_at || m.criada_em)}</td>
                      <td>{rotuloCurto(m.situacao_anterior) || '—'}</td>
                      <td>{rotuloCurto(m.situacao_nova)}</td>
                      <td>{m.motivo || '—'}</td>
                      <td>{m.usuario || '—'}</td>
                      <td>{m.localizacao_nova || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {movimentacoes && (
            <Paginacao
              pagina={movimentacoes.pagina}
              paginas={movimentacoes.paginas}
              mudar={carregarHistorico}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
