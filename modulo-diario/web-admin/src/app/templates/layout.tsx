import AdminShell from "@/components/AdminShell";

export default function TemplatesLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
