import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://diario.govsistem.com.br";

  const staticRoutes = [
    { path: "", priority: 1.0 },
    { path: "/edicoes", priority: 0.9 },
    { path: "/buscar", priority: 0.8 },
    { path: "/verificar", priority: 0.7 },
    { path: "/acervo", priority: 0.6 },
    { path: "/sobre", priority: 0.5 },
    { path: "/acessibilidade", priority: 0.4 },
    { path: "/privacidade", priority: 0.4 },
    { path: "/contato", priority: 0.4 },
    { path: "/mapa-do-site", priority: 0.3 },
  ];

  return staticRoutes.map(({ path, priority }) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority,
  }));
}
