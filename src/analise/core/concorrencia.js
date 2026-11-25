// Análise de preço da estação contra os concorrentes no raio. Funções puras.
//
// Estação: { id, nome, lat, lng, precoKwh (null = sem preço), conectores: [{ tipo: "DC" | "AC", potenciaKw }] }
// Concorrente: { id, nome, lat, lng, tipo, potenciaKw, preco (null = sem preço), precoPorHora?: number[24],
//   ocupacaoPorHora?: number[24] }

import { MINIMO_CONCORRENTES_RAIO, MINIMO_MERCADO, RAIOS_KM, TOLERANCIA_MEDIANA } from "./regras.js";

export function distanciaKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function mediana(valores) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Uma estação é comparada no segmento do seu conector mais potente: DC (rápida) ou AC (lenta).
export function tipoDaEstacao(estacao) {
  return estacao.conectores.some((c) => c.tipo === "DC") ? "DC" : "AC";
}

export function potenciaDaEstacao(estacao) {
  return Math.max(0, ...estacao.conectores.map((c) => c.potenciaKw));
}

export function precoNaHora(concorrente, hora) {
  if (concorrente.precoPorHora && concorrente.precoPorHora[hora] != null) return concorrente.precoPorHora[hora];
  return concorrente.preco;
}

function comDistancia(estacao, concorrentes) {
  return concorrentes
    .map((c) => ({ ...c, distanciaKm: distanciaKm(estacao, c) }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
}

// Raio adaptativo (regras.js): o menor raio da lista com concorrentes suficientes do mesmo tipo e com preço.
export function escolherRaio(estacao, concorrentes) {
  const tipo = tipoDaEstacao(estacao);
  const lista = comDistancia(estacao, concorrentes);
  for (const raio of RAIOS_KM) {
    const n = lista.filter((c) => c.distanciaKm <= raio && c.tipo === tipo && c.preco != null).length;
    if (n >= MINIMO_CONCORRENTES_RAIO) return { raioKm: raio, adaptado: raio !== RAIOS_KM[0] };
  }
  return { raioKm: RAIOS_KM[RAIOS_KM.length - 1], adaptado: true };
}

export function etiquetaDePreco(seuPreco, med) {
  if (seuPreco == null) return { chave: "sem-preco", rotulo: "Sem o seu preço" };
  if (med == null) return { chave: "sem-referencia", rotulo: "Sem referência" };
  const rel = (seuPreco - med) / med;
  if (rel > TOLERANCIA_MEDIANA) return { chave: "caro", rotulo: "Mais caro" };
  if (rel < -TOLERANCIA_MEDIANA) return { chave: "barato", rotulo: "Mais barato" };
  return { chave: "media", rotulo: "Na média" };
}

export function analisarEstacao(estacao, concorrentes, hora) {
  const tipo = tipoDaEstacao(estacao);
  const { raioKm, adaptado } = escolherRaio(estacao, concorrentes);
  const noRaio = comDistancia(estacao, concorrentes).filter((c) => c.distanciaKm <= raioKm);
  const mesmoTipo = noRaio.filter((c) => c.tipo === tipo);
  const precos = mesmoTipo.map((c) => precoNaHora(c, hora)).filter((p) => p != null);
  const med = mediana(precos);
  const seuPreco = estacao.precoKwh;
  const etiqueta = etiquetaDePreco(seuPreco, med);
  const comPrecoDC = noRaio.filter((c) => c.tipo === "DC" && c.preco != null);

  return {
    estacao,
    tipo,
    segmento: tipo === "DC" ? "rápidos" : "lentos",
    potenciaKw: potenciaDaEstacao(estacao),
    raioKm,
    adaptado,
    seuPreco,
    mediana: med,
    minimo: precos.length ? Math.min(...precos) : null,
    maximo: precos.length ? Math.max(...precos) : null,
    concorrentesComPreco: precos.length,
    diferenca: seuPreco != null && med != null ? seuPreco - med : null,
    etiqueta,
    mercadoRaso: precos.length < MINIMO_MERCADO,
    concorrentes: noRaio,
    lentosNoRaio: noRaio.filter((c) => c.tipo === "AC").length,
    vizinhoMaisProximo: comPrecoDC[0] || null
  };
}

// Mediana dos rápidos (DC) com preço em cada hora do dia, para o gráfico "Preço das 0h às 23h".
export function precoPorHora(concorrentesNoRaio) {
  const dc = concorrentesNoRaio.filter((c) => c.tipo === "DC");
  return Array.from({ length: 24 }, (_, hora) => ({
    hora,
    mediana: mediana(dc.map((c) => precoNaHora(c, hora)).filter((p) => p != null))
  }));
}

// Hora com mais recargas iniciadas, no horário local do navegador.
export function picoDeUso(recargasDaEstacao) {
  if (!recargasDaEstacao.length) return null;
  const porHora = new Array(24).fill(0);
  for (const r of recargasDaEstacao) porHora[new Date(r.inicio).getHours()] += 1;
  const hora = porHora.indexOf(Math.max(...porHora));
  return { hora, cargasNaHora: porHora[hora], totalCargas: recargasDaEstacao.length, porHora };
}

// Hora de maior ocupação média dos concorrentes que informam ocupação.
export function picoDosVizinhos(concorrentesNoRaio) {
  const comDado = concorrentesNoRaio.filter((c) => Array.isArray(c.ocupacaoPorHora));
  if (!comDado.length) return null;
  const medias = Array.from(
    { length: 24 },
    (_, h) => comDado.reduce((s, c) => s + c.ocupacaoPorHora[h], 0) / comDado.length
  );
  const hora = medias.indexOf(Math.max(...medias));
  return { hora, ocupacao: medias[hora], concorrentes: comDado.length };
}
