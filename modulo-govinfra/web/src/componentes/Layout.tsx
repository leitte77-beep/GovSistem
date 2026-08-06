import {
  Bell, Building2, Calendar, ChevronDown, ClipboardList, Fuel, HardHat, LayoutDashboard,
  LogOut, Menu, MessageSquareWarning, Settings, ShieldCheck, Search, Truck, Wrench,
  Map, FileBarChart2, FolderKanban, Users, X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import { useSessao } from '../contexto/SessaoContexto';
import { iniciais } from '../utils';

const grupos = [
  { titulo: 'Operação', itens: [
    ['/govinfra/dashboard', 'Painel geral', LayoutDashboard],
    ['/govinfra/solicitacoes', 'Solicitações', ClipboardList],
    ['/govinfra/agenda', 'Agenda geral', Calendar],
    ['/govinfra/mapa', 'Mapa', Map],
  ]},
  { titulo: 'Caçambas', itens: [
    ['/govinfra/cacambas', 'Caçambas', HardHat],
  ]},
  { titulo: 'Porteira Adentro', itens: [
    ['/govinfra/porteira', 'Visão geral', FolderKanban],
    ['/govinfra/ordens', 'Ordens de serviço', ClipboardList],
  ]},
  { titulo: 'Frota', itens: [
    ['/govinfra/maquinas', 'Máquinas', Truck],
    ['/govinfra/veiculos', 'Caminhões e veículos', Truck],
    ['/govinfra/operadores', 'Operadores e motoristas', Users],
    ['/govinfra/combustivel', 'Combustível', Fuel],
    ['/govinfra/manutencoes', 'Manutenções', Wrench],
  ]},
  { titulo: 'Gestão', itens: [
    ['/govinfra/pessoas', 'Cidadãos e produtores', Users],
    ['/govinfra/relatorios', 'Relatórios', FileBarChart2],
    ['/govinfra/auditoria', 'Auditoria', ShieldCheck],
    ['/govinfra/configuracoes', 'Configurações', Settings],
  ]},
] as const;

export function Layout() {
  const { dados, sair, pode } = useSessao();
  const [menu, setMenu] = useState(false);
  const [perfil, setPerfil] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const [termo, setTermo] = useState('');
  const navegar = useNavigate();

  useEffect(() => {
    api.get<any>('/notificacoes/nao-lidas').then((r) => setNaoLidas(r.total || 0)).catch(() => undefined);
  }, []);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (termo.trim()) navegar(`/govinfra/busca?termo=${encodeURIComponent(termo.trim())}`);
  }
  async function encerrar() { await sair(); navegar('/entrar'); }

  const podeVer = (url: string) => {
    if (!dados) return false;
    const permissao = {
      '/govinfra/dashboard': 'govinfra.dashboard.visualizar',
      '/govinfra/mapa': 'govinfra.mapa.visualizar',
      '/govinfra/solicitacoes': 'govinfra.solicitacoes.visualizar',
      '/govinfra/agenda': 'govinfra.agenda.visualizar',
      '/govinfra/cacambas': 'govinfra.cacambas.visualizar',
      '/govinfra/porteira': 'govinfra.porteira.visualizar',
      '/govinfra/ordens': 'govinfra.ordens.visualizar',
      '/govinfra/maquinas': 'govinfra.maquinas.visualizar',
      '/govinfra/veiculos': 'govinfra.veiculos.visualizar',
      '/govinfra/operadores': 'govinfra.operadores.visualizar',
      '/govinfra/combustivel': 'govinfra.combustivel.visualizar',
      '/govinfra/manutencoes': 'govinfra.manutencoes.visualizar',
      '/govinfra/relatorios': 'govinfra.relatorios.visualizar',
      '/govinfra/auditoria': 'govinfra.auditoria.visualizar',
      '/govinfra/configuracoes': 'govinfra.configuracoes.visualizar',
    } as Record<string, string>;
    const exigida = permissao[url];
    return exigida ? pode(exigida) : true;
  };

  return <div className="app">
    <a href="#conteudo" className="pular-para-conteudo">Pular para o conteúdo</a>
    <header className="topo">
      <button className="botao-topo abre-menu" aria-label="Abrir menu" onClick={() => setMenu(true)}><Menu size={21}/></button>
      <Link className="marca" to="/govinfra/dashboard"><HardHat size={25}/><span className="texto">Gov<span className="destaque">Infra</span></span></Link>
      <form className="busca" role="search" onSubmit={buscar}><Search size={18}/><input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar pessoa, protocolo, caçamba, placa…" aria-label="Buscar no GovInfra"/></form>
      <div className="acoes">
        <Link to="/govinfra/notificacoes" className="botao-topo" aria-label={`Notificações: ${naoLidas} não lidas`} style={{ position: 'relative' }}><Bell size={20}/>{naoLidas > 0 && <span className="selo-contador">{naoLidas > 99 ? '99+' : naoLidas}</span>}</Link>
        <button className="botao-topo usuario-topo" onClick={() => setPerfil(!perfil)}><span className="avatar">{iniciais(dados?.usuario.nome)}</span><span className="nome-usuario">{dados?.usuario.nome.split(' ')[0]}</span><ChevronDown size={15}/></button>
        {perfil && <div className="menu-perfil">
          <div className="menu-perfil-info"><strong>{dados?.usuario.nome}</strong><span>{dados?.usuario.email}</span><span className="chip">{dados?.usuario.perfil_rotulo}</span></div>
          <Link to="/govinfra/perfil" onClick={() => setPerfil(false)}><Users size={17}/> Meu perfil</Link>
          <button onClick={encerrar}><LogOut size={17}/> Sair</button>
        </div>}
      </div>
    </header>
    <aside className={`lateral ${menu ? 'aberta' : ''}`} aria-label="Navegação principal">
      <div className="lateral-mobile"><strong>Menu</strong><button className="botao sutil icone" onClick={() => setMenu(false)}><X size={20}/></button></div>
      {grupos.map((grupo) => (
        <div className="grupo" key={grupo.titulo}>
          <div className="grupo-titulo">{grupo.titulo}</div>
          {grupo.itens.map(([url, texto, Icone]) => {
            if (!podeVer(url)) return null;
            return <NavLink className={({ isActive }) => `item-menu ${isActive ? 'ativo' : ''}`} to={url} key={url} onClick={() => setMenu(false)}><Icone size={18}/>{texto}</NavLink>;
          })}
        </div>
      ))}
      <div className="instituicao-lateral"><Building2 size={18}/><div><strong>{dados?.organizacao.nome}</strong><span>{dados?.usuario.perfil_rotulo}</span></div></div>
    </aside>
    {menu && <div className="fundo-escuro" onClick={() => setMenu(false)}/>}
    <main className="conteudo" id="conteudo"><Outlet/></main>
  </div>;
}
