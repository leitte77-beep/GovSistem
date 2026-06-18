import Link from "next/link";

const currentYear = new Date().getFullYear();

const FOOTER_LINKS = [
  { href: "/sobre", label: "Sobre o Portal" },
  { href: "/privacidade", label: "Privacidade" },
  { href: "/acessibilidade", label: "Acessibilidade" },
  { href: "/mapa-do-site", label: "Mapa do Site" },
  { href: "/contato", label: "Contato" },
];

export default function Footer() {
  return (
    <footer className="bg-surface-container-lowest border-t border-outline-variant">
      <div className="flex flex-col md:flex-row justify-between items-center w-full px-gutter py-stack-lg max-w-container-max mx-auto">
        <div className="flex flex-col md:flex-row items-center gap-8 mb-6 md:mb-0">
          <span className="text-headline-sm font-headline-sm font-bold text-primary">
            Diário Oficial
          </span>
          <nav className="flex flex-wrap justify-center gap-6">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-label-md font-label-md text-on-surface-variant hover:text-primary underline"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="text-center md:text-right">
          <p className="text-body-sm font-body-sm text-on-surface-variant">
            © {currentYear} Diário Oficial do Município de Farol. Todos os direitos reservados.
          </p>
          <div className="flex gap-4 mt-2 justify-center md:justify-end">
            <a
              href="/"
              className="text-on-surface-variant hover:text-primary"
              aria-label="Website"
            >
              <span className="material-symbols-outlined">public</span>
            </a>
            <a
              href="/contato"
              className="text-on-surface-variant hover:text-primary"
              aria-label="Email"
            >
              <span className="material-symbols-outlined">mail</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
