import React, { useEffect, useState } from 'react';
import { Activity, Bot, CheckCircle2, FlaskConical, Plus, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { adminApi } from '../api/administracao';
import { fetchDepartamentos } from '../api';
import { T } from '../theme';

const card = {
  width: '100%', maxWidth: 920, background: T.surface, border: `1px solid ${T.border}`,
  borderRadius: T.radiusLg, boxShadow: T.shadow, overflow: 'hidden', boxSizing: 'border-box',
};
const head = { padding: '18px 22px', borderBottom: `1px solid ${T.border}`, fontWeight: 750, fontSize: 16 };
const body = { padding: 22 };
const field = {
  width: '100%', padding: '10px 12px', background: T.surfaceMuted, border: `1px solid ${T.border}`,
  borderRadius: T.radiusSm, color: T.text, fontSize: 14, boxSizing: 'border-box',
};
const button = {
  minHeight: 38, padding: '9px 15px', border: 0, borderRadius: T.radiusSm,
  background: T.primary, color: '#fff', fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
};
const secondary = { ...button, background: T.surfaceMuted, color: T.text, border: `1px solid ${T.border}` };
const stack = { display: 'flex', flexDirection: 'column', gap: 20, width: '100%', maxWidth: 920 };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 };

function Erro({ children }) {
  return children ? <div role="alert" style={{ color: T.danger, fontSize: 13, marginBottom: 12 }}>{children}</div> : null;
}

function Estado({ children, tone = T.primary }) {
  return <span style={{ padding: '3px 9px', borderRadius: 20, background: `${tone}1a`, color: tone, fontSize: 11, fontWeight: 750 }}>{children}</span>;
}

function humanizar(valor) {
  const textos = {
    adaptador_pendente_credencial: 'Pendente de credencial',
    responsabilidade_saas: 'Gerenciado pelo SaaS',
    configurado: 'Configurado',
    pendente: 'Pendente',
    atencao: 'Atenção',
    ok: 'OK',
  };
  return textos[valor] || String(valor).replaceAll('_', ' ');
}

