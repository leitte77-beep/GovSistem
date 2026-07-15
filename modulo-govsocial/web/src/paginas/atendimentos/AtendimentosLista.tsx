import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import {
  useFamilias,
  useProntuariosDaUnidade,
  useTiposServico,
} from "@/nucleo/api/hooks";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import { useDebounce } from "@/nucleo/useDebounce";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import { formatarData } from "@/nucleo/datas";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EstadoErro } from "@/ui/EstadoErro";
import { Skeleton } from "@/ui/Skeleton";
import { Chip } from "@/ui/Chip";
import type { ErroApi } from "@/nucleo/http/problemDetails";
import type { FamilyListItem } from "@/tipos/pessoas";
import type { CaseFileListItem } from "@/tipos/prontuario";
import { EncerrarAcompanhamentoModal } from "./EncerrarAcompanhamentoModal";

/**
 * Atendimentos (§4.3) — worklist dos prontuários (case files) em acompanhamento
 * na unidade selecionada. Cada linha leva à ficha da família, onde a evolução e
 * o registro de novos atendimentos acontecem (a evolução técnica NUNCA trafega
 * em listagem — §1.2). O nome do responsável vem de `GET /families` (sem PII no
 * payload do prontuário), casado por `family_id` no cliente.
 */
export default function AtendimentosLista() {
  const { unidadeAtual } = useUnidadeAtual();
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"ATIVO" | "TODOS">("ATIVO");
  const [encerrando, setEncerrando] = useState<CaseFileListItem | null>(null);
  const podeEncerrar = usePermissao("atendimento.registrar");
  const termo = useDebounce(busca, 200);

  const prontuarios = useProntuariosDaUnidade(unidadeAtual?.id);
  const familias = useFamilias();
  const tipos = useTiposServico();

  const mapaFamilias = useMemo(() => {
    const m = new Map<string, FamilyListItem>();
    for (const f of familias.data ?? []) m.set(f.id, f);
    return m;
  }, [familias.data]);

  const mapaServicos = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tipos.data ?? []) m.set(t.code, t.sigla ? `${t.nome} (${t.sigla})` : t.nome);
    return m;
  }, [tipos.data]);

  const linhas = useMemo(() => {
    const lista = prontuarios.data ?? [];
    const t = termo.trim().toLowerCase();
    return lista
      .filter((c) => (statusFiltro === "TODOS" ? true : c.status === "ATIVO"))
      .filter((c) => {
        if (!t) return true;
        const fam = mapaFamilias.get(c.family_id);
        const alvo = `${fam?.responsavel_nome ?? ""} ${fam?.codigo ?? ""} ${
          mapaServicos.get(c.service_type_code) ?? c.service_type_code
        }`.toLowerCase();
        return alvo.includes(t);
      })
      .sort((a, b) => (a.aberto_em < b.aberto_em ? 1 : -1));
  }, [prontuarios.data, termo, statusFiltro, mapaFamilias, mapaServicos]);

  const carregando = prontuarios.isLoading || familias.isLoading;

  return (
    <section aria-labelledby="titulo-atendimentos" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id="titulo-atendimentos" className="text-xl">
          Atendimentos
        </h1>
        <Link
          to="/familias"
          className="inline-flex items-center gap-1.5 rounded-input bg-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline-focus"
        >
          Buscar família para atender
        </Link>
      </div>

      {!unidadeAtual ? (
        <EstadoVazio
          titulo="Selecione uma unidade"
          descricao="Os prontuários em acompanhamento aparecem por unidade. Escolha uma unidade no seletor acima."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              aria-label="Filtrar prontuários por responsável, código ou serviço"
              placeholder="Filtrar por responsável, nº da família ou serviço…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="min-h-[44px] flex-1 rounded-input border border-ink-soft/30 bg-surface px-3 focus-visible:outline-focus"
            />
            <div className="inline-flex rounded-input border border-ink-soft/20 p-0.5" role="group" aria-label="Filtro de situação">
              {(["ATIVO", "TODOS"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={statusFiltro === s}
                  onClick={() => setStatusFiltro(s)}
                  className={
                    "min-h-[40px] rounded-[4px] px-3 text-sm focus-visible:outline-focus " +
                    (statusFiltro === s
                      ? "bg-primary text-white"
                      : "text-ink-soft hover:text-ink")
                  }
                >
                  {s === "ATIVO" ? "Em acompanhamento" : "Todos"}
                </button>
              ))}
            </div>
          </div>

          {carregando ? (
            <Skeleton variante="tabela" linhas={5} />
          ) : prontuarios.isError ? (
            <EstadoErro
              problema={(prontuarios.error as ErroApi).problema}
              aoTentarNovamente={() => void prontuarios.refetch()}
            />
          ) : linhas.length === 0 ? (
            <EstadoVazio
              icone={<ClipboardList className="h-8 w-8" />}
              titulo={
                (prontuarios.data ?? []).length === 0
                  ? "Nenhum prontuário nesta unidade ainda"
                  : "Nenhum prontuário corresponde ao filtro"
              }
              descricao="Abra a ficha de uma família para registrar o primeiro atendimento e iniciar o acompanhamento."
            />
          ) : (
            <ul className="space-y-2">
              {linhas.map((c) => {
                const fam = mapaFamilias.get(c.family_id);
                const servico = mapaServicos.get(c.service_type_code) ?? c.service_type_code;
                return (
                  <li key={c.id}>
                    <Link
                      to={`/familias/${c.family_id}`}
                      className="block rounded-cartao border border-ink-soft/15 bg-surface p-3 shadow-um hover:border-primary focus-visible:outline-focus"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-ink">
                          {fam?.responsavel_nome ?? "Responsável não vinculado"}
                          {fam?.codigo != null && (
                            <span className="ml-2 text-sm font-normal text-ink-soft">
                              Família nº {fam.codigo}
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          <Chip cor={c.status === "ATIVO" ? "primario" : "neutro"}>
                            {c.status === "ATIVO" ? "Em acompanhamento" : "Encerrado"}
                          </Chip>
                          {podeEncerrar && c.status === "ATIVO" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setEncerrando(c);
                              }}
                              title="Encerrar acompanhamento"
                              className="rounded-input border border-ink-soft/30 px-2.5 py-1 text-xs font-semibold text-ink-soft hover:border-danger hover:text-danger focus-visible:outline-focus"
                            >
                              Encerrar
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                        <span>{servico}</span>
                        {fam?.bairro && <span>· {fam.bairro}</span>}
                        <span>· aberto em {formatarData(c.aberto_em)}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {encerrando && (
        <EncerrarAcompanhamentoModal
          prontuario={encerrando}
          nomeServico={mapaServicos.get(encerrando.service_type_code) ?? encerrando.service_type_code}
          aoFechar={() => setEncerrando(null)}
        />
      )}
    </section>
  );
}
