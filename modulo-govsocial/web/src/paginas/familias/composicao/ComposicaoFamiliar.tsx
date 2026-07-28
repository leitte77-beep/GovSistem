/* eslint-disable jsx-a11y/no-noninteractive-element-to-interactive-role */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import {
  Accessibility,
  AlertOctagon,
  AlertTriangle,
  Baby,
  Cake,
  ChevronDown,
  Eye,
  Filter,
  Gift,
  HeartPulse,
  History,
  MoreVertical,
  Pencil,
  Search,
  Send,
  ShieldCheck,
  Star,
  UserMinus,
  UserPlus,
  Users,
  User as UserIcon,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ConcessaoOut } from "@/tipos/beneficios";
import type { FamilyOut, MemberOut } from "@/tipos/pessoas";
import { servicoPessoas } from "@/nucleo/api/pessoas";
import { useConcessoesDaFamilia } from "@/nucleo/api/hooks";
import { usePermissoes } from "@/nucleo/permissoes/usePermissao";
import { formatarData } from "@/nucleo/datas";
import {
  ESCOLARIDADE,
  ESTADO_CIVIL,
  PARENTESCO,
  RACA_COR,
  SEXO,
  rotuloDe,
} from "@/i18n/dominios";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EstadoErro } from "@/ui/EstadoErro";
import { Skeleton } from "@/ui/Skeleton";
import { SlideOver } from "@/ui/SlideOver";
import { RevelarCampo } from "@/ui/RevelarCampo";
import { Botao } from "@/ui/Botao";
import { ErroApi } from "@/nucleo/http/problemDetails";
import {
  alertasDe,
  derivarMembro,
  filtrar,
  ordenar,
  resumoDe,
  rotuloFaixa,
  type Badge,
  type FiltroComposicao,
  type GravidadeAlerta,
  type IconeBadge,
  type MembroDerivado,
  type Ordenacao,
  type TomBadge,
} from "./derivacao";

// ─── Mapas de apresentação ─────────────────────────────────────────

/** Tom do badge → tokens de cor (--ga-chip-*), já definidos no tema. */
const TOM_TOKENS: Record<TomBadge, { bg: string; fg: string }> = {
  neutro: { bg: "--ga-chip-neutral-bg", fg: "--ga-chip-neutral-text" },
  vinculo: { bg: "--ga-chip-relationship-bg", fg: "--ga-chip-relationship-text" },
  faixaCrianca: { bg: "--ga-chip-age-child-bg", fg: "--ga-chip-age-child-text" },
  faixaAdolescente: { bg: "--ga-chip-age-teen-bg", fg: "--ga-chip-age-teen-text" },
  faixaAdulto: { bg: "--ga-chip-age-adult-bg", fg: "--ga-chip-age-adult-text" },
  faixaIdoso: { bg: "--ga-chip-age-senior-bg", fg: "--ga-chip-age-senior-text" },
  beneficio: { bg: "--ga-chip-pbf-bg", fg: "--ga-chip-pbf-text" },
  pendencia: { bg: "--ga-chip-outdated-bg", fg: "--ga-chip-outdated-text" },
  pendenciaCritica: { bg: "--ga-chip-regularize-bg", fg: "--ga-chip-regularize-text" },
  acompanhamento: { bg: "--ga-chip-low-income-bg", fg: "--ga-chip-low-income-text" },
  deficiencia: { bg: "--ga-chip-age-teen-bg", fg: "--ga-chip-age-teen-text" },
};

const ICONE_BADGE: Record<IconeBadge, LucideIcon> = {
  idade: Cake,
  genero: UserIcon,
  vinculo: Users,
  beneficio: Gift,
  pendencia: AlertTriangle,
  acompanhamento: HeartPulse,
  deficiencia: Accessibility,
  gestante: Baby,
  falecido: AlertOctagon,
};

