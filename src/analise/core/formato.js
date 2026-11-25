// Formatação pt-BR. Mesmas saídas do app (fmtMoeda) para os valores em comum.

export function fmtMoeda(n) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// "R$ 20,7k" para cards de resumo; abaixo de mil mostra o valor inteiro.
export function fmtMoedaCurta(n) {
  const abs = Math.abs(n);
  const sinal = n < 0 ? "-" : "";
  if (abs < 1000) return sinal + "R$ " + abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return sinal + "R$ " + (abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k";
}

export function fmtPrecoKwh(n) {
  return n == null
    ? "sem preço"
    : "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtKwh(n) {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: n < 100 ? 1 : 0 });
}

export function fmtPct(fracao, casas = 0) {
  return (fracao * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";
}

// Variação relativa com sinal: "+10,1%" / "-3,9%". Sem base de comparação, null.
export function fmtVariacao(fracao) {
  if (fracao == null || !isFinite(fracao)) return null;
  const s = fracao > 0 ? "+" : fracao < 0 ? "-" : "";
  return s + fmtPct(Math.abs(fracao), 1);
}

// Variação em pontos percentuais: "-1,3 p.p."
export function fmtPontos(diferenca) {
  if (diferenca == null || !isFinite(diferenca)) return null;
  const s = diferenca > 0 ? "+" : diferenca < 0 ? "-" : "";
  return s + (Math.abs(diferenca) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " p.p.";
}

export function fmtDistancia(km) {
  return km.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km";
}
