"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Copy, KeyRound, Lock, LockOpen, Plus } from "lucide-react";
import { AcessoPortal, api } from "@/lib/api";
import { Label, Modal } from "@/components/tanque/Drawer";

/** Logins do portal do posto, criados pela frota. A senha provisória aparece uma só vez. */
export function AcessosPortalPosto({ fornecedorId, podeGerenciar }: { fornecedorId: string; podeGerenciar: boolean }) {
  const [acessos, setAcessos] = useState<AcessoPortal[]>([]);
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", login: "" });
  const [senha, setSenha] = useState<{ login: string; senha: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    api.listAcessosPortal(fornecedorId).then(setAcessos).catch(() => setAcessos([]));
  }, [fornecedorId]);
  useEffect(carregar, [carregar]);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    try {
      const r = await api.criarAcessoPortal(fornecedorId, { nome: form.nome.trim(), email: form.email.trim() || null, login: form.login.trim() });
      setNovo(false);
      setForm({ nome: "", email: "", login: "" });
      setSenha({ login: r.login, senha: r.senha_provisoria });
      carregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const acao = async (a: AcessoPortal, tipo: "redefinir-senha" | "bloquear" | "desbloquear") => {
    if (tipo === "redefinir-senha" && !window.confirm(`Gerar nova senha provisória para ${a.nome}? A sessão aberta será encerrada.`)) return;
    try {
      const r = await api.acaoAcessoPortal(fornecedorId, a.id, tipo);
      if (r.senha_provisoria) setSenha({ login: r.login, senha: r.senha_provisoria });
      else toast.success(tipo === "bloquear" ? "Acesso bloqueado." : "Acesso liberado.");
      carregar();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const endereco = typeof window !== "undefined" ? `${window.location.origin}/posto` : "/posto";

  return (
    <div className="rounded-card border border-surface-border bg-white shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-surface-border px-4 py-3">
        <div>
          <h2 className="text-label font-semibold text-text-title">Acesso ao portal do posto</h2>
          <p className="text-meta text-text-subtle">O posto consulta os abastecimentos, fatura e envia a NF-e em {endereco}</p>
        </div>
        {podeGerenciar && (
          <button className="btn btn-secondary btn-sm" onClick={() => setNovo(true)}><Plus size={16} /> Novo acesso</button>
        )}
      </div>
      <ul className="divide-y divide-surface-border">
        {acessos.length === 0 && <li className="px-4 py-6 text-center text-body-sm text-text-subtle">Nenhum acesso criado para este posto.</li>}
        {acessos.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-body-sm">
            <div>
              <p className="font-medium text-text-title">
                {a.nome} <span className="font-normal text-text-subtle">· {a.login}</span>
                {a.bloqueado && <span className="ml-2 rounded-pill bg-[#FFDAD6] px-2 py-0.5 text-meta text-[#BA1A1A]">Bloqueado</span>}
                {!a.bloqueado && a.deve_trocar_senha && <span className="ml-2 rounded-pill bg-[#FFF4D6] px-2 py-0.5 text-meta text-[#805600]">Senha provisória</span>}
              </p>
              <p className="text-meta text-text-subtle">
                {a.email ?? "sem e-mail"} · {a.ultimo_acesso ? `último acesso ${new Date(a.ultimo_acesso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : "nunca acessou"}
              </p>
            </div>
            {podeGerenciar && (
              <div className="flex gap-1">
                <button className="btn btn-ghost btn-sm" onClick={() => acao(a, "redefinir-senha")}><KeyRound size={15} /> Nova senha</button>
                {a.bloqueado ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => acao(a, "desbloquear")}><LockOpen size={15} /> Liberar</button>
                ) : (
                  <button className="btn btn-ghost btn-sm text-[#B42318]" onClick={() => acao(a, "bloquear")}><Lock size={15} /> Bloquear</button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <Modal aberto={novo} onClose={() => setNovo(false)} titulo="Novo acesso ao portal"
        rodape={
          <>
            <button className="btn btn-secondary" onClick={() => setNovo(false)} disabled={ocupado}>Cancelar</button>
            <button type="submit" form="form-acesso-posto" className="btn btn-primary" disabled={ocupado}>Criar acesso</button>
          </>
        }>
        <form id="form-acesso-posto" onSubmit={criar} className="space-y-3">
          <Label texto="Nome de quem vai usar"><input className="input" required minLength={2} maxLength={150} value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} /></Label>
          <Label texto="E-mail (opcional)"><input className="input" type="email" maxLength={255} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Label>
          <Label texto="Login">
            <input className="input" required minLength={4} maxLength={60} pattern="[a-zA-Z0-9._\-]+" autoCapitalize="none"
              placeholder="ex.: posto.pinhalzinho" value={form.login} onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))} />
          </Label>
          <p className="text-meta text-text-subtle">O sistema gera uma senha provisória, que o posto troca no primeiro acesso.</p>
        </form>
      </Modal>

      <Modal aberto={!!senha} onClose={() => setSenha(null)} titulo="Senha provisória"
        rodape={<button className="btn btn-primary" onClick={() => setSenha(null)}>Anotei</button>}>
        {senha && (
          <div className="space-y-3 text-body-sm">
            <p>Repasse ao posto por um canal seguro. <strong>Ela não será mostrada de novo.</strong></p>
            <div className="rounded-btn bg-surface-bg p-3 font-mono">
              <p>Endereço: {endereco}</p>
              <p>Login: {senha.login}</p>
              <p>Senha: {senha.senha}</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => {
              navigator.clipboard?.writeText(`Portal do posto: ${endereco}\nLogin: ${senha.login}\nSenha provisória: ${senha.senha}`)
                .then(() => toast.success("Copiado."), () => toast.error("Não foi possível copiar."));
            }}><Copy size={15} /> Copiar</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
