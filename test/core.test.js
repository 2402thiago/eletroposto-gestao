import { describe, it, expect } from "vitest";
import {
  fmtKwh,
  fmtMoeda,
  mascararKwhTres,
  kwhDaMascara,
  mascararMoeda,
  moedaDaMascara,
  escapeHtml,
  escapeAttr,
  formatarDuracao,
  formatarData,
  dataLocalISO,
  ehPendente,
  detalhesPagamentoTexto,
  metodoPagamentoTexto,
  parcelasPagamento,
  validarParcelasPagamento,
  resumoPagamentos,
  arred,
  totalCaixa,
  caixaParaNumero,
  subtrairDoCaixa,
  somarAoCaixa,
  filtrarPorPeriodo,
  filtrarPorPeriodoTurno,
  getDadosTurnoAtual,
  getDataOperacional,
  parseTimeToMinutes,
  TURNOS,
  definirTurnos,
  validarTurnos,
  nomeTurno,
  statusEstoque,
  situacaoEstoque,
  saldoDoCaixa,
  estoqueIdealDe,
  sugestaoReposicao,
  jsonCanonical,
  hexParaRgb,
  escurecerHex,
  clarearHex,
  contrasteHex,
  corComContrasteBranco
} from "../src/core.js";

describe("dinheiro", () => {
  it("arred arredonda para centavos", () => {
    expect(arred(0.1 + 0.2)).toBe(0.3);
    expect(arred(1.236)).toBe(1.24);
  });

  it("totalCaixa soma cedulas e moedas", () => {
    expect(totalCaixa({ cedulas: 500, moedas: 50 })).toBe(550);
    expect(totalCaixa({ cedulas: 0, moedas: 0 })).toBe(0);
  });

  it("subtrairDoCaixa desconta cedulas primeiro, depois moedas", () => {
    const c = { cedulas: 500, moedas: 50 };
    subtrairDoCaixa(c, 120);
    expect(c).toEqual({ cedulas: 380, moedas: 50 });
    subtrairDoCaixa(c, 530);
    expect(c).toEqual({ cedulas: 0, moedas: 0 });
  });

  it("somarAoCaixa devolve para cedulas", () => {
    const c = { cedulas: 500, moedas: 50 };
    somarAoCaixa(c, 120);
    expect(c).toEqual({ cedulas: 620, moedas: 50 });
  });

  it("caixaParaNumero aceita virgula e pontos de milhar", () => {
    expect(caixaParaNumero("1234,56")).toBe(1234.56);
    expect(caixaParaNumero("1.234,56")).toBe(1234.56);
    expect(caixaParaNumero("0,00")).toBe(0);
    expect(Number.isNaN(caixaParaNumero("abc"))).toBe(true);
  });

  it("fmtMoeda formata em BRL", () => {
    expect(fmtMoeda(1234.5).replace(/\u00A0/g, " ")).toBe("R$ 1.234,50");
  });

  it("mascara moeda por centavos com prefixo BRL", () => {
    expect(mascararMoeda("")).toBe("");
    expect(mascararMoeda("1")).toBe("R$ 0,01");
    expect(mascararMoeda("10")).toBe("R$ 0,10");
    expect(mascararMoeda("100")).toBe("R$ 1,00");
    expect(mascararMoeda("R$ 1.234,56")).toBe("R$ 1.234,56");
    expect(moedaDaMascara("R$ 1.234,56")).toBe(1234.56);
  });
});

describe("kwh", () => {
  it("mascara e conversao de kwh sao inversas", () => {
    expect(mascararKwhTres(10500)).toBe("10,500");
    expect(kwhDaMascara("10,500")).toBe(10.5);
    expect(kwhDaMascara("")).toBe(0);
  });

  it("fmtKwh usa ate 6 casas sem zeros a direita", () => {
    expect(fmtKwh(10.5)).toBe("10,50");
    expect(fmtKwh(10.123456)).toBe("10,123456");
  });
});

describe("escapamento", () => {
  it("escapeHtml neutraliza tags", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapeAttr escapa aspas", () => {
    expect(escapeAttr("onerror='x' &")).toBe("onerror=&#39;x&#39; &amp;");
    expect(escapeAttr('x"y')).toBe("x&quot;y");
  });
});

