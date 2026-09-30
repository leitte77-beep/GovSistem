"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Pencil, Search } from "lucide-react";
import { AcessoUsuario, api, PerfilAcesso, Unidade } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Drawer, Label } from "@/components/tanque/Drawer";

/**
 * Perfil de cada usuário dentro do GovFrota e as secretarias que ele pode ver.
 * Os usuários chegam pelo login da plataforma; o escopo é aplicado no backend.
 */
export function AcessosUsuarios() {
  const { user: eu } = useAuth();
  const [usuarios, setUsuarios] = useState<AcessoUsuario[]>([]);
  const [perfis, setPerfis] = useState<PerfilAcesso[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<AcessoUsuario | null>(null);
  const [perfil, setPerfil] = useState("");
  const [cargo, setCargo] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setUsuarios(await api.listAcessosUsuarios());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    carregar();
    api.listPerfisAcesso().then(setPerfis).catch(() => setPerfis([]));
    api.listUnidades(true).then(setUnidades).catch(() => setUnidades([]));
  }, [carregar]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? usuarios.filter((u) => `${u.nome} ${u.email}`.toLowerCase().includes(t)) : usuarios;
  }, [busca, usuarios]);

  const perfilEscolhido = perfis.find((p) => p.name === perfil);
  const exigeSecretaria = !!perfilEscolhido?.restrito_a_secretaria;

  const abrir = (u: AcessoUsuario) => {
    setEditando(u);
    setPerfil(u.perfil_local ?? "");
    setCargo(u.cargo ?? "");
    setMarcadas(new Set(u.secretarias.map((s) => s.id)));
  };

  const alternar = (id: string) =>
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    if (exigeSecretaria && marcadas.size === 0) {
      toast.error("Marque ao menos uma secretaria para este perfil.");
      return;
    }
    setSalvando(true);
    try {
      await api.updateAcessoUsuario(editando.id, {
        perfil: perfil || null,
        cargo: cargo.trim() || null,
        unidade_ids: Array.from(marcadas),
      });
      toast.success("Acesso atualizado.");
      setEditando(null);
      carregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <h2 className="mb-1 text-label font-semibold text-text-title">Usuários e acessos</h2>
      <p className="mb-3 text-meta text-text-subtle">
        Defina o perfil de cada usuário no GovFrota e, para secretários, as secretarias que ele acompanha. Quem tem
        secretarias vinculadas vê somente os dados delas. Os usuários aparecem aqui depois do primeiro acesso pela
        plataforma.
      </p>

      <label className="relative mb-3 block max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" aria-hidden />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou e-mail…"
          aria-label="Buscar usuário"
          className="w-full rounded-btn border border-surface-border py-2 pl-9 pr-3 text-body-sm"
        />
      </label>

      {filtrados.length === 0 ? (
        <p className="rounded-btn bg-surface-bg px-3 py-4 text-center text-body-sm text-text-subtle">
          Nenhum usuário encontrado.
        </p>
      ) : (
        <ul className="divide-y divide-surface-border rounded-btn border border-surface-border">
          {filtrados.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-body-sm">
              <div className="min-w-0">
                <p className="font-medium text-text-title">
                  {u.nome}
                  {!u.ativo && <span className="ml-2 text-meta text-text-subtle">(inativo)</span>}
                </p>
                <p className="truncate text-meta text-text-subtle">
                  {u.email}
                  {u.cargo && ` · ${u.cargo}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {u.perfis_efetivos.map((p) => (
                  <span key={p.name} className="rounded-pill bg-[#EFF6FF] px-2 py-0.5 text-meta font-medium text-[#1D4ED8]">
                    {p.label}
                  </span>
                ))}
                {u.restrito ? (
                  <span className="rounded-pill bg-[#FFF4D6] px-2 py-0.5 text-meta font-medium text-[#805600]">
                    {u.secretarias.length ? u.secretarias.map((s) => s.nome).join(", ") : "Sem secretaria — não vê dados"}
                  </span>
                ) : (
                  <span className="text-meta text-text-subtle">Todas as secretarias</span>
                )}
                {u.id !== eu?.id && (
                  <button className="btn btn-ghost btn-sm" onClick={() => abrir(u)} aria-label={`Editar acesso de ${u.nome}`}>
                    <Pencil size={15} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        aberto={!!editando}
        onClose={() => setEditando(null)}
        titulo={editando ? `Acesso de ${editando.nome}` : "Acesso"}
        largura="max-w-lg"
        rodape={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditando(null)} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" form="form-acesso" className="btn btn-primary" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar acesso"}
            </button>
          </>
        }
      >
        {editando && (
          <form id="form-acesso" onSubmit={salvar} className="space-y-4">
            <Label texto="Perfil no GovFrota">
              <select className="input" value={perfil} onChange={(e) => setPerfil(e.target.value)}>
                <option value="">
                  Usar o da plataforma ({editando.perfis_plataforma.map((p) => p.label).join(", ") || "nenhum"})
                </option>
                {perfis.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Label>
            <Label texto="Cargo / função">
              <input
                className="input"
                value={cargo}
                maxLength={150}
                onChange={(e) => setCargo(e.target.value)}
                placeholder="Ex.: Secretário Municipal de Saúde"
              />
            </Label>
            <fieldset>
              <legend className="text-meta">
                Secretarias {exigeSecretaria ? "(obrigatório para este perfil)" : "(opcional — restringe o acesso)"}
              </legend>
              {unidades.length === 0 ? (
                <p className="mt-2 text-meta text-text-subtle">Cadastre as secretarias acima primeiro.</p>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {unidades.map((un) => (
                    <label key={un.id} className="flex items-center gap-2 text-body-sm">
                      <input type="checkbox" checked={marcadas.has(un.id)} onChange={() => alternar(un.id)} />
                      {un.nome}
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-2 text-meta text-text-subtle">
                {marcadas.size
                  ? "Com secretarias marcadas, o usuário vê somente os veículos, abastecimentos e relatórios delas."
                  : "Sem secretarias marcadas, o usuário vê a frota inteira conforme o perfil."}
              </p>
            </fieldset>
          </form>
        )}
      </Drawer>
    </section>
  );
}