export function AbaCanaisAvancados() {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState({ nome: '', tipo: 'whatsapp_cloud_api', numero: '', webhook_url: '' });
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const carregar = () => adminApi.canais().then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);

  async function criar() {
    setErro('');
    try {
      await adminApi.criarCanal(form);
      setForm({ nome: '', tipo: 'whatsapp_cloud_api', numero: '', webhook_url: '' });
      carregar();
    } catch (e) { setErro(e.message); }
  }

  async function diagnosticar(id) {
    try { setResultado(await adminApi.diagnosticarCanal(id)); } catch (e) { setErro(e.message); }
  }

  return <div style={stack}>
    <section style={card}>
      <div style={head}>Canais oficiais de atendimento</div>
      <div style={body}>
        <Erro>{erro}</Erro>
        <div style={grid}>
          <input aria-label="Nome do canal" style={field} placeholder="Nome do canal" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          <select aria-label="Tipo do canal" style={field} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="whatsapp_cloud_api">WhatsApp Cloud API</option>
            <option value="whatsapp_baileys">WhatsApp por QR (legado)</option>
            <option value="webchat">Webchat</option>
            <option value="outro">Outro</option>
          </select>
          <input aria-label="Número do canal" style={field} placeholder="+55..." value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
          <input aria-label="Webhook do canal" style={field} placeholder="Webhook (opcional)" value={form.webhook_url} onChange={(e) => setForm({ ...form, webhook_url: e.target.value })} />
        </div>
        <button style={{ ...button, marginTop: 12 }} onClick={criar}><Plus size={16} />Adicionar canal</button>
      </div>
      {lista.map((canal) => <div key={canal.id} style={{ padding: '15px 22px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 700 }}>{canal.nome}</div>
          <div style={{ color: T.textMuted, fontSize: 12 }}>{canal.tipo} · {canal.numero || 'sem número'}</div>
        </div>
        <Estado tone={canal.situacao === 'conectado' ? T.success : T.warning}>{canal.situacao}</Estado>
        <button style={secondary} onClick={() => diagnosticar(canal.id)}><Activity size={15} />Diagnosticar</button>
      </div>)}
      {!lista.length && <div style={{ padding: 22, color: T.textMuted }}>Nenhum canal cadastrado.</div>}
    </section>
    {resultado && <section style={card}>
      <div style={head}>Resultado do diagnóstico</div>
      <div style={body}>
        <p style={{ marginTop: 0 }}>{resultado.mensagem}</p>
        <div style={grid}>{Object.entries(resultado.requisitos || {}).map(([nome, ok]) =>
          <div key={nome} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <CheckCircle2 size={17} color={ok ? T.success : T.warning} /> <span style={{ fontSize: 13 }}>{nome}</span>
          </div>)}</div>
      </div>
    </section>}
  </div>;
}

const periodoPadrao = {
  seg: [['08:00', '17:00']], ter: [['08:00', '17:00']], qua: [['08:00', '17:00']],
  qui: [['08:00', '17:00']], sex: [['08:00', '17:00']],
};

export function AbaRegrasOperacionais() {
  const [departamentos, setDepartamentos] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [sla, setSla] = useState([]);
  const [roteamento, setRoteamento] = useState([]);
  const [departamentoId, setDepartamentoId] = useState('');
  const [config, setConfig] = useState({ primeira_resposta_minutos: 30, resolucao_minutos: 480, estrategia: 'menor_carga', limite_carga_padrao: 10 });
  const [novoHorario, setNovoHorario] = useState('Expediente municipal');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');

  const carregar = async () => {
    try {
      const [deps, hrs, slas, rotas] = await Promise.all([fetchDepartamentos(), adminApi.horarios(), adminApi.sla(), adminApi.roteamento()]);
      setDepartamentos(deps); setHorarios(hrs); setSla(slas); setRoteamento(rotas);
      if (!departamentoId && deps[0]) setDepartamentoId(deps[0].id);
    } catch (e) { setErro(e.message); }
  };
  useEffect(() => { carregar(); }, []);

  async function criarHorario() {
    try {
      await adminApi.criarHorario({ nome: novoHorario, periodos: periodoPadrao, mensagem_ausencia: 'Retornaremos no próximo dia útil.' });
      setMensagem('Horário criado.'); carregar();
    } catch (e) { setErro(e.message); }
  }
  async function salvar() {
    if (!departamentoId) return;
    try {
      await Promise.all([
        adminApi.salvarSla(departamentoId, {
          primeira_resposta_minutos: Number(config.primeira_resposta_minutos),
          resolucao_minutos: Number(config.resolucao_minutos), usar_horario_util: true,
          horario_id: horarios[0]?.id || null, alerta_percentual: 80, escalonamento: [],
        }),
        adminApi.salvarRoteamento(departamentoId, {
          estrategia: config.estrategia, limite_carga_padrao: Number(config.limite_carga_padrao), regras: {},
        }),
      ]);
      setMensagem('SLA e roteamento salvos.'); carregar();
    } catch (e) { setErro(e.message); }
  }

  return <div style={stack}>
    <section style={card}>
      <div style={head}>Horários de atendimento</div>
      <div style={body}>
        <div style={{ ...grid, alignItems: 'center' }}>
          <input aria-label="Nome do horário" style={field} value={novoHorario} onChange={(e) => setNovoHorario(e.target.value)} />
          <button style={button} onClick={criarHorario}><Plus size={16} />Criar expediente 08h–17h</button>
        </div>
        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {horarios.map((h) => <Estado key={h.id}>{h.nome} · {h.timezone}</Estado>)}
        </div>
      </div>
    </section>
    <section style={card}>
      <div style={head}>SLA e distribuição automática</div>
      <div style={body}>
        <Erro>{erro}</Erro>
        {mensagem && <div role="status" style={{ color: T.success, fontSize: 13, marginBottom: 12 }}>{mensagem}</div>}
        <div style={grid}>
          <select aria-label="Departamento das regras" style={field} value={departamentoId} onChange={(e) => setDepartamentoId(e.target.value)}>
            {departamentos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
          <input aria-label="Primeira resposta em minutos" type="number" min="1" style={field} value={config.primeira_resposta_minutos} onChange={(e) => setConfig({ ...config, primeira_resposta_minutos: e.target.value })} />
          <input aria-label="Resolução em minutos" type="number" min="1" style={field} value={config.resolucao_minutos} onChange={(e) => setConfig({ ...config, resolucao_minutos: e.target.value })} />
          <select aria-label="Estratégia de roteamento" style={field} value={config.estrategia} onChange={(e) => setConfig({ ...config, estrategia: e.target.value })}>
            <option value="menor_carga">Menor carga</option><option value="round_robin">Rodízio</option>
            <option value="manual">Manual</option><option value="por_regra">Por regra</option>
          </select>
          <input aria-label="Limite de conversas" type="number" min="1" max="100" style={field} value={config.limite_carga_padrao} onChange={(e) => setConfig({ ...config, limite_carga_padrao: e.target.value })} />
        </div>
        <button style={{ ...button, marginTop: 12 }} onClick={salvar}><Save size={16} />Salvar regras</button>
        <p style={{ color: T.textMuted, fontSize: 12, marginBottom: 0 }}>Configurados: {sla.length} SLA(s) e {roteamento.length} regra(s) de distribuição.</p>
      </div>
    </section>
  </div>;
}

export function AbaGovernanca() {
  const [diagnosticos, setDiagnosticos] = useState(null);
  const [retencao, setRetencao] = useState({ dias_conversas: 365, dias_midias: 180, dias_auditoria: 1825, ativo: false });
  const [auditoria, setAuditoria] = useState([]);
  const [falhas, setFalhas] = useState([]);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const carregar = async () => {
    try {
      const [diag, ret, aud, fails] = await Promise.all([adminApi.diagnosticos(), adminApi.retencao(), adminApi.auditoria(), adminApi.falhas()]);
      setDiagnosticos(diag); setRetencao({ ...retencao, ...ret }); setAuditoria(aud); setFalhas(fails);
    } catch (e) { setErro(e.message); }
  };
  useEffect(() => { carregar(); }, []);

  async function salvarRetencao() {
    try { setRetencao(await adminApi.salvarRetencao(retencao)); setMensagem('Política salva em modo de arquivamento seguro.'); } catch (e) { setErro(e.message); }
  }
  async function massa() {
    try {
      const r = await adminApi.criarMassaSintetica();
      setMensagem(`Massa sintética criada sem dados pessoais (${r.departamentos_configurados} departamentos).`);
      carregar();
    } catch (e) { setErro(e.message); }
  }

  return <div style={stack}>
    <section style={card}>
      <div style={head}>Saúde e dependências</div>
      <div style={body}>
        <Erro>{erro}</Erro>
        <div style={grid}>{Object.entries(diagnosticos?.servicos || {}).map(([nome, valor]) =>
          <div key={nome} style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: T.radiusSm }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 7, textTransform: 'capitalize' }}>{nome.replaceAll('_', ' ')}</div>
            <Estado tone={valor.status === 'ok' || valor.status === 'configurado' ? T.success : T.warning}>{humanizar(valor.status)}</Estado>
          </div>)}</div>
        <button style={{ ...secondary, marginTop: 12 }} onClick={carregar}><RefreshCw size={15} />Atualizar</button>
      </div>
    </section>
    <section style={card}>
      <div style={head}>Retenção e ambiente de testes</div>
      <div style={body}>
        {mensagem && <div role="status" style={{ color: T.success, fontSize: 13, marginBottom: 12 }}>{mensagem}</div>}
        <div style={grid}>
          {['dias_conversas', 'dias_midias', 'dias_auditoria'].map((nome) =>
            <label key={nome} style={{ fontSize: 12, color: T.textSecondary }}>{nome.replaceAll('_', ' ')}
              <input style={{ ...field, marginTop: 5 }} type="number" min="30" max="3650" value={retencao[nome] || ''} onChange={(e) => setRetencao({ ...retencao, [nome]: Number(e.target.value) || null })} />
            </label>)}
        </div>
        <label style={{ display: 'block', fontSize: 13, margin: '12px 0' }}>
          <input type="checkbox" checked={!!retencao.ativo} onChange={(e) => setRetencao({ ...retencao, ativo: e.target.checked })} /> Ativar política (sempre arquiva, nunca apaga)
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={button} onClick={salvarRetencao}><ShieldCheck size={16} />Salvar retenção</button>
          <button style={secondary} onClick={massa}><FlaskConical size={16} />Gerar massa sintética DEV</button>
        </div>
      </div>
    </section>
    <section style={card}>
      <div style={head}>Auditoria recente e fila de falhas</div>
      <div style={body}>
        <p style={{ marginTop: 0, fontSize: 13 }}>Falhas de mensagem: <strong>{falhas.length}</strong> · Eventos de auditoria carregados: <strong>{auditoria.length}</strong></p>
        {auditoria.slice(0, 8).map((a) => <div key={a.id} style={{ padding: '8px 0', borderTop: `1px solid ${T.border}`, fontSize: 12 }}>
          <strong>{a.acao}</strong> · {a.operador_nome || 'sistema'} · {new Date(a.criado_em).toLocaleString('pt-BR')}
        </div>)}
      </div>
    </section>
  </div>;
}

