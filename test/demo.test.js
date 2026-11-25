import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(ROOT, "index.html"), "utf8").replace(/^<!DOCTYPE[^>]*>/i, "");
const core = readFileSync(resolve(ROOT, "src", "core.js"), "utf8");
const demo = readFileSync(resolve(ROOT, "src", "demo.js"), "utf8");
const app = readFileSync(resolve(ROOT, "src", "app.js"), "utf8");

// Terça, 24/11/2026, 19h30: turno da tarde aberto.
const AGORA = new Date(2026, 10, 24, 19, 30);

let temporizadores = [];
if (!globalThis.__setIntervalOriginal) globalThis.__setIntervalOriginal = globalThis.setInterval;
if (!globalThis.__setTimeoutOriginal) globalThis.__setTimeoutOriginal = globalThis.setTimeout;
function encerrarInstanciaAnterior() {
  temporizadores.forEach((id) => {
    clearInterval(id);
    clearTimeout(id);
  });
  temporizadores = [];
}
afterAll(encerrarInstanciaAnterior);

function boot() {
  encerrarInstanciaAnterior();
  document.documentElement.innerHTML = html;
  // eslint-disable-next-line no-unused-vars
  const setInterval = (fn, ms, ...a) => {
    const id = globalThis.__setIntervalOriginal(fn, ms, ...a);
    temporizadores.push(id);
    return id;
  };
  // eslint-disable-next-line no-unused-vars
  const setTimeout = (fn, ms, ...a) => {
    const id = globalThis.__setTimeoutOriginal(fn, ms, ...a);
    temporizadores.push(id);
    return id;
  };
  eval(core + "\n" + demo + "\n" + app);
}

function gerar(agora = AGORA) {
  const escopo = {};
  new Function(
    "escopo",
    core + "\n" + demo + "\nescopo.gerarDadosDemo = gerarDadosDemo; escopo.saldoDoCaixa = saldoDoCaixa;"
  )(escopo);
  return { dados: escopo.gerarDadosDemo(agora), saldoDoCaixa: escopo.saldoDoCaixa };
}

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = "";
});

describe("dados de demonstração", () => {
  it("gera 30 dias de recargas nos 3 bicos e 2 turnos, todas antes de agora", () => {
    const { dados } = gerar();
    const recargas = dados.registros;
    expect(recargas.length).toBeGreaterThan(350);
    const inicio = new Date(2026, 9, 26).getTime();
    recargas.forEach((r) => {
      expect(new Date(r.data).getTime()).toBeLessThanOrEqual(AGORA.getTime());
      expect(new Date(r.data).getTime()).toBeGreaterThanOrEqual(inicio);
      expect(r.valorPagar).toBeCloseTo(r.kwh * r.valorKwh, 6);
    });
    expect(new Set(recargas.map((r) => r.bico))).toEqual(new Set([1, 2, 3]));
    expect(new Set(recargas.map((r) => r.turno))).toEqual(new Set([1, 2]));
    expect(dados.config.carregadores.map((c) => c.potenciaKw)).toEqual([60, 60, 40]);
  });

  it("tem 20 produtos, nenhum com estoque negativo e alguns abaixo do mínimo", () => {
    const { dados } = gerar();
    const skus = dados.produtos.filter((p) => p.tipo === "sku");
    expect(skus).toHaveLength(20);
    skus.forEach((p) => expect(p.estoque).toBeGreaterThanOrEqual(0));
    expect(skus.filter((p) => p.estoque < p.estoqueMinimo).length).toBeGreaterThanOrEqual(2);
    expect(dados.vendas.length).toBeGreaterThan(100);
  });

  it("o caixa fecha com os movimentos e tem fechamento por turno", () => {
    const { dados, saldoDoCaixa } = gerar();
    const saldo = saldoDoCaixa(dados.caixa.historico);
    expect(dados.caixa.cedulas).toBe(saldo.cedulas);
    expect(dados.caixa.moedas).toBe(saldo.moedas);
    const fechamentos = dados.caixa.historico.filter((m) => m.fechamentoTurno);
    expect(fechamentos.length).toBeGreaterThan(30);
    fechamentos.forEach((m) => expect(m.valor).toBeGreaterThan(0));
  });

  it("com o posto aberto mostra recargas em andamento e fila; fechado, nenhuma", () => {
    const aberto = gerar().dados.sessoes;
    expect(aberto.filter((s) => s.status === "carregando").length).toBeGreaterThanOrEqual(1);
    expect(aberto.filter((s) => s.status === "aguardando")).toHaveLength(1);
    expect(gerar(new Date(2026, 10, 25, 3, 0)).dados.sessoes).toHaveLength(0);
  });

  it("é determinístico para o mesmo horário", () => {
    expect(JSON.stringify(gerar().dados)).toBe(JSON.stringify(gerar().dados));
  });
});

