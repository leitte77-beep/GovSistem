import React, { useState } from 'react';
import { T } from './theme.js';
import { Home } from './pages/Home.jsx';
import { ConsultaProtocolo } from './pages/ConsultaProtocolo.jsx';
import { MeusProtocolos } from './pages/MeusProtocolos.jsx';
import { NovaSolicitacao } from './pages/NovaSolicitacao.jsx';
import { CriarConta } from './pages/CriarConta.jsx';
import { Privacidade } from './pages/Privacidade.jsx';
import { LogadoProvider } from './pages/LogadoContext.jsx';

const globalStyle = {
  fontFamily: T.font, color: T.text, background: T.bg, minHeight: '100vh',
  margin: 0, padding: 0,
};

function useHashRouter() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '');
  React.useEffect(() => {
    const fn = () => setHash(window.location.hash.slice(1));
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  const navigate = (h) => { window.location.hash = h; };
  return { page: hash, navigate };
}

export function App() {
  const { page, navigate } = useHashRouter();

  const body = (() => {
    if (page.startsWith('protocolo/')) {
      return React.createElement(ConsultaProtocolo, { navigate });
    }
    if (page === 'meus-protocolos') return React.createElement(MeusProtocolos, { navigate });
    if (page === 'nova-solicitacao') return React.createElement(NovaSolicitacao, { navigate });
    if (page === 'servico/') return React.createElement(NovaSolicitacao, { navigate, servicoId: page.split('/')[1] });
    if (page === 'criar-conta') return React.createElement(CriarConta, { navigate });
    if (page === 'privacidade') return React.createElement(Privacidade, { navigate });
    return React.createElement(Home, { navigate });
  })();

  React.useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.background = T.bg;
  }, []);

  return React.createElement(LogadoProvider, null,
    React.createElement('div', { style: globalStyle }, body)
  );
}
