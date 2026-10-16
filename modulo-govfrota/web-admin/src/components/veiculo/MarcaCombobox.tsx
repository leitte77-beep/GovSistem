"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

interface Props {
  value: string;
  onChange: (valor: string) => void;
  opcoes: readonly string[];
  placeholder?: string;
}

/** Campo de texto livre com sugestões filtradas (substitui o <datalist> nativo). */
export default function MarcaCombobox({ value, onChange, opcoes, placeholder }: Props) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const idLista = useId();

  const filtradas = useMemo(() => {
    const q = normalizar(value ?? "");
    if (!q) return [...opcoes];
    const comeca = opcoes.filter((o) => normalizar(o).startsWith(q));
    const contem = opcoes.filter((o) => !normalizar(o).startsWith(q) && normalizar(o).includes(q));
    return [...comeca, ...contem];
  }, [value, opcoes]);

  const exato = opcoes.some((o) => normalizar(o) === normalizar(value ?? ""));

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  useEffect(() => setAtivo(0), [value]);

  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-i="${ativo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  const escolher = (m: string) => {
    onChange(m);
    setAberto(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!aberto) return setAberto(true);
      setAtivo((i) => Math.min(i + 1, filtradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && aberto && filtradas[ativo]) {
      e.preventDefault();
      escolher(filtradas[ativo]);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setAberto(false);
    }
  };

  const destacar = (texto: string) => {
    const q = normalizar(value ?? "");
    const i = q ? normalizar(texto).indexOf(q) : -1;
    if (i < 0) return texto;
    return (
      <>
        {texto.slice(0, i)}
        <mark className="bg-transparent font-semibold text-primary-700">{texto.slice(i, i + q.length)}</mark>
        {texto.slice(i + q.length)}
      </>
    );
  };

  return (
    <div ref={raiz} className="relative">
      <input
        role="combobox"
        aria-expanded={aberto}
        aria-controls={idLista}
        aria-autocomplete="list"
        autoComplete="off"
        className="input pr-9"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Mostrar marcas"
        onClick={() => setAberto((a) => !a)}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-text-subtle"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <ul
          ref={lista}
          id={idLista}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-surface-border bg-surface-card py-1 shadow-lg"
        >
          {filtradas.map((m, i) => {
            const selecionada = normalizar(m) === normalizar(value ?? "");
            return (
              <li
                key={m}
                data-i={i}
                role="option"
                aria-selected={i === ativo}
                onMouseEnter={() => setAtivo(i)}
                onMouseDown={(e) => { e.preventDefault(); escolher(m); }}
                className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm ${
                  i === ativo ? "bg-primary-50" : ""
                }`}
              >
                <span>{destacar(m)}</span>
                {selecionada && <Check className="h-4 w-4 text-primary-700" />}
              </li>
            );
          })}
          {filtradas.length === 0 && (
            <li className="px-3 py-2 text-sm text-text-subtle">Nenhuma marca na lista.</li>
          )}
          {value?.trim() && !exato && (
            <li className="border-t border-surface-border px-3 py-2 text-xs text-text-subtle">
              Pode continuar digitando: “{value.trim()}” será salvo como marca.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
