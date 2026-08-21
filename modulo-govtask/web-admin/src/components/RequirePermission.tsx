"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { homeDoPerfil, perfilDoUsuario } from "@/lib/perfil";

/**
 * Guarda de rota no cliente. Não substitui a autorização do backend — serve
 * para não levar o usuário a uma tela que ele não pode operar e só descobriria
 * isso ao receber um erro no meio do caminho.
 */
export function RequirePermission({
  anyOf,
  children,
}: {
  anyOf: string[];
  children: React.ReactNode;
}) {
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin w-8 h-8 border-2 border-[#1D4ED8] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || !hasPermission(...anyOf)) {
    const destino = homeDoPerfil(perfilDoUsuario(user?.permissions ?? []));
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <div className="w-12 h-12 rounded-full bg-[#B54708]/10 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-6 h-6 text-[#B54708]" />
        </div>
        <h2 className="text-[17px] font-semibold text-[#101828]">
          Esta área não faz parte do seu perfil
        </h2>
        <p className="text-[14px] text-[#475467] mt-2">
          O acesso é definido pelas permissões do seu cargo. Se precisar trabalhar aqui,
          peça ao administrador para incluir a permissão correspondente.
        </p>
        <Link
          href={destino}
          className="inline-flex items-center gap-2 mt-6 px-4 py-2.5 rounded-lg bg-[#1D4ED8] text-white text-[14px] font-medium hover:bg-[#1E40AF] transition-colors"
        >
          Voltar ao meu painel
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
