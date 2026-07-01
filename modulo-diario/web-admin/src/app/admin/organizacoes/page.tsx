"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";

export default function AdminOrganizacoesPage() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listOrganizations().then(setOrgs).catch((err) => notifyError("AdminOrgs", err)).finally(() => setLoading(false));
  }, []);

  return (
    <AdminShell>
      <div className="p-6">
        <h1 className="text-headline-md font-headline-md text-primary mb-6">Organizações</h1>
        {loading ? (
          <p className="text-on-surface-variant">Carregando...</p>
        ) : (
          <div className="grid gap-4">
            {orgs.map((org) => (
              <div key={org.id} className="bg-surface-container-lowest border border-outline-variant rounded-lg p-4">
                <h3 className="text-label-lg font-medium text-primary">{org.name}</h3>
                <p className="text-body-sm text-on-surface-variant">Slug: {org.slug}</p>
                <span className={`inline-block mt-2 px-2 py-0.5 text-[10px] font-bold rounded ${
                  org.is_active ? "bg-success-container text-on-success-container" : "bg-error-container text-on-error-container"
                }`}>
                  {org.is_active ? "Ativa" : "Inativa"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