describe("datas e duracoes", () => {
  it("formatarDuracao converte segundos em HH:MM:SS", () => {
    expect(formatarDuracao(3661)).toBe("01:01:01");
    expect(formatarDuracao(0)).toBe("00:00:00");
  });

  it("formatarData ignora dados invalidos", () => {
    expect(formatarData("nao-e-data")).toBe("—");
    const d = new Date(2026, 7, 19, 10, 30);
    expect(formatarData(d.toISOString())).toBe("19/08/2026 10:30");
  });

  it("dataLocalISO gera YYYY-MM-DD local", () => {
    expect(dataLocalISO(new Date(2026, 7, 19))).toBe("2026-08-19");
  });
});

describe("pagamento", () => {
  it("validarParcelasPagamento exige 2 parcelas positivas que somem o total", () => {
    expect(validarParcelasPagamento([{ valor: 10 }], 10, "total")).toBe("Informe pelo menos 2 métodos de pagamento.");
    expect(validarParcelasPagamento([{ valor: 10 }, { valor: 0 }], 10, "total")).toBe(
      "Preencha os valores de todas as parcelas do pagamento."
    );
    expect(validarParcelasPagamento([{ valor: 5 }, { valor: 4 }], 10, "valor a pagar")).toContain(
      "não bate com o valor a pagar"
    );
    expect(validarParcelasPagamento([{ valor: 6 }, { valor: 4 }], 10, "total")).toBeNull();
  });
  it("ehPendente identifica pagamento pendente", () => {
    expect(ehPendente({ metodoPagamento: "Pendente" })).toBe(true);
    expect(ehPendente({ metodoPagamento: "Pix" })).toBe(false);
  });

  it("detalhesPagamentoTexto formata parcelas", () => {
    const r = {
      pagamentoDividido: "Sim",
      detalhesPagamento: [
        { metodo: "Cartão", valor: 20 },
        { metodo: "Pix", valor: 10 }
      ]
    };
    expect(detalhesPagamentoTexto(r).replace(/\u00A0/g, " ")).toBe("Cartão R$ 20,00; Pix R$ 10,00");
  });

  it("metodoPagamentoTexto mostra multiplos e pendencia", () => {
    expect(metodoPagamentoTexto({ metodoPagamento: "Pendente" })).toBe("⏳ PENDENTE");
    expect(
      metodoPagamentoTexto({
        pagamentoDividido: "Sim",
        detalhesPagamento: [
          { metodo: "Cartão", valor: 20 },
          { metodo: "Pix", valor: 10 }
        ]
      })
    ).toBe("Múltiplos: Cartão + Pix");
    expect(metodoPagamentoTexto({ metodoPagamento: "Pix" })).toBe("Pix");
  });

  it("expande pagamento multiplo em parcelas com identidade estavel", () => {
    expect(
      parcelasPagamento({
        pagamentoDividido: "Sim",
        detalhesPagamento: [
          { idParcela: "dinheiro", metodo: "Dinheiro", valor: 10 },
          { idParcela: "pix", metodo: "Pix", valor: 20.5 }
        ]
      })
    ).toEqual([
      { idParcela: "dinheiro", metodo: "Dinheiro", valor: 10 },
      { idParcela: "pix", metodo: "Pix", valor: 20.5 }
    ]);
  });

  it("troco em Pix soma ao dinheiro e sai como Pix negativo", () => {
    expect(parcelasPagamento({ metodoPagamento: "Dinheiro", valorCobrado: 30, trocoPix: 20 })).toEqual([
      { idParcela: "unica", metodo: "Dinheiro", valor: 50 },
      { idParcela: "troco-pix", metodo: "Pix", valor: -20 }
    ]);
    expect(parcelasPagamento({ metodoPagamento: "Pix", valorCobrado: 30, trocoPix: 20 })).toEqual([
      { idParcela: "unica", metodo: "Pix", valor: 30 }
    ]);
  });

  it("preserva pagamento multiplo historico sem detalhes como uma unica linha", () => {
    expect(parcelasPagamento({ metodoPagamento: "Múltiplos", pagamentoDividido: "Sim", valorPagar: 30 })).toEqual([
      { idParcela: "unica", metodo: "Múltiplos", valor: 30 }
    ]);
  });

  it("resume maquininha, dinheiro e valores pendentes sem duplicar recargas", () => {
    const resumo = resumoPagamentos([
      {
        pagamentoDividido: "Sim",
        detalhesPagamento: [
          { metodo: "Dinheiro", valor: 10 },
          { metodo: "Pix", valor: 20.5 }
        ]
      },
      { metodoPagamento: "Crédito", valorPagar: 30 },
      { metodoPagamento: "Pendente", valorPagar: 12 },
      { metodoPagamento: "Cortesia", valorPagar: 8 }
    ]);
    expect(resumo).toEqual({ maquininha: 50.5, dinheiro: 10, outros: { Pendente: 12, Cortesia: 8 } });
  });
});

