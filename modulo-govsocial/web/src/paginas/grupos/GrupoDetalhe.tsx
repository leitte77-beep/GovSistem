import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, MapPin, UsersRound, Clock } from "lucide-react";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoSemPermissao } from "@/ui/EstadoSemPermissao";
import { Skeleton } from "@/ui/Skeleton";
import { Chip } from "@/ui/Chip";
import { Botao } from "@/ui/Botao";
import { Permitido } from "@/nucleo/permissoes/Permitido";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import { useEncontros, useGrupo, useInscricoes } from "@/nucleo/api/hooks";
import { servicoPessoas } from "@/nucleo/api/pessoas";
import { formatarData } from "@/nucleo/datas";
import type { ErroApi } from "@/nucleo/http/problemDetails";
import type { EncontroOut, InscricaoOut } from "@/tipos/grupos";
import { GradeFrequencia } from "./GradeFrequencia";
import { rotuloDiaSemana, rotuloPeriodicidade, rotuloStatusInscricao } from "./rotulos";

/**
 * Detalhe do grupo/SCFV (§4.5). Reúne dados do grupo, participantes inscritos e
 * a lista de encontros. Ao "Fazer chamada" de um encontro, abre a
 * <GradeFrequencia> mobile-first (offline-first). Os nomes dos participantes são
 * resolvidos por GET /persons/{id} (a inscrição só traz o person_id — sigilo).
 */
