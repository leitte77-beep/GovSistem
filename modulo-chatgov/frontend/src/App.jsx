import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';
import { ChatGov } from './ChatGov';
import { T } from './theme';

function LoginScreen() {
  return React.createElement('div', {
    style: {
      width: '100%',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: T.bg,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      gap: 24,
      overflowX: 'hidden',
    },
  },
    React.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 },
    },
      React.createElement('div', {
        style: { width: 76, height: 76, borderRadius: 22, background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(37,99,235,0.4)' },
      }, React.createElement(ShieldCheck, { size: 40, color: '#fff' })),
      React.createElement('h1', {
        style: { fontSize: 30, fontWeight: 800, color: T.text, letterSpacing: -0.5 },
      }, 'ChatGov'),
      React.createElement('p', {
        style: { fontSize: 14, color: T.textSecondary },
      }, 'Atendimento e comunica\u00e7\u00e3o para o setor p\u00fablico'),
    ),
    React.createElement('div', {
      style: {
        background: T.surface,
        padding: 32,
        borderRadius: 16,
        width: 'min(360px, calc(100vw - 32px))',
        textAlign: 'center',
        boxShadow: '0 12px 40px rgba(16,26,42,0.10)',
        border: `1px solid ${T.border}`,
      },
    },
      React.createElement('p', {
        style: { fontSize: 14, color: T.textSecondary, margin: 0 },
      }, 'Acesse o ChatGov atrav\u00e9s do painel GovSistem.'),
      React.createElement('p', {
        style: { fontSize: 12, color: T.textMuted, marginTop: 8 },
      }, 'Fa\u00e7a login na plataforma e abra o m\u00f3dulo ChatGov.'),
    ),
  );
}

function AuthenticatedApp() {
  const { auth } = useAuth();

  if (!auth) {
    return React.createElement(LoginScreen);
  }

  return React.createElement(SocketProvider, null,
    React.createElement(ChatGov),
  );
}

export function App() {
  return React.createElement('div', { 'data-build': '2.0.0-imp', style: { height: '100%', display: 'flex', flex: 1, minWidth: 0, overflow: 'hidden' } },
    React.createElement(ThemeProvider, null,
      React.createElement(AuthProvider, null,
        React.createElement(AuthenticatedApp),
      ),
    ),
  );
}
