import { NavLink } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { MENU } from "./menu";
import { useSessao } from "@/nucleo/auth/SessaoProvider";

export function Sidebar() {
  const { permissoes } = useSessao();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
        <div className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white">
          <ShoppingCart className="size-5" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight text-slate-900">GovCompras</p>
          <p className="text-[11px] leading-tight text-slate-500">Compras, Licitações e Contratos</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {MENU.map((grupo) => {
          const itensVisiveis = grupo.itens.filter((item) => !item.permissao || permissoes.has(item.permissao));
          if (itensVisiveis.length === 0) return null;
          return (
            <div key={grupo.titulo}>
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {grupo.titulo}
              </p>
              <div className="space-y-0.5">
                {itensVisiveis.map((item) => (
                  <NavLink
                    key={item.para}
                    to={item.para}
                    end={item.para === "/"}
                    className={({ isActive }) =>
                      `block rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                        isActive
                          ? "bg-brand-50 font-medium text-brand-700"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`
                    }
                  >
                    {item.rotulo}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
