import { Navigate, Route, Routes } from 'react-router-dom';
import { Carregando } from './componentes/Comuns';
import { Layout } from './componentes/Layout';
import { useSessao } from './contexto/SessaoContexto';
import { Entrar } from './paginas/Entrar';
import { Painel } from './paginas/Painel';
import { Pessoas } from './paginas/Pessoas';
import { Cacambas } from './paginas/Cacambas';
import { CacambaDetalhe } from './paginas/CacambaDetalhe';
import { Solicitacoes } from './paginas/Solicitacoes';
import { SolicitacaoDetalhe } from './paginas/SolicitacaoDetalhe';
import { NovaSolicitacao } from './paginas/NovaSolicitacao';
import { Agenda } from './paginas/Agenda';
import { Porteira } from './paginas/Porteira';
import { PorteiraSolicitacoes } from './paginas/PorteiraSolicitacoes';
import { Ordens } from './paginas/Ordens';
import { OrdemDetalhe } from './paginas/OrdemDetalhe';
import { Maquinas } from './paginas/Maquinas';
import { Veiculos } from './paginas/Veiculos';
import { Operadores } from './paginas/Operadores';
import { Combustivel } from './paginas/Combustivel';
import { Manutencoes } from './paginas/Manutencoes';
import { MapaPagina } from './paginas/MapaPagina';
import { Relatorios } from './paginas/Relatorios';
import { Configuracoes } from './paginas/Configuracoes';
import { Auditoria } from './paginas/Auditoria';
import { Notificacoes } from './paginas/Notificacoes';
import { Busca } from './paginas/Busca';
import { Perfil } from './paginas/Perfil';
import { ConsultaPublica } from './paginas/ConsultaPublica';

function Protegido() {
  const { dados, carregando } = useSessao();
  if (carregando) return <Carregando texto="Validando sua sessão…"/>;
  return dados ? <Layout/> : <Navigate to="/entrar" replace/>;
}

export default function App() {
  return <Routes>
    <Route path="/entrar" element={<Entrar/>}/>
    <Route path="/consulta/:token" element={<ConsultaPublica/>}/>
    <Route element={<Protegido/>}>
      <Route path="/govinfra/dashboard" element={<Painel/>}/>
      <Route path="/govinfra/pessoas" element={<Pessoas/>}/>
      <Route path="/govinfra/cacambas" element={<Cacambas/>}/>
      <Route path="/govinfra/cacambas/:id" element={<CacambaDetalhe/>}/>
      <Route path="/govinfra/solicitacoes" element={<Solicitacoes/>}/>
      <Route path="/govinfra/solicitacoes/nova" element={<NovaSolicitacao/>}/>
      <Route path="/govinfra/solicitacoes/:id" element={<SolicitacaoDetalhe/>}/>
      <Route path="/govinfra/agenda" element={<Agenda/>}/>
      <Route path="/govinfra/porteira" element={<Porteira/>}/>
      <Route path="/govinfra/porteira/solicitacoes" element={<PorteiraSolicitacoes/>}/>
      <Route path="/govinfra/ordens" element={<Ordens/>}/>
      <Route path="/govinfra/ordens/:id" element={<OrdemDetalhe/>}/>
      <Route path="/govinfra/maquinas" element={<Maquinas/>}/>
      <Route path="/govinfra/veiculos" element={<Veiculos/>}/>
      <Route path="/govinfra/operadores" element={<Operadores/>}/>
      <Route path="/govinfra/combustivel" element={<Combustivel/>}/>
      <Route path="/govinfra/manutencoes" element={<Manutencoes/>}/>
      <Route path="/govinfra/mapa" element={<MapaPagina/>}/>
      <Route path="/govinfra/relatorios" element={<Relatorios/>}/>
      <Route path="/govinfra/configuracoes" element={<Configuracoes/>}/>
      <Route path="/govinfra/auditoria" element={<Auditoria/>}/>
      <Route path="/govinfra/notificacoes" element={<Notificacoes/>}/>
      <Route path="/govinfra/busca" element={<Busca/>}/>
      <Route path="/govinfra/perfil" element={<Perfil/>}/>
    </Route>
    <Route path="*" element={<Navigate to="/govinfra/dashboard" replace/>}/>
  </Routes>;
}
