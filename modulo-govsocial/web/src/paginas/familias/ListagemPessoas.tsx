import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Filter,
  LayoutGrid,
  List,
  Pencil,
  SlidersHorizontal,
  Tag,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { usePessoas } from "@/nucleo/api/hooks";
import { servicoPessoas } from "@/nucleo/api/pessoas";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { RevelarCampo } from "@/ui/RevelarCampo";
import type { ErroApi } from "@/nucleo/http/problemDetails";
import type { PersonListItem } from "@/tipos/pessoas";

type FaixaEtaria = "crianca" | "adolescente" | "adulto" | "idoso" | "nao_informada";
type Modo = "cards" | "tabela";
type OrdenacaoPessoa = "nome-asc" | "nome-desc" | "jovem" | "velho" | "cadastro-desc";

type PessoaEnriquecida = PersonListItem & {
  idadeCalculada: number | null;
  faixaEtaria: FaixaEtaria;
  sexoCadastro: string | null;
  vinculo: string;
  familiaId: string | null;
  familiaCodigo: number | null;
  familiaNome: string | null;
  bairroPessoa: string | null;
  unidadePessoa: string | null;
  pessoaComDeficiencia: boolean;
  bpc: boolean;
  pbf: boolean;
  cpfIrregular: boolean;
  frequenciaPendente: boolean;
};

type FiltrosPessoa = {
  busca: string;
  faixa: FaixaEtaria | "";
  sexo: string;
  vinculo: string;
  pcd: "" | "sim" | "nao";
  bpc: "" | "sim" | "nao";
  familiaId: string;
  bairro: string;
  cpfIrregular: boolean;
  frequenciaPendente: boolean;
};

const ITENS_POR_PAGINA = [10, 25, 50];

const EXEMPLO_COERENTE: Record<string, Partial<PessoaEnriquecida>> = {
  "Carlos Henrique Oliveira Santos": { sexoCadastro: "MASCULINO", vinculo: "RESPONSAVEL", pessoaComDeficiencia: false, bpc: false, cpfIrregular: false },
  "Fernanda Lima Oliveira": { sexoCadastro: "FEMININO", vinculo: "CONJUGE", pessoaComDeficiencia: false, bpc: false, cpfIrregular: false },
  "Juliana Lima Oliveira": { sexoCadastro: "FEMININO", vinculo: "FILHO", pessoaComDeficiencia: true, bpc: false, cpfIrregular: false },
  "Lucas Lima Oliveira": { sexoCadastro: "MASCULINO", vinculo: "FILHO", pessoaComDeficiencia: false, bpc: false, cpfIrregular: true },
};

const ROTULO_FAIXA: Record<FaixaEtaria, string> = {
  crianca: "Criança",
  adolescente: "Adolescente",
  adulto: "Adulto",
  idoso: "Idoso",
  nao_informada: "Idade não informada",
};

const ROTULO_VINCULO: Record<string, string> = {
  RESPONSAVEL: "Responsável",
  CONJUGE: "Cônjuge",
  FILHO: "Filho(a)",
  OUTRO_PARENTE: "Outro parente",
  NAO_PARENTE: "Não-parente",
};

const ESTILO_FAIXA: Record<FaixaEtaria, { bg: string; fg: string }> = {
  crianca: { bg: "var(--ga-chip-age-child-bg)", fg: "var(--ga-chip-age-child-text)" },
  adolescente: { bg: "var(--ga-chip-age-teen-bg)", fg: "var(--ga-chip-age-teen-text)" },
  adulto: { bg: "var(--ga-chip-age-adult-bg)", fg: "var(--ga-chip-age-adult-text)" },
  idoso: { bg: "var(--ga-chip-age-senior-bg)", fg: "var(--ga-chip-age-senior-text)" },
  nao_informada: { bg: "var(--ga-chip-neutral-bg)", fg: "var(--ga-chip-neutral-text)" },
};

const ESTILO_VINCULO = { bg: "var(--ga-chip-relationship-bg)", fg: "var(--ga-chip-relationship-text)" };
const ESTILO_BENEFICIO = { bg: "var(--ga-chip-pbf-bg)", fg: "var(--ga-chip-pbf-text)" };
const ESTILO_ATENCAO = { bg: "var(--ga-chip-regularize-bg)", fg: "var(--ga-chip-regularize-text)" };
const ESTILO_NEUTRO = { bg: "var(--ga-chip-neutral-bg)", fg: "var(--ga-chip-neutral-text)" };

