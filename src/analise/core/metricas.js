// Indicadores do Dashboard. Funções puras: recebem os dados e "hoje", não leem estado global.
//
// Recarga: mesmo formato do app (kwhUtilizado, valorPagar, valorKwh, cliente, bico, inicio, data, metodoPagamento),
// mais estacaoId. No app, que opera um posto só, estacaoId ausente equivale à estação única.

import { OCUPACAO_ALTA, OCUPACAO_BAIXA } from "./regras.js";
import { dentro, diasNoMes, mesAteHoje, mesmoTempoMesAnterior } from "./periodo.js";

export function variacao(atual, anterior) {
  if (!anterior) return null;
  return (atual - anterior) / anterior;
}

// Cortesia não entra no faturamento. Pendente entra: já foi faturada, só não foi recebida (premissa).
export function valorFaturado(r) {
  return r.metodoPagamento === "Cortesia" ? 0 : Number(r.valorPagar) || 0;
}

export function kwhDa(r) {
  return Number(r.kwhUtilizado != null ? r.kwhUtilizado : r.kwh) || 0;
}

// "No plano" / "Fora do plano": marcação por estação (estacao.noPlano), definida no cadastro.
export function filtrarEstacoes(estacoes, plano) {
  if (plano === "dentro") return estacoes.filter((e) => e.noPlano);
  if (plano === "fora") return estacoes.filter((e) => !e.noPlano);
  return estacoes;
}

export function recargasDoPeriodo(recargas, estacoes, periodo) {
  const ids = new Set(estacoes.map((e) => e.id));
  return recargas.filter((r) => ids.has(r.estacaoId) && dentro(r.data, periodo));
}

function soma(lista, fn) {
  return lista.reduce((s, x) => s + fn(x), 0);
}

