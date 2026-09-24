import { ArrowLeft, CheckCircle2, ClipboardList, MapPin, Truck, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { CabecalhoPagina, Carregando, Chip, ErroEstado, Modal } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import type { Cacamba, SolicitacaoCacamba, Veiculo } from '../types';
import { corSituacao, formatarData, formatarDataHora, formatarTelefone, rotuloSituacao } from '../utils';

export function SolicitacaoDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { pode } = useSessao();
  const { avisar } = useAviso();
  const [solicitacao, setSolicitacao] = useState<SolicitacaoCacamba | null>(null);
  const [erro, setErro] = useState('');
  const [acao, setAcao] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [dataAgendada, setDataAgendada] = useState('');
  const [cacambaId, setCacambaId] = useState('');
  const [veiculoId, setVeiculoId] = useState('');
  const [cacambas, setCacambas] = useState<Cacamba[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [recursosObrigatorios, setRecursosObrigatorios] = useState({ cacamba: false, veiculo: false });
  const [recomendacoes, setRecomendacoes] = useState<any[]>([]);
  const [buscaPessoa, setBuscaPessoa] = useState('');
  const [pessoasEncontradas, setPessoasEncontradas] = useState<any[]>([]);
  const [bloqueios, setBloqueios] = useState<any[]>([]);
  const [enviando, setEnviando] = useState(false);

  function recarregar() {
    api.get<SolicitacaoCacamba>(`/solicitacoes/${id}`).then(setSolicitacao).catch((e) => setErro(e.message));
  }

  useEffect(() => { recarregar(); /* eslint-disable-next-line */ }, [id]);

  async function abrirAcao(tipo: string) {
    setAcao(tipo);
    setJustificativa('');
    if (tipo === 'agendar' || tipo === 'entrega' || tipo === 'retirada') {
      try {
        const [cacambasResposta, veiculosResposta] = await Promise.all([
          api.get<{ itens: Cacamba[] }>('/cacambas?disponiveis=1&por_pagina=100'),
          api.get<{ itens: Veiculo[] }>('/veiculos?disponiveis=1&por_pagina=100'),
        ]);
        setCacambas(cacambasResposta.itens);
        setVeiculos(veiculosResposta.itens);
      } catch { /* recursos opcionais */ }
    }
    if (tipo === 'agendar') {
      try {
        const resposta = await api.post<any>('/solicitacoes/recomendar-datas', {
          data_preferida: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
          dias_uso: solicitacao?.dias_previstos || 3,
          quantidade: 3,
        });
        setRecomendacoes(resposta.opcoes || []);
        if (resposta.opcoes?.[0]?.data) setDataAgendada(resposta.opcoes[0].data);
      } catch { /* recomendação é um auxílio */ }
    }
  }

  async function executarAcao() {
    setEnviando(true);
    try {
      if (acao === 'aprovar') {
        await api.post(`/solicitacoes/${id}/aprovar`, {});
        avisar('sucesso', 'Solicitação aprovada.');
      } else if (acao === 'reprovar') {
        await api.post(`/solicitacoes/${id}/reprovar`, { motivo: justificativa });
        avisar('sucesso', 'Solicitação reprovada.');
      } else if (acao === 'cancelar') {
        await api.post(`/solicitacoes/${id}/cancelar`, { motivo: justificativa });
        avisar('sucesso', 'Solicitação cancelada.');
      } else if (acao === 'agendar') {
        await api.post(`/solicitacoes/${id}/agendar`, {
          data_agendada: dataAgendada,
          dias_previstos: solicitacao?.dias_previstos || 3,
          cacamba_id: cacambaId || undefined,
          veiculo_id: veiculoId || undefined,
          justificativa: justificativa || undefined,
        });
        avisar('sucesso', 'Agendamento confirmado.');
      } else if (acao === 'entrega') {
        await api.post(`/solicitacoes/${id}/entrega`, {
          cacamba_id: cacambaId || undefined,
          veiculo_id: veiculoId || undefined,
          entregue_em: new Date().toISOString(),
          contingencia: !cacambaId || !veiculoId,
          justificativa_contingencia: (!cacambaId || !veiculoId) ? (justificativa || 'Operação de contingência') : undefined,
        });
        avisar('sucesso', 'Entrega registrada. A caçamba está em uso.');
      } else if (acao === 'retirada') {
        await api.post(`/solicitacoes/${id}/retirada`, {
          veiculo_id: veiculoId || undefined,
          retirada_em: new Date().toISOString(),
          destino_cacamba: 'limpeza',
        });
        avisar('sucesso', 'Retirada registrada.');
      }
      setAcao('');
      recarregar();
    } catch (e: any) { avisar('erro', e.message); }
    finally { setEnviando(false); }
  }

  async function buscarPessoa() {
    if (buscaPessoa.trim().length < 2) return;
    try {
      const resposta = await api.get<{ itens: any[] }>(`/pessoas?termo=${encodeURIComponent(buscaPessoa)}&por_pagina=10`);
      setPessoasEncontradas(resposta.itens);
    } catch (e: any) { avisar('erro', e.message); }
  }

  async function verificarBloqueios(pessoaId: string) {
    try {
      const resposta = await api.get<any>(`/bloqueios/verificar?pessoa_id=${pessoaId}&servico=cacambas`);
      setBloqueios(resposta.impedimentos || []);
    } catch { setBloqueios([]); }
  }

  if (erro) return <ErroEstado mensagem={erro} tentar={recarregar}/>;
  if (!solicitacao) return <Carregando/>;

  const situacao = solicitacao.situacao;
  const podeAprovar = pode('govinfra.solicitacoes.aprovar') && ['pendente', 'em_analise', 'aguardando_documentos'].includes(situacao);
  const podeReprovar = pode('govinfra.solicitacoes.reprovar') && ['pendente', 'em_analise', 'aguardando_documentos'].includes(situacao);
  const podeCancelar = pode('govinfra.solicitacoes.cancelar') && !['concluida', 'cancelada'].includes(situacao);
  const podeAgendar = pode('govinfra.agenda.agendar') && ['aprovada', 'aguardando_agendamento', 'agendada'].includes(situacao);
  const podeEntregar = pode('govinfra.entregas.registrar') && ['agendada', 'aguardando_entrega', 'em_transporte'].includes(situacao);
  const podeRetirar = pode('govinfra.retiradas.registrar') && ['em_uso', 'aguardando_retirada', 'em_retirada'].includes(situacao);

  return <div>
    <button className="botao sutil" onClick={() => navegar('/govinfra/solicitacoes')}><ArrowLeft size={16}/> Voltar</button>
    <CabecalhoPagina
      titulo={`Solicitação ${solicitacao.protocolo_formatado}`}
      descricao={`Protocolo de ${formatarDataHora(solicitacao.created_at)}`}
      acoes={<Chip cor={corSituacao(situacao)}>{solicitacao.situacao_rotulo}</Chip>}
    />

    {solicitacao.atrasada && <div className="aviso erro"><XCircle size={18}/><div className="texto">Esta solicitação está atrasada há {solicitacao.dias_atraso} dia(s).</div></div>}

    <section className="secao-painel"><h2><ClipboardList size={18}/> Solicitante e local</h2>
      <div className="detalhe-grade">
        <div className="detalhe-campo"><div className="rotulo">Solicitante</div><div className="valor">{solicitacao.solicitante || '—'}</div></div>
        <div className="detalhe-campo"><div className="rotulo">Telefone</div><div className="valor">{formatarTelefone(solicitacao.pessoa?.telefone)}</div></div>
        <div className="detalhe-campo"><div className="rotulo">Endereço de instalação</div><div className="valor">{[solicitacao.logradouro, solicitacao.numero, solicitacao.bairro].filter(Boolean).join(', ') || '—'}</div></div>
        <div className="detalhe-campo"><div className="rotulo">Imóvel</div><div className="valor">{solicitacao.imovel?.nome || '—'}</div></div>
        <div className="detalhe-campo"><div className="rotulo">Prioridade</div><div className="valor">{solicitacao.prioridade}</div></div>
        <div className="detalhe-campo"><div className="rotulo">Resíduo</div><div className="valor">{solicitacao.tipo_residuo || '—'}</div></div>
        <div className="detalhe-campo"><div className="rotulo">Material</div><div className="valor">{solicitacao.descricao_material || '—'}</div></div>
        <div className="detalhe-campo"><div className="rotulo">Quantidade estimada</div><div className="valor">{solicitacao.quantidade_estimada_m3 ? `${solicitacao.quantidade_estimada_m3} m³` : '—'}</div></div>
      </div>
    </section>

    <section className="secao-painel"><h2><Truck size={18}/> Agendamento e recursos</h2>
      <div className="detalhe-grade">
        <div className="detalhe-campo"><div className="rotulo">Data desejada</div><div className="valor">{formatarData(solicitacao.data_agendada || solicitacao.data_prevista_entrega)}</div></div>
        <div className="detalhe-campo"><div className="rotulo">Data prevista de entrega</div><div className="valor">{formatarData(solicitacao.data_prevista_entrega)}</div></div>
        <div className="detalhe-campo"><div className="rotulo">Data prevista de retirada</div><div className="valor">{formatarData(solicitacao.data_prevista_retirada)}</div></div>
        <div className="detalhe-campo"><div className="rotulo">Caçamba</div><div className="valor">{solicitacao.cacamba_codigo || '—'}</div></div>
        <div className="detalhe-campo"><div className="rotulo">Caminhão</div><div className="valor">{solicitacao.veiculo_placa || '—'}</div></div>
      </div>
    </section>

    <section className="secao-painel">
      <h2>Ações</h2>
      <div className="acoes-pagina">
        {podeAprovar && <button className="botao principal" onClick={() => abrirAcao('aprovar')}><CheckCircle2 size={16}/> Aprovar</button>}
        {podeReprovar && <button className="botao perigo" onClick={() => abrirAcao('reprovar')}><XCircle size={16}/> Reprovar</button>}
        {podeAgendar && <button className="botao" onClick={() => abrirAcao('agendar')}><MapPin size={16}/> {situacao === 'agendada' ? 'Reagendar' : 'Agendar'}</button>}
        {podeEntregar && <button className="botao" onClick={() => abrirAcao('entrega')}><Truck size={16}/> Registrar entrega</button>}
        {podeRetirar && <button className="botao" onClick={() => abrirAcao('retirada')}><Truck size={16}/> Registrar retirada</button>}
        {podeCancelar && <button className="botao perigo" onClick={() => abrirAcao('cancelar')}>Cancelar solicitação</button>}
      </div>
    </section>

    <section className="secao-painel"><h2>Verificar elegibilidade de novo atendimento</h2>
      <div className="barra-filtros">
        <input value={buscaPessoa} onChange={(e) => setBuscaPessoa(e.target.value)} placeholder="Buscar pessoa por nome ou CPF…"/>
        <button className="botao" onClick={buscarPessoa}>Consultar</button>
      </div>
      {pessoasEncontradas.map((p) => (
        <div key={p.id} className="alerta-item info">
          <div className="texto"><div className="titulo">{p.nome}</div>
            <button className="botao pequeno margem-topo" onClick={() => verificarBloqueios(p.id)}>Verificar bloqueios e pendências</button>
          </div>
        </div>
      ))}
      {bloqueios.length > 0 && <div className="aviso-regras"><strong>Impedimentos encontrados:</strong><ul>{bloqueios.map((b, i) => <li key={i}>{b.mensagem}</li>)}</ul></div>}
      {bloqueios.length === 0 && pessoasEncontradas.length > 0 && <p className="texto-sutil">Nenhum impedimento encontrado.</p>}
    </section>

    {acao === 'aprovar' && <Modal titulo="Confirmar aprovação" fechar={() => setAcao('')} rodape={<div className="modal-rodape-acoes"><button className="botao" onClick={() => setAcao('')}>Cancelar</button><button className="botao principal" disabled={enviando} onClick={executarAcao}>Aprovar</button></div>}>
      <p>A solicitação será liberada para agendamento.</p>
    </Modal>}

    {acao === 'reprovar' && <Modal titulo="Reprovar solicitação" fechar={() => setAcao('')} rodape={<div className="modal-rodape-acoes"><button className="botao" onClick={() => setAcao('')}>Cancelar</button><button className="botao perigo" disabled={enviando || !justificativa} onClick={executarAcao}>Reprovar</button></div>}>
      <div className="campo"><label>Motivo da reprovação *</label><textarea rows={3} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} required/></div>
    </Modal>}

    {acao === 'cancelar' && <Modal titulo="Cancelar solicitação" fechar={() => setAcao('')} rodape={<div className="modal-rodape-acoes"><button className="botao" onClick={() => setAcao('')}>Voltar</button><button className="botao perigo" disabled={enviando || !justificativa} onClick={executarAcao}>Cancelar solicitação</button></div>}>
      <div className="campo"><label>Motivo do cancelamento *</label><textarea rows={3} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} required/></div>
    </Modal>}

    {acao === 'agendar' && <Modal titulo="Agendar entrega" fechar={() => setAcao('')} largo rodape={<div className="modal-rodape-acoes"><button className="botao" onClick={() => setAcao('')}>Cancelar</button><button className="botao principal" disabled={enviando || !dataAgendada} onClick={executarAcao}>Confirmar agendamento</button></div>}>
      {recomendacoes.length > 0 && <div className="secao-painel"><h2>Datas recomendadas</h2>
        <div className="grade-painel">{recomendacoes.map((opcao) => (
          <button type="button" key={opcao.data} className={`opcao-data ${opcao.data === dataAgendada ? 'recomendada' : ''}`} onClick={() => setDataAgendada(opcao.data)}>
            <div className="data">{formatarData(opcao.data)}</div>
            <div className="pontos">Pontuação {opcao.pontuacao} · confiança {opcao.confianca}%</div>
            {opcao.motivos_favoraveis.length > 0 && <div className="motivos">✓ {opcao.motivos_favoraveis.join('; ')}</div>}
            {opcao.alertas.length > 0 && <div className="motivos">⚠ {opcao.alertas.join('; ')}</div>}
          </button>
        ))}</div>
      </div>}
      <div className="campo margem-topo"><label>Data agendada *</label><input type="date" value={dataAgendada} onChange={(e) => setDataAgendada(e.target.value)}/></div>
      <div className="form-grade margem-topo">
        <div className="campo"><label>Caçamba</label><select value={cacambaId} onChange={(e) => setCacambaId(e.target.value)}><option value="">— sugerir automaticamente —</option>{cacambas.map((c) => <option key={c.id} value={c.id}>{c.codigo} ({c.situacao_rotulo})</option>)}</select></div>
        <div className="campo"><label>Caminhão</label><select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}><option value="">— sugerir automaticamente —</option>{veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {v.nome}</option>)}</select></div>
      </div>
      <div className="campo margem-topo"><label>Justificativa (se a data escolhida não for a recomendada)</label><textarea rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)}/></div>
    </Modal>}

    {acao === 'entrega' && <Modal titulo="Registrar entrega" fechar={() => setAcao('')} rodape={<div className="modal-rodape-acoes"><button className="botao" onClick={() => setAcao('')}>Cancelar</button><button className="botao principal" disabled={enviando} onClick={executarAcao}>Confirmar entrega</button></div>}>
      <div className="form-grade">
        <div className="campo"><label>Caçamba *</label><select value={cacambaId} onChange={(e) => setCacambaId(e.target.value)} required><option value="">Selecione…</option>{cacambas.map((c) => <option key={c.id} value={c.id}>{c.codigo}</option>)}</select></div>
        <div className="campo"><label>Caminhão *</label><select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)} required><option value="">Selecione…</option>{veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {v.nome}</option>)}</select></div>
      </div>
      <label className="camada-toggle margem-topo"><input type="checkbox" checked={recursosObrigatorios.cacamba && recursosObrigatorios.veiculo} onChange={(e) => setRecursosObrigatorios({ cacamba: e.target.checked, veiculo: e.target.checked })}/> Operação de contingência (sem caçamba/caminhão vinculados)</label>
      {(!cacambaId || !veiculoId) && <div className="campo margem-topo"><label>Justificativa da contingência</label><textarea rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)}/></div>}
    </Modal>}

    {acao === 'retirada' && <Modal titulo="Registrar retirada" fechar={() => setAcao('')} rodape={<div className="modal-rodape-acoes"><button className="botao" onClick={() => setAcao('')}>Cancelar</button><button className="botao principal" disabled={enviando} onClick={executarAcao}>Confirmar retirada</button></div>}>
      <div className="campo"><label>Caminhão *</label><select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)} required><option value="">Selecione…</option>{veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {v.nome}</option>)}</select></div>
      <p className="texto-sutil margem-topo">Após a retirada, a caçamba seguirá para limpeza antes de voltar à disponibilidade.</p>
    </Modal>}
  </div>;
}
