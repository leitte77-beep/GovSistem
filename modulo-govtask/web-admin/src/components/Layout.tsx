"use client";

import { useAuth } from "@/lib/auth";
import Sidebar from "./Sidebar";
import LoginPage from "@/app/login/page";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="h-screen overflow-hidden lg:flex">
      <Sidebar />
      <main className="h-screen flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
    </div>
  );
}
