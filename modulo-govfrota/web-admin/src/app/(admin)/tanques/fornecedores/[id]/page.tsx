import { redirect } from "next/navigation";

/** Endereço antigo da ficha do fornecedor — agora em /fornecedores/[id]. */
export default function FornecedorEnderecoAntigo({ params }: { params: { id: string } }) {
  redirect(`/fornecedores/${params.id}`);
}
