import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Circle,
  HandCoins,
  Send,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import {
  useDashboardOverview,
  useFilaDoDia,
  useOnboardingStatus,
} from "@/nucleo/api/hooks";
import type { Papel } from "@/tipos/api";
import { CartaoIndicador } from "@/paginas/vigilancia/CartaoIndicador";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EstadoErro } from "@/ui/EstadoErro";
import { Skeleton } from "@/ui/Skeleton";
import { ErroApi } from "@/nucleo/http/problemDetails";

/**
 * Início por perfil (§3): agrega os números e as ações do dia da pessoa que
 * entrou, sempre a partir dos dados reais da API (não há mais placeholders de
 * fase). Cada bloco é renderizado apenas quando a capacidade correspondente
 * existe, então nenhum perfil recebe 403 — a subárvore simplesmente não monta.
 */

function Cartao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: { rotulo: string; para: string };
  children: ReactNode;
}) {
  return (
    <section className="rounded-cartao border border-ink-soft/15 bg-surface p-5 shadow-um">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base">{titulo}</h2>
        {acao && (
          <Link
            to={acao.para}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-focus"
          >
            {acao.rotulo}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

// ── Onboarding do tenant (gestor/admin) ──────────────────────────
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

  return (
    <section className="rounded-cartao border border-primary/30 bg-primary/5 p-5 shadow-um">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Configuração inicial do município</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Conclua as etapas abaixo para liberar o sistema para as equipes.
            {" "}
            {feitas} de {data.steps.length} concluídas.
          </p>
        </div>
        <Link
          to="/administracao"
          className="inline-flex items-center gap-1.5 rounded-input bg-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline-focus"
        >
          Continuar configuração
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {data.steps.map((etapa) => (
          <li key={etapa.step} className="flex items-center gap-2 text-sm">
            {etapa.completed ? (
              <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
            ) : (
              <Circle className="h-4 w-4 text-ink-soft/50" aria-hidden />
            )}
            <span className={etapa.completed ? "text-ink-soft line-through" : ""}>
              {ROTULO_ETAPA[etapa.step] ?? etapa.step}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Indicadores do município (gestor/vigilância/coordenação) ─────
function PainelKpis() {
  const { data, isLoading, isError, error, refetch } = useDashboardOverview();

  if (isLoading)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variante="cartao" />
        ))}
      </div>
    );
  if (isError || !data)
    return (
      <EstadoErro
        problema={(error as ErroApi).problema}
        aoTentarNovamente={() => void refetch()}
      />
    );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <CartaoIndicador
        rotulo="Atendimentos no mês"
        valor={data.atendimentos_mes}
        icone={<ClipboardList className="h-5 w-5" />}
      />
      <CartaoIndicador
        rotulo="Acompanhamentos ativos"
        valor={data.acompanhamentos_ativos}
        para="/vigilancia"
        icone={<Users className="h-5 w-5" />}
      />
      <CartaoIndicador
        rotulo="Famílias cadastradas"
        valor={data.familias_cadastradas}
        para="/familias"
        icone={<Users className="h-5 w-5" />}
      />
      <CartaoIndicador
        rotulo="Benefícios no mês"
        valor={data.beneficios_concedidos_mes}
        para="/beneficios"
        icone={<HandCoins className="h-5 w-5" />}
      />
      <CartaoIndicador
        rotulo="Encaminhamentos pendentes"
        valor={data.encaminhamentos_pendentes}
        para="/encaminhamentos"
        destaque={data.encaminhamentos_pendentes > 0 ? "amber" : undefined}
        icone={<Send className="h-5 w-5" />}
      />
      <CartaoIndicador
        rotulo="Inscritos no SCFV"
        valor={data.inscritos_scfv}
        detalhe={`${data.grupos_ativos} grupos ativos`}
        para="/grupos"
        icone={<Users className="h-5 w-5" />}
      />
    </div>
  );
}

// ── Fila do dia da unidade (recepção/técnicos) ───────────────────
function CartaoFilaDoDia({ unitId }: { unitId: string }) {
  const { data, isLoading, isError, error, refetch } = useFilaDoDia(unitId);

  return (
    <Cartao titulo="Fila do dia" acao={{ rotulo: "Abrir fila", para: "/agenda" }}>
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
          const emAtendimento = data.filter(
            (a) => a.status === "EM_ATENDIMENTO",
          ).length;
          return (
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="font-titulo text-2xl tabular-nums text-ink">
                  {data.length}
                </p>
                <p className="text-xs text-ink-soft">na fila hoje</p>
              </div>
              <div>
                <p className="font-titulo text-2xl tabular-nums text-amber">
                  {aguardando}
                </p>
                <p className="text-xs text-ink-soft">aguardando</p>
              </div>
              <div>
                <p className="font-titulo text-2xl tabular-nums text-ink">
                  {emAtendimento}
                </p>
                <p className="text-xs text-ink-soft">em atendimento</p>
              </div>
            </div>
          );
        })()
      )}
    </Cartao>
  );
}

