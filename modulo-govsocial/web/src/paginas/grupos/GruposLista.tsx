import { Link } from "react-router-dom";
import { UsersRound, CalendarDays, MapPin } from "lucide-react";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoSemPermissao } from "@/ui/EstadoSemPermissao";
import { Skeleton } from "@/ui/Skeleton";
import { Chip } from "@/ui/Chip";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import { useGrupos } from "@/nucleo/api/hooks";
import { formatarData } from "@/nucleo/datas";
import type { ErroApi } from "@/nucleo/http/problemDetails";
import type { AcaoColetivaOut } from "@/tipos/grupos";
import { rotuloPeriodicidade, rotuloStatusAcao } from "./rotulos";

/**
 * Lista de grupos/SCFV da unidade atual (§4.5 do planof). Filtra pela unidade
 * selecionada no cabeçalho (contexto global). Cada cartão leva ao detalhe, onde
 * fica a chamada de frequência mobile-first. Cinco estados de tela.
 */
export default function GruposLista() {
  const podeGerir = usePermissao("grupo.gerir");
  const { unidadeAtual } = useUnidadeAtual();
  const { data, isLoading, isError, error, refetch } = useGrupos(unidadeAtual?.id);

  if (!podeGerir) return <EstadoSemPermissao />;

  const grupos = data ?? [];

  return (
    <section aria-labelledby="titulo-grupos" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id="titulo-grupos" className="text-xl">
          Grupos &amp; SCFV
        </h1>
        {unidadeAtual && (
          <p className="text-sm text-ink-soft">
            Unidade: <span className="font-semibold text-ink">{unidadeAtual.nome}</span>
          </p>
        )}
      </div>

      {isLoading ? (
        <Skeleton variante="tabela" linhas={4} />
      ) : isError ? (
        <EstadoErro problema={(error as ErroApi).problema} aoTentarNovamente={() => refetch()} />
      ) : grupos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum grupo nesta unidade"
          descricao="Ainda não há grupos ou serviços de convivência cadastrados para a unidade selecionada."
          icone={<UsersRound className="h-8 w-8" />}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {grupos.map((g) => (
            <li key={g.id}>
              <CartaoGrupo grupo={g} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CartaoGrupo({ grupo }: { grupo: AcaoColetivaOut }) {
  const vagas =
    grupo.vagas_total !== null
      ? `${grupo.total_inscritos}/${grupo.vagas_total} vagas`
      : `${grupo.total_inscritos} inscritos`;

  return (
    <Link
      to={`/grupos/${grupo.id}`}
      className="block h-full rounded-cartao border border-ink-soft/15 bg-surface p-4 shadow-um hover:border-primary focus-visible:outline-focus"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">{grupo.nome}</h2>
        <Chip cor={grupo.status === "ATIVA" ? "primario" : "neutro"}>
          {rotuloStatusAcao(grupo.status)}
        </Chip>
      </div>
      {grupo.descricao && (
        <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{grupo.descricao}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        {grupo.service_type_code && (
          <div className="inline-flex items-center gap-1">
            <Chip cor="primario">{grupo.service_type_code}</Chip>
          </div>
        )}
        {grupo.periodicidade && (
          <div className="inline-flex items-center gap-1">
            <CalendarDays aria-hidden className="h-4 w-4" />
            <span>{rotuloPeriodicidade(grupo.periodicidade)}</span>
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
          <span>{vagas}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-soft">Início em {formatarData(grupo.data_inicio)}</p>
    </Link>
  );
}
