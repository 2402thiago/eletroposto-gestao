// Conteúdo das planilhas exportadas. Funções puras: devolvem { aba, colunas, linhas } para gerarXlsx.

function dataIso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function dataBr(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("pt-BR");
}

export function nomeArquivo(base, hoje) {
  return base + "-" + dataIso(hoje) + ".xlsx";
}

export function planilhaConcorrentes(concorrentes) {
  const lista = [...concorrentes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  return {
    aba: "Concorrentes",
    colunas: [
      { titulo: "Nome", largura: 30 },
      { titulo: "Tipo", largura: 12 },
      { titulo: "Potência (kW)", largura: 14, tipo: "inteiro" },
      { titulo: "Preço (R$/kWh)", largura: 15, tipo: "decimal" },
      { titulo: "Latitude", largura: 12, tipo: "numero" },
      { titulo: "Longitude", largura: 12, tipo: "numero" },
      { titulo: "Preço atualizado em", largura: 18 },
      { titulo: "Origem do preço", largura: 16 }
    ],
    linhas: lista.map((c) => [
      c.nome,
      c.tipo === "DC" ? "Rápido (DC)" : "Lento (AC)",
      c.potenciaKw,
      c.preco,
      c.lat,
      c.lng,
      dataBr(c.coletadoEm),
      { manual: "Cadastro manual", demonstração: "Demonstração" }[c.fonte] || c.fonte || ""
    ])
  };
}

// analises: saída de analisarEstacao para cada estação.
export function planilhaAnaliseConcorrencia(analises, hora) {
  return {
    aba: "Concorrência " + hora + "h",
    colunas: [
      { titulo: "Estação", largura: 28 },
      { titulo: "Cidade", largura: 18 },
      { titulo: "UF", largura: 6 },
      { titulo: "Segmento", largura: 12 },
      { titulo: "Potência (kW)", largura: 14, tipo: "inteiro" },
      { titulo: "Raio (km)", largura: 10, tipo: "inteiro" },
      { titulo: "Seu preço (R$/kWh)", largura: 18, tipo: "decimal" },
      { titulo: "Mediana (R$/kWh)", largura: 17, tipo: "decimal" },
      { titulo: "Mínimo (R$/kWh)", largura: 16, tipo: "decimal" },
      { titulo: "Máximo (R$/kWh)", largura: 16, tipo: "decimal" },
      { titulo: "Diferença p/ mediana", largura: 20, tipo: "decimal" },
      { titulo: "Posição", largura: 16 },
      { titulo: "Concorrentes com preço", largura: 22, tipo: "inteiro" },
      { titulo: "Mercado raso", largura: 13 }
    ],
    linhas: analises.map((a) => [
      a.estacao.nome,
      a.estacao.cidade,
      a.estacao.uf,
      a.segmento,
      a.potenciaKw,
      a.raioKm,
      a.seuPreco,
      a.mediana,
      a.minimo,
      a.maximo,
      a.diferenca == null ? null : Math.round(a.diferenca * 100) / 100,
      a.etiqueta.rotulo,
      a.concorrentesComPreco,
      a.mercadoRaso ? "Sim" : "Não"
    ])
  };
}
