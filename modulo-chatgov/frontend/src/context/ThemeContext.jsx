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

  var _useStateV = useState(0);
  var version = _useStateV[0];
  var bumpVersion = _useStateV[1];

  // No mount: aplica tema que veio do anti-FOUC / localStorage
  useEffect(function () {
    applyTheme(isDark);
    _setThemeMode(isDark);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // No clique: atualiza _isDark ANTES do render, depois aplica no DOM
  var toggle = useCallback(function () {
    _setThemeMode(!isDark);  // atualiza módulo antes do state
    setIsDark(function (v) { return !v; });
    bumpVersion(function (v) { return v + 1; }); // força re-render de toda a árvore
    // applyTheme roda no useEffect abaixo (isDark já mudou)
  }, [isDark]);

  useEffect(function () {
    applyTheme(isDark);
  }, [isDark]);

  return React.createElement(ThemeContext.Provider, {
    value: { isDark: isDark, toggle: toggle, theme: T, version: version }
  }, children);
}

export function useTheme() {
  var ctx = useContext(ThemeContext);
  if (!ctx) return { isDark: false, toggle: function () {}, theme: T };
  return ctx;
}
