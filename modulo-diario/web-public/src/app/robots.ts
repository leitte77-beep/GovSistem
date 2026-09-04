import type { MetadataRoute } from "next";

import { getRequestOrigin } from "@/lib/server/edition-loader";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await getRequestOrigin();
  const baseUrl = origin || "https://diario.govsistem.com.br";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/api", "/verificar/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
