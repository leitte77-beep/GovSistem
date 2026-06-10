import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

const BUILD_VERSION = '3.0.0-is-whatsapp';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
