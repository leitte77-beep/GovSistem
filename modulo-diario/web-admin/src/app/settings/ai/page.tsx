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
      <div className="mx-auto max-w-3xl px-gutter py-8">
        <p className="py-10 text-center text-body-sm text-on-surface-variant">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-gutter py-8 animate-fade-up">
      <PageHeader
        eyebrow="Configurações"
        title="Inteligência artificial"
        description="Integração centralizada do Diário Oficial com o provedor de IA."
      />

      <section className="card p-6">
        <div className="border-b border-outline-variant pb-3">
          <p className="eyebrow">Provedor</p>
          <h2 className="mt-1 text-headline-sm text-on-surface">Integração de IA</h2>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Provedor">{cfg?.provider}</Field>
          <Field label="Modelo">
            {cfg?.model} <span className="text-body-sm text-outline">(somente leitura)</span>
          </Field>
          <Field label="Endpoint">{cfg?.endpoint}</Field>
          <Field label="Situação da chave">
            {cfg?.configured ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-success-container px-2.5 py-0.5 text-body-sm font-medium text-on-success-container">
                Configurada · {cfg?.key_masked}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-surface-container-high px-2.5 py-0.5 text-body-sm font-medium text-on-surface-variant">
                Nenhuma chave configurada
              </span>
            )}
          </Field>
        </div>

        <label className="mt-5 flex items-center gap-2.5 text-body-sm font-medium text-on-surface">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/30"
          />
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
          <label className="block">
            <span className="field-label">Chave da API DeepSeek</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={cfg?.configured ? "Digite uma nova chave para substituir (ou deixe vazio para manter)" : "sk-…"}
              autoComplete="new-password"
              className="input"
            />
            <span className="field-hint">
              A chave nunca é exibida de volta nem armazenada no navegador. Campo vazio preserva a atual.
            </span>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={save} disabled={busy} className="btn-primary">
            Salvar configuração
          </button>
          <button onClick={testConnection} disabled={testing} className="btn-outline">
            {testing ? "Testando…" : "Testar conexão"}
          </button>
          <button
            onClick={replaceKey}
            disabled={busy || !apiKey.trim()}
            className="btn border border-warning-container bg-warning-container/50 text-on-warning-container hover:bg-warning-container"
          >
            Substituir chave
          </button>
          <button
            onClick={removeKey}
            disabled={busy || !cfg?.configured}
            className="btn border border-error/30 text-error hover:bg-error-container/60"
          >
            Remover chave
          </button>
          <button onClick={disable} disabled={busy} className="btn-ghost">
            Desativar IA
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-outline-variant bg-surface-container-low p-4">
          <div className="flex items-center gap-2">
            <span className="text-body-sm font-semibold text-on-surface">Último teste:</span>
            <TestBadge cfg={cfg} test={test} />
          </div>
          <div className="mt-1 text-body-sm text-on-surface-variant">
            {test?.message || cfg?.last_test.message || "Nenhum teste realizado ainda."}
            {test?.note && <div className="mt-1">{test.note}</div>}
            <div className="mt-1">O teste consome tokens da chave informada.</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="eyebrow block">{label}</span>
      <div className="mt-1 text-body-md text-on-surface">{children}</div>
    </div>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="input"
    />
  );
}

function TestBadge({ cfg, test }: { cfg: AiConfigMetadata | null; test: AiTestResult | null }) {
  const status = test?.status ?? cfg?.last_test.status;
  const ok = test?.ok ?? (status === "ok");
  const map: Record<string, string> = {
    ok: "bg-success-container text-on-success-container",
    not_configured: "bg-surface-container-high text-on-surface-variant",
    authentication: "bg-error-container text-on-error-container",
    rate_limited: "bg-warning-container text-on-warning-container",
    timeout: "bg-warning-container text-on-warning-container",
    unavailable: "bg-warning-container text-on-warning-container",
    invalid_request: "bg-error-container text-on-error-container",
    disabled: "bg-surface-container-highest text-on-surface-variant",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-body-sm font-medium ${map[status ?? ""] ?? (ok ? "bg-success-container text-on-success-container" : "bg-surface-container-high text-on-surface-variant")}`}>
      {status ? (ok ? "conectado" : status) : "não testado"}
    </span>
  );
}