describe("filtro por periodo", () => {
  it("filtra e ordena por data crescente", () => {
    const regs = [
      { data: new Date(2026, 7, 20).toISOString(), id: 1 },
      { data: new Date(2026, 7, 19).toISOString(), id: 2 },
      { data: new Date(2026, 7, 21).toISOString(), id: 3 }
    ];
    const out = filtrarPorPeriodo(regs, "2026-08-19", "2026-08-20");
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });
});

describe("turnos", () => {
  it("TURNOS constante tem estrutura correta", () => {
    expect(TURNOS[1].inicio).toBe("07:00");
    expect(TURNOS[1].fim).toBe("16:48");
    expect(TURNOS[2].inicio).toBe("16:48");
    expect(TURNOS[2].fim).toBe("01:30");
  });

  it("parseTimeToMinutes converte HH:MM para minutos", () => {
    expect(parseTimeToMinutes("07:00")).toBe(420);
    expect(parseTimeToMinutes("16:48")).toBe(1008);
    expect(parseTimeToMinutes("01:30")).toBe(90);
    expect(parseTimeToMinutes("00:00")).toBe(0);
  });

  it("Turno 1: 07:00-16:48 -> mesmo dia", () => {
    const r = getDadosTurnoAtual(new Date(2026, 7, 15, 10, 0));
    expect(r.turnoId).toBe(1);
    expect(r.dataOperacional).toBe("2026-08-15");
    // inicioTurno/fimTurno sao ISO em UTC; verificar que a hora local eh 07:00/16:48
    const inicio = new Date(r.inicioTurno);
    const fim = new Date(r.fimTurno);
    expect(inicio.getHours()).toBe(7);
    expect(inicio.getMinutes()).toBe(0);
    expect(fim.getHours()).toBe(16);
    expect(fim.getMinutes()).toBe(48);
  });

  it("Turno 1: inicio exato 07:00", () => {
    const r = getDadosTurnoAtual(new Date(2026, 7, 15, 7, 0));
    expect(r.turnoId).toBe(1);
    expect(r.dataOperacional).toBe("2026-08-15");
  });

  it("Turno 1: fim exato 16:47 (ainda turno 1)", () => {
    const r = getDadosTurnoAtual(new Date(2026, 7, 15, 16, 47));
    expect(r.turnoId).toBe(1);
  });

  it("Turno 2: 16:48-23:59 -> mesmo dia", () => {
    const r = getDadosTurnoAtual(new Date(2026, 7, 15, 20, 0));
    expect(r.turnoId).toBe(2);
    expect(r.dataOperacional).toBe("2026-08-15");
    const inicio = new Date(r.inicioTurno);
    expect(inicio.getHours()).toBe(16);
    expect(inicio.getMinutes()).toBe(48);
  });

  it("Turno 2: inicio exato 16:48", () => {
    const r = getDadosTurnoAtual(new Date(2026, 7, 15, 16, 48));
    expect(r.turnoId).toBe(2);
    expect(r.dataOperacional).toBe("2026-08-15");
  });

  it("Turno 2: 00:00-01:30 -> data operacional dia anterior", () => {
    const r = getDadosTurnoAtual(new Date(2026, 7, 15, 0, 30));
    expect(r.turnoId).toBe(2);
    expect(r.dataOperacional).toBe("2026-08-14");
    const inicio = new Date(r.inicioTurno);
    const fim = new Date(r.fimTurno);
    expect(inicio.getHours()).toBe(16);
    expect(inicio.getMinutes()).toBe(48);
    expect(fim.getHours()).toBe(1);
    expect(fim.getMinutes()).toBe(30);
  });

  it("Turno 2: fim exato 01:29 (ainda turno 2)", () => {
    const r = getDadosTurnoAtual(new Date(2026, 7, 15, 1, 29));
    expect(r.turnoId).toBe(2);
    expect(r.dataOperacional).toBe("2026-08-14");
  });

  it("Fora de turno (01:30-07:00) conta no turno que acabou, no dia operacional anterior", () => {
    for (const hora of [1, 3, 6]) {
      const r = getDadosTurnoAtual(new Date(2026, 7, 15, hora, 30));
      expect(r.turnoId).toBe(2);
      expect(r.dataOperacional).toBe("2026-08-14");
    }
    expect(getDadosTurnoAtual(new Date(2026, 7, 15, 7, 0)).turnoId).toBe(1);
  });

  it("aceita turnos configurados, inclusive três turnos atravessando a meia-noite", () => {
    try {
      definirTurnos([
        { id: 1, nome: "Manhã", inicio: "06:00", fim: "14:00" },
        { id: 2, nome: "Tarde", inicio: "14:00", fim: "22:00" },
        { id: 3, nome: "Noite", inicio: "22:00", fim: "06:00" }
      ]);
      expect(nomeTurno(3)).toBe("Noite");
      expect(getDadosTurnoAtual(new Date(2026, 7, 15, 10, 0))).toMatchObject({
        turnoId: 1,
        dataOperacional: "2026-08-15"
      });
      expect(getDadosTurnoAtual(new Date(2026, 7, 15, 23, 0))).toMatchObject({
        turnoId: 3,
        dataOperacional: "2026-08-15"
      });
      const madrugada = getDadosTurnoAtual(new Date(2026, 7, 16, 3, 0));
      expect(madrugada).toMatchObject({ turnoId: 3, dataOperacional: "2026-08-15" });
      expect(new Date(madrugada.fimTurno).getHours()).toBe(6);
    } finally {
      definirTurnos(null);
    }
  });

  it("valida turnos sobrepostos, iguais ou em excesso", () => {
    expect(
      validarTurnos([
        { nome: "A", inicio: "07:00", fim: "16:00" },
        { nome: "B", inicio: "15:00", fim: "23:00" }
      ])
    ).toContain("se sobrepõem");
    expect(validarTurnos([{ nome: "A", inicio: "07:00", fim: "07:00" }])).toContain("não podem ser iguais");
    expect(
      validarTurnos(
        Array.from({ length: 5 }, (_, i) => ({ nome: "T" + i, inicio: "0" + i + ":00", fim: "0" + i + ":30" }))
      )
    ).toContain("no máximo 4");
    expect(
      validarTurnos([
        { nome: "A", inicio: "07:00", fim: "16:48" },
        { nome: "B", inicio: "16:48", fim: "01:30" }
      ])
    ).toBe("");
  });

  it("getDataOperacional turno 2 pos meia-noite retorna dia anterior", () => {
    expect(getDataOperacional(new Date(2026, 7, 15, 0, 30), 2)).toBe("2026-08-14");
    expect(getDataOperacional(new Date(2026, 7, 15, 1, 0), 2)).toBe("2026-08-14");
  });

  it("getDataOperacional turno 2 apos 01:30 retorna dia atual", () => {
    expect(getDataOperacional(new Date(2026, 7, 15, 2, 0), 2)).toBe("2026-08-15");
    expect(getDataOperacional(new Date(2026, 7, 15, 20, 0), 2)).toBe("2026-08-15");
  });

  it("getDataOperacional turno 1 sempre retorna dia atual", () => {
    expect(getDataOperacional(new Date(2026, 7, 15, 0, 30), 1)).toBe("2026-08-15");
    expect(getDataOperacional(new Date(2026, 7, 15, 10, 0), 1)).toBe("2026-08-15");
  });

  it("filtrarPorPeriodoTurno filtra por dataOperacional e turno", () => {
    const regs = [
      { data: "2026-08-15T00:30:00.000Z", turno: 2, dataOperacional: "2026-08-14" },
      { data: "2026-08-15T10:00:00.000Z", turno: 1, dataOperacional: "2026-08-15" },
      { data: "2026-08-15T20:00:00.000Z", turno: 2, dataOperacional: "2026-08-15" }
    ];
    expect(filtrarPorPeriodoTurno(regs, "2026-08-14", "2026-08-14", 2).length).toBe(1);
    expect(filtrarPorPeriodoTurno(regs, "2026-08-15", "2026-08-15", 1).length).toBe(1);
    expect(filtrarPorPeriodoTurno(regs, "2026-08-15", "2026-08-15", 2).length).toBe(1);
    expect(filtrarPorPeriodoTurno(regs, "2026-08-14", "2026-08-15", null).length).toBe(3);
    expect(filtrarPorPeriodoTurno(regs, "2026-08-14", "2026-08-15", 2).length).toBe(2);
  });

  it("filtrarPorPeriodoTurno fallback para dataLocalISO quando sem dataOperacional", () => {
    const regs = [{ data: "2026-08-15T10:00:00.000Z" }, { data: "2026-08-16T10:00:00.000Z" }];
    expect(filtrarPorPeriodoTurno(regs, "2026-08-15", "2026-08-15", null).length).toBe(1);
  });
});

