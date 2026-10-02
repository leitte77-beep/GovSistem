"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { temSessao } from "@/lib/sessaoMotorista";

/**
 * Sem sessão no celular, vai direto ao login — sem mostrar a tela por um
 * instante e só depois ser expulso pela resposta 401 do servidor.
 */
export function ExigeSessao({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const caminho = usePathname() ?? "";
  const livre = caminho.startsWith("/motorista/login");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (livre || temSessao()) setOk(true);
    else {
      setOk(false);
      router.replace("/motorista/login");
    }
  }, [livre, caminho, router]);

  return ok || livre ? <>{children}</> : null;
}