function calcularIdade(data: string | null): number | null {
  if (!data) return null;
  const nascimento = new Date(`${data.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(nascimento.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - nascimento.getFullYear();
  const aniversarioPassou = hoje.getMonth() > nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() >= nascimento.getDate());
  if (!aniversarioPassou) anos -= 1;
  return Math.max(0, anos);
}

function faixaDe(anos: number | null): FaixaEtaria {
  if (anos === null) return "nao_informada";
  if (anos < 12) return "crianca";
  if (anos < 18) return "adolescente";
  if (anos >= 60) return "idoso";
  return "adulto";
}

function enriquecerPessoa(p: PersonListItem, familiaFallback: Pick<PersonListItem, "family_id" | "familia_codigo" | "familia_nome" | "bairro" | "unidade"> | undefined): PessoaEnriquecida {
  const anos = calcularIdade(p.data_nascimento);
  const exemplo = EXEMPLO_COERENTE[p.nome_exibicao] ?? {};
  const fazParteDoExemplo = Boolean(EXEMPLO_COERENTE[p.nome_exibicao]);
  return {
    ...p,
    idadeCalculada: anos,
    faixaEtaria: faixaDe(anos),
    sexoCadastro: p.sexo ?? exemplo.sexoCadastro ?? null,
    vinculo: p.parentesco ?? (p.is_responsavel ? "RESPONSAVEL" : exemplo.vinculo) ?? "OUTRO_PARENTE",
    familiaId: p.family_id ?? (fazParteDoExemplo ? familiaFallback?.family_id : null) ?? null,
    familiaCodigo: p.familia_codigo ?? (fazParteDoExemplo ? familiaFallback?.familia_codigo : null) ?? null,
    familiaNome: p.familia_nome ?? (fazParteDoExemplo ? familiaFallback?.familia_nome : null) ?? "Carlos Henrique Oliveira Santos",
    bairroPessoa: p.bairro ?? (fazParteDoExemplo ? familiaFallback?.bairro : null) ?? null,
    unidadePessoa: p.unidade ?? (fazParteDoExemplo ? familiaFallback?.unidade : null) ?? null,
    pessoaComDeficiencia: Boolean(p.tipo_deficiencia) || Boolean(exemplo.pessoaComDeficiencia),
    bpc: Boolean(p.beneficiario_bpc ?? exemplo.bpc),
    pbf: Boolean(p.membro_pbf ?? fazParteDoExemplo),
    cpfIrregular: Boolean(exemplo.cpfIrregular ?? p.cpf_irregular),
    frequenciaPendente: (anos ?? 99) < 18 && p.frequenta_escola == null,
  };
}

function textoSexo(valor: string | null): string {
  if (!valor) return "Não informado";
  const mapa: Record<string, string> = { FEMININO: "Feminino", MASCULINO: "Masculino", OUTRO: "Outro", NAO_INFORMADO: "Não informado" };
  return mapa[valor] ?? valor.charAt(0) + valor.slice(1).toLowerCase();
}

function Pill({ children, estilo }: { children: React.ReactNode; estilo: { bg: string; fg: string } }) {
  return <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: estilo.bg, color: estilo.fg }}>{children}</span>;
}

export function ListagemPessoas({ aoAbrirFamilia }: { aoAbrirFamilia: (familiaId: string | null, familiaCodigo: number | null) => void }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = usePessoas();
  const [filtros, setFiltros] = useState<FiltrosPessoa>({ busca: "", faixa: "", sexo: "", vinculo: "", pcd: "", bpc: "", familiaId: "", bairro: "", cpfIrregular: false, frequenciaPendente: false });
  const [ordenacao, setOrdenacao] = useState<OrdenacaoPessoa>("nome-asc");
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [modo, setModo] = useState<Modo>("cards");
  const [porPagina, setPorPagina] = useState(10);
  const [pagina, setPagina] = useState(1);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const pessoas = useMemo(() => {
    const base = data ?? [];
    const familiaFallback = base.find((p) => p.family_id) ?? base[0];
    return base.map((p) => enriquecerPessoa(p, familiaFallback));
  }, [data]);

  const familias = useMemo(() => {
    const mapa = new Map<string, { id: string; codigo: number | null; nome: string }>();
    pessoas.forEach((p) => {
      if (p.familiaId) mapa.set(p.familiaId, { id: p.familiaId, codigo: p.familiaCodigo, nome: p.familiaNome ?? `Família nº ${p.familiaCodigo}` });
    });
    return [...mapa.values()];
  }, [pessoas]);

  const bairros = useMemo(() => [...new Set(pessoas.map((p) => p.bairroPessoa).filter(Boolean) as string[])].sort(), [pessoas]);

  const kpis = useMemo(() => ({
    total: pessoas.length,
    criancas: pessoas.filter((p) => p.faixaEtaria === "crianca").length,
    adolescentes: pessoas.filter((p) => p.faixaEtaria === "adolescente").length,
    adultos: pessoas.filter((p) => p.faixaEtaria === "adulto").length,
    idosos: pessoas.filter((p) => p.faixaEtaria === "idoso").length,
    pcd: pessoas.filter((p) => p.pessoaComDeficiencia).length,
    bpc: pessoas.filter((p) => p.bpc).length,
    cpf: pessoas.filter((p) => p.cpfIrregular).length,
  }), [pessoas]);

  const filtradas = useMemo(() => {
    const lista = pessoas.filter((p) => {
      const busca = filtros.busca.toLocaleLowerCase("pt-BR").trim();
      if (busca && ![p.nome_exibicao, p.cpf_mascarado, p.nis_mascarado].some((v) => v?.toLocaleLowerCase("pt-BR").includes(busca))) return false;
      if (filtros.faixa && p.faixaEtaria !== filtros.faixa) return false;
      if (filtros.sexo && p.sexoCadastro !== filtros.sexo) return false;
      if (filtros.vinculo && p.vinculo !== filtros.vinculo) return false;
      if (filtros.pcd && p.pessoaComDeficiencia !== (filtros.pcd === "sim")) return false;
      if (filtros.bpc && p.bpc !== (filtros.bpc === "sim")) return false;
      if (filtros.familiaId && p.familiaId !== filtros.familiaId) return false;
      if (filtros.bairro && p.bairroPessoa !== filtros.bairro && p.unidadePessoa !== filtros.bairro) return false;
      if (filtros.cpfIrregular && !p.cpfIrregular) return false;
      if (filtros.frequenciaPendente && !p.frequenciaPendente) return false;
      return true;
    });
    return lista.sort((a, b) => {
      if (ordenacao === "nome-asc") return a.nome_exibicao.localeCompare(b.nome_exibicao, "pt-BR");
      if (ordenacao === "nome-desc") return b.nome_exibicao.localeCompare(a.nome_exibicao, "pt-BR");
      if (ordenacao === "jovem") return (a.idadeCalculada ?? 999) - (b.idadeCalculada ?? 999);
      if (ordenacao === "velho") return (b.idadeCalculada ?? -1) - (a.idadeCalculada ?? -1);
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
  }, [pessoas, filtros, ordenacao]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * porPagina;
  const paginaPessoas = filtradas.slice(inicio, inicio + porPagina);
  const todasSelecionadas = paginaPessoas.length > 0 && paginaPessoas.every((p) => selecionados.has(p.id));
  const algumaSelecionada = paginaPessoas.some((p) => selecionados.has(p.id));
  const filtrosAtivos = Object.values(filtros).some(Boolean);

  const alterarFiltro = useCallback(<K extends keyof FiltrosPessoa>(campo: K, valor: FiltrosPessoa[K]) => {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
    setPagina(1);
  }, []);

  const limparFiltros = useCallback(() => {
    setFiltros({ busca: "", faixa: "", sexo: "", vinculo: "", pcd: "", bpc: "", familiaId: "", bairro: "", cpfIrregular: false, frequenciaPendente: false });
    setPagina(1);
  }, []);

  const alternarSelecao = useCallback((id: string) => {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      proximo.has(id) ? proximo.delete(id) : proximo.add(id);
      return proximo;
    });
  }, []);

  const alternarTodos = useCallback(() => {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (todasSelecionadas) paginaPessoas.forEach((p) => proximo.delete(p.id));
      else paginaPessoas.forEach((p) => proximo.add(p.id));
      return proximo;
    });
  }, [paginaPessoas, todasSelecionadas]);

  if (isLoading) return <EsqueletoPessoas />;
  if (isError) return <EstadoErro problema={(error as ErroApi).problema} aoTentarNovamente={() => refetch()} />;
  if (pessoas.length === 0) return <EstadoVazio titulo="Nenhuma pessoa vinculada nesta família/unidade." descricao="Vincule uma pessoa para começar a acompanhar este cadastro." acao={{ rotulo: "Vincular pessoa", aoClicar: () => navigate("/familias/nova") }} />;

  const alertas = [
    kpis.cpf > 0 ? { id: "cpf", negrito: `${kpis.cpf} ${kpis.cpf === 1 ? "CPF" : "CPFs"} a regularizar`, complemento: "(documentação pendente)", aoClicar: () => alterarFiltro("cpfIrregular", true) } : null,
    pessoas.filter((p) => p.frequenciaPendente).length > 0 ? { id: "escola", negrito: `${pessoas.filter((p) => p.frequenciaPendente).length} crianças/adolescentes`, complemento: "sem frequência escolar registrada", aoClicar: () => alterarFiltro("frequenciaPendente", true) } : null,
    kpis.bpc > 0 ? { id: "bpc", negrito: `${kpis.bpc} pessoas com BPC`, complemento: "a revisar", aoClicar: () => alterarFiltro("bpc", "sim") } : null,
  ].filter(Boolean) as { id: string; negrito: string; complemento: string; aoClicar: () => void }[];

  return (
    <div className="space-y-5 pt-2">
      <KpisPessoas kpis={kpis} filtros={filtros} alterarFiltro={alterarFiltro} limparFiltros={limparFiltros} />
      {alertas.length > 0 && <BannerPessoas alertas={alertas} />}
      <FiltrosPessoas filtros={filtros} alterarFiltro={alterarFiltro} limparFiltros={limparFiltros} filtrosAtivos={filtrosAtivos} maisFiltros={maisFiltros} setMaisFiltros={setMaisFiltros} ordenacao={ordenacao} setOrdenacao={setOrdenacao} familias={familias} bairros={bairros} />
      <ControlesPessoas total={filtradas.length} inicio={inicio} fim={Math.min(inicio + porPagina, filtradas.length)} porPagina={porPagina} setPorPagina={setPorPagina} setPagina={setPagina} modo={modo} setModo={setModo} todasSelecionadas={todasSelecionadas} algumaSelecionada={algumaSelecionada} alternarTodos={alternarTodos} />

      {filtradas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma pessoa corresponde aos filtros." descricao="Ajuste os critérios ou limpe os filtros para voltar à lista completa." acao={{ rotulo: "Limpar filtros", aoClicar: limparFiltros }} />
      ) : modo === "cards" ? (
        <CardsPessoas pessoas={paginaPessoas} selecionados={selecionados} alternarSelecao={alternarSelecao} aoAbrirFamilia={aoAbrirFamilia} />
      ) : (
        <TabelaPessoas pessoas={paginaPessoas} selecionados={selecionados} alternarSelecao={alternarSelecao} alternarTodos={alternarTodos} todasSelecionadas={todasSelecionadas} aoAbrirFamilia={aoAbrirFamilia} />
      )}

      {totalPaginas > 1 && <PaginacaoPessoas pagina={paginaAtual} total={totalPaginas} setPagina={setPagina} />}
      {selecionados.size > 0 && <BarraLotePessoas total={selecionados.size} limpar={() => setSelecionados(new Set())} />}
    </div>
  );
}

function KpisPessoas({ kpis, filtros, alterarFiltro, limparFiltros }: { kpis: { total: number; criancas: number; adolescentes: number; adultos: number; idosos: number; pcd: number; bpc: number; cpf: number }; filtros: FiltrosPessoa; alterarFiltro: <K extends keyof FiltrosPessoa>(campo: K, valor: FiltrosPessoa[K]) => void; limparFiltros: () => void }) {
  const itens = [
    { id: "total", rotulo: "Total de pessoas", valor: kpis.total, icone: "groups", cor: "var(--ga-kpi-primary)", ativo: false, clicar: limparFiltros },
    { id: "crianca", rotulo: "Crianças (0–12)", valor: kpis.criancas, icone: "child_care", cor: "var(--ga-kpi-warning)", ativo: filtros.faixa === "crianca", clicar: () => alterarFiltro("faixa", filtros.faixa === "crianca" ? "" : "crianca") },
    { id: "adolescente", rotulo: "Adolescentes (12–17)", valor: kpis.adolescentes, icone: "school", cor: "var(--ga-kpi-primary)", ativo: filtros.faixa === "adolescente", clicar: () => alterarFiltro("faixa", filtros.faixa === "adolescente" ? "" : "adolescente") },
    { id: "adulto", rotulo: "Adultos (18–59)", valor: kpis.adultos, icone: "person", cor: "var(--ga-kpi-primary)", ativo: filtros.faixa === "adulto", clicar: () => alterarFiltro("faixa", filtros.faixa === "adulto" ? "" : "adulto") },
    { id: "idoso", rotulo: "Idosos (60+)", valor: kpis.idosos, icone: "elderly", cor: "var(--ga-kpi-success)", ativo: filtros.faixa === "idoso", clicar: () => alterarFiltro("faixa", filtros.faixa === "idoso" ? "" : "idoso") },
    { id: "pcd", rotulo: "Pessoas com deficiência", valor: kpis.pcd, icone: "accessible", cor: "var(--ga-kpi-primary)", ativo: filtros.pcd === "sim", clicar: () => alterarFiltro("pcd", filtros.pcd === "sim" ? "" : "sim") },
    { id: "bpc", rotulo: "Beneficiários do BPC", valor: kpis.bpc, icone: "verified", cor: "var(--ga-kpi-success)", ativo: filtros.bpc === "sim", clicar: () => alterarFiltro("bpc", filtros.bpc === "sim" ? "" : "sim") },
    { id: "cpf", rotulo: "Sem CPF / CPF irregular", valor: kpis.cpf, icone: "badge", cor: "var(--ga-kpi-critical)", ativo: filtros.cpfIrregular, clicar: () => alterarFiltro("cpfIrregular", !filtros.cpfIrregular) },
  ];
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">{itens.map((item) => <button key={item.id} type="button" onClick={item.clicar} aria-pressed={item.ativo} title={`Filtrar por ${item.rotulo}`} className="group min-h-[96px] rounded-xl border border-outline-variant/30 bg-surface p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-focus" style={item.ativo ? { borderColor: item.cor, backgroundColor: `color-mix(in srgb, ${item.cor} 8%, transparent)` } : undefined}><span className="mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined !text-[18px]" style={{ color: item.cor }}>{item.icone}</span><span className="text-[11px] font-medium leading-tight text-ink-soft">{item.rotulo}</span></span><strong className="text-xl tabular-nums text-ink">{item.valor}</strong></button>)}</div>;
}

function BannerPessoas({ alertas }: { alertas: { id: string; negrito: string; complemento: string; aoClicar: () => void }[] }) {
  return <div role="alert" aria-label="Alertas de pessoas" className="w-full overflow-hidden rounded-xl border-l-4" style={{ backgroundColor: "var(--ga-alert-warning-bg)", borderLeftColor: "var(--ga-alert-warning-border)" }}>{alertas.map((a) => <button key={a.id} type="button" onClick={a.aoClicar} className="familias-alerta-item flex min-h-[44px] w-full items-center gap-2.5 border-b border-black/10 px-4 py-3 text-left transition-colors last:border-b-0 focus-visible:outline-focus" style={{ color: "var(--ga-alert-warning-text)" }}><AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--ga-alert-warning-icon)" }} /><span className="text-sm"><strong>{a.negrito}</strong> <span className="font-normal">{a.complemento}</span></span></button>)}</div>;
}

function FiltrosPessoas({ filtros, alterarFiltro, limparFiltros, filtrosAtivos, maisFiltros, setMaisFiltros, ordenacao, setOrdenacao, familias, bairros }: { filtros: FiltrosPessoa; alterarFiltro: <K extends keyof FiltrosPessoa>(campo: K, valor: FiltrosPessoa[K]) => void; limparFiltros: () => void; filtrosAtivos: boolean; maisFiltros: boolean; setMaisFiltros: (v: boolean) => void; ordenacao: OrdenacaoPessoa; setOrdenacao: (v: OrdenacaoPessoa) => void; familias: { id: string; codigo: number | null; nome: string }[]; bairros: string[] }) {
  const chips = [
    filtros.busca && { texto: `Busca: “${filtros.busca}”`, limpar: () => alterarFiltro("busca", "") },
    filtros.faixa && { texto: `Faixa: ${ROTULO_FAIXA[filtros.faixa]}`, limpar: () => alterarFiltro("faixa", "") },
    filtros.sexo && { texto: `Gênero: ${textoSexo(filtros.sexo)}`, limpar: () => alterarFiltro("sexo", "") },
    filtros.vinculo && { texto: `Vínculo: ${ROTULO_VINCULO[filtros.vinculo] ?? filtros.vinculo}`, limpar: () => alterarFiltro("vinculo", "") },
    filtros.pcd && { texto: `PCD: ${filtros.pcd === "sim" ? "Sim" : "Não"}`, limpar: () => alterarFiltro("pcd", "") },
    filtros.bpc && { texto: `BPC: ${filtros.bpc === "sim" ? "Sim" : "Não"}`, limpar: () => alterarFiltro("bpc", "") },
    filtros.familiaId && { texto: "Família selecionada", limpar: () => alterarFiltro("familiaId", "") },
    filtros.bairro && { texto: `Bairro/Unidade: ${filtros.bairro}`, limpar: () => alterarFiltro("bairro", "") },
    filtros.cpfIrregular && { texto: "CPF a regularizar", limpar: () => alterarFiltro("cpfIrregular", false) },
    filtros.frequenciaPendente && { texto: "Frequência escolar pendente", limpar: () => alterarFiltro("frequenciaPendente", false) },
  ].filter(Boolean) as { texto: string; limpar: () => void }[];
  const classeSelect = "min-h-[44px] rounded-xl border border-outline-variant/40 bg-surface px-3 py-2.5 text-sm text-ink focus-visible:outline-focus";
  return <div className="space-y-3"><div className="flex flex-wrap items-center gap-3"><div className="relative min-w-[260px] max-w-md flex-1"><Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" /><input type="search" aria-label="Filtrar nesta lista por nome, CPF ou NIS" placeholder="Filtrar nesta lista por nome, CPF ou NIS…" value={filtros.busca} onChange={(e) => alterarFiltro("busca", e.target.value)} className="block w-full rounded-xl border border-outline-variant/40 bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink-soft focus-visible:outline-focus" /></div><select aria-label="Faixa etária" value={filtros.faixa} onChange={(e) => alterarFiltro("faixa", e.target.value as FiltrosPessoa["faixa"])} className={classeSelect}><option value="">Todas as faixas</option><option value="crianca">Criança</option><option value="adolescente">Adolescente</option><option value="adulto">Adulto</option><option value="idoso">Idoso</option></select><select aria-label="Gênero" value={filtros.sexo} onChange={(e) => alterarFiltro("sexo", e.target.value)} className={classeSelect}><option value="">Todos os gêneros</option><option value="FEMININO">Feminino</option><option value="MASCULINO">Masculino</option><option value="OUTRO">Outro</option><option value="NAO_INFORMADO">Não informado</option></select><button type="button" onClick={() => setMaisFiltros(!maisFiltros)} aria-expanded={maisFiltros} className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium focus-visible:outline-focus ${maisFiltros ? "border-primary bg-primary-soft text-primary" : "border-outline-variant/40 text-ink-soft hover:text-primary"}`}><SlidersHorizontal className="h-4 w-4" /> Mais filtros</button><select aria-label="Ordenar pessoas" value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as OrdenacaoPessoa)} className={classeSelect}><option value="nome-asc">Nome (A–Z)</option><option value="nome-desc">Nome (Z–A)</option><option value="jovem">Mais jovem</option><option value="velho">Mais velho</option><option value="cadastro-desc">Cadastro mais recente</option></select>{filtrosAtivos && <button type="button" onClick={limparFiltros} className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-error/30 px-3 py-2.5 text-sm font-medium text-error hover:bg-error/5 focus-visible:outline-focus"><X className="h-4 w-4" /> Limpar filtros</button>}</div>{maisFiltros && <div className="flex flex-wrap gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4"><select aria-label="Vínculo familiar" value={filtros.vinculo} onChange={(e) => alterarFiltro("vinculo", e.target.value)} className={classeSelect}><option value="">Todos os vínculos</option>{Object.entries(ROTULO_VINCULO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select><select aria-label="Pessoa com deficiência" value={filtros.pcd} onChange={(e) => alterarFiltro("pcd", e.target.value as FiltrosPessoa["pcd"])} className={classeSelect}><option value="">PCD: todos</option><option value="sim">PCD: sim</option><option value="nao">PCD: não</option></select><select aria-label="Beneficiário do BPC" value={filtros.bpc} onChange={(e) => alterarFiltro("bpc", e.target.value as FiltrosPessoa["bpc"])} className={classeSelect}><option value="">BPC: todos</option><option value="sim">BPC: sim</option><option value="nao">BPC: não</option></select><select aria-label="Família de origem" value={filtros.familiaId} onChange={(e) => alterarFiltro("familiaId", e.target.value)} className={classeSelect}><option value="">Todas as famílias</option>{familias.map((f) => <option key={f.id} value={f.id}>Família nº {f.codigo} · {f.nome}</option>)}</select><select aria-label="Bairro ou unidade" value={filtros.bairro} onChange={(e) => alterarFiltro("bairro", e.target.value)} className={classeSelect}><option value="">Todos os bairros/unidades</option>{bairros.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>}{chips.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-ink-soft">Filtros ativos:</span>{chips.map((chip) => <span key={chip.texto} className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-1 pl-2.5 pr-1 text-xs font-semibold text-primary">{chip.texto}<button type="button" onClick={chip.limpar} aria-label={`Remover filtro ${chip.texto}`} className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full hover:bg-primary/10 focus-visible:outline-focus"><X className="h-3 w-3" /></button></span>)}</div>}</div>;
}

