import { redirect } from "next/navigation";

export default async function MatterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/matters/${id}/edit`);
}
