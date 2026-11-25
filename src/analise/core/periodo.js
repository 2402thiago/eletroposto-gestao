// Períodos de comparação. Datas em horário local; "hoje" sempre injetado para os testes.

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
];
export const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function diasNoMes(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate();
}

// Mês corrente até o fim de hoje: [1º do mês 00h, amanhã 00h).
export function mesAteHoje(hoje) {
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  return { inicio, fim };
}

// Mesmo intervalo de dias no mês anterior. Se o mês anterior é mais curto, corta no último dia dele.
export function mesmoPeriodoMesAnterior(periodo) {
  const ano = periodo.inicio.getFullYear();
  const mes = periodo.inicio.getMonth() - 1;
  const dias = Math.round((periodo.fim - periodo.inicio) / 86400000);
  const inicio = new Date(ano, mes, 1);
  const limite = diasNoMes(inicio.getFullYear(), inicio.getMonth());
  const fim = new Date(inicio.getFullYear(), inicio.getMonth(), Math.min(dias, limite) + 1);
  return { inicio, fim };
}

// Do 1º do mês anterior até o mesmo dia e hora de "hoje", cortado no fim do mês anterior.
// É a base de "vs mesmo período de outubro": compara tempos decorridos iguais.
export function mesmoTempoMesAnterior(hoje) {
  const atual = mesAteHoje(hoje);
  const anterior = mesmoPeriodoMesAnterior(atual);
  const decorrido = hoje.getTime() - atual.inicio.getTime();
  const fim = new Date(Math.min(anterior.inicio.getTime() + decorrido, anterior.fim.getTime()));
  return { inicio: anterior.inicio, fim };
}

export function dentro(dataIso, periodo) {
  const t = Date.parse(dataIso);
  return t >= periodo.inicio.getTime() && t < periodo.fim.getTime();
}

// "novembro até 10/11"
export function rotuloMesAte(hoje) {
  return (
    MESES[hoje.getMonth()] +
    " até " +
    String(hoje.getDate()).padStart(2, "0") +
    "/" +
    String(hoje.getMonth() + 1).padStart(2, "0")
  );
}

export function nomeDoMes(mes) {
  return MESES[mes];
}