function chaveMes(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

// Entrou, Saiu e Resultado parcial do mês corrente.
// Saiu = custo variável até hoje (kWh × custo da energia da estação) + custo fixo do mês inteiro (estimativa).
// "Faltam" = quanto ainda precisa faturar para o resultado zerar.
export function saudeFinanceira({ estacoes, recargas, custos, hoje }) {
  const periodo = mesAteHoje(hoje);
  const recs = recargasDoPeriodo(recargas, estacoes, periodo);
  const custoKwh = new Map(estacoes.map((e) => [e.id, e.custoKwh || 0]));
  const ids = new Set(estacoes.map((e) => e.id));
  const mes = chaveMes(hoje);

  const entrou = soma(recs, valorFaturado);
  const variavel = soma(recs, (r) => kwhDa(r) * custoKwh.get(r.estacaoId));
  const fixo = soma(
    custos.filter((c) => c.tipo === "fixo" && c.mes === mes && (c.estacaoId == null || ids.has(c.estacaoId))),
    (c) => c.valor
  );
  const saiu = variavel + fixo;
  const resultado = entrou - saiu;
  return { entrou, variavel, fixo, saiu, resultado, faltam: Math.max(0, -resultado), estacoes: estacoes.length };
}

export function faturamentoPorHub({ hubs, estacoes, recargas, hoje }) {
  const atual = mesAteHoje(hoje);
  const anterior = mesmoTempoMesAnterior(hoje);
  const linhas = hubs
    .map((hub) => {
      const doHub = estacoes.filter((e) => e.hubId === hub.id);
      const valor = soma(recargasDoPeriodo(recargas, doHub, atual), valorFaturado);
      const valorAnterior = soma(recargasDoPeriodo(recargas, doHub, anterior), valorFaturado);
      const ativas = doHub.filter((e) => e.ativa !== false).length;
      return { hub, estacoes: doHub.length, ativas, valor, variacao: variacao(valor, valorAnterior) };
    })
    .filter((l) => l.estacoes > 0);
  const semHub = estacoes.filter((e) => !e.hubId);
  const valorSemHub = soma(recargasDoPeriodo(recargas, semHub, atual), valorFaturado);
  const total = soma(linhas, (l) => l.valor) + valorSemHub;
  for (const l of linhas) l.participacao = total ? l.valor / total : 0;
  return { linhas, semHub: { estacoes: semHub.length, valor: valorSemHub }, total };
}

// Receita por mês do ano corrente, por hub. Mês corrente projetado no ritmo dos dias completos:
// faturamento até ontem ÷ dias completos × dias do mês. Meses futuros: null.
export function receitaMensal({ hubs, estacoes, recargas, hoje }) {
  const ano = hoje.getFullYear();
  const mesAtual = hoje.getMonth();
  const diasCompletos = hoje.getDate() - 1;
  const ontem = new Date(ano, mesAtual, hoje.getDate());

  // Uma passada só pelas recargas (com anos de histórico, filtrar mês a mês por rede fica lento).
  const indiceHub = new Map(hubs.map((h, i) => [h.id, i]));
  const hubDaEstacao = new Map(
    estacoes.filter((e) => indiceHub.has(e.hubId)).map((e) => [e.id, indiceHub.get(e.hubId)])
  );
  const totais = hubs.map(() => new Array(12).fill(0));
  const inicioAno = new Date(ano, 0, 1).getTime();
  const limite = ontem.getTime();
  for (const r of recargas) {
    const i = hubDaEstacao.get(r.estacaoId);
    if (i === undefined) continue;
    const t = Date.parse(r.data);
    if (!(t >= inicioAno && t < limite)) continue;
    totais[i][new Date(t).getMonth()] += valorFaturado(r);
  }

  const series = hubs.map((hub, i) => {
    const doHub = estacoes.filter((e) => e.hubId === hub.id);
    const meses = totais[i].map((v, m) => (m > mesAtual ? null : v));
    const ateOntem = meses[mesAtual];
    const projecao = diasCompletos > 0 ? (ateOntem / diasCompletos) * diasNoMes(ano, mesAtual) : null;
    return { hub, meses, projecao, estacoes: doHub.length };
  });
  return { ano, mesAtual, diasCompletos, series: series.filter((s) => s.estacoes > 0) };
}

export function topClientes({ estacoes, recargas, hoje, limite = 5 }) {
  const recs = recargasDoPeriodo(recargas, estacoes, mesAteHoje(hoje));
  const porCliente = new Map();
  for (const r of recs) {
    const nome = r.cliente || "Sem cliente";
    const c = porCliente.get(nome) || { cliente: nome, kwh: 0, gasto: 0, cargas: 0 };
    c.kwh += kwhDa(r);
    c.gasto += valorFaturado(r);
    c.cargas += 1;
    porCliente.set(nome, c);
  }
  const linhas = [...porCliente.values()].sort((a, b) => b.kwh - a.kwh);
  return { totalClientes: linhas.length, linhas: linhas.slice(0, limite) };
}

function duracaoHoras(r) {
  return Math.max(0, (new Date(r.data) - new Date(r.inicio)) / 3600000);
}

// Ocupação = horas de recarga ÷ (conectores × horas decorridas no período). Faixas em regras.js.
function ocupacao(recs, estacoes, periodo, agora) {
  const conectores = soma(estacoes, (e) => e.conectores.length);
  const fim = Math.min(periodo.fim.getTime(), agora.getTime());
  const horas = Math.max(0, (fim - periodo.inicio.getTime()) / 3600000);
  if (!conectores || !horas) return 0;
  return soma(recs, duracaoHoras) / (conectores * horas);
}

// recs: recargas de todas as estações (histórico). ocupacaoBase: estações que contam na ocupação
// (as ativas), com as recargas delas.
function resumoOperacao(recs, ocupacaoBase, periodo, agora) {
  const cargas = recs.length;
  const energia = soma(recs, kwhDa);
  const faturado = soma(recs, valorFaturado);
  return {
    cargas,
    energia,
    clientesUnicos: new Set(recs.map((r) => r.cliente).filter(Boolean)).size,
    consumoMedio: cargas ? energia / cargas : 0,
    ticketMedio: cargas ? faturado / cargas : 0,
    ocupacao: ocupacao(recargasDoPeriodo(recs, ocupacaoBase, periodo), ocupacaoBase, periodo, agora)
  };
}

export function classificarOcupacao(fracao) {
  if (fracao < OCUPACAO_BAIXA) return "baixa";
  if (fracao < OCUPACAO_ALTA) return "média";
  return "alta";
}

// Operação do mês até agora vs o mesmo tempo decorrido no mês anterior.
// Cargas, energia e ticket contam todas as estações (inclusive desativadas: é histórico).
// Ocupação conta só estacoesOcupacao (padrão: todas), porque estação desativada não tem conector disponível.
export function operacao({ estacoes, recargas, hoje, estacoesOcupacao = estacoes }) {
  const atual = mesAteHoje(hoje);
  const anterior = mesmoTempoMesAnterior(hoje);
  const a = resumoOperacao(recargasDoPeriodo(recargas, estacoes, atual), estacoesOcupacao, atual, hoje);
  const b = resumoOperacao(recargasDoPeriodo(recargas, estacoes, anterior), estacoesOcupacao, anterior, anterior.fim);
  const out = {};
  for (const k of Object.keys(a)) {
    out[k] = {
      atual: a[k],
      anterior: b[k],
      variacao: k === "ocupacao" ? null : variacao(a[k], b[k]),
      diferenca: k === "ocupacao" ? a[k] - b[k] : null
    };
  }
  out.ocupacao.faixa = classificarOcupacao(a.ocupacao);
  return out;
}

export const STATUS_CONECTOR = ["carregando", "livre", "parado", "sem dado"];

export function statusEstacoes({ estacoes, recargas, hoje }) {
  const contagem = Object.fromEntries(STATUS_CONECTOR.map((s) => [s, 0]));
  for (const e of estacoes) for (const c of e.conectores) contagem[c.status] = (contagem[c.status] || 0) + 1;
  const hojeP = { inicio: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()), fim: hoje };
  const cargasHoje = recargasDoPeriodo(recargas, estacoes, hojeP).length;
  return { contagem, cargasHoje, estacoes };
}