export default function GrupoDetalhe() {
  const { grupoId } = useParams();
  const podeGerir = usePermissao("grupo.gerir");

  const grupoQ = useGrupo(grupoId);
  const inscricoesQ = useInscricoes(grupoId);
  const encontrosQ = useEncontros(grupoId);

  const [encontroChamada, setEncontroChamada] = useState<string | null>(null);

  const inscricoes = useMemo(() => inscricoesQ.data ?? [], [inscricoesQ.data]);

  // Resolve os nomes dos participantes (person_id → nome de exibição).
  const pessoasQ = useQueries({
    queries: inscricoes.map((i) => ({
      queryKey: ["pessoa", i.person_id],
      queryFn: () => servicoPessoas.obter(i.person_id),
      staleTime: 60_000,
    })),
  });

  const nomePorInscricao = useMemo(() => {
    const mapa = new Map<string, string>();
    inscricoes.forEach((i, idx) => {
      const nome = pessoasQ[idx]?.data?.nome_exibicao;
      mapa.set(i.id, nome ?? "Participante");
    });
    return mapa;
  }, [inscricoes, pessoasQ]);

  if (!podeGerir) return <EstadoSemPermissao />;

  if (grupoQ.isLoading) return <Skeleton variante="cartao" />;
  if (grupoQ.isError) {
    return (
      <EstadoErro
        problema={(grupoQ.error as ErroApi).problema}
        aoTentarNovamente={() => grupoQ.refetch()}
      />
    );
  }
  const grupo = grupoQ.data;
  if (!grupo) return null;

  const encontros = encontrosQ.data ?? [];

  return (
    <section aria-labelledby="titulo-grupo" className="space-y-5">
      <div>
        <Link
          to="/grupos"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline focus-visible:outline-focus"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" /> Voltar aos grupos
        </Link>
      </div>

      {/* Cabeçalho do grupo */}
      <header className="rounded-cartao border border-ink-soft/15 bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 id="titulo-grupo" className="text-xl">
            {grupo.nome}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {grupo.service_type_code && <Chip cor="primario">{grupo.service_type_code}</Chip>}
            {grupo.publico_alvo && <Chip cor="neutro">{grupo.publico_alvo}</Chip>}
          </div>
        </div>
        {grupo.descricao && <p className="mt-2 text-sm text-ink-soft">{grupo.descricao}</p>}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-soft">
          {(grupo.periodicidade || grupo.dia_semana) && (
            <div className="inline-flex items-center gap-1">
              <CalendarDays aria-hidden className="h-4 w-4" />
              <span>
                {rotuloPeriodicidade(grupo.periodicidade)}
                {grupo.dia_semana ? ` · ${rotuloDiaSemana(grupo.dia_semana)}` : ""}
              </span>
            </div>
          )}
          {(grupo.horario_inicio || grupo.horario_fim) && (
            <div className="inline-flex items-center gap-1">
              <Clock aria-hidden className="h-4 w-4" />
              <span>
                {grupo.horario_inicio ?? "—"}
                {grupo.horario_fim ? ` às ${grupo.horario_fim}` : ""}
              </span>
            </div>
          )}
          {grupo.local && (
            <div className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="h-4 w-4" />
              <span>{grupo.local}</span>
            </div>
          )}
          <div className="inline-flex items-center gap-1">
            <UsersRound aria-hidden className="h-4 w-4" />
            <span>
              {grupo.vagas_total !== null
                ? `${grupo.total_inscritos}/${grupo.vagas_total} vagas`
                : `${grupo.total_inscritos} inscritos`}
            </span>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Participantes */}
        <div>
          <h2 className="mb-2 text-base">Participantes</h2>
          {inscricoesQ.isLoading ? (
            <Skeleton variante="tabela" linhas={3} />
          ) : inscricoes.length === 0 ? (
            <p className="rounded-cartao border border-dashed border-ink-soft/25 p-4 text-sm text-ink-soft">
              Nenhum participante inscrito ainda.
            </p>
          ) : (
            <ul className="space-y-2">
              {inscricoes.map((i) => (
                <ItemInscricao
                  key={i.id}
                  inscricao={i}
                  nome={nomePorInscricao.get(i.id) ?? "Participante"}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Encontros e chamada */}
        <div>
          <h2 className="mb-2 text-base">Encontros</h2>
          {encontroChamada ? (
            <div className="rounded-cartao border border-ink-soft/15 bg-surface p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Chamada de frequência</h3>
                <Botao variante="texto" tamanho="sm" onClick={() => setEncontroChamada(null)}>
                  Fechar
                </Botao>
              </div>
              <GradeFrequencia
                acaoId={grupo.id}
                encontroId={encontroChamada}
                inscricoes={inscricoes}
                nomePorInscricao={nomePorInscricao}
                encontroAnteriorId={encontroAnterior(encontros, encontroChamada)}
                aoEncerrar={() => setEncontroChamada(null)}
              />
            </div>
          ) : encontrosQ.isLoading ? (
            <Skeleton variante="tabela" linhas={3} />
          ) : encontros.length === 0 ? (
            <p className="rounded-cartao border border-dashed border-ink-soft/25 p-4 text-sm text-ink-soft">
              Nenhum encontro registrado ainda.
            </p>
          ) : (
            <ul className="space-y-2">
              {encontros.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-ink-soft/15 bg-surface p-3"
                >
                  <div>
                    <p className="font-semibold text-ink">{formatarData(e.data_encontro)}</p>
                    {e.tema && <p className="text-sm text-ink-soft">{e.tema}</p>}
                    <p className="mt-1 text-xs text-ink-soft">
                      {e.total_presentes} presentes · {e.total_faltas} faltas
                    </p>
                  </div>
                  <Permitido capacidade="frequencia.registrar">
                    <Botao
                      variante="secundario"
                      tamanho="sm"
                      onClick={() => setEncontroChamada(e.id)}
                    >
                      Fazer chamada
                    </Botao>
                  </Permitido>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ItemInscricao({ inscricao, nome }: { inscricao: InscricaoOut; nome: string }) {
  const cor =
    inscricao.status === "ATIVA"
      ? "primario"
      : inscricao.status === "LISTA_ESPERA"
        ? "amber"
        : "neutro";
  return (
    <li className="flex items-center justify-between gap-2 rounded-input border border-ink-soft/15 bg-surface p-3">
      <span className="font-semibold text-ink">{nome}</span>
      <Chip cor={cor}>{rotuloStatusInscricao(inscricao.status)}</Chip>
    </li>
  );
}

/** Encontro imediatamente anterior (por data) ao encontro informado. */
function encontroAnterior(encontros: EncontroOut[], encontroId: string): string | null {
  const ordenados = [...encontros].sort((a, b) =>
    a.data_encontro < b.data_encontro ? -1 : 1,
  );
  const idx = ordenados.findIndex((e) => e.id === encontroId);
  if (idx <= 0) return null;
  return ordenados[idx - 1].id;
}
