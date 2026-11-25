// Baixa um arquivo gerado no navegador, sem passar por servidor.

import { gerarXlsx } from "../core/xlsx.js";

export const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function baixar(bytes, nome, tipo = TIPO_XLSX) {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function baixarPlanilha(planilha, nome) {
  baixar(gerarXlsx(planilha), nome);
}
