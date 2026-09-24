import AdminShell from "@/components/AdminShell";
import RequireRole from "@/components/RequireRole";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminShell>
      <RequireRole roles={["ADMIN", "SUPER_ADMIN"]}>{children}</RequireRole>
    </AdminShell>
  );
}
