"use client";
import { User, Mail, ShieldCheck, Building2 } from "lucide-react";
import { useAuth } from "@/lib/auth-provider";

export default function ProfilePage() {
  const { ctx } = useAuth();
  const u = ctx?.user;
  const org = ctx?.organization;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Meu perfil</h1>
        <p className="text-sm text-on-surface-variant">Seus dados de acesso no portal do órgão.</p>
      </div>

      <div className="max-w-2xl rounded-xl border bg-surface-container-lowest p-6 shadow-sm">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-xl font-semibold text-white">
          {u?.name?.charAt(0) ?? "?"}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <User size={16} className="text-primary-700" />
            <div>
              <p className="text-xs text-on-surface-variant">Nome</p>
              <p className="font-medium text-on-surface">{u?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-primary-700" />
            <div>
              <p className="text-xs text-on-surface-variant">E-mail</p>
              <p className="font-medium text-on-surface">{u?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary-700" />
            <div>
              <p className="text-xs text-on-surface-variant">Perfil</p>
              <p className="font-medium text-on-surface">{u?.profile === "ORG_ADMIN" ? "Gestor" : "Usuário"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-primary-700" />
            <div>
              <p className="text-xs text-on-surface-variant">Órgão</p>
              <p className="font-medium text-on-surface">{org?.name}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
