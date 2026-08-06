import {
  Building2, ChevronRight, Edit3, ExternalLink, History, MoreVertical,
  Plus, RefreshCw, Search, Trash2, Users, X, FolderOpen, UserCog, CheckCircle2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ErroApi } from '../api/cliente';
import { Carregando, Chip, ErroEstado, Modal, Vazio } from '../componentes/Comuns';
import { useAviso } from '../contexto/AvisoContexto';
import type { Pagina, Secretaria, Setor, Usuario } from '../types';
import { formatarData, rotulo } from '../utils';

const ABAS = ['usuarios', 'secretarias', 'setores'] as const;
type Aba = (typeof ABAS)[number];

const ROTULOS_ABA: Record<Aba, string> = {
  usuarios: 'Usuários',
  secretarias: 'Secretarias',
  setores: 'Setores',
};

export function pluralizar(valor: number, singular: string, plural?: string) {
  if (valor === 0) return `nenhum ${plural ?? `${singular}s`}`;
  if (valor === 1) return `1 ${singular}`;
  return `${valor} ${plural ?? `${singular}s`}`;
}

function Contagem({ valor, singular, plural }: { valor: number; singular: string; plural?: string }) {
  return <span className="mini-indicador"><strong>{valor.toLocaleString('pt-BR')}</strong> {valor === 1 ? singular : (plural ?? `${singular}s`)}</span>;
}

type FormSecretaria = { id?: string; nome: string; sigla: string; descricao: string; responsavel: string; cor: string; ativo: boolean };
type FormSetor = { id?: string; secretaria_id: string; nome: string; sigla: string; descricao: string; responsavel: string; ativo: boolean };

const CORES = ['#2563eb', '#0f766e', '#b45309', '#9333ea', '#be123c', '#15803d', '#475569', '#0e7490'];

function Campo({ rotulo, children, obrigatorio }: { rotulo: string; children: React.ReactNode; obrigatorio?: boolean }) {
  return <div className="campo"><label>{rotulo}{obrigatorio && <span className="obrigatorio">*</span>}</label>{children}</div>;
}

function FormSecretariaModal({ fechar, inicial, aoSalvar }: {
  fechar: () => void; inicial?: Secretaria; aoSalvar: (dados: FormSecretaria) => Promise<void>;
}) {
  const [form, setForm] = useState<FormSecretaria>({
    id: inicial?.id,
    nome: inicial?.nome || '',
    sigla: inicial?.sigla || '',
    descricao: inicial?.descricao || '',
    responsavel: inicial?.responsavel || '',
    cor: inicial?.cor || CORES[0],
    ativo: inicial?.ativo ?? true,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [fechado, setFechado] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro('');
    try {
      await aoSalvar(form);
      setFechado(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally { setSalvando(false); }
  }
  if (fechado) return null;
  return (
    <Modal titulo={inicial ? 'Editar secretaria' : 'Nova secretaria'} fechar={fechar}
      rodape={<>
        <button type="button" className="botao" onClick={fechar}>Cancelar</button>
        <button type="submit" form="form-secretaria" className="botao principal" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </>}>
      <form id="form-secretaria" onSubmit={salvar}>
        <div className="linha-campos">
          <Campo rotulo="Nome" obrigatorio><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required minLength={2} autoFocus/></Campo>
          <Campo rotulo="Sigla" obrigatorio><input value={form.sigla} onChange={(e) => setForm({ ...form, sigla: e.target.value.toUpperCase() })} required maxLength={30}/></Campo>
        </div>
        <Campo rotulo="Descrição"><textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="O que esta secretaria faz? (ex.: gestão de documentos da área de saúde)"/></Campo>
        <Campo rotulo="Responsável"><input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} placeholder="Nome de quem responde pela secretaria"/></Campo>
        <Campo rotulo="Cor"><div className="linha-cores">{CORES.map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} className={`cor ${form.cor === c ? 'ativa' : ''}`} style={{ background: c }} onClick={() => setForm({ ...form, cor: c })}/>)}</div></Campo>
        <label className="caixa-marcacao"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })}/> Secretaria ativa</label>
        {erro && <div className="aviso erro"><X size={18}/><div className="texto">{erro}</div></div>}
      </form>
    </Modal>
  );
}

