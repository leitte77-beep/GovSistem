import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message?.includes('Receiving end does not exist')) {
    event.preventDefault();
  }
});

const BUILD_VERSION = '3.0.0-is-whatsapp';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
