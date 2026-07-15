/** Modal para criar novo agendamento na unidade atual */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/ui/Modal";
import { Input } from "@/ui/Input";
import { Select } from "@/ui/Select";
import { Botao } from "@/ui/Botao";
import { avisar } from "@/ui/Toast";
import { servicoAgenda, servicoProfissionais } from "@/nucleo/api/agenda";
import { servicoPessoas } from "@/nucleo/api/pessoas";
import type { AppointmentCreate } from "@/tipos/agenda";
import type { PessoaBuscaItem } from "@/tipos/pessoas";
import { ErroApi } from "@/nucleo/http/problemDetails";

type Props = {
  aberto: boolean;
  aoFechar: () => void;
  unitId: string;
};

const TIPOS = [
  { valor: "ATENDIMENTO", rotulo: "Atendimento" },
  { valor: "VISITA_DOMICILIAR", rotulo: "Visita Domiciliar" },
  { valor: "GRUPO", rotulo: "Grupo" },
  { valor: "REUNIAO", rotulo: "Reunião" },
  { valor: "OUTRO", rotulo: "Outro" },
];

export function ModalNovoAgendamento({ aberto, aoFechar, unitId }: Props) {
  const qc = useQueryClient();

  const [busca, setBusca] = useState("");
  const [pessoaSelecionada, setPessoaSelecionada] = useState<PessoaBuscaItem | null>(null);
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState("08:00");
  const [tipo, setTipo] = useState("ATENDIMENTO");
  const [profissionalId, setProfissionalId] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const pessoasQ = useQuery({
    queryKey: ["pessoas", "busca", busca],
    queryFn: () => servicoPessoas.buscar(busca),
    enabled: busca.length >= 2,
    staleTime: 30_000,
  });

  const profissionaisQ = useQuery({
    queryKey: ["profissionais", unitId],
    queryFn: () => servicoProfissionais.listar(unitId),
    enabled: aberto,
    staleTime: 60_000,
  });

  const criar = useMutation({
    mutationFn: (corpo: AppointmentCreate) => servicoAgenda.criar(corpo),
    onSuccess: (resultado) => {
      avisar.sucesso(
        `Agendamento criado${resultado.senha ? ` — senha ${resultado.senha}` : ""}.`,
      );
      qc.invalidateQueries({ queryKey: ["agenda"] });
      qc.invalidateQueries({ queryKey: ["fila-dia"] });
      limpar();
      aoFechar();
    },
    onError: (e) =>
      avisar.erro(e instanceof ErroApi ? e.message : "Erro ao criar agendamento."),
  });

  function selecionarPessoa(p: PessoaBuscaItem) {
    setPessoaSelecionada(p);
    setBusca(`${p.nome_exibicao} — Família #${p.codigo_familia}`);
  }

  function limpar() {
    setBusca("");
    setPessoaSelecionada(null);
    setData(new Date().toISOString().slice(0, 10));
    setHora("08:00");
    setTipo("ATENDIMENTO");
    setProfissionalId("");
    setObservacoes("");
  }

  function handleSubmit() {
    if (!pessoaSelecionada) {
      avisar.erro("Busque e selecione uma pessoa.");
      return;
    }
    const dataHora = new Date(`${data}T${hora}:00`);
    if (isNaN(dataHora.getTime())) {
      avisar.erro("Data/hora inválida.");
      return;
    }
    criar.mutate({
      unit_id: unitId,
      family_id: pessoaSelecionada.family_id,
      person_id: pessoaSelecionada.person_id,
      tipo,
      data_hora_inicio: dataHora.toISOString(),
      professional_id: profissionalId || null,
      observacoes: observacoes || null,
    });
  }

  const pessoas = pessoasQ.data ?? [];
  const profissionais = profissionaisQ.data ?? [];

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Novo agendamento" tamanho="md">
      <div className="space-y-4">
        <div>
          <Input
            label="Buscar pessoa"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              if (pessoaSelecionada) setPessoaSelecionada(null);
            }}
            placeholder="Digite o nome da pessoa..."
          />
          {busca.length >= 2 && !pessoaSelecionada && (
            <div className="mt-1 max-h-48 overflow-y-auto border border-ink-soft/20 rounded-lg">
              {pessoasQ.isLoading ? (
                <p className="text-xs text-secondary p-2">Buscando...</p>
              ) : pessoas.length === 0 ? (
                <p className="text-xs text-secondary p-2">Nenhuma pessoa encontrada.</p>
              ) : (
                pessoas.map((p) => (
                  <button
                    key={p.person_id}
                    type="button"
                    onClick={() => selecionarPessoa(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surface-container-low transition-colors border-b border-ink-soft/10 last:border-b-0"
                  >
                    <span className="font-medium text-ink">{p.nome_exibicao}</span>
                    <span className="text-xs text-secondary ml-2">
                      Família #{p.codigo_familia}
                      {p.bairro ? ` · ${p.bairro}` : ""}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
          {pessoaSelecionada && (
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xs text-primary font-medium">
                {pessoaSelecionada.nome_exibicao} — Família #{pessoaSelecionada.codigo_familia}
                {pessoaSelecionada.bairro && ` · ${pessoaSelecionada.bairro}`}
              </p>
              <button
                type="button"
                onClick={() => {
                  setPessoaSelecionada(null);
                  setBusca("");
                }}
                className="text-[10px] text-error hover:underline"
              >
                Remover
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <Input label="Hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </div>

        <Select
          label="Tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          opcoes={TIPOS}
        />

        <Select
          label="Profissional"
          value={profissionalId}
          onChange={(e) => setProfissionalId(e.target.value)}
          opcoes={[
            { valor: "", rotulo: "Nenhum (não atribuir)" },
            ...profissionais.map((p) => ({
              valor: p.id,
              rotulo: p.nome,
            })),
          ]}
        />

        <Input
          label="Observações"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Ex: Atualização CadÚnico, orientação sobre BPC..."
        />
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Botao variante="secundario" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao
          variante="primario"
          onClick={handleSubmit}
          disabled={!pessoaSelecionada || criar.isPending}
          carregando={criar.isPending}
        >
          Agendar
        </Botao>
      </div>
    </Modal>
  );
}
