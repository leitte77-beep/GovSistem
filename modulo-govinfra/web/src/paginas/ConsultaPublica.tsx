import { HardHat } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { Carregando, Chip } from '../componentes/Comuns';
import { corSituacao, formatarData } from '../utils';

type Consulta = {
  ordem: {
    numero: string;
    situacao: string;
    situacao_rotulo: string;
    data_prevista: string;
    hora_prevista_inicio?: string | null;
    hora_prevista_fim?: string | null;
    servico?: string | null;
    descricao?: string | null;
    horas_autorizadas: number;
    concluida_em?: string | null;
    municipio?: string | null;
  };
};

export function ConsultaPublica() {
  const { token } = useParams();
  const [dados, setDados] = useState<Consulta | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.publico<Consulta>(`/consulta/${token}`)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [token]);

  if (erro) {
    return <main className="tela-login"><section className="caixa-login">
      <div className="marca-login"><HardHat size={34}/><span>Gov<span className="destaque">Infra</span></span></div>
      <h1>Consulta não encontrada</h1>
      <p className="subtitulo">Verifique o QR Code ou o link informado. Nenhum dado sensível é exibido nesta página.</p>
    </section></main>;
  }
  if (!dados) return <main className="tela-login"><Carregando texto="Consultando a ordem…"/></main>;

  const o = dados.ordem;
  return <main className="tela-login"><section className="caixa-login">
    <div className="marca-login"><HardHat size={34}/><span>Gov<span className="destaque">Infra</span></span></div>
    <h1>Ordem de serviço {o.numero}</h1>
    <div className="detalhe-grade" style={{ textAlign: 'left' }}>
      <div className="detalhe-campo"><div className="rotulo">Serviço</div><div className="valor">{o.servico || '—'}</div></div>
      <div className="detalhe-campo"><div className="rotulo">Situação</div><div className="valor"><Chip cor={corSituacao(o.situacao)}>{o.situacao_rotulo}</Chip></div></div>
      <div className="detalhe-campo"><div className="rotulo">Data prevista</div><div className="valor">{formatarData(o.data_prevista)}</div></div>
      <div className="detalhe-campo"><div className="rotulo">Horário</div><div className="valor">{o.hora_prevista_inicio || '—'} – {o.hora_prevista_fim || '—'}</div></div>
      <div className="detalhe-campo"><div className="rotulo">Horas autorizadas</div><div className="valor">{o.horas_autorizadas}h</div></div>
      <div className="detalhe-campo"><div className="rotulo">Descrição</div><div className="valor">{o.descricao || '—'}</div></div>
    </div>
    <p className="rodape-login margem-topo">Consulta pública sem dados pessoais. Dúvidas: procure a Secretaria Municipal de Infraestrutura.</p>
  </section></main>;
}
