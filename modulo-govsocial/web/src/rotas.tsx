import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ShellModulo } from "@/layout/ShellModulo";
import { LayoutImpressao } from "@/layout/LayoutImpressao";
import { GuardRota } from "@/layout/GuardRota";
import { Skeleton } from "@/ui/Skeleton";

// Code-splitting por rota (§12): cada página é um chunk sob demanda.
const InicioPorPerfil = lazy(() => import("@/paginas/inicio/InicioPorPerfil"));
const AtendimentosLista = lazy(() => import("@/paginas/atendimentos/AtendimentosLista"));
const ResultadosBusca = lazy(() => import("@/paginas/familias/ResultadosBusca"));
const FamiliaFormulario = lazy(() => import("@/paginas/familias/FamiliaFormulario"));
const FichaFamilia = lazy(() => import("@/paginas/familias/FichaFamilia"));
const RegistrarAtendimentoPagina = lazy(
  () => import("@/paginas/atendimentos/RegistrarAtendimentoPagina"),
);
const ProntuarioImpressao = lazy(() => import("@/paginas/familias/ProntuarioImpressao"));
const BeneficiosConcessao = lazy(() => import("@/paginas/beneficios/BeneficiosConcessao"));
const ComprovanteImpressao = lazy(() => import("@/paginas/beneficios/ComprovanteImpressao"));
const GruposLista = lazy(() => import("@/paginas/grupos/GruposLista"));
const GrupoDetalhe = lazy(() => import("@/paginas/grupos/GrupoDetalhe"));
const AgendaFila = lazy(() => import("@/paginas/agenda/AgendaFila"));
const PainelEncaminhamentos = lazy(() => import("@/paginas/agenda/PainelEncaminhamentos"));
const EncaminhamentoDetalhe = lazy(() => import("@/paginas/agenda/EncaminhamentoDetalhe"));
const GuiaImpressao = lazy(() => import("@/paginas/agenda/GuiaImpressao"));
const NovoEncaminhamentoPagina = lazy(() => import("@/paginas/agenda/NovoEncaminhamentoPagina"));
const RmaConferencia = lazy(() => import("@/paginas/rma/RmaConferencia"));
const RmaEspelhoImpressao = lazy(() => import("@/paginas/rma/RmaEspelhoImpressao"));
const DashboardGestor = lazy(() => import("@/paginas/vigilancia/DashboardGestor"));
const DashboardImpressao = lazy(() => import("@/paginas/vigilancia/DashboardImpressao"));
const AdministracaoWizard = lazy(() => import("@/paginas/admin/AdministracaoWizard"));
const RendaFamiliar = lazy(() => import("@/paginas/renda/RendaFamiliar"));
const CentralNotificacoes = lazy(() => import("@/paginas/notificacoes/CentralNotificacoes"));
const HabitacaoPainel = lazy(() => import("@/paginas/habitacao/HabitacaoPainel"));
const QuestionarioLista = lazy(() => import("@/paginas/questionarios/QuestionarioLista"));
const EditorQuestionario = lazy(() => import("@/paginas/questionarios/EditorQuestionario"));
const ImportarDados = lazy(() => import("@/paginas/importacao/ImportarDados"));
const CadastroRapido = lazy(() => import("@/paginas/familias/CadastroRapido"));
const ExportadorDados = lazy(() => import("@/paginas/exportador/ExportadorDados"));
const AtalhosAdmin = lazy(() => import("@/paginas/admin/AtalhosAdmin"));
const CadastrosAdmin = lazy(() => import("@/paginas/admin/CadastrosAdmin"));
const ListaDominio = lazy(() => import("@/paginas/admin/ListaDominio"));
const TiposBeneficioAdmin = lazy(() => import("@/paginas/admin/TiposBeneficioAdmin"));
const TiposEncaminhamentoAdmin = lazy(() => import("@/paginas/admin/TiposEncaminhamentoAdmin"));
const SemAcesso = lazy(() => import("@/paginas/SemAcesso"));
const RelatoriosPainel = lazy(() => import("@/paginas/relatorios/RelatoriosPainel"));
const ConstrutorRelatorio = lazy(() => import("@/paginas/relatorios/ConstrutorRelatorio"));
const MapaTematicoLeaflet = lazy(() => import("@/paginas/vigilancia/MapaTematicoLeaflet"));
const EstoquePainel = lazy(() => import("@/paginas/estoque/EstoquePainel"));
const FinanceiroPainel = lazy(() => import("@/paginas/financeiro/FinanceiroPainel"));
const VigilanciaAvancada = lazy(() => import("@/paginas/vigilancia/VigilanciaAvancada"));
const NaoEncontrada = lazy(() => import("@/paginas/NaoEncontrada"));
const PortalCidadao = lazy(() => import("@/paginas/cidadao/PortalCidadao"));
const PanicMonitor = lazy(() => import("@/paginas/panicbutton/PanicMonitor"));
const PanicButton = lazy(() => import("@/paginas/panicbutton/PanicButton"));
const SalaMonitoramento = lazy(() => import("@/paginas/monitoramento/SalaMonitoramento"));
const PortalTransparencia = lazy(() => import("@/paginas/transparencia/PortalTransparencia"));
const BuscaAtivaPainel = lazy(() => import("@/paginas/buscaativa/BuscaAtivaPainel"));
const ReconhecimentoFacial = lazy(() => import("@/paginas/biometria/ReconhecimentoFacial"));