const CORES_ALERTA: Record<GravidadeAlerta, { borda: string; texto: string; Icone: LucideIcon }> = {
  info: { borda: "border-l-sky-400", texto: "text-sky-700", Icone: AlertTriangle },
  atencao: { borda: "border-l-amber-400", texto: "text-amber-700", Icone: AlertTriangle },
  importante: { borda: "border-l-orange-500", texto: "text-orange-700", Icone: AlertTriangle },
  critico: { borda: "border-l-red-500", texto: "text-red-700", Icone: AlertOctagon },
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// ─── Componentes de apresentação pequenos ──────────────────────────

function BadgeVisual({ badge }: { badge: Badge }) {
  const t = TOM_TOKENS[badge.tom];
  const Icone = badge.icone ? ICONE_BADGE[badge.icone] : null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: `var(${t.bg})`, color: `var(${t.fg})` }}
      title={badge.titulo ?? badge.texto}
    >
      {Icone && <Icone aria-hidden className="h-3 w-3 shrink-0" />}
      <span>{badge.texto}</span>
    </span>
  );
}

// ─── Resumo da composição ──────────────────────────────────────────

type Indicador = {
  filtro: FiltroComposicao;
  rotulo: string;
  valor: number;
  Icone: LucideIcon;
  dica: string;
};

