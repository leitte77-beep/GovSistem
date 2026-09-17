"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { notify } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import type { Convenio } from "@/types/govtask";
import { Save, Star, Plus, Trash2, Link2, KeyRound } from "lucide-react";

type Props = { convenioId: string; convenio: Convenio; canEdit: boolean; onRefresh: () => void };

type KV = { key: string; value: string };

const respOptions = [
  { key: "gestor_id", label: "Gestor" },
  { key: "fiscal_id", label: "Fiscal" },
  { key: "engenheiro_id", label: "Engenheiro" },
] as const;

const dateFields = [
  { key: "prazo_execucao", label: "Prazo para execução" },
  { key: "prazo_prestacao_contas", label: "Prazo para prestação de contas" },
  { key: "previsao_conclusao", label: "Previsão de conclusão" },
] as const;

function toKV(obj: Record<string, unknown> | null | undefined): KV[] {
  const entries = obj && typeof obj === "object" ? Object.entries(obj) : [];
  return entries.length ? entries.map(([k, v]) => ({ key: k, value: String(v) })) : [{ key: "", value: "" }];
}

function toObj(rows: KV[]): Record<string, unknown> | null {
  const filled = rows.filter((r) => r.key.trim());
  if (filled.length === 0) return null;
  return Object.fromEntries(filled.map((r) => [r.key.trim(), r.value.trim()]));
}

export function ConfiguracoesTab({ convenioId, convenio, canEdit, onRefresh }: Props) {
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [responsaveis, setResponsaveis] = useState<Record<string, string>>({
    gestor_id: convenio.gestor_id || "", fiscal_id: convenio.fiscal_id || "", engenheiro_id: convenio.engenheiro_id || "",
  });
  const [datas, setDatas] = useState<Record<string, string>>({
    prazo_execucao: (convenio.prazo_execucao || "").slice(0, 10),
    prazo_prestacao_contas: (convenio.prazo_prestacao_contas || "").slice(0, 10),
    previsao_conclusao: (convenio.previsao_conclusao || "").slice(0, 10),
  });
  const [links, setLinks] = useState<KV[]>(() => toKV(convenio.links_externos));
  const [identificadores, setIdentificadores] = useState<KV[]>(() => toKV(convenio.identificadores_externos));
  const [saving, setSaving] = useState(false);
  const [fav, setFav] = useState(false);

  useEffect(() => {
    api.listUsers().then(setUsers).catch(() => {});
    api.listFavoritos().then((f) => setFav(f.some((x) => x.id === convenioId))).catch(() => {});
  }, [convenioId]);

  const inputCls = "w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";

  const save = async () => {
    setSaving(true);
    try {
      await api.updateConvenio(convenioId, {
        gestor_id: responsaveis.gestor_id || null,
        fiscal_id: responsaveis.fiscal_id || null,
        engenheiro_id: responsaveis.engenheiro_id || null,
        prazo_execucao: datas.prazo_execucao || null,
        prazo_prestacao_contas: datas.prazo_prestacao_contas || null,
        previsao_conclusao: datas.previsao_conclusao || null,
        links_externos: toObj(links),
        identificadores_externos: toObj(identificadores),
      });
      notify.success("Configurações salvas!");
      onRefresh();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleFavorito = async () => {
    try {
      if (fav) await api.desfavoritar(convenioId);
      else await api.favoritar(convenioId);
      setFav(!fav);
      notify.success(fav ? "Removido dos favoritos" : "Adicionado aos favoritos");
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const KVRows = ({ rows, setRows, placeholderKey, placeholderValue }: { rows: KV[]; setRows: (r: KV[]) => void; placeholderKey: string; placeholderValue: string }) => (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2">
          <input value={row.key} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))} placeholder={placeholderKey} disabled={!canEdit} className={`${inputCls} max-w-[180px]`} />
          <input value={row.value} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} placeholder={placeholderValue} disabled={!canEdit} className={inputCls} />
          {canEdit && (
            <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="p-2 text-text-subtle hover:text-[#B42318] shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <Button variant="ghost" size="sm" icon={Plus} onClick={() => setRows([...rows, { key: "", value: "" }])}>Adicionar</Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-text-body">Configurações específicas deste processo.</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={Star} onClick={toggleFavorito} className={fav ? "text-[#B54708]" : ""}>
            {fav ? "Favorito" : "Favoritar"}
          </Button>
          {canEdit && <Button size="sm" icon={Save} loading={saving} onClick={save}>Salvar</Button>}
        </div>
      </div>

      <Card padding="p-5">
        <h3 className="text-h3 text-text-title mb-3">Responsáveis</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {respOptions.map((r) => (
            <div key={r.key}>
              <label className="text-label text-text-body mb-1 block">{r.label}</label>
              <select value={responsaveis[r.key] || ""} onChange={(e) => setResponsaveis({ ...responsaveis, [r.key]: e.target.value })} disabled={!canEdit} className={inputCls}>
                <option value="">— Sem responsável —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          ))}
        </div>
        <p className="text-meta text-text-subtle mt-2">Vigência: {convenio.vigencia_inicio ? formatDate(convenio.vigencia_inicio) : "—"} a {convenio.vigencia_fim ? formatDate(convenio.vigencia_fim) : "—"}</p>
      </Card>

      <Card padding="p-5">
        <h3 className="text-h3 text-text-title mb-3">Prazos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {dateFields.map((f) => (
            <div key={f.key}>
              <label className="text-label text-text-body mb-1 block">{f.label}</label>
              <input type="date" value={datas[f.key] || ""} onChange={(e) => setDatas({ ...datas, [f.key]: e.target.value })} disabled={!canEdit} className={inputCls} />
            </div>
          ))}
        </div>
      </Card>

      <Card padding="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-4 h-4 text-[#1D4ED8]" />
          <h3 className="text-h3 text-text-title">Links Externos</h3>
        </div>
        <p className="text-body-sm text-text-body mb-3">Ex.: Transferegov, sistema estadual, processo licitatório, transparência.</p>
        <KVRows rows={links} setRows={setLinks} placeholderKey="Sistema" placeholderValue="URL" />
      </Card>

      <Card padding="p-5">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="w-4 h-4 text-[#1D4ED8]" />
          <h3 className="text-h3 text-text-title">Identificadores Externos</h3>
        </div>
        <p className="text-body-sm text-text-body mb-3">Ex.: Sistema "Transferegov" → Plano de Ação "09032026-012345".</p>
        <KVRows rows={identificadores} setRows={setIdentificadores} placeholderKey="Tipo (ex: Plano de Ação)" placeholderValue="Número/Protocolo" />
      </Card>

      {convenio.situacao && (
        <div className="flex justify-end">
          <Badge label="Processo em configuração" color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />
        </div>
      )}
    </div>
  );
}
