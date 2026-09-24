import { Fuel, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/cliente';
import { CabecalhoPagina, Carregando, Chip, ErroEstado, Modal, Paginacao, Vazio } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import { useSessao } from '../contexto/SessaoContexto';
import type { Abastecimento, Maquina, Paginado, Tanque, Veiculo } from '../types';
import { formatarDataHora, formatarDinheiro, formatarNumero } from '../utils';

export function Combustivel() {
  const { pode } = useSessao();
  const { avisar } = useAviso();
  const [tanques, setTanques] = useState<Tanque[] | null>(null);
  const [dados, setDados] = useState<Paginado<Abastecimento> | null>(null);
  const [indicadores, setIndicadores] = useState<any>(null);
  const [erro, setErro] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [criandoTanque, setCriandoTanque] = useState(false);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [pagina, setPagina] = useState(1);

  function carregar(paginaAtual = pagina) {
    setErro('');
    api.get<Paginado<Abastecimento>>(`/combustivel/abastecimentos?pagina=${paginaAtual}&por_pagina=15`).then(setDados).catch((e) => setErro(e.message));
  }

  useEffect(() => {
    carregar(1);
    api.get<Tanque[]>('/combustivel/tanques').then(setTanques).catch(() => undefined);
    api.get<any>('/combustivel/indicadores').then(setIndicadores).catch(() => undefined);
    /* eslint-disable-next-line */
  }, []);

  async function abrirRegistro() {
    setRegistrando(true);
    try {
      const [m, v] = await Promise.all([
        api.get<{ itens: Maquina[] }>('/maquinas?por_pagina=100'),
        api.get<{ itens: Veiculo[] }>('/veiculos?por_pagina=100'),
      ]);
      setMaquinas(m.itens); setVeiculos(v.itens);
    } catch { /* opcional */ }
  }

  return <div>
    <CabecalhoPagina
      titulo="Combustível"
      descricao="Abastecimentos, consumo, estoque e inconsistências do diesel."
      acoes={<>
        {pode('govinfra.combustivel.registrar') && <button className="botao principal" onClick={abrirRegistro}><Fuel size={17}/> Registrar abastecimento</button>}
        {pode('govinfra.combustivel.estoque') && <button className="botao" onClick={() => setCriandoTanque(true)}><Plus size={17}/> Novo tanque</button>}
      </>}
    />

    {indicadores && <section className="secao-painel">
      <div className="grade-indicadores">
        <div className="cartao-indicador laranja"><span className="cartao-valor">{formatarNumero(indicadores.litros_total)} L</span><span className="cartao-titulo">Diesel no período</span></div>
        <div className="cartao-indicador azul"><span className="cartao-valor">{formatarDinheiro(indicadores.custo_total)}</span><span className="cartao-titulo">Custo estimado</span></div>
        <div className="cartao-indicador"><span className="cartao-valor">{indicadores.abastecimentos ?? 0}</span><span className="cartao-titulo">Abastecimentos</span></div>
        <div className="cartao-indicador vermelho"><span className="cartao-valor">{indicadores.com_inconsistencia ?? 0}</span><span className="cartao-titulo">Com inconsistência</span></div>
        <div className="cartao-indicador vermelho"><span className="cartao-valor">{indicadores.sem_ordem_servico ?? 0}</span><span className="cartao-titulo">Sem ordem de serviço</span></div>
      </div>
    </section>}

    {tanques && tanques.length > 0 && <section className="secao-painel"><h2>Tanques e estoque</h2>
      <div className="grade-painel">{tanques.map((t) => (
        <div key={t.id} className="opcao-data">
          <div className="titulo"><strong>{t.nome}</strong> <Chip cor={t.estoque_atual_litros <= (t.estoque_minimo_litros || 0) ? 'vermelho' : 'verde'}>{t.estoque_atual_litros} L</Chip></div>
          <div className="pontos">Capacidade: {t.capacidade_litros ?? '—'} L · mínimo: {t.estoque_minimo_litros ?? '—'} L</div>
          <div className="pontos">Local: {t.local || '—'} · bombas: {(t.bombas || []).join(', ')}</div>
        </div>
      ))}</div>
    </section>}

    <section className="secao-painel"><h2>Últimos abastecimentos</h2>
      {erro && <ErroEstado mensagem={erro} tentar={() => carregar()}/>}
      {!dados && !erro && <Carregando/>}
      {dados && dados.total === 0 && <Vazio titulo="Nenhum abastecimento registrado"/>}
      {dados && dados.total > 0 && <>
        <div className="tabela-envolve"><table className="tabela">
          <thead><tr><th>Quando</th><th>Equipamento</th><th>Litros</th><th>Valor</th><th>Horímetro</th><th>Local</th><th>Alertas</th></tr></thead>
          <tbody>{dados.itens.map((a) => (
            <tr key={a.id}>
              <td>{formatarDataHora(a.abastecido_em)}</td>
              <td>{a.maquina || a.veiculo || '—'}</td>
              <td><strong>{a.quantidade_litros} L</strong></td>
              <td>{formatarDinheiro(a.valor_total)}</td>
              <td>{a.horimetro ? formatarNumero(a.horimetro) : a.quilometragem ? `${formatarNumero(a.quilometragem)} km` : '—'}</td>
              <td>{a.local || '—'}</td>
              <td>{a.alertas.length > 0 ? <Chip cor="vermelho">{a.alertas.length} alerta(s)</Chip> : <span className="texto-sutil">—</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <Paginacao pagina={dados.pagina} paginas={dados.paginas} mudar={(p) => { setPagina(p); carregar(p); }}/>
      </>}
    </section>

    {registrando && <Modal titulo="Registrar abastecimento" fechar={() => setRegistrando(false)} rodape={<div className="modal-rodape-acoes"><button className="botao" onClick={() => setRegistrando(false)}>Cancelar</button><button className="botao principal" form="form-abastecimento">Registrar</button></div>}>
      <form id="form-abastecimento" className="form-grade" onSubmit={async (e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        const maquina_id = dados.get('maquina_id') as string;
        const veiculo_id = dados.get('veiculo_id') as string;
        try {
          const resposta = await api.post<any>('/combustivel/abastecimentos', {
            maquina_id: maquina_id || undefined,
            veiculo_id: veiculo_id || undefined,
            quantidade_litros: Number(dados.get('quantidade_litros')),
            tipo_combustivel: dados.get('tipo_combustivel'),
            valor_unitario: Number(dados.get('valor_unitario')) || undefined,
            horimetro: Number(dados.get('horimetro')) || undefined,
            quilometragem: Number(dados.get('quilometragem')) || undefined,
            tanque_id: dados.get('tanque_id') || undefined,
            bomba: dados.get('bomba') || undefined,
            local: dados.get('local'),
            requisicao: dados.get('requisicao'),
            chave_idempotencia: `web-${Date.now()}`,
          });
          avisar('sucesso', resposta.alertas?.length ? `Registrado com ${resposta.alertas.length} alerta(s).` : 'Abastecimento registrado.');
          setRegistrando(false); carregar(1);
          api.get<any>('/combustivel/indicadores').then(setIndicadores).catch(() => undefined);
        } catch (err: any) { avisar('erro', err.message); }
      }}>
        <div className="campo"><label>Máquina</label><select name="maquina_id"><option value="">—</option>{maquinas.map((m) => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}</select></div>
        <div className="campo"><label>Veículo</label><select name="veiculo_id"><option value="">—</option>{veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {v.nome}</option>)}</select></div>
        <div className="campo"><label>Quantidade (L) *</label><input name="quantidade_litros" type="number" min="1" required/></div>
        <div className="campo"><label>Combustível</label><select name="tipo_combustivel"><option value="diesel_s10">Diesel S10</option><option value="diesel_s500">Diesel S500</option></select></div>
        <div className="campo"><label>Valor unitário (R$)</label><input name="valor_unitario" type="number" min="0" step="0.01"/></div>
        <div className="campo"><label>Horímetro</label><input name="horimetro" type="number" min="0"/></div>
        <div className="campo"><label>Quilometragem</label><input name="quilometragem" type="number" min="0"/></div>
        <div className="campo"><label>Tanque</label><select name="tanque_id"><option value="">—</option>{(tanques || []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></div>
        <div className="campo"><label>Bomba</label><input name="bomba"/></div>
        <div className="campo"><label>Local</label><input name="local" placeholder="Pátio da Secretaria"/></div>
        <div className="campo"><label>Requisição</label><input name="requisicao"/></div>
      </form>
    </Modal>}

    {criandoTanque && <Modal titulo="Novo tanque" fechar={() => setCriandoTanque(false)} rodape={<div className="modal-rodape-acoes"><button className="botao" onClick={() => setCriandoTanque(false)}>Cancelar</button><button className="botao principal" form="form-tanque">Criar tanque</button></div>}>
      <form id="form-tanque" className="form-grade" onSubmit={async (e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        try {
          await api.post('/combustivel/tanques', {
            codigo: dados.get('codigo'), nome: dados.get('nome'),
            tipo_combustivel: dados.get('tipo_combustivel'), local: dados.get('local'),
            capacidade_litros: Number(dados.get('capacidade_litros')) || undefined,
            estoque_minimo_litros: Number(dados.get('estoque_minimo_litros')) || undefined,
            bombas: [dados.get('bomba')].filter(Boolean),
          });
          avisar('sucesso', 'Tanque criado.');
          setCriandoTanque(false);
          api.get<Tanque[]>('/combustivel/tanques').then(setTanques).catch(() => undefined);
        } catch (err: any) { avisar('erro', err.message); }
      }}>
        <div className="campo"><label>Código *</label><input name="codigo" required/></div>
        <div className="campo"><label>Nome *</label><input name="nome" required/></div>
        <div className="campo"><label>Combustível</label><select name="tipo_combustivel"><option value="diesel_s10">Diesel S10</option></select></div>
        <div className="campo"><label>Local</label><input name="local"/></div>
        <div className="campo"><label>Capacidade (L)</label><input name="capacidade_litros" type="number" min="0"/></div>
        <div className="campo"><label>Estoque mínimo (L)</label><input name="estoque_minimo_litros" type="number" min="0"/></div>
        <div className="campo"><label>Bomba</label><input name="bomba"/></div>
      </form>
    </Modal>}
  </div>;
}
