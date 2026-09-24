import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/cliente';
import { CabecalhoPagina, Carregando, Chip, ErroEstado, Modal, Paginacao, Vazio } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import type { Maquina, Paginado } from '../types';
import { corSituacao, formatarNumero } from '../utils';

const SITUACOES = ['disponivel', 'reservada', 'em_deslocamento', 'em_operacao', 'parada', 'em_abastecimento', 'em_manutencao_preventiva', 'em_manutencao_corretiva', 'indisponivel', 'inativa', 'baixada'];

export function Maquinas() {
  const { pode } = useSessao();
  const { avisar } = useAviso();
  const [termo, setTermo] = useState('');
  const [situacao, setSituacao] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Paginado<Maquina> | null>(null);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const [categorias, setCategorias] = useState<any[]>([]);

  function carregar(paginaAtual = pagina) {
    setErro('');
    const parametros = new URLSearchParams({ pagina: String(paginaAtual), por_pagina: '15' });
    if (termo) parametros.set('termo', termo);
    if (situacao) parametros.set('situacao', situacao);
    api.get<Paginado<Maquina>>(`/maquinas?${parametros.toString()}`).then(setDados).catch((e) => setErro(e.message));
  }

  useEffect(() => { carregar(1); /* eslint-disable-next-line */ }, []);

  async function abrirCriar() {
    setCriando(true);
    try { setCategorias(await api.get<any[]>('/categorias-maquina')); } catch { setCategorias([]); }
  }

  return <div>
    <CabecalhoPagina
      titulo="Máquinas e equipamentos"
      descricao="Cadastro e situação operacional das máquinas da Secretaria."
      acoes={pode('govinfra.maquinas.gerenciar') && <button className="botao principal" onClick={abrirCriar}><Plus size={17}/> Nova máquina</button>}
    />
    <div className="barra-filtros">
      <div className="campo-com-icone"><Search size={17}/><input value={termo} onChange={(e) => { setTermo(e.target.value); carregar(1); }} placeholder="Código, patrimônio, nome…"/></div>
      <select value={situacao} onChange={(e) => { setSituacao(e.target.value); carregar(1); }}>
        <option value="">Todas as situações</option>
        {SITUACOES.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
      </select>
    </div>
    {erro && <ErroEstado mensagem={erro} tentar={() => carregar()}/>}
    {!dados && !erro && <Carregando/>}
    {dados && dados.total === 0 && <Vazio titulo="Nenhuma máquina encontrada"/>}
    {dados && dados.total > 0 && <>
      <div className="tabela-envolve"><table className="tabela">
        <thead><tr><th>Código</th><th>Nome</th><th>Categoria</th><th>Horímetro</th><th>Consumo médio</th><th>Localização</th><th>Situação</th></tr></thead>
        <tbody>{dados.itens.map((m) => (
          <tr key={m.id}>
            <td><strong>{m.codigo}</strong></td><td>{m.nome}</td>
            <td>{m.categoria?.nome || '—'}</td>
            <td>{formatarNumero(m.horimetro_atual)} h</td>
            <td>{m.consumo_medio_litros_hora ? `${m.consumo_medio_litros_hora} L/h` : '—'}</td>
            <td>{m.localizacao_atual || '—'}</td>
            <td><Chip cor={corSituacao(m.situacao)}>{m.situacao_rotulo}</Chip></td>
          </tr>
        ))}</tbody>
      </table></div>
      <Paginacao pagina={dados.pagina} paginas={dados.paginas} mudar={(p) => { setPagina(p); carregar(p); }}/>
    </>}

    {criando && <Modal titulo="Nova máquina" fechar={() => setCriando(false)} rodape={<div className="modal-rodape-acoes"><button className="botao" onClick={() => setCriando(false)}>Cancelar</button><button className="botao principal" form="form-maquina">Cadastrar</button></div>}>
      <form id="form-maquina" className="form-grade" onSubmit={async (e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        try {
          await api.post('/maquinas', {
            codigo: dados.get('codigo'), nome: dados.get('nome'), categoria_id: dados.get('categoria_id') || undefined,
            marca: dados.get('marca'), modelo: dados.get('modelo'), ano: Number(dados.get('ano')) || undefined,
            patrimonio: dados.get('patrimonio'), horimetro_atual: Number(dados.get('horimetro_atual')) || 0,
            tipo_combustivel: dados.get('tipo_combustivel'), capacidade_tanque_litros: Number(dados.get('capacidade_tanque_litros')) || undefined,
            consumo_medio_litros_hora: Number(dados.get('consumo_medio_litros_hora')) || undefined,
            localizacao_atual: dados.get('localizacao_atual'),
          });
          avisar('sucesso', 'Máquina cadastrada.');
          setCriando(false); carregar(1);
        } catch (err: any) { avisar('erro', err.message); }
      }}>
        <div className="campo"><label>Código *</label><input name="codigo" required/></div>
        <div className="campo"><label>Nome *</label><input name="nome" required/></div>
        <div className="campo"><label>Categoria</label><select name="categoria_id"><option value="">—</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
        <div className="campo"><label>Marca</label><input name="marca"/></div>
        <div className="campo"><label>Modelo</label><input name="modelo"/></div>
        <div className="campo"><label>Ano</label><input name="ano" type="number"/></div>
        <div className="campo"><label>Patrimônio</label><input name="patrimonio"/></div>
        <div className="campo"><label>Horímetro atual</label><input name="horimetro_atual" type="number" min="0"/></div>
        <div className="campo"><label>Combustível</label><select name="tipo_combustivel"><option value="diesel_s10">Diesel S10</option><option value="diesel_s500">Diesel S500</option><option value="gasolina">Gasolina</option><option value="etanol">Etanol</option></select></div>
        <div className="campo"><label>Capacidade do tanque (L)</label><input name="capacidade_tanque_litros" type="number" min="0"/></div>
        <div className="campo"><label>Consumo médio (L/h)</label><input name="consumo_medio_litros_hora" type="number" min="0" step="0.1"/></div>
        <div className="campo"><label>Localização</label><input name="localizacao_atual" placeholder="Pátio da Secretaria"/></div>
      </form>
    </Modal>}
  </div>;
}
