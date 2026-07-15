import { ShieldOff } from "lucide-react";
import { textos } from "@/i18n/textos";

/**
 * Página/estado institucional de "sem acesso" (§1.1) — sem revelar o que
 * existe do outro lado. Usada pelo guard de rota e por áreas restritas.
 */
export function EstadoSemPermissao({
  mensagem,
  acao,
}: {
  mensagem?: string;
  acao?: { rotulo: string; href: string };
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <ShieldOff className="h-10 w-10 text-ink-soft" aria-hidden />
      <h1 className="text-lg">{textos.estados.semPermissaoTitulo}</h1>
      <p className="max-w-md text-sm text-ink-soft">
        {mensagem ?? textos.estados.semPermissaoDescricao}
      </p>
      {acao ? (
        <a
          href={acao.href}
          className="mt-2 rounded bg-[color:var(--ga-brand-bar)] px-4 py-2 text-sm font-medium text-[color:var(--ga-brand-bar-ink)] focus-visible:outline-focus"
        >
          {acao.rotulo}
        </a>
      ) : null}
    </div>
  );
}
