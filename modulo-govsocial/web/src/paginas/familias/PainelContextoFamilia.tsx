import { Link } from "react-router-dom";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  MapPin,
  Phone,
  School,
  Stethoscope,
  Users,
} from "lucide-react";
import type { FamilyOut, MemberOut } from "@/tipos/pessoas";
import { formatarData } from "@/nucleo/datas";
import { usePermissoes } from "@/nucleo/permissoes/usePermissao";

const chip = "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold";
const tituloWidget = "mb-3 text-xs font-bold uppercase tracking-wider text-ink-soft";
const cartao =
  "rounded-xl border border-outline-variant/30 bg-surface p-4 text-sm";

/** Mini-chip clicável para nome de membro. */
function MiniChipMembro({ nome, personId }: { nome: string; personId: string }) {
  return (
    <Link
      to={`?pessoa=${personId}`}
      className="inline-flex rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-medium text-ink hover:text-primary hover:bg-primary-soft transition-colors focus-visible:outline-focus"
    >
      {nome}
    </Link>
  );
}

export function PainelContextoFamilia({ familia, aoMudarAba }: { familia: FamilyOut; aoMudarAba?: (aba: string) => void }) {
  const ativos = familia.membros.filter((m) => m.status === "ATIVO");

  return (
    <aside
      className="w-full space-y-4 xl:w-[340px] xl:flex-shrink-0 2xl:w-[360px]"
      aria-label="Painel de contexto da família"
      style={{ position: "sticky", top: "96px", alignSelf: "flex-start" }}
    >
      {/* WIDGET 1 — Resumo da família */}
      <WidgetResumo familia={familia} ativos={ativos} />

      {/* WIDGET 2 — Pendências e alertas */}
      <WidgetPendencias aoMudarAba={aoMudarAba} />

      {/* WIDGET 3 — Próximos passos / agenda */}
      <WidgetProximosPassos aoMudarAba={aoMudarAba} />

      {/* WIDGET 4 — Contatos & rede de referência */}
      <WidgetContatosRede familia={familia} ativos={ativos} />
    </aside>
  );
}

/* ─── WIDGET 1 — Resumo da Família ─── */

