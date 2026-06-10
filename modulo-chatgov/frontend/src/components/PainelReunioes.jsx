import React, { useState, useEffect } from 'react';
import { Video, Plus, Calendar as CalendarIcon, Clock, Users, ExternalLink } from 'lucide-react';
import { criarReuniaoApi, fetchReunioes, fetchCalendario } from '../api/evolucoes';
import { fetchOperadores } from '../api';
import { useAuth } from '../context/AuthContext';
import { T } from '../theme';

export function PainelReunioes() {
  const { auth } = useAuth();
  const [reunioes, setReunioes] = useState([]);
  const [operadores, setOperadores] = useState([]);
  const [showNova, setShowNova] = useState(false);

  useEffect(() => {
    fetchReunioes().then(setReunioes).catch(console.error);
    fetchOperadores().then(setOperadores).catch(console.error);
  }, []);

  const handleCriar = async (e) => {
    e.preventDefault();
    const form = e.target;
    const participantes = form.participantes?.selectedOptions ? Array.from(form.participantes.selectedOptions).map((o) => o.value) : [];
    try {
      await criarReuniaoApi({
        titulo: form.titulo.value,
        pauta: form.pauta?.value || '',
        plataforma: form.plataforma.value,
        inicio: form.inicio.value,
        fim: form.fim.value,
        participantes,
      });
      const atualizadas = await fetchReunioes();
      setReunioes(atualizadas);
      setShowNova(false);
    } catch (err) { console.error(err); }
  };

  const statusCor = (s) => {
    if (s === 'em_andamento') return '#22C55E';
    if (s === 'agendada') return '#3B82F6';
    if (s === 'encerrada') return '#9CA3AF';
    if (s === 'cancelada') return '#EF4444';
    return '#9CA3AF';
  };

  return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: T.bg } },
    React.createElement('div', { style: { padding: '10px 16px', background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 } },
      React.createElement(Video, { size: 20, color: T.primary }),
      React.createElement('span', { style: { fontWeight: 700, fontSize: 15, color: T.text } }, 'Reuniões'),
      React.createElement('button', { onClick: () => setShowNova(true), style: { marginLeft: 'auto', background: T.primary, border: 'none', borderRadius: 6, padding: '6px 12px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 } },
        React.createElement(Plus, { size: 14 }), 'Nova Reunião'),
    ),
    React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 } },
      reunioes.length === 0
        ? React.createElement('div', { style: { textAlign: 'center', color: T.textMuted, padding: 40 } }, 'Nenhuma reunião')
        : reunioes.map((r) => React.createElement('div', { key: r.id, style: { background: T.surface, borderRadius: 10, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: `1px solid ${T.border}`, borderLeft: `4px solid ${statusCor(r.status)}` } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 } },
              React.createElement('span', { style: { fontWeight: 700, fontSize: 14, color: T.text } }, r.titulo),
              React.createElement('span', { style: { fontSize: 10, padding: '2px 8px', borderRadius: 8, background: statusCor(r.status) + '20', color: statusCor(r.status), fontWeight: 600 } }, r.status.replace('_', ' ')),
            ),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textMuted, marginBottom: 4 } },
              React.createElement(Clock, { size: 12 }), new Date(r.inicio).toLocaleString('pt-BR'), ' - ', new Date(r.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textMuted, marginBottom: 4 } },
              React.createElement(Users, { size: 12 }), r.organizador_nome || '—'),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textMuted } },
              React.createElement(Video, { size: 12 }), r.plataforma === 'google_meet' ? 'Google Meet' : 'Microsoft Teams'),
            r.link_reuniao && React.createElement('a', { href: r.link_reuniao, target: '_blank', rel: 'noopener noreferrer', style: { display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '6px 12px', background: T.primary, color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 12 } },
              React.createElement(ExternalLink, { size: 12 }), 'Entrar na reunião'),
          )),
    ),
    // Modal: Nova Reunião
    showNova && React.createElement('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 } },
      React.createElement('form', { onSubmit: handleCriar, style: { background: '#fff', borderRadius: 12, padding: 20, width: 440 } },
        React.createElement('h3', { style: { margin: '0 0 12px', fontSize: 16, color: T.text } }, 'Agendar Reunião'),
        React.createElement('input', { name: 'titulo', placeholder: 'Título da reunião', required: true, style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } }),
        React.createElement('textarea', { name: 'pauta', placeholder: 'Pauta', rows: 2, style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } }),
        React.createElement('select', { name: 'plataforma', defaultValue: 'google_meet', style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } },
          React.createElement('option', { value: 'google_meet' }, 'Google Meet'),
          React.createElement('option', { value: 'teams' }, 'Microsoft Teams'),
        ),
        React.createElement('input', { name: 'inicio', type: 'datetime-local', required: true, style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } }),
        React.createElement('input', { name: 'fim', type: 'datetime-local', required: true, style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14 } }),
        React.createElement('select', { name: 'participantes', multiple: true, style: { width: '100%', padding: 8, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, fontSize: 14, minHeight: 100 } },
          ...operadores.map((o) => React.createElement('option', { key: o.id, value: o.id }, o.nome)),
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          React.createElement('button', { type: 'button', onClick: () => setShowNova(false), style: { padding: '6px 14px', background: T.surfaceMuted, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 } }, 'Cancelar'),
          React.createElement('button', { type: 'submit', style: { padding: '6px 14px', background: T.primary, border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13 } }, 'Agendar'),
        ),
      ),
    ),
  );
}
