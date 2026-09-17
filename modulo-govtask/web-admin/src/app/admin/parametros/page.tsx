"use client";

/**
 * Parâmetros avançados do GovTask (§151, §205, §206, §152–§154, §196).
 *
 * Três blocos: campos adicionais por tipo de demanda, metas de SLA interno e
 * webhooks de saída. Tudo exige `admin.config` no servidor — a tela só evita
 * mostrar o que devolveria 403.
 */

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PERM } from "@/lib/perfil";
import { notify } from "@/components/ui/Toast";
import type { CampoCustomizado, SlaConfig, Webhook } from "@/types/govtask";

const TIPOS_CAMPO = ["TEXTO", "TEXTO_LONGO", "NUMERO", "MOEDA", "DATA", "SELECAO", "BOOLEANO", "URL"];
const CONTAGENS = ["DIAS_UTEIS", "DIAS_CORRIDOS", "HORAS"];

export default function ParametrosPage() {
  const { hasPermission } = useAuth();
  const podeAdministrar = hasPermission(PERM.ADMIN);
  const [campos, setCampos] = useState<CampoCustomizado[]>([]);
  const [sla, setSla] = useState<SlaConfig[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [tipos, setTipos] = useState<{ id: string; rotulo: string }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [novoCampo, setNovoCampo] = useState({ chave: "", rotulo: "", tipo: "TEXTO", tipo_demanda_id: "", obrigatorio: false });
  const [novoSla, setNovoSla] = useState({ valor: 2, contagem: "DIAS_UTEIS", descricao: "" });
  const [novoWebhook, setNovoWebhook] = useState({ url: "", descricao: "" });

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [c, s, w, catalogos] = await Promise.all([
        api.listarCamposCustomizados(),
        api.listarSlaConfig(),
        api.listarWebhooks().catch(() => []),
        api.catalogosDemandas(),
      ]);
      setCampos(c);
      setSla(s);
      setWebhooks(w);
      setTipos(catalogos.tipos);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível carregar os parâmetros");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const criarCampo = async () => {
    if (!novoCampo.chave.trim() || !novoCampo.rotulo.trim()) return notify.error("Informe chave e rótulo");
    setSalvando(true);
    try {
      await api.criarCampoCustomizado({
        chave: novoCampo.chave.trim().toLowerCase().replace(/\s+/g, "_"),
        rotulo: novoCampo.rotulo.trim(),
        tipo: novoCampo.tipo,
        tipo_demanda_id: novoCampo.tipo_demanda_id || undefined,
        obrigatorio: novoCampo.obrigatorio,
      });
      setNovoCampo({ chave: "", rotulo: "", tipo: "TEXTO", tipo_demanda_id: "", obrigatorio: false });
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível criar o campo");
    } finally { setSalvando(false); }
  };

  const criarSla = async () => {
    setSalvando(true);
    try {
      await api.criarSlaConfig({ valor: Number(novoSla.valor), contagem: novoSla.contagem, descricao: novoSla.descricao || undefined });
      setNovoSla({ valor: 2, contagem: "DIAS_UTEIS", descricao: "" });
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível criar a meta");
    } finally { setSalvando(false); }
  };

  const criarWebhook = async () => {
    if (!novoWebhook.url.startsWith("http")) return notify.error("Informe uma URL http(s)");
    setSalvando(true);
    try {
      const criado = await api.criarWebhook({ url: novoWebhook.url.trim(), descricao: novoWebhook.descricao || undefined });
      if (criado.secret) {
        notify.success(`Webhook criado. Segredo: ${criado.secret}`);
      }
      setNovoWebhook({ url: "", descricao: "" });
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível criar o webhook");
    } finally { setSalvando(false); }
  };

  if (!podeAdministrar) {
    return <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">Você não tem permissão para administrar parâmetros do GovTask.</div>;
  }

  if (carregando) return <div className="h-64 animate-pulse rounded-xl bg-slate-200" />;

  const nomeTipo = (id?: string | null) => tipos.find((t) => t.id === id)?.rotulo ?? "Todos os tipos";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.15em] text-blue-700">Configurações</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Parâmetros avançados</h1>
        <p className="mt-1 text-sm text-slate-600">Campos adicionais, SLA interno e webhooks deste município.</p>
      </header>

      {/* Campos customizados */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-bold text-slate-900">Campos adicionais por tipo</h2>
        <p className="text-sm text-slate-600">Aparecem no formulário da demanda conforme o tipo selecionado (§205).</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          <input value={novoCampo.chave} onChange={(e) => setNovoCampo({ ...novoCampo, chave: e.target.value })} placeholder="chave (ex.: placa)" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
          <input value={novoCampo.rotulo} onChange={(e) => setNovoCampo({ ...novoCampo, rotulo: e.target.value })} placeholder="Rótulo" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
          <select value={novoCampo.tipo} onChange={(e) => setNovoCampo({ ...novoCampo, tipo: e.target.value })} className="h-9 rounded-lg border border-slate-300 px-3 text-sm">
            {TIPOS_CAMPO.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={novoCampo.tipo_demanda_id} onChange={(e) => setNovoCampo({ ...novoCampo, tipo_demanda_id: e.target.value })} className="h-9 rounded-lg border border-slate-300 px-3 text-sm">
            <option value="">Todos os tipos</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
          </select>
          <button onClick={criarCampo} disabled={salvando} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Criar</button>
        </div>
        <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={novoCampo.obrigatorio} onChange={(e) => setNovoCampo({ ...novoCampo, obrigatorio: e.target.checked })} />Obrigatório</label>

        <ul className="mt-4 divide-y divide-slate-100">
          {campos.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span><span className="font-mono text-xs text-slate-500">{c.chave}</span> · {c.rotulo} <span className="text-xs text-slate-400">({c.tipo} · {nomeTipo(c.tipo_demanda_id)}{c.obrigatorio ? " · obrigatório" : ""})</span></span>
              <button onClick={() => api.removerCampoCustomizado(c.id).then(carregar).catch(() => notify.error("Não foi possível remover"))} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
          {!campos.length && <li className="py-4 text-center text-xs text-slate-500">Nenhum campo adicional configurado.</li>}
        </ul>
      </section>

      {/* SLA */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-bold text-slate-900">SLA interno</h2>
        <p className="text-sm text-slate-600">Meta de gestão para concluir a demanda — não substitui o prazo legal (§153).</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <input type="number" min={1} value={novoSla.valor} onChange={(e) => setNovoSla({ ...novoSla, valor: Number(e.target.value) })} className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
          <select value={novoSla.contagem} onChange={(e) => setNovoSla({ ...novoSla, contagem: e.target.value })} className="h-9 rounded-lg border border-slate-300 px-3 text-sm">
            {CONTAGENS.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
          </select>
          <input value={novoSla.descricao} onChange={(e) => setNovoSla({ ...novoSla, descricao: e.target.value })} placeholder="Descrição (opcional)" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
          <button onClick={criarSla} disabled={salvando} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Criar meta</button>
        </div>
        <ul className="mt-4 divide-y divide-slate-100">
          {sla.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span>{s.valor} {s.contagem.replace("_", " ").toLowerCase()} {s.descricao ? `· ${s.descricao}` : ""}</span>
              <button onClick={() => api.removerSlaConfig(s.id).then(carregar).catch(() => notify.error("Não foi possível remover"))} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
          {!sla.length && <li className="py-4 text-center text-xs text-slate-500">Nenhuma meta configurada.</li>}
        </ul>
      </section>

      {/* Webhooks */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-slate-900"><WebhookIcon className="h-4 w-4" />Webhooks</h2>
            <p className="text-sm text-slate-600">Eventos assinados com HMAC-SHA256, entregues por processamento explícito (§196).</p>
          </div>
          {webhooks.length > 0 && (
            <button onClick={() => api.processarWebhooks().then((r) => notify.success(`${r.sucesso} entrega(s) concluída(s)`)).catch(() => notify.error("Falha ao processar"))} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
              <RefreshCw className="h-3.5 w-3.5" />Processar pendentes
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <input value={novoWebhook.url} onChange={(e) => setNovoWebhook({ ...novoWebhook, url: e.target.value })} placeholder="https://…" className="h-9 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-2" />
          <button onClick={criarWebhook} disabled={salvando} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Criar webhook</button>
        </div>
        <ul className="mt-4 divide-y divide-slate-100">
          {webhooks.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="truncate"><span className="font-mono text-xs text-slate-500">{w.url}</span>{w.descricao ? ` · ${w.descricao}` : ""} <span className="text-xs text-slate-400">{w.ativo ? "ativo" : "inativo"}{w.ultimo_status ? ` · último: ${w.ultimo_status}` : ""}</span></span>
              <button onClick={() => api.removerWebhook(w.id).then(carregar).catch(() => notify.error("Não foi possível remover"))} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
          {!webhooks.length && <li className="py-4 text-center text-xs text-slate-500">Nenhum webhook configurado.</li>}
        </ul>
      </section>
    </div>
  );
}