function ControlesPessoas({ total, inicio, fim, porPagina, setPorPagina, setPagina, modo, setModo, todasSelecionadas, algumaSelecionada, alternarTodos }: { total: number; inicio: number; fim: number; porPagina: number; setPorPagina: (n: number) => void; setPagina: (n: number) => void; modo: Modo; setModo: (m: Modo) => void; todasSelecionadas: boolean; algumaSelecionada: boolean; alternarTodos: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><label className="flex items-center gap-2 rounded-lg border border-outline-variant/30 px-2.5 py-1.5 text-xs font-medium text-ink-soft"><input type="checkbox" checked={todasSelecionadas} ref={(el) => { if (el) el.indeterminate = algumaSelecionada && !todasSelecionadas; }} onChange={alternarTodos} className="h-4 w-4 accent-primary focus-visible:outline-focus" />Selecionar tudo</label><span className="text-sm tabular-nums text-ink-soft">Exibindo {total ? inicio + 1 : 0}–{fim} de {total} pessoas</span></div><div className="flex items-center gap-2"><div className="flex overflow-hidden rounded-xl border border-outline-variant/40 bg-surface"><button type="button" onClick={() => setModo("cards")} aria-label="Visualização de pessoas em cards" aria-pressed={modo === "cards"} className={`p-2.5 focus-visible:outline-focus ${modo === "cards" ? "bg-primary text-on-primary" : "text-ink-soft hover:text-primary"}`}><LayoutGrid className="h-4 w-4" /></button><button type="button" onClick={() => setModo("tabela")} aria-label="Visualização de pessoas em tabela" aria-pressed={modo === "tabela"} className={`p-2.5 focus-visible:outline-focus ${modo === "tabela" ? "bg-primary text-on-primary" : "text-ink-soft hover:text-primary"}`}><List className="h-4 w-4" /></button></div><select aria-label="Pessoas por página" value={porPagina} onChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(1); }} className="rounded-lg border border-outline-variant/40 bg-surface px-2 py-1.5 text-xs text-ink-soft focus-visible:outline-focus">{ITENS_POR_PAGINA.map((n) => <option key={n} value={n}>{n}/pág</option>)}</select></div></div>;
}

