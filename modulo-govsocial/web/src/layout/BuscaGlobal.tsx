import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, UserRound, Loader2, X } from "lucide-react";
import { useDebounce } from "@/nucleo/useDebounce";
import { useBuscaUnificada } from "@/nucleo/api/hooks";
import { DestaqueTermo } from "@/ui/DestaqueTermo";
import { textos } from "@/i18n/textos";
import type { UnifiedSearchItem } from "@/tipos/pessoas";

/**
 * <BuscaGlobal>: typeahead com debounce de 300ms, resultados agrupados
 * (Pessoas × Famílias), destaque do termo e navegação por teclado.
 * Enter na caixa (sem seleção) abre a página de resultados completa.
 * Nenhum dado pessoal vai para a URL: navegamos por UUID.
 */
export function BuscaGlobal({ inputRef }: { inputRef?: React.RefObject<HTMLInputElement> }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [termo, setTermo] = useState(() => searchParams.get("q") ?? "");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const debounced = useDebounce(termo, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useBuscaUnificada(debounced);
  const pessoas = useMemo(() => data ?? [], [data]);

  // Achata pessoas + famílias em uma lista de itens navegáveis por teclado.
  type Item =
    | { tipo: "pessoa"; pessoa: UnifiedSearchItem }
    | { tipo: "familia"; familyId: string; codigo: number; nome: string };

  const itens = useMemo<Item[]>(() => {
    const lista: Item[] = [];
    for (const p of pessoas) lista.push({ tipo: "pessoa", pessoa: p });
    const vistas = new Set<string>();
    for (const p of pessoas) {
      for (const f of p.familias ?? []) {
        if (vistas.has(f.family_id)) continue;
        vistas.add(f.family_id);
        lista.push({
          tipo: "familia",
          familyId: f.family_id,
          codigo: f.codigo,
          nome: p.nome_exibicao,
        });
      }
    }
    return lista;
  }, [pessoas]);

  useEffect(() => setAtivo(-1), [debounced]);

  // Fecha ao clicar fora.
  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicar);
    return () => document.removeEventListener("mousedown", aoClicar);
  }, []);

  function irParaResultados() {
    if (!termo.trim()) return;
    setAberto(false);
    navigate(`/familias?q=${encodeURIComponent(termo.trim())}`);
  }

  function limpar() {
    setTermo("");
    setAberto(false);
    navigate("/familias");
  }

  function selecionar(item: Item) {
    setAberto(false);
    setTermo("");
    if (item.tipo === "familia") {
      navigate(`/familias/${item.familyId}`);
    } else {
      const fam = item.pessoa.familias?.[0];
      if (fam) navigate(`/familias/${fam.family_id}`);
      else navigate(`/familias?q=${encodeURIComponent(item.pessoa.nome_exibicao)}`);
    }
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAberto(true);
      setAtivo((a) => Math.min(a + 1, itens.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (ativo >= 0 && itens[ativo]) selecionar(itens[ativo]);
      else irParaResultados();
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  const mostrarLista = aberto && debounced.trim().length >= 2;

  return (
    <div ref={containerRef} role="search" className="relative w-full">
      <label htmlFor="busca-global" className="apenas-leitor">
        {textos.busca.aria}
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-outline/50"
      />
      <input
        id="busca-global"
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={mostrarLista}
        aria-controls="busca-lista"
        aria-autocomplete="list"
        aria-activedescendant={ativo >= 0 ? `busca-item-${ativo}` : undefined}
        autoComplete="off"
        value={termo}
        placeholder={textos.busca.placeholder}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={aoTeclar}
        className="min-h-[44px] w-full bg-surface-container-low/50 border border-transparent focus:border-primary/20 focus:bg-white rounded-2xl py-3 pl-12 pr-20 text-ink placeholder:text-outline/40 transition-all font-body-md text-body-md outline-none"
      />
      {isFetching ? (
        <Loader2
          aria-hidden
          className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-soft"
        />
      ) : (
        <>
          {termo && (
            <button
              type="button"
              aria-label={textos.busca.limpar}
              onClick={limpar}
              className="absolute right-10 top-1/2 -translate-y-1/2 p-1 rounded-md text-outline/60 hover:text-ink hover:bg-surface-container-low transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-40 pointer-events-none">
            <span className="text-[10px] font-bold border border-outline/30 rounded px-1.5 py-0.5">{textos.busca.atalho}</span>
          </kbd>
        </>
      )}

      {mostrarLista && (
        <ul
          id="busca-lista"
          role="listbox"
          aria-label="Resultados da busca"
          className="absolute z-40 mt-1 max-h-80 w-full overflow-auto rounded-cartao border border-ink-soft/20 bg-surface py-1 text-ink shadow-um"
        >
          {itens.length === 0 && !isFetching && (
            <li className="px-3 py-3 text-sm text-ink-soft">
              Nenhum resultado para “{debounced}”.{" "}
              <button
                type="button"
                className="font-semibold text-primary hover:underline"
                onClick={irParaResultados}
              >
                Ver busca completa
              </button>
            </li>
          )}

          {pessoas.length > 0 && (
            <li
              className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft"
              aria-hidden
            >
              Pessoas
            </li>
          )}
          {itens.map((item, i) =>
            item.tipo === "pessoa" ? (
              <li
                key={`p-${item.pessoa.person_id}`}
                id={`busca-item-${i}`}
                role="option"
                aria-selected={ativo === i}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                  ativo === i ? "bg-primary-soft" : "hover:bg-primary-soft/50"
                }`}
                onMouseEnter={() => setAtivo(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selecionar(item);
                }}
              >
                <UserRound aria-hidden className="h-4 w-4 shrink-0 text-ink-soft" />
                <span className="flex-1">
                  <DestaqueTermo texto={item.pessoa.nome_exibicao} termo={debounced} />
                  {item.pessoa.cpf_mascarado && (
                    <span className="fonte-mono ml-2 text-xs text-ink-soft">
                      {item.pessoa.cpf_mascarado}
                    </span>
                  )}
                </span>
              </li>
            ) : (
              <li
                key={`f-${item.familyId}`}
                id={`busca-item-${i}`}
                role="option"
                aria-selected={ativo === i}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  ativo === i ? "bg-primary-soft" : "hover:bg-primary-soft/50"
                }`}
                onMouseEnter={() => setAtivo(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selecionar(item);
                }}
              >
                {i > 0 && itens[i - 1]?.tipo === "pessoa" && (
                  <span
                    className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft"
                    aria-hidden
                  >
                    Famílias
                  </span>
                )}
                Família nº {item.codigo} · {item.nome}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
