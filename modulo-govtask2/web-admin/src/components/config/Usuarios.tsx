"use client";

/**
 * Pessoas do GovTask: o que cada uma é no módulo, onde trabalha e se ainda
 * tem acesso.
 *
 * O perfil decide a tela de entrada (Prefeito → Meu governo, Assessor →
 * Central de despacho, Departamento → Minha fila). Definido aqui, ele vence
 * o papel da plataforma e não é desfeito no próximo login.
 */

import clsx from "clsx";
import {
  AlertTriangle,
  Building2,
  CheckSquare,
  Eye,
  Info,
  Landmark,
  Search,
  Send,
  UserCheck,
  UserX,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";

import { api, type PerfilGovtask, type UsuarioAdmin } from "@/lib/api";
import { relativo } from "@/lib/formato";
import { iniciais, useSessao } from "@/lib/sessao";
import { useSetores } from "@/lib/setores";

export const PERFIS: {
  chave: PerfilGovtask;
  rotulo: string;
  descricao: string;
  icone: LucideIcon;
  cor: string;
}[] = [
  { chave: "PREFEITO", rotulo: "Prefeito", descricao: "Acompanha tudo: onde está, há quanto tempo e por quê. Abre pedidos.", icone: Landmark, cor: "bg-brass-50 text-brass-700" },
  { chave: "ASSESSOR", rotulo: "Assessor", descricao: "Conduz o fluxo: encaminha aos setores, recebe de volta, conclui.", icone: Send, cor: "bg-brand-50 text-brand-700" },
  { chave: "DEPARTAMENTO", rotulo: "Departamento", descricao: "Recebe tarefas do seu setor, executa, anexa e devolve.", icone: Building2, cor: "bg-estado-info/10 text-estado-info" },
  { chave: "CONSULTA", rotulo: "Consulta", descricao: "Só visualiza. Não abre, não encaminha, não executa.", icone: Eye, cor: "bg-ink/[.06] text-ink-muted" },
];
const PERFIL = Object.fromEntries(PERFIS.map((p) => [p.chave, p])) as Record<PerfilGovtask, (typeof PERFIS)[number]>;

export function Usuarios() {
  const { eu } = useSessao();
  const { setores, nomes } = useSetores();
  const [lista, setLista] = useState<UsuarioAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState<PerfilGovtask | "">("");
  const [filtroSetor, setFiltroSetor] = useState("");
  const [inativos, setInativos] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLista(await api.usuarios(undefined, true));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const ativos = lista.filter((u) => u.ativo);
  const semSetor = ativos.filter((u) => u.perfil === "DEPARTAMENTO" && !u.setor);
  const visiveis = lista.filter(
    (u) =>
      (inativos ? !u.ativo : u.ativo) &&
      (!filtroPerfil || u.perfil === filtroPerfil) &&
      (!filtroSetor || (filtroSetor === "_SEM" ? !u.setor : u.setor === filtroSetor)) &&
      (!busca || `${u.name} ${u.email}`.toLowerCase().includes(busca.toLowerCase()))
  );
  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of ativos) c[u.perfil] = (c[u.perfil] ?? 0) + 1;
    return c;
  }, [ativos]);

  async function salvar(u: UsuarioAdmin, dados: Parameters<typeof api.editarUsuario>[1], ok: string) {
    try {
      const atualizado = await api.editarUsuario(u.id, dados);
      setLista((l) => l.map((x) => (x.id === u.id ? atualizado : x)));
      toast.success(ok);
      return atualizado;
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function lote(dados: { perfil?: PerfilGovtask | null; setor?: string | null }) {
    try {
      const r = await api.editarEmLote([...selecionados], dados);
      toast.success(`${r.atualizados} pessoa(s) atualizada(s).`);
      setSelecionados(new Set());
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      {/* Resumo por perfil: também são filtros */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PERFIS.map((p) => {
          const ativo = filtroPerfil === p.chave;
          return (
            <button
              key={p.chave}
              onClick={() => setFiltroPerfil(ativo ? "" : p.chave)}
              className={clsx("cartao flex items-center gap-3 p-3 text-left transition", ativo ? "border-brand shadow-brilho" : "hover:border-line-strong")}
            >
              <span className={clsx("grid h-9 w-9 place-items-center rounded-lg", p.cor)}>
                <p.icone size={17} />
              </span>
              <span>
                <span className="block font-display text-xl leading-none text-ink">{contagem[p.chave] ?? 0}</span>
                <span className="text-xs text-ink-muted">{p.rotulo}</span>
              </span>
            </button>
          );
        })}
      </div>

      {semSetor.length > 0 && (
        <button
          onClick={() => {
            setFiltroPerfil("DEPARTAMENTO");
            setFiltroSetor("_SEM");
            setInativos(false);
          }}
          className="flex w-full items-center gap-3 rounded-card border border-brass/30 bg-brass-50 px-4 py-3 text-left text-sm text-brass-700"
        >
          <AlertTriangle size={17} className="shrink-0" />
          <span>
            <strong className="font-semibold">{semSetor.length} pessoa(s) de departamento sem setor</strong> — não recebem nenhuma tarefa até serem lotadas. Clique para ver.
          </span>
        </button>
      )}

      <p className="flex items-start gap-2 rounded-btn bg-canvas px-3 py-2 text-xs text-ink-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        A pessoa aparece aqui depois do primeiro acesso ao GovTask pela plataforma. Quem ainda não entrou precisa acessar uma vez.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input className="campo h-9 pl-9" placeholder="Buscar por nome ou e-mail…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="campo h-9 w-auto" value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)} aria-label="Setor">
          <option value="">Todos os setores</option>
          <option value="_SEM">Sem setor</option>
          {setores.map((s) => (
            <option key={s.codigo} value={s.codigo}>
              {s.nome}
            </option>
          ))}
        </select>
        <div className="flex rounded-btn border border-line p-0.5 text-xs">
          <button onClick={() => setInativos(false)} className={clsx("rounded-[7px] px-3 py-1.5", !inativos ? "bg-brand-50 font-medium text-brand" : "text-ink-muted")}>
            Ativos {ativos.length}
          </button>
          <button onClick={() => setInativos(true)} className={clsx("rounded-[7px] px-3 py-1.5", inativos ? "bg-brand-50 font-medium text-brand" : "text-ink-muted")}>
            Desativados {lista.length - ativos.length}
          </button>
        </div>
      </div>

      {selecionados.size > 0 && (
        <div className="sticky top-20 z-20 flex flex-wrap items-center gap-2 rounded-card border border-brand/30 bg-brand-50 px-4 py-2.5 shadow-pop animate-fade-subir">
          <CheckSquare size={16} className="text-brand" />
          <span className="text-sm font-medium text-brand-700">{selecionados.size} selecionada(s)</span>
          <select className="campo h-8 w-auto text-xs" value="" onChange={(e) => e.target.value && lote({ perfil: e.target.value as PerfilGovtask })}>
            <option value="">Definir perfil…</option>
            {PERFIS.map((p) => (
              <option key={p.chave} value={p.chave}>
                {p.rotulo}
              </option>
            ))}
          </select>
          <select
            className="campo h-8 w-auto text-xs"
            value=""
            onChange={(e) => e.target.value && lote({ setor: e.target.value === "_NENHUM" ? null : e.target.value })}
          >
            <option value="">Lotar em…</option>
            {setores.map((s) => (
              <option key={s.codigo} value={s.codigo}>
                {s.nome}
              </option>
            ))}
            <option value="_NENHUM">Remover do setor</option>
          </select>
          <button onClick={() => setSelecionados(new Set())} className="ml-auto text-xs text-ink-muted hover:text-ink">
            Limpar seleção
          </button>
        </div>
      )}

      <div className="cartao overflow-hidden">
        {carregando ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="esqueleto h-14" />
            ))}
          </div>
        ) : visiveis.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-muted">Ninguém com esses filtros.</p>
        ) : (
          <ul className="divide-y divide-line">
            {visiveis.map((u) => {
              const p = PERFIL[u.perfil];
              const marcado = selecionados.has(u.id);
              return (
                <li key={u.id} className={clsx("flex flex-wrap items-center gap-3 px-4 py-3", marcado && "bg-brand-50/50", !u.ativo && "opacity-70")}>
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() =>
                      setSelecionados((s) => {
                        const n = new Set(s);
                        if (n.has(u.id)) n.delete(u.id);
                        else n.add(u.id);
                        return n;
                      })
                    }
                    className="h-4 w-4 rounded border-line text-brand"
                    aria-label={`Selecionar ${u.name}`}
                    disabled={!u.ativo}
                  />
                  <span className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-semibold", p.cor)}>{iniciais(u.name)}</span>
                  <button onClick={() => setEditando(u)} className="min-w-0 flex-1 text-left">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span className="font-medium text-ink hover:text-brand">{u.name}</span>
                      {u.id === eu?.id && <span className="text-[11px] text-ink-faint">(você)</span>}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">{u.email}</span>
                  </button>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={clsx("etiqueta", p.cor)}>
                      <p.icone size={12} /> {p.rotulo}
                      {!u.perfil_definido && <span className="opacity-60">· plataforma</span>}
                    </span>
                    {u.perfil === "DEPARTAMENTO" &&
                      (u.setor ? (
                        <span className="etiqueta bg-ink/[.05] text-ink-soft">{nomes[u.setor] ?? u.setor}</span>
                      ) : (
                        <span className="etiqueta bg-brass-50 text-brass-700">
                          <AlertTriangle size={11} /> sem setor
                        </span>
                      ))}
                  </div>
                  <div className="hidden w-32 text-right text-xs text-ink-muted md:block">
                    <span className="block">{u.tarefas_abertas ? `${u.tarefas_abertas} tarefa(s) aberta(s)` : "Sem tarefas"}</span>
                    <span className="block text-ink-faint">{u.ultimo_acesso ? `acesso há ${relativo(u.ultimo_acesso)}` : "nunca acessou"}</span>
                  </div>
                  <button className="botao-secundario px-3 py-1.5 text-xs" onClick={() => setEditando(u)}>
                    Editar
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editando && (
        <PainelPessoa
          u={editando}
          souEu={editando.id === eu?.id}
          aoFechar={() => setEditando(null)}
          aoSalvar={async (dados, ok) => {
            const r = await salvar(editando, dados, ok);
            if (r) setEditando(r);
          }}
        />
      )}
    </div>
  );
}

function PainelPessoa({
  u,
  souEu,
  aoFechar,
  aoSalvar,
}: {
  u: UsuarioAdmin;
  souEu: boolean;
  aoFechar: () => void;
  aoSalvar: (dados: Parameters<typeof api.editarUsuario>[1], ok: string) => Promise<void>;
}) {
  const { setores } = useSetores();
  const [ocupado, setOcupado] = useState(false);

  async function acao(dados: Parameters<typeof api.editarUsuario>[1], ok: string) {
    setOcupado(true);
    await aoSalvar(dados, ok);
    setOcupado(false);
  }

  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [aoFechar]);

  // Portal: a animação da página prenderia o `fixed` na coluna de conteúdo.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button className="absolute inset-0 bg-brand-900/50 backdrop-blur-sm" onClick={aoFechar} aria-label="Fechar" />
      <aside className="relative flex h-full w-full max-w-md animate-fade-subir flex-col bg-paper shadow-pop" role="dialog" aria-label={u.name}>
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className={clsx("grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-semibold", PERFIL[u.perfil].cor)}>{iniciais(u.name)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg text-ink">{u.name}</h2>
            <p className="truncate text-xs text-ink-muted">{u.email}</p>
            <p className="mt-1 text-xs text-ink-faint">
              {u.ultimo_acesso ? `Último acesso há ${relativo(u.ultimo_acesso)}` : "Nunca acessou"} · {u.tarefas_abertas} tarefa(s) aberta(s)
            </p>
          </div>
          <button onClick={aoFechar} className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-canvas" aria-label="Fechar">
            <X size={17} />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section>
            <p className="rotulo">O que esta pessoa é no GovTask</p>
            <div className="space-y-2">
              {PERFIS.map((p) => {
                const ativo = u.perfil === p.chave;
                return (
                  <button
                    key={p.chave}
                    disabled={ocupado || !u.ativo}
                    onClick={() => !ativo && acao({ perfil: p.chave }, `${u.name.split(" ")[0]} agora é ${p.rotulo}.`)}
                    className={clsx(
                      "flex w-full items-start gap-3 rounded-btn border px-3 py-2.5 text-left transition",
                      ativo ? "border-brand bg-brand-50 shadow-brilho" : "border-line hover:border-line-strong"
                    )}
                  >
                    <span className={clsx("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", p.cor)}>
                      <p.icone size={16} />
                    </span>
                    <span>
                      <span className={clsx("block text-sm font-medium", ativo ? "text-brand" : "text-ink")}>{p.rotulo}</span>
                      <span className="block text-xs text-ink-muted">{p.descricao}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              {u.perfil_definido ? (
                <>
                  Definido aqui.{" "}
                  <button className="text-brand hover:underline" onClick={() => acao({ perfil: null }, "Voltou a seguir a plataforma.")}>
                    Voltar a seguir a plataforma
                  </button>
                </>
              ) : (
                `Vindo dos papéis da plataforma (${u.papeis.map((p) => p.toLowerCase()).join(", ") || "nenhum"}).`
              )}
            </p>
          </section>

          {(u.perfil === "DEPARTAMENTO" || u.setor) && (
            <section>
              <label className="rotulo" htmlFor="setor-pessoa">Setor em que trabalha</label>
              <select
                id="setor-pessoa"
                className="campo"
                value={u.setor ?? ""}
                disabled={ocupado || !u.ativo}
                onChange={(e) => acao({ setor: e.target.value || null }, "Setor atualizado.")}
              >
                <option value="">Sem setor</option>
                {setores.map((s) => (
                  <option key={s.codigo} value={s.codigo}>
                    {s.nome}
                  </option>
                ))}
              </select>
              {u.perfil === "DEPARTAMENTO" && !u.setor && (
                <p className="mt-1.5 text-xs text-brass-700">Sem setor, esta pessoa não recebe tarefas.</p>
              )}
            </section>
          )}

          <section className="rounded-btn border border-line p-3.5">
            <p className="text-sm font-medium text-ink">{u.ativo ? "Acesso ativo" : "Acesso desativado"}</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {u.ativo
                ? "Ao desativar, a pessoa não entra mais no GovTask e as tarefas dela voltam para a fila do setor. O histórico mantém o nome."
                : "Reativar devolve o acesso com o mesmo perfil e setor."}
            </p>
            {u.ativo ? (
              <button
                className="botao-perigo mt-3"
                disabled={ocupado || souEu}
                title={souEu ? "Você não pode desativar o próprio acesso." : undefined}
                onClick={() => {
                  const aviso = u.tarefas_abertas ? ` As ${u.tarefas_abertas} tarefa(s) dela voltam para a fila do setor.` : "";
                  if (window.confirm(`Desativar o acesso de ${u.name}?${aviso}`)) acao({ ativo: false }, "Acesso desativado.");
                }}
              >
                <UserX size={15} /> Desativar acesso
              </button>
            ) : (
              <button className="botao-primario mt-3" disabled={ocupado} onClick={() => acao({ ativo: true }, "Acesso reativado.")}>
                <UserCheck size={15} /> Reativar acesso
              </button>
            )}
          </section>
        </div>
      </aside>
    </div>,
    document.body
  );
}