function ResumoComposicaoBloco({
  indicadores,
  filtroAtivo,
  aoFiltrar,
}: {
  indicadores: Indicador[];
  filtroAtivo: FiltroComposicao[];
  aoFiltrar: (f: FiltroComposicao) => void;
}) {
  return (
    <div
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible"
      role="group"
      aria-label="Resumo da composição familiar"
    >
      {indicadores.map((ind) => {
        const ativo = filtroAtivo.includes(ind.filtro);
        return (
          <button
            key={ind.filtro + ind.rotulo}
            type="button"
            onClick={() => aoFiltrar(ind.filtro)}
            aria-pressed={ativo}
            title={`${ind.dica}. Clique para filtrar.`}
            className={`flex shrink-0 items-center gap-2 rounded-cartao border px-3 py-2 text-left transition-colors focus-visible:outline-focus ${
              ativo
                ? "border-primary bg-primary/10"
                : "border-ink-soft/15 bg-surface hover:border-primary/30 hover:bg-primary/5"
            }`}
          >
            <ind.Icone aria-hidden className={`h-4 w-4 shrink-0 ${ativo ? "text-primary" : "text-ink-soft"}`} />
            <span className="flex items-baseline gap-1">
              <span className="text-base font-bold leading-none text-ink tabular-nums">{ind.valor}</span>
              <span className="text-xs text-ink-soft">{ind.rotulo}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Barra de ferramentas (busca, filtros, ordenação) ──────────────

const FILTROS_DISPONIVEIS: { valor: FiltroComposicao; rotulo: string }[] = [
  { valor: "responsavel", rotulo: "Responsável" },
  { valor: "adultos", rotulo: "Adultos" },
  { valor: "criancas", rotulo: "Crianças" },
  { valor: "adolescentes", rotulo: "Adolescentes" },
  { valor: "idosos", rotulo: "Idosos" },
  { valor: "pcd", rotulo: "Pessoa com deficiência" },
  { valor: "beneficiarios", rotulo: "Beneficiários" },
  { valor: "pendencias", rotulo: "Com pendências" },
  { valor: "acompanhamentos", rotulo: "Com acompanhamento" },
];

const ORDENS: { valor: Ordenacao; rotulo: string }[] = [
  { valor: "padrao", rotulo: "Ordem padrão" },
  { valor: "nome_az", rotulo: "Nome (A → Z)" },
  { valor: "nome_za", rotulo: "Nome (Z → A)" },
  { valor: "idade_maior", rotulo: "Maior idade" },
  { valor: "idade_menor", rotulo: "Menor idade" },
  { valor: "inclusao_recente", rotulo: "Inclusão mais recente" },
  { valor: "inclusao_antiga", rotulo: "Inclusão mais antiga" },
  { valor: "pendencia_primeiro", rotulo: "Pendências primeiro" },
];

function BarraFerramentas({
  termo,
  aoBuscar,
  filtros,
  aoAlternarFiltro,
  aoLimpar,
  ordem,
  aoOrdenar,
}: {
  termo: string;
  aoBuscar: (v: string) => void;
  filtros: FiltroComposicao[];
  aoAlternarFiltro: (f: FiltroComposicao) => void;
  aoLimpar: () => void;
  ordem: Ordenacao;
  aoOrdenar: (o: Ordenacao) => void;
}) {
  const [painelFiltros, setPainelFiltros] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            value={termo}
            onChange={(e) => aoBuscar(e.target.value)}
            placeholder="Buscar membro por nome, CPF ou NIS..."
            aria-label="Buscar membro"
            className="w-full rounded-input border border-ink-soft/20 bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          type="button"
          onClick={() => setPainelFiltros((v) => !v)}
          aria-expanded={painelFiltros}
          className="inline-flex items-center gap-1.5 rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surface-container-high focus-visible:outline-focus"
        >
          <Filter aria-hidden className="h-4 w-4" />
          Filtros
          {filtros.length > 0 && (
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary">
              {filtros.length}
            </span>
          )}
          <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${painelFiltros ? "rotate-180" : ""}`} />
        </button>
        <label className="sr-only" htmlFor="ordenar-membros">Ordenar membros</label>
        <select
          id="ordenar-membros"
          value={ordem}
          onChange={(e) => aoOrdenar(e.target.value as Ordenacao)}
          className="rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          {ORDENS.map((o) => (
            <option key={o.valor} value={o.valor}>{o.rotulo}</option>
          ))}
        </select>
      </div>

      {painelFiltros && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-cartao border border-ink-soft/15 bg-surface-container-low p-2">
          {FILTROS_DISPONIVEIS.map((f) => {
            const ativo = filtros.includes(f.valor);
            return (
              <button
                key={f.valor}
                type="button"
                onClick={() => aoAlternarFiltro(f.valor)}
                aria-pressed={ativo}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-focus ${
                  ativo
                    ? "border-primary bg-primary text-on-primary"
                    : "border-ink-soft/20 bg-surface text-ink-soft hover:border-primary/40 hover:text-primary"
                }`}
              >
                {f.rotulo}
              </button>
            );
          })}
          {filtros.length > 0 && (
            <button
              type="button"
              onClick={aoLimpar}
              className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-focus"
            >
              <X aria-hidden className="h-3.5 w-3.5" /> Limpar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Alertas automáticos ───────────────────────────────────────────

function AlertasComposicao({ alertas }: { alertas: ReturnType<typeof alertasDe> }) {
  if (alertas.length === 0) return null;
  return (
    <ul className="space-y-1.5" aria-label="Alertas da composição familiar">
      {alertas.map((a) => {
        const c = CORES_ALERTA[a.gravidade];
        return (
          <li key={a.id} className={`flex items-start gap-2 rounded-cartao border border-ink-soft/10 border-l-4 bg-surface p-2.5 ${c.borda}`}>
            <c.Icone aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${c.texto}`} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{a.titulo}</p>
              <p className="text-xs text-ink-soft">{a.descricao}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Menu de ações por membro ──────────────────────────────────────

type AcoesMembro = {
  aoVerDetalhes: () => void;
  aoVerFicha: () => void;
  aoEditar: () => void;
  aoRegistrarAtendimento?: () => void;
  aoEncaminhar?: () => void;
  aoDefinirResponsavel?: () => void;
  aoRemover?: () => void;
};

function MenuAcoesMembro({ nome, acoes }: { nome: string; acoes: AcoesMembro }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface-container-high focus-visible:outline-focus";

  function agir(fn?: () => void) {
    setAberto(false);
    fn?.();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Ações para ${nome}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-container-high hover:text-primary focus-visible:outline-focus"
      >
        <MoreVertical aria-hidden className="h-4 w-4" />
      </button>
      {aberto && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-56 overflow-hidden rounded-cartao border border-ink-soft/15 bg-surface py-1 shadow-xl"
        >
          <button role="menuitem" type="button" className={item} onClick={() => agir(acoes.aoVerDetalhes)}>
            <Eye aria-hidden className="h-4 w-4 text-ink-soft" /> Ver detalhes
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => agir(acoes.aoVerFicha)}>
            <Users aria-hidden className="h-4 w-4 text-ink-soft" /> Ver ficha completa
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => agir(acoes.aoEditar)}>
            <Pencil aria-hidden className="h-4 w-4 text-ink-soft" /> Editar dados
          </button>
          {acoes.aoRegistrarAtendimento && (
            <button role="menuitem" type="button" className={item} onClick={() => agir(acoes.aoRegistrarAtendimento)}>
              <History aria-hidden className="h-4 w-4 text-ink-soft" /> Registrar atendimento
            </button>
          )}
          {acoes.aoEncaminhar && (
            <button role="menuitem" type="button" className={item} onClick={() => agir(acoes.aoEncaminhar)}>
              <Send aria-hidden className="h-4 w-4 text-ink-soft" /> Encaminhar
            </button>
          )}
          {acoes.aoDefinirResponsavel && (
            <button role="menuitem" type="button" className={item} onClick={() => agir(acoes.aoDefinirResponsavel)}>
              <Star aria-hidden className="h-4 w-4 text-ink-soft" /> Definir como responsável
            </button>
          )}
          {acoes.aoRemover && (
            <>
              <div className="my-1 border-t border-ink-soft/10" role="separator" />
              <button
                role="menuitem"
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 focus-visible:outline-focus"
                onClick={() => agir(acoes.aoRemover)}
              >
                <UserMinus aria-hidden className="h-4 w-4" /> Remover da composição
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Cartão de membro ──────────────────────────────────────────────

function CartaoMembro({
  d,
  acoes,
}: {
  d: MembroDerivado;
  acoes: AcoesMembro;
}) {
  const { membro, pessoa, anos, faixa } = d;
  const badges: Badge[] = [
    ...d.neutros,
    ...(d.deficiencia ? [d.deficiencia] : []),
    ...d.beneficios,
    ...d.acompanhamentos,
    ...d.pendencias,
  ];
  const linhaIdentidade = [
    anos !== null ? `${anos} anos` : "Idade não informada",
    faixa !== "nao_informada" ? rotuloFaixa(faixa) : null,
    pessoa?.sexo && pessoa.sexo !== "NAO_INFORMADO" ? rotuloDe(SEXO, pessoa.sexo) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    // Cartão inteiro clicável (abre o drawer) com suporte a teclado — mesmo padrão
    // da ficha da família (regra jsx-a11y desativada no topo do arquivo).
    <li
      role="button"
      tabIndex={0}
      aria-label={`Ver detalhes de ${membro.nome_exibicao}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,a")) return;
        acoes.aoVerDetalhes();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          acoes.aoVerDetalhes();
        }
      }}
      className={`group flex cursor-pointer gap-3 rounded-cartao border bg-surface p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-focus ${
        membro.is_responsavel ? "border-primary/40 bg-primary/[0.03]" : "border-ink-soft/15 hover:border-primary/20"
      }`}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${
            membro.is_responsavel ? "bg-primary text-on-primary" : "bg-surface-container-high text-ink-soft"
          }`}
          aria-hidden
        >
          {iniciais(membro.nome_exibicao)}
        </div>
        {membro.is_responsavel && (
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary ring-2 ring-surface" title="Responsável familiar">
            <ShieldCheck aria-hidden className="h-3 w-3 text-on-primary" />
          </span>
        )}
      </div>

      {/* Identidade + badges */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-semibold text-ink">{membro.nome_exibicao}</span>
          {pessoa?.nome_social && (
            <span className="text-xs text-ink-soft">(social: {pessoa.nome_social})</span>
          )}
          {membro.is_responsavel && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              <ShieldCheck aria-hidden className="h-3 w-3" /> Responsável familiar
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-ink-soft">
          {linhaIdentidade || "Dados pessoais não informados"}
        </p>

        {d.carregandoPessoa ? (
          <div className="mt-2 h-4 w-40"><Skeleton variante="texto" /></div>
        ) : badges.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <BadgeVisual key={b.id} badge={b} />
            ))}
          </div>
        ) : null}

        <p className="mt-2 text-[11px] text-ink-soft">
          {membro.is_responsavel ? "Responsável familiar desde " : "Incluído na família em "}
          {formatarData(membro.data_entrada)}
          {pessoa && (pessoa.cpf_mascarado || pessoa.nis_mascarado) && (
            <span className="ml-2 inline-flex items-center gap-2">
              {pessoa.cpf_mascarado && (
                <span className="inline-flex items-center gap-0.5">
                  CPF <RevelarCampo valor={pessoa.cpf_mascarado} campo="cpf" entityId={pessoa.id} entityType="pessoa" />
                </span>
              )}
              {pessoa.nis_mascarado && (
                <span className="inline-flex items-center gap-0.5">
                  NIS <RevelarCampo valor={pessoa.nis_mascarado} campo="nis" entityId={pessoa.id} entityType="pessoa" />
                </span>
              )}
            </span>
          )}
        </p>
      </div>

      {/* Ações */}
      <div className="flex shrink-0 items-start gap-1">
        <button
          type="button"
          onClick={acoes.aoVerDetalhes}
          className="hidden rounded-input border border-ink-soft/20 px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-focus sm:inline-flex"
        >
          Ver detalhes
        </button>
        <MenuAcoesMembro nome={membro.nome_exibicao} acoes={acoes} />
      </div>
    </li>
  );
}

// ─── Antigos membros ───────────────────────────────────────────────

function SecaoAntigosMembros({ antigos, familiaId }: { antigos: MemberOut[]; familiaId: string }) {
  const [aberto, setAberto] = useState(false);
  const navigate = useNavigate();
  if (antigos.length === 0) return null;
  return (
    <div className="rounded-cartao border border-ink-soft/15 bg-surface-container-low">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left focus-visible:outline-focus"
      >
        <span className="text-sm font-semibold text-ink-soft">
          Antigos membros <span className="tabular-nums">({antigos.length})</span>
        </span>
        <ChevronDown aria-hidden className={`h-4 w-4 text-ink-soft transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <ul className="space-y-1.5 border-t border-ink-soft/10 p-2">
          {antigos.map((m) => (
            <li key={m.membership_id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 opacity-90">
              <div className="min-w-0">
                <span className="text-sm text-ink">{m.nome_exibicao}</span>
                <p className="text-xs text-ink-soft">
                  {rotuloDe(PARENTESCO, m.parentesco) || "Vínculo não informado"}
                  {" · "}
                  {m.data_saida ? `Saída em ${formatarData(m.data_saida)}` : "Sem data de saída"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/familias/${familiaId}/pessoa/${m.person_id}`)}
                className="shrink-0 rounded-input border border-ink-soft/20 px-2.5 py-1 text-xs font-medium text-ink-soft hover:border-primary/40 hover:text-primary focus-visible:outline-focus"
              >
                Ver histórico
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Drawer de detalhes ────────────────────────────────────────────

function LinhaInfo({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-ink-soft">{rotulo}</span>
      <span className="text-right font-medium text-ink">{valor || "Não informado"}</span>
    </div>
  );
}

function DrawerDetalhesMembro({
  d,
  aoFechar,
  acoes,
}: {
  d: MembroDerivado;
  aoFechar: () => void;
  acoes: AcoesMembro;
}) {
  const { membro, pessoa, anos } = d;
  return (
    <SlideOver aberto aoFechar={aoFechar} titulo={membro.nome_exibicao} largura="md">
      {d.carregandoPessoa && !pessoa ? (
        <div className="space-y-3"><Skeleton variante="cartao" /><Skeleton variante="cartao" /></div>
      ) : (
        <div className="space-y-5">
          {membro.is_responsavel && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              <ShieldCheck aria-hidden className="h-3.5 w-3.5" /> Responsável familiar
            </span>
          )}

          {(d.beneficios.length > 0 || d.pendencias.length > 0 || d.acompanhamentos.length > 0 || d.deficiencia) && (
            <div className="flex flex-wrap gap-1.5">
              {[...(d.deficiencia ? [d.deficiencia] : []), ...d.beneficios, ...d.acompanhamentos, ...d.pendencias].map((b) => (
                <BadgeVisual key={b.id} badge={b} />
              ))}
            </div>
          )}

          <section aria-label="Resumo">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-soft">Resumo</h3>
            <LinhaInfo rotulo="Nome social" valor={pessoa?.nome_social} />
            <LinhaInfo rotulo="Idade" valor={anos !== null ? `${anos} anos · ${rotuloFaixa(d.faixa)}` : undefined} />
            <LinhaInfo rotulo="Data de nascimento" valor={pessoa?.data_nascimento ? formatarData(pessoa.data_nascimento) : undefined} />
            <LinhaInfo rotulo="Vínculo" valor={rotuloDe(PARENTESCO, membro.parentesco)} />
            <LinhaInfo rotulo="Incluído em" valor={formatarData(membro.data_entrada)} />
          </section>

          <section aria-label="Documentos">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-soft">Documentos</h3>
            <div className="flex justify-between py-1 text-sm">
              <span className="text-ink-soft">CPF</span>
              {pessoa?.cpf_mascarado ? (
                <RevelarCampo valor={pessoa.cpf_mascarado} campo="cpf" entityId={pessoa.id} entityType="pessoa" />
              ) : (
                <span className="font-medium text-ink">Não informado</span>
              )}
            </div>
            <div className="flex justify-between py-1 text-sm">
              <span className="text-ink-soft">NIS</span>
              {pessoa?.nis_mascarado ? (
                <RevelarCampo valor={pessoa.nis_mascarado} campo="nis" entityId={pessoa.id} entityType="pessoa" />
              ) : (
                <span className="font-medium text-ink">Não informado</span>
              )}
            </div>
          </section>

          <section aria-label="Dados pessoais">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-soft">Dados pessoais</h3>
            <LinhaInfo rotulo="Sexo" valor={rotuloDe(SEXO, pessoa?.sexo)} />
            <LinhaInfo rotulo="Estado civil" valor={rotuloDe(ESTADO_CIVIL, pessoa?.estado_civil)} />
            <LinhaInfo rotulo="Raça/Cor" valor={rotuloDe(RACA_COR, pessoa?.raca_cor)} />
            <LinhaInfo rotulo="Escolaridade" valor={rotuloDe(ESCOLARIDADE, pessoa?.escolaridade)} />
            <LinhaInfo rotulo="Ocupação" valor={pessoa?.ocupacao} />
          </section>

          <div className="flex flex-col gap-2 border-t border-ink-soft/10 pt-4">
            <Botao variante="primario" onClick={acoes.aoVerFicha}>Ver ficha completa</Botao>
            <div className="flex gap-2">
              <Botao variante="secundario" className="flex-1" onClick={() => { aoFechar(); acoes.aoEditar(); }}>Editar</Botao>
              {acoes.aoDefinirResponsavel && (
                <Botao variante="secundario" className="flex-1" onClick={() => { aoFechar(); acoes.aoDefinirResponsavel?.(); }}>Definir responsável</Botao>
              )}
            </div>
          </div>
        </div>
      )}
    </SlideOver>
  );
}

// ─── Componente principal da aba ───────────────────────────────────

/** Debounce simples para a busca (evita filtrar a cada tecla — §7/§32). */
function useDebounced<T>(valor: T, ms = 300): T {
  const [d, setD] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setD(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return d;
}

export function ComposicaoFamiliar({
  familia,
  aoAdicionar,
  aoEditar,
  aoRemover,
  aoDefinirResponsavel,
  aoIrParaAba,
}: {
  familia: FamilyOut;
  aoAdicionar: () => void;
  aoEditar: (m: MemberOut) => void;
  aoRemover: (m: MemberOut) => void;
  aoDefinirResponsavel: (m: MemberOut) => void;
  aoIrParaAba?: (aba: string) => void;
}) {
  const navigate = useNavigate();
  const { tem } = usePermissoes();

  const ativos = useMemo(() => familia.membros.filter((m) => m.status === "ATIVO"), [familia.membros]);
  const antigos = useMemo(() => familia.membros.filter((m) => m.status !== "ATIVO"), [familia.membros]);

  const concessoesQ = useConcessoesDaFamilia(familia.id);
  const concessoesPorPessoa = useMemo(() => {
    const mapa = new Map<string, ConcessaoOut[]>();
    for (const c of (concessoesQ.data as ConcessaoOut[] | undefined) ?? []) {
      if (!c.person_id) continue;
      const arr = mapa.get(c.person_id) ?? [];
      arr.push(c);
      mapa.set(c.person_id, arr);
    }
    return mapa;
  }, [concessoesQ.data]);

  // Busca a PersonOut de cada membro ativo (mesma chave de cache do resto do app).
  const pessoasQ = useQueries({
    queries: ativos.map((m) => ({
      queryKey: ["pessoa", m.person_id],
      queryFn: () => servicoPessoas.obter(m.person_id),
      staleTime: 30_000,
    })),
  });

  const erroPessoas = pessoasQ.find((q) => q.isError);

  const derivados = useMemo(
    () =>
      ativos.map((m, i) =>
        derivarMembro(
          m,
          pessoasQ[i]?.data ?? null,
          pessoasQ[i]?.isLoading ?? false,
          concessoesPorPessoa.get(m.person_id) ?? [],
          familia,
        ),
      ),
    // pessoasQ muda de identidade a cada render; dependemos dos dados em si.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ativos, concessoesPorPessoa, familia, ...pessoasQ.map((q) => q.data), ...pessoasQ.map((q) => q.isLoading)],
  );

  const resumo = useMemo(() => resumoDe(derivados), [derivados]);
  const alertas = useMemo(() => alertasDe(derivados), [derivados]);

  const [termoBruto, setTermoBruto] = useState("");
  const termo = useDebounced(termoBruto, 300);
  const [filtros, setFiltros] = useState<FiltroComposicao[]>([]);
  const [ordem, setOrdem] = useState<Ordenacao>("padrao");
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const visiveis = useMemo(() => ordenar(filtrar(derivados, filtros, termo), ordem), [derivados, filtros, termo, ordem]);
  const detalhe = useMemo(() => derivados.find((d) => d.membro.person_id === detalheId) ?? null, [derivados, detalheId]);

  function alternarFiltro(f: FiltroComposicao) {
    if (f === "todos") {
      setFiltros([]);
      return;
    }
    setFiltros((atual) => (atual.includes(f) ? atual.filter((x) => x !== f) : [...atual, f]));
  }

  const indicadores: Indicador[] = [
    { filtro: "todos", rotulo: resumo.totalAtivos === 1 ? "membro" : "membros", valor: resumo.totalAtivos, Icone: Users, dica: "Total de membros ativos" },
    { filtro: "adultos", rotulo: "adultos", valor: resumo.adultos, Icone: UserIcon, dica: "Membros de 18 a 59 anos" },
    { filtro: "adolescentes", rotulo: "adolescentes", valor: resumo.adolescentes, Icone: UserIcon, dica: "Membros de 12 a 17 anos" },
    { filtro: "criancas", rotulo: "crianças", valor: resumo.criancas, Icone: Baby, dica: "Membros com menos de 12 anos" },
    { filtro: "idosos", rotulo: "idosos", valor: resumo.idosos, Icone: UserIcon, dica: "Membros com 60 anos ou mais" },
    { filtro: "pcd", rotulo: "com deficiência", valor: resumo.pcd, Icone: Accessibility, dica: "Pessoas com deficiência" },
    { filtro: "beneficiarios", rotulo: "beneficiários", valor: resumo.beneficiarios, Icone: Gift, dica: "Membros com benefício ativo" },
    { filtro: "pendencias", rotulo: "pendências", valor: resumo.pendencias, Icone: AlertTriangle, dica: "Membros com pendência cadastral" },
    { filtro: "acompanhamentos", rotulo: "em acompanhamento", valor: resumo.acompanhamentos, Icone: HeartPulse, dica: "Situações que exigem acompanhamento" },
  ];

  function acoesDe(d: MembroDerivado): AcoesMembro {
    const m = d.membro;
    return {
      aoVerDetalhes: () => setDetalheId(m.person_id),
      aoVerFicha: () => navigate(`/familias/${familia.id}/pessoa/${m.person_id}`),
      aoEditar: () => aoEditar(m),
      aoRegistrarAtendimento: tem("atendimento.registrar")
        ? () => navigate(`/familias/${familia.id}/atendimento`)
        : undefined,
      aoEncaminhar: tem("encaminhamento.criar")
        ? () => (aoIrParaAba ? aoIrParaAba("encaminhamentos") : navigate("/encaminhamentos"))
        : undefined,
      aoDefinirResponsavel: !m.is_responsavel ? () => aoDefinirResponsavel(m) : undefined,
      aoRemover: !m.is_responsavel ? () => aoRemover(m) : undefined,
    };
  }

  // ── Estados ──
  const carregandoInicial = ativos.length > 0 && pessoasQ.every((q) => q.isLoading);

  return (
    <div className="space-y-4">
      {/* Cabeçalho da seção */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-ink">Composição familiar</h3>
          <p className="text-sm text-ink-soft">
            Visualize os membros, vínculos, benefícios, documentos e pendências desta família.
          </p>
        </div>
        <button
          type="button"
          onClick={aoAdicionar}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-input bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dark focus-visible:outline-focus"
        >
          <UserPlus aria-hidden className="h-4 w-4" /> Adicionar membro
        </button>
      </div>

      {/* Resumo */}
      {ativos.length > 0 && (
        <ResumoComposicaoBloco indicadores={indicadores} filtroAtivo={filtros} aoFiltrar={alternarFiltro} />
      )}

      {/* Alertas */}
      <AlertasComposicao alertas={alertas} />

      {/* Barra de ferramentas */}
      {ativos.length > 0 && (
        <BarraFerramentas
          termo={termoBruto}
          aoBuscar={setTermoBruto}
          filtros={filtros}
          aoAlternarFiltro={alternarFiltro}
          aoLimpar={() => setFiltros([])}
          ordem={ordem}
          aoOrdenar={setOrdem}
        />
      )}

      {/* Lista / estados */}
      {ativos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum membro cadastrado nesta família"
          descricao="Adicione o primeiro membro para iniciar a composição familiar."
          acao={{ rotulo: "Adicionar membro", aoClicar: aoAdicionar }}
        />
      ) : carregandoInicial ? (
        <ul className="space-y-2" aria-label="Carregando membros">
          {ativos.map((m) => (
            <li key={m.membership_id} className="rounded-cartao border border-ink-soft/15 bg-surface p-3">
              <Skeleton variante="texto" />
            </li>
          ))}
        </ul>
      ) : erroPessoas && derivados.every((d) => !d.pessoa) ? (
        <EstadoErro
          problema={(erroPessoas.error as ErroApi)?.problema}
          aoTentarNovamente={() => pessoasQ.forEach((q) => q.refetch())}
        />
      ) : visiveis.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum membro encontrado"
          descricao="Revise o termo pesquisado ou limpe os filtros aplicados."
          acao={{ rotulo: "Limpar filtros", aoClicar: () => { setFiltros([]); setTermoBruto(""); } }}
        />
      ) : (
        <ul className="space-y-2">
          {visiveis.map((d) => (
            <CartaoMembro key={d.membro.membership_id} d={d} acoes={acoesDe(d)} />
          ))}
        </ul>
      )}

      {/* Antigos membros */}
      <SecaoAntigosMembros antigos={antigos} familiaId={familia.id} />

      {/* Drawer de detalhes */}
      {detalhe && (
        <DrawerDetalhesMembro
          d={detalhe}
          aoFechar={() => setDetalheId(null)}
          acoes={acoesDe(detalhe)}
        />
      )}
    </div>
  );
}
