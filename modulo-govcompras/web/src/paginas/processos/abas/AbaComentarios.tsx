import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Send } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import { usePermissao } from "@/nucleo/auth/usePermissao";
import { EstadoVazio, Textarea, Botao } from "@/ui";

interface Comentario {
  id: string;
  autor_nome: string | null;
  conteudo: string;
  created_at: string;
}

export function AbaComentarios({ processoId }: { processoId: string }) {
  const queryClient = useQueryClient();
  const podeComentar = usePermissao("govcompras.comentarios.criar");
  const [texto, setTexto] = useState("");

  const { data } = useQuery({
    queryKey: ["comentarios", "processo", processoId],
    queryFn: () => api.get<Comentario[]>("/comentarios", { entidade_tipo: "processo", entidade_id: processoId }),
  });

  const enviar = useMutation({
    mutationFn: () => api.post("/comentarios", { conteudo: texto }, { entidade_tipo: "processo", entidade_id: processoId }),
    onSuccess: () => {
      setTexto("");
      queryClient.invalidateQueries({ queryKey: ["comentarios", "processo", processoId] });
    },
    onError: () => toast.error("Não foi possível publicar o comentário."),
  });

  return (
    <div className="space-y-3">
      {!data?.length ? (
        <EstadoVazio titulo="Nenhum comentário ainda" descricao="Use @nome para mencionar alguém no comentário." />
      ) : (
        <ul className="space-y-3">
          {data.map((c) => (
            <li key={c.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">{c.autor_nome ?? "Usuário"}</p>
                <p className="text-[11px] text-slate-400">{new Date(c.created_at).toLocaleString("pt-BR")}</p>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{c.conteudo}</p>
            </li>
          ))}
        </ul>
      )}

      {podeComentar && (
        <div className="flex items-start gap-2">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva um comentário… use @nome para mencionar"
            className="min-h-16"
          />
          <Botao tamanho="sm" icone={<Send className="size-3.5" />} onClick={() => enviar.mutate()} carregando={enviar.isPending} disabled={!texto.trim()}>
            Enviar
          </Botao>
        </div>
      )}
    </div>
  );
}
