import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Edit3, MoreHorizontal, Printer, Star, UserMinus, Users } from "lucide-react";
import { servicoPessoas, servicoFamilias } from "@/nucleo/api/pessoas";
import { logPiiReveal } from "@/nucleo/api/auditoria";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import { useTenantTema } from "@/tema/TenantTemaProvider";
import { useConcessoesDaFamilia, useProntuariosDaFamilia } from "@/nucleo/api/hooks";
import { useRenda, useDomicilio, useVulnerabilidades } from "@/nucleo/api/servicosFase2";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { Modal } from "@/ui/Modal";
import { Botao } from "@/ui/Botao";
import { Select } from "@/ui/Select";
import { DocumentoSigiloso } from "@/ui/DocumentoSigiloso";
import { CampoCPF } from "@/ui/CampoCPF";
import { CampoNIS } from "@/ui/CampoNIS";
import { avisar } from "@/ui/Toast";
import { ErroApi } from "@/nucleo/http/problemDetails";
import { formatarData, formatarDataHora, idade, agora } from "@/nucleo/datas";
import { rotuloDe } from "@/i18n/dominios";
import {
  ESCOLARIDADE,
  ESTADO_CIVIL,
  PARENTESCO,
  RACA_COR,
  SEXO,
  SITUACAO_MERCADO,
  TIPO_DEFICIENCIA,
} from "@/i18n/dominios";
import { apenasDigitos, validarCpf, validarNis } from "@/nucleo/validadoresBr";
import { FormularioPessoa } from "./FormularioPessoa";
import { esquemaPessoa, type CampoPessoa, type DadosPessoa } from "./esquemaPessoa";
import type { FamilyOut, MemberOut, PersonOut, PersonUpdate } from "@/tipos/pessoas";
import { Chip } from "@/ui/Chip";

// ─── Tipos auxiliares ──────────────────────────────────────────────

type FaixaEtaria = "crianca" | "adolescente" | "adulto" | "idoso" | "nao_informada";

function faixaDe(anos: number | null): FaixaEtaria {
  if (anos === null) return "nao_informada";
  if (anos < 12) return "crianca";
  if (anos < 18) return "adolescente";
  if (anos >= 60) return "idoso";
  return "adulto";
}

const ROTULO_FAIXA: Record<FaixaEtaria, string> = {
  crianca: "Criança",
  adolescente: "Adolescente",
  adulto: "Adulto",
  idoso: "Idoso",
  nao_informada: "Idade não informada",
};

const ESTILO_FAIXA_CHIP: Record<FaixaEtaria, { bg: string; fg: string }> = {
  crianca: { bg: "var(--ga-chip-age-child-bg)", fg: "var(--ga-chip-age-child-text)" },
  adolescente: { bg: "var(--ga-chip-age-teen-bg)", fg: "var(--ga-chip-age-teen-text)" },
  adulto: { bg: "var(--ga-chip-age-adult-bg)", fg: "var(--ga-chip-age-adult-text)" },
  idoso: { bg: "var(--ga-chip-age-senior-bg)", fg: "var(--ga-chip-age-senior-text)" },
  nao_informada: { bg: "var(--ga-chip-neutral-bg)", fg: "var(--ga-chip-neutral-text)" },
};

const fmtMoeda = (v: number | null | undefined) =>
  v != null
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)
    : null;

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────

