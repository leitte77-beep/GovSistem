"use client";

/**
 * Setores da prefeitura. Cada setor mostra quantas pessoas estão lotadas e
 * quantos pedidos tem agora, e define o prazo sugerido ao encaminhar e quem
 * responde por ele (avisado quando chega tarefa sem dono).
 */

import clsx from "clsx";
import { Building2, Check, ClipboardList, Pencil, Plus, Timer, Trash2, UserRound, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { api, type Setor, type UsuarioAdmin } from "@/lib/api";
import { useSetores } from "@/lib/setores";

export function Setores() {
  const [setores, setSetores] = useState<Setor[]>([]);
  const [pessoas, setPessoas] = useState<UsuarioAdmin[]>([]);
  const [novo, setNovo] = useState("");
  const [criando, setCriando] = useState(false);
  const { recarregar } = useSetores();

  async function carregar() {
    setSetores(await api.setores(true));
  }

  useEffect(() => {
    carregar().catch((e) => toast.error(e.message));
    api.usuarios().then(setPessoas).catch(() => setPessoas([]));
  }, []);

  async function atualizar(setor: Setor, dados: Parameters<typeof api.editarSetor>[1], ok: string) {
    try {
      await api.editarSetor(setor.id, dados);
      await carregar();
      await recarregar();
      toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!novo.trim()) return;
    setCriando(true);
    try {
      await api.criarSetor(novo.trim());
      setNovo("");
      await carregar();
      await recarregar();
      toast.success("Setor criado.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCriando(false);
    }
  }

  const ativos = setores.filter((s) => s.ativo);
  const inativos = setores.filter((s) => !s.ativo);

  return (
    <div className="space-y-4">
      <form onSubmit={criar} className="cartao flex flex-wrap items-center gap-2 p-3">
        <Building2 size={17} className="ml-1 text-ink-faint" />
        <input
          className="campo h-9 min-w-[12rem] flex-1"
          placeholder="Nome do novo setor (ex.: Secretaria de Obras)"
          value={novo}
          maxLength={120}
          onChange={(e) => setNovo(e.target.value)}
        />
        <button className="botao-primario h-9" disabled={criando || !novo.trim()}>
          <Plus size={15} /> Criar setor
        </button>
      </form>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ativos.map((s) => (
          <CartaoSetor key={s.id} setor={s} pessoas={pessoas} atualizar={atualizar} aoRemover={carregar} />
        ))}
      </div>

      {inativos.length > 0 && (
        <div>
          <p className="sobretitulo mb-2">Desativados</p>
          <ul className="cartao divide-y divide-line">
            {inativos.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="text-ink-muted">{s.nome}</span>
                <button className="botao-secundario px-3 py-1 text-xs" onClick={() => atualizar(s, { ativo: true }, "Setor reativado.")}>
                  Reativar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CartaoSetor({
  setor,
  pessoas,
  atualizar,
  aoRemover,
}: {
  setor: Setor;
  pessoas: UsuarioAdmin[];
  atualizar: (s: Setor, d: Parameters<typeof api.editarSetor>[1], ok: string) => Promise<void>;
  aoRemover: () => Promise<void>;
}) {
  const { recarregar } = useSetores();
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(setor.nome);
  const [prazo, setPrazo] = useState(setor.prazo_dias ? String(setor.prazo_dias) : "");
  const doSetor = pessoas.filter((p) => p.setor === setor.codigo);
  const candidatos = doSetor.length ? doSetor : pessoas;

  return (
    <div className="cartao flex flex-col p-4">
      <div className="flex items-start gap-2">
        {renomeando ? (
          <form
            className="flex flex-1 gap-1"
            onSubmit={async (e) => {
              e.preventDefault();
              await atualizar(setor, { nome }, "Nome atualizado.");
              setRenomeando(false);
            }}
          >
            <input className="campo h-8 flex-1" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus maxLength={120} />
            <button className="grid h-8 w-8 place-items-center rounded-btn bg-brand text-white" aria-label="Salvar nome">
              <Check size={15} />
            </button>
            <button type="button" onClick={() => setRenomeando(false)} className="grid h-8 w-8 place-items-center rounded-btn text-ink-muted" aria-label="Cancelar">
              <X size={15} />
            </button>
          </form>
        ) : (
          <>
            <h3 className="flex-1 font-display text-[17px] text-ink">{setor.nome}</h3>
            {!setor.sistema && (
              <button onClick={() => setRenomeando(true)} className="rounded p-1 text-ink-faint hover:text-brand" aria-label="Renomear">
                <Pencil size={14} />
              </button>
            )}
          </>
        )}
      </div>
      <p className="font-mono text-[11px] text-ink-faint">{setor.codigo}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-btn bg-canvas px-3 py-2">
          <p className="flex items-center gap-1 text-[11px] text-ink-muted">
            <Users size={11} /> Pessoas
          </p>
          <p className={clsx("font-display text-xl", setor.pessoas === 0 && !setor.sistema ? "text-brass-700" : "text-ink")}>{setor.pessoas}</p>
        </div>
        <div className="rounded-btn bg-canvas px-3 py-2">
          <p className="flex items-center gap-1 text-[11px] text-ink-muted">
            <ClipboardList size={11} /> Pedidos agora
          </p>
          <p className="font-display text-xl text-ink">{setor.abertos}</p>
        </div>
      </div>
      {setor.pessoas === 0 && !setor.sistema && (
        <p className="mt-2 text-xs text-brass-700">Ninguém lotado: tarefas encaminhadas para cá ficam sem quem assuma.</p>
      )}

      {!setor.sistema && (
        <div className="mt-3 space-y-2.5 border-t border-line pt-3">
          <label className="flex items-center gap-2 text-sm">
            <Timer size={14} className="shrink-0 text-ink-faint" />
            <span className="flex-1 text-ink-muted">Prazo sugerido</span>
            <input
              type="number"
              min={1}
              max={365}
              className="campo h-8 w-16 px-2 text-right"
              value={prazo}
              placeholder={String(setor.prazo_sugerido_dias)}
              onChange={(e) => setPrazo(e.target.value)}
              onBlur={() => {
                const v = prazo ? Number(prazo) : null;
                if (v !== setor.prazo_dias) atualizar(setor, { prazo_dias: v }, "Prazo atualizado.");
              }}
            />
            <span className="text-xs text-ink-muted">dias</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <UserRound size={14} className="shrink-0 text-ink-faint" />
            <span className="text-ink-muted">Responsável</span>
            <select
              className="campo ml-auto h-8 w-40 text-xs"
              value={setor.responsavel_id ?? ""}
              onChange={(e) => atualizar(setor, { responsavel_id: e.target.value || null }, "Responsável atualizado.")}
            >
              <option value="">Ninguém</option>
              {candidatos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-ink-faint">O responsável é avisado quando chega tarefa sem dono.</p>
        </div>
      )}

      {!setor.sistema && (
        <div className="mt-auto flex justify-end gap-1 pt-3">
          <button className="botao-fantasma px-2.5 py-1 text-xs" onClick={() => atualizar(setor, { ativo: false }, "Setor desativado.")}>
            Desativar
          </button>
          <button
            className="botao-fantasma px-2.5 py-1 text-xs text-estado-atrasado"
            onClick={async () => {
              if (!window.confirm(`Excluir o setor ${setor.nome}?`)) return;
              try {
                await api.removerSetor(setor.id);
                await aoRemover();
                await recarregar();
                toast.success("Setor excluído.");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <Trash2 size={13} /> Excluir
          </button>
        </div>
      )}
    </div>
  );
}