describe("saldoDoCaixa", () => {
  it("soma entradas e subtrai trocos e retiradas, separando cédulas e moedas", () => {
    const saldo = saldoDoCaixa([
      { tipo: "entrada", cedulas: 100, moedas: 1.5, valor: 101.5 },
      { tipo: "saida", cedulas: 20, moedas: 0.5, valor: 20.5 },
      { tipo: "retirada", cedulas: 50, moedas: 0, valor: 50 },
      { tipo: "entrada", origem: "Moedas", valor: 3 },
      { tipo: "saida", origem: "Cédulas", valor: 10 },
      { tipo: "retirada", valor: 5 }
    ]);
    expect(saldo).toEqual({ cedulas: 15, moedas: 4 });
  });
});

describe("situacaoEstoque", () => {
  it("separa sem contagem, faltando, baixo e ok", () => {
    expect(situacaoEstoque(null, 5)).toBe("sem");
    expect(situacaoEstoque(0, 5)).toBe("faltando");
    expect(situacaoEstoque(5, 5)).toBe("faltando");
    expect(situacaoEstoque(6, 5)).toBe("baixo");
    expect(situacaoEstoque(8, 5)).toBe("baixo");
    expect(situacaoEstoque(9, 5)).toBe("ok");
    expect(situacaoEstoque(1, 0)).toBe("ok");
  });

  it("sugere completar até o ideal ou até o dobro do mínimo", () => {
    expect(estoqueIdealDe(6, 24)).toBe(24);
    expect(estoqueIdealDe(6, null)).toBe(12);
    expect(sugestaoReposicao(4, 8, 30)).toBe(26);
    expect(sugestaoReposicao(null, 6, null)).toBe(12);
    expect(sugestaoReposicao(40, 6, 24)).toBe(0);
  });
});

