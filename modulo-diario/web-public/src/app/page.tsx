import { api, EditionSummary } from "@/lib/api";
import HomeClient from "./HomeClient";

export const revalidate = 300; // ISR every 5 minutes

export const metadata = {
  title: "Diário Oficial Eletrônico | Página Inicial",
  description: "Consulte edições, busque matérias e verifique a autenticidade dos documentos oficiais.",
};

async function getInitialEditions(): Promise<EditionSummary[]> {
  try {
    const res = await api.listEditions({ page_size: 6 });
    return res.data || [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const editions = await getInitialEditions();

  return <HomeClient initialEditions={editions} />;
}
