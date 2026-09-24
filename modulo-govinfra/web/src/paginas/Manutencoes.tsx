import { Plus, Search, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/cliente';
import { CabecalhoPagina, Carregando, Chip, ErroEstado, Modal, Paginacao, Vazio } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import type { Manutencao, Paginado } from '../types';
import { corSituacao, formatarData, formatarDinheiro } from '../utils';

export function Manutencoes() {
  const { pode } = useSessao();
  const { avisar } = useAviso();
  const [termo, setTermo] = useState('');
  const [situacao, setSituacao] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Paginado<Manutencao> | null>(null);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const [maquinas, setMaquinas] = useState<any[]>([]);
  const [veiculos, setVeiculos] = useState<any[]>([]);
  const [cacambas, setCacambas] = useState<any[]>([]);

  function carregar(paginaAtual = pagina) {
    setErro('');
    const parametros = new URLSearchParams({ pagina: String(paginaAtual), por_pagina: '15' });
    if (termo) parametros.set('termo', termo);
    if (situacao) parametros.set('situacao', situacao);
    api.get<Paginado<Manutencao>>(`/manutencoes?${parametros.toString()}`).then(setDados).catch((e) => setErro(e.message));
  }

  useEffect(() => { carregar(1); /* eslint-disable-next-line */ }, []);

  async function abrirCriar() {
    setCriando(true);
    try {
      const [m, v, c] = await Promise.all([
        api.get<{ itens: any[] }>('/maquinas?por_pagina=100'),
        api.get<{ itens: any[] }>('/veiculos?por_pagina=100'),
        api.get<{ itens: any[] }>('/cacambas?por_pagina=100'),
      ]);
      setMaquinas(m.itens); setVeiculos(v.itens); setCacambas(c.itens);
    } catch { /* opcional */ }
  }

  return <div>
    <CabecalhoPagina
      titulo="Manutenções"
      descricao="Manutenções preventivas e corretivas de caçambas, máquinas e veículos."
      acoes={pode('govinfra.manutencoes.gerenciar') && <button className="botao principal" onClick={abrirCriar}><Plus size={17}/> Abrir manutenção</button>}
    />
    <div className="barra-filtros">
      <div className="campo-com-icone"><Search size={17}/><input value={termo} onChange={(e) => { setTermo(e.target.value); carregar(1); }} placeholder="Equipamento, defeito…"/></div>
      <select value={situacao} onChange={(e) => { setSituacao(e.target.value); carregar(1); }}>
        <option value="">Todas as situações</option>
        <option value="aberta">Aberta</option>
        <option value="aguardando_peca">Aguardando peça</option>
        <option value="em_execucao">Em execução</option>
        <option value="concluida">Concluída</option>
        <option value="cancelada">Cancelada</option>
      </select>
    </div>
    {erro && <ErroEstado mensagem={erro} tentar={() => carregar()}/>}
    {!dados && !erro && <Carregando/>}
    {dados && dados.total === 0 && <Vazio titulo="Nenhuma manutenção encontrada"/>}
    {dados && dados.total > 0 && <>
      <div className="tabela-envolve"><table className="tabela">
        <thead><tr><th>Equipamento</th><th>Tipo</th><th>Defeito</th><th>Prioridade</th><th>Abertura</th><th>Conclusão</th><th>Custo</th><th>Situação</th></tr></thead>
        <tbody>{dados.itens.map((m) => (
          <tr key={m.id}>
            <td><strong>{m.equipamento || '—'}</strong></td>
            <td>{m.tipo}</td>
            <td>{m.defeito || '—'}</td>
            <td>{m.prioridade}</td>
            <td>{formatarData(m.data_abertura)}</td>
            <td>{formatarData(m.data_conclusao)}</td>
            <td>{formatarDinheiro(m.custo_total)}</td>
            <td><Chip cor={corSituacao(m.situacao)}>{m.situacao_rotulo}</Chip></td>
          </tr>
        ))}</tbody>
      </table></div>
      <Paginacao pagina={dados.pagina} paginas={dados.paginas} mudar={(p) => { setPagina(p); carregar(p); }}/>
    </>}

    {criando && <Modal titulo="Abrir manutenção" fechar={() => setCriando(false)} largo rodape={<div className="modal-rodape-acoes"><button className="botao" onClick={() => setCriando(false)}>Cancelar</button><button className="botao principal" form="form-manutencao">Abrir manutenção</button></div>}>
      <form id="form-manutencao" className="form-grade" onSubmit={async (e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        try {
          await api.post('/manutencoes', {
            maquina_id: dados.get('maquina_id') || undefined,
            veiculo_id: dados.get('veiculo_id') || undefined,
            cacamba_id: dados.get('cacamba_id') || undefined,
            tipo: dados.get('tipo'),
            data_abertura: dados.get('data_abertura'),
            defeito: dados.get('defeito'),
            diagnostico: dados.get('diagnostico'),
            prioridade: dados.get('prioridade'),
            horimetro: Number(dados.get('horimetro')) || undefined,
            quilometragem: Number(dados.get('quilometragem')) || undefined,
            oficina: dados.get('oficina'),
            custo_total: Number(dados.get('custo_total')) || undefined,
            data_prevista: dados.get('data_prevista') || undefined,
            situacao: 'aberta',
          });
          avisar('sucesso', 'Manutenção aberta. O equipamento fica indisponível para novos agendamentos.');
          setCriando(false); carregar(1);
        } catch (err: any) { avisar('erro', err.message); }
      }}>
        <div className="campo"><label>Tipo *</label><select name="tipo"><option value="preventiva">Preventiva</option><option value="corretiva">Corretiva</option></select></div>
        <div className="campo"><label>Data de abertura *</label><input name="data_abertura" type="date" required defaultValue={new Date().toISOString().slice(0, 10)}/></div>
        <div className="campo"><label>Máquina</label><select name="maquina_id"><option value="">—</option>{maquinas.map((m) => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}</select></div>
        <div className="campo"><label>Veículo</label><select name="veiculo_id"><option value="">—</option>{veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {v.nome}</option>)}</select></div>
        <div className="campo"><label>Caçamba</label><select name="cacamba_id"><option value="">—</option>{cacambas.map((c) => <option key={c.id} value={c.id}>{c.codigo}</option>)}</select></div>
        <div className="campo"><label>Defeito *</label><input name="defeito" required/></div>
        <div className="campo"><label>Diagnóstico</label><input name="diagnostico"/></div>
        <div className="campo"><label>Prioridade</label><select name="prioridade"><option value="baixa">Baixa</option><option value="normal" selected>Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></div>
        <div className="campo"><label>Horímetro</label><input name="horimetro" type="number" min="0"/></div>
        <div className="campo"><label>Quilometragem</label><input name="quilometragem" type="number" min="0"/></div>
        <div className="campo"><label>Oficina</label><input name="oficina" placeholder="Oficina municipal"/></div>
        <div className="campo"><label>Custo total (R$)</label><input name="custo_total" type="number" min="0" step="0.01"/></div>
        <div className="campo"><label>Data prevista de conclusão</label><input name="data_prevista" type="date"/></div>
      </form>
      <p className="texto-sutil margem-topo"><Wrench size={14}/> Ao abrir, o sistema bloqueia automaticamente novos agendamentos do equipamento.</p>
    </Modal>}
  </div>;
}