function Carregando() {
  return (
    <div className="p-6">
      <Skeleton variante="cartao" />
    </div>
  );
}

function Pagina({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Carregando />}>{children}</Suspense>;
}

export function Rotas() {
  return (
    <Routes>
      {/* Portal do Cidadão — acesso público sem autenticação */}
      <Route path="/cidadao" element={<Pagina><PortalCidadao /></Pagina>} />

      {/* Portal da Transparência — acesso público sem autenticação */}
      <Route path="/transparencia/:slug" element={<Pagina><PortalTransparencia /></Pagina>} />

      {/* Rotas de impressão A4 — fora da shell (§ layout de impressão). */}
      <Route path="/imprimir" element={<LayoutImpressao />}>
        <Route
          index
          element={
            <Pagina>
              <p>Selecione um documento para imprimir.</p>
            </Pagina>
          }
        />
        <Route
          path="prontuario/:familiaId"
          element={
            <Pagina>
              <GuardRota exige="prontuario.ler">
                <ProntuarioImpressao />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="comprovante/:concessaoId"
          element={
            <Pagina>
              <GuardRota exige="beneficio.conceder">
                <ComprovanteImpressao />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="guia/:encaminhamentoId"
          element={
            <Pagina>
              <GuardRota exige="encaminhamento.criar">
                <GuiaImpressao />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="rma/:rmaId"
          element={
            <Pagina>
              <GuardRota exige="rma.conferir">
                <RmaEspelhoImpressao />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="dashboard"
          element={
            <Pagina>
              <GuardRota exige="vigilancia.ver">
                <DashboardImpressao />
              </GuardRota>
            </Pagina>
          }
        />
      </Route>

      {/* Aplicação principal dentro da shell do módulo. */}
      <Route element={<ShellModulo />}>
        <Route index element={<Navigate to="/inicio" replace />} />

        <Route
          path="/inicio"
          element={
            <Pagina>
              <GuardRota>
                <InicioPorPerfil />
              </GuardRota>
            </Pagina>
          }
        />

        <Route
          path="/familias"
          element={
            <Pagina>
              <GuardRota exige="familia.ler">
                <ResultadosBusca />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/familias/nova"
          element={
            <Pagina>
              <GuardRota exige="familia.cadastrar">
                <FamiliaFormulario />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/familias/:familiaId"
          element={
            <Pagina>
              <GuardRota exige="familia.ler">
                <FichaFamilia />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/familias/:familiaId/atendimento"
          element={
            <Pagina>
              <GuardRota exige="atendimento.registrar">
                <RegistrarAtendimentoPagina />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/atendimentos"
          element={
            <Pagina>
              <GuardRota exige="prontuario.ler">
                <AtendimentosLista />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/agenda"
          element={
            <Pagina>
              <GuardRota exige="familia.ler">
                <AgendaFila />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/beneficios"
          element={
            <Pagina>
              <GuardRota exige="beneficio.conceder">
                <BeneficiosConcessao />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/grupos"
          element={
            <Pagina>
              <GuardRota exige="grupo.gerir">
                <GruposLista />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/grupos/:grupoId"
          element={
            <Pagina>
              <GuardRota exige="grupo.gerir">
                <GrupoDetalhe />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/encaminhamentos"
          element={
            <Pagina>
              <GuardRota exige="encaminhamento.criar">
                <PainelEncaminhamentos />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/encaminhamentos/novo"
          element={
            <Pagina>
              <GuardRota exige="encaminhamento.criar">
                <NovoEncaminhamentoPagina />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/encaminhamentos/:encaminhamentoId"
          element={
            <Pagina>
              <GuardRota exige="encaminhamento.criar">
                <EncaminhamentoDetalhe />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/rma"
          element={
            <Pagina>
              <GuardRota exige="rma.conferir">
                <RmaConferencia />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/vigilancia"
          element={
            <Pagina>
              <GuardRota exige="vigilancia.ver">
                <DashboardGestor />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/vigilancia/mapa"
          element={
            <Pagina>
              <GuardRota exige="vigilancia.ver">
                <MapaTematicoLeaflet />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/vigilancia/avancada"
          element={
            <Pagina>
              <GuardRota exige="vigilancia.ver">
                <VigilanciaAvancada />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/busca-ativa"
          element={
            <Pagina>
              <GuardRota exige="vigilancia.ver">
                <BuscaAtivaPainel />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/biometria"
          element={
            <Pagina>
              <GuardRota exige="biometria.gerir">
                <ReconhecimentoFacial />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/administracao"
          element={
            <Pagina>
              <GuardRota exige="administracao.gerir">
                <AdministracaoWizard />
              </GuardRota>
            </Pagina>
          }
        />

        {/* FASE 2 — Novas páginas */}
        <Route
          path="/habitacao"
          element={
            <Pagina>
              <GuardRota exige="habitacao.gerir">
                <HabitacaoPainel />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/questionarios"
          element={
            <Pagina>
              <GuardRota exige="questionario.gerir">
                <QuestionarioLista />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/questionarios/novo/editar"
          element={
            <Pagina>
              <GuardRota exige="questionario.gerir">
                <EditorQuestionario />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/questionarios/:id/editar"
          element={
            <Pagina>
              <GuardRota exige="questionario.gerir">
                <EditorQuestionario />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/notificacoes"
          element={
            <Pagina>
              <CentralNotificacoes />
            </Pagina>
          }
        />
        <Route
          path="/importar"
          element={
            <Pagina>
              <GuardRota exige="administracao.gerir">
                <ImportarDados />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/familias/nova/rapida"
          element={
            <Pagina>
              <GuardRota exige="familia.cadastrar">
                <CadastroRapido />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/exportador"
          element={
            <Pagina>
              <GuardRota exige="exportador.gerir">
                <ExportadorDados />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/relatorios"
          element={
            <Pagina>
              <GuardRota exige="vigilancia.ver">
                <RelatoriosPainel />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/relatorios/:id"
          element={
            <Pagina>
              <GuardRota exige="vigilancia.ver">
                <ConstrutorRelatorio />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/administracao/atalhos"
          element={
            <Pagina>
              <GuardRota exige="administracao.gerir">
                <AtalhosAdmin />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/administracao/tipos-beneficio"
          element={
            <Pagina>
              <GuardRota exige="administracao.gerir">
                <TiposBeneficioAdmin />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/administracao/tipos-encaminhamento"
          element={
            <Pagina>
              <GuardRota exige="administracao.gerir">
                <TiposEncaminhamentoAdmin />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/administracao/cadastros"
          element={
            <Pagina>
              <GuardRota exige="administracao.gerir">
                <CadastrosAdmin />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/administracao/cadastros/:slug"
          element={
            <Pagina>
              <GuardRota exige="administracao.gerir">
                <ListaDominio />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/familias/:familiaId/renda"
          element={
            <Pagina>
              <GuardRota exige="familia.ler">
                <RendaFamiliar />
              </GuardRota>
            </Pagina>
          }
        />

        <Route
          path="/sem-acesso"
          element={
            <Pagina>
              <SemAcesso />
            </Pagina>
          }
        />
        <Route
          path="/estoque"
          element={
            <Pagina>
              <GuardRota exige="estoque.gerir">
                <EstoquePainel />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/financeiro"
          element={
            <Pagina>
              <GuardRota exige="financeiro.gerir">
                <FinanceiroPainel />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/panic-button"
          element={
            <Pagina>
              <GuardRota exige="panico.monitorar">
                <PanicMonitor />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/panic-button/app"
          element={
            <Pagina>
              <GuardRota exige="panico.atender">
                <PanicButton />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="/monitoramento"
          element={
            <Pagina>
              <GuardRota exige="vigilancia.ver">
                <SalaMonitoramento />
              </GuardRota>
            </Pagina>
          }
        />
        <Route
          path="*"
          element={
            <Pagina>
              <NaoEncontrada />
            </Pagina>
          }
        />
      </Route>
    </Routes>
  );
}
