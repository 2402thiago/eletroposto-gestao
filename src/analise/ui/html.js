// Montagem de HTML por string, como no app. Todo texto vindo dos dados passa por esc().

export function esc(valor) {
  return String(valor == null ? "" : valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Variação com seta e cor. "inverter": quando subir é ruim (não usado ainda, reservado para custos).
export function variacaoHtml(texto, valor, { inverter = false } = {}) {
  if (texto == null) return '<span class="var var-nula">sem base</span>';
  const bom = inverter ? valor < 0 : valor > 0;
  const classe = valor === 0 ? "var-neutra" : bom ? "var-sobe" : "var-desce";
  const seta = valor > 0 ? "▲" : valor < 0 ? "▼" : "";
  return '<span class="var ' + classe + '"><span aria-hidden="true">' + seta + "</span> " + esc(texto) + "</span>";
}

// "Cidade · UF · 40 kW" sem separadores sobrando quando algum pedaço está vazio.
export function juntar(...partes) {
  return partes.filter((p) => p != null && p !== "").join(" · ");
}

export function horaMinuto(d) {
  return String(d.getHours()).padStart(2, "0") + "h" + String(d.getMinutes()).padStart(2, "0");
}
