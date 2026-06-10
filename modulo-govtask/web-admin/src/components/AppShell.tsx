"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/ui/Sidebar";
import { Topbar } from "@/components/ui/Topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      router.push("/login");
    }
  }, [loading, user, pathname, router]);

  if (pathname === "/login") return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#1D4ED8] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <Sidebar
        user={user}
        pathname={pathname}
        onLogout={logout}
        open={sidebarOpen}
        onClose={(open) => setSidebarOpen(open ?? false)}
      />
      <div className="min-h-screen lg:ml-64">
        <Topbar user={user} />
        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}
