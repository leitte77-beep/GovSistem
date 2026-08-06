/** Importação de Dados — SICON / Sibec */
import { useState } from "react";
import { Upload, FileText, CheckCircle, AlertTriangle } from "lucide-react";
import { servicoImportacao } from "@/nucleo/api/servicosFase2";

export default function ImportarDados() {
  const [tipo, setTipo] = useState<"SICON" | "SIBEC">("SICON");
  const [resultado, setResultado] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCarregando(true);
    setErro(null);
    try {
      const res = tipo === "SICON" ? await servicoImportacao.uploadSicon(file) : await servicoImportacao.uploadSibec(file);
      setResultado(res);
    } catch (err: any) {
      setErro(err?.detail || err?.message || "Erro na importação");
    }
    setCarregando(false);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2"><Upload className="w-5 h-5" /> Importação de Dados</h2>
      <div className="flex gap-2">
        <button onClick={() => setTipo("SICON")} className={`px-4 py-1.5 rounded text-sm ${tipo === "SICON" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>SICON (Condicionalidades)</button>
        <button onClick={() => setTipo("SIBEC")} className={`px-4 py-1.5 rounded text-sm ${tipo === "SIBEC" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>Sibec (Benefícios PBF)</button>
      </div>
      <div className="border-2 border-dashed rounded-lg p-8 text-center">
        <FileText className="w-8 h-8 mx-auto text-gray-400 mb-2" />
        <p className="text-sm text-gray-500 mb-3">Selecione o arquivo CSV do {tipo}</p>
        <label className="bg-blue-600 text-white px-4 py-2 rounded cursor-pointer text-sm">
          {carregando ? "Processando..." : "Selecionar Arquivo"}
          <input type="file" accept=".csv" onChange={handleUpload} className="hidden" disabled={carregando} />
        </label>
      </div>

      {erro && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded"><AlertTriangle className="w-4 h-4" />{erro}</div>
      )}
      {resultado && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700 font-medium mb-2"><CheckCircle className="w-4 h-4" />Importação concluída</div>
          <div className="grid grid-cols-4 gap-4 text-center text-sm">
            <div><div className="font-bold text-green-700">{resultado.novos || 0}</div><div className="text-xs text-gray-500">Novos</div></div>
            <div><div className="font-bold text-blue-700">{resultado.atualizados || 0}</div><div className="text-xs text-gray-500">Atualizados</div></div>
            <div><div className="font-bold text-orange-700">{resultado.conflitos || 0}</div><div className="text-xs text-gray-500">Conflitos</div></div>
            <div><div className="font-bold text-red-700">{resultado.erros || 0}</div><div className="text-xs text-gray-500">Erros</div></div>
          </div>
        </div>
      )}
    </div>
  );
}
