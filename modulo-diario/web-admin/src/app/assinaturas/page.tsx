"use client";

import { useEffect, useState } from "react";
import { PenTool, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import api from "@/lib/api";
import { formatDate, statusColor, statusLabel } from "@/lib/utils";

interface Edition {
  id: number;
  title: string;
  number?: string;
  year?: number;
  status: string;
  edition_date: string;
}

interface Signature {
  id: number;
  edition_id: number;
  signed_by_name: string;
  signed_at: string;
  is_valid: boolean;
}

export default function AssinaturasPage() {
  const [editions, setEditions] = useState<Edition[]>([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api<{ data: Edition[] }>("/editions?per_page=100");
      setEditions(res.data || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar edições");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  async function handleSign(editionId: number) {
    setSigning(editionId);
    try {
      await api(`/signatures/${editionId}`, { method: "POST" });
      toast.success("Edição assinada com sucesso");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao assinar edição");
    } finally {
      setSigning(null);
    }
  }

  const columns = [
    {
      key: "edition",
      header: "Edição",
      render: (e: Edition) => (
        <span className="font-medium text-gray-900">
          {e.number ? `Nº ${e.number}` : `#${e.id}`}{e.year ? ` / ${e.year}` : ""} — {e.title}
        </span>
      ),
    },
    {
      key: "edition_date",
      header: "Data",
      render: (e: Edition) => <span>{e.edition_date ? formatDate(e.edition_date) : "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (e: Edition) => (
        <Badge className={statusColor(e.status)}>{statusLabel(e.status)}</Badge>
      ),
    },
    {
      key: "signature",
      header: "Assinatura",
      render: (e: Edition) => {
        if (e.status === "signed") {
          return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
              <CheckCircle className="h-3.5 w-3.5" />
              Assinada
            </span>
          );
        }
        if (e.status === "published" || e.status === "cancelled") {
          return <span className="text-xs text-gray-400">—</span>;
        }
        return (
          <button
            onClick={(ev) => { ev.stopPropagation(); handleSign(e.id); }}
            disabled={signing === e.id}
            className="inline-flex items-center gap-1 rounded-lg border border-primary-200 px-3 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50 transition-colors"
          >
            <PenTool className="h-3.5 w-3.5" />
            {signing === e.id ? "Assinando..." : "Assinar"}
          </button>
        );
      },
      className: "w-36",
    },
  ];

  return (
    <AppLayout title="Assinaturas">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Assinar Edições</h2>
        <p className="mt-1 text-sm text-gray-500">
          Selecione uma edição para realizar a assinatura digital.
        </p>
      </div>

      <Card>
        <Table
          columns={columns}
          data={editions}
          loading={loading}
          emptyMessage="Nenhuma edição disponível para assinatura."
        />
      </Card>
    </AppLayout>
  );
}
