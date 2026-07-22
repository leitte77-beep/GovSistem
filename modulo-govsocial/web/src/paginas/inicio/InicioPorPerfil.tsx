import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import {
  useDashboardOverview,
  useFilaDoDia,
  useOnboardingStatus,
  useDashboardActivity,
  useRecommendationScope,
  useDashboardSerie,
} from "@/nucleo/api/hooks";
import type { DashboardActivityItem } from "@/tipos/dashboard";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EstadoErro } from "@/ui/EstadoErro";
import { Skeleton } from "@/ui/Skeleton";
import { KPICard } from "@/ui/KPICard";
import { ActivityItem } from "@/ui/ActivityItem";
import { SpeedDial } from "@/ui/SpeedDial";
import { getRecommendations } from "@/nucleo/recomendacoes/recomendacoes";
import { agora, dataPorExtensoCurta, competenciaAtual } from "@/nucleo/datas";
import { ErroApi } from "@/nucleo/http/problemDetails";
import { textos } from "@/i18n/textos";

// ── Onboarding ────────────────────────────────────────────────────
const ROTULO_ETAPA: Record<string, string> = {
  units: "Unidades (CRAS, CREAS…)",
  territories: "Territórios e bairros",
  benefits: "Tipos de benefício",
  professionals: "Equipe / profissionais",
  import: "Importação do CadÚnico",
};

