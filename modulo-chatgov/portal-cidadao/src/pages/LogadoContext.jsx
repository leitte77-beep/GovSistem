import React, { createContext, useContext, useState, useCallback } from 'react';
import { getConta, setConta, setToken as saveToken, getToken } from '../api.js';

const Ctx = createContext(null);

export function LogadoProvider({ children }) {
  const [conta, _setConta] = useState(() => getConta());

  const login = useCallback((token, dados) => {
    saveToken(token);
    _setConta(dados);
    setConta(dados);
  }, []);

  const logout = useCallback(() => {
    saveToken('');
    _setConta(null);
    setConta(null);
  }, []);

  return React.createElement(Ctx.Provider, { value: { conta, login, logout } }, children);
}

export function useLogado() { return useContext(Ctx); }