function FormSetorModal({ fechar, inicial, secretarias, aoSalvar }: {
  fechar: () => void; inicial?: Setor; secretarias: Secretaria[];
  aoSalvar: (dados: FormSetor) => Promise<void>;
}) {
  const [form, setForm] = useState<FormSetor>({
    id: inicial?.id,
    secretaria_id: inicial?.secretaria_id || secretarias[0]?.id || '',
    nome: inicial?.nome || '',
    sigla: inicial?.sigla || '',
    descricao: inicial?.descricao || '',
    responsavel: inicial?.responsavel || '',
    ativo: inicial?.ativo ?? true,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [fechado, setFechado] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro('');
    try {
      await aoSalvar(form);
      setFechado(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally { setSalvando(false); }
  }
  if (fechado) return null;
  return (
    <Modal titulo={inicial ? 'Editar setor' : 'Novo setor'} fechar={fechar}
      rodape={<>
        <button type="button" className="botao" onClick={fechar}>Cancelar</button>
        <button type="submit" form="form-setor" className="botao principal" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </>}>
      <form id="form-setor" onSubmit={salvar}>
        <div className="linha-campos">
          <Campo rotulo="Nome" obrigatorio><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required minLength={2} autoFocus/></Campo>
          <Campo rotulo="Sigla"><input value={form.sigla} onChange={(e) => setForm({ ...form, sigla: e.target.value.toUpperCase() })} maxLength={30}/></Campo>
        </div>
        <Campo rotulo="Secretaria" obrigatorio>
          <select value={form.secretaria_id} onChange={(e) => setForm({ ...form, secretaria_id: e.target.value })} required>
            {secretarias.filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          {inicial && <div className="ajuda">Trocar a secretaria aqui também move o setor entre secretarias.</div>}
        </Campo>
        <Campo rotulo="Descrição"><textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Atribuições do setor"/></Campo>
        <Campo rotulo="Responsável"><input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} placeholder="Nome de quem responde pelo setor"/></Campo>
        <label className="caixa-marcacao"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })}/> Setor ativo</label>
        {erro && <div className="aviso erro"><X size={18}/><div className="texto">{erro}</div></div>}
      </form>
    </Modal>
  );
}

function ConfirmarModal({ titulo, mensagem, detalhe, rotuloConfirmar, aoConfirmar, cancelar, emPerigo = false }: {
  titulo: string; mensagem: string; detalhe?: string;
  rotuloConfirmar: string; aoConfirmar: () => void; cancelar: () => void; emPerigo?: boolean;
}) {
  return (
    <Modal titulo={titulo} fechar={cancelar} rodape={<>
      <button type="button" className="botao" onClick={cancelar}>Cancelar</button>
      <button type="button" className={`botao ${emPerigo ? 'perigo' : 'principal'}`} onClick={aoConfirmar}>{rotuloConfirmar}</button>
    </>}>
      <p className="corpo-mensagem">{mensagem}</p>
      {detalhe && <p className="texto-secundario">{detalhe}</p>}
    </Modal>
  );
}

