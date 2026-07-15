import { Link } from "react-router-dom";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import {
  useDashboardOverview,
  useFilaDoDia,
  useOnboardingStatus,
  useDashboardActivity,
} from "@/nucleo/api/hooks";
import type { DashboardActivityItem } from "@/tipos/dashboard";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EstadoErro } from "@/ui/EstadoErro";
import { Skeleton } from "@/ui/Skeleton";
import { ErroApi } from "@/nucleo/http/problemDetails";

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

  if (isLoading)
    return (
      <div className="col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variante="cartao" />
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

  return (
    <div className="col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
      <CartaoKpi
        rotulo="Atendimentos"
        valor={data.atendimentos_mes}
        icone="assignment_turned_in"
        cor="primary"
      />
      <CartaoKpi
        rotulo="Acompanhamentos"
        valor={data.acompanhamentos_ativos}
        icone="partner_exchange"
        cor="secondary"
      />
      <CartaoKpi
        rotulo="Famílias cadastradas"
        valor={data.familias_cadastradas}
        icone="family_restroom"
        cor="primary"
        para="/familias"
      />
      <CartaoKpi
        rotulo="Benefícios / mês"
        valor={data.beneficios_concedidos_mes}
        icone="request_quote"
        cor="secondary"
        para="/beneficios"
      />
      <CartaoKpi
        rotulo="Encaminhamentos"
        valor={data.encaminhamentos_pendentes}
        icone="forward_to_inbox"
        cor="primary"
        para="/encaminhamentos"
        destaque={data.encaminhamentos_pendentes > 0}
      />
      <CartaoKpi
        rotulo="Inscritos SCFV"
        valor={data.inscritos_scfv}
        detalhe={`${data.grupos_ativos} grupos ativos`}
        icone="groups"
        cor="secondary"
        para="/grupos"
      />
    </div>
  );
}

