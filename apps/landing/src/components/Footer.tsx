import Link from "next/link";
import Icon from "@/components/Icon";

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.govsistem.com.br";

const FOOTER_LINKS = [
  { href: "#solucoes", label: "Soluções" },
  { href: "#chatgov", label: "ChatGov" },
  { href: "#diario", label: "Diário Oficial" },
  { href: "#faq", label: "Dúvidas Frequentes" },
];

export default function Footer() {
  return (
    <footer className="bg-primary-900 text-white">
      <div className="max-w-container-max mx-auto px-gutter py-stack-lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-accent-500 rounded-lg flex items-center justify-center">
                <Icon name="account_balance" className="text-white text-[20px]" />
              </div>
              <span className="font-bold text-lg tracking-tight">GovSistem</span>
            </div>
            <p className="text-sm text-white/60 leading-relaxed">
              Tecnologia e inovação para transformar a gestão pública. Simplificamos processos e conectamos governo ao cidadão.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-sm uppercase tracking-wider mb-4 text-white/80">Navegação</h4>
            <nav className="flex flex-col gap-2.5" aria-label="Rodapé">
              {FOOTER_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-white/60 hover:text-white transition-colors w-fit"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <h4 className="font-semibold text-sm uppercase tracking-wider mb-4 text-white/80">Contato</h4>
            <div className="flex flex-col gap-3">
              <a href="mailto:contato@govsistem.com.br" className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors w-fit">
                <Icon name="mail" className="text-[18px]" />
                contato@govsistem.com.br
              </a>
              <a href={`${ADMIN_URL}/login`} className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors w-fit">
                <Icon name="login" className="text-[18px]" />
                Acessar Plataforma
              </a>
            </div>
          </div>
        </div>

        <div className="section-divider" />

        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mt-8">
          <p className="text-sm text-white/40">
            &copy; {new Date().getFullYear()} GovSistem. Todos os direitos reservados.
          </p>
          <div className="flex gap-6">
            <Link href="/termos" className="text-sm text-white/40 hover:text-white/70 transition-colors">Termos de Uso</Link>
            <Link href="/privacidade" className="text-sm text-white/40 hover:text-white/70 transition-colors">Privacidade</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
