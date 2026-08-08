import React from 'react';
import { ArrowLeft, FileCheck2, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';

export function iniciais(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function Brand({ compact = false }) {
  return (
    <div className={`pd-brand ${compact ? 'pd-brand--compact' : ''}`}>
      <span className="pd-brand__mark" aria-hidden="true">
        <FileCheck2 size={compact ? 21 : 25} strokeWidth={2.15} />
      </span>
      <span>
        <strong>Protocolo Digital</strong>
        {!compact && <small>Portal do Cidadão</small>}
      </span>
    </div>
  );
}

export function PortalHeader({ navigate, back = false, backTo = '', backLabel = 'Voltar ao início', conta, onSair }) {
  return (
    <header className="pd-header">
      <div className="pd-header__inner">
        {back ? (
          <button className="pd-back" type="button" onClick={() => navigate(backTo)}>
            <ArrowLeft size={18} />
            <span>{backLabel}</span>
          </button>
        ) : <Brand compact />}
        {conta ? (
          <div className="pd-account-chip">
            <span className="pd-avatar" aria-hidden="true">{iniciais(conta.nome)}</span>
            <span className="pd-account-chip__id">
              <strong>{conta.nome || 'Minha conta'}</strong>
              <small>{conta.email}</small>
            </span>
            {onSair && (
              <button type="button" className="pd-signout" onClick={onSair} title="Sair da conta">
                <LogOut size={16} />
                <span>Sair</span>
              </button>
            )}
          </div>
        ) : (
          <div className="pd-header__trust">
            <ShieldCheck size={16} />
            <span>Ambiente oficial e seguro</span>
          </div>
        )}
      </div>
    </header>
  );
}

export function SecurityNote({ children = 'Seus dados são protegidos e usados somente para o atendimento.' }) {
  return (
    <div className="pd-security-note">
      <LockKeyhole size={16} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function PortalFooter({ navigate }) {
  return (
    <footer className="pd-footer">
      <span>© 2026 Protocolo Digital</span>
      <nav aria-label="Links institucionais">
        <button type="button" onClick={() => navigate('privacidade')}>Privacidade</button>
        <span aria-hidden="true">•</span>
        <a href="mailto:atendimento@govsistem.com.br">Contato</a>
      </nav>
    </footer>
  );
}
