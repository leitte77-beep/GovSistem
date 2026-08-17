import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Plus, Trash2, AlertTriangle } from "lucide-react";
import { servicoFamiliaRapida } from "@/nucleo/api/servicosFase2";
import { z } from "zod";
import { avisar } from "@/ui/Toast";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import { EstadoSemPermissao } from "@/ui/EstadoSemPermissao";
import { useId } from "react";

const esquemaMembro = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200),
  parentesco: z.string().min(1),
});

const esquemaCadastro = z.object({
  nome_responsavel: z.string().min(3, "Nome do responsável deve ter pelo menos 3 caracteres"),
  cpf_responsavel: z.string().optional(),
  nis_responsavel: z.string().optional(),
  bairro: z.string().min(1, "Bairro é obrigatório"),
  membros: z.array(esquemaMembro).optional().default([]),
});

type ErrosValidacao = Partial<Record<keyof z.infer<typeof esquemaCadastro>, string>>;

interface MembroRapido { nome: string; parentesco: string; }

export default function CadastroRapido() {
  const navigate = useNavigate();
  const podeCadastrar = usePermissao("familia.cadastrar");
  const idNome = useId();
  const idCpf = useId();
  const idNis = useId();
  const idBairro = useId();
  const idMembroNome = useId();
  const idParentesco = useId();

  const [nomeResp, setNomeResp] = useState("");
  const [cpf, setCpf] = useState("");
  const [nis, setNis] = useState("");
  const [bairro, setBairro] = useState("");
  const [membros, setMembros] = useState<MembroRapido[]>([]);
  const [nomeMembro, setNomeMembro] = useState("");
  const [parentesco, setParentesco] = useState("OUTRO_PARENTE");
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<ErrosValidacao>({});
  const [erroMembro, setErroMembro] = useState("");

  if (!podeCadastrar) return <EstadoSemPermissao />;

  const adicionarMembro = () => {
    setErroMembro("");
    if (!nomeMembro.trim()) {
      setErroMembro("Nome do membro é obrigatório");
      return;
    }
    if (nomeMembro.trim().length < 2) {
      setErroMembro("Nome deve ter pelo menos 2 caracteres");
      return;
    }
    setMembros([...membros, { nome: nomeMembro.trim(), parentesco }]);
    setNomeMembro("");
  };

  const removerMembro = (i: number) => {
    setMembros(membros.filter((_, j) => j !== i));
  };

  const salvar = async () => {
    setErros({});
    const dados = {
      nome_responsavel: nomeResp.trim(),
      cpf_responsavel: cpf || undefined,
      nis_responsavel: nis || undefined,
      bairro: bairro.trim() || "Não informado",
      membros,
    };

    const resultado = esquemaCadastro.safeParse(dados);
    if (!resultado.success) {
      const campoErros: ErrosValidacao = {};
      for (const issue of resultado.error.issues) {
        const campo = issue.path[0] as keyof ErrosValidacao;
        if (!campoErros[campo]) campoErros[campo] = issue.message;
      }
      setErros(campoErros);
      return;
    }

    setSalvando(true);
    try {
      const result = (await servicoFamiliaRapida.criar(dados)) as { family_id: string };
      if (!result?.family_id) throw new Error("Resposta inesperada do servidor");
      avisar.sucesso("Família cadastrada com sucesso!");
      navigate(`/familias/${result.family_id}`);
    } catch (e: unknown) {
      const err = e as { body?: { detail?: string }; message?: string };
      const msg = err?.body?.detail || err?.message || "Erro ao cadastrar família";
      avisar.erro(msg);
    }
    setSalvando(false);
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2"><Zap className="w-5 h-5" /> Cadastro Rápido de Família</h2>

      <div className="space-y-3">
        <div>
          <label htmlFor={idNome} className="text-sm font-semibold text-ink">
            Nome do responsável <span className="text-danger" aria-hidden>*</span>
          </label>
          <input
            id={idNome}
            value={nomeResp}
            onChange={e => { setNomeResp(e.target.value); setErros(e => ({ ...e, nome_responsavel: undefined })); }}
            placeholder="Nome do responsável"
            required
            className={`w-full rounded-input border bg-surface px-3 text-ink min-h-[44px] focus-visible:outline-focus ${erros.nome_responsavel ? "border-danger" : "border-ink-soft/30"}`}
          />
          {erros.nome_responsavel && <p className="text-danger text-xs mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {erros.nome_responsavel}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={idCpf} className="text-sm font-semibold text-ink">CPF</label>
            <input id={idCpf} value={cpf} onChange={e => setCpf(e.target.value)} placeholder="CPF" className="w-full rounded-input border bg-surface px-3 text-ink min-h-[44px] border-ink-soft/30 focus-visible:outline-focus" />
          </div>
          <div>
            <label htmlFor={idNis} className="text-sm font-semibold text-ink">NIS</label>
            <input id={idNis} value={nis} onChange={e => setNis(e.target.value)} placeholder="NIS" className="w-full rounded-input border bg-surface px-3 text-ink min-h-[44px] border-ink-soft/30 focus-visible:outline-focus" />
          </div>
        </div>
        <div>
          <label htmlFor={idBairro} className="text-sm font-semibold text-ink">
            Bairro <span className="text-danger" aria-hidden>*</span>
          </label>
          <input
            id={idBairro}
            value={bairro}
            onChange={e => { setBairro(e.target.value); setErros(e => ({ ...e, bairro: undefined })); }}
            placeholder="Bairro"
            required
            className={`w-full rounded-input border bg-surface px-3 text-ink min-h-[44px] focus-visible:outline-focus ${erros.bairro ? "border-danger" : "border-ink-soft/30"}`}
          />
          {erros.bairro && <p className="text-danger text-xs mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {erros.bairro}</p>}
        </div>
      </div>

      <div className="border-t border-ink-soft/15 pt-3">
        <h3 className="font-medium text-sm mb-2">Membros adicionais</h3>
        {membros.map((m, i) => (
          <div key={i} className="flex justify-between items-center text-sm py-1 border-b border-ink-soft/15">
            <span>{m.nome} — {m.parentesco}</span>
            <button onClick={() => removerMembro(i)} title="Remover membro" className="text-danger hover:brightness-110 focus-visible:outline-focus rounded p-0.5"><Trash2 className="w-3 h-3" /></button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <div className="flex-1">
            <label htmlFor={idMembroNome} className="apenas-leitor">Nome do membro</label>
            <input
              id={idMembroNome}
              value={nomeMembro}
              onChange={e => { setNomeMembro(e.target.value); setErroMembro(""); }}
              placeholder="Nome do membro"
              className={`w-full rounded-input border bg-surface px-3 text-ink min-h-[44px] border-ink-soft/30 focus-visible:outline-focus ${erroMembro ? "border-danger" : ""}`}
            />
            {erroMembro && <p className="text-danger text-xs mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {erroMembro}</p>}
          </div>
          <div>
            <label htmlFor={idParentesco} className="apenas-leitor">Parentesco</label>
            <select id={idParentesco} value={parentesco} onChange={e => setParentesco(e.target.value)} className="rounded-input border bg-surface px-3 text-ink min-h-[44px] border-ink-soft/30 focus-visible:outline-focus">
              <option value="CONJUGE">Cônjuge</option><option value="FILHO">Filho(a)</option>
              <option value="ENTEADO">Enteado(a)</option><option value="PAI">Pai</option>
              <option value="MAE">Mãe</option><option value="AVO">Avô/Avó</option>
              <option value="NETO">Neto(a)</option><option value="IRMAO">Irmão/Irmã</option>
              <option value="OUTRO_PARENTE">Outro parente</option><option value="NAO_PARENTE">Não parente</option>
            </select>
          </div>
          <button onClick={adicionarMembro} className="self-end bg-surface border border-ink-soft/30 rounded-input min-h-[44px] px-3 hover:border-primary hover:text-primary focus-visible:outline-focus" title="Adicionar membro"><Plus className="w-4 h-4" /></button>
        </div>
      </div>

      {membros.length > 0 && (
        <p className="text-xs text-ink-soft">{membros.length} membro(s) adicionado(s)</p>
      )}

      <button
        onClick={salvar}
        disabled={!nomeResp || salvando}
        className="w-full bg-primary text-white py-2.5 rounded-input font-semibold text-sm min-h-[44px] disabled:opacity-60 hover:brightness-110 transition-[filter] focus-visible:outline-focus"
      >
        {salvando ? "Salvando..." : "Cadastrar Família"}
      </button>
    </div>
  );
}