function WidgetResumo({
  familia,
  ativos,
}: {
  familia: FamilyOut;
  ativos: MemberOut[];
}) {
  const pessoaIds: Record<string, string> = {
    "Carlos Henrique Oliveira Santos":
      "p-carlos",
    "Fernanda Lima Oliveira": "p-fernanda",
    "Juliana Lima Oliveira": "p-juliana",
    "Lucas Lima Oliveira": "p-lucas",
  };

  return (
    <div className={cartao}>
      <h3 className={tituloWidget}>Resumo da família</h3>
      <dl className="space-y-2">
        <div className="flex items-center gap-2">
          <dt className="min-w-[120px] text-xs text-ink-soft">Faixa de renda</dt>
          <dd>
            <span
              className={`${chip} bg-[var(--ga-chip-poverty-bg)] text-[var(--ga-chip-poverty-text)]`}
            >
              Pobreza
            </span>
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="min-w-[120px] text-xs text-ink-soft">Situação cadastral</dt>
          <dd>
            <span
              className={`${chip} bg-[var(--ga-chip-regularize-bg)] text-[var(--ga-chip-regularize-text)]`}
            >
              A regularizar
            </span>
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="min-w-[120px] text-xs text-ink-soft">Benefícios federais</dt>
          <dd className="flex flex-wrap gap-1">
            <span
              className={`${chip} bg-[var(--ga-chip-pbf-bg)] text-[var(--ga-chip-pbf-text)]`}
            >
              PBF ativo
            </span>
            <span
              className={`${chip} bg-[var(--ga-chip-pbf-bg)] text-[var(--ga-chip-pbf-text)]`}
            >
              Bolsa Família
            </span>
            <span className="text-[11px] text-ink-soft ml-1 self-center">
              via CadÚnico
            </span>
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="min-w-[120px] text-xs text-ink-soft">Composição</dt>
          <dd className="flex flex-wrap gap-1">
            <span className="text-xs font-semibold text-ink mr-1">
              {ativos.length} membros
            </span>
            {ativos.map((m) => (
              <MiniChipMembro
                key={m.membership_id}
                nome={m.nome_exibicao}
                personId={pessoaIds[m.nome_exibicao] ?? m.person_id}
              />
            ))}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="min-w-[120px] text-xs text-ink-soft">
            CRAS de referência
          </dt>
          <dd className="text-xs text-ink">
            CRAS {familia.territorio ?? "Centro"}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="min-w-[120px] text-xs text-ink-soft">Unidade</dt>
          <dd className="text-xs text-ink">{familia.territorio ?? "Centro"}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="min-w-[120px] text-xs text-ink-soft">
            Data de cadastro
          </dt>
          <dd className="text-xs text-ink">14/07/2026</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="min-w-[120px] text-xs text-ink-soft">
            Última atualização
          </dt>
          <dd className="text-xs text-ink">
            {familia.updated_at
              ? formatarData(familia.updated_at)
              : "15/07/2026"}
          </dd>
        </div>
      </dl>

      {/* Vínculos ativos embutidos */}
      <div className="mt-3 border-t border-outline-variant/20 pt-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
          Vínculos ativos
        </h4>
        <div className="flex flex-wrap gap-1.5">
          <span
            className={`${chip} bg-[var(--ga-chip-pbf-bg)] text-[var(--ga-chip-pbf-text)]`}
          >
            PBF
          </span>
          <span
            className={`${chip} bg-[var(--ga-chip-pbf-bg)] text-[var(--ga-chip-pbf-text)]`}
          >
            Bolsa Família
          </span>
          <span
            className={`${chip} bg-[var(--ga-chip-poverty-bg)] text-[var(--ga-chip-poverty-text)]`}
          >
            Medida socioeducativa (Lucas)
          </span>
          <span className="inline-flex rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-semibold text-evt-encaminhamento">
            Encaminhamento em curso
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── WIDGET 2 — Pendências e Alertas ─── */

function WidgetPendencias({ aoMudarAba }: { aoMudarAba?: (aba: string) => void }) {
  const mudar = aoMudarAba ?? (() => {});
  const pendencias = [
    {
      icone: <AlertTriangle className="h-4 w-4 text-amber flex-shrink-0" />,
      texto: "Recadastramento vencido",
      aba: "vulnerabilidades",
      cor: "text-amber",
    },
    {
      icone: <AlertTriangle className="h-4 w-4 text-amber flex-shrink-0" />,
      texto: "2 crianças/adolescentes sem frequência escolar registrada (Juliana + Lucas)",
      aba: "membros",
      cor: "text-amber",
    },
    {
      icone: <FileText className="h-4 w-4" style={{ color: "var(--ga-chip-regularize-text)" }} />,
      texto: "1 CPF a regularizar — Lucas Lima Oliveira",
      aba: "membros",
      cor: "text-danger",
    },
    {
      icone: <ArrowRight className="h-4 w-4 text-evt-encaminhamento flex-shrink-0" />,
      texto: "1 encaminhamento sem devolutiva",
      aba: "encaminhamentos",
      cor: "text-evt-encaminhamento",
    },
    {
      icone: <Calendar className="h-4 w-4 text-primary flex-shrink-0" />,
      texto: "1 atendimento em aberto (PAEFI)",
      aba: "atendimentos",
      cor: "text-primary",
    },
  ];

  return (
    <div className={cartao}>
      <h3 className={tituloWidget}>Pendências e alertas</h3>
      <ul className="space-y-2">
        {pendencias.map((p, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => mudar(p.aba)}
              className="flex items-start gap-2 rounded-lg p-2 text-left text-xs leading-relaxed hover:bg-surface-container-low focus-visible:outline-focus transition-colors w-full"
            >
              {p.icone}
              <span className={p.cor}>{p.texto}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── WIDGET 3 — Próximos Passos / Agenda ─── */

function WidgetProximosPassos({ aoMudarAba }: { aoMudarAba?: (aba: string) => void }) {
  const passos = [
    {
      data: "30/07/2026",
      rotulo: "Próximo atendimento agendado — PAEFI",
      cor: "text-primary",
    },
    {
      data: "05/08/2026",
      rotulo: "Retorno previsto de encaminhamento (saúde)",
      cor: "text-evt-encaminhamento",
    },
    {
      data: "14/01/2027",
      rotulo: "Próximo recadastramento",
      cor: "text-amber",
    },
  ];

  return (
    <div className={cartao}>
      <h3 className={tituloWidget}>Próximos passos / Agenda</h3>
      <ul className="space-y-2">
        {passos.map((p, i) => (
          <li key={i} className="flex gap-2 text-xs">
            <span className="min-w-[80px] font-semibold tabular-nums text-ink">
              {p.data}
            </span>
            <span className={`leading-relaxed ${p.cor}`}>{p.rotulo}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => aoMudarAba?.("agenda")}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-focus"
        >
          Ver agenda completa <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/* ─── WIDGET 4 — Contatos & Rede de Referência ─── */

function WidgetContatosRede({
  familia,
  ativos: _ativos,
}: {
  familia: FamilyOut;
  ativos: MemberOut[];
}) {
  const [telefoneVisivel, setTelefoneVisivel] = useState(false);
  const { tem } = usePermissoes();

  const telefoneMascarado = familia.telefone_contato
    ? `(${familia.telefone_contato.slice(0, 2)}) ****${familia.telefone_contato.slice(-4)}`
    : "(11) ****1234";

  return (
    <div className={cartao}>
      <h3 className={tituloWidget}>Contatos &amp; rede de referência</h3>
      <dl className="space-y-2">
        <div className="flex items-center gap-2">
          <dt className="flex-shrink-0">
            <Phone className="h-3.5 w-3.5 text-ink-soft" />
          </dt>
          <dd className="flex items-center gap-1 text-xs text-ink min-w-0">
            <span className="tabular-nums">
              {telefoneVisivel
                ? familia.telefone_contato ?? "(11) 91234-5678"
                : telefoneMascarado}
            </span>
            {tem("pii:reveal") && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTelefoneVisivel(!telefoneVisivel);
                }}
                className="inline-flex min-h-6 min-w-6 items-center justify-center rounded text-ink-soft hover:bg-primary/10 hover:text-primary transition-colors focus-visible:outline-focus"
                aria-label={
                  telefoneVisivel ? "Ocultar telefone" : "Revelar telefone"
                }
                title={
                  telefoneVisivel
                    ? "Ocultar telefone"
                    : "Revelar (ação registrada em auditoria)"
                }
              >
                {telefoneVisivel ? (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            )}
          </dd>
        </div>

        <div className="flex items-center gap-2">
          <dt className="flex-shrink-0">
            <MapPin className="h-3.5 w-3.5 text-ink-soft" />
          </dt>
          <dd className="text-xs text-ink">
            {familia.bairro
              ? `${familia.bairro}, ${familia.municipio ?? ""}`
              : "Centro · São Paulo"}
          </dd>
        </div>

        <div className="flex items-center gap-2">
          <dt className="flex-shrink-0">
            <Stethoscope className="h-3.5 w-3.5 text-ink-soft" />
          </dt>
          <dd className="text-xs text-ink">UBS Centro</dd>
        </div>

        <div className="flex items-center gap-2">
          <dt className="flex-shrink-0">
            <School className="h-3.5 w-3.5 text-ink-soft" />
          </dt>
          <dd className="text-xs text-ink">
            EMEF Prof.ª Maria da Silva · Juliana, Lucas
          </dd>
        </div>

        <div className="flex items-center gap-2">
          <dt className="flex-shrink-0">
            <Users className="h-3.5 w-3.5 text-ink-soft" />
          </dt>
          <dd className="text-xs text-ink">CRAS Centro</dd>
        </div>
      </dl>
    </div>
  );
}
