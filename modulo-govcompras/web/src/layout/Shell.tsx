import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Cabecalho } from "./Cabecalho";

export function Shell() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Cabecalho />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
