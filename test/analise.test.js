// Aba Análise: módulos de src/analise/ ligados ao Eletroposto por src/analise-entrada.js.
import { describe, it, expect, beforeAll } from "vitest";

const agora = new Date();
const registros = [1, 2].map(function (n) {
  const fim = new Date(agora.getFullYear(), agora.getMonth(), 1, 10 + n, 0);
  return {
    id: "r" + n,
    data: fim.toISOString(),
    inicio: fim.getTime() - 30 * 60000,
    bico: n,
    cliente: "Cliente " + n,
    kwhUtilizado: 20,
    valorKwh: 2,
    valorPagar: 40,
    metodoPagamento: "Pix"
  };
});

let analise;

beforeAll(async () => {
  localStorage.clear();
  localStorage.setItem(
    "eletroposto_config",
    JSON.stringify({
      nomeSistema: "Posto do Teste",
      tarifaKwh: 2,
      carregadores: [{ potenciaKw: 60 }, { potenciaKw: 7 }]
    })
  );
  localStorage.setItem("eletroposto_registros", JSON.stringify(registros));
  localStorage.setItem("eletroposto_sessoes", JSON.stringify([{ bico: 1, status: "carregando" }]));
  document.body.innerHTML = '<section id="tab-analise" class="tab-panel active"></section>';
  location.hash = "#analise";
  await import("../src/analise-entrada.js");
  analise = window.eletropostoAnalise;
  await analise.mostrar();
});

describe("aba Análise", () => {
  it("monta as subabas com os nomes do Eletroposto", () => {
    const abas = [...document.querySelectorAll("#tab-analise .subabas a")].map(function (a) {
      return [a.textContent, a.getAttribute("href")];
    });
    expect(abas).toEqual([
      ["Visão geral", "#analise/"],
      ["Concorrência", "#analise/concorrencia"],
      ["Dados da análise", "#analise/cadastros"]
    ]);
  });

  it("usa as recargas, a tarifa e os bicos do Eletroposto", () => {
    const painel = document.getElementById("tab-analise");
    expect(painel.querySelector(".saude-linhas .entrou").textContent).toContain("80,00");
    expect(painel.querySelector(".tabela-status").textContent).toContain("Posto do Teste");
    expect(painel.querySelector(".status-resumo").textContent).toContain("1 carregando");
  });

  it("grava os dados da análise com prefixo eletroposto_ (entram no backup) sem mexer nos do app", async () => {
    const antes = ["config", "registros", "sessoes"].map(function (k) {
      return localStorage.getItem("eletroposto_" + k);
    });
    location.hash = "#analise/cadastros?aba=redes";
    await analise.mostrar();
    const painel = document.getElementById("tab-analise");
    painel.querySelector('[data-acao="nova-rede"]').click();
    const form = painel.querySelector("dialog form");
    form.elements.nome.value = "Rede Norte";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await new Promise(function (r) {
      setTimeout(r, 20);
    });
    expect(
      JSON.parse(localStorage.getItem("eletroposto_analise_hubs")).map(function (h) {
        return h.nome;
      })
    ).toEqual(["Rede Norte"]);
    const depois = ["config", "registros", "sessoes"].map(function (k) {
      return localStorage.getItem("eletroposto_" + k);
    });
    expect(depois).toEqual(antes);
  });

  it("mostra o texto de onde o preço é configurado no Eletroposto", async () => {
    location.hash = "#analise/cadastros?aba=estacoes";
    await analise.mostrar();
    const painel = document.getElementById("tab-analise");
    painel.querySelector('[data-acao="editar-estacao"]').click();
    expect(painel.querySelector("dialog").textContent).toContain("Definido em Configurações");
  });
});
