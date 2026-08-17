import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import "./index.css";
import { App } from "./App";
import { SessaoProvider } from "@/nucleo/auth/SessaoProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <SessaoProvider>
          <App />
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        </SessaoProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