describe("modo demonstração no app", () => {
  it("o assistente oferece entrar como demonstração e grava o posto fictício", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA);
    try {
      boot();
      expect(document.getElementById("modal-assistente").classList.contains("show")).toBe(true);
      document.getElementById("btn-entrar-demo").click();
      expect(window.localStorage.getItem("eletroposto_demo")).toBe("1");
      expect(window.localStorage.getItem("eletroposto_modo")).toBe("admin");
      expect(JSON.parse(window.localStorage.getItem("eletroposto_config")).nomeSistema).toBe("Eletroposto Demo");
      expect(JSON.parse(window.localStorage.getItem("eletroposto_registros")).length).toBeGreaterThan(350);

      boot();
      expect(document.getElementById("modal-assistente").classList.contains("show")).toBe(false);
      expect(document.getElementById("faixa-demo").hidden).toBe(false);
      expect(document.querySelector("[data-brand-name]").textContent).toBe("Eletroposto Demo");
    } finally {
      vi.useRealTimers();
    }
  });

  it("restaurar dados da demo desfaz as mudanças", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA);
    try {
      boot();
      document.getElementById("btn-entrar-demo").click();
      const original = window.localStorage.getItem("eletroposto_registros");
      window.localStorage.setItem("eletroposto_registros", "[]");
      boot();
      document.getElementById("btn-restaurar-demo").click();
      expect(window.localStorage.getItem("eletroposto_registros")).toBe(original);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fora da demonstração a faixa fica escondida", () => {
    window.localStorage.setItem("eletroposto_config", "{}");
    boot();
    expect(document.getElementById("faixa-demo").hidden).toBe(true);
  });
});

describe("link direto da demonstração", () => {
  it("?demo carrega o posto fictício num aparelho novo", () => {
    window.history.replaceState(null, "", "/?demo");
    try {
      boot();
      expect(window.localStorage.getItem("eletroposto_demo")).toBe("1");
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("?demo não apaga um posto já configurado", () => {
    window.localStorage.setItem("eletroposto_config", JSON.stringify({ nomeSistema: "Posto Real" }));
    window.localStorage.setItem("eletroposto_registros", JSON.stringify([{ id: "r1" }]));
    window.history.replaceState(null, "", "/?demo");
    try {
      boot();
      expect(window.localStorage.getItem("eletroposto_demo")).toBeNull();
      expect(JSON.parse(window.localStorage.getItem("eletroposto_registros"))[0].id).toBe("r1");
      expect(window.location.search).toBe("");
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });
});

describe("coerência das recargas da demonstração", () => {
  it("o mesmo carro nunca carrega em dois bicos ao mesmo tempo", () => {
    [new Date(2026, 10, 24, 17, 40), new Date(2026, 10, 24, 10, 15), AGORA].forEach((agora) => {
      const { dados } = gerar(agora);
      const ativos = dados.sessoes.map((s) => s.placa);
      expect(new Set(ativos).size).toBe(ativos.length);
      const porPlaca = {};
      dados.registros.forEach((r) => (porPlaca[r.placa] = porPlaca[r.placa] || []).push(r));
      Object.values(porPlaca).forEach((lista) => {
        lista.sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
        for (let i = 1; i < lista.length; i++)
          expect(new Date(lista[i].inicio).getTime()).toBeGreaterThanOrEqual(new Date(lista[i - 1].data).getTime());
      });
    });
  });
});
