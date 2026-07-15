/** Cadastro Rápido de Família */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Plus, Trash2 } from "lucide-react";
import { servicoFamiliaRapida } from "@/nucleo/api/servicosFase2";

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

  const adicionarMembro = () => {
    if (!nomeMembro.trim()) return;
    setMembros([...membros, { nome: nomeMembro.trim(), parentesco }]);
    setNomeMembro("");
  };

  const salvar = async () => {
    if (!nomeResp.trim()) return;
    setSalvando(true);
    try {
      const result = (await servicoFamiliaRapida.criar({
        nome_responsavel: nomeResp.trim(),
        cpf_responsavel: cpf || undefined,
        nis_responsavel: nis || undefined,
        bairro: bairro || "Não informado",
        membros,
      })) as { family_id: string };
      navigate(`/familias/${result.family_id}`);
    } catch (e) {
      alert("Erro ao cadastrar");
    }
    setSalvando(false);
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2"><Zap className="w-5 h-5" /> Cadastro Rápido de Família</h2>
      <div className="space-y-3">
        <input value={nomeResp} onChange={e => setNomeResp(e.target.value)} placeholder="Nome do responsável *" className="w-full border p-2 rounded text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="CPF" className="border p-2 rounded text-sm" />
          <input value={nis} onChange={e => setNis(e.target.value)} placeholder="NIS" className="border p-2 rounded text-sm" />
        </div>
        <input value={bairro} onChange={e => setBairro(e.target.value)} placeholder="Bairro" className="w-full border p-2 rounded text-sm" />
      </div>
      <div className="border-t pt-3">
        <h3 className="font-medium text-sm mb-2">Membros adicionais</h3>
        {membros.map((m, i) => (
          <div key={i} className="flex justify-between text-sm py-1 border-b">
            <span>{m.nome} — {m.parentesco}</span>
            <button onClick={() => setMembros(membros.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3 text-red-400" /></button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <input value={nomeMembro} onChange={e => setNomeMembro(e.target.value)} placeholder="Nome do membro" className="flex-1 border p-1.5 rounded text-sm" />
          <select value={parentesco} onChange={e => setParentesco(e.target.value)} className="border p-1.5 rounded text-sm">
            <option value="CONJUGE">Cônjuge</option><option value="FILHO">Filho(a)</option>
            <option value="ENTEADO">Enteado(a)</option><option value="PAI">Pai</option>
            <option value="MAE">Mãe</option><option value="AVO">Avô/Avó</option>
            <option value="NETO">Neto(a)</option><option value="IRMAO">Irmão/Irmã</option>
            <option value="OUTRO_PARENTE">Outro parente</option><option value="NAO_PARENTE">Não parente</option>
          </select>
          <button onClick={adicionarMembro} className="bg-gray-200 p-1.5 rounded"><Plus className="w-4 h-4" /></button>
        </div>
      </div>
      <button onClick={salvar} disabled={!nomeResp || salvando} className="w-full bg-blue-600 text-white py-2 rounded font-medium disabled:opacity-50">
        {salvando ? "Salvando..." : "Cadastrar Família"}
      </button>
    </div>
  );
}
