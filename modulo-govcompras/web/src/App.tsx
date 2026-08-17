import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Shell } from "@/layout/Shell";
import { GuardRota } from "@/layout/GuardRota";
import { EntrarDemo } from "@/paginas/entrar/EntrarDemo";

const Dashboard = lazy(() => import("@/paginas/dashboard/Dashboard").then((m) => ({ default: m.Dashboard })));
const Pendencias = lazy(() => import("@/paginas/dashboard/Pendencias").then((m) => ({ default: m.Pendencias })));
const Agenda = lazy(() => import("@/paginas/dashboard/Agenda").then((m) => ({ default: m.Agenda })));
const ProcessosLista = lazy(() => import("@/paginas/processos/ProcessosLista").then((m) => ({ default: m.ProcessosLista })));
const ProcessoDetalhe = lazy(() => import("@/paginas/processos/ProcessoDetalhe").then((m) => ({ default: m.ProcessoDetalhe })));
const SolicitacoesLista = lazy(() => import("@/paginas/solicitacoes/SolicitacoesLista").then((m) => ({ default: m.SolicitacoesLista })));
const SolicitacaoNova = lazy(() => import("@/paginas/solicitacoes/SolicitacaoNova").then((m) => ({ default: m.SolicitacaoNova })));
const SolicitacaoDetalhe = lazy(() => import("@/paginas/solicitacoes/SolicitacaoDetalhe").then((m) => ({ default: m.SolicitacaoDetalhe })));
const Pca = lazy(() => import("@/paginas/comum/Pca").then((m) => ({ default: m.Pca })));
const CatalogoLista = lazy(() => import("@/paginas/catalogo/CatalogoLista").then((m) => ({ default: m.CatalogoLista })));
const FornecedoresLista = lazy(() => import("@/paginas/fornecedores/FornecedoresLista").then((m) => ({ default: m.FornecedoresLista })));
const FornecedorDetalhe = lazy(() => import("@/paginas/fornecedores/FornecedorDetalhe").then((m) => ({ default: m.FornecedorDetalhe })));
const ContratosLista = lazy(() => import("@/paginas/contratos/ContratosLista").then((m) => ({ default: m.ContratosLista })));
const ContratoDetalhe = lazy(() => import("@/paginas/contratos/ContratoDetalhe").then((m) => ({ default: m.ContratoDetalhe })));
const AtasLista = lazy(() => import("@/paginas/atas/AtasLista").then((m) => ({ default: m.AtasLista })));
const AtaDetalhe = lazy(() => import("@/paginas/atas/AtaDetalhe").then((m) => ({ default: m.AtaDetalhe })));
const Vencimentos = lazy(() => import("@/paginas/contratos/Vencimentos").then((m) => ({ default: m.Vencimentos })));
const Relatorios = lazy(() => import("@/paginas/comum/Relatorios").then((m) => ({ default: m.Relatorios })));
const Notificacoes = lazy(() => import("@/paginas/notificacoes/Notificacoes").then((m) => ({ default: m.Notificacoes })));
const AdminUsuarios = lazy(() => import("@/paginas/administracao/AdminUsuarios").then((m) => ({ default: m.AdminUsuarios })));
const AdminEstrutura = lazy(() => import("@/paginas/administracao/AdminEstrutura").then((m) => ({ default: m.AdminEstrutura })));
const AdminWorkflows = lazy(() => import("@/paginas/administracao/AdminWorkflows").then((m) => ({ default: m.AdminWorkflows })));
const Auditoria = lazy(() => import("@/paginas/auditoria/Auditoria").then((m) => ({ default: m.Auditoria })));
const NaoEncontrada = lazy(() => import("@/paginas/comum/NaoEncontrada").then((m) => ({ default: m.NaoEncontrada })));

function Carregando() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="size-6 animate-spin text-brand-600" />
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<Carregando />}>
      <Routes>
        <Route path="/entrar" element={<EntrarDemo />} />
        <Route
          element={
            <GuardRota>
              <Shell />
            </GuardRota>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="/pendencias" element={<Pendencias />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/processos" element={<ProcessosLista />} />
          <Route path="/processos/:id" element={<ProcessoDetalhe />} />
          <Route path="/solicitacoes" element={<SolicitacoesLista />} />
          <Route path="/solicitacoes/nova" element={<SolicitacaoNova />} />
          <Route path="/solicitacoes/:id" element={<SolicitacaoDetalhe />} />
          <Route path="/pca" element={<Pca />} />
          <Route path="/catalogo" element={<CatalogoLista />} />
          <Route path="/fornecedores" element={<FornecedoresLista />} />
          <Route path="/fornecedores/:id" element={<FornecedorDetalhe />} />
          <Route path="/contratos" element={<ContratosLista />} />
          <Route path="/contratos/:id" element={<ContratoDetalhe />} />
          <Route path="/atas" element={<AtasLista />} />
          <Route path="/atas/:id" element={<AtaDetalhe />} />
          <Route path="/vencimentos" element={<Vencimentos />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/notificacoes" element={<Notificacoes />} />
          <Route path="/administracao/usuarios" element={<AdminUsuarios />} />
          <Route path="/administracao/estrutura" element={<AdminEstrutura />} />
          <Route path="/administracao/workflows" element={<AdminWorkflows />} />
          <Route path="/auditoria" element={<Auditoria />} />
          <Route path="*" element={<NaoEncontrada />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
