"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";
import type { AiConfigMetadata, AiTestResult } from "@/types/document_model";

export default function AiSettingsPage() {
  const [cfg, setCfg] = useState<AiConfigMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [timeoutS, setTimeoutS] = useState(60);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [maxConcurrency, setMaxConcurrency] = useState(4);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<AiTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(() => {
    api
      .getAiConfig()
      .then((c) => {
        setCfg(c);
        setEnabled(c.enabled);
        setTimeoutS(c.limits.timeout_seconds);
        setMaxTokens(c.limits.max_tokens);
        setMaxConcurrency(c.limits.max_concurrency);
      })
      .catch((err) => notifyError("ai.config", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const c = await api.saveAiConfig({
        enabled,
        timeout_seconds: timeoutS,
        max_tokens: maxTokens,
        max_concurrency: maxConcurrency,
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      });
      setCfg(c);
      setApiKey("");
      setTest(null);
      toast.success("Configuração de IA salva.");
    } catch (err) {
      notifyError("ai.config.save", err);
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTest(null);
    try {
      const keyToTest = apiKey.trim() || undefined;
      const r = await api.testAiConnection(keyToTest);
      setTest(r);
      if (keyToTest) {
        toast(r.ok ? "Chave testada (sem ser salva)." : "Teste falhou.", {
          icon: r.ok ? "✅" : "❌",
        });
      }
      load();
    } catch (err) {
      notifyError("ai.config.test", err);
    } finally {
      setTesting(false);
    }
  };

  const replaceKey = async () => {
    if (!apiKey.trim()) {
      toast.error("Digite a nova chave para substituir.");
      return;
    }
    setBusy(true);
    try {
      const c = await api.replaceAiKey(apiKey.trim());
      setCfg(c);
      setApiKey("");
      toast.success("Chave substituída.");
    } catch (err) {
      notifyError("ai.config.replace", err);
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    if (!window.confirm("Remover a chave de IA configurada? (ação auditada)")) return;
    setBusy(true);
    try {
      await api.removeAiKey();
      toast.success("Chave removida.");
      load();
    } catch (err) {
      notifyError("ai.config.remove", err);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const c = await api.disableAi();
      setCfg(c);
      setEnabled(false);
      toast.success("Recursos de IA desativados.");
    } catch (err) {
      notifyError("ai.config.disable", err);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="p-gutter max-w-3xl">
        <p className="py-10 text-center text-sm text-gray-500">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="p-gutter max-w-3xl">
      <PageHeader
        title="Inteligência artificial"
        description="Integração centralizada do Diário Oficial com o provedor de IA."
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provedor">{cfg?.provider}</Field>
          <Field label="Modelo">
            {cfg?.model} <span className="text-xs text-gray-400">(somente leitura)</span>
          </Field>
          <Field label="Endpoint">{cfg?.endpoint}</Field>
          <Field label="Situação da chave">
            {cfg?.configured ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Configurada · {cfg?.key_masked}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                Nenhuma chave configurada
              </span>
            )}
          </Field>
        </div>

        <label className="mt-5 flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Recursos de IA ativos
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Timeout (s)">
            <NumberInput value={timeoutS} onChange={(v) => setTimeoutS(v)} />
          </Field>
          <Field label="Máx. tokens/resposta">
            <NumberInput value={maxTokens} onChange={(v) => setMaxTokens(v)} />
          </Field>
          <Field label="Concorrência máx.">
            <NumberInput value={maxConcurrency} onChange={(v) => setMaxConcurrency(v)} />
          </Field>
        </div>

        <div className="mt-5">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Chave da API DeepSeek</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={cfg?.configured ? "Digite uma nova chave para substituir (ou deixe vazio para manter)" : "sk-…"}
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-gray-400">
              A chave nunca é exibida de volta nem armazenada no navegador. Campo vazio preserva a atual.
            </span>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={save} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Salvar configuração
          </button>
          <button onClick={testConnection} disabled={testing} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {testing ? "Testando…" : "Testar conexão"}
          </button>
          <button onClick={replaceKey} disabled={busy || !apiKey.trim()} className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40">
            Substituir chave
          </button>
          <button onClick={removeKey} disabled={busy || !cfg?.configured} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40">
            Remover chave
          </button>
          <button onClick={disable} disabled={busy} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Desativar IA
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-800">Último teste:</span>
            <TestBadge cfg={cfg} test={test} />
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {test?.message || cfg?.last_test.message || "Nenhum teste realizado ainda."}
            {test?.note && <div className="mt-1">{test.note}</div>}
            <div className="mt-1">O teste consome tokens da chave informada.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <div className="text-gray-900">{children}</div>
    </div>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
    />
  );
}

function TestBadge({ cfg, test }: { cfg: AiConfigMetadata | null; test: AiTestResult | null }) {
  const status = test?.status ?? cfg?.last_test.status;
  const ok = test?.ok ?? (status === "ok");
  const map: Record<string, string> = {
    ok: "bg-green-100 text-green-800",
    not_configured: "bg-gray-100 text-gray-600",
    authentication: "bg-red-100 text-red-700",
    rate_limited: "bg-amber-100 text-amber-800",
    timeout: "bg-amber-100 text-amber-800",
    unavailable: "bg-amber-100 text-amber-800",
    invalid_request: "bg-red-100 text-red-700",
    disabled: "bg-gray-200 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status ?? ""] ?? (ok ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600")}`}>
      {status ? (ok ? "conectado" : status) : "não testado"}
    </span>
  );
}
