import { NavLink } from "react-router-dom";
import { usePermissoes } from "@/nucleo/permissoes/usePermissao";
import { ROTA_DO_ITEM, type ItemMenu } from "@/nucleo/permissoes/matrizPapeis";
import { textos } from "@/i18n/textos";

/**
 * Sidebar Premium (§3) com ícones Material Symbols, seções agrupadas
 * (Geral, Programas, Relatórios) e indicador de suporte ao final.
 */

type IconKey =
  | "home"
  | "group"
  | "assignment"
  | "event_note"
  | "payments"
  | "diversity_3"
  | "send"
  | "analytics"
  | "visibility"
  | "insights"
  | "hospital"
  | "search"
  | "package"
  | "settings"
  | "apartment"
  | "account_balance"
  | "monitor"
  | "face";

const ICONES_MATERIAL: Record<ItemMenu, IconKey> = {
  inicio: "home",
  familias: "group",
  atendimentos: "assignment",
  agenda: "event_note",
  beneficios: "payments",
  grupos: "diversity_3",
  encaminhamentos: "send",
  rma: "analytics",
  vigilancia: "visibility",
  vigilanciaAvancada: "insights",
  buscaAtiva: "search",
  estoque: "package",
  administracao: "settings",
  habitacao: "apartment",
  financeiro: "account_balance",
  monitoramento: "monitor",
  biometria: "face",
};

const SECAO_GERAL: ItemMenu[] = ["inicio", "familias", "atendimentos", "agenda"];
const SECAO_PROGRAMAS: ItemMenu[] = ["beneficios", "grupos", "encaminhamentos", "estoque", "habitacao", "financeiro"];
const SECAO_RELATORIOS: ItemMenu[] = ["rma", "vigilancia", "vigilanciaAvancada", "buscaAtiva"];
const SECAO_MONITORAMENTO: ItemMenu[] = ["monitoramento"];
const SECAO_ADMIN: ItemMenu[] = ["administracao", "biometria"];

interface SecaoInfo {
  titulo: string;
  itens: ItemMenu[];
}

function IconeMaterial({ nome, preenchido, className }: { nome: IconKey; preenchido?: boolean; className?: string }) {
  return (
    <span
      className={`material-symbols-outlined !text-[22px] ${className ?? ""}`}
      style={{ fontVariationSettings: `'FILL' ${preenchido ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24` }}
      aria-hidden="true"
    >
      {nome}
    </span>
  );
}

export function Sidebar() {
  const { itensMenu } = usePermissoes();
  const secaoVisivel = (itens: ItemMenu[]) => itens.filter((i) => itensMenu.has(i));

  const secoes: (SecaoInfo | null)[] = [
    { titulo: "Geral", itens: secaoVisivel(SECAO_GERAL) },
    { titulo: "Programas", itens: secaoVisivel(SECAO_PROGRAMAS) },
    { titulo: "Relatórios", itens: secaoVisivel(SECAO_RELATORIOS) },
    { titulo: "Monitoramento", itens: secaoVisivel(SECAO_MONITORAMENTO) },
    { titulo: "Configuração", itens: secaoVisivel(SECAO_ADMIN) },
  ].filter((s) => s && s.itens.length > 0);

  const precisaSeparador = (idx: number) => idx > 0 && secoes[idx - 1] && (secoes[idx - 1] as SecaoInfo).itens.length > 0;

  return (
    <aside className="nao-imprimir fixed left-0 top-0 h-full w-[260px] bg-white border-r border-surface-container-highest/30 flex flex-col z-50">
      <div className="px-md py-lg mb-sm flex items-center gap-sm">
        <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center shadow-lg shadow-primary/20">
          <span
            className="material-symbols-outlined text-on-primary !text-[24px]"
            style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
          >
            diversity_1
          </span>
        </div>
        <div>
          <h1 className="font-titulo text-headline-lg-mobile font-bold tracking-tight text-ink">
            {textos.produto}
          </h1>
          <p className="text-[10px] text-outline uppercase tracking-widest font-bold">
            {textos.modulo}
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto space-y-1 px-sm">
        {secoes.map((s, idx) => {
          if (!s) return null;
          return (
            <div key={s.titulo}>
              {precisaSeparador(idx) && <div className="pt-4" />}
              <p className="px-md pb-2 pt-2 text-[11px] font-bold text-outline/60 uppercase tracking-widest">
                {s.titulo}
              </p>
              {s.itens.map((item) => {
                const iconKey = ICONES_MATERIAL[item];
                return (
                  <NavLink
                    key={item}
                    to={ROTA_DO_ITEM[item].rota}
                    className={({ isActive }) =>
                      [
                        "flex items-center gap-md px-md py-3 rounded-xl transition-all group",
                        isActive
                          ? "sidebar-active font-semibold"
                          : "text-secondary hover:bg-surface-container-low",
                      ].join(" ")
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <IconeMaterial nome={iconKey} preenchido={isActive} />
                        <span className="font-label-md text-label-md">{textos.nav[item]}</span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