describe("statusEstoque", () => {
  it("retorna nao_informado quando estoque ausente ou null", () => {
    expect(statusEstoque(null, 5)).toBe("nao_informado");
    expect(statusEstoque(undefined, 5)).toBe("nao_informado");
    expect(statusEstoque(NaN, 5)).toBe("nao_informado");
  });

  it("retorna sem_estoque quando estoque e zero ou negativo", () => {
    expect(statusEstoque(0, 5)).toBe("sem_estoque");
    expect(statusEstoque(-1, 5)).toBe("sem_estoque");
  });

  it("retorna baixo quando estoque esta no limite minimo", () => {
    expect(statusEstoque(5, 5)).toBe("baixo");
    expect(statusEstoque(3, 5)).toBe("baixo");
  });

  it("retorna ok acima do limite minimo", () => {
    expect(statusEstoque(6, 5)).toBe("ok");
    expect(statusEstoque(20, 5)).toBe("ok");
  });
});

describe("jsonCanonical", () => {
  it("serializa de forma estável independente da ordem das chaves", () => {
    expect(jsonCanonical({ b: 1, a: 2 })).toBe(jsonCanonical({ a: 2, b: 1 }));
  });

  it("ordena chaves aninhadas e de arrays", () => {
    expect(jsonCanonical({ z: { x: 1, y: 2 }, a: [3, 2] })).toBe(jsonCanonical({ a: [3, 2], z: { y: 2, x: 1 } }));
  });

  it("retorna string vazia para valores nulos", () => {
    expect(jsonCanonical(null)).toBe("");
    expect(jsonCanonical(undefined)).toBe("");
  });
});

describe("cores", () => {
  it("hexParaRgb converte hex de 6 digitos", () => {
    expect(hexParaRgb("#f97316")).toEqual({ r: 249, g: 115, b: 22 });
  });

  it("hexParaRgb converte hex abreviado de 3 digitos", () => {
    expect(hexParaRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("escurecerHex reduz os componentes", () => {
    expect(escurecerHex("#ffffff", 0.5)).toBe("#808080");
  });

  it("clarearHex aumenta os componentes sem passar de 255", () => {
    expect(clarearHex("#000000", 0.5)).toBe("#000000");
    expect(clarearHex("#202020", 0.5)).toBe("#303030");
  });

  it("contrasteHex segue a razao de contraste WCAG", () => {
    expect(contrasteHex("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrasteHex("#f97316", "#ffffff")).toBeLessThan(4.5);
  });

  it("corComContrasteBranco escurece ate atingir 4.5:1 com texto branco", () => {
    const forte = corComContrasteBranco("#f97316");
    expect(contrasteHex(forte, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(corComContrasteBranco("#c2410c")).toBe("#C2410C");
    expect(corComContrasteBranco("invalida")).toBe("invalida");
  });
});
