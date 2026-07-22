import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { T, _setThemeMode, _getThemeMode } from '../theme';

var ThemeContext = createContext(null);

function applyTheme(isDark) {
  var html = document.documentElement;
  var theme = isDark ? 'dark' : 'light';
  html.setAttribute('data-theme', theme);
  html.classList.toggle('dark', isDark);
  html.style.colorScheme = theme;
}

export function ThemeProvider(_ref) {
  var children = _ref.children;

  var _useState = useState(_getThemeMode);
  var isDark = _useState[0];
  var setIsDark = _useState[1];

  // No mount: aplica tema que veio do anti-FOUC / localStorage
  useEffect(function () {
    applyTheme(isDark);
    _setThemeMode(isDark);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // No clique: atualiza _isDark ANTES do render, depois aplica no DOM
  var toggle = useCallback(function () {
    setIsDark(function (v) {
      var next = !v;
      _setThemeMode(next);  // atualiza módulo → T.* retorna paleta certa no próximo render
      return next;
    });
    // applyTheme roda no useEffect abaixo (isDark já mudou)
  }, []);

  useEffect(function () {
    applyTheme(isDark);
  }, [isDark]);

  return React.createElement(ThemeContext.Provider, {
    value: { isDark: isDark, toggle: toggle, theme: T }
  }, children);
}

export function useTheme() {
  var ctx = useContext(ThemeContext);
  if (!ctx) return { isDark: false, toggle: function () {}, theme: T };
  return ctx;
}