export default function FichaPessoa() {
  const { familiaId, pessoaId } = useParams<{ familiaId: string; pessoaId: string }>();
  const navigate = useNavigate();
  const sessao = useSessao();
  const tema = useTenantTema();

  const familiaQ = useQuery({
    queryKey: ["familia", familiaId],
    queryFn: () => servicoFamilias.obter(familiaId!),
    enabled: Boolean(familiaId),
  });

  const pessoaQ = useQuery({
    queryKey: ["pessoa", pessoaId],
    queryFn: () => servicoPessoas.obter(pessoaId!),
    enabled: Boolean(pessoaId),
  });

  // Contexto: benefícios, renda, domicílio, vulnerabilidades, prontuários
  const beneficiosQ = useConcessoesDaFamilia(familiaId);
  const rendaQ = useRenda(familiaId ?? "");
  const domicilioQ = useDomicilio(familiaId ?? "");
  const vulnerabilidadesQ = useVulnerabilidades(familiaId ?? "");
  const prontuariosQ = useProntuariosDaFamilia(familiaId);

  const [editando, setEditando] = useState(false);
  const [ocultarVazios, setOcultarVazios] = useState(true);

  // ── Revelação CPF/NIS ──────────────────────────────────────
  const [cpfRevelado, setCpfRevelado] = useState<string | null>(null);
  const [nisRevelado, setNisRevelado] = useState<string | null>(null);
  const [carregandoCpf, setCarregandoCpf] = useState(false);
  const [carregandoNis, setCarregandoNis] = useState(false);

  const alternarCpf = useCallback(async (visivel: boolean) => {
    if (visivel) { setCpfRevelado(null); return; }
    setCarregandoCpf(true);
    try {
      const { value } = await servicoPessoas.revelarCampo(pessoaId!, "cpf");
      setCpfRevelado(value);
      logPiiReveal({ campo: "cpf", entityId: pessoaId!, entityType: "pessoa" });
    } catch { avisar.erro("Não foi possível revelar o CPF."); }
    finally { setCarregandoCpf(false); }
  }, [pessoaId]);

  const alternarNis = useCallback(async (visivel: boolean) => {
    if (visivel) { setNisRevelado(null); return; }
    setCarregandoNis(true);
    try {
      const { value } = await servicoPessoas.revelarCampo(pessoaId!, "nis");
      setNisRevelado(value);
      logPiiReveal({ campo: "nis", entityId: pessoaId!, entityType: "pessoa" });
    } catch { avisar.erro("Não foi possível revelar o NIS."); }
    finally { setCarregandoNis(false); }
  }, [pessoaId]);

  const docsRevelados = useMemo(() => {
    const docs: string[] = [];
    if (cpfRevelado) docs.push("cpf");
    if (nisRevelado) docs.push("nis");
    return docs;
  }, [cpfRevelado, nisRevelado]);

  // ── Impressão ──────────────────────────────────────────────
  function imprimir() {
    if (docsRevelados.length > 0) {
      logPiiReveal({ campo: "cpf", entityId: pessoaId!, entityType: "pessoa" });
    }
    const tituloAnterior = document.title;
    document.title = `Ficha - ${pessoaQ.data?.nome_exibicao ?? "Membro"}`;

    document.body.classList.add("printing");

    avisar.info("Para um papel limpo, em Mais definições desmarque Cabeçalhos e rodapés.");

    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
        document.body.classList.remove("printing");
        document.title = tituloAnterior;
      }, 300);
    });
  }

  // ── Loading / Erro / 404 ───────────────────────────────────

  if (familiaQ.isLoading || pessoaQ.isLoading) {
    return (
      <div className="space-y-4" role="status" aria-label="Carregando ficha do membro">
        <Skeleton variante="cartao" />
        <Skeleton variante="cartao" />
        <Skeleton variante="cartao" />
      </div>
    );
  }

  if (familiaQ.isError) {
    return <EstadoErro problema={(familiaQ.error as ErroApi).problema} aoTentarNovamente={() => familiaQ.refetch()} />;
  }
  if (pessoaQ.isError) {
    return <EstadoErro problema={(pessoaQ.error as ErroApi).problema} aoTentarNovamente={() => pessoaQ.refetch()} />;
  }
  if (!familiaQ.data || !pessoaQ.data) return null;

  const familia = familiaQ.data;
  const pessoa = pessoaQ.data;
  const membro = familia.membros.find((m) => m.person_id === pessoa.id);

  if (!membro) {
    return (
      <main className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="mb-3 font-titulo text-headline-md text-ink">Membro não encontrado nesta família</h1>
        <p className="mb-6 text-ink-soft">
          A pessoa <strong>{pessoa.nome_exibicao}</strong> não pertence à família nº {familia.codigo}.
        </p>
        <Link to={`/familias/${familia.id}?aba=membros`} className="inline-flex items-center gap-1.5 rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:brightness-110 transition-all">
          <ArrowLeft className="h-4 w-4" /> Voltar para a família
        </Link>
      </main>
    );
  }

  const anos = idade(pessoa.data_nascimento);
  const faixa = faixaDe(anos);
  const rendaPerCapita = rendaQ.data?.renda_per_capita ?? null;
  const cpfIrregular = pessoa.cpf_mascarado?.includes("regularizar") ?? false;
  const nisIrregular = pessoa.nis_mascarado?.includes("regularizar") ?? false;

  return (
    <main aria-labelledby="ficha-pessoa-titulo" className="ficha-pessoa">
      <h2 id="ficha-pessoa-titulo" className="apenas-leitor">
        Ficha individual — {pessoa.nome_exibicao}
      </h2>

      {/* ══════ PRINT ROOT: tudo que sai no papel ══════ */}
      <div className="print-root">

        {/* PRINT HEADER institucional (só no papel) */}
        <PrintHeader
          tema={tema}
          familia={familia}
          pessoa={pessoa}
          docsRevelados={docsRevelados}
          sessao={sessao}
          rendaPerCapita={rendaPerCapita}
          pbfAtivo={familia.beneficiaria_pbf}
        />

        {/* ═══ TELA: breadcrumb (some no print) ═══ */}
        <nav aria-label="Localização da ficha" className="no-print mb-3 flex items-center gap-1 text-xs text-ink-soft">
          <Link to="/familias" className="rounded text-primary hover:underline focus-visible:outline-focus">Famílias</Link>
          <span aria-hidden="true" className="material-symbols-outlined !text-[12px]">chevron_right</span>
          <Link to={`/familias/${familia.id}?aba=membros`} className="rounded text-primary hover:underline focus-visible:outline-focus">Família nº {familia.codigo}</Link>
          <span aria-hidden="true" className="material-symbols-outlined !text-[12px]">chevron_right</span>
          <span className="text-ink">{pessoa.nome_exibicao}</span>
        </nav>

        {/* ═══ CABEÇALHO: H1 + badges + KPIs + ações ═══ */}
        <FichaHeader
          pessoa={pessoa}
          membro={membro}
          anos={anos}
          faixa={faixa}
          familia={familia}
          rendaPerCapita={rendaPerCapita}
          cpfIrregular={cpfIrregular}
          nisIrregular={nisIrregular}
          ocultarVazios={ocultarVazios}
          aoAlternarVazios={() => setOcultarVazios((v) => !v)}
          aoEditar={() => setEditando(true)}
          aoImprimir={imprimir}
          aoVoltar={() => navigate(`/familias/${familia.id}?aba=membros`)}
        />

        {/* ═══ CORPO: layout de dossiê (principal + lateral) ═══ */}
        <div className="ficha-dossie mt-4 grid grid-cols-1 gap-5 xl:grid-cols-3">
          {/* ── COLUNA PRINCIPAL (cadastro) ── */}
          <div className="xl:col-span-2 ficha-conteudo space-y-3">
            <SecaoFicha titulo="Identificação">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Campo label="Nome civil" valor={pessoa.nome_civil} />
                <Campo label="Nome social" valor={pessoa.nome_social} />
                <Campo label="Data de nascimento" valor={pessoa.data_nascimento ? `${formatarData(pessoa.data_nascimento)} (${anos} anos)` : null} />
                <Campo label="Sexo" valor={rotuloDe(SEXO, pessoa.sexo)} />
                <Campo label="Raça/Cor" valor={rotuloDe(RACA_COR, pessoa.raca_cor)} />
                <Campo label="Estado civil" valor={rotuloDe(ESTADO_CIVIL, pessoa.estado_civil)} />
              </div>
            </SecaoFicha>

            <SecaoFicha titulo="Documentação">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <DocumentoFicha label="CPF" mascarado={pessoa.cpf_mascarado} revelado={cpfRevelado} carregando={carregandoCpf} aoAlternar={alternarCpf} irregular={cpfIrregular} />
                <DocumentoFicha label="NIS" mascarado={pessoa.nis_mascarado} revelado={nisRevelado} carregando={carregandoNis} aoAlternar={alternarNis} irregular={nisIrregular} />
              </div>
            </SecaoFicha>

            <SecaoFicha titulo="Socioeconômico">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Campo label="Escolaridade" valor={rotuloDe(ESCOLARIDADE, pessoa.escolaridade)} />
                <Campo label="Ocupação" valor={pessoa.ocupacao} />
                <Campo label="Situação no mercado de trabalho" valor={rotuloDe(SITUACAO_MERCADO, pessoa.situacao_mercado_trabalho)} />
                <Campo label="Renda mensal" valor={fmtMoeda(pessoa.renda_mensal)} />
              </div>
            </SecaoFicha>

            <SecaoFicha titulo="Condições">
              <div className="flex flex-wrap gap-2">
                <ChipBooleano label="Frequenta escola" ativo={pessoa.frequenta_escola} />
                <ChipBooleano label="Gestante" ativo={pessoa.gestante} />
                <ChipBooleano label="Amamentando" ativo={pessoa.amamentando} />
              </div>
              <div className="mt-2">
                <Campo label="Tipo de deficiência" valor={rotuloDe(TIPO_DEFICIENCIA, pessoa.tipo_deficiencia)} />
              </div>
            </SecaoFicha>

            <SecaoFicha titulo="Vínculo com a família">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Campo label="Parentesco" valor={rotuloDe(PARENTESCO, membro.parentesco)} />
                <Campo label="Responsável" valor={membro.is_responsavel ? "Sim" : "Não"} />
                <Campo label="Membro desde" valor={formatarData(membro.data_entrada)} />
              </div>
            </SecaoFicha>
          </div>

          {/* ── COLUNA LATERAL (contexto do dossiê) ── */}
          <aside className="space-y-3">
            {/* Composição familiar */}
            <SecaoContexto titulo="Família" icone={<Users className="h-4 w-4" />}>
              <ul className="space-y-2">
                {familia.membros.filter((m) => m.status === "ATIVO").map((fm) => (
                  <li key={fm.membership_id} className="flex items-center justify-between gap-2 text-sm">
                    <Link to={`/familias/${familia.id}/pessoa/${fm.person_id}`} className={`truncate hover:text-primary hover:underline focus-visible:outline-focus ${fm.person_id === pessoa.id ? "font-semibold text-ink" : "text-ink-soft"}`}>
                      {fm.nome_exibicao}
                    </Link>
                    <span className="shrink-0 text-xs text-ink-soft">
                      {rotuloDe(PARENTESCO, fm.parentesco)}
                      {fm.is_responsavel && <Chip cor="primario">Responsável</Chip>}
                    </span>
                  </li>
                ))}
              </ul>
              {rendaQ.data && (
                <div className="mt-2 border-t border-ink-soft/10 pt-2 text-xs text-ink-soft">
                  Renda total: <strong className="text-ink">{fmtMoeda(rendaQ.data.renda_familiar_total)}</strong>
                  {" · "}Per capita: <strong className="text-ink">{fmtMoeda(rendaQ.data.renda_per_capita)}</strong>
                </div>
              )}
              <Link to={`/familias/${familia.id}`} className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">Ver família completa</Link>
            </SecaoContexto>

            {/* Benefícios ativos */}
            <SecaoContexto titulo="Benefícios ativos">
              {beneficiosQ.data && beneficiosQ.data.length > 0 ? (
                <ul className="space-y-1.5 text-sm">
                  {beneficiosQ.data.filter((b) => b.status !== "NEGADO" && b.status !== "CANCELADO").slice(0, 5).map((b) => (
                    <li key={b.id} className="flex justify-between">
                      <span className="text-ink-soft">{b.benefit_type_code} · {formatarData(b.data_solicitacao)}</span>
                      <Chip cor="beneficio">{b.status}</Chip>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-soft">Nenhum benefício ativo.</p>
              )}
            </SecaoContexto>

            {/* Benefícios eventuais */}
            <SecaoContexto titulo="Benefícios eventuais">
              {beneficiosQ.data && beneficiosQ.data.length > 0 ? (
                <ul className="space-y-1.5 text-sm">
                  {beneficiosQ.data.slice(0, 3).map((b) => (
                    <li key={b.id} className="flex justify-between">
                      <span>{b.benefit_type_code} · {formatarData(b.data_solicitacao)}</span>
                      <span className="text-xs text-ink-soft">{b.valor_total != null ? fmtMoeda(b.valor_total) : "—"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-soft">Nenhum benefício eventual concedido.</p>
              )}
            </SecaoContexto>

            {/* Atendimentos recentes */}
            <SecaoContexto titulo="Atendimentos recentes">
              {prontuariosQ.data && prontuariosQ.data.length > 0 ? (
                <ul className="space-y-1.5 text-xs">
                  {prontuariosQ.data.slice(0, 3).map((p) => (
                    <li key={p.id} className="flex justify-between">
                      <span className="text-ink-soft">{p.service_type_code}</span>
                      <span className="text-ink-soft">{formatarData(p.aberto_em)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-soft">Nenhum atendimento registrado.</p>
              )}
            </SecaoContexto>

            {/* Encaminhamentos */}
            <SecaoContexto titulo="Encaminhamentos">
              {/* TODO: integrar encaminhamentos da família filtrados por pessoa */}
              <p className="text-xs text-ink-soft">Indisponível — TODO: integrar encaminhamentos</p>
            </SecaoContexto>

            {/* Domicílio */}
            <SecaoContexto titulo="Domicílio">
              {domicilioQ.data ? (
                <div className="text-xs text-ink-soft space-y-0.5">
                  <p>{familia.logradouro}{familia.numero ? `, ${familia.numero}` : ""}{familia.bairro ? ` — ${familia.bairro}` : ""}</p>
                  {domicilioQ.data.tipo_construcao && <p>Tipo: {domicilioQ.data.tipo_construcao}</p>}
                  {domicilioQ.data.total_comodos != null && <p>{domicilioQ.data.total_comodos} cômodos · {domicilioQ.data.total_dormitorios} dormitórios</p>}
                </div>
              ) : (
                <p className="text-xs text-ink-soft">Indisponível — TODO: integrar domicílio</p>
              )}
            </SecaoContexto>

            {/* Vulnerabilidades */}
            <SecaoContexto titulo="Vulnerabilidades">
              {vulnerabilidadesQ.data && vulnerabilidadesQ.data.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {vulnerabilidadesQ.data.map((v) => (
                    <span key={v.id} className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "var(--ga-chip-regularize-bg)", color: "var(--ga-chip-regularize-text)" }}>
                      {v.tipo}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-soft">Nenhuma vulnerabilidade registrada.</p>
              )}
            </SecaoContexto>

            {/* Trilha / condicionalidades */}
            <SecaoContexto titulo="Trilha">
              {/* TODO: integrar timeline filtrada por pessoa */}
              <p className="text-xs text-ink-soft">Indisponível — TODO: integrar trilha</p>
            </SecaoContexto>
          </aside>
        </div>

        {/* PRINT FOOTER (só no papel) */}
        <PrintFooter />
      </div>

      {/* MODAL DE EDIÇÃO */}
      {editando && (
        <EditarMembroNaFicha pessoa={pessoa} membro={membro} familyId={familia.id} aoFechar={() => setEditando(false)} />
      )}
    </main>
  );
}

// ─── CABEÇALHO DA FICHA (tela + impressão) ──────────────────────

function FichaHeader({
  pessoa, membro, anos, faixa, familia,
  rendaPerCapita, cpfIrregular, nisIrregular,
  ocultarVazios, aoAlternarVazios, aoEditar, aoImprimir, aoVoltar,
}: {
  pessoa: PersonOut; membro: MemberOut; anos: number | null; faixa: FaixaEtaria;
  familia: FamilyOut;
  rendaPerCapita: number | null; cpfIrregular: boolean; nisIrregular: boolean;
  ocultarVazios: boolean; aoAlternarVazios: () => void;
  aoEditar: () => void; aoImprimir: () => void; aoVoltar: () => void;
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const navigate = useNavigate();
  const nomeExibicao = pessoa.nome_social
    ? `${pessoa.nome_social} (${pessoa.nome_civil})`
    : pessoa.nome_civil;

  const iniciais = nomeExibicao
    .split(" ")
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

  return (
    <header className="print-header-section sticky top-0 z-20 -mx-2 rounded-b-2xl bg-surface px-2 pb-3 pt-1 shadow-md no-print">
      {/* ── Avatar + H1 + Badges (tela = impressão) ── */}
      <div className="print-header-top-area">
        <div className="flex items-start gap-3 mb-2">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-on-primary no-print" aria-hidden="true">
            {iniciais}
          </div>
          <div className="min-w-0">
            <h1 className="font-titulo text-headline-md text-ink truncate">{nomeExibicao}</h1>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {anos !== null && (
                <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: ESTILO_FAIXA_CHIP[faixa].bg, color: ESTILO_FAIXA_CHIP[faixa].fg }}>
                  {anos} anos · {ROTULO_FAIXA[faixa]}
                </span>
              )}
              {pessoa.sexo && (
                <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "var(--ga-chip-neutral-bg)", color: "var(--ga-chip-neutral-text)" }}>
                  {rotuloDe(SEXO, pessoa.sexo)}
                </span>
              )}
              {familia.beneficiaria_pbf && (
                <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "var(--ga-chip-pbf-bg)", color: "var(--ga-chip-pbf-text)" }}>
                  Bolsa Família
                </span>
              )}
              {pessoa.tipo_deficiencia && pessoa.tipo_deficiencia !== "NENHUMA" && (
                <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "var(--ga-chip-regularize-bg)", color: "var(--ga-chip-regularize-text)" }}>
                  Pessoa com deficiência
                </span>
              )}
              {cpfIrregular && (
                <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "var(--ga-chip-regularize-bg)", color: "var(--ga-chip-regularize-text)" }}>
                  CPF a regularizar
                </span>
              )}
              {nisIrregular && (
                <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "var(--ga-chip-regularize-bg)", color: "var(--ga-chip-regularize-text)" }}>
                  NIS a regularizar
                </span>
              )}
              {membro.is_responsavel && <Chip cor="primario">Responsável</Chip>}
            </div>
            <div className="mt-1 text-xs text-ink-soft">
              {rotuloDe(PARENTESCO, membro.parentesco)} · membro desde {formatarData(membro.data_entrada)}
            </div>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div className="print-kpis mb-3 grid grid-cols-4 gap-2">
          <Kpi rotulo="Renda individual" valor={fmtMoeda(pessoa.renda_mensal)} />
          <Kpi rotulo="Renda per capita" valor={fmtMoeda(rendaPerCapita)} />
          <Kpi rotulo="PBF" valor={familia.beneficiaria_pbf ? "Ativo" : "Inativo"} cor={familia.beneficiaria_pbf ? "verde" : "cinza"} />
          <Kpi rotulo="CadÚnico" valor={familia.no_cadunico ? (familia.cadunico_atualizado_em ? formatarData(familia.cadunico_atualizado_em) : "Ativo") : "Não"} cor={familia.no_cadunico ? "verde" : "cinza"} />
        </div>
      </div>

      {/* ── Toggle ocultar vazios ── */}
      <div className="mb-2 flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-soft">
          <input type="checkbox" checked={ocultarVazios} onChange={aoAlternarVazios} className="h-3.5 w-3.5 accent-primary" />
          Ocultar campos não preenchidos
        </label>
      </div>

      {/* ── Barra de ações ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Botao variante="tertiario" tamanho="sm" iconeInicio={<ArrowLeft className="h-4 w-4" />} onClick={aoVoltar}>Voltar</Botao>
        <Botao variante="primario" tamanho="sm" iconeInicio={<Edit3 className="h-4 w-4" />} onClick={aoEditar}>Editar</Botao>
        <Botao variante="secundario" tamanho="sm" iconeInicio={<Printer className="h-4 w-4" />} onClick={aoImprimir} aria-label={`Imprimir ficha de ${pessoa.nome_exibicao}`}>Imprimir</Botao>

        {/* Menu ⋯ */}
        <div className="relative">
          <Botao variante="tertiario" tamanho="sm" onClick={() => setMenuAberto((v) => !v)} aria-label="Mais ações" aria-expanded={menuAberto}>
            <MoreHorizontal className="h-4 w-4" />
          </Botao>
          {menuAberto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)} />
              <div className="absolute right-0 top-10 z-20 min-w-48 rounded-xl border border-outline-variant/30 bg-surface p-1.5 shadow-xl">
                <button type="button" onClick={() => { setMenuAberto(false); /* TODO: modal definir responsável */ navigate(`/familias/${familia.id}?aba=membros`); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-primary-soft">
                  <Star className="h-4 w-4" /> Definir como responsável
                </button>
                <button type="button" onClick={() => { setMenuAberto(false); /* TODO: modal desvincular */ navigate(`/familias/${familia.id}?aba=membros`); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-red-50">
                  <UserMinus className="h-4 w-4" /> Desvincular da família
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Kpi({ rotulo, valor, cor }: { rotulo: string; valor: string | null; cor?: "verde" | "cinza" | "ambito" }) {
  const bg = cor === "verde" ? "var(--ga-chip-pbf-bg)" : cor === "ambito" ? "var(--ga-chip-outdated-bg)" : "var(--ga-chip-neutral-bg)";
  const fg = cor === "verde" ? "var(--ga-chip-pbf-text)" : cor === "ambito" ? "var(--ga-chip-outdated-text)" : "var(--ga-chip-neutral-text)";
  return (
    <div className="rounded-lg border border-ink-soft/10 p-2 text-center" style={{ backgroundColor: bg, color: fg }}>
      <div className="text-[9px] uppercase tracking-wide opacity-75">{rotulo}</div>
      <div className="text-xs font-bold">{valor ?? "—"}</div>
    </div>
  );
}

// ─── SEÇÕES ─────────────────────────────────────────────────────

function SecaoFicha({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
  return (
    <section aria-labelledby={id} className="ficha-section rounded-cartao border border-ink-soft/15 bg-surface p-3 print-section">
      <h3 id={id} className="mb-2 text-xs font-bold tracking-wide text-ink-soft" style={{ textTransform: "uppercase" }}>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function SecaoContexto({ titulo, children, icone }: { titulo: string; children: ReactNode; icone?: ReactNode }) {
  const id = titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
  return (
    <section aria-labelledby={id} className="print-section rounded-cartao border border-ink-soft/10 bg-surface p-3">
      <h4 id={id} className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {icone} {titulo}
      </h4>
      {children}
    </section>
  );
}

function Campo({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <dl className="ficha-campo">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">
        {valor && valor.length > 0 ? valor : <span className="text-ink-soft/50">— Não informado</span>}
      </dd>
    </dl>
  );
}

function ChipBooleano({ label, ativo }: { label: string; ativo: boolean | null }) {
  if (ativo === null) return <Campo label={label} valor={null} />;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${ativo ? "text-[var(--ga-chip-pbf-text)]" : "text-[var(--ga-chip-neutral-text)]"}`}
      style={{ backgroundColor: ativo ? "var(--ga-chip-pbf-bg)" : "var(--ga-chip-neutral-bg)" }}>
      {label}: {ativo ? "Sim" : "Não"}
    </span>
  );
}

function DocumentoFicha({ label, mascarado, revelado, carregando, aoAlternar, irregular }: {
  label: string; mascarado: string | null; revelado: string | null; carregando: boolean;
  aoAlternar: (visivel: boolean) => void; irregular: boolean;
}) {
  const exibindo = revelado ?? mascarado;
  return (
    <dl className="ficha-campo">
      <dt className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
        {label}
        {irregular && (
          <span className="inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ backgroundColor: "var(--ga-chip-regularize-bg)", color: "var(--ga-chip-regularize-text)" }}>
            A regularizar
          </span>
        )}
      </dt>
      <dd className="mt-0.5 flex items-center gap-2 text-sm text-ink">
        <span className="fonte-mono">{exibindo ?? "Não informado"}</span>
        {mascarado && (
          <button type="button" className="no-print inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10 focus-visible:outline-focus"
            disabled={carregando} onClick={() => aoAlternar(Boolean(revelado))}
            aria-label={revelado ? `Ocultar ${label}` : `Revelar ${label}`}>
            {carregando ? (
              <span className="material-symbols-outlined !text-[14px] animate-spin">progress_activity</span>
            ) : revelado ? (
              <span className="material-symbols-outlined !text-[14px]">visibility_off</span>
            ) : (
              <span className="material-symbols-outlined !text-[14px]">visibility</span>
            )}
            {revelado ? "Ocultar" : "Revelar"}
          </button>
        )}
      </dd>
    </dl>
  );
}

// ─── PRINT HEADER (só no papel) ──────────────────────────────

function PrintHeader({ tema, familia, pessoa, docsRevelados, sessao, rendaPerCapita, pbfAtivo }: {
  tema: { nomeMunicipio: string; brasaoUrl: string | null };
  familia: FamilyOut; pessoa: PersonOut; docsRevelados: string[];
  sessao: { usuario: { name: string } | null; claims: { roles: string[] } | null };
  rendaPerCapita: number | null; pbfAtivo: boolean;
}) {
  const dataHora = formatarDataHora(agora().toISOString());
  const nomeUsuario = sessao.usuario?.name ?? "Sistema";
  const papel = sessao.claims?.roles?.[0] ?? "";
  const responsavel = familia.membros.find((m) => m.is_responsavel);

  return (
    <header className="print-only print-header">
      <div className="flex justify-between items-start">
        <div>
          <strong className="block font-titulo text-base">{tema.nomeMunicipio}</strong>
          <span className="text-[10px] text-ink-soft">Assistência Social · GovSocial</span>
        </div>
        {familia.territorio && <span className="text-[10px] text-ink-soft">Unidade: {familia.territorio}</span>}
      </div>
      <div className="mt-2 border-b-2 border-ink/20 pb-1 mb-2">
        <h2 className="font-titulo text-sm">FICHA INDIVIDUAL — DOSSIÊ SOCIOASSISTENCIAL</h2>
      </div>
      <div className="text-[9px] text-ink-soft space-y-0.5">
        <p>Família nº {familia.codigo}{responsavel && <> · Responsável: {responsavel.nome_exibicao}</>}</p>
        <p>Emitido em {dataHora}{nomeUsuario && <> · por {nomeUsuario}{papel ? ` — ${papel}` : ""}</>}</p>
      </div>
      {/* KPIs no papel */}
      <div className="print-kpis mt-2 grid grid-cols-4 gap-2 text-center text-[8px]">
        <div className="border px-1 py-0.5 rounded"><strong>Renda indiv.</strong><br />{fmtMoeda(pessoa.renda_mensal) ?? "—"}</div>
        <div className="border px-1 py-0.5 rounded"><strong>Per capita</strong><br />{fmtMoeda(rendaPerCapita) ?? "—"}</div>
        <div className="border px-1 py-0.5 rounded"><strong>PBF</strong><br />{pbfAtivo ? "Ativo" : "Não"}</div>
        <div className="border px-1 py-0.5 rounded"><strong>CadÚnico</strong><br />{familia.no_cadunico ? (familia.cadunico_atualizado_em ? formatarData(familia.cadunico_atualizado_em) : "Sim") : "Não"}</div>
      </div>
      {docsRevelados.length > 0 && (
        <p className="mt-1.5 text-[9px] font-semibold" style={{ color: "var(--ga-chip-regularize-text)" }}>
          ⚠ Documentos revelados nesta emissão.
        </p>
      )}
    </header>
  );
}

function PrintFooter() {
  return (
    <footer className="print-only print-footer">
      <p>Documento emitido pelo sistema GovSocial — uso interno da Assistência Social. Informações sujeitas a sigilo (Lei nº 13.846/2019 e LGPD).</p>
    </footer>
  );
}

// ─── MODAL DE EDIÇÃO (código do v1, acentos corrigidos) ────────

const CAMPOS_PESSOA: CampoPessoa[] = [
  "nome_civil", "nome_social", "data_nascimento", "sexo", "raca_cor",
  "estado_civil", "escolaridade", "ocupacao", "frequenta_escola",
  "situacao_mercado_trabalho", "gestante", "amamentando", "renda_mensal",
  "tipo_deficiencia",
];

function paraFormulario(p: PersonOut): DadosPessoa {
  return {
    nome_civil: p.nome_civil, nome_social: p.nome_social ?? "",
    data_nascimento: p.data_nascimento ?? "", sexo: p.sexo ?? "",
    raca_cor: p.raca_cor ?? "", estado_civil: p.estado_civil ?? "",
    escolaridade: p.escolaridade ?? "", ocupacao: p.ocupacao ?? "",
    frequenta_escola: p.frequenta_escola ?? false,
    situacao_mercado_trabalho: p.situacao_mercado_trabalho ?? "",
    gestante: p.gestante ?? false, amamentando: p.amamentando ?? false,
    renda_mensal: p.renda_mensal ?? undefined, tipo_deficiencia: p.tipo_deficiencia ?? "",
  };
}

function montarPatchPessoa(dados: DadosPessoa, sujos: Partial<Record<CampoPessoa, unknown>>): PersonUpdate {
  const corpo: Record<string, unknown> = {};
  for (const campo of CAMPOS_PESSOA) {
    if (!sujos[campo]) continue;
    const v = dados[campo];
    corpo[campo] = v === "" || v === undefined ? null : v;
  }
  return corpo as PersonUpdate;
}

function EditarMembroNaFicha({ pessoa, membro, familyId, aoFechar }: {
  pessoa: PersonOut; membro: MemberOut; familyId: string; aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [cpf, setCpf] = useState("");
  const [nis, setNis] = useState("");
  const [editandoCpf, setEditandoCpf] = useState(false);
  const [editandoNis, setEditandoNis] = useState(false);
  const [parentesco, setParentesco] = useState(membro.parentesco ?? "");

  const { register, handleSubmit, formState: { errors, dirtyFields } } = useForm<DadosPessoa>({
    resolver: zodResolver(esquemaPessoa), defaultValues: paraFormulario(pessoa),
  });

  const salvar = useMutation({
    mutationFn: async (dados: DadosPessoa) => {
      const corpo = montarPatchPessoa(dados, dirtyFields);
      if (editandoCpf) corpo.cpf = apenasDigitos(cpf) || null;
      if (editandoNis) corpo.nis = apenasDigitos(nis) || null;
      if (Object.keys(corpo).length > 0) await servicoPessoas.atualizar(pessoa.id, corpo);
      if ((membro.parentesco ?? "") !== parentesco) {
        await servicoFamilias.atualizarMembro(familyId, membro.person_id, { parentesco: parentesco || null });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["familia", familyId] });
      void queryClient.invalidateQueries({ queryKey: ["pessoa", pessoa.id] });
      avisar.sucesso("Dados atualizados.");
      aoFechar();
    },
    onError: (e) => { avisar.erro(e instanceof ErroApi ? e.message : "Não foi possível salvar."); },
  });

  const cpfInvalido = editandoCpf && cpf.length > 0 && !validarCpf(cpf);
  const nisInvalido = editandoNis && nis.length > 0 && !validarNis(nis);

  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Editar ${membro.nome_exibicao}`} descricao="Dados cadastrais da pessoa e vínculo com a família." tamanho="lg">
      <form onSubmit={handleSubmit((d) => salvar.mutate(d))} noValidate>
        <div className="max-h-[65vh] space-y-6 overflow-y-auto pr-1">
          <FormularioPessoa registrar={(campo, opcoes) => register(campo, opcoes)} erros={errors}
            identificacao={
              <>
                <DocumentoSigiloso label="CPF" mascarado={pessoa.cpf_mascarado} editando={editandoCpf} aoAlternar={(v) => { setEditandoCpf(v); if (!v) setCpf(""); }}>
                  <CampoCPF label="Novo CPF" valor={cpf} aoMudar={setCpf} />
                </DocumentoSigiloso>
                <DocumentoSigiloso label="NIS" mascarado={pessoa.nis_mascarado} editando={editandoNis} aoAlternar={(v) => { setEditandoNis(v); if (!v) setNis(""); }}>
                  <CampoNIS label="Novo NIS" valor={nis} aoMudar={setNis} />
                </DocumentoSigiloso>
              </>
            }
          />
          <fieldset className="border-t border-ink-soft/15 pt-4">
            <legend className="text-xs font-bold uppercase tracking-wide text-ink-soft">Vínculo com a família</legend>
            <div className="mt-3">
              <Select label="Parentesco" opcoes={membro.is_responsavel ? PARENTESCO : [{ valor: "", rotulo: "Não informado" }, ...PARENTESCO.filter((p) => p.valor !== "RESPONSAVEL")]} value={parentesco} onChange={(e) => setParentesco(e.target.value)} disabled={membro.is_responsavel} className="p-3" />
              {membro.is_responsavel && <p className="mt-1 text-xs text-ink-soft">Para mudar, defina outro membro como responsável na composição familiar.</p>}
            </div>
          </fieldset>
        </div>
        <div className="mt-6 flex justify-end gap-3 border-t border-ink-soft/15 pt-4">
          <Botao variante="secundario" type="button" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" type="submit" carregando={salvar.isPending} disabled={cpfInvalido || nisInvalido}>Salvar</Botao>
        </div>
      </form>
    </Modal>
  );
}
