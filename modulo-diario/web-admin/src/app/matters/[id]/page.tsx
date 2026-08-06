import { redirect } from "next/navigation";

export default function MatterDetailPage({ params }: { params: { id: string } }) {
  redirect(`/matters/${params.id}/edit`);
}
