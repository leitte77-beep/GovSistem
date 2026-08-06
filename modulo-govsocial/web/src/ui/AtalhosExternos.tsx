import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { http } from "@/nucleo/http/clienteHttp";

interface AtalhoExterno {
  id: string;
  label: string;
  url: string;
  icon: string | null;
  ordem: number;
  is_active: boolean;
  description: string | null;
}

export function AtalhosExternos() {
  const { data } = useQuery<AtalhoExterno[]>({
    queryKey: ["external-shortcuts"],
    queryFn: async () => {
      const resp = await http.get<AtalhoExterno[]>("/shortcuts");
      return resp;
    },
    staleTime: 5 * 60_000,
  });

  if (!data || data.length === 0) return null;

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Atalhos externos">
      {data.map((atalho) => (
        <a
          key={atalho.id}
          href={atalho.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm hover:border-primary focus-visible:outline-focus"
          title={atalho.description ?? atalho.label}
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          {atalho.label}
        </a>
      ))}
    </nav>
  );
}
