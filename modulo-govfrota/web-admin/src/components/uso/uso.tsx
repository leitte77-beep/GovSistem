import type { UsoVeiculo } from "@/lib/api";

export function medicaoUso(v: number | null, horimetro: boolean) {
  if (v == null) return "—";
  return horimetro
    ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`
    : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km`;
}

export function duracaoUso(min: number) {
  const h = Math.floor(min / 60);
  return h ? `${h} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`;
}

export function dataHora(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export function BadgeStatusUso({ u }: { u: Pick<UsoVeiculo, "status" | "atrasado"> }) {
  const [rotulo, cls] =
    u.status === "EM_USO"
      ? u.atrasado ? ["Em uso há mais de 8 h", "bg-red-50 text-[#B42318]"] : ["Em uso", "bg-blue-50 text-[#1D4ED8]"]
      : u.status === "ENCERRADO_GESTOR" ? ["Encerrado pela gestão", "bg-amber-50 text-[#B54708]"] : ["Concluído", "bg-green-50 text-[#067647]"];
  return <span className={`rounded-pill px-2 py-0.5 text-meta font-medium ${cls}`}>{rotulo}</span>;
}
