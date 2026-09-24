import { redirect } from "next/navigation";

/** O acompanhamento virou o painel do Prefeito; o endereço antigo continua valendo. */
export default function AcompanhamentoPage() {
  redirect("/painel");
}
