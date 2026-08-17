import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, ShieldCheck } from "lucide-react";

import { Abas } from "@/ui/Abas";
import { Botao } from "@/ui/Botao";
import { Input } from "@/ui/Input";
import { CameraCapture } from "@/ui/CameraCapture";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { servicoReconhecimentoFacial } from "@/nucleo/api/reconhecimentoFacial";
import { servicoPessoas } from "@/nucleo/api/pessoas";
import type { FaceVerificarOut } from "@/tipos/reconhecimentoFacial";
import type { PersonListItem } from "@/tipos/pessoas";

export default function ReconhecimentoFacial() {
  const [abaAtiva, setAbaAtiva] = useState("cadastrar");
  const [busca, setBusca] = useState("");
  const [pessoaSelecionada, setPessoaSelecionada] = useState<PersonListItem | null>(null);
  const [foto, setFoto] = useState("");
  const [resultadoVerificacao, setResultadoVerificacao] = useState<FaceVerificarOut | null>(null);
  const queryClient = useQueryClient();

  const pessoasQuery = useQuery({
    queryKey: ["pessoas-busca-biometria", busca],
    queryFn: () => servicoPessoas.listar(busca),
    enabled: busca.trim().length >= 2,
    staleTime: 15_000,
  });

  const cadastroMutation = useMutation({
    mutationFn: () =>
      servicoReconhecimentoFacial.cadastrar({
        person_id: pessoaSelecionada!.id,
        foto_base64: foto,
        metodo: "FOTO_SIMPLES",
      }),
    onSuccess: () => {
      setPessoaSelecionada(null);
      setFoto("");
      setBusca("");
      queryClient.invalidateQueries({ queryKey: ["facial-pendentes"] });
    },
  });

  const verificacaoMutation = useMutation({
    mutationFn: () =>
      servicoReconhecimentoFacial.verificar({
        person_id: pessoaSelecionada!.id,
        foto_base64: foto || "",
      }),
    onSuccess: (data) => {
      setResultadoVerificacao(data);
    },
  });

  const aoSelecionarPessoa = useCallback((p: PersonListItem) => {
    setPessoaSelecionada(p);
    setBusca("");
    setResultadoVerificacao(null);
  }, []);

  const aoCapturar = useCallback((base64: string) => {
    setFoto(base64);
  }, []);

  const limpar = useCallback(() => {
    setPessoaSelecionada(null);
    setFoto("");
    setResultadoVerificacao(null);
    setBusca("");
  }, []);

  const listaPessoas = (
    <>
      {pessoasQuery.isLoading && <Skeleton variante="cartao" />}
      {pessoasQuery.isError && (
        <EstadoErro
          problema={(pessoasQuery.error as any)?.problema}
          aoTentarNovamente={() => pessoasQuery.refetch()}
        />
      )}
      {pessoasQuery.data && pessoasQuery.data.length === 0 && busca.trim().length >= 2 && (
        <EstadoVazio titulo="Nenhuma pessoa encontrada" descricao="Verifique o nome, CPF ou NIS informado." />
      )}
      {pessoasQuery.data && pessoasQuery.data.length > 0 && (
        <ul className="divide-y divide-surface-container-highest border rounded-xl overflow-hidden">
          {pessoasQuery.data.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => aoSelecionarPessoa(p)}
                className="w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors"
              >
                <p className="font-medium text-sm">{p.nome_exibicao}</p>
                <p className="text-xs text-secondary">
                  {p.cpf_mascarado && `CPF: ${p.cpf_mascarado}`}
                  {p.nis_mascarado && `  |  NIS: ${p.nis_mascarado}`}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const abas = [
    {
      id: "cadastrar",
      rotulo: "Cadastrar Face",
      conteudo: (
        <div className="space-y-4 max-w-lg">
          {!pessoaSelecionada ? (
            <>
              <Input
                label="Buscar pessoa"
                placeholder="Nome, CPF ou NIS…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              {listaPessoas}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{pessoaSelecionada.nome_exibicao}</p>
                  <p className="text-xs text-secondary">
                    {pessoaSelecionada.cpf_mascarado && `CPF: ${pessoaSelecionada.cpf_mascarado}`}
                    {pessoaSelecionada.nis_mascarado && `  |  NIS: ${pessoaSelecionada.nis_mascarado}`}
                  </p>
                </div>
                <Botao variante="texto" onClick={limpar}>
                  Trocar pessoa
                </Botao>
              </div>

              <p className="text-sm text-secondary">
                Centralize o rosto da pessoa na câmera e capture a foto para registro.
              </p>

              <CameraCapture aoCapturar={aoCapturar} />

              {foto && (
                <Botao
                  variante="primario"
                  onClick={() => cadastroMutation.mutate()}
                  disabled={cadastroMutation.isPending}
                  carregando={cadastroMutation.isPending}
                >
                  Salvar cadastro
                </Botao>
              )}

              {cadastroMutation.isSuccess && (
                <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm font-medium text-success flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Face cadastrada com sucesso
                </div>
              )}
              {cadastroMutation.isError && (
                <EstadoErro
                  problema={(cadastroMutation.error as any)?.problema}
                  aoTentarNovamente={() => cadastroMutation.mutate()}
                />
              )}
            </>
          )}
        </div>
      ),
    },
    {
      id: "verificar",
      rotulo: "Verificar Face",
      conteudo: (
        <div className="space-y-4 max-w-lg">
          {!pessoaSelecionada ? (
            <>
              <Input
                label="Buscar pessoa"
                placeholder="Nome, CPF ou NIS…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              {listaPessoas}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{pessoaSelecionada.nome_exibicao}</p>
                  <p className="text-xs text-secondary">
                    {pessoaSelecionada.cpf_mascarado && `CPF: ${pessoaSelecionada.cpf_mascarado}`}
                    {pessoaSelecionada.nis_mascarado && `  |  NIS: ${pessoaSelecionada.nis_mascarado}`}
                  </p>
                </div>
                <Botao variante="texto" onClick={limpar}>
                  Trocar pessoa
                </Botao>
              </div>

              <p className="text-sm text-secondary">
                Capture uma foto para verificar se corresponde à face cadastrada.
              </p>

              <CameraCapture aoCapturar={aoCapturar} />

              {foto && (
                <Botao
                  variante="primario"
                  onClick={() => verificacaoMutation.mutate()}
                  disabled={verificacaoMutation.isPending}
                  carregando={verificacaoMutation.isPending}
                >
                  Verificar
                </Botao>
              )}

              {resultadoVerificacao && (
                <div
                  className={`rounded-xl border p-4 flex items-start gap-3 ${
                    resultadoVerificacao.match
                      ? "border-success/30 bg-success/10"
                      : "border-danger/30 bg-danger/10"
                  }`}
                >
                  {resultadoVerificacao.match ? (
                    <CheckCircle className="h-5 w-5 text-success mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-danger mt-0.5 shrink-0" />
                  )}
                  <div>
                    <p className={`font-semibold text-sm ${resultadoVerificacao.match ? "text-success" : "text-danger"}`}>
                      {resultadoVerificacao.match ? "Face verificada com sucesso" : "Face não corresponde"}
                    </p>
                    <p className="text-xs text-secondary">
                      Confiança: {(resultadoVerificacao.confianca * 100).toFixed(0)}%
                    </p>
                    {resultadoVerificacao.motivo && (
                      <p className="text-xs text-secondary mt-1">
                        {resultadoVerificacao.motivo === "stub_placeholder"
                          ? "Verificação simulada (stub — integração futura com AWS Rekognition/Azure Face API/FaceNet)"
                          : resultadoVerificacao.motivo === "face_nao_cadastrada"
                            ? "Esta pessoa não possui face cadastrada no sistema."
                            : resultadoVerificacao.motivo}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {verificacaoMutation.isError && (
                <EstadoErro
                  problema={(verificacaoMutation.error as any)?.problema}
                  aoTentarNovamente={() => verificacaoMutation.mutate()}
                />
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="h-4 w-4 text-primary" />
        </div>
        <h1 className="text-headline-lg-mobile font-titulo font-bold text-ink">
          Reconhecimento Facial
        </h1>
      </div>

      <p className="text-sm text-secondary mb-6 max-w-xl">
        Cadastre e verifique a identidade de pessoas atendidas por meio de biometria facial.
        Utilize este módulo para validação presencial da identidade em atendimentos e entregas de benefícios.
      </p>

      <Abas abas={abas} ativa={abaAtiva} aoMudar={setAbaAtiva} rotulo="Operações de biometria" />
    </div>
  );
}
