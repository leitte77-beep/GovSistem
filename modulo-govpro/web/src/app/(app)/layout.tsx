import AdminShell from "@/components/AdminShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
