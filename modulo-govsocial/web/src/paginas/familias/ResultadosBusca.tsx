import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { UserRound, Users } from "lucide-react";
import { useBuscaUnificada, useFamilias, usePessoas } from "@/nucleo/api/hooks";
import { Abas } from "@/ui/Abas";
import { DestaqueTermo } from "@/ui/DestaqueTermo";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EstadoErro } from "@/ui/EstadoErro";
import { Skeleton } from "@/ui/Skeleton";
import { Chip } from "@/ui/Chip";
import { BarraOffline } from "@/ui/BarraOffline";
import { SpeedDial } from "@/ui/SpeedDial";
import { RevelarCampo } from "@/ui/RevelarCampo";
import { usePermissoes } from "@/nucleo/permissoes/usePermissao";
import { useEstadoConexao } from "@/nucleo/offline/estadoConexao";
import { idade } from "@/nucleo/datas";
import { textos } from "@/i18n/textos";
import type { ErroApi } from "@/nucleo/http/problemDetails";
import type { UnifiedSearchItem, FamilyListItem } from "@/tipos/pessoas";

function formatarDataCadastro(dataStr: string): string {
  const d = new Date(dataStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ResultadosBusca() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const termo = params.get("q") ?? "";
  const { tem } = usePermissoes();
  const { online } = useEstadoConexao();
  const [abaCadastro, setAbaCadastro] = useState("familias");

  const { data, isLoading, isError, error, refetch } = useBuscaUnificada(termo);
  const pessoas = useMemo(() => data ?? [], [data]);

  const {
    data: dadosFamilias,
    isLoading: carregandoFamilias,
    isError: erroFamilias,
    error: erroFamilia,
    refetch: recarregarFamilias,
  } = useFamilias({});

  const familias = useMemo(() => {
    const mapa = new Map<string, { codigo: number; nome: string; territorio?: string | null }>();
    for (const p of pessoas) {
      for (const f of p.familias ?? []) {
        if (!mapa.has(f.family_id)) {
          mapa.set(f.family_id, {
            codigo: f.codigo,
            nome: p.nome_exibicao,
            territorio: f.territorio,
          });
        }
      }
    }
    return [...mapa.entries()];
  }, [pessoas]);

  function atualizarTermo(v: string) {
    if (v) setParams({ q: v });
    else setParams({});
  }

  const podeCadastrar = tem("familia.cadastrar");
  const podeAtendimento = tem("atendimento.registrar");
  const podeEncaminhar = tem("encaminhamento.criar");
  const podeConceder = tem("beneficio.conceder");

  if (!termo.trim()) {
    return (
      <div className="space-y-8 pb-28">
        <CabecalhoPagina
          titulo="Famílias cadastradas"
          subtitulo="Gerencie e visualize os dados das famílias assistidas"
          podeCadastrar={podeCadastrar}
        />

        <div className="relative w-full max-w-lg">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <span className="material-symbols-outlined text-outline/50 !text-[20px]">search</span>
          </div>
          <input
            type="search"
            aria-label="Buscar famílias, beneficiários ou NIS..."
            placeholder="Buscar famílias, beneficiários ou NIS..."
            className="block w-full pl-12 pr-4 py-3 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-sm placeholder-secondary/50 transition-all outline-none"
            onChange={(e) => atualizarTermo(e.target.value)}
          />
        </div>

        <Abas
          rotulo="Visões do cadastro"
          ativa={abaCadastro}
          aoMudar={setAbaCadastro}
          abas={[
            {
              id: "familias",
              rotulo: "Famílias",
              conteudo: (
                <ListagemFamilias
                  familias={dadosFamilias ?? []}
                  carregando={carregandoFamilias}
                  erro={erroFamilias ? (erroFamilia as ErroApi) : null}
                  aoRecarregar={() => recarregarFamilias()}
                />
              ),
            },
            {
              id: "pessoas",
              rotulo: "Pessoas",
              conteudo: <ListagemPessoas />,
            },
          ]}
        />

        {podeCadastrar && (
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
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby="titulo-resultados" className="space-y-4">
      <nav className="mb-2">
        <Link
          to="/familias"
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-primary transition-colors focus-visible:outline-focus"
        >
          <span className="material-symbols-outlined !text-[18px]">arrow_back</span>
          {textos.familias.voltarParaFamilias}
        </Link>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id="titulo-resultados" className="text-xl">
          {textos.busca.resultadosPara} "{termo}"
        </h1>
        {podeCadastrar && (
          <Link to="/familias/nova">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-95">
              <span className="material-symbols-outlined !text-[18px]">person_add</span>
              Nova Família
            </span>
          </Link>
        )}
      </div>

      {!online && <BarraOffline />}

      {isLoading ? (
        <Skeleton variante="tabela" linhas={5} />
      ) : isError ? (
        <EstadoErro problema={(error as ErroApi).problema} aoTentarNovamente={() => refetch()} />
      ) : pessoas.length === 0 ? (
        <EstadoVazio
          titulo={`Nenhum resultado para "${termo}"`}
          descricao="Confira a grafia ou cadastre uma nova família."
          acao={
            podeCadastrar
              ? { rotulo: "Cadastrar nova família", aoClicar: () => navigate("/familias/nova") }
              : undefined
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <GrupoPessoas pessoas={pessoas} termo={termo} />
          <GrupoFamilias familias={familias} termo={termo} />
        </div>
      )}
    </section>
  );
}

function CabecalhoPagina({
  titulo,
  subtitulo,
  podeCadastrar,
}: {
  titulo: string;
  subtitulo: string;
  podeCadastrar: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">{titulo}</h1>
        <p className="text-sm text-secondary mt-1">{subtitulo}</p>
      </div>
      {podeCadastrar && (
        <Link
          to="/familias/nova"
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-bold text-sm hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-95"
        >
          <span className="material-symbols-outlined !text-lg">person_add</span>
          <span>Nova Família</span>
        </Link>
      )}
    </div>
  );
}

function GrupoPessoas({ pessoas, termo }: { pessoas: UnifiedSearchItem[]; termo: string }) {
  return (
    <div>
      <h2 className="mb-2 flex items-center gap-2 text-base">
        <UserRound aria-hidden className="h-5 w-5 text-ink-soft" />
        Pessoas <span className="text-sm text-ink-soft">({pessoas.length})</span>
      </h2>
      <ul className="space-y-2">
        {pessoas.map((p) => {
          const fam = p.familias?.[0];
          const anos = idade(p.data_nascimento);
          const destino = fam ? `/familias/${fam.family_id}` : `/familias?q=${encodeURIComponent(p.nome_exibicao)}`;
          return (
            <li key={p.person_id}>
              <Link
                to={destino}
                className="block rounded-cartao border border-ink-soft/15 bg-surface p-3 shadow-um hover:border-primary focus-visible:outline-focus"
              >
                <span className="font-semibold text-ink">
                  <DestaqueTermo texto={p.nome_exibicao} termo={termo} />
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  {p.cpf_mascarado && (
                    <RevelarCampo
                      valor={p.cpf_mascarado}
                      valorCompleto={p.cpf ?? undefined}
                      campo="cpf"
                      entityId={p.person_id}
                      entityType="pessoa"
                    />
                  )}
                  {p.nis_mascarado && (
                    <RevelarCampo
                      valor={`NIS ${p.nis_mascarado}`}
                      valorCompleto={p.nis ? `NIS ${p.nis}` : undefined}
                      campo="nis"
                      entityId={p.person_id}
                      entityType="pessoa"
                    />
                  )}
                  {anos !== null && <span>{anos} anos</span>}
                  {p.familias.length > 0 && (
                    <Chip cor="neutro">
                      {p.familias.length === 1
                        ? "1 família"
                        : `${p.familias.length} famílias`}
                    </Chip>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GrupoFamilias({
  familias,
  termo,
}: {
  familias: [string, { codigo: number; nome: string; territorio?: string | null }][];
  termo: string;
}) {
  if (familias.length === 0) {
    return (
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-base">
          <Users aria-hidden className="h-5 w-5 text-ink-soft" />
          Famílias <span className="text-sm text-ink-soft">(0)</span>
        </h2>
        <p className="rounded-cartao border border-dashed border-ink-soft/25 p-4 text-sm text-ink-soft">
          {textos.familias.pessoaSemFamilia}
        </p>
      </div>
    );
  }
  return (
    <div>
      <h2 className="mb-2 flex items-center gap-2 text-base">
        <Users aria-hidden className="h-5 w-5 text-ink-soft" />
        Famílias <span className="text-sm text-ink-soft">({familias.length})</span>
      </h2>
      <ul className="space-y-2">
        {familias.map(([id, f]) => (
          <li key={id}>
            <Link
              to={`/familias/${id}`}
              className="block rounded-cartao border border-ink-soft/15 bg-surface p-3 shadow-um hover:border-primary focus-visible:outline-focus"
            >
              <span className="font-semibold text-ink">
                Família nº <DestaqueTermo texto={String(f.codigo)} termo={termo} />
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                <span>Responsável: {f.nome}</span>
                {f.territorio && <Chip cor="primario">{f.territorio}</Chip>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ROTULO_FAIXA: Record<string, string> = {
  EXTREMA_POBREZA: "Faixa: Extrema pobreza",
  POBREZA: "Faixa: Pobreza",
  BAIXA_RENDA: "Faixa: Baixa renda",
  ACIMA_MEIO_SM: "Faixa: Acima de ½ SM",
  NAO_INFORMADO: "Faixa: Não informado",
};

const COR_FAIXA: Record<string, string> = {
  EXTREMA_POBREZA: "bg-red-500/10 text-red-600",
  POBREZA: "bg-amber-50 text-amber-700 border border-amber-200",
  BAIXA_RENDA: "bg-orange-50 text-orange-700 border border-orange-200",
  ACIMA_MEIO_SM: "bg-green-50 text-green-700 border border-green-200",
  NAO_INFORMADO: "bg-surface-container-high text-outline",
};

function ListagemFamilias({
  familias,
  carregando,
  erro,
  aoRecarregar,
}: {
  familias: FamilyListItem[];
  carregando: boolean;
  erro: ErroApi | null;
  aoRecarregar: () => void;
}) {
  if (carregando) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-surface-container-low p-5 animate-pulse">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-surface-container-high shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="h-5 bg-surface-container-high rounded w-1/3" />
                <div className="h-4 bg-surface-container-high rounded w-2/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (erro) {
    return <EstadoErro problema={erro.problema} aoTentarNovamente={aoRecarregar} />;
  }

  if (familias.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container-low/30 p-12 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mx-auto mb-5 border border-primary/5">
          <span className="material-symbols-outlined text-primary !text-[40px] opacity-30">
            family_restroom
          </span>
        </div>
        <p className="font-label-md text-ink mb-1">{textos.familias.nenhumaCadastrada}</p>
        <p className="text-sm text-outline max-w-sm mx-auto">
          {textos.familias.nenhumaCadastradaDica}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {familias.map((f) => (
        <Link
          key={f.id}
          to={`/familias/${f.id}`}
          className="block bg-white rounded-xl border border-surface-container-low p-5 shadow-sm hover:shadow-md hover:border-primary/20 transition-all group"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined !text-[24px]">family_restroom</span>
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-base font-bold text-ink group-hover:text-primary transition-colors truncate">
                  {f.responsavel_nome ?? textos.familias.semResponsavel}
                </h3>
                <div className="flex items-center gap-2">
                  {f.beneficiaria_pbf && (
                    <span
                      className="inline-flex px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded uppercase tracking-wider"
                      title={textos.familias.programaPBF}
                      aria-label={textos.familias.programaPBF}
                    >
                      PBF
                    </span>
                  )}
                  {f.faixa_renda && (
                    <span
                      title={ROTULO_FAIXA[f.faixa_renda] ?? f.faixa_renda}
                      className={[
                        "inline-flex px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider",
                        COR_FAIXA[f.faixa_renda] ?? "bg-surface-container-high text-outline",
                      ].join(" ")}
                    >
                      {ROTULO_FAIXA[f.faixa_renda] ?? f.faixa_renda}
                    </span>
                  )}
                  <span className="text-[11px] font-bold text-outline/60 tabular-nums">
                    {textos.familias.nFamilia.replace("{codigo}", String(f.codigo))}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-5 text-sm text-secondary flex-wrap">
                {f.territorio && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[16px] opacity-60">location_on</span>
                    <span>{textos.familias.unidadeTerritorio.replace("{territorio}", f.territorio)}</span>
                  </span>
                )}
                {f.nis_responsavel_mascarado && (
                  <span className="inline-flex items-center gap-1.5 fonte-mono text-xs tabular-nums">
                    <span className="material-symbols-outlined !text-[16px] opacity-60">fingerprint</span>
                    <span>NIS {f.nis_responsavel_mascarado}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-[16px] opacity-60">calendar_today</span>
                  <span>Cad. {formatarDataCadastro(f.created_at)}</span>
                </span>
              </div>
            </div>

            <div className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-container-high text-outline transition-colors shrink-0">
              <span className="material-symbols-outlined !text-[20px] group-hover:text-primary transition-colors">
                chevron_right
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ListagemPessoas() {
  const { data, isLoading, isError, error, refetch } = usePessoas();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-surface-container-low p-5 animate-pulse">
            <div className="h-5 bg-surface-container-high rounded w-1/3" />
            <div className="h-4 bg-surface-container-high rounded w-2/3 mt-2" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return <EstadoErro problema={(error as ErroApi).problema} aoTentarNovamente={() => refetch()} />;
  }

  const pessoas = data ?? [];

  if (pessoas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container-low/30 p-12 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mx-auto mb-5 border border-primary/5">
          <span className="material-symbols-outlined text-primary !text-[40px] opacity-30">person</span>
        </div>
        <p className="font-label-md text-ink mb-1">{textos.familias.nenhumaPessoa}</p>
        <p className="text-sm text-outline max-w-sm mx-auto">
          {textos.familias.cadastrePessoas}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pessoas.map((p) => {
        const temFamilia = p.family_id && p.familia_codigo;
        const destino = temFamilia
          ? `/familias/${p.family_id}`
          : `/familias?q=${encodeURIComponent(p.nome_exibicao)}`;
        return (
          <Link
            key={p.id}
            to={destino}
            className="block bg-white rounded-xl border border-surface-container-low p-5 shadow-sm hover:shadow-md hover:border-primary/20 transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined !text-[24px]">person</span>
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <h3 className="text-base font-bold text-ink group-hover:text-primary transition-colors">
                  {p.nome_exibicao}
                </h3>
                <div className="flex items-center gap-4 text-sm text-secondary flex-wrap">
                  {p.cpf_mascarado && (
                    <RevelarCampo
                      valor={p.cpf_mascarado}
                      valorCompleto={p.cpf ?? undefined}
                      campo="cpf"
                      entityId={p.id}
                      entityType="pessoa"
                    />
                  )}
                  {p.nis_mascarado && (
                    <RevelarCampo
                      valor={`NIS ${p.nis_mascarado}`}
                      valorCompleto={p.nis ? `NIS ${p.nis}` : undefined}
                      campo="nis"
                      entityId={p.id}
                      entityType="pessoa"
                    />
                  )}
                  {p.data_nascimento && (
                    <span className="text-xs">
                      {new Date(p.data_nascimento).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                  {p.is_falecido && (
                    <span className="text-[10px] text-error font-bold">Falecido(a)</span>
                  )}
                </div>
                {temFamilia && (
                  <div className="flex items-center gap-2 text-xs text-ink-soft mt-1">
                    <span>
                      {textos.familias.nFamilia.replace("{codigo}", String(p.familia_codigo))}
                      {p.familia_nome ? ` · ${p.familia_nome}` : ""}
                    </span>
                    {p.is_responsavel && (
                      <Chip cor="primario">{textos.familias.responsavel}</Chip>
                    )}
                  </div>
                )}
              </div>
              <div className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-container-high text-outline transition-colors shrink-0">
                <span className="material-symbols-outlined !text-[20px] group-hover:text-primary transition-colors">
                  chevron_right
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
