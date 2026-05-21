"use client";

import { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import clsx from "clsx";
import { api, type BackupFile } from "@/lib/api";
import type { SystemSetting } from "@/types/setting";
import ConfirmModal from "@/components/ConfirmModal";

const CATEGORIES = [
  { key: "general", label: "Geral", icon: "tune" },
  { key: "edition", label: "Edições", icon: "auto_stories" },
  { key: "security", label: "Segurança", icon: "security" },
  { key: "notifications", label: "Notificações", icon: "notifications_active" },
  { key: "upload", label: "Upload", icon: "cloud_upload" },
  { key: "retention", label: "Retenção", icon: "history" },
  { key: "backup", label: "Backup", icon: "backup" },
];

const SETTING_LABELS: Record<string, { label: string; description: string }> = {
  "site.name": { label: "Nome do Sistema", description: "Nome exibido no topo do portal público" },
  "site.description": { label: "Descrição do Portal", description: "Frase exibida abaixo do nome no portal" },
  "site.logo_url": { label: "URL da Logo", description: "Link externo da logo (deixe vazio para usar a padrão)" },
  "edition.default_type": { label: "Tipo Padrão de Edição", description: "Tipo selecionado automaticamente ao criar nova edição" },
  "edition.auto_numbering": { label: "Numeração Automática", description: "Numerar edições sequencialmente de forma automática" },
  "security.password_min_length": { label: "Tamanho Mínimo da Senha", description: "Quantidade mínima de caracteres exigida na senha" },
  "security.password_expire_days": { label: "Expiração de Senha (dias)", description: "Após quantos dias a senha do usuário expira" },
  "security.max_login_attempts": { label: "Tentativas de Login", description: "Quantas tentativas erradas até bloquear o acesso" },
  "security.lockout_minutes": { label: "Bloqueio (minutos)", description: "Tempo de bloqueio após excesso de tentativas" },
  "security.mfa_required": { label: "Autenticação em Dois Fatores", description: "Exigir MFA para usuários com perfil de assinador" },
  "retention.audit_log_days": { label: "Retenção de Logs", description: "Por quantos dias os logs de auditoria são mantidos" },
  "notifications.smtp_host": { label: "Servidor SMTP", description: "Endereço do servidor de envio de emails" },
  "notifications.smtp_port": { label: "Porta SMTP", description: "Porta de conexão com o servidor de email" },
  "notifications.smtp_user": { label: "Usuário SMTP", description: "Usuário para autenticação no servidor de email" },
  "notifications.smtp_pass": { label: "Senha SMTP", description: "Senha do servidor de email" },
  "notifications.from_email": { label: "Remetente", description: "Endereço de email usado como remetente das notificações" },
  "upload.max_size_mb": { label: "Tamanho Máximo por Arquivo", description: "Em MB — tamanho máximo permitido para upload" },
  "upload.allowed_extensions": { label: "Extensões Permitidas", description: "Lista separada por vírgula das extensões aceitas" },
};

const SETTING_LABELS_BACKUP: Record<string, { label: string; description: string }> = {
  "backup.enabled": { label: "Backup Automático", description: "Ativar ou desativar a execução automática de backups" },
  "backup.day": { label: "Dia da Semana", description: "0=segunda a 6=domingo. Use * para todos os dias" },
  "backup.time": { label: "Horário", description: "Horário para executar o backup automático (HH:MM)" },
  "backup.retention_days": { label: "Dias de Retenção", description: "Por quantos dias os backups são mantidos no servidor" },
  "backup.gdrive_enabled": { label: "Google Drive", description: "Enviar backup para o Google Drive após criar" },
  "backup.gdrive_folder_id": { label: "ID da Pasta no Google Drive", description: "Cole o ID da pasta onde o backup será enviado" },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function BackupConfigPanel() {
  const [cfgSettings, setCfgSettings] = useState<SystemSetting[]>([]);
  const [cfgValues, setCfgValues] = useState<Record<string, string>>({});
  const [cfgLoading, setCfgLoading] = useState(true);
  const [cfgSaving, setCfgSaving] = useState(false);

  useEffect(() => {
    api.listSettings("backup")
      .then((s) => {
        setCfgSettings(s);
        const v: Record<string, string> = {};
        s.forEach((st) => { v[st.id] = st.value ?? ""; });
        setCfgValues(v);
      })
      .catch(() => toast.error("Erro ao carregar configurações de backup"))
      .finally(() => setCfgLoading(false));
  }, []);

  const saveBackupConfig = async () => {
    setCfgSaving(true);
    try {
      for (const st of cfgSettings) {
        const val = cfgValues[st.id];
        if (val !== (st.value ?? "")) {
          await api.updateSetting(st.id, { value: val || undefined });
        }
      }
      toast.success("Configurações de backup salvas!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setCfgSaving(false);
    }
  };

  if (cfgLoading) {
    return (
      <div className="flex justify-center py-8">
        <span className="material-symbols-outlined text-3xl animate-spin text-primary">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest/80 backdrop-blur-sm rounded-xl p-6 border border-outline-variant shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">schedule</span>
          <h3 className="text-headline-sm font-headline-sm text-primary">Agendamento de Backup</h3>
        </div>
        <button onClick={saveBackupConfig} disabled={cfgSaving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg text-label-md font-label-md hover:shadow-lg transition-all disabled:opacity-50">
          <span className="material-symbols-outlined text-sm">{cfgSaving ? "progress_activity" : "save"}</span>
          {cfgSaving ? "Salvando..." : "Salvar"}
        </button>
      </div>
      <p className="text-body-sm text-on-surface-variant mb-5">
        Configure o backup automático. O scheduler verifica a cada 5 minutos se é hora de executar.
      </p>
      <div className="grid grid-cols-2 gap-6">
        {cfgSettings.map((st) => {
          const meta = SETTING_LABELS_BACKUP[st.key];
          const label = meta?.label ?? st.key;
          const description = meta?.description ?? st.description;
          return (
            <div key={st.id}>
              <label className="text-label-md font-label-md text-primary block mb-1">{label}</label>
              <p className="text-body-sm text-on-surface-variant mb-2">{description}</p>
              {st.type === "boolean" ? (
                <select value={cfgValues[st.id] || "false"}
                  onChange={(e) => setCfgValues((p) => ({ ...p, [st.id]: e.target.value }))}
                  className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all max-w-xs">
                  <option value="true">Ativado</option>
                  <option value="false">Desativado</option>
                </select>
              ) : (
                <input type="text" value={cfgValues[st.id] ?? ""}
                  onChange={(e) => setCfgValues((p) => ({ ...p, [st.id]: e.target.value }))}
                  className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GDriveInfo() {
  return (
    <div className="bg-surface-container-lowest/80 backdrop-blur-sm rounded-xl p-6 border border-outline-variant shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <span className="material-symbols-outlined text-primary">cloud</span>
        <h3 className="text-headline-sm font-headline-sm text-primary">Google Drive</h3>
      </div>
      <p className="text-body-sm text-on-surface-variant mb-4">
        Para enviar backups automaticamente para o Google Drive, é necessário:
      </p>
      <ol className="list-decimal list-inside space-y-2 text-body-sm text-on-surface-variant mb-4">
        <li>Criar um projeto no <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Cloud Console</a></li>
        <li>Ativar a <strong>Google Drive API</strong></li>
        <li>Criar uma <strong>OAuth Client ID</strong> (tipo: Desktop ou Web)</li>
        <li>Copiar o <strong>Client ID</strong> e <strong>Client Secret</strong></li>
        <li>Gerar um <strong>Refresh Token</strong> com escopo <code className="bg-surface-container-high px-1 rounded">https://www.googleapis.com/auth/drive.file</code></li>
        <li>Criar uma pasta no Google Drive e copiar o <strong>ID da pasta</strong> (último segmento da URL)</li>
      </ol>
      <div className="bg-surface-container-high rounded-lg p-4 text-body-sm text-on-surface-variant">
        <p className="font-medium text-primary mb-1">Exemplo de ID de pasta:</p>
        <code className="break-all">https://drive.google.com/drive/folders/<strong className="text-primary">1a2b3c4d5e6f7g8h9i0j</strong></code>
        <p className="mt-2">O ID é o trecho após <code className="bg-surface-container-high px-1 rounded">/folders/</code></p>
      </div>
    </div>
  );
}

function BackupPanel() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBackups = () => {
    setLoading(true);
    api.listBackups()
      .then(setBackups)
      .catch(() => toast.error("Erro ao listar backups"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadBackups(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await api.createBackup();
      toast.success(result.message);
      loadBackups();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar backup");
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (filename: string) => {
    const token = localStorage.getItem("access_token");
    if (!token) { toast.error("Não autenticado"); return; }
    const url = api.downloadBackupUrl(filename);
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Erro ao baixar backup");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success("Download iniciado");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao baixar backup");
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      await api.deleteBackup(filename);
      toast.success("Backup excluído");
      loadBackups();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir backup");
    }
    setConfirmDelete(null);
  };

  const handleRestoreFromServer = async (filename: string) => {
    setRestoring(true);
    try {
      const result = await api.restoreBackupFromServer(filename);
      toast.success(result.message);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao restaurar backup");
    } finally {
      setRestoring(false);
      setConfirmRestore(null);
    }
  };

  const handleRestoreUpload = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    try {
      const result = await api.restoreBackup(restoreFile);
      toast.success(result.message);
      setRestoreFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao restaurar backup");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <BackupConfigPanel />

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-surface-container-lowest/80 backdrop-blur-sm rounded-xl p-6 border border-outline-variant shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <span className="material-symbols-outlined text-primary">add_circle</span>
            <h3 className="text-headline-sm font-headline-sm text-primary">Criar Backup</h3>
          </div>
          <p className="text-body-sm text-on-surface-variant mb-5">
            Gera um arquivo .tar.gz contendo o banco de dados e todos os arquivos de upload.
          </p>
          <button onClick={handleCreate} disabled={creating}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-lg text-label-md font-label-md hover:shadow-lg transition-all disabled:opacity-50">
            <span className="material-symbols-outlined text-sm">{creating ? "progress_activity" : "backup"}</span>
            {creating ? "Criando..." : "Criar Backup Agora"}
          </button>
        </div>

        <div className="bg-surface-container-lowest/80 backdrop-blur-sm rounded-xl p-6 border border-outline-variant shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <span className="material-symbols-outlined text-secondary">restore_page</span>
            <h3 className="text-headline-sm font-headline-sm text-primary">Restaurar Backup</h3>
          </div>
          <p className="text-body-sm text-on-surface-variant mb-5">
            Selecione um arquivo .tar.gz para restaurar o sistema.
          </p>
          <input ref={fileInputRef} type="file" accept=".tar.gz"
            onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
            className="w-full text-body-sm text-on-surface-variant file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-label-md file:font-label-md file:bg-primary/10 file:text-primary hover:file:bg-primary/20 transition-all mb-4" />
          <button onClick={handleRestoreUpload} disabled={!restoreFile || restoring}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-secondary text-on-secondary rounded-lg text-label-md font-label-md hover:shadow-lg transition-all disabled:opacity-50">
            <span className="material-symbols-outlined text-sm">{restoring ? "progress_activity" : "restore_page"}</span>
            {restoring ? "Restaurando..." : restoreFile ? `Restaurar ${restoreFile.name}` : "Selecione um arquivo"}
          </button>
        </div>
      </div>

      <GDriveInfo />

      <div className="bg-surface-container-lowest/80 backdrop-blur-sm rounded-xl p-6 border border-outline-variant shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">inventory_2</span>
            <h3 className="text-headline-sm font-headline-sm text-primary">Backups no Servidor</h3>
          </div>
          <button onClick={loadBackups} className="flex items-center gap-1 text-label-md text-primary hover:underline">
            <span className="material-symbols-outlined text-sm">refresh</span> Atualizar
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="material-symbols-outlined text-3xl animate-spin text-primary">progress_activity</span>
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl mb-2 block text-outline">backup</span>
            <p>Nenhum backup encontrado no servidor</p>
            <p className="text-body-sm mt-1">Crie um backup para começar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {backups.map((b) => (
              <div key={b.filename} className="flex items-center justify-between p-4 bg-surface rounded-lg border border-outline-variant/30 hover:border-primary/30 transition-all">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="material-symbols-outlined text-outline">folder_zip</span>
                  <div className="min-w-0">
                    <p className="text-label-md font-label-md text-primary truncate">{b.filename}</p>
                    <p className="text-body-sm text-on-surface-variant">{formatSize(b.size_bytes)} &bull; {formatDate(b.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => handleDownload(b.filename)} className="p-2 rounded-lg text-outline hover:text-primary hover:bg-primary/5 transition-all" title="Baixar">
                    <span className="material-symbols-outlined">download</span>
                  </button>
                  <button onClick={() => setConfirmRestore(b.filename)} disabled={restoring} className="p-2 rounded-lg text-outline hover:text-secondary hover:bg-secondary/5 transition-all disabled:opacity-50" title="Restaurar">
                    <span className="material-symbols-outlined">restore_page</span>
                  </button>
                  <button onClick={() => setConfirmDelete(b.filename)} className="p-2 rounded-lg text-outline hover:text-error hover:bg-error/5 transition-all" title="Excluir">
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmDelete !== null}
        title="Excluir Backup"
        message={`Tem certeza que deseja excluir o backup "${confirmDelete}"?`}
        confirmLabel="Excluir" variant="danger"
        onConfirm={() => { if (confirmDelete) handleDelete(confirmDelete); }}
        onCancel={() => setConfirmDelete(null)}
      />
      <ConfirmModal
        open={confirmRestore !== null}
        title="Restaurar Backup"
        message={`Tem certeza que deseja restaurar o backup "${confirmRestore}"? Todos os dados atuais serão substituídos.`}
        confirmLabel="Restaurar" variant="warning"
        onConfirm={() => { if (confirmRestore) handleRestoreFromServer(confirmRestore); }}
        onCancel={() => setConfirmRestore(null)}
      />
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("general");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.listSettings()
      .then((s) => {
        setSettings(s);
        const v: Record<string, string> = {};
        s.forEach((setting) => { v[setting.id] = setting.value ?? ""; });
        setValues(v);
      })
      .catch(() => toast.error("Erro ao carregar configurações"))
      .finally(() => setLoading(false));
  }, []);

  const filteredSettings = settings.filter((s) => s.category === activeCategory);

  const updateValue = (id: string, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const saveSetting = async (setting: SystemSetting) => {
    const value = values[setting.id];
    if (value === setting.value) return;
    setSaving((prev) => ({ ...prev, [setting.id]: true }));
    try {
      await api.updateSetting(setting.id, { value: value || undefined });
      toast.success("Configuração salva!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving((prev) => ({ ...prev, [setting.id]: false }));
    }
  };

  const handleSaveAll = async () => {
    const dirty = settings.filter((s) => values[s.id] !== (s.value ?? ""));
    if (dirty.length === 0) { toast.error("Nenhuma alteração para salvar"); return; }
    for (const s of dirty) {
      await saveSetting(s);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-primary p-2 bg-primary/5 rounded-lg">settings</span>
            <span className="text-primary text-label-md font-label-md uppercase tracking-widest">Dashboard / Administração</span>
          </div>
          <h2 className="text-headline-lg font-headline-lg text-primary">Configurações</h2>
          <p className="text-body-md text-on-surface-variant mt-1">Gerencie as configurações gerais e parâmetros de funcionamento do Diário Oficial.</p>
        </div>
        {activeCategory !== "backup" && (
          <div className="flex gap-3">
            <button className="px-6 py-2.5 rounded-lg border border-outline text-primary text-label-md font-label-md hover:bg-surface-container-low transition-all">
              Descartar Alterações
            </button>
            <button onClick={handleSaveAll}
              className="px-6 py-2.5 rounded-lg bg-primary text-on-primary text-label-md font-label-md hover:shadow-lg transition-all flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">save</span>
              Salvar Configurações
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-3 space-y-4">
          <div className="bg-surface-container-lowest rounded-xl p-3 shadow-sm border border-outline-variant/30">
            <p className="px-4 py-2 text-label-md font-label-md text-outline uppercase tracking-wider mb-2">Categorias</p>
            <nav className="space-y-1">
              {CATEGORIES.map((cat) => (
                <button key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={clsx(
                    "w-full flex items-center justify-between px-4 py-3 rounded-lg text-label-md font-label-md text-left transition-all",
                    activeCategory === cat.key
                      ? "bg-primary-container/10 text-primary"
                      : "text-on-surface-variant hover:bg-surface-container-low"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={clsx("material-symbols-outlined", activeCategory === cat.key ? "text-primary" : "")}
                      style={activeCategory === cat.key ? { fontVariationSettings: "'FILL' 1" } : {}}>
                      {cat.icon}
                    </span>
                    {cat.label}
                  </div>
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="bg-primary rounded-xl p-5 text-on-primary shadow-lg">
            <h4 className="text-label-md font-label-md opacity-80 mb-3">Integridade do Sistema</h4>
            <div className="flex items-center justify-between mb-4">
              <span className="text-body-sm">Banco de Dados</span>
              <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-body-sm">API de Assinatura</span>
              <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </div>
            <div className="h-[2px] w-full bg-on-primary/10 mb-4" />
            <button className="w-full py-2 rounded bg-on-primary text-primary text-label-md font-label-md font-bold hover:bg-on-primary-container transition-colors">
              Ver Relatório Completo
            </button>
          </div>
        </div>

        <div className="col-span-9 space-y-6">
          {activeCategory === "backup" ? (
            <BackupPanel />
          ) : filteredSettings.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl mb-2 block text-outline">settings</span>
              Nenhuma configuração nesta categoria
            </div>
          ) : (
            filteredSettings.map((setting) => {
              const meta = SETTING_LABELS[setting.key];
              const label = meta?.label ?? setting.key;
              const description = meta?.description ?? setting.description;
              const isSecret = setting.is_encrypted;
              const isShow = showSecrets[setting.id];
              const isSaving = saving[setting.id];
              const isDirty = values[setting.id] !== (setting.value ?? "");

              return (
                <div key={setting.id} className="bg-surface-container-lowest/80 backdrop-blur-sm rounded-xl p-8 border border-outline-variant shadow-sm">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h3 className="text-headline-sm font-headline-sm text-primary">{label}</h3>
                      <p className="text-body-sm text-on-surface-variant mt-1">{description}</p>
                    </div>
                    <div className={clsx(
                      "flex items-center gap-2 px-3 py-1 rounded-full",
                      isDirty ? "bg-surface-container-high text-outline" : "bg-secondary-container/30 text-secondary"
                    )}>
                      <span className="material-symbols-outlined text-sm">{isDirty ? "history_edu" : "cloud_done"}</span>
                      <span className="text-label-md font-label-md">{isDirty ? "Alterado" : "Salvo"}</span>
                    </div>
                  </div>
                  <div className="relative">
                    {setting.type === "boolean" ? (
                      <select value={values[setting.id] || "false"}
                        onChange={(e) => updateValue(setting.id, e.target.value)}
                        className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all max-w-xs">
                        <option value="true">Ativado</option>
                        <option value="false">Desativado</option>
                      </select>
                    ) : (
                      <div className="relative">
                        <input type={isSecret && !isShow ? "password" : "text"}
                          value={values[setting.id] ?? ""}
                          onChange={(e) => updateValue(setting.id, e.target.value)}
                          className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all pr-10"
                          placeholder={setting.type === "number" ? "0" : ""} />
                        {isSecret && (
                          <button type="button"
                            onClick={() => setShowSecrets((prev) => ({ ...prev, [setting.id]: !prev[setting.id] }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors">
                            <span className="material-symbols-outlined">{isShow ? "visibility_off" : "visibility"}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {isDirty && (
                    <div className="mt-4 flex justify-end">
                      <button onClick={() => saveSetting(setting)} disabled={isSaving}
                        className="flex items-center gap-2 px-5 py-2 bg-primary text-on-primary rounded-lg text-label-md font-label-md hover:bg-primary-container transition-all disabled:opacity-50">
                        <span className="material-symbols-outlined text-sm">{isSaving ? "progress_activity" : "save"}</span>
                        {isSaving ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <footer className="mt-16 pt-8 border-t border-outline-variant flex flex-col md:flex-row justify-between items-center gap-4 text-on-surface-variant text-body-sm opacity-60">
        <p>© 2026 Diário Oficial. Todos os direitos reservados.</p>
        <div className="flex gap-6">
          <a className="hover:text-primary transition-colors" href="#">Termos de Uso</a>
          <a className="hover:text-primary transition-colors" href="#">Privacidade</a>
          <a className="hover:text-primary transition-colors" href="#">Ajuda</a>
        </div>
      </footer>
    </div>
  );
}
