import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/cliente';
import { CabecalhoPagina, Carregando, Chip, ErroEstado, Modal, Paginacao, Vazio } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import type { Paginado, Veiculo } from '../types';
import { corSituacao, formatarData, formatarNumero, formatarPlaca } from '../utils';

const SITUACOES = ['disponivel', 'reservada', 'em_deslocamento', 'em_operacao', 'parada', 'em_abastecimento', 'em_manutencao_preventiva', 'em_manutencao_corretiva', 'indisponivel', 'inativa', 'baixada'];

export function Veiculos() {
  const { pode } = useSessao();
  const { avisar } = useAviso();
  const [termo, setTermo] = useState('');
  const [situacao, setSituacao] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Paginado<Veiculo> | null>(null);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);

  function carregar(paginaAtual = pagina) {
    setErro('');
    const parametros = new URLSearchParams({ pagina: String(paginaAtual), por_pagina: '15' });
    if (termo) parametros.set('termo', termo);
    if (situacao) parametros.set('situacao', situacao);
    api.get<Paginado<Veiculo>>(`/veiculos?${parametros.toString()}`).then(setDados).catch((e) => setErro(e.message));
  }

  useEffect(() => { carregar(1); /* eslint-disable-next-line */ }, []);

  return <div>
    <CabecalhoPagina
      titulo="Caminhões e veículos"
      descricao="Cadastro e controle dos veículos da frota."
      acoes={pode('govinfra.veiculos.gerenciar') && <button className="botao principal" onClick={() => setCriando(true)}><Plus size={17}/> Novo veículo</button>}
    />
    <div className="barra-filtros">
      <div className="campo-com-icone"><Search size={17}/><input value={termo} onChange={(e) => { setTermo(e.target.value); carregar(1); }} placeholder="Placa, código, nome…"/></div>
      <select value={situacao} onChange={(e) => { setSituacao(e.target.value); carregar(1); }}>
        <option value="">Todas as situações</option>
        {SITUACOES.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
      </select>
    </div>
    {erro && <ErroEstado mensagem={erro} tentar={() => carregar()}/>}
    {!dados && !erro && <Carregando/>}
    {dados && dados.total === 0 && <Vazio titulo="Nenhum veículo encontrado"/>}
    {dados && dados.total > 0 && <>
      <div className="tabela-envolve"><table className="tabela">
        <thead><tr><th>Código</th><th>Placa</th><th>Nome</th><th>Tipo</th><th>Odômetro</th><th>Licenciamento</th><th>Seguro</th><th>Situação</th></tr></thead>
        <tbody>{dados.itens.map((v) => (
          <tr key={v.id}>
            <td><strong>{v.codigo}</strong></td><td>{formatarPlaca(v.placa)}</td><td>{v.nome}</td>
            <td>{v.tipo.replaceAll('_', ' ')}</td>
            <td>{formatarNumero(v.odometro_atual)} km</td>
            <td>{formatarData(v.licenciamento_ate)}</td>
            <td>{formatarData(v.seguro_ate)}</td>
            <td><Chip cor={corSituacao(v.situacao)}>{v.situacao_rotulo}</Chip></td>
          </tr>
        ))}</tbody>
      </table></div>
      <Paginacao pagina={dados.pagina} paginas={dados.paginas} mudar={(p) => { setPagina(p); carregar(p); }}/>
    </>}

    {criando && <Modal titulo="Novo veículo" fechar={() => setCriando(false)} rodape={<div className="modal-rodape-acoes"><button className="botao" onClick={() => setCriando(false)}>Cancelar</button><button className="botao principal" form="form-veiculo">Cadastrar</button></div>}>
      <form id="form-veiculo" className="form-grade" onSubmit={async (e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        try {
          await api.post('/veiculos', {
            codigo: dados.get('codigo'), placa: dados.get('placa'), nome: dados.get('nome'),
            marca: dados.get('marca'), modelo: dados.get('modelo'), ano: Number(dados.get('ano')) || undefined,
            tipo: dados.get('tipo'), tipo_carroceria: dados.get('tipo_carroceria'),
            transporta_cacamba: dados.get('transporta_cacamba') === 'on',
            odometro_atual: Number(dados.get('odometro_atual')) || 0,
            tipo_combustivel: dados.get('tipo_combustivel'),
            licenciamento_ate: dados.get('licenciamento_ate') || undefined,
            seguro_ate: dados.get('seguro_ate') || undefined,
          });
          avisar('sucesso', 'Veículo cadastrado.');
          setCriando(false); carregar(1);
        } catch (err: any) { avisar('erro', err.message); }
      }}>
        <div className="campo"><label>Código *</label><input name="codigo" required/></div>
        <div className="campo"><label>Placa *</label><input name="placa" required placeholder="ABC1D23"/></div>
        <div className="campo"><label>Nome *</label><input name="nome" required/></div>
        <div className="campo"><label>Marca</label><input name="marca"/></div>
        <div className="campo"><label>Modelo</label><input name="modelo"/></div>
        <div className="campo"><label>Ano</label><input name="ano" type="number"/></div>
        <div className="campo"><label>Tipo</label><select name="tipo">
          <option value="caminhao_basculante">Caminhão basculante</option>
          <option value="caminhao_cacamba">Caminhão para caçamba</option>
          <option value="caminhao_prancha">Caminhão prancha</option>
          <option value="caminhao_pipa">Caminhão-pipa</option>
          <option value="caminhao_comboio">Caminhão comboio</option>
          <option value="veiculo_apoio">Veículo de apoio</option>
          <option value="outro">Outro</option>
        </select></div>
        <div className="campo"><label>Carroceria</label><input name="tipo_carroceria"/></div>
        <div className="campo"><label>Odômetro atual (km)</label><input name="odometro_atual" type="number" min="0"/></div>
        <div className="campo"><label>Combustível</label><select name="tipo_combustivel"><option value="diesel_s10">Diesel S10</option><option value="diesel_s500">Diesel S500</option><option value="gasolina">Gasolina</option></select></div>
        <div className="campo"><label>Licenciamento até</label><input name="licenciamento_ate" type="date"/></div>
        <div className="campo"><label>Seguro até</label><input name="seguro_ate" type="date"/></div>
        <label className="camada-toggle campo"><input name="transporta_cacamba" type="checkbox"/> Transporta caçamba</label>
      </form>
    </Modal>}
  </div>;
}
