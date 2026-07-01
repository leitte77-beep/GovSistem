"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import Icon from "@/components/Icon";

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.govsistem.com.br";

const NAV_LINKS = [
  { href: "#solucoes", label: "Soluções", id: "solucoes" },
  { href: "#chatgov", label: "ChatGov", id: "chatgov" },
  { href: "#diario", label: "Diário Oficial", id: "diario" },
  { href: "#faq", label: "Dúvidas", id: "faq" },
  { href: "#contato", label: "Contato", id: "contato" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scrollspy: highlight the nav item for the section currently in view.
  useEffect(() => {
    const sections = NAV_LINKS.map((l) => document.getElementById(l.id)).filter(
      (el): el is HTMLElement => Boolean(el)
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const linkClass = (id: string) => {
    const isActive = active === id;
    if (scrolled) {
      return isActive
        ? "text-primary-600 font-semibold"
        : "text-on-surface-variant hover:text-primary-600";
    }
    return isActive ? "text-white font-semibold" : "text-white/80 hover:text-white";
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "glass shadow-lg border-b border-white/20"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-container-max mx-auto px-gutter flex items-center justify-between h-18">
        <Link href="/" className="flex items-center gap-2.5 group" aria-label="GovSistem — página inicial">
          <div className="w-9 h-9 bg-gradient-to-br from-primary-600 to-accent-600 rounded-lg flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
            <Icon name="account_balance" className="text-white text-[20px]" />
          </div>
          <span className={`font-bold text-lg tracking-tight transition-colors ${scrolled ? "text-primary-900" : "text-white"}`}>
            GovSistem
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8" aria-label="Navegação principal">
          {NAV_LINKS.map((link) => (
            <a
              key={link.id}
              href={link.href}
              aria-current={active === link.id ? "true" : undefined}
              className={`relative text-sm font-medium transition-colors ${linkClass(link.id)}`}
            >
              {link.label}
              <span
                className={`absolute -bottom-1.5 left-0 h-0.5 rounded-full bg-current transition-all duration-300 ${
                  active === link.id ? "w-full opacity-100" : "w-0 opacity-0"
                }`}
              />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={`${ADMIN_URL}/login`}
            className={`hidden md:flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ${
              scrolled
                ? "bg-primary-600 text-white hover:bg-primary-700 shadow-md hover:shadow-lg"
                : "bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm border border-white/20"
            }`}
          >
            <Icon name="login" className="text-[18px]" />
            Entrar
          </a>

          <button
            className="md:hidden p-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
          >
            <Icon name={mobileOpen ? "close" : "menu"} className={`text-2xl ${scrolled ? "text-on-surface" : "text-white"}`} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div id="mobile-menu" className="md:hidden glass border-t border-white/20 animate-fade-in-down">
          <div className="px-gutter py-4 flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.id}
                href={link.href}
                className="text-sm font-medium text-on-surface py-2"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <a
              href={`${ADMIN_URL}/login`}
              className="flex items-center justify-center gap-2 bg-primary-600 text-white px-5 py-3 rounded-full text-sm font-semibold hover:bg-primary-700 transition-colors mt-2"
            >
              <Icon name="login" className="text-[18px]" />
              Entrar na Plataforma
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
