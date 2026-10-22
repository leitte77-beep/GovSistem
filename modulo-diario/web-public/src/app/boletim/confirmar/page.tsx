import { Suspense } from "react";
import type { Metadata } from "next";
import NewsletterTokenAction from "@/components/NewsletterTokenAction";

export const metadata: Metadata = { title: "Boletim | Diário Oficial Eletrônico", robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <NewsletterTokenAction action="confirm" />
    </Suspense>
  );
}
