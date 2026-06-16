"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Menu, X } from "lucide-react";

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

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

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
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside
          className={`w-64 bg-white border-r border-[#E4E7EC] flex-shrink-0 flex-col fixed lg:static inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:transform-none ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          <div className="p-6 border-b border-[#E4E7EC] flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-[#101828]">GovOuve</h1>
              <p className="text-meta text-[#98A2B3]">Avaliacao & Ouvidoria</p>
            </div>
            <button
              className="lg:hidden p-1 rounded-btn hover:bg-[#F6F7F9]"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5 text-[#475467]" />
            </button>
          </div>
          <nav className="flex-1 p-4 space-y-1">
            <Link
              href="/"
              className="flex items-center gap-3 px-3 py-2 rounded-btn text-body-sm text-[#475467] hover:bg-[#F6F7F9] hover:text-[#1D4ED8] transition-colors"
            >
              Inicio
            </Link>
            <Link
              href="/secretarias"
              className="flex items-center gap-3 px-3 py-2 rounded-btn text-body-sm text-[#475467] hover:bg-[#F6F7F9] hover:text-[#1D4ED8] transition-colors"
            >
              Secretarias
            </Link>
          </nav>
          <div className="p-4 border-t border-[#E4E7EC]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#1D4ED8] flex items-center justify-center text-white text-sm font-medium">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body-sm font-medium text-[#101828] truncate">{user.name}</p>
                <p className="text-meta text-[#98A2B3] truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="mt-3 w-full text-left text-body-sm text-[#98A2B3] hover:text-[#B42318] transition-colors"
            >
              Sair
            </button>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <header className="bg-white border-b border-[#E4E7EC] px-4 lg:px-8 py-4 flex items-center gap-4">
            {/* Mobile hamburger */}
            <button
              className="lg:hidden p-1 rounded-btn hover:bg-[#F6F7F9]"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5 text-[#475467]" />
            </button>
            <h2 className="text-body font-medium text-[#101828]">Painel de Controle</h2>
          </header>
          <main className="p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
