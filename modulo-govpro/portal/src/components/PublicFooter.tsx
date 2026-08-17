export default function PublicFooter() {
  return (
    <footer className="bg-surface border-t border-outline-variant mt-stack-lg">
      <div className="max-w-container-max mx-auto px-gutter py-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-on-surface-variant text-[20px]" aria-hidden="true">
            account_balance
          </span>
          <span className="text-body-sm text-on-surface-variant">
            © {new Date().getFullYear()} Processo Eletrônico · Portal do Cidadão
          </span>
        </div>
        <div className="text-body-sm text-on-surface-variant">
          Lei 9.784/1999 · Lei de Acesso à Informação (12.527/2011)
        </div>
      </div>
    </footer>
  );
}
