# SIM-AM / TCE-PR no GovFrota

Arquivos mensais de frota e combustível do Layout SIM-AM 2026 (v1.2b, Patrimônio / Controle Interno).
O SIM-AM é uma camada de cálculo: os arquivos saem do que já é lançado. Ninguém digita código do TCE no dia a dia.

## De onde vem cada arquivo

| Arquivo | Origem no GovFrota |
|---|---|
| VeiculoEquipamento | Veículo (Patrimônio = cdBem, código FIPE, ano) + códigos do combustível principal |
| HodometroHorimetro | Leituras dos abastecimentos, por medidor físico (`veiculo_medidores`) + km/h declarados |
| ConsumoCombustivel | Soma dos litros confirmados por veículo × combustível × mês; sequencial nasce no fechamento |
| EstornoConsumoCombustivel | Gerado sozinho ao cancelar/reduzir abastecimento de mês **enviado** |
| EntradaExtraCombustivel | Entradas com tipo Doação, Convênio ou Ajuste por liquidação |
| SaidaExtraCombustivel | Ação "Saída extraordinária" no tanque, ou falta no inventário |
| EstoqueCombustivel | Saldo dos tanques próprios na virada do mês (saldo atual − movimentações posteriores) |

## Competência

`Aberta → Fechada → Enviada`. Fechar exige zero pendências e o mês anterior fechado.
Fechada trava os lançamentos com data no mês e pode ser reaberta, com justificativa.
Enviada não reabre mais: cancelamento ou redução de litros vira estorno na competência aberta, e qualquer outra alteração é bloqueada.

## Configuração inicial (uma vez)

1. Configurações → SIM-AM: idPessoa da entidade e CPF do responsável pelo combustível.
2. Cada combustível: categoria e tipo do objeto da despesa (tabela do TCE). Desmarcar "informar" para lubrificantes.
3. Cada veículo: Patrimônio (cdBem, até 10 caracteres), código FIPE e ano de fabricação.
4. Tabela FIPE do TCE (código de 7 dígitos, sem hífen): importada em 30/09/2026 com 7.330 modelos, a partir do PDF "Tabela Padrão de Modelos - FIPE" (páginas 3–186, convertido com `pdftotext -layout`). Para reimportar a partir de um CSV:

```
docker compose -f infra/docker-compose.yml run --rm --no-deps -v $PWD/fipe.csv:/tmp/t.csv \
  govfrota-api python scripts/importar_tabelas_simam.py ModeloVeiculoFIPE /tmp/t.csv
```

## Conferir no PDF do layout antes do primeiro envio

Tudo fica em `api/app/services/simam/layout.py` (marcado com `# conferir`):
- nomes exatos dos arquivos `.txt`;
- separador decimal (hoje ponto), fim de linha (hoje CRLF) e formato de data (hoje DD/MM/AAAA);
- ordem e nomes dos campos de EntradaExtraCombustivel e SaidaExtraCombustivel, montados a partir de um resumo e não do manual.
