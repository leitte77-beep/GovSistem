"use client";

import { useEffect, useState } from "react";
import { FileText, CheckCircle, BookOpen, Globe } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import api from "@/lib/api";

interface StatCard {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

interface Edition {
  id: number;
  title: string;
  status: string;
  edition_date: string;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatCard[]>([]);
  const [recentEditions, setRecentEditions] = useState<Edition[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [mattersRes, editionsRes] = await Promise.all([
          api<{ data: { status: string }[] }>("/matters?per_page=100"),
          api<{ data: Edition[] }>("/editions?per_page=5"),
        ]);

        const matters = mattersRes.data || [];
        const draftCount = matters.filter((m) => m.status === "draft").length;
        const approvedCount = matters.filter((m) => m.status === "approved").length;

        const editions = editionsRes.data || [];
        const publishedEditions = editions.filter((e) => e.status === "published").length;

        setStats([
          { label: "Rascunhos", value: draftCount, icon: <FileText className="h-6 w-6" />, color: "bg-gray-100 text-gray-700" },
          { label: "Aprovadas", value: approvedCount, icon: <CheckCircle className="h-6 w-6" />, color: "bg-blue-100 text-blue-700" },
          { label: "Total Edições", value: editions.length, icon: <BookOpen className="h-6 w-6" />, color: "bg-purple-100 text-purple-700" },
          { label: "Publicadas", value: publishedEditions, icon: <Globe className="h-6 w-6" />, color: "bg-green-100 text-green-700" },
        ]);

        setRecentEditions(editions.slice(0, 5));
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <AppLayout title="Dashboard">
        <PageSpinner />
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Dashboard">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <div className={`rounded-lg p-3 ${stat.color}`}>{stat.icon}</div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Edições Recentes</h2>
        <Card>
          {recentEditions.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-400">
              Nenhuma edição encontrada.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentEditions.map((edition) => (
                <div key={edition.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="font-medium text-gray-900">{edition.title}</p>
                    <p className="text-sm text-gray-500">
                      {edition.edition_date ? new Date(edition.edition_date).toLocaleDateString("pt-BR") : "Sem data"}
                    </p>
                  </div>
                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                    {edition.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
