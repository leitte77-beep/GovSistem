"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { Save, Plus, Pencil, Trash2, Eye, EyeOff, Loader2, Wifi } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";

interface ProviderConfig {
  id: string;
  organization_id: string;
  provider: string;
  environment: string;
  pix_enabled: boolean;
  boleto_enabled: boolean;
  credit_card_enabled: boolean;
  default_billing_type: string;
  wallet_id: string | null;
  status: string;
  has_api_key: boolean;
  has_webhook_token: boolean;
}

export default function ProviderConfigPage() {
  const [items, setItems] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const [form, setForm] = useState({
    provider: "asaas",
    environment: "sandbox",
    api_key: "",
    webhook_token: "",
    pix_enabled: true,
    boleto_enabled: true,
    credit_card_enabled: true,
    default_billing_type: "UNDEFINED",
    wallet_id: "",
  });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<ProviderConfig[]>("/payment-provider-configs");
      setItems(res);
    } catch { toast.error("Erro ao carregar configuracoes"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openNew = () => {
    setEditId(null);
    setForm({ provider: "asaas", environment: "sandbox", api_key: "", webhook_token: "", pix_enabled: true, boleto_enabled: true, credit_card_enabled: true, default_billing_type: "UNDEFINED", wallet_id: "" });
    setShowApiKey(false); setShowWebhookToken(false);
    setShowForm(true);
  };

  const openEdit = (item: ProviderConfig) => {
    setEditId(item.id);
    setForm({ provider: item.provider, environment: item.environment, api_key: "", webhook_token: "", pix_enabled: item.pix_enabled, boleto_enabled: item.boleto_enabled, credit_card_enabled: item.credit_card_enabled, default_billing_type: item.default_billing_type, wallet_id: item.wallet_id || "" });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editId) {
        await api(`/payment-provider-configs/${editId}`, {
          method: "PUT",
          body: {
            environment: form.environment,
            api_key: form.api_key || undefined,
            webhook_token: form.webhook_token || undefined,
            pix_enabled: form.pix_enabled,
            boleto_enabled: form.boleto_enabled,
            credit_card_enabled: form.credit_card_enabled,
            default_billing_type: form.default_billing_type,
            wallet_id: form.wallet_id || undefined,
          },
        });
        toast.success("Configuracao atualizada!");
      } else {
        await api("/payment-provider-configs", {
          method: "POST",
          body: { ...form, wallet_id: form.wallet_id || undefined },
        });
        toast.success("Configuracao criada!");
      }
      setShowForm(false);
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao salvar"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover esta configuracao?")) return;
    try {
      await api(`/payment-provider-configs/${id}`, { method: "DELETE" });
      toast.success("Configuracao removida");
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao remover"); }
  };

  return (
    <AppLayout title="Configuração de Provedor de Pagamento">
      <Card>
        <div className="flex items-center justify-between gap-4 mb-6">
          <p className="text-sm text-gray-500">{items.length} configuracao(oes)</p>
          <button onClick={openNew} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Novo Provedor
          </button>
        </div>

        {loading ? <p className="text-sm text-gray-400">Carregando...</p> : items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-2">Nenhuma configuracao de provedor</p>
            <p className="text-xs text-gray-400">Configure o Asaas para comecar a emitir cobrancas reais</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-medium text-sm">{item.provider.toUpperCase()}</span>
                    <Badge variant={item.environment === "production" ? "success" : "warning"}>
                      {item.environment}
                    </Badge>
                    <Badge variant={item.status === "active" ? "success" : "default"}>
                      {item.status}
                    </Badge>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>Pix: {item.pix_enabled ? "✅" : "❌"}</span>
                    <span>Boleto: {item.boleto_enabled ? "✅" : "❌"}</span>
                    <span>Cartao: {item.credit_card_enabled ? "✅" : "❌"}</span>
                    <span>API Key: {item.has_api_key ? "✅" : "❌"}</span>
                    <span>Webhook: {item.has_webhook_token ? "✅" : "❌"}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    if (!item.has_api_key) { toast.error("Configure a API key primeiro"); return; }
                    try {
                      const res = await api<{status: string; message: string}>(`/payment-provider-configs/${item.id}/test-connection`, { method: "POST" });
                      toast.success(res.status === "ok" ? "✅ Conexão OK!" : `❌ ${res.message}`);
                    } catch (err: any) { toast.error(err.message || "Erro ao testar"); }
                  }} className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Testar conexão">
                    <Wifi size={16} />
                  </button>
                  <button onClick={() => openEdit(item)} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? "Editar Provedor" : "Novo Provedor"} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provedor</label>
              <select value={form.provider} onChange={(e) => setForm({...form, provider: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white" disabled={!!editId}>
                <option value="asaas">Asaas</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ambiente</label>
              <select value={form.environment} onChange={(e) => setForm({...form, environment: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
                <option value="sandbox">Sandbox</option>
                <option value="production">Producao</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <div className="relative">
                <input type={showApiKey ? "text" : "password"} value={form.api_key}
                  onChange={(e) => setForm({...form, api_key: e.target.value})}
                  placeholder={editId ? "Deixe vazio para manter a atual" : "Chave de API do Asaas"}
                  className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
                <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Webhook Token</label>
              <div className="relative">
                <input type={showWebhookToken ? "text" : "password"} value={form.webhook_token}
                  onChange={(e) => setForm({...form, webhook_token: e.target.value})}
                  placeholder={editId ? "Deixe vazio para manter o atual" : "Token do webhook Asaas"}
                  className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
                <button type="button" onClick={() => setShowWebhookToken(!showWebhookToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showWebhookToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Padrao</label>
              <select value={form.default_billing_type} onChange={(e) => setForm({...form, default_billing_type: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
                <option value="UNDEFINED">Indefinido</option>
                <option value="BOLETO">Boleto</option>
                <option value="PIX">Pix</option>
                <option value="CREDIT_CARD">Cartao</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wallet ID</label>
              <input value={form.wallet_id} onChange={(e) => setForm({...form, wallet_id: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Metodos de Pagamento</p>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.pix_enabled} onChange={(e) => setForm({...form, pix_enabled: e.target.checked})}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /> Pix
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.boleto_enabled} onChange={(e) => setForm({...form, boleto_enabled: e.target.checked})}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /> Boleto
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.credit_card_enabled} onChange={(e) => setForm({...form, credit_card_enabled: e.target.checked})}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" /> Cartao
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