// ── Atalhos por capacidade ───────────────────────────────────────
function Atalhos() {
  const podeCadastrar = usePermissao("familia.cadastrar");
  const podeConceder = usePermissao("beneficio.conceder");
  const podeEncaminhar = usePermissao("encaminhamento.criar");
  const podeVigilancia = usePermissao("vigilancia.ver");
  const podeAdmin = usePermissao("administracao.gerir");

  const itens: { rotulo: string; para: string; icone: ReactNode }[] = [];
  itens.push({ rotulo: "Buscar famílias", para: "/familias", icone: <Users className="h-4 w-4" /> });
  if (podeCadastrar)
    itens.push({ rotulo: "Cadastrar família", para: "/familias/nova", icone: <UserPlus className="h-4 w-4" /> });
  if (podeConceder)
    itens.push({ rotulo: "Conceder benefício", para: "/beneficios", icone: <HandCoins className="h-4 w-4" /> });
  if (podeEncaminhar)
    itens.push({ rotulo: "Encaminhar", para: "/encaminhamentos", icone: <Send className="h-4 w-4" /> });
  if (podeVigilancia)
    itens.push({ rotulo: "Ver dashboard", para: "/vigilancia", icone: <BarChart3 className="h-4 w-4" /> });
  if (podeAdmin)
    itens.push({ rotulo: "Administração", para: "/administracao", icone: <Settings className="h-4 w-4" /> });

  return (
    <Cartao titulo="Atalhos">
      <nav className="flex flex-wrap gap-2">
        {itens.map((i) => (
          <Link
            key={i.para}
            to={i.para}
            className="inline-flex items-center gap-1.5 rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm hover:border-primary focus-visible:outline-focus"
          >
            {i.icone}
            {i.rotulo}
          </Link>
        ))}
      </nav>
    </Cartao>
  );
}

export default function InicioPorPerfil() {
  const { usuario, papeis } = useSessao();
  const { unidadeAtual } = useUnidadeAtual();
  const perfil = papelPrincipal(papeis);

  const podeVerIndicadores = usePermissao("vigilancia.ver");
  const podeConfigurar = usePermissao("administracao.gerir");

  const saudacao = usuario?.name ? `Olá, ${usuario.name.split(" ")[0]}` : "Início";
  const contexto = unidadeAtual ? ` · ${unidadeAtual.nome}` : "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl">{saudacao}</h1>
        <p className="text-sm text-ink-soft">
          Painel de {rotuloPerfil(perfil)}
          {contexto}
        </p>
      </div>

      {podeConfigurar && <CartaoOnboarding />}

      {podeVerIndicadores && <PainelKpis />}

      <div className="grid gap-4 md:grid-cols-2">
        {unidadeAtual && <CartaoFilaDoDia unitId={unidadeAtual.id} />}
        <Atalhos />
      </div>

      {!unidadeAtual && !podeConfigurar && !podeVerIndicadores && (
        <Cartao titulo="Bem-vindo(a)">
          <EstadoVazio
            titulo="Selecione uma unidade para começar"
            descricao="Assim que uma unidade estiver disponível para o seu perfil, a fila e os atendimentos do dia aparecem aqui."
          />
        </Cartao>
      )}
    </div>
  );
}

function papelPrincipal(papeis: Papel[]): Papel {
  const ordem: Papel[] = [
    "gestor_municipal",
    "coordenador_unidade",
    "tecnico_superior",
    "tecnico_medio",
    "vigilancia",
    "recepcao",
    "conselho",
    "ADMIN",
    "suporte_govassist",
  ];
  return ordem.find((p) => papeis.includes(p)) ?? papeis[0] ?? "recepcao";
}

function rotuloPerfil(p: Papel): string {
  const mapa: Record<Papel, string> = {
    ADMIN: "administração",
    suporte_govassist: "suporte",
    recepcao: "recepção",
    tecnico_medio: "técnico(a) de nível médio",
    tecnico_superior: "técnico(a) de referência",
    coordenador_unidade: "coordenação da unidade",
    gestor_municipal: "gestão municipal",
    vigilancia: "vigilância socioassistencial",
    conselho: "conselho",
  };
  return mapa[p] ?? "usuário";
}