function FormUsuarioModal({ fechar, usuario, secretarias, setores, aoSalvar }: {
  fechar: () => void; usuario: Usuario; secretarias: Secretaria[]; setores: Setor[];
  aoSalvar: (dados: { secretaria_id: string | null; setor_id: string | null; perfil: string; cargo: string; ativo: boolean }) => Promise<void>;
}) {
  const [secretariaId, setSecretariaId] = useState(usuario.secretaria_id || '');
  const [setorId, setSetorId] = useState(usuario.setor_id || '');
  const [perfil, setPerfil] = useState(usuario.perfil);
  const [cargo, setCargo] = useState(usuario.cargo || '');
  const [ativo, setAtivo] = useState(usuario.ativo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [fechado, setFechado] = useState(false);

  const setoresDaSecretaria = setores.filter((s) => s.secretaria_id === secretariaId);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro('');
    try {
      await aoSalvar({
        secretaria_id: secretariaId || null,
        setor_id: setorId || null,
        perfil,
        cargo,
        ativo,
      });
      setFechado(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally { setSalvando(false); }
  }
  if (fechado) return null;
  return (
    <Modal titulo={`Vínculo de ${usuario.nome}`} fechar={fechar}
      rodape={<>
        <button type="button" className="botao" onClick={fechar}>Cancelar</button>
        <button type="submit" form="form-usuario" className="botao principal" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </>}>
      <form id="form-usuario" onSubmit={salvar}>
        <div className="linha-campos">
          <Campo rotulo="Secretaria">
            <select value={secretariaId} onChange={(e) => { setSecretariaId(e.target.value); setSetorId(''); }}>
              <option value="">Sem secretaria</option>
              {secretarias.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Setor">
            <select value={setorId} onChange={(e) => setSetorId(e.target.value)} disabled={!secretariaId}>
              <option value="">Sem setor</option>
              {setoresDaSecretaria.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </Campo>
        </div>
        <div className="linha-campos">
          <Campo rotulo="Perfil">
            <select value={perfil} onChange={(e) => setPerfil(e.target.value)}>
              <option value="colaborador">Colaborador</option>
              <option value="admin_secretaria">Administrador de secretaria</option>
              <option value="gestor_setor">Gestor de setor</option>
              <option value="leitor">Leitor</option>
              <option value="auditor">Auditor</option>
              <option value="admin_geral">Administrador geral</option>
            </select>
          </Campo>
          <Campo rotulo="Cargo"><input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex.: Diretor de TI"/></Campo>
        </div>
        <label className="caixa-marcacao"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)}/> Usuário ativo</label>
        {erro && <div className="aviso erro"><X size={18}/><div className="texto">{erro}</div></div>}
      </form>
    </Modal>
  );
}

function MenuKebab({ itens }: { itens: Array<{ rotulo: string; icone?: React.ReactNode; aoClicar: () => void; perigo?: boolean }> }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    function aoEscapar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoEscapar);
    return () => { document.removeEventListener('mousedown', aoClicarFora); document.removeEventListener('keydown', aoEscapar); };
  }, []);

  return (
    <div className="menu-kebab" ref={ref}>
      <button className="botao sutil icone" aria-label="Ações" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}><MoreVertical size={18}/></button>
      {aberto && <div className="menu-flutuante" role="menu">
        {itens.map((i) => <button key={i.rotulo} role="menuitem" className={i.perigo ? 'perigo' : ''} onClick={() => { setAberto(false); i.aoClicar(); }}>{i.icone}{i.rotulo}</button>)}
      </div>}
    </div>
  );
}