function CartaoKpi({
  rotulo,
  valor,
  detalhe,
  icone,
  cor,
  para,
  destaque,
}: {
  rotulo: string;
  valor: number;
  detalhe?: string;
  icone: string;
  cor: "primary" | "secondary";
  para?: string;
  destaque?: boolean;
}) {
  const corBg = cor === "primary" ? "bg-primary/5" : "bg-secondary/5";
  const corTexto = cor === "primary" ? "text-primary" : "text-secondary";
  const corHover = cor === "primary" ? "group-hover:bg-primary group-hover:text-on-primary" : "group-hover:bg-secondary group-hover:text-on-primary";

  const conteudo = (
    <>
      <div className="flex justify-between items-start mb-6">
        <div
          className={`w-12 h-12 rounded-xl ${corBg} flex items-center justify-center ${corTexto} ${corHover} transition-all`}
        >
          <span className="material-symbols-outlined !text-[24px]">{icone}</span>
        </div>
        <div className="w-12 h-6 flex items-end gap-0.5 opacity-20 group-hover:opacity-100 transition-opacity">
          {[30, 60, 40, 80].map((h, i) => (
            <div
              key={i}
              className={`w-full rounded-t-sm ${i === 3 ? (cor === "primary" ? "bg-primary" : "bg-secondary") : (cor === "primary" ? "bg-primary/40" : "bg-secondary/40")}`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
      <p className="font-label-sm text-outline mb-1">{rotulo}</p>
      <div className="flex items-baseline gap-2">
        <span className={`font-titulo text-2xl tabular-nums ${destaque ? "text-amber" : "text-ink"}`}>
          {valor}
        </span>
      </div>
      {detalhe && (
        <span className="text-[11px] text-ink-soft font-bold uppercase block mt-1 tracking-wide">{detalhe}</span>
      )}
    </>
  );

  const classes =
    "glass-card rounded-2xl p-6 hover:translate-y-[-4px] transition-all duration-300 group block";

  if (para) {
    return (
      <Link to={para} className={classes}>
        {conteudo}
      </Link>
    );
  }

  return <div className={classes}>{conteudo}</div>;
}

// ── Atalhos ────────────────────────────────────────────────────────
function Atalhos() {
  const podeCadastrar = usePermissao("familia.cadastrar");
  const podeConceder = usePermissao("beneficio.conceder");
  const podeEncaminhar = usePermissao("encaminhamento.criar");
  const podeVigilancia = usePermissao("vigilancia.ver");
  const podeAdmin = usePermissao("administracao.gerir");

  const itens: { rotulo: string; descricao: string; para: string; icone: string }[] = [
    { rotulo: "Buscar famílias", descricao: "Localizar registros e NIS", para: "/familias", icone: "person_search" },
  ];
  if (podeCadastrar)
    itens.push({ rotulo: "Novo cadastro", descricao: "Registrar nova família", para: "/familias/nova", icone: "person_add" });
  if (podeConceder)
    itens.push({ rotulo: "Benefício", descricao: "Conceder auxílio eventual", para: "/beneficios", icone: "card_giftcard" });
  if (podeEncaminhar)
    itens.push({ rotulo: "Encaminhar", descricao: "Enviar para rede socioassistencial", para: "/encaminhamentos", icone: "move_item" });
  if (podeVigilancia)
    itens.push({ rotulo: "Estatísticas", descricao: "Analisar indicadores locais", para: "/vigilancia", icone: "monitoring" });
  if (podeAdmin)
    itens.push({ rotulo: "Configurações", descricao: "Ajustar parâmetros do sistema", para: "/administracao", icone: "settings_accessibility" });

  if (itens.length === 1 && !podeCadastrar && !podeConceder && !podeEncaminhar && !podeVigilancia && !podeAdmin) return null;

  return (
    <section className="col-span-12 lg:col-span-8 glass-card rounded-2xl p-lg premium-shadow">
      <div className="flex items-center gap-3 mb-lg">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <span
            className="material-symbols-outlined !text-[18px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            bolt
          </span>
        </div>
        <h3 className="font-titulo text-title-md text-ink">Ações Recomendadas</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {itens.map((item) => (
          <Link
            key={item.para}
            to={item.para}
            className="flex flex-col items-start p-6 rounded-2xl border border-outline-variant/30 hover:border-primary/40 hover:bg-white hover:shadow-xl hover:shadow-primary/5 transition-all group text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-secondary group-hover:bg-primary group-hover:text-on-primary group-hover:scale-110 transition-all mb-4">
              <span className="material-symbols-outlined !text-[24px]">{item.icone}</span>
            </div>
            <span className="font-label-md text-ink mb-1">{item.rotulo}</span>
            <span className="text-[11px] text-outline">{item.descricao}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Atividade do Sistema ───────────────────────────────────────────
function formatarTempo(dataStr: string): string {
  const data = new Date(dataStr);
  const agora = new Date();
  const diffMs = agora.getTime() - data.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHoras = Math.floor(diffMs / 3600000);
  const diffDias = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Agora mesmo";
  if (diffMin < 60) return `Há ${diffMin} min`;
  if (diffHoras < 24) return `Há ${diffHoras}h`;
  if (diffDias === 1) return "Ontem";
  if (diffDias < 7) return `Há ${diffDias} dias`;
  if (diffDias < 30) return `Há ${Math.floor(diffDias / 7)} semanas`;
  return `Há ${Math.floor(diffDias / 30)} meses`;
}

const ICONE_POR_CATEGORIA: Record<string, string> = {
  config: "settings",
  acesso: "login",
  cadastro: "person_add",
  atendimento: "support_agent",
  beneficio: "volunteer_activism",
  encaminhamento: "forward",
  scfv: "groups",
  prontuario: "folder_open",
  unidade: "apartment",
  profissional: "badge",
  rma: "description",
  importacao: "upload_file",
  geral: "circle",
};

const COR_POR_CATEGORIA: Record<string, string> = {
  config: "bg-amber-100 text-amber-700",
  acesso: "bg-sky-100 text-sky-700",
  cadastro: "bg-emerald-100 text-emerald-700",
  atendimento: "bg-blue-100 text-blue-700",
  beneficio: "bg-violet-100 text-violet-700",
  encaminhamento: "bg-rose-100 text-rose-700",
  scfv: "bg-teal-100 text-teal-700",
  prontuario: "bg-amber-100 text-amber-700",
  unidade: "bg-indigo-100 text-indigo-700",
  profissional: "bg-cyan-100 text-cyan-700",
  rma: "bg-slate-100 text-slate-700",
  importacao: "bg-orange-100 text-orange-700",
  geral: "bg-surface-container-high text-outline",
};

function CartaoAtividade() {
  const { data, isLoading, isError } = useDashboardActivity(10);

  return (
    <section className="col-span-12 lg:col-span-4 glass-card rounded-2xl p-lg premium-shadow bg-white flex flex-col">
      <div className="flex items-center justify-between mb-lg">
        <h3 className="font-titulo text-title-md text-ink">Atividade do Sistema</h3>
      </div>

      <div className="flex-1">
        {isLoading ? (
          <Skeleton variante="tabela" linhas={4} />
        ) : isError || !data || data.length === 0 ? (
          <div className="space-y-8">
            <div className="flex gap-4 items-start relative group">
              <div className="absolute left-[11px] top-8 bottom-[-24px] w-[2px] bg-surface-container-high" />
              <div className="w-6 h-6 rounded-full bg-primary/20 border-4 border-white z-10 shadow-sm flex items-center justify-center shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              </div>
              <div className="flex-1">
                <p className="font-label-md text-ink leading-tight">Configuração inicial processada</p>
                <p className="text-[12px] text-outline mt-1 flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-[12px]">schedule</span> Recentemente
                </p>
              </div>
            </div>
            <div className="flex gap-4 items-start relative group">
              <div className="w-6 h-6 rounded-full bg-surface-container-high border-4 border-white z-10 flex items-center justify-center shrink-0" />
              <div className="flex-1 pt-0.5">
                <p className="font-body-md text-outline italic">Nenhum evento recente registrado.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {data.map((item: DashboardActivityItem, i: number) => {
              const isPrimeiro = i === 0;
              const isUltimo = i === data.length - 1;
              const corBadge = COR_POR_CATEGORIA[item.categoria] ?? COR_POR_CATEGORIA.geral;
              const icone = ICONE_POR_CATEGORIA[item.categoria] ?? ICONE_POR_CATEGORIA.geral;
              return (
                <div key={item.id} className="flex gap-4 items-start relative group">
                  {!isUltimo && (
                    <div className="absolute left-[11px] top-8 bottom-[-24px] w-[2px] bg-surface-container-high" />
                  )}
                  <div
                    className={`w-6 h-6 rounded-full border-4 border-white z-10 shadow-sm flex items-center justify-center shrink-0 ${
                      isPrimeiro ? corBadge : "bg-surface-container-high"
                    }`}
                  >
                    {isPrimeiro ? (
                      <span className="material-symbols-outlined !text-[14px]">{icone}</span>
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-outline" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-label-md text-ink leading-tight">{item.texto}</p>
                    <p className="text-[13px] text-ink-soft mt-0.5 leading-snug">{item.descricao}</p>
                    <p className="text-[12px] text-outline mt-1 flex items-center gap-1.5">
                      <span className="material-symbols-outlined !text-[12px]">schedule</span>
                      {formatarTempo(item.data)}
                      {item.ator && (
                        <>
                          <span className="text-outline/40 mx-0.5">·</span>
                          {item.ator}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {data && data.length === 0 && (
          <div className="mt-xl text-center px-md py-lg rounded-2xl bg-surface-container-lowest/50 border border-dashed border-outline-variant/50">
            <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mx-auto mb-4 border border-primary/5">
              <span className="material-symbols-outlined text-primary !text-[40px] opacity-30">history_edu</span>
            </div>
            <p className="font-label-md text-ink mb-1">Primeiros passos</p>
            <p className="font-body-sm text-outline px-4">
              Os registros de atendimentos e concessões aparecerão cronologicamente aqui.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Saudação (baseada no horário) ─────────────────────────────────
function saudacaoPorHorario(nome: string): string {
  const hora = new Date().getHours();
  const prefixo = hora < 6 ? "Boa noite" : hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  return `${prefixo}, ${nome}`;
}

// ── Dashboard Principal ────────────────────────────────────────────
export default function InicioPorPerfil() {
  const { usuario } = useSessao();
  const { unidadeAtual } = useUnidadeAtual();
  const podeVerIndicadores = usePermissao("vigilancia.ver");
  const podeConfigurar = usePermissao("administracao.gerir");
  const podeConferirRma = usePermissao("rma.conferir");

  const nomeUsuario = usuario?.name?.split(" ")[0] ?? "Usuário";

  return (
    <div className="space-y-lg">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="font-titulo text-headline-xl text-ink tracking-tight mb-2">
            {saudacaoPorHorario(nomeUsuario)}
          </h2>
          <p className="font-body-lg text-body-lg text-tertiary">
            Seu painel de controle centralizado — Bem-vindo ao{" "}
            <span className="font-semibold text-ink">GovSocial</span>.
          </p>
        </div>
        <div className="flex gap-3">
          {podeConferirRma && (
            <Link
              to="/rma"
              className="px-6 py-3 rounded-xl border border-outline-variant bg-white font-label-md text-label-md text-secondary hover:bg-surface-container-low transition-all"
            >
              Relatório Mensal
            </Link>
          )}
          <Link
            to="/atendimentos"
            className="px-6 py-3 rounded-xl gradient-primary shadow-lg shadow-primary/25 font-label-md text-label-md text-on-primary flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined !text-[20px]">add</span>
            Novo Atendimento
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-gutter">
        {podeConfigurar && <CartaoOnboarding />}

        {podeVerIndicadores && <PainelKpis />}

        <Atalhos />
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

      {/* FAB */}
      <Link
        to="/atendimentos"
        className="nao-imprimir fixed bottom-10 right-10 w-16 h-16 gradient-primary text-on-primary rounded-2xl shadow-2xl shadow-primary/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 z-[60] group"
        aria-label="Acesso rápido"
        title="Novo atendimento"
      >
        <span className="material-symbols-outlined !text-[32px]">add</span>
        <span className="absolute right-20 bg-ink text-white text-[11px] px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Novo Atendimento
        </span>
      </Link>
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
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110 transition-all"
        >
          Abrir fila
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
        <EstadoVazio
          titulo="Ninguém na fila agora"
          descricao="Os check-ins da recepção e os agendamentos de hoje aparecem aqui."
        />
      ) : (
        (() => {
          const aguardando = data.filter((a) => a.status === "AGUARDANDO").length;
          const emAtendimento = data.filter((a) => a.status === "EM_ATENDIMENTO").length;
          return (
            <div className="flex flex-wrap gap-8">
              <div>
                <p className="text-2xl font-bold tabular-nums text-ink">{data.length}</p>
                <p className="text-xs text-ink-soft">na fila hoje</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-amber-600">{aguardando}</p>
                <p className="text-xs text-ink-soft">aguardando</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-ink">{emAtendimento}</p>
                <p className="text-xs text-ink-soft">em atendimento</p>
              </div>
            </div>
          );
        })()
      )}
    </section>
  );
}