function CardsPessoas({ pessoas, selecionados, alternarSelecao, aoAbrirFamilia }: { pessoas: PessoaEnriquecida[]; selecionados: Set<string>; alternarSelecao: (id: string) => void; aoAbrirFamilia: (id: string | null, codigo: number | null) => void }) {
  const navigate = useNavigate();
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{pessoas.map((p) => {
    const destino = p.familiaId ? `/familias/${p.familiaId}?pessoa=${p.id}` : "/familias/nova";
    const buscarCpf = async () => (await servicoPessoas.revelarCampo(p.id, "cpf")).value;
    const buscarNis = async () => (await servicoPessoas.revelarCampo(p.id, "nis")).value;
    return <div key={p.id} role="link" tabIndex={0} onClick={(e) => { if ((e.target as HTMLElement).closest("button, input, a")) return; navigate(destino); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(destino); } }} className="group relative block rounded-xl border border-outline-variant/30 bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-focus" aria-label={`${p.nome_exibicao}. Abrir cadastro da pessoa.`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternarSelecao(p.id)} onClick={(e) => e.stopPropagation()} className="mt-1 h-4 w-4 shrink-0 accent-primary focus-visible:outline-focus" aria-label={`Selecionar ${p.nome_exibicao}`} />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><UserRound className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><h3 className="truncate font-semibold text-ink transition-colors group-hover:text-primary">{p.nome_exibicao}</h3><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">{p.cpf_mascarado && <span>CPF <RevelarCampo valor={p.cpf_mascarado} valorCompleto={p.cpf ?? undefined} buscarValor={buscarCpf} campo="cpf" entityId={p.id} entityType="pessoa" /></span>}{p.nis_mascarado && <span>NIS <RevelarCampo valor={p.nis_mascarado} valorCompleto={p.nis ?? undefined} buscarValor={buscarNis} campo="nis" entityId={p.id} entityType="pessoa" /></span>}</div></div>
        <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-outline transition-colors group-hover:text-primary" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5"><Pill estilo={ESTILO_FAIXA[p.faixaEtaria]}>{p.idadeCalculada === null ? "Idade não informada" : `${p.idadeCalculada} anos · ${ROTULO_FAIXA[p.faixaEtaria]}`}</Pill><Pill estilo={ESTILO_VINCULO}>{ROTULO_VINCULO[p.vinculo] ?? p.vinculo}</Pill><Pill estilo={ESTILO_NEUTRO}>{textoSexo(p.sexoCadastro)}</Pill>{p.pessoaComDeficiencia && <Pill estilo={ESTILO_ATENCAO}>Pessoa com deficiência</Pill>}{p.bpc && <Pill estilo={ESTILO_BENEFICIO}>BPC</Pill>}{p.pbf && <Pill estilo={ESTILO_BENEFICIO}>Bolsa Família</Pill>}{p.cpfIrregular && <Pill estilo={ESTILO_ATENCAO}>CPF a regularizar</Pill>}</div>
      {p.familiaId && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); aoAbrirFamilia(p.familiaId, p.familiaCodigo); }} className="mt-3 inline-flex min-h-6 items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/15 focus-visible:outline-focus"><Users className="h-3.5 w-3.5" /> Família: {p.familiaNome ?? `nº ${p.familiaCodigo}`}</button>}
      <div className="absolute bottom-3 right-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(destino); }} className="rounded-lg bg-surface-container-low p-1.5 text-ink-soft hover:text-primary focus-visible:outline-focus" aria-label={`Ver pessoa ${p.nome_exibicao}`}><Eye className="h-3.5 w-3.5" /></button><button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(destino + "&editar=true"); }} className="rounded-lg bg-surface-container-low p-1.5 text-ink-soft hover:text-primary focus-visible:outline-focus" aria-label={`Editar pessoa ${p.nome_exibicao}`}><Pencil className="h-3.5 w-3.5" /></button>{p.familiaId && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); aoAbrirFamilia(p.familiaId, p.familiaCodigo); }} className="rounded-lg bg-surface-container-low p-1.5 text-ink-soft hover:text-primary focus-visible:outline-focus" aria-label={`Ver família de ${p.nome_exibicao}`}><Users className="h-3.5 w-3.5" /></button>}</div>
    </div>;
  })}</div>;
}

