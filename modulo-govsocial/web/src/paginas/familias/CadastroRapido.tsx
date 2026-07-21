import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Plus, Trash2, AlertTriangle } from "lucide-react";
import { servicoFamiliaRapida } from "@/nucleo/api/servicosFase2";
import { z } from "zod";
import toast from "react-hot-toast";

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
      toast.success("Família cadastrada com sucesso!");
      navigate(`/familias/${result.family_id}`);
    } catch (e: unknown) {
      const err = e as { body?: { detail?: string }; message?: string };
      const msg = err?.body?.detail || err?.message || "Erro ao cadastrar família";
      toast.error(msg);
    }
    setSalvando(false);
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2"><Zap className="w-5 h-5" /> Cadastro Rápido de Família</h2>

      <div className="space-y-3">
        <div>
          <input
            value={nomeResp}
            onChange={e => { setNomeResp(e.target.value); setErros(e => ({ ...e, nome_responsavel: undefined })); }}
            placeholder="Nome do responsável *"
            className={`w-full border p-2 rounded text-sm ${erros.nome_responsavel ? "border-red-400" : ""}`}
          />
          {erros.nome_responsavel && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {erros.nome_responsavel}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="CPF" className="border p-2 rounded text-sm" />
          <input value={nis} onChange={e => setNis(e.target.value)} placeholder="NIS" className="border p-2 rounded text-sm" />
        </div>
        <div>
          <input
            value={bairro}
            onChange={e => { setBairro(e.target.value); setErros(e => ({ ...e, bairro: undefined })); }}
            placeholder="Bairro *"
            className={`w-full border p-2 rounded text-sm ${erros.bairro ? "border-red-400" : ""}`}
          />
          {erros.bairro && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {erros.bairro}</p>}
        </div>
      </div>

      <div className="border-t pt-3">
        <h3 className="font-medium text-sm mb-2">Membros adicionais</h3>
        {membros.map((m, i) => (
          <div key={i} className="flex justify-between items-center text-sm py-1 border-b">
            <span>{m.nome} — {m.parentesco}</span>
            <button onClick={() => removerMembro(i)} title="Remover membro"><Trash2 className="w-3 h-3 text-red-400 hover:text-red-600" /></button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <div className="flex-1">
            <input
              value={nomeMembro}
              onChange={e => { setNomeMembro(e.target.value); setErroMembro(""); }}
              placeholder="Nome do membro"
              className={`w-full border p-1.5 rounded text-sm ${erroMembro ? "border-red-400" : ""}`}
            />
            {erroMembro && <p className="text-red-500 text-xs mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {erroMembro}</p>}
          </div>
          <select value={parentesco} onChange={e => setParentesco(e.target.value)} className="border p-1.5 rounded text-sm">
            <option value="CONJUGE">Cônjuge</option><option value="FILHO">Filho(a)</option>
            <option value="ENTEADO">Enteado(a)</option><option value="PAI">Pai</option>
            <option value="MAE">Mãe</option><option value="AVO">Avô/Avó</option>
            <option value="NETO">Neto(a)</option><option value="IRMAO">Irmão/Irmã</option>
            <option value="OUTRO_PARENTE">Outro parente</option><option value="NAO_PARENTE">Não parente</option>
          </select>
          <button onClick={adicionarMembro} className="bg-gray-200 p-1.5 rounded hover:bg-gray-300" title="Adicionar membro"><Plus className="w-4 h-4" /></button>
        </div>
      </div>

      {membros.length > 0 && (
        <p className="text-xs text-gray-500">{membros.length} membro(s) adicionado(s)</p>
      )}

      <button
        onClick={salvar}
        disabled={!nomeResp || salvando}
        className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
      >
        {salvando ? "Salvando..." : "Cadastrar Família"}
      </button>
    </div>
  );
}
