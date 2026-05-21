import AdminShell from "@/components/AdminShell";

export default function MattersLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