function CartaoOnboarding() {
  const { data, isLoading, isError, error, refetch } = useOnboardingStatus();

  if (isLoading) return <Skeleton variante="cartao" />;
  if (isError || !data)
    return (
      <EstadoErro
        problema={(error as ErroApi).problema}
        aoTentarNovamente={() => void refetch()}
      />
    );
  if (data.ready) return null;

  const feitas = data.steps.filter((e) => e.completed).length;
  const total = data.steps.length;

  return (
    <section className="col-span-12 glass-card rounded-2xl p-lg premium-shadow relative overflow-hidden group border-none">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full -mr-48 -mt-48 transition-transform duration-700 group-hover:scale-110" />
      <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-secondary/5 rounded-full -ml-24 -mb-24 blur-3xl" />
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-lg relative z-10">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary font-bold text-[11px] uppercase tracking-wider mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Configuração Necessária
          </div>
          <h3 className="font-titulo text-headline-lg text-ink mb-3">
            Conclua a configuração do município
          </h3>
          <p className="font-body-md text-body-md text-tertiary">
            Para que todas as funcionalidades estejam disponíveis, conclua as
            etapas estruturais.{" "}
            <span className="font-bold text-primary">
              {feitas} de {total} concluídas.
            </span>
          </p>
        </div>
        <Link
          to="/administracao"
          className="group/btn flex items-center gap-3 bg-ink text-white px-8 py-4 rounded-xl font-label-md text-label-md hover:bg-primary transition-all premium-shadow shrink-0"
        >
          Continuar agora
          <span className="material-symbols-outlined group-hover/btn:translate-x-1 transition-transform">
            arrow_forward
          </span>
        </Link>
      </div>
      <div className="mt-lg grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 relative z-10">
        {data.steps.map((etapa) => (
          <div
            key={etapa.step}
            className={`flex flex-col gap-3 p-5 rounded-2xl border transition-all ${
              etapa.completed
                ? "border-primary/20 bg-primary/5"
                : "border-outline-variant/30 bg-white/50 hover:bg-white hover:border-primary/20 cursor-pointer"
            }`}
          >
            {etapa.completed ? (
              <span
                className="material-symbols-outlined text-primary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                check_circle
              </span>
            ) : (
              <span className="material-symbols-outlined text-outline">
                {etapa.step === "units"
                  ? "domain"
                  : etapa.step === "territories"
                    ? "map"
                    : etapa.step === "benefits"
                      ? "card_giftcard"
                      : etapa.step === "professionals"
                        ? "badge"
                        : "cloud_download"}
              </span>
            )}
            <p className={`font-label-md ${etapa.completed ? "text-primary font-bold" : "text-ink"}`}>
              {ROTULO_ETAPA[etapa.step] ?? etapa.step}
            </p>
            <div className="h-1 w-full bg-surface-container rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${etapa.completed ? "bg-primary w-full" : "bg-outline/20 w-0"}`}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── KPIs ───────────────────────────────────────────────────────────
function PainelKpis() {
  const { data, isLoading, isError, error, refetch } = useDashboardOverview();
  const { data: serieData } = useDashboardSerie(6);

  const sparklines = useMemo(() => {
    if (!serieData || serieData.length < 2) return null;
    return {
      atendimentos: serieData.map((s) => s.atendimentos),
      beneficios: serieData.map((s) => s.beneficios),
    };
  }, [serieData]);

  // KILL-SWITCH: só permite decoração no canto direito se há série com variação
  const hasAtendSeries =
    Array.isArray(sparklines?.atendimentos) &&
    sparklines!.atendimentos.length >= 2 &&
    Math.max(...sparklines!.atendimentos) !== Math.min(...sparklines!.atendimentos);
  const hasBenefSeries =
    Array.isArray(sparklines?.beneficios) &&
    sparklines!.beneficios.length >= 2 &&
    Math.max(...sparklines!.beneficios) !== Math.min(...sparklines!.beneficios);

  if (isLoading)
    return (
      <div className="col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <KPICard key={i} label="" value={0} loading />
        ))}
      </div>
    );
  if (isError || !data)
    return (
      <div className="col-span-12">
        <EstadoErro
          problema={(error as ErroApi).problema}
          aoTentarNovamente={() => void refetch()}
        />
      </div>
    );

  const zeroAtend = data.atendimentos_mes === 0;
  const zeroAcomp = data.acompanhamentos_ativos === 0;
  const zeroFam = data.familias_cadastradas === 0;
  const zeroBenef = data.beneficios_concedidos_mes === 0;
  const zeroEnc = data.encaminhamentos_pendentes === 0;
  const zeroScfv = data.inscritos_scfv === 0;

  return (
    <div className="col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
      <KPICard
        label={textos.kpi.atendimentos}
        value={data.atendimentos_mes}
        hint={zeroAtend ? textos.kpi.zeroAtendimentos : undefined}
        sparkline={sparklines?.atendimentos}
        showDecoration={hasAtendSeries}
        accent
        to="/atendimentos"
      />
      <KPICard
        label={textos.kpi.acompanhamentos}
        value={data.acompanhamentos_ativos}
        hint={zeroAcomp ? textos.kpi.zeroAcompanhamentos : undefined}
      />
      <KPICard
        label={textos.kpi.familiasCadastradas}
        value={data.familias_cadastradas}
        hint={zeroFam ? textos.kpi.zeroFamilias : undefined}
        to="/familias"
      />
      <KPICard
        label={textos.kpi.beneficiosMes}
        value={data.beneficios_concedidos_mes}
        hint={zeroBenef ? textos.kpi.zeroBeneficios : undefined}
        sparkline={sparklines?.beneficios}
        showDecoration={hasBenefSeries}
        to="/beneficios"
      />
      <KPICard
        label={textos.kpi.encaminhamentos}
        value={data.encaminhamentos_pendentes}
        hint={zeroEnc ? textos.kpi.zeroEncaminhamentos : undefined}
        accent={data.encaminhamentos_pendentes > 0}
        to="/encaminhamentos"
      />
      <KPICard
        label={textos.kpi.inscritosSCFV}
        value={data.inscritos_scfv}
        hint={zeroScfv ? textos.kpi.zeroInscritos : undefined}
        to="/grupos"
      />
    </div>
  );
}

// ── Recomendações ──────────────────────────────────────────────────

const ICONE_RECOMENDACAO: Record<string, string> = {
  alerta: "warning",
  atencao: "error",
  info: "info",
};

const COR_RECOMENDACAO: Record<string, string> = {
  alerta: "bg-amber/10 text-amber",
  atencao: "bg-primary-soft text-primary",
  info: "bg-surface-container-high text-ink-soft",
};

export function Recomendacoes() {
  const podeCadastrar = usePermissao("familia.cadastrar");
  const podeConceder = usePermissao("beneficio.conceder");
  const podeEncaminhar = usePermissao("encaminhamento.criar");
  const podeVigilancia = usePermissao("vigilancia.ver");
  const podeAdmin = usePermissao("administracao.gerir");

  const { data: scope, isLoading, isError } = useRecommendationScope();

  const recomendacoes = useMemo(
    () => (scope && !isError ? getRecommendations(scope) : null),
    [scope, isError],
  );

  // Estados, em prioridade: (1) loading; (2) erro no serviço → fallback estático
  // (degradação graciosa); (3) serviço ok com ≥1 regra → cards; (4) serviço ok
  // com 0 regras → "tudo em dia" + 2 atalhos mínimos.
  const estado: "erro" | "com-regras" | "vazio" =
    isError || !recomendacoes
      ? "erro"
      : recomendacoes.length > 0
        ? "com-regras"
        : "vazio";

  const rotuloSecao = estado === "erro" ? textos.dashboard.acoesRapidas : textos.dashboard.recomendacoes;

  if (isLoading) {
    return (
      <section className="col-span-12 lg:col-span-8 glass-card rounded-2xl p-lg premium-shadow">
        <Skeleton variante="tabela" linhas={3} />
      </section>
    );
  }

  return (
    <section className="col-span-12 lg:col-span-8 glass-card rounded-2xl p-lg premium-shadow">
      <div className="flex items-center gap-3 mb-lg">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <span
            className="material-symbols-outlined !text-[18px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {estado === "erro" ? "bolt" : "lightbulb"}
          </span>
        </div>
        <h3 className="font-titulo text-title-md text-ink">{rotuloSecao}</h3>
      </div>

      {estado === "erro" && (
        <FallbackAcoes
          podeCadastrar={podeCadastrar}
          podeConceder={podeConceder}
          podeEncaminhar={podeEncaminhar}
          podeVigilancia={podeVigilancia}
          podeAdmin={podeAdmin}
        />
      )}

      {estado === "vazio" && (
        <div>
          <EstadoVazio
            titulo={textos.dashboard.tudoEmDia}
            descricao={textos.dashboard.tudoEmDiaDescricao}
          />
          <div className="grid grid-cols-2 gap-4 mt-lg">
            <Link
              to="/familias"
              className="flex items-center gap-3 p-4 rounded-xl border border-outline-variant/30 hover:border-primary/40 hover:bg-surface-container-lowest transition-all focus-visible:outline-focus"
            >
              <span className="material-symbols-outlined text-secondary !text-[20px]">person_search</span>
              <span className="font-label-md text-ink">{textos.acoes.buscarFamilias}</span>
            </Link>
            {podeCadastrar && (
              <Link
                to="/familias/nova"
                className="flex items-center gap-3 p-4 rounded-xl border border-outline-variant/30 hover:border-primary/40 hover:bg-surface-container-lowest transition-all focus-visible:outline-focus"
              >
                <span className="material-symbols-outlined text-secondary !text-[20px]">person_add</span>
                <span className="font-label-md text-ink">{textos.acoes.novoCadastro}</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {estado === "com-regras" && recomendacoes && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recomendacoes.slice(0, 6).map((rec) => (
            <Link
              key={rec.id}
              to={rec.to}
              className="flex items-start gap-4 p-4 rounded-xl border border-outline-variant/30 hover:border-primary/40 hover:bg-surface-container-lowest transition-all group text-left focus-visible:outline-focus"
              aria-label={`${rec.title}. ${rec.ctaLabel}`}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${COR_RECOMENDACAO[rec.severity] ?? COR_RECOMENDACAO.info}`}
              >
                <span className="material-symbols-outlined !text-[20px]">
                  {ICONE_RECOMENDACAO[rec.severity] ?? "circle"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-label-md text-ink group-hover:text-primary transition-colors leading-snug">
                  {rec.title}
                </p>
                {rec.detail && (
                  <p className="text-xs text-ink-soft mt-1 line-clamp-2">{rec.detail}</p>
                )}
                <span className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-primary group-hover:underline">
                  {rec.ctaLabel}
                  <span className="material-symbols-outlined !text-[14px]">arrow_forward</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function FallbackAcoes({
  podeCadastrar,
  podeConceder,
  podeEncaminhar,
  podeVigilancia,
  podeAdmin,
}: {
  podeCadastrar: boolean;
  podeConceder: boolean;
  podeEncaminhar: boolean;
  podeVigilancia: boolean;
  podeAdmin: boolean;
}) {
  const itens: { rotulo: string; descricao: string; para: string; icone: string }[] = [];
  itens.push({ rotulo: textos.acoes.buscarFamilias, descricao: "Localizar registros e NIS", para: "/familias", icone: "person_search" });
  if (podeCadastrar)
    itens.push({ rotulo: textos.acoes.novoCadastro, descricao: "Registrar nova família", para: "/familias/nova", icone: "person_add" });
  if (podeConceder)
    itens.push({ rotulo: textos.acoes.beneficio, descricao: "Conceder auxílio eventual", para: "/beneficios", icone: "card_giftcard" });
  if (podeEncaminhar)
    itens.push({ rotulo: textos.acoes.encaminhar, descricao: "Enviar para rede socioassistencial", para: "/encaminhamentos", icone: "move_item" });
  if (podeVigilancia)
    itens.push({ rotulo: textos.acoes.estatisticas, descricao: "Analisar indicadores locais", para: "/vigilancia", icone: "monitoring" });
  if (podeAdmin)
    itens.push({ rotulo: textos.acoes.configuracoes, descricao: "Ajustar parâmetros do sistema", para: "/administracao", icone: "settings_accessibility" });

  return (
    <>
      {itens.length === 0 && (
        <EstadoVazio
          titulo={textos.dashboard.tudoEmDia}
          descricao="Use a busca global para localizar registros rapidamente."
        />
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {itens.map((item) => (
          <Link
            key={item.para}
            to={item.para}
            className="flex flex-col items-start p-6 rounded-2xl border border-outline-variant/30 hover:border-primary/40 hover:bg-surface-container-lowest hover:shadow-xl hover:shadow-primary/5 transition-all group text-left focus-visible:outline-focus"
          >
            <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-secondary group-hover:bg-primary group-hover:text-on-primary group-hover:scale-110 transition-all mb-4">
              <span className="material-symbols-outlined !text-[24px]">{item.icone}</span>
            </div>
            <span className="font-label-md text-ink mb-1">{item.rotulo}</span>
            <span className="text-[11px] text-ink-soft">{item.descricao}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

// ── Atividade do Sistema ───────────────────────────────────────────
function CartaoAtividade() {
  const { data, isLoading, isError } = useDashboardActivity(10);

  return (
    <section className="col-span-12 lg:col-span-4 glass-card rounded-2xl p-lg premium-shadow bg-surface-container-lowest flex flex-col">
      <div className="flex items-center justify-between mb-lg">
        <h3 className="font-titulo text-title-md text-ink">Atividade do Sistema</h3>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[480px] pr-1 space-y-8">
        {isLoading ? (
          <Skeleton variante="trilha" linhas={4} />
        ) : isError || !data || data.length === 0 ? (
          <div className="space-y-8">
            <div className="flex gap-4 items-start">
              <div className="w-6 h-6 rounded-full bg-primary/20 border-4 border-white z-10 shadow-sm flex items-center justify-center shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              </div>
              <div className="flex-1">
                <p className="font-label-md text-ink leading-tight">Sistema iniciado</p>
                <p className="text-[12px] text-ink-soft mt-1 flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-[12px]">schedule</span>
                  Recentemente
                </p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-6 h-6 rounded-full bg-surface-container-high border-4 border-white z-10 flex items-center justify-center shrink-0" />
              <div className="flex-1 pt-0.5">
                <p className="font-body-md text-ink-soft italic">{textos.dashboard.atividadeVazia}</p>
              </div>
            </div>
          </div>
        ) : (
          data.map((item: DashboardActivityItem, i: number) => (
            <ActivityItem
              key={item.id}
              item={item}
              isLast={i === data.length - 1}
            />
          ))
        )}
      </div>

      {data && data.length > 0 && (
        <div className="mt-lg pt-md border-t border-surface-container-high">
          <Link
            to="/notificacoes"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            {textos.dashboard.verAtividadeCompleta}
            <span className="material-symbols-outlined !text-[14px]">arrow_forward</span>
          </Link>
        </div>
      )}
    </section>
  );
}

// ── Saudação (baseada no horário) ─────────────────────────────────
function saudacaoPorHorario(nome: string): string {
  const hora = agora().getHours();
  const prefixo = hora < 6 ? textos.dashboard.saudacao.boaNoite : hora < 12 ? textos.dashboard.saudacao.bomDia : hora < 18 ? textos.dashboard.saudacao.boaTarde : textos.dashboard.saudacao.boaNoite;
  const data = dataPorExtensoCurta();
  return `${prefixo}, ${nome} — ${data}`;
}

// ── Dashboard Principal ────────────────────────────────────────────
export default function InicioPorPerfil() {
  const { usuario } = useSessao();
  const { unidadeAtual } = useUnidadeAtual();
  const podeVerIndicadores = usePermissao("vigilancia.ver");
  const podeConfigurar = usePermissao("administracao.gerir");
  const podeConferirRma = usePermissao("rma.conferir");
  const podeAtendimento = usePermissao("atendimento.registrar");
  const podeCadastrar = usePermissao("familia.cadastrar");
  const podeEncaminhar = usePermissao("encaminhamento.criar");
  const podeConceder = usePermissao("beneficio.conceder");

  const nomeUsuario = usuario?.name?.split(" ")[0] ?? "Usuário";
  const competencia = competenciaAtual();

  return (
    <div className="space-y-lg pb-28">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="font-titulo text-headline-xl text-ink tracking-tight mb-2">
            {saudacaoPorHorario(nomeUsuario)}
          </h2>
          <p className="font-body-lg text-body-lg text-ink-soft">
            {textos.dashboard.escopo.replace("{unidade}", unidadeAtual?.nome ?? "—")}
            {" · "}
            {textos.dashboard.competencia.replace("{mes}", competencia.split("/")[0]).replace("{ano}", competencia.split("/")[1])}
          </p>
        </div>
        <div className="flex gap-3">
          {podeConferirRma && (
            <Link
              to="/rma"
              className="inline-flex items-center justify-center gap-2 rounded-input font-corpo font-semibold transition-[filter,border-color,color] focus-visible:outline-focus text-sm px-3 min-h-[36px] bg-surface text-ink border border-ink-soft/30 hover:border-primary hover:text-primary"
            >
              {textos.acoes.relatorioMensal}
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-gutter">
        {podeConfigurar && <CartaoOnboarding />}

        {podeVerIndicadores && <PainelKpis />}

        <Recomendacoes />
        <CartaoAtividade />

        {unidadeAtual && (
          <FilaDoDia unitId={unidadeAtual.id} />
        )}

        {!unidadeAtual && !podeConfigurar && !podeVerIndicadores && (
          <section className="col-span-12 glass-card rounded-2xl p-lg premium-shadow">
            <EstadoVazio
              titulo="Selecione uma unidade para começar"
              descricao="Assim que uma unidade estiver disponível para o seu perfil, a fila e os atendimentos do dia aparecem aqui."
            />
          </section>
        )}
      </div>

      {/* SpeedDial */}
      <SpeedDial
        actions={[
          {
            id: "atendimento",
            label: textos.acoes.novoAtendimento,
            icon: "support_agent",
            to: "/atendimentos",
            permission: podeAtendimento,
          },
          {
            id: "familia",
            label: textos.acoes.cadastrarFamilia,
            icon: "person_add",
            to: "/familias/nova",
            permission: podeCadastrar,
          },
          {
            id: "encaminhamento",
            label: textos.acoes.encaminhar,
            icon: "move_item",
            to: "/encaminhamentos/novo",
            permission: podeEncaminhar,
          },
          {
            id: "beneficio",
            label: textos.acoes.concederBeneficio,
            icon: "card_giftcard",
            to: "/beneficios",
            permission: podeConceder,
          },
        ]}
      />
    </div>
  );
}

// ── Fila do dia ────────────────────────────────────────────────────
function FilaDoDia({ unitId }: { unitId: string }) {
  const { data, isLoading, isError, error, refetch } = useFilaDoDia(unitId);

  return (
    <section className="col-span-12 lg:col-span-6 glass-card rounded-2xl p-lg premium-shadow">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-xl">
              list_alt
            </span>
          </div>
          <h3 className="text-lg font-bold text-ink">Fila do dia</h3>
        </div>
        <Link
          to="/agenda"
          className="inline-flex items-center gap-1.5 rounded-input bg-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110 transition-all focus-visible:outline-focus"
        >
          {textos.acoes.abrirFila}
          <span className="material-symbols-outlined text-base">arrow_forward</span>
        </Link>
      </div>

      {isLoading ? (
        <Skeleton variante="tabela" linhas={3} />
      ) : isError || !data ? (
        <EstadoErro
          problema={(error as ErroApi).problema}
          aoTentarNovamente={() => void refetch()}
        />
      ) : data.length === 0 ? (
        <div className="flex items-center gap-4 py-3">
          <div className="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary/50 !text-[20px]">check_circle</span>
          </div>
          <div>
            <p className="font-label-md text-ink">{textos.dashboard.filaVaziaTitulo}</p>
            <p className="text-xs text-ink-soft">{textos.dashboard.filaVaziaDescricao}</p>
          </div>
        </div>
      ) : (
        (() => {
          const aguardando = data.filter((a) => a.status === "AGUARDANDO").length;
          const emAtendimento = data.filter((a) => a.status === "EM_ATENDIMENTO").length;
          return (
            <div className="flex flex-wrap gap-8">
              <div>
                <p className="text-2xl font-bold tabular-nums text-ink">{data.length}</p>
                <p className="text-xs text-ink-soft">{textos.dashboard.naFilaHoje}</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-amber">{aguardando}</p>
                <p className="text-xs text-ink-soft">{textos.dashboard.aguardando}</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-ink">{emAtendimento}</p>
                <p className="text-xs text-ink-soft">{textos.dashboard.emAtendimento}</p>
              </div>
            </div>
          );
        })()
      )}
    </section>
  );
}
