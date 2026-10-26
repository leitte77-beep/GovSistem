# Especificações oficiais

Coloque aqui os artefatos oficiais versionados:

```
< SISTEMA >/< versao >/
  *.thrift | *.xsd | *.json (StructureDefinition)
  fixtures/ (payloads oficiais para teste de contrato)
```

Enquanto a pasta do sistema estiver vazia, `app.integracoes.registro` devolve
`AdaptadorPendente` e o worker não transmite.