export function Administracao() {
  const avisar = useAviso();
  const [buscaUrl, setBuscaUrl] = useSearchParams();
  const abaAtual = buscaUrl.get('aba') as Aba | null;
  const aba = ABAS.includes(abaAtual as Aba) ? (abaAtual as Aba) : 'usuarios';

  const [usuarios, setUsuarios] = useState<Pagina<Usuario>>();
  const [secretarias, setSecretarias] = useState<Secretaria[]>();
  const [setores, setSetores] = useState<Setor[]>();
  const [instituicao, setInstituicao] = useState<{ ultima_sincronizacao?: string }>();
  const [chave, setChave] = useState(0);
  const [termo, setTermo] = useState('');
  const [filtroPerfil, setFiltroPerfil] = useState('');
  const [filtroSecretaria, setFiltroSecretaria] = useState('');

  const [formSecretaria, setFormSecretaria] = useState<{ aberto: boolean; inicial?: Secretaria }>({ aberto: false });
  const [formSetor, setFormSetor] = useState<{ aberto: boolean; inicial?: Setor }>({ aberto: false });
  const [formUsuario, setFormUsuario] = useState<Usuario>();
  const [desativar, setDesativar] = useState<{ tipo: 'secretaria' | 'setor'; item: Secretaria | Setor; total_documentos: number } | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  function mudarAba(nova: Aba) {
    setBuscaUrl({ aba: nova }, { replace: true });
  }

  useEffect(() => {
    Promise.all([
      api.get<Pagina<Usuario>>('/usuarios?por_pagina=200'),
      api.get<Secretaria[]>('/secretarias?com_consumo=true'),
      api.get<Setor[]>('/setores?com_consumo=true'),
      api.get<any>('/instituicao').catch(() => undefined),
    ]).then(([u, s, d, i]) => {
      setUsuarios(u); setSecretarias(s); setSetores(d); setInstituicao(i);
    }).catch((e) => avisar(e.message, 'erro'));
  }, [chave, avisar]);

  const ativosSecretarias = useMemo(() => (secretarias || []).filter((s) => s.ativo), [secretarias]);

  const usuariosFiltrados = useMemo(() => {
    if (!usuarios) return [];
    const t = termo.trim().toLowerCase();
    return usuarios.itens.filter((u) => {
      if (t && !`${u.nome} ${u.email}`.toLowerCase().includes(t)) return false;
      if (filtroPerfil && u.perfil !== filtroPerfil) return false;
      if (filtroSecretaria && u.secretaria_id !== filtroSecretaria) return false;
      return true;
    });
  }, [usuarios, termo, filtroPerfil, filtroSecretaria]);

  const secretariasFiltradas = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (!t) return secretarias || [];
    return (secretarias || []).filter((s) => `${s.nome} ${s.sigla} ${s.descricao || ''}`.toLowerCase().includes(t));
  }, [secretarias, termo]);

  const setoresFiltrados = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (!t) return setores || [];
    return (setores || []).filter((s) => `${s.nome} ${s.secretaria_nome || ''} ${s.responsavel || ''}`.toLowerCase().includes(t));
  }, [setores, termo]);

  const perfisDisponiveis = useMemo(() => {
    const set = new Set((usuarios?.itens || []).map((u) => u.perfil));
    return [...set];
  }, [usuarios]);

  async function salvarSecretaria(dados: FormSecretaria) {
    const corpo = {
      nome: dados.nome,
      sigla: dados.sigla,
      descricao: dados.descricao || null,
      responsavel: dados.responsavel || null,
      cor: dados.cor,
      ativo: dados.ativo,
    };
    if (dados.id) {
      await api.put(`/secretarias/${dados.id}`, corpo);
      avisar('Secretaria atualizada.');
    } else {
      await api.post('/secretarias', corpo);
      avisar('Secretaria criada.');
    }
    setChave((v) => v + 1);
  }

  async function salvarSetor(dados: FormSetor) {
    const corpo = {
      secretaria_id: dados.secretaria_id,
      nome: dados.nome,
      sigla: dados.sigla || null,
      descricao: dados.descricao || null,
      responsavel: dados.responsavel || null,
      ativo: dados.ativo,
    };
    if (dados.id) {
      await api.put(`/setores/${dados.id}`, corpo);
      avisar('Setor atualizado.');
    } else {
      await api.post('/setores', corpo);
      avisar('Setor criado.');
    }
    setChave((v) => v + 1);
  }

  async function confirmarDesativar() {
    if (!desativar) return;
    try {
      if (desativar.tipo === 'secretaria') {
        await api.del(`/secretarias/${desativar.item.id}`);
        avisar('Secretaria desativada.');
      } else {
        await api.del(`/setores/${desativar.item.id}`);
        avisar('Setor desativado.');
      }
      setDesativar(null);
      setChave((v) => v + 1);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Falha ao desativar.', 'erro');
    }
  }

  async function sincronizar() {
    setSincronizando(true);
    try {
      const r = await api.post<any>('/instituicao/sincronizar', {});
      avisar(r.mensagem || 'Sincronização concluída.');
      setChave((v) => v + 1);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Falha na sincronização.', 'erro');
    } finally { setSincronizando(false); }
  }

  function editarUsuario(u: Usuario) {
    setFormUsuario(u);
  }

  async function salvarUsuario(dados: { secretaria_id: string | null; setor_id: string | null; perfil: string; cargo: string; ativo: boolean }) {
    await api.put(`/usuarios/${formUsuario?.id}`, {
      secretaria_id: dados.secretaria_id,
      setor_id: dados.setor_id,
      perfil: dados.perfil,
      cargo: dados.cargo || null,
      ativo: dados.ativo,
    });
    avisar('Vínculo do usuário atualizado.');
    setFormUsuario(undefined);
    setChave((v) => v + 1);
  }

  const pronto = usuarios && secretarias && setores;

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Administração</h1>
          <p className="subtitulo">
            Gerencie pessoas e a estrutura organizacional.{' '}
            <Link className="link-govsistem" to="/contas" title="Os usuários são cadastrados na plataforma GovSistem — o GovDoc recebe a identidade via login único (SSO) e pela sincronização.">
              Usuários entram pelo GovSistem <ExternalLink size={13}/>
            </Link>
          </p>
        </div>
        <div className="barra-acoes">
          <button className="botao" onClick={sincronizar} disabled={sincronizando}>
            <RefreshCw size={16} className={sincronizando ? 'giro' : ''}/> Sincronizar agora
          </button>
          {aba === 'secretarias' && <button className="botao principal" onClick={() => setFormSecretaria({ aberto: true })}><Plus size={16}/> Nova secretaria</button>}
          {aba === 'setores' && <button className="botao principal" onClick={() => setFormSetor({ aberto: true })} disabled={ativosSecretarias.length === 0}><Plus size={16}/> Novo setor</button>}
        </div>
      </div>

      <div className="abas" role="tablist" aria-label="Seções da administração">
        {ABAS.map((a) => {
          const contagem = a === 'usuarios' ? usuarios?.total : a === 'secretarias' ? secretarias?.length : setores?.length;
          return (
            <button key={a} role="tab" id={`aba-${a}`} aria-selected={aba === a} aria-controls={`painel-${a}`}
              className={`aba ${aba === a ? 'ativa' : ''}`} onClick={() => mudarAba(a)}>
              {ROTULOS_ABA[a]}
              {contagem !== undefined && <span className="contador-aba">{contagem}</span>}
            </button>
          );
        })}
      </div>

      <div className="cartao barra-pesquisa margem-baixo">
        <Search size={19}/>
        <input value={termo} onChange={(e) => setTermo(e.target.value)}
          placeholder={aba === 'usuarios' ? 'Buscar por nome ou e-mail…' : aba === 'secretarias' ? 'Buscar secretarias…' : 'Buscar setores…'}
          aria-label="Buscar"/>
        {termo && <button className="botao sutil icone" aria-label="Limpar busca" onClick={() => setTermo('')}><X size={17}/></button>}
      </div>

      {!pronto ? <Carregando/> : aba === 'usuarios' ? (
        <div role="tabpanel" id="painel-usuarios" aria-labelledby="aba-usuarios">
          <div className="cartao filtros-compactos">
            <label>Perfil <select value={filtroPerfil} onChange={(e) => setFiltroPerfil(e.target.value)} aria-label="Filtrar por perfil">
              <option value="">Todos</option>
              {perfisDisponiveis.map((p) => <option key={p} value={p}>{rotulo(p)}</option>)}
            </select></label>
            <label>Secretaria <select value={filtroSecretaria} onChange={(e) => setFiltroSecretaria(e.target.value)} aria-label="Filtrar por secretaria">
              <option value="">Todas</option>
              {secretarias.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select></label>
            <span className="texto-secundario">{usuariosFiltrados.length} de {usuarios.total} usuário(s)</span>
          </div>
          {usuariosFiltrados.length === 0 ? (
            <Vazio titulo="Nenhum usuário encontrado" texto="Os usuários cadastrados na plataforma GovSistem aparecem aqui após a sincronização ou o primeiro acesso. Use 'Sincronizar agora' para buscá-los."/>
          ) : (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead><tr><th>Usuário</th><th>Perfil</th><th>Cargo</th><th>Situação</th><th>Último acesso</th><th><span className="somente-leitores">Ações</span></th></tr></thead>
                <tbody>
                  {usuariosFiltrados.map((u) => (
                    <tr key={u.id}>
                      <td><div className="celula-principal"><Users size={20}/><div><strong>{u.nome}</strong><div className="celula-secundaria">{u.email}</div></div></div></td>
                      <td><Chip cor={u.perfil === 'admin_geral' ? 'azul' : u.perfil === 'auditor' ? 'amarelo' : 'cinza'}>{rotulo(u.perfil)}</Chip></td>
                      <td>{u.cargo || '—'}</td>
                      <td><Chip cor={u.ativo ? 'verde' : 'cinza'}>{u.ativo ? 'Ativo' : 'Inativo'}</Chip></td>
                      <td>{formatarData(u.ultimo_acesso, true)}</td>
                      <td>
                        <MenuKebab itens={[
                          { rotulo: 'Vínculo e perfil', icone: <UserCog size={15}/>, aoClicar: () => editarUsuario(u) },
                          { rotulo: 'Auditoria do usuário', icone: <History size={15}/>, aoClicar: () => avisar('Consulte a trilha em Auditoria.', 'info') },
                        ]}/>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {instituicao && (
            <div className="aviso info margem-topo">
              <RefreshCw size={19}/>
              <div className="texto">
                <div className="titulo">Sincronização com o GovSistem</div>
                Última sincronização: {formatarData(instituicao.ultima_sincronizacao, true)}. Os usuários cadastrados na plataforma são refletidos aqui após a sincronização ou o primeiro acesso.
              </div>
            </div>
          )}
        </div>
      ) : aba === 'secretarias' ? (
        <div role="tabpanel" id="painel-secretarias" aria-labelledby="aba-secretarias">
          {secretariasFiltradas.length === 0 ? (
            <Vazio titulo={secretarias.length === 0 ? 'Nenhuma secretaria ainda' : 'Nenhuma secretaria encontrada'}
              texto={secretarias.length === 0 ? 'Crie a primeira secretaria para organizar setores e documentos.' : 'Ajuste a busca.'}
              acao={secretarias.length === 0 && <button className="botao principal" onClick={() => setFormSecretaria({ aberto: true })}><Plus size={16}/> Criar primeira secretaria</button>}/>
          ) : (
            <div className="grade col-3">
              {secretariasFiltradas.map((s) => (
                <div className={`cartao cartao-secretaria ${s.ativo ? '' : 'inativo'}`} key={s.id} style={{ borderTop: `4px solid ${s.cor}` }}>
                  <div className="entre">
                    <div className="cartao-secretaria-titulo">
                      <Building2 size={19} style={{ color: s.cor }}/>
                      <h2>{s.nome}</h2>
                    </div>
                    <Chip cor={s.ativo ? 'verde' : 'cinza'}>{s.ativo ? 'Ativa' : 'Inativa'}</Chip>
                  </div>
                  {s.descricao ? (
                    <p className="texto-secundario descricao-secretaria">{s.descricao}</p>
                  ) : (
                    <button className="sem-descricao" onClick={() => setFormSecretaria({ aberto: true, inicial: s })}>
                      <Edit3 size={13}/> Adicionar descrição
                    </button>
                  )}
                  <div className="mini-indicadores">
                    <Contagem valor={s.total_setores} singular="setor"/>
                    <Contagem valor={s.total_documentos} singular="documento" plural="documentos"/>
                    <Contagem valor={s.total_usuarios || 0} singular="usuário" plural="usuários"/>
                  </div>
                  {s.responsavel && <div className="texto-secundario responsavel-secretaria"><Users size={13}/> {s.responsavel}</div>}
                  <div className="entre margem-topo cartao-secretaria-rodape">
                    <Link className="botao pequeno" to="/documentos" title="Ver documentos da secretaria"><FolderOpen size={15}/> Documentos</Link>
                    <div className="barra-acoes">
                      <button className="botao pequeno" onClick={() => { setTermo(s.nome); mudarAba('setores'); }} title={`Ver setores de ${s.nome}`}>
                        {pluralizar(s.total_setores, 'setor')} <ChevronRight size={14}/>
                      </button>
                      <MenuKebab itens={[
                        { rotulo: 'Editar', icone: <Edit3 size={15}/>, aoClicar: () => setFormSecretaria({ aberto: true, inicial: s }) },
                        ...(s.ativo ? [{
                          rotulo: 'Desativar', icone: <Trash2 size={15}/>, perigo: true,
                          aoClicar: () => setDesativar({ tipo: 'secretaria', item: s, total_documentos: s.total_documentos }),
                        }] : []),
                        { rotulo: 'Auditoria', icone: <History size={15}/>, aoClicar: () => avisar(`Filtre por secretaria na tela de Auditoria.`, 'info') },
                      ]}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div role="tabpanel" id="painel-setores" aria-labelledby="aba-setores">
          {setoresFiltrados.length === 0 ? (
            <Vazio titulo={setores.length === 0 ? 'Nenhum setor ainda' : 'Nenhum setor encontrado'}
              texto={setores.length === 0 ? 'Crie o primeiro setor para organizar os documentos.' : 'Ajuste a busca.'}
              acao={setores.length === 0 && <button className="botao principal" onClick={() => setFormSetor({ aberto: true })}><Plus size={16}/> Criar primeiro setor</button>}/>
          ) : (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead><tr><th>Setor</th><th>Secretaria</th><th>Responsável</th><th>Documentos</th><th>Usuários</th><th>Situação</th><th><span className="somente-leitores">Ações</span></th></tr></thead>
                <tbody>
                  {setoresFiltrados.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.nome}</strong>{s.sigla && <div className="celula-secundaria">{s.sigla}</div>}</td>
                      <td><Chip>{s.secretaria_nome || '—'}</Chip></td>
                      <td>{s.responsavel || '—'}</td>
                      <td className="numerico">{s.total_documentos || 0}</td>
                      <td className="numerico">{s.total_usuarios || 0}</td>
                      <td><Chip cor={s.ativo ? 'verde' : 'cinza'}>{s.ativo ? 'Ativo' : 'Inativo'}</Chip></td>
                      <td>
                        <div className="barra-acoes">
                          <button className="botao sutil icone" title="Editar" aria-label={`Editar ${s.nome}`} onClick={() => setFormSetor({ aberto: true, inicial: s })}><Edit3 size={16}/></button>
                          <MenuKebab itens={[
                            { rotulo: 'Mover para outra secretaria', icone: <FolderOpen size={15}/>, aoClicar: () => setFormSetor({ aberto: true, inicial: s }) },
                            { rotulo: 'Ver documentos', icone: <FolderOpen size={15}/>, aoClicar: () => window.location.assign('/documentos') },
                            ...(s.ativo ? [{
                              rotulo: 'Desativar', icone: <Trash2 size={15}/>, perigo: true,
                              aoClicar: () => setDesativar({ tipo: 'setor', item: s, total_documentos: s.total_documentos || 0 }),
                            }] : []),
                            { rotulo: 'Auditoria', icone: <History size={15}/>, aoClicar: () => avisar('Filtre por setor na tela de Auditoria.', 'info') },
                          ]}/>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {formSecretaria.aberto && (
        <FormSecretariaModal fechar={() => setFormSecretaria({ aberto: false })}
          inicial={formSecretaria.inicial} aoSalvar={salvarSecretaria}/>
      )}
      {formSetor.aberto && (
        <FormSetorModal fechar={() => setFormSetor({ aberto: false })}
          inicial={formSetor.inicial} secretarias={secretarias || []} aoSalvar={salvarSetor}/>
      )}
      {formUsuario && (
        <FormUsuarioModal fechar={() => setFormUsuario(undefined)} usuario={formUsuario}
          secretarias={secretarias || []} setores={setores || []} aoSalvar={salvarUsuario}/>
      )}
      {desativar && (
        <ConfirmarModal
          titulo={desativar.tipo === 'secretaria' ? 'Desativar secretaria' : 'Desativar setor'}
          mensagem={`Desativar "${desativar.item.nome}"?`}
          detalhe={`${desativar.total_documentos} documento(s) vinculado(s) continuam preservados e acessíveis aos administradores. Você pode reativar depois (editar).`}
          rotuloConfirmar="Desativar" aoConfirmar={confirmarDesativar} cancelar={() => setDesativar(null)} emPerigo
        />
      )}
    </>
  );
}
