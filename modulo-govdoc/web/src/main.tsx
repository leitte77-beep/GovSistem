import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ProvedorAviso } from './contexto/AvisoContexto';
import { ProvedorSessao } from './contexto/SessaoContexto';
import './estilos/global.css';

ReactDOM.createRoot(document.getElementById('raiz')!).render(
  <React.StrictMode><BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ProvedorAviso><ProvedorSessao><App/></ProvedorSessao></ProvedorAviso></BrowserRouter></React.StrictMode>,
);