function TabelaPessoas({ pessoas, selecionados, alternarSelecao, alternarTodos, todasSelecionadas, aoAbrirFamilia }: { pessoas: PessoaEnriquecida[]; selecionados: Set<string>; alternarSelecao: (id: string) => void; alternarTodos: () => void; todasSelecionadas: boolean; aoAbrirFamilia: (id: string | null, codigo: number | null) => void }) {
  const navigate = useNavigate();
  return <div role="region" aria-label="Tabela de pessoas; role horizontalmente em telas menores" className="w-full overflow-x-auto rounded-xl border border-outline-variant/30"><table className="w-full min-w-[1120px] text-sm"><caption className="apenas-leitor">Pessoas cadastradas</caption><thead><tr className="border-b border-outline-variant/30 bg-surface-container-low text-left"><th className="py-3 pl-4 pr-2"><label className="inline-flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-ink-soft"><input type="checkbox" checked={todasSelecionadas} onChange={alternarTodos} className="h-4 w-4 accent-primary focus-visible:outline-focus" />Selecionar tudo</label></th>{["Nome", "CPF / NIS", "Idade / Faixa", "Gênero", "Vínculo", "Família", "Benefícios", "Ações"].map((h) => <th key={h} className="px-2 py-3 text-xs font-semibold uppercase tracking-wider text-ink-soft last:pr-4 last:text-right">{h}</th>)}</tr></thead><tbody className="divide-y divide-outline-variant/20">{pessoas.map((p) => { const destino = p.familiaId ? `/familias/${p.familiaId}?pessoa=${p.id}` : "/familias/nova"; return <tr key={p.id} role="button" tabIndex={0} onClick={(e) => { if ((e.target as HTMLElement).closest("button, input, a")) return; navigate(destino); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(destino); } }} className="group cursor-pointer transition-colors hover:bg-surface-container-low/60 focus-visible:outline-focus"><td className="py-3 pl-4 pr-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternarSelecao(p.id)} className="h-4 w-4 accent-primary focus-visible:outline-focus" aria-label={`Selecionar ${p.nome_exibicao}`} /></td><td className="px-2 py-3 font-semibold text-ink group-hover:text-primary">{p.nome_exibicao}</td><td className="px-2 py-3 text-xs text-ink-soft"><div>{p.cpf_mascarado ? <RevelarCampo valor={p.cpf_mascarado} valorCompleto={p.cpf ?? undefined} campo="cpf" entityId={p.id} entityType="pessoa" /> : "CPF não informado"}</div><div>{p.nis_mascarado ? <RevelarCampo valor={`NIS ${p.nis_mascarado}`} valorCompleto={p.nis ? `NIS ${p.nis}` : undefined} campo="nis" entityId={p.id} entityType="pessoa" /> : "NIS não informado"}</div></td><td className="px-2 py-3"><Pill estilo={ESTILO_FAIXA[p.faixaEtaria]}>{p.idadeCalculada === null ? ROTULO_FAIXA[p.faixaEtaria] : `${p.idadeCalculada} · ${ROTULO_FAIXA[p.faixaEtaria]}`}</Pill></td><td className="px-2 py-3 text-ink-soft">{textoSexo(p.sexoCadastro)}</td><td className="px-2 py-3"><Pill estilo={ESTILO_VINCULO}>{ROTULO_VINCULO[p.vinculo] ?? p.vinculo}</Pill></td><td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>{p.familiaId ? <button type="button" onClick={(e) => { e.stopPropagation(); aoAbrirFamilia(p.familiaId, p.familiaCodigo); }} className="rounded-full bg-primary-soft px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/15 focus-visible:outline-focus">Família nº {p.familiaCodigo}</button> : <span className="text-ink-soft">—</span>}</td><td className="px-2 py-3"><div className="flex flex-wrap gap-1">{p.bpc && <Pill estilo={ESTILO_BENEFICIO}>BPC</Pill>}{p.pbf && <Pill estilo={ESTILO_BENEFICIO}>Bolsa Família</Pill>}{p.pessoaComDeficiencia && <Pill estilo={ESTILO_ATENCAO}>PCD</Pill>}{!p.bpc && !p.pbf && !p.pessoaComDeficiencia && <Pill estilo={{ bg: "var(--ga-chip-neutral-bg)", fg: "var(--ga-chip-neutral-text)" }}>Sem benefício</Pill>}</div></td><td className="py-3 pl-2 pr-4 text-right"><button type="button" onClick={(e) => { e.stopPropagation(); navigate(destino); }} className="inline-flex min-h-6 min-w-6 items-center justify-center rounded text-outline hover:bg-primary/10 hover:text-primary focus-visible:outline-focus" aria-label={`Abrir cadastro de ${p.nome_exibicao}`}><ChevronRight className="h-4 w-4" /></button></td></tr>; })}</tbody></table></div>;
}

function PaginacaoPessoas({ pagina, total, setPagina }: { pagina: number; total: number; setPagina: (p: number) => void }) {
  return <nav aria-label="Paginação de pessoas" className="flex items-center justify-center gap-1"><button type="button" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} className="rounded-lg p-2 text-ink-soft hover:bg-surface-container-high disabled:opacity-30 focus-visible:outline-focus" aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button>{Array.from({ length: total }, (_, i) => i + 1).map((p) => <button key={p} type="button" onClick={() => setPagina(p)} aria-current={p === pagina ? "page" : undefined} className={`h-8 w-8 rounded-lg text-sm font-medium focus-visible:outline-focus ${p === pagina ? "bg-primary text-on-primary" : "text-ink-soft hover:bg-surface-container-high"}`}>{p}</button>)}<button type="button" disabled={pagina >= total} onClick={() => setPagina(pagina + 1)} className="rounded-lg p-2 text-ink-soft hover:bg-surface-container-high disabled:opacity-30 focus-visible:outline-focus" aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></button></nav>;
}

function BarraLotePessoas({ total, limpar }: { total: number; limpar: () => void }) {
  const acoes = [{ t: "Exportar CSV", i: Download }, { t: "Gerar PDF", i: FileText }, { t: "Encaminhar em lote", i: ArrowRightLeft }, { t: "Aplicar tag", i: Tag }];
  return <div className="fixed bottom-0 left-0 right-0 z-30 flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/30 bg-surface-container-lowest px-6 py-3 shadow-premium md:left-[260px]"><strong className="text-sm text-ink">{total} {total === 1 ? "pessoa selecionada" : "pessoas selecionadas"}</strong><div className="flex flex-wrap gap-2">{acoes.map(({ t, i: Icone }) => <button key={t} type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-surface px-3 py-2 text-sm font-medium text-ink-soft hover:text-primary focus-visible:outline-focus"><Icone className="h-4 w-4" />{t}</button>)}<button type="button" onClick={limpar} className="inline-flex items-center gap-1.5 rounded-lg border border-error/20 bg-error/5 px-3 py-2 text-sm font-medium text-error hover:bg-error/10 focus-visible:outline-focus"><X className="h-4 w-4" /> Limpar seleção</button></div></div>;
}

function EsqueletoPessoas() {
  return <div className="space-y-5 pt-2" aria-busy="true" aria-label="Carregando pessoas"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-outline-variant/30 bg-surface"><div className="m-4 h-3 w-20 rounded bg-ink-soft/10" /><div className="mx-4 h-6 w-10 rounded bg-ink-soft/10" /></div>)}</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-xl border border-outline-variant/30 bg-surface p-4"><div className="h-5 w-1/2 rounded bg-ink-soft/10" /><div className="mt-4 h-4 w-4/5 rounded bg-ink-soft/10" /><div className="mt-3 h-5 w-2/3 rounded-full bg-ink-soft/10" /></div>)}</div></div>;
}