export function VersoesIris() {
  const [lista, setLista] = useState([]);
  const [instrucoes, setInstrucoes] = useState('Você é a Iris, assistente municipal. Responda apenas com informações das fontes autorizadas.');
  const [teste, setTeste] = useState('');
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const carregar = () => adminApi.promptsIris().then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);
  return <section style={card}>
    <div style={head}>Versões auditáveis do prompt</div>
    <div style={body}>
      <Erro>{erro}</Erro>
      <textarea aria-label="Instruções da nova versão Iris" style={{ ...field, minHeight: 85 }} value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)} />
      <button style={{ ...button, marginTop: 8 }} onClick={async () => { try { await adminApi.criarPromptIris({ instrucoes_sistema: instrucoes, fontes_autorizadas: ['base_municipal'], limite_confianca: 0.7 }); carregar(); } catch (e) { setErro(e.message); } }}><Plus size={16} />Criar versão</button>
      {lista.map((p) => <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: `1px solid ${T.border}`, marginTop: 10 }}>
        <span style={{ flex: 1, fontSize: 13 }}>Versão {p.versao}</span><Estado>{p.situacao}</Estado>
        {p.situacao !== 'publicado' && <button style={secondary} onClick={async () => { await adminApi.publicarPromptIris(p.id); carregar(); }}>Publicar</button>}
      </div>)}
      <div style={{ ...grid, marginTop: 14 }}>
        <input aria-label="Mensagem para simular Iris" style={field} placeholder="Mensagem de teste" value={teste} onChange={(e) => setTeste(e.target.value)} />
        <button style={secondary} onClick={async () => setResultado(await adminApi.simularIris(teste))}><FlaskConical size={16} />Simular sem enviar</button>
      </div>
      {resultado && <p style={{ fontSize: 13, color: T.textSecondary }}>{resultado.resposta}</p>}
    </div>
  </section>;
}

export function VersoesChatbot() {
  const [lista, setLista] = useState([]);
  const [nome, setNome] = useState('Triagem municipal');
  const [erro, setErro] = useState('');
  const carregar = () => adminApi.fluxosChatbot().then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);
  return <section style={card}>
    <div style={head}>Fluxos versionados do chatbot</div>
    <div style={body}>
      <Erro>{erro}</Erro>
      <div style={grid}>
        <input aria-label="Nome do fluxo chatbot" style={field} value={nome} onChange={(e) => setNome(e.target.value)} />
        <button style={button} onClick={async () => { try { await adminApi.criarFluxoChatbot({ nome }); carregar(); } catch (e) { setErro(e.message); } }}><Bot size={16} />Criar fluxo</button>
      </div>
      {lista.map((f) => {
        const versao = f.versoes?.[0]?.versao || 1;
        return <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${T.border}`, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 160, fontSize: 13, fontWeight: 700 }}>{f.nome} · v{versao}</span>
          <Estado>{f.situacao}</Estado>
          <button style={secondary} onClick={async () => { await adminApi.publicarFluxo(f.id, versao); carregar(); }}>Publicar</button>
        </div>;
      })}
    </div>
  </section>;
}
