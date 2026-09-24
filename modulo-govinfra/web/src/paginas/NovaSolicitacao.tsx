import { ArrowLeft, Building2, Calendar, CheckCircle2, ChevronRight, Clock, Hash, Info, MapPin, Package, PencilLine, Phone, Plus, Save, Search, ShieldCheck, User, UserRoundPlus, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import { Carregando, Chip, ErroEstado, Modal } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import type { Imovel, Pessoa, TipoResiduo } from '../types';
import { adicionarDias, formatarCpf, formatarTelefone, hoje } from '../utils';

const ETAPAS = ['Solicitante', 'Local de instalação', 'Material', 'Agendamento', 'Confirmação'];

const CHAVE_RASCUNHO = 'govinfra.solicitacao.rascunho';
const CHAVE_RECENTES = 'govinfra.solicitantes.recentes';

type RascunhoLocal = {
  salvo_em: string;
  etapa: number;
  form: Record<string, any>;
  pessoa: Pessoa | null;
  imovel: Imovel | null;
};

/* ── Utilitários de máscara e validação ─────────────────────────────────── */

function formatarCnpj(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function mascararDocumento(valor: string, juridica: boolean): string {
  return juridica ? formatarCnpj(valor) : formatarCpf(valor);
}

function mascararTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function validarCpf(n: string): boolean {
  if (!/^\d{11}$/.test(n) || /^(\d)\1{10}$/.test(n)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(n[i]) * (10 - i);
  if (((soma * 10) % 11) % 10 !== Number(n[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(n[i]) * (11 - i);
  return ((soma * 10) % 11) % 10 === Number(n[10]);
}

function validarCnpj(n: string): boolean {
  if (!/^\d{14}$/.test(n) || /^(\d)\1{13}$/.test(n)) return false;
  let soma = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2].reduce((acc, p, i) => acc + Number(n[i]) * p, 0);
  let digito = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (digito !== Number(n[12])) return false;
  soma = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2].reduce((acc, p, i) => acc + Number(n[i]) * p, 0);
  digito = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  return digito === Number(n[13]);
}

function formatarDocumento(doc?: string | null): string { const d = (doc || '').replace(/\D/g, ''); if (!d) return ''; return d.length === 14 ? formatarCnpj(d) : formatarCpf(d); }

function carregarRecentes(): Pessoa[] { try { return JSON.parse(localStorage.getItem(CHAVE_RECENTES) || '[]'); } catch { return []; } }

function resumirReciente(p: Pessoa): Pessoa {
  return { id: p.id, nome: p.nome, documento: p.documento, telefone: p.telefone, bairro: p.bairro, situacao: p.situacao, tipos: p.tipos || [], pessoa_juridica: p.pessoa_juridica };
}

/* ── Constantes compartilhadas com o formulário premium ────────────────── */

const CLASSIFICACOES_CAD = [
  { chave: 'cidadao', rotulo: 'Cidadão' },
  { chave: 'produtor_rural', rotulo: 'Produtor rural' },
  { chave: 'proprietario', rotulo: 'Proprietário' },
  { chave: 'arrendatario', rotulo: 'Arrendatário' },
  { chave: 'pessoa_juridica', rotulo: 'Empresa' },
  { chave: 'representante', rotulo: 'Representante' },
  { chave: 'responsavel_imovel', rotulo: 'Resp. imóvel' },
];
const UFS_CAD = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

/* ── Modal cadastro premium (substitui o antigo modal simplificado) ────── */

function ModalCadastroPremium({ fechar, aoCriar }: { fechar: () => void; aoCriar: (p: Pessoa) => void }) {
  const { avisar } = useAviso();
  const [form, setForm] = useState<Record<string, any>>({ tipos: ['cidadao'], pessoa_juridica: false });
  const [erroCpf, setErroCpf] = useState('');
  const [cpfValidado, setCpfValidado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const set = (c: string, v: any) => setForm((f) => ({ ...f, [c]: v }));

  function mascararCpf(valor: string): string {
    const d = valor.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  function mascararTelefone(valor: string): string {
    const d = valor.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  function aoMudarCpf(valor: string) {
    const m = mascararCpf(valor); set('documento', m);
    const d = m.replace(/\D/g, '');
    if (d.length === 11) {
      if (validarCpf(d)) { setErroCpf(''); setCpfValidado(true); }
      else { setErroCpf('CPF inválido'); setCpfValidado(false); }
    } else { setErroCpf(''); setCpfValidado(false); }
  }
  function toggleClassificacao(chave: string) {
    const atual = (form.tipos || []) as string[];
    if (atual.includes(chave)) set('tipos', atual.filter((t) => t !== chave));
    else set('tipos', [...atual, chave]);
  }

  async function enviar() {
    if (!form.nome || form.nome.trim().length < 3) return;
    setSalvando(true);
    try {
      const resposta = await api.post<any>('/pessoas', {
        nome: form.nome.trim(), pessoa_juridica: form.pessoa_juridica,
        documento: (form.documento || '').replace(/\D/g, '') || null,
        telefone: (form.telefone || '').replace(/\D/g, '') || null,
        whatsapp: (form.whatsapp || '').replace(/\D/g, '') || null,
        email: form.email || null, data_nascimento: form.data_nascimento || null,
        logradouro: form.logradouro || null, numero: form.numero || null,
        bairro: form.bairro || null, complemento: form.complemento || null,
        municipio: form.municipio || null, uf: form.uf || null,
        tipos: form.tipos || ['cidadao'], observacoes: form.observacoes || null,
        nome_fantasia: form.nome_fantasia || null,
      });
      avisar('sucesso', 'Cadastro criado com sucesso.');
      aoCriar({
        id: resposta.id, nome: form.nome.trim(), pessoa_juridica: form.pessoa_juridica,
        documento: form.documento || null, telefone: form.telefone || null,
        bairro: form.bairro || null, situacao: 'ativo', tipos: form.tipos || ['cidadao'],
      });
    } catch (e: any) {
      avisar('erro', e.message);
      if (e.codigo === 'possivel_duplicidade' && e.corpo?.duplicidades) {
        try {
          const resposta = await api.post<any>('/pessoas', { nome: form.nome.trim(), pessoa_juridica: form.pessoa_juridica, documento: (form.documento || '').replace(/\D/g, '') || null, telefone: (form.telefone || '').replace(/\D/g, '') || null, bairro: form.bairro || null, tipos: form.tipos || ['cidadao'], confirmar_duplicidade: true });
          avisar('sucesso', 'Cadastro criado confirmando duplicidade.');
          aoCriar({ id: resposta.id, nome: form.nome.trim(), pessoa_juridica: form.pessoa_juridica, documento: form.documento || null, telefone: form.telefone || null, bairro: form.bairro || null, situacao: 'ativo', tipos: form.tipos || ['cidadao'] });
        } catch (e2: any) { avisar('erro', e2.message); }
      }
    } finally { setSalvando(false); }
  }

  const isPj = form.pessoa_juridica;
  return <Modal titulo={`Cadastrar ${isPj ? 'empresa' : 'cidadão'} para esta solicitação`} fechar={fechar} largo
    rodape={<>
      <span className="texto-pequeno" style={{ color: 'var(--cinza-400)' }}>Após salvar, será vinculado automaticamente.</span>
      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
        <button className="botao" onClick={fechar}>Cancelar</button>
        <button className="botao principal" disabled={salvando || !form.nome} onClick={enviar}>{salvando ? 'Salvando…' : 'Salvar e selecionar'}</button>
      </div>
    </>}>
    <div className="cadastro-secao" style={{ borderBottom: 0, marginBottom: 0, paddingBottom: 0 }}>
      <div className="cadastro-secao-header">
        <div className="cadastro-secao-icone"><User size={20}/></div>
        <div>
          <div className="cadastro-secao-titulo">Dados {isPj ? 'da empresa' : 'do cidadão'}</div>
          <div className="cadastro-secao-desc">Preencha os dados. Após salvar, esta pessoa será vinculada à solicitação automaticamente.</div>
        </div>
      </div>

      {/* Tipo PF/PJ */}
      <div style={{ marginBottom: 14 }}>
        <div className="alternador" role="group">
          <button type="button" className={!isPj ? 'selecionado' : ''} onClick={() => set('pessoa_juridica', false)}>Pessoa física</button>
          <button type="button" className={isPj ? 'selecionado' : ''} onClick={() => set('pessoa_juridica', true)}>Pessoa jurídica</button>
        </div>
      </div>

      <div className="cadastro-grade">
        {/* Nome — full */}
        <div className="cadastro-campo full">
          <label className="cadastro-label">{isPj ? 'Razão social' : 'Nome completo'} <span className="cadastro-asterisco">*</span></label>
          <div className="cadastro-input-envolve">
            <User size={16} className="cadastro-input-icone"/>
            <input required className="cadastro-input" value={form.nome || ''} onChange={(e) => set('nome', e.target.value)}
              placeholder={isPj ? 'Razão social da empresa' : 'Digite o nome completo'}/>
          </div>
        </div>

        {isPj && (
          <div className="cadastro-campo full">
            <label className="cadastro-label">Nome fantasia</label>
            <div className="cadastro-input-envolve">
              <Building2 size={16} className="cadastro-input-icone"/>
              <input className="cadastro-input" value={form.nome_fantasia || ''} onChange={(e) => set('nome_fantasia', e.target.value)} placeholder="Nome fantasia"/>
            </div>
          </div>
        )}

        {/* CPF + Data */}
        <div className="cadastro-campo">
          <label className="cadastro-label">{isPj ? 'CNPJ' : 'CPF'}</label>
          <div className={`cadastro-input-envolve ${erroCpf ? 'erro' : ''} ${cpfValidado ? 'ok' : ''}`}>
            <Hash size={16} className="cadastro-input-icone"/>
            <input inputMode="numeric" className="cadastro-input" placeholder={isPj ? '00.000.000/0000-00' : '000.000.000-00'}
              value={form.documento || ''} onChange={(e) => aoMudarCpf(e.target.value)}/>
          </div>
          {erroCpf && <span className="cadastro-feedback erro"><CheckCircle2 size={11} style={{transform:'rotate(180deg)'}}/> {erroCpf}</span>}
          {cpfValidado && <span className="cadastro-feedback ok"><CheckCircle2 size={11}/> CPF válido</span>}
        </div>

        <div className="cadastro-campo">
          <label className="cadastro-label">{isPj ? 'Data de abertura' : 'Data de nascimento'}</label>
          <div className="cadastro-input-envolve">
            <Calendar size={16} className="cadastro-input-icone"/>
            <input type="date" className="cadastro-input" value={form.data_nascimento || ''} onChange={(e) => set('data_nascimento', e.target.value)}/>
          </div>
        </div>

        {/* Telefone + WhatsApp */}
        <div className="cadastro-campo">
          <label className="cadastro-label">Telefone principal</label>
          <div className="cadastro-input-envolve">
            <Phone size={16} className="cadastro-input-icone"/>
            <input inputMode="tel" className="cadastro-input" placeholder="(00) 00000-0000"
              value={form.telefone || ''} onChange={(e) => set('telefone', mascararTelefone(e.target.value))}/>
          </div>
        </div>
        <div className="cadastro-campo">
          <label className="cadastro-label">WhatsApp</label>
          <div className="cadastro-input-envolve">
            <Phone size={16} className="cadastro-input-icone"/>
            <input inputMode="tel" className="cadastro-input" placeholder="(00) 00000-0000"
              value={form.whatsapp || ''} onChange={(e) => set('whatsapp', mascararTelefone(e.target.value))}/>
          </div>
        </div>

        {/* Email */}
        <div className="cadastro-campo full">
          <label className="cadastro-label">E-mail</label>
          <div className="cadastro-input-envolve">
            <User size={16} className="cadastro-input-icone"/>
            <input type="email" className="cadastro-input" placeholder="email@exemplo.com" value={form.email || ''} onChange={(e) => set('email', e.target.value)}/>
          </div>
        </div>

        {/* Classificação */}
        <div className="cadastro-campo full">
          <label className="cadastro-label">Classificação</label>
          <div className="cadastro-chips">
            {CLASSIFICACOES_CAD.map((c) => {
              const sel = (form.tipos || []).includes(c.chave);
              return (
                <button type="button" key={c.chave} className={`cadastro-chip ${sel ? 'ativo' : ''}`} onClick={() => toggleClassificacao(c.chave)}>
                  {sel && <CheckCircle2 size={14}/>} {c.rotulo}
                </button>
              );
            })}
          </div>
        </div>

        {/* Endereço */}
        <div className="cadastro-campo full">
          <label className="cadastro-label">Logradouro</label>
          <div className="cadastro-input-envolve">
            <MapPin size={16} className="cadastro-input-icone"/>
            <input className="cadastro-input" value={form.logradouro || ''} onChange={(e) => set('logradouro', e.target.value)} placeholder="Rua, avenida ou estrada"/>
          </div>
        </div>
        <div className="cadastro-campo cadastro-campo-curto">
          <label className="cadastro-label">Número</label>
          <div className="cadastro-input-envolve">
            <Hash size={16} className="cadastro-input-icone"/>
            <input className="cadastro-input" value={form.numero || ''} onChange={(e) => set('numero', e.target.value)} placeholder="Ex: 150"/>
          </div>
        </div>
        <div className="cadastro-campo">
          <label className="cadastro-label">Bairro</label>
          <div className="cadastro-input-envolve">
            <MapPin size={16} className="cadastro-input-icone"/>
            <input className="cadastro-input" value={form.bairro || ''} onChange={(e) => set('bairro', e.target.value)} placeholder="Digite o bairro"/>
          </div>
        </div>
        <div className="cadastro-campo">
          <label className="cadastro-label">Município</label>
          <div className="cadastro-input-envolve">
            <MapPin size={16} className="cadastro-input-icone"/>
            <input className="cadastro-input" value={form.municipio || ''} onChange={(e) => set('municipio', e.target.value)} placeholder="Digite o município"/>
          </div>
        </div>
        <div className="cadastro-campo cadastro-campo-curto">
          <label className="cadastro-label">UF</label>
          <select className="cadastro-input cadastro-select" value={form.uf || ''} onChange={(e) => set('uf', e.target.value.toUpperCase())}>
            <option value="">UF</option>
            {UFS_CAD.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </div>
      </div>
    </div>
  </Modal>;
}

/* ── Componente principal ───────────────────────────────────────────────── */

export function NovaSolicitacao() {
  const navegar = useNavigate();
  const { avisar } = useAviso();
  const [etapa, setEtapa] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [residuos, setResiduos] = useState<TipoResiduo[]>([]);
  const [form, setForm] = useState<Record<string, any>>({ espaco_confirmado: false, acesso_caminhao_confirmado: false, ciente_itens_proibidos: false, termo_aceito: false, prioridade: 'normal', data_desejada: adicionarDias(hoje(), 2) });
  const [pessoaSelecionada, setPessoaSelecionada] = useState<Pessoa | null>(null);
  const [imovelSelecionado, setImovelSelecionado] = useState<Imovel | null>(null);
  const [totalSolicitacoes, setTotalSolicitacoes] = useState(0);
  const [bloqueiosVerificados, setBloqueiosVerificados] = useState<{ total: number; itens: any[] } | null>(null);
  const [recomendacoes, setRecomendacoes] = useState<any[]>([]);
  const [protocolo, setProtocolo] = useState('');
  const [termoBusca, setTermoBusca] = useState('');
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const [modalAberto, setModalAberto] = useState(false);
  const [recentes, setRecentes] = useState<Pessoa[]>([]);
  const [rascunhoLocal, setRascunhoLocal] = useState<RascunhoLocal | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buscadorRef = useRef<HTMLDivElement>(null);

  const set = (campo: string, valor: any) => setForm((f) => ({ ...f, [campo]: valor }));

  useEffect(() => {
    api.get<TipoResiduo[]>('/tipos-residuo').then((r) => setResiduos(r)).catch(() => undefined);
    try { const bruto = localStorage.getItem(CHAVE_RASCUNHO); if (bruto) setRascunhoLocal(JSON.parse(bruto)); setRecentes(carregarRecentes()); } catch { /* storage indisponível */ }
  }, []);

  useEffect(() => {
    if (termoBusca.trim().length < 2) { setPessoas([]); setDropdownAberto(false); return; }
    const id = setTimeout(() => {
      api.get<{ itens: Pessoa[] }>(`/pessoas?termo=${encodeURIComponent(termoBusca)}&por_pagina=8`)
        .then((r) => { setPessoas(r.itens); setDropdownAberto(true); setIndiceAtivo(0); })
        .catch(() => setPessoas([]));
    }, 300);
    return () => clearTimeout(id);
  }, [termoBusca]);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) { if (buscadorRef.current && !buscadorRef.current.contains(e.target as Node)) setDropdownAberto(false); }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  useEffect(() => {
    const temConteudo = !!form.pessoa_id || !!form.logradouro || !!form.tipo_residuo_id || !!form.data_desejada || etapa > 0;
    if (!temConteudo) return;
    const id = setTimeout(() => {
      const rascunho: RascunhoLocal = { salvo_em: new Date().toISOString(), etapa, form, pessoa: pessoaSelecionada, imovel: imovelSelecionado };
      try { localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(rascunho)); } catch { /* quota excedida */ }
    }, 500);
    return () => clearTimeout(id);
  }, [form, etapa, pessoaSelecionada, imovelSelecionado]);

  function limparRascunhoLocal() { try { localStorage.removeItem(CHAVE_RASCUNHO); } catch { /* ignore */ } setRascunhoLocal(null); }

  function registrarReciente(p: Pessoa) {
    const lista = [resumirReciente(p), ...carregarRecentes().filter((r) => r.id !== p.id)].slice(0, 6);
    setRecentes(lista);
    try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista)); } catch { /* ignore */ }
  }

  async function carregarContextoPessoa(p: Pessoa) {
    try {
      const [imoveisResposta, solicitacoesResposta, bloqueiosResposta] = await Promise.all([
        api.get<{ itens: Imovel[] }>(`/imoveis?pessoa_id=${p.id}&por_pagina=50`),
        api.get<{ total: number }>(`/solicitacoes?pessoa_id=${p.id}&por_pagina=1`),
        api.get<{ total: number; itens: any[] }>(`/bloqueios/verificar?pessoa_id=${p.id}`).catch(() => ({ total: 0, itens: [] })),
      ]);
      setImoveis(imoveisResposta.itens);
      setTotalSolicitacoes(solicitacoesResposta.total);
      setBloqueiosVerificados(bloqueiosResposta);
    } catch { setImoveis([]); setTotalSolicitacoes(0); setBloqueiosVerificados(null); }
  }

  async function selecionarPessoa(p: Pessoa) {
    setPessoaSelecionada(p);
    set('pessoa_id', p.id);
    setPessoas([]);
    setTermoBusca('');
    setDropdownAberto(false);
    setIndiceAtivo(0);
    registrarReciente(p);
    await carregarContextoPessoa(p);
  }

  function trocarPessoa() { setPessoaSelecionada(null); setImovelSelecionado(null); setImoveis([]); setTotalSolicitacoes(0); setBloqueiosVerificados(null); set('pessoa_id', null); set('imovel_id', null); set('logradouro', ''); set('numero', ''); set('bairro', ''); inputRef.current?.focus(); }

  function selecionarImovel(im: Imovel) { setImovelSelecionado(im); set('imovel_id', im.id); set('logradouro', im.logradouro || form.logradouro); set('numero', im.numero || form.numero); set('bairro', im.bairro || form.bairro); }

  async function recomendar() {
    try { const resposta = await api.post<any>('/solicitacoes/recomendar-datas', { data_preferida: form.data_desejada, dias_uso: form.dias_previstos || 3, bairro: form.bairro, prioridade: form.prioridade, quantidade: 3 }); setRecomendacoes(resposta.opcoes || []); } catch (e: any) { avisar('erro', e.message); }
  }

  async function salvar(rascunho = false) {
    setSalvando(true);
    try {
      const resposta = await api.post<any>('/solicitacoes', { ...form, rascunho });
      avisar('sucesso', resposta.mensagem || 'Solicitação registrada.');
      limparRascunhoLocal();
      if (rascunho) { navegar('/govinfra/solicitacoes'); return; }
      setProtocolo(resposta.protocolo);
      setEtapa(4);
    } catch (e: any) { avisar('erro', e.message); if (e.codigo === 'impedimento_elegibilidade' && e.corpo?.motivos?.length) { setEtapa(0); } }
    finally { setSalvando(false); }
  }

  function continuarRascunho() { if (!rascunhoLocal) return; setForm(rascunhoLocal.form); setEtapa(rascunhoLocal.etapa); setPessoaSelecionada(rascunhoLocal.pessoa); setImovelSelecionado(rascunhoLocal.imovel); setRascunhoLocal(null); if (rascunhoLocal.pessoa) carregarContextoPessoa(rascunhoLocal.pessoa); }

  function descartarRascunho() { limparRascunhoLocal(); setForm({ espaco_confirmado: false, acesso_caminhao_confirmado: false, ciente_itens_proibidos: false, termo_aceito: false, prioridade: 'normal', data_desejada: adicionarDias(hoje(), 2) }); setEtapa(0); setPessoaSelecionada(null); setImovelSelecionado(null); setImoveis([]); setTotalSolicitacoes(0); setBloqueiosVerificados(null); }

  const podeAvancar = () => {
    if (etapa === 0) return !!form.pessoa_id;
    if (etapa === 1) return true;
    if (etapa === 2) return !!form.tipo_residuo_id && !!form.ciente_itens_proibidos;
    if (etapa === 3) return !!form.data_desejada;
    return false;
  };

  const motivoBloqueio = (): string | null => {
    if (etapa === 0 && !form.pessoa_id) return 'Selecione o solicitante para continuar.';
    if (etapa === 2) { if (!form.tipo_residuo_id) return 'Selecione o tipo de material para continuar.'; if (!form.ciente_itens_proibidos) return 'Confirme a ciência dos itens proibidos.'; }
    if (etapa === 4 && !form.termo_aceito) return 'Aceite o termo de responsabilidade para registrar.';
    return null;
  };

  function destacar(nome: string) { const termo = termoBusca.trim(); if (!termo) return nome; const pos = nome.toLocaleLowerCase('pt-BR').indexOf(termo.toLocaleLowerCase('pt-BR')); if (pos < 0) return nome; return <>{nome.slice(0, pos)}<em>{nome.slice(pos, pos + termo.length)}</em>{nome.slice(pos + termo.length)}</>; }

  function aoCriarPessoa(p: Pessoa) { setModalAberto(false); selecionarPessoa(p); setEtapa(1); }

  const enderecoPreenchido = [form.logradouro, form.numero, form.bairro].filter(Boolean).join(', ');
  const progressoPct = Math.round(((etapa + (protocolo ? 1 : 0)) / ETAPAS.length) * 100);
  const temBloqueios = bloqueiosVerificados && bloqueiosVerificados.total > 0;
  const bloqueado = (etapa < 3 && !podeAvancar()) || (etapa === 4 && !form.termo_aceito);
  const motivo = bloqueado ? motivoBloqueio() : null;

  /* Itens do painel lateral inteligente */
  const itensPainel = [
    { icone: <Users size={14}/>, rotulo: 'Solicitante', valor: pessoaSelecionada?.nome || null, estado: pessoaSelecionada ? 'ok' : 'pendente' },
    { icone: <MapPin size={14}/>, rotulo: 'Local', valor: enderecoPreenchido || null, estado: enderecoPreenchido ? 'ok' : 'pendente' },
    { icone: <Package size={14}/>, rotulo: 'Material', valor: residuos.find((r) => r.id === form.tipo_residuo_id)?.nome || null, estado: form.tipo_residuo_id ? 'ok' : 'pendente' },
    { icone: <Calendar size={14}/>, rotulo: 'Data', valor: form.data_desejada ? new Date(form.data_desejada).toLocaleDateString('pt-BR') : null, estado: form.data_desejada ? 'ok' : 'pendente' },
  ];

  return <div>
    {/* Cabeçalho inteligente */}
    <button className="botao sutil" onClick={() => navegar('/govinfra/solicitacoes')}><ArrowLeft size={16}/> Voltar</button>
    <header className="wizard-cabecalho">
      <div>
        <h1>Nova Solicitação de Caçamba</h1>
        <p>Etapa {etapa + 1} de {ETAPAS.length} · preenchimento rápido (~2 min)</p>
      </div>
      <div className="wizard-cabecalho-extra">
        <span className="wizard-protocolo-hint">Protocolo gerado automaticamente</span>
      </div>
    </header>

    {/* Barra de progresso */}
    <div className="wizard-progresso">
      <div className="wizard-progresso-barra" style={{ width: `${progressoPct}%` }}/>
    </div>

    {/* Stepper profissional */}
    <nav className="wizard-stepper" aria-label="Etapas da solicitação">
      {ETAPAS.map((nome, i) => (
        <div key={nome} className={`wizard-step ${i === etapa ? 'ativo' : i < etapa ? 'concluido' : ''}`}>
          <div className="wizard-step-bolha" onClick={() => i < etapa && setEtapa(i)} role={i < etapa ? 'button' : undefined} tabIndex={i < etapa ? 0 : undefined}>
            {i < etapa ? <CheckCircle2 size={18}/> : <span>{i + 1}</span>}
          </div>
          <span className="wizard-step-rotulo">{nome}</span>
          {i < ETAPAS.length - 1 && <div className={`wizard-step-linha ${i < etapa ? 'preenchida' : ''}`}/>}
        </div>
      ))}
    </nav>

    {/* Sucesso */}
    {protocolo && <div className="aviso sucesso"><CheckCircle2 size={20}/><div className="texto"><div className="titulo">Solicitação registrada</div>Protocolo <strong>{protocolo}</strong>. Acompanhe na lista de solicitações.</div>
      <button className="botao pequeno" onClick={() => navegar('/govinfra/solicitacoes')}>Ver lista</button>
    </div>}

    {/* Barra de rascunho compacta */}
    {rascunhoLocal && !protocolo && (
      <div className="wizard-rascunho">
        <div className="wizard-rascunho-info">
          <Clock size={15}/> Rascunho salvo às {new Date(rascunhoLocal.salvo_em).toLocaleTimeString('pt-BR')} · etapa {rascunhoLocal.etapa + 1}
        </div>
        <div className="wizard-rascunho-acoes">
          <button className="botao pequeno principal" onClick={continuarRascunho}>Continuar</button>
          <button className="botao pequeno sutil" onClick={descartarRascunho}>Descartar</button>
        </div>
      </div>
    )}

    {/* Grade principal: formulário + painel lateral */}
    <div className="wizard-grade">
      <div className="wizard-corpo">
        {/* ── Etapa 0: Solicitante ──────────────────────────────── */}
        {etapa === 0 && <section>
          <h2 className="wizard-titulo">Quem está solicitando?</h2>
          {recentes.length > 0 && !pessoaSelecionada && (
            <div className="chips-recentes" aria-label="Solicitantes recentes">
              {recentes.map((r) => (
                <button type="button" key={r.id} className="chip-solicitante" onClick={() => selecionarPessoa(r)}><Users size={12}/> {r.nome}</button>
              ))}
            </div>
          )}
          <div className="wizard-busca-envolve" ref={buscadorRef}>
            <div className="wizard-busca">
              <Search size={20}/>
              <input ref={inputRef} autoComplete="off" role="combobox" aria-expanded={dropdownAberto} aria-controls="dropdown-pessoas" aria-autocomplete="list"
                placeholder="Pesquise por nome, CPF, telefone ou endereço..."
                value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setDropdownAberto(true); setIndiceAtivo((i) => Math.min(i + 1, pessoas.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setIndiceAtivo((i) => Math.max(i - 1, 0)); }
                  if (e.key === 'Enter' && dropdownAberto && pessoas[indiceAtivo]) { e.preventDefault(); selecionarPessoa(pessoas[indiceAtivo]); }
                  if (e.key === 'Escape') setDropdownAberto(false);
                }}/>
              {termoBusca && <button className="wizard-busca-limpar" onClick={() => { setTermoBusca(''); inputRef.current?.focus(); }} aria-label="Limpar"><X size={15}/></button>}
            </div>
            {dropdownAberto && <div className="wizard-dropdown" id="dropdown-pessoas" role="listbox">
              {pessoas.length === 0
                ? <div className="wizard-dropdown-vazio">
                    Nenhum cidadão encontrado para "<strong>{termoBusca}</strong>".
                    <button className="botao principal" style={{ width: '100%' }} onClick={() => { setDropdownAberto(false); setModalAberto(true); }}>
                      <UserRoundPlus size={15}/> Cadastrar {termoBusca} como novo cidadão
                    </button>
                  </div>
                : pessoas.map((p, indice) => (
                    <button type="button" key={p.id} role="option" aria-selected={indice === indiceAtivo}
                      className={`wizard-dropdown-item ${indice === indiceAtivo ? 'ativo' : ''}`} onMouseEnter={() => setIndiceAtivo(indice)}
                      onClick={() => selecionarPessoa(p)}>
                      <div className="wizard-dropdown-item-topo">
                        <span className="wizard-dropdown-nome">{destacar(p.nome)}</span>
                        {p.pessoa_juridica && <span className="chip azul" style={{fontSize:10}}>CNPJ</span>}
                        {p.bloqueios_ativos ? <span className="chip vermelho" style={{fontSize:10}}>{p.bloqueios_ativos} bloqueio(s)</span> : null}
                      </div>
                      <div className="wizard-dropdown-item-meta">
                        {formatarDocumento(p.documento) || '—'} · {formatarTelefone(p.telefone || '') || '—'} · {p.bairro || '—'}
                      </div>
                    </button>
                  ))}
            </div>}
          </div>
          <div className="wizard-busca-acoes">
            <button type="button" className="botao principal" style={{ width: '100%' }} onClick={() => setModalAberto(true)}>
              <UserRoundPlus size={16}/> Não encontrou o cidadão? Cadastrar novo cadastro
            </button>
          </div>

          {pessoaSelecionada && <div className="wizard-pessoa-card">
            <div className="wizard-pessoa-card-topo">
              <div className="wizard-pessoa-avatar">{(pessoaSelecionada.nome[0] || '?').toUpperCase()}</div>
              <div className="wizard-pessoa-info">
                <strong>{pessoaSelecionada.nome}</strong>
                <span>{formatarDocumento(pessoaSelecionada.documento) || (pessoaSelecionada.pessoa_juridica ? 'CNPJ não informado' : 'CPF não informado')} · {formatarTelefone(pessoaSelecionada.telefone || '') || '—'}</span>
                <span className="wizard-pessoa-endereco"><MapPin size={11}/> {pessoaSelecionada.bairro || 'Sem bairro'}</span>
              </div>
              <button type="button" className="botao pequeno sutil" onClick={trocarPessoa}>Trocar</button>
            </div>
            <div className="wizard-pessoa-card-extra">
              {temBloqueios && <span className="wizard-tag vermelho"><ShieldCheck size={12}/> {bloqueiosVerificados?.total} bloqueio(s) ativo(s)</span>}
              {!temBloqueios && <span className="wizard-tag verde"><CheckCircle2 size={12}/> Sem bloqueios</span>}
              {totalSolicitacoes > 0 && <span className="wizard-tag cinza">{totalSolicitacoes} solicitação(ões) anterior(es)</span>}
            </div>
            {imoveis.length > 0 && (
              <div className="wizard-pessoa-card-imoveis">
                <span className="wizard-subtitulo">Imóveis vinculados</span>
                {imoveis.map((im) => (
                  <button type="button" key={im.id} className={`wizard-imovel-item ${form.imovel_id === im.id ? 'selecionado' : ''}`} onClick={() => selecionarImovel(im)}>
                    <MapPin size={14}/> <span>{im.nome || im.codigo} — {[im.logradouro, im.numero, im.bairro].filter(Boolean).join(', ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>}
        </section>}

        {/* ── Etapa 1: Local ────────────────────────────────────── */}
        {etapa === 1 && <section>
          <h2 className="wizard-titulo">Local de instalação</h2>
          <div className="form-grade">
            <div className="campo"><label>Logradouro</label><input value={form.logradouro || ''} onChange={(e) => set('logradouro', e.target.value)}/></div>
            <div className="campo"><label>Número</label><input value={form.numero || ''} onChange={(e) => set('numero', e.target.value)}/></div>
            <div className="campo"><label>Bairro</label><input value={form.bairro || ''} onChange={(e) => set('bairro', e.target.value)}/></div>
            <div className="campo"><label>Referência</label><input value={form.referencia || ''} onChange={(e) => set('referencia', e.target.value)} placeholder="Próximo a…"/></div>
            <div className="campo campo-texto"><label>Instruções para entrega</label><textarea rows={2} value={form.instrucoes_entrega || ''} onChange={(e) => set('instrucoes_entrega', e.target.value)}/></div>
          </div>
          <label className="camada-toggle margem-topo"><input type="checkbox" checked={!!form.espaco_confirmado} onChange={(e) => set('espaco_confirmado', e.target.checked)}/> Espaço disponível para caçamba</label><br/>
          <label className="camada-toggle"><input type="checkbox" checked={!!form.acesso_caminhao_confirmado} onChange={(e) => set('acesso_caminhao_confirmado', e.target.checked)}/> Acesso de caminhão garantido</label><br/>
          <label className="camada-toggle"><input type="checkbox" checked={!!form.exige_autorizacao_especial} onChange={(e) => set('exige_autorizacao_especial', e.target.checked)}/> Necessita autorização especial</label>
        </section>}

        {/* ── Etapa 2: Material ──────────────────────────────────── */}
        {etapa === 2 && <section>
          <h2 className="wizard-titulo">Tipo de material/resíduo</h2>
          <div className="form-grade">
            <div className="campo"><label>Tipo de resíduo *</label><select value={form.tipo_residuo_id || ''} onChange={(e) => set('tipo_residuo_id', e.target.value)}><option value="">Selecione…</option>{residuos.map((r) => <option key={r.id} value={r.id}>{r.nome}{r.proibido ? ' (proibido)' : ''}</option>)}</select></div>
            <div className="campo"><label>Quantidade estimada (m³)</label><input type="number" min="0" step="0.5" value={form.quantidade_estimada_m3 || ''} onChange={(e) => set('quantidade_estimada_m3', Number(e.target.value))}/></div>
            <div className="campo"><label>Origem do material</label><input value={form.origem_material || ''} onChange={(e) => set('origem_material', e.target.value)} placeholder="Reforma, construção…"/></div>
            <div className="campo campo-texto"><label>Descrição do material</label><textarea rows={2} value={form.descricao_material || ''} onChange={(e) => set('descricao_material', e.target.value)}/></div>
          </div>
          <div className="aviso-regras margem-topo"><strong>Proibidos:</strong> material químico, orgânico e hospitalar. Descarte irregular gera bloqueio do solicitante.</div>
          <label className="camada-toggle margem-topo"><input type="checkbox" checked={!!form.ciente_itens_proibidos} onChange={(e) => set('ciente_itens_proibidos', e.target.checked)}/> O solicitante está ciente dos itens proibidos *</label>
        </section>}

        {/* ── Etapa 3: Agendamento ───────────────────────────────── */}
        {etapa === 3 && <section>
          <h2 className="wizard-titulo">Agendamento</h2>
          <div className="form-grade">
            <div className="campo"><label>Data desejada</label><input type="date" value={form.data_desejada || ''} onChange={(e) => set('data_desejada', e.target.value)}/></div>
            <div className="campo"><label>Dias previstos</label><input type="number" min="1" max="30" value={form.dias_previstos || ''} onChange={(e) => set('dias_previstos', Number(e.target.value))} placeholder="3"/></div>
            <div className="campo"><label>Prioridade</label><select value={form.prioridade} onChange={(e) => set('prioridade', e.target.value)}><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></div>
          </div>
          <button className="botao margem-topo" onClick={recomendar}>Sugerir melhor data</button>
          {recomendacoes.length > 0 && <div className="grade-painel margem-topo">{recomendacoes.map((opcao) => (
            <button type="button" key={opcao.data} className={`opcao-data ${form.data_desejada === opcao.data ? 'recomendada' : ''}`} onClick={() => set('data_desejada', opcao.data)}>
              <div className="data">{new Date(opcao.data).toLocaleDateString('pt-BR')}</div>
              <div className="pontos">Pontuação {opcao.pontuacao} · confiança {opcao.confianca}%</div>
              {opcao.motivos_favoraveis.length > 0 && <div className="motivos">✓ {opcao.motivos_favoraveis.join('; ')}</div>}
              {opcao.alertas.length > 0 && <div className="motivos">⚠ {opcao.alertas.join('; ')}</div>}
              {opcao.impedimentos.length > 0 && <div className="impedimentos">✗ {opcao.impedimentos.join('; ')}</div>}
            </button>
          ))}</div>}
        </section>}

        {/* ── Etapa 4: Confirmação ────────────────────────────────── */}
        {etapa === 4 && !protocolo && <section>
          <h2 className="wizard-titulo">Confirmação</h2>
          <div className="resumo-confirmacao">
            <h3>Resumo da solicitação</h3>
            <div className="detalhe-grade">
              <div className="detalhe-campo"><div className="rotulo">Solicitante</div><div className="valor">{pessoaSelecionada?.nome || '—'}</div></div>
              <div className="detalhe-campo"><div className="rotulo">Endereço</div><div className="valor">{enderecoPreenchido || '—'}</div></div>
              <div className="detalhe-campo"><div className="rotulo">Resíduo</div><div className="valor">{residuos.find((r) => r.id === form.tipo_residuo_id)?.nome || '—'}</div></div>
              <div className="detalhe-campo"><div className="rotulo">Data desejada</div><div className="valor">{form.data_desejada ? new Date(form.data_desejada).toLocaleDateString('pt-BR') : '—'}</div></div>
              <div className="detalhe-campo"><div className="rotulo">Dias previstos</div><div className="valor">{form.dias_previstos || 3}</div></div>
              <div className="detalhe-campo"><div className="rotulo">Prioridade</div><div className="valor">{form.prioridade}</div></div>
            </div>
          </div>
          <div className="termo-texto margem-topo" id="termo">Declaro estar ciente das regras de utilização da caçamba municipal, responsabilizando-me pelo material depositado e pela devolução do equipamento nas condições em que foi recebido.</div>
          <label className="camada-toggle margem-topo"><input type="checkbox" checked={!!form.termo_aceito} onChange={(e) => set('termo_aceito', e.target.checked)}/> O solicitante aceita o termo de responsabilidade *</label>
        </section>}

        {/* Navegação */}
        <div className="wizard-navegacao">
          <div className="wizard-navegacao-esquerda">
            {etapa > 0 && !protocolo && <button className="botao" onClick={() => setEtapa(etapa - 1)}>Voltar</button>}
          </div>
          <div className="wizard-navegacao-direita">
            {etapa < 3 && <button className="botao principal wizard-botao-largo" disabled={!podeAvancar()} onClick={() => setEtapa(etapa + 1)}>Próximo passo <ChevronRight size={17}/></button>}
            {etapa === 3 && <button className="botao principal wizard-botao-largo" onClick={() => setEtapa(4)}>Revisar e confirmar <ChevronRight size={17}/></button>}
            {etapa === 4 && !protocolo && <>
              <button className="botao" disabled={salvando} onClick={() => salvar(true)}><Save size={16}/> Salvar rascunho</button>
              <button className="botao principal wizard-botao-largo" disabled={salvando || !form.termo_aceito} onClick={() => salvar()}>{salvando ? 'Registrando…' : 'Registrar solicitação'}</button>
            </>}
          </div>
        </div>
        {motivo && <div className="helper-botao" role="status"><Info size={14}/> {motivo}</div>}
      </div>

      {/* Painel lateral inteligente */}
      <aside className="wizard-painel" aria-label="Resumo do preenchimento">
        <h3>Resumo</h3>
        {itensPainel.every((i) => !i.valor)
          ? <p className="wizard-painel-vazio">As informações aparecem aqui conforme você avança.</p>
          : <div className="wizard-painel-itens">
            {itensPainel.map((item) => (
              <div key={item.rotulo} className={`wizard-painel-item ${item.estado}`}>
                <span className="wizard-painel-item-icone">{item.icone}</span>
                <div className="wizard-painel-item-conteudo">
                  <span className="wizard-painel-item-rotulo">{item.rotulo}</span>
                  <span className="wizard-painel-item-valor">{item.valor || '—'}</span>
                </div>
                {item.estado === 'ok' && <CheckCircle2 size={14} className="wizard-painel-check"/>}
              </div>
            ))}
          </div>}
        {etapa === 0 && temBloqueios && (
          <div className="wizard-painel-alerta">
            <ShieldCheck size={14}/> {bloqueiosVerificados?.total} bloqueio(s) ativo(s)
          </div>
        )}
      </aside>
    </div>

    {modalAberto && <ModalCadastroPremium fechar={() => setModalAberto(false)} aoCriar={aoCriarPessoa}/>}
  </div>;
}
