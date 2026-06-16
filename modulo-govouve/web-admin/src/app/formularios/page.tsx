"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { ClipboardList } from "lucide-react";

export default function FormulariosPage() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 text-[#101828]">Formularios</h1>
        <p className="text-body-sm text-[#667085] mt-1">
          Gerencie os formularios de avaliacao e manifestacao
        </p>
      </div>
      <div className="bg-white rounded-card shadow-card p-12 text-center">
        <ClipboardList className="w-12 h-12 text-[#98A2B3] mx-auto mb-4" />
        <p className="text-body text-[#98A2B3]">Modulo de formularios em desenvolvimento</p>
        <Link href="/" className="btn-primary mt-4 inline-flex">Voltar ao inicio</Link>
      </div>
    </div>
  );
}
