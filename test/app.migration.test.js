import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(ROOT, "index.html"), "utf8").replace(/^<!DOCTYPE[^>]*>/i, "");
const core = readFileSync(resolve(ROOT, "src", "core.js"), "utf8");
const app = readFileSync(resolve(ROOT, "src", "app.js"), "utf8");

// Cada boot simula um recarregamento de página: os temporizadores da instância
// anterior do app são cancelados para não mexerem na tela do teste seguinte,
// nem dispararem depois que o arquivo de testes terminou.
let intervalosDoApp = [];
let esperasDoApp = [];
if (!globalThis.__setIntervalOriginal) globalThis.__setIntervalOriginal = globalThis.setInterval;
if (!globalThis.__setTimeoutOriginal) globalThis.__setTimeoutOriginal = globalThis.setTimeout;
function setIntervalRegistrado(fn, ms, ...args) {
  const id = globalThis.__setIntervalOriginal(fn, ms, ...args);
  intervalosDoApp.push(id);
  return id;
}
// Só as esperas ainda pendentes ficam registradas: cada uma sai da lista ao disparar,
// para nunca cancelar por engano um número já reaproveitado por outro temporizador.
function setTimeoutRegistrado(fn, ms, ...args) {
  const id = globalThis.__setTimeoutOriginal(
    (...a) => {
      esperasDoApp = esperasDoApp.filter((x) => x !== id);
      if (typeof fn === "function") fn(...a);
    },
    ms,
    ...args
  );
  esperasDoApp.push(id);
  return id;
}
function encerrarInstanciaAnterior() {
  intervalosDoApp.forEach((id) => clearInterval(id));
  esperasDoApp.forEach((id) => clearTimeout(id));
  intervalosDoApp = [];
  esperasDoApp = [];
}
afterAll(encerrarInstanciaAnterior);

function boot(fetchImpl) {
  encerrarInstanciaAnterior();
  document.documentElement.innerHTML = html;
  window.fetch =
    fetchImpl ||
    (() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ values: [] }),
        text: () => Promise.resolve("")
      }));
  // eslint-disable-next-line no-unused-vars
  const setInterval = setIntervalRegistrado;
  // eslint-disable-next-line no-unused-vars
  const setTimeout = setTimeoutRegistrado;
  eval(core + "\n" + app);
}

beforeEach(() => {
  window.localStorage.clear();
  // Posto já configurado: o assistente de primeira abertura só abre nos testes dele.
  window.localStorage.setItem("eletroposto_config", "{}");
  window.location.hash = "";
});

describe("migração da interface nova", () => {
  it("mantém a lista de consumos ao confirmar uma venda pendente", () => {
    expect(app).toContain("ab.consumoProdutos = consumos");
    expect(app).toContain("item.estoqueReferenciaId === consumo.estoqueReferenciaId");
  });

  it("atribui semântica acessível a alertas e modais", () => {
    boot();

    expect(document.getElementById("alert-box").getAttribute("role")).toBe("status");
    expect(document.getElementById("alert-box").getAttribute("aria-live")).toBe("polite");
    expect(document.getElementById("modal-edicao").getAttribute("role")).toBe("dialog");
    expect(document.getElementById("modal-edicao").getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById("modal-edicao").getAttribute("aria-labelledby")).toBe("modal-edicao-titulo");
  });

  it("renderiza notificações de cinco minutos com ações de sessão", () => {
    expect(html).toContain('id="notificacoes-5min"');
    expect(app).toContain("progresso.restanteMin > 5");
    expect(app).toContain('data-notificacao-previsao="');
    expect(app).toContain('data-notificacao-finalizar="');
    expect(app).toContain("abrirPrevisao(previsao.dataset.notificacaoPrevisao)");
    expect(app).toContain("abrirFinalizar(finalizar.dataset.notificacaoFinalizar)");
    expect(app).toContain('irParaAba("tab-andamento")');
  });

  it("permite fila anônima e reserva o bico até selecionar um cliente", () => {
    expect(app).toContain('s.status = "vaga-liberada"');
    expect(app).toContain('s.status !== "vaga-liberada"');
    expect(app).toContain("filaLiberadaSelecionadaId");
    expect(app).toContain(
      'mostrarAlerta("Espera adicionada à fila. Quando uma vaga liberar, selecione o cliente para iniciar o abastecimento.", "success")'
    );
    expect(app).toContain("data-fila-liberada");
    expect(app).toContain("selecionarFilaLiberada(btn.dataset.filaLiberada)");
    expect(app).toContain('reservaFila.status = "carregando"');
    expect(app).toContain("s.id !== reservaFila.id && placaNormalizada(s.placa) === placaNormalizada(placa)");
  });

  it("exige perfil ativo no primeiro acesso e nas viradas de turno", () => {
    expect(html).toContain('id="modal-perfil-turno-obrigatorio"');
    expect(html).toContain('id="select-perfil-turno-obrigatorio"');
    expect(app).toContain('PERFIL_TURNO_REGRA_VERSAO = "perfil-turno-obrigatorio-v1"');
    expect(app).toContain("return getDadosTurnoAtual().inicioTurno;");
    expect(app).toContain("setInterval(abrirSelecaoPerfilTurno, 15000)");
    expect(app).toContain('modal.classList.add("show")');
    expect(app).toContain("function perfisOrdenadosPorTurno()");
    expect(app).toContain('document.addEventListener("keydown", function (e)');
    expect(html).toContain('id="btn-cadastrar-perfil-turno"');
  });

  it("notifica sessões que chegam atrasadas aos cinco minutos e protege notificações removidas", () => {
    expect(app).toContain('"Tempo previsto atingido"');
    expect(app).toContain("progresso.restanteMin > 5");
    expect(app).toContain("notificacoes5MinFechadas.has(s.id)");
    expect(app).toContain("salvar(KEY_NOTIFICACOES_FECHADAS");
    expect(app).toContain("if (!sessao) {");
    expect(app).toContain("item.remove()");
  });

  it("exibe progresso atualizado e permite fechar a notificação", () => {
    expect(app).toContain("data-notificacao-progresso");
    expect(app).toContain("data-notificacao-percentual");
    expect(app).toContain("data-notificacao-fechar");
    expect(app).toContain('aria-label="Fechar notificação"');
    expect(app).toContain("notificacao.remove()");
  });

  it("troca livremente entre os modos Operador e Admin pelo topo", () => {
    boot();
    const visiveis = () =>
      Array.from(document.querySelectorAll("#tabs .tab-btn"))
        .filter((b) => !b.hidden)
        .map((b) => b.dataset.tab);
    expect(document.body.dataset.modo).toBe("operador");
    expect(visiveis()).toEqual(["tab-andamento", "tab-vendas", "tab-historico", "tab-caixa"]);

    document.querySelector('[data-modo-app="admin"]').click();
    expect(window.localStorage.getItem("eletroposto_modo")).toBe("admin");
    expect(document.querySelector('[data-modo-app="admin"]').getAttribute("aria-pressed")).toBe("true");
    expect(visiveis()).toEqual(["tab-dashboard", "tab-analise", "tab-cadastro", "tab-caixa", "tab-config"]);
    expect(document.getElementById("tab-dashboard").classList.contains("active")).toBe(true);

    document.querySelector('[data-modo-app="operador"]').click();
    expect(window.localStorage.getItem("eletroposto_modo")).toBe("operador");
    expect(document.getElementById("tab-andamento").classList.contains("active")).toBe(true);
  });

  it("não pede operador do turno no modo Admin", async () => {
    window.localStorage.setItem("eletroposto_modo", "admin");
    boot();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const modal = document.getElementById("modal-perfil-turno-obrigatorio");
    expect(modal.classList.contains("show")).toBe(false);

    document.querySelector('[data-modo-app="operador"]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(modal.classList.contains("show")).toBe(true);
  });

  it("escapa dados remotos ao renderizar clientes, combos e caixa", () => {
    window.localStorage.setItem(
      "eletroposto_clientes",
      JSON.stringify([{ id: "cliente-seguro", placa: '<img data-xss-placa="1">', nome: "Cliente", modelo: "Modelo" }])
    );
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        {
          id: 'combo" data-xss-combo="1',
          tipo: "combo",
          nome: "Combo",
          categoria: "",
          valor: 10,
          gruposCombo: []
        }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_caixa",
      JSON.stringify({
        cedulas: 0,
        moedas: 0,
        historico: [
          {
            id: "caixa-seguro",
            data: "2026-09-22T10:00:00.000Z",
            tipo: "entrada",
            origem: '<img data-xss-caixa="1">',
            descricao: "",
            automatico: false,
            valor: 10
          }
        ]
      })
    );

    boot();

    expect(document.querySelector("[data-xss-placa]")).toBeNull();
    expect(document.querySelector("[data-xss-caixa]")).toBeNull();
    expect(document.querySelector("[data-xss-combo]")).toBeNull();
    expect(document.querySelector("[data-editar-combo]").getAttribute("data-editar-combo")).toBe(
      'combo" data-xss-combo="1'
    );
  });

  it("renderiza todos os bicos e a fila quando há uma vaga liberada", () => {
    window.localStorage.setItem(
      "eletroposto_config",
      JSON.stringify({ tarifaKwh: 2, carregadores: [{ potenciaKw: 60 }, { potenciaKw: 60 }, { potenciaKw: 60 }] })
    );
    window.localStorage.setItem(
      "eletroposto_sessoes",
      JSON.stringify([
        {
          id: "reserva",
          placa: "",
          cliente: "",
          modelo: "",
          bico: 1,
          status: "vaga-liberada",
          inicio: new Date().toISOString()
        },
        {
          id: "ativa",
          placa: "BIC-0002",
          cliente: "Cliente",
          modelo: "Modelo",
          bico: 2,
          status: "carregando",
          inicio: new Date().toISOString(),
          tempoEstimadoMin: 60
        },
        { id: "espera", placa: "", cliente: "", modelo: "", status: "aguardando", inicio: new Date().toISOString() }
      ])
    );
    boot();

    const grade = document.getElementById("status-bicos-iniciar");
    expect(grade.querySelectorAll("[data-bico]")).toHaveLength(3);
    expect(grade.querySelector('[data-fila-liberada="reserva"]')).not.toBeNull();
    expect(grade.textContent).toContain("BIC-0002");
    expect(grade.querySelector(".charger-queue").textContent).toContain("Cliente 1");
    expect(document.getElementById("op-stat-livres").textContent).toBe("1");
  });

  it("expõe o combobox de placas com semântica ARIA", () => {
    window.localStorage.setItem(
      "eletroposto_clientes",
      JSON.stringify([
        { id: "c1", placa: "ARI-0001", nome: "Alfa", modelo: "Modelo" },
        { id: "c2", placa: "ARI-0002", nome: "Bravo", modelo: "Modelo" }
      ])
    );
    boot();
    window.HTMLElement.prototype.scrollIntoView = () => {};

    const input = document.getElementById("select-placa");
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-controls")).toBe("select-placa-dropdown");
    input.dispatchEvent(new Event("focus"));
    expect(input.getAttribute("aria-expanded")).toBe("true");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    const ativa = document.getElementById(input.getAttribute("aria-activedescendant"));
    expect(ativa.getAttribute("aria-selected")).toBe("true");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("não tem nenhum código de Google, planilha ou sincronização", () => {
    expect(app).not.toMatch(/google|sheetsRequest|script\.google|accounts\.google|fetch\(/i);
    expect(html).not.toMatch(/google|sheets/i);
  });

  it("normaliza registros simplificados sem perder dados operacionais", () => {
    window.localStorage.setItem(
      "eletroposto_registros",
      JSON.stringify([
        {
          id: "r1",
          placa: "ABC1D23",
          cliente: "Alfa",
          modelo: "Dolphin",
          kwh: 12.5,
          inicioRecarga: "2026-09-11T10:00:00.000Z",
          duracaoRecarga: 900,
          operador: { id: "p1", nome: "Alfa", foto: "data:image/jpeg;base64,foto" },
          metodoPagamento: "Pix"
        }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_vendas",
      JSON.stringify([
        {
          id: "v1",
          produtoId: "p1",
          produto: "Água",
          categoria: "Bebidas",
          quantidade: 1,
          valorUnitario: 3,
          valorTotal: 3,
          metodoPagamento: "Pix",
          data: "2026-09-11T10:00:00.000Z"
        }
      ])
    );

    boot();

    const [registro] = JSON.parse(window.localStorage.getItem("eletroposto_registros"));
    const [venda] = JSON.parse(window.localStorage.getItem("eletroposto_vendas"));
    expect(registro.kwhUtilizado).toBe(12.5);
    expect(registro.inicio).toBe("2026-09-11T10:00:00.000Z");
    expect(registro.duracaoSegundos).toBe(900);
    // A cópia da foto sai do registro: a foto mostrada vem do perfil.
    expect(registro.perfil).toEqual({ id: "p1", nome: "Alfa" });
    expect(venda.estoqueBaixado).toBe(true);
    expect(venda.estoqueReferenciaId).toBe("v1");
  });

  it("restaura tema previamente serializado pela interface simplificada", () => {
    window.localStorage.setItem("eletroposto_tema", JSON.stringify("dark"));

    boot();

    expect(document.body.classList.contains("dark")).toBe(true);
  });

  it("migra consumo e kWh únicos para listas acumuláveis", () => {
    window.localStorage.setItem(
      "eletroposto_registros",
      JSON.stringify([
        {
          id: "r1",
          placa: "ABC1D23",
          cliente: "Alfa",
          modelo: "Dolphin",
          kwhUtilizado: 12.5,
          consumoProduto: { id: "p1", nome: "Água", quantidade: 2, valorUnitario: 3 },
          consumoConveniencia: "Sim",
          valorConsumo: 6
        }
      ])
    );

    boot();

    const [registro] = JSON.parse(window.localStorage.getItem("eletroposto_registros"));
    expect(registro.kwhPartes).toEqual([12.5]);
    expect(registro.consumoProdutos).toEqual([registro.consumoProduto]);
  });

  it("migra produto legado para produto pai e SKU padrão sem trocar seu ID", () => {
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        {
          id: "agua-1",
          nome: "Água",
          categoria: "Bebidas",
          valor: 5,
          estoque: 7,
          estoqueMinimo: 2
        }
      ])
    );

    boot();

    const produtos = JSON.parse(window.localStorage.getItem("eletroposto_produtos"));
    const sku = produtos.find((produto) => produto.id === "agua-1");
    const pai = produtos.find((produto) => produto.tipo === "pai");
    expect(sku).toMatchObject({ tipo: "sku", variante: "Padrão", estoque: 7 });
    expect(sku.produtoPaiId).toBe(pai.id);
    expect(pai).toMatchObject({ nome: "Água", categoria: "Bebidas" });
  });

  function comoAdmin() {
    window.localStorage.setItem("eletroposto_modo", "admin");
  }

  function enviar(id) {
    document.getElementById(id).dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  }

  function digitarPin(pin) {
    const primeiro = document.querySelector("#pin-caixas .pin-digito");
    primeiro.value = pin;
    primeiro.dispatchEvent(new window.Event("input", { bubbles: true }));
  }

  function caixaComVendaEmDinheiro() {
    const data = new Date().toISOString();
    const referencia = { tipo: "venda", id: "v1" };
    window.localStorage.setItem(
      "eletroposto_vendas",
      JSON.stringify([
        { id: "v1", produto: "Água", valorTotal: 5, quantidade: 1, metodoPagamento: "Dinheiro", data, turno: 1 }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_caixa",
      JSON.stringify({
        cedulas: 5,
        moedas: 0,
        porMovimentos: true,
        historico: [
          {
            id: "e1",
            data,
            turno: 1,
            tipo: "entrada",
            origem: "Venda Água",
            descricao: "Recebimento em dinheiro",
            cedulas: 10,
            moedas: 0,
            valor: 10,
            automatico: true,
            referencia
          },
          {
            id: "s1",
            data,
            turno: 1,
            tipo: "saida",
            origem: "Venda Água",
            descricao: "Troco ao cliente",
            cedulas: 5,
            moedas: 0,
            valor: 5,
            automatico: true,
            referencia
          }
        ]
      })
    );
  }

  it("operador corrige o dinheiro de um registro do caixa só com o PIN do admin", async () => {
    caixaComVendaEmDinheiro();
    boot();
    document.querySelector('.tab-btn[data-tab="tab-caixa"]').click();
    document.querySelector("#lista-caixa [data-editar-caixa]").click();

    expect(document.getElementById("modal-pin-admin").classList.contains("show")).toBe(true);
    expect(document.getElementById("modal-caixa-registro").classList.contains("show")).toBe(false);

    digitarPin("1234");
    expect(document.getElementById("pin-admin-erro").textContent).toContain("PIN incorreto. Restam 4 tentativas.");
    expect(document.getElementById("modal-caixa-registro").classList.contains("show")).toBe(false);

    digitarPin("0000");
    await Promise.resolve();
    expect(document.getElementById("modal-pin-admin").classList.contains("show")).toBe(false);
    expect(document.getElementById("modal-caixa-registro").classList.contains("show")).toBe(true);

    document.getElementById("cxr-cedulas-recebidas").value = "R$ 20,00";
    document.getElementById("cxr-cedulas-troco").value = "R$ 15,00";
    enviar("form-caixa-registro");

    const movs = JSON.parse(window.localStorage.getItem("eletroposto_caixa")).historico.filter(
      (m) => m.referencia && m.referencia.id === "v1"
    );
    expect(movs.find((m) => m.tipo === "entrada")).toMatchObject({ cedulas: 20, autorizacao: { porPin: true } });
    expect(movs.find((m) => m.tipo === "saida")).toMatchObject({ cedulas: 15, autorizacao: { porPin: true } });
  });

  it("bloqueia o PIN depois de 5 tentativas erradas", () => {
    caixaComVendaEmDinheiro();
    boot();
    document.querySelector('.tab-btn[data-tab="tab-caixa"]').click();
    document.querySelector("#lista-caixa [data-editar-caixa]").click();
    for (let i = 0; i < 5; i++) digitarPin("9999");
    expect(document.getElementById("pin-admin-erro").textContent).toContain("Muitas tentativas erradas");
    // Bloqueado: nem o PIN certo passa
    digitarPin("0000");
    expect(document.getElementById("modal-caixa-registro").classList.contains("show")).toBe(false);
  });

  it("admin troca o PIN e o PIN antigo deixa de valer", async () => {
    comoAdmin();
    boot();
    document.getElementById("cfg-pin-novo").value = "4321";
    document.getElementById("cfg-pin-confirmar").value = "4321";
    enviar("form-cfg-pin");
    await Promise.resolve();
    const config = JSON.parse(window.localStorage.getItem("eletroposto_config"));
    expect(config.pinAdmin.hash).toBeTruthy();
    expect(JSON.stringify(config)).not.toContain("4321");
    expect(document.getElementById("cfg-resumo-pin").textContent).toContain("Trocado em");
  });

  function produtoCocaComEstoque(estoque, extra) {
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        { id: "pai-coca", tipo: "pai", nome: "Coca-Cola", categoria: "Bebidas", ativo: true },
        Object.assign(
          {
            id: "sku-coca",
            tipo: "sku",
            produtoPaiId: "pai-coca",
            nome: "Coca-Cola",
            variante: "Lata 350 ml",
            categoria: "Bebidas",
            valor: 5,
            estoque: estoque,
            estoqueMinimo: 4,
            ativo: true
          },
          extra
        )
      ])
    );
  }

  it("mostra e grava o nome da variação quando o produto tem uma só", () => {
    comoAdmin();
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        { id: "pai-agua", tipo: "pai", nome: "Água", categoria: "Bebidas", ativo: true },
        {
          id: "agua",
          tipo: "sku",
          produtoPaiId: "pai-agua",
          nome: "Água",
          variante: "Garrafa 500 ml",
          categoria: "Bebidas",
          valor: 3,
          estoque: 10,
          estoqueMinimo: 2,
          ativo: true
        }
      ])
    );
    boot();
    document.getElementById("seg-cad-produtos").click();
    document.querySelector('[data-editar-produto-pai="pai-agua"]').click();
    const campo = document.getElementById("var-nome-0");
    expect(campo.value).toBe("Garrafa 500 ml");
    campo.value = "Garrafa 1,5 L";
    enviar("form-produto");
    const sku = JSON.parse(window.localStorage.getItem("eletroposto_produtos")).find((p) => p.id === "agua");
    expect(sku.variante).toBe("Garrafa 1,5 L");
  });

  it("cadastra produto com variações numa folha só", () => {
    comoAdmin();
    boot();

    document.getElementById("seg-cad-produtos").click();
    document.getElementById("btn-novo-cadastro").click();
    expect(document.getElementById("modal-cad-produtos").classList.contains("show")).toBe(true);
    // Com uma variação só, o nome da variação aparece, opcional (vazio fica "Padrão")
    expect(document.getElementById("var-nome-0").value).toBe("");
    expect(document.getElementById("var-nome-0").placeholder).toBe("Padrão");
    expect(document.querySelector("[data-remover-variacao]")).toBeNull();
    document.getElementById("prod-nome").value = "Coca-Cola";
    document.getElementById("prod-categoria").value = "Bebidas";
    document.getElementById("var-valor-0").value = "R$ 5,00";
    document.getElementById("var-estoque-0").value = "20";
    document.getElementById("var-min-0").value = "4";

    document.getElementById("btn-add-variacao").click();
    expect(document.getElementById("var-valor-0").value).toBe("R$ 5,00");
    document.getElementById("var-nome-0").value = "Lata 350 ml";
    document.getElementById("var-nome-1").value = "Garrafa 600 ml";
    document.getElementById("var-valor-1").value = "R$ 8,50";
    document.getElementById("var-min-1").value = "3";
    document.getElementById("var-ideal-1").value = "12";
    enviar("form-produto");

    const produtos = JSON.parse(window.localStorage.getItem("eletroposto_produtos"));
    const pai = produtos.find((produto) => produto.tipo === "pai");
    expect(pai).toMatchObject({ nome: "Coca-Cola", categoria: "Bebidas" });
    expect(produtos.find((produto) => produto.variante === "Lata 350 ml")).toMatchObject({
      produtoPaiId: pai.id,
      valor: 5,
      estoque: 20,
      estoqueMinimo: 4,
      estoqueIdeal: null
    });
    expect(produtos.find((produto) => produto.variante === "Garrafa 600 ml")).toMatchObject({
      valor: 8.5,
      estoque: null,
      estoqueMinimo: 3,
      estoqueIdeal: 12
    });
  });

  it("edita produto e variação sem mexer no estoque nem no valor de vendas antigas", () => {
    produtoCocaComEstoque(20);
    window.localStorage.setItem(
      "eletroposto_vendas",
      JSON.stringify([
        {
          id: "v1",
          produtoId: "sku-coca",
          produto: "Coca-Cola — Lata 350 ml",
          categoria: "Bebidas",
          quantidade: 2,
          valorUnitario: 5,
          valorTotal: 10
        }
      ])
    );
    comoAdmin();
    boot();

    document.querySelector('#estoque-chips-cad [data-filtro-estoque="todos"]').click();
    document.querySelector('#lista-produtos [data-editar-produto-pai="pai-coca"]').click();
    expect(document.getElementById("prod-nome").value).toBe("Coca-Cola");
    expect(document.getElementById("var-estoque-0").readOnly).toBe(true);
    document.getElementById("prod-nome").value = "Coca-Cola Zero";
    document.getElementById("prod-categoria").value = "Refrigerantes";
    document.getElementById("var-valor-0").value = "R$ 8,00";
    document.getElementById("var-min-0").value = "3";
    enviar("form-produto");

    const produtos = JSON.parse(window.localStorage.getItem("eletroposto_produtos"));
    expect(produtos.find((produto) => produto.id === "pai-coca")).toMatchObject({
      nome: "Coca-Cola Zero",
      categoria: "Refrigerantes"
    });
    expect(produtos.find((produto) => produto.id === "sku-coca")).toMatchObject({
      nome: "Coca-Cola Zero",
      categoria: "Refrigerantes",
      valor: 8,
      estoque: 20,
      estoqueMinimo: 3
    });
    const venda = JSON.parse(window.localStorage.getItem("eletroposto_vendas"))[0];
    expect(venda).toMatchObject({
      produto: "Coca-Cola Zero — Lata 350 ml",
      categoria: "Refrigerantes",
      valorTotal: 10
    });
  });

  it("exclui produto com todas as variações e preserva as vendas", () => {
    produtoCocaComEstoque(20);
    window.localStorage.setItem(
      "eletroposto_vendas",
      JSON.stringify([
        {
          id: "v1",
          produtoId: "sku-coca",
          produto: "Coca-Cola — Lata",
          categoria: "Bebidas",
          quantidade: 1,
          valorUnitario: 5,
          valorTotal: 5
        }
      ])
    );
    window.confirm = () => true;
    comoAdmin();
    boot();

    document.querySelector('#estoque-chips-cad [data-filtro-estoque="todos"]').click();
    document.querySelector('#lista-produtos [data-editar-produto-pai="pai-coca"]').click();
    document.getElementById("btn-excluir-produto").click();

    expect(JSON.parse(window.localStorage.getItem("eletroposto_produtos"))).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem("eletroposto_vendas"))).toHaveLength(1);
  });

  it("abre os produtos em Faltando e repõe com a sugestão até o ideal", () => {
    produtoCocaComEstoque(2, { estoqueIdeal: 10 });
    comoAdmin();
    boot();

    expect(document.querySelector('#estoque-chips-cad [aria-pressed="true"]').dataset.filtroEstoque).toBe("faltando");
    expect(document.querySelector('.tab-btn[data-tab="tab-cadastro"] .tab-badge').textContent).toBe("1");
    document.querySelector('#lista-produtos [data-repor="sku-coca"]').click();
    expect(document.getElementById("modal-repor").classList.contains("show")).toBe(true);
    expect(document.getElementById("repor-qtd").value).toBe("8");
    document.querySelector('[data-repor-soma="6"]').click();
    expect(document.getElementById("repor-resultado-valor").textContent).toBe("16 un");
    enviar("form-repor");

    const sku = JSON.parse(window.localStorage.getItem("eletroposto_produtos")).find(
      (produto) => produto.id === "sku-coca"
    );
    expect(sku.estoque).toBe(16);
    const movimentos = JSON.parse(window.localStorage.getItem("eletroposto_movimentos_estoque"));
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0]).toMatchObject({
      produtoId: "sku-coca",
      tipo: "reposicao",
      quantidade: 14,
      estoqueAntes: 2,
      estoqueDepois: 16
    });
    expect(document.querySelector('.tab-btn[data-tab="tab-cadastro"] .tab-badge').hidden).toBe(true);
  });

  it("corrige a contagem com motivo e registra a perda", () => {
    produtoCocaComEstoque(10);
    comoAdmin();
    boot();

    document.querySelector('#estoque-chips-cad [data-filtro-estoque="todos"]').click();
    document.querySelector('#lista-produtos [data-repor="sku-coca"]').click();
    document.querySelector('#repor-modos [data-modo="contagem"]').click();
    expect(document.getElementById("repor-motivo-campo").hidden).toBe(false);
    document.getElementById("repor-qtd").value = "7";
    document.getElementById("repor-motivo").value = "perda";
    enviar("form-repor");

    const sku = JSON.parse(window.localStorage.getItem("eletroposto_produtos")).find(
      (produto) => produto.id === "sku-coca"
    );
    expect(sku.estoque).toBe(7);
    const movimentos = JSON.parse(window.localStorage.getItem("eletroposto_movimentos_estoque"));
    expect(movimentos[0]).toMatchObject({ tipo: "perda", quantidade: -3, estoqueAntes: 10, estoqueDepois: 7 });
  });

  it("deixa o operador só repor, sem corrigir contagem", () => {
    produtoCocaComEstoque(10);
    boot();

    document.querySelector('#estoque-chips-venda [data-filtro-estoque="todos"]').click();
    document.querySelector('#lista-estoque [data-repor="sku-coca"]').click();
    expect(document.getElementById("repor-modos").hidden).toBe(true);
    document.querySelector('#repor-modos [data-modo="contagem"]').click();
    expect(document.getElementById("repor-titulo").textContent).toBe("Repor estoque");
  });

  it("monta o dashboard de produtos com combos e comparação até a mesma hora", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 28, 14, 20));
    try {
      const quando = (dia, hora) => new Date(2026, 9, dia, hora, 0).toISOString();
      window.localStorage.setItem(
        "eletroposto_produtos",
        JSON.stringify([
          { id: "pai", tipo: "pai", nome: "Café", categoria: "Bebidas", ativo: true },
          {
            id: "exp",
            tipo: "sku",
            produtoPaiId: "pai",
            nome: "Café",
            variante: "Expresso",
            categoria: "Bebidas",
            valor: 6,
            estoque: 30,
            estoqueMinimo: 5,
            ativo: true
          },
          {
            id: "co1",
            tipo: "combo",
            nome: "Café da manhã",
            categoria: "Combos",
            valor: 11,
            itensCombo: [{ produtoId: "exp", quantidade: 1 }],
            ativo: true
          }
        ])
      );
      const operador = { id: "p1", nome: "Mira" };
      window.localStorage.setItem(
        "eletroposto_vendas",
        JSON.stringify([
          {
            id: "v1",
            produtoId: "exp",
            produtoPaiId: "pai",
            produto: "Café — Expresso",
            categoria: "Bebidas",
            quantidade: 2,
            valorTotal: 12,
            metodoPagamento: "Pix",
            data: quando(28, 10),
            dataOperacional: "2026-10-28",
            turno: 1,
            operador
          },
          {
            id: "v2",
            produtoId: "co1",
            produto: "Café da manhã",
            categoria: "Combos",
            quantidade: 1,
            valorTotal: 11,
            itensCombo: [{ produtoId: "exp", quantidade: 1 }],
            metodoPagamento: "Pix",
            data: quando(28, 12),
            dataOperacional: "2026-10-28",
            turno: 1,
            operador
          },
          {
            id: "v3",
            produtoId: "exp",
            produtoPaiId: "pai",
            produto: "Café — Expresso",
            categoria: "Bebidas",
            quantidade: 1,
            valorTotal: 6,
            metodoPagamento: "Pix",
            data: quando(27, 9),
            dataOperacional: "2026-10-27",
            turno: 1,
            operador
          },
          {
            id: "v4",
            produtoId: "exp",
            produtoPaiId: "pai",
            produto: "Café — Expresso",
            categoria: "Bebidas",
            quantidade: 5,
            valorTotal: 30,
            metodoPagamento: "Pix",
            data: quando(27, 18),
            dataOperacional: "2026-10-27",
            turno: 2,
            operador
          }
        ])
      );
      comoAdmin();
      boot();
      const texto = (el) => el.textContent.replace(/\s+/g, " ").trim();

      const painel = document.getElementById("dash-produtos");
      expect(texto(painel.querySelector(".dash-figura.destaque strong"))).toBe("R$ 23,00");
      expect(texto(document.getElementById("dash-compara"))).toBe("Comparando com ontem até 14:20");
      const ranking = painel.querySelectorAll("[data-dash-rank-item]");
      expect(ranking).toHaveLength(2);
      // A venda de ontem às 18h fica fora da comparação: só conta até 14:20
      expect(texto(ranking[0])).toContain("Café");
      expect(texto(ranking[0])).toContain("R$ 12,00");
      expect(texto(ranking[0])).toContain("+100%");
      expect(texto(ranking[1])).toContain("Café da manhã");
      expect(texto(ranking[1])).toContain("Combo");

      painel.querySelector('[data-dash-rank="un"]').click();
      const porUnidade = document.querySelectorAll("#dash-produtos [data-dash-rank-item]");
      expect(porUnidade).toHaveLength(1);
      expect(texto(porUnidade[0])).toContain("3 un");

      document.getElementById("btn-dash-filtros").click();
      document.getElementById("dash-f-turno").value = "2";
      document
        .getElementById("form-dash-filtros")
        .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      expect(texto(document.querySelector("#dash-produtos .dash-figura.destaque strong"))).toBe("R$ 0,00");
      expect(texto(document.getElementById("dash-ativos"))).toContain("Turno 2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("edita operador sem pedir e-mail", () => {
    window.localStorage.setItem(
      "eletroposto_perfis",
      JSON.stringify([
        { id: "p1", nome: "Mira", turno: 1 },
        { id: "p2", nome: "Romeo", turno: 2 }
      ])
    );
    comoAdmin();
    boot();

    document.querySelector('[data-editar-perfil="0"]').click();
    document.getElementById("editpf-nome").value = "Mira Sierra";
    enviar("form-perfil-edicao");

    const perfis = JSON.parse(window.localStorage.getItem("eletroposto_perfis"));
    expect(perfis[0]).toMatchObject({ nome: "Mira Sierra", turno: 1 });
  });

  it("configura três turnos e atualiza os seletores de turno do app", () => {
    comoAdmin();
    boot();

    document.getElementById("btn-abrir-turnos").click();
    document.getElementById("btn-add-turno").click();
    document.getElementById("turno-nome-0").value = "Manhã";
    document.getElementById("turno-inicio-0").value = "06:00";
    document.getElementById("turno-fim-0").value = "14:00";
    document.getElementById("turno-nome-1").value = "Tarde";
    document.getElementById("turno-inicio-1").value = "14:00";
    document.getElementById("turno-fim-1").value = "22:00";
    document.getElementById("turno-nome-2").value = "Noite";
    document.getElementById("turno-inicio-2").value = "22:00";
    document.getElementById("turno-fim-2").value = "06:00";
    enviar("form-turnos");

    const config = JSON.parse(window.localStorage.getItem("eletroposto_config"));
    expect(config.turnos.map((t) => t.nome)).toEqual(["Manhã", "Tarde", "Noite"]);
    const opcoes = Array.from(document.getElementById("dash-f-turno").options).map((o) => o.textContent);
    expect(opcoes).toEqual(["Todos", "Manhã", "Tarde", "Noite"]);
    expect(document.getElementById("cfg-resumo-turnos").textContent).toContain("Noite 22:00 a 06:00");
  });

  const TURNOS_TRES = [
    { id: 1, nome: "Manhã", inicio: "06:00", fim: "14:00" },
    { id: 2, nome: "Tarde", inicio: "14:00", fim: "22:00" },
    { id: 3, nome: "Noite", inicio: "22:00", fim: "06:00" }
  ];

  function inicioDoTurnoTres(agora) {
    const h = agora.getHours();
    const inicio = new Date(agora);
    inicio.setSeconds(0, 0);
    if (h >= 22) inicio.setHours(22, 0);
    else if (h >= 14) inicio.setHours(14, 0);
    else if (h >= 6) inicio.setHours(6, 0);
    else {
      inicio.setDate(inicio.getDate() - 1);
      inicio.setHours(22, 0);
    }
    return { iso: inicio.toISOString(), nome: h >= 22 || h < 6 ? "Noite" : h >= 14 ? "Tarde" : "Manhã" };
  }

  it("pede o operador no início dos turnos configurados, não em horários fixos", async () => {
    const config = JSON.parse(window.localStorage.getItem("eletroposto_config") || "{}");
    window.localStorage.setItem("eletroposto_config", JSON.stringify(Object.assign(config, { turnos: TURNOS_TRES })));
    window.localStorage.setItem(
      "eletroposto_perfis",
      JSON.stringify([{ id: "op1", nome: "Mira", turno: 1, foto: "" }])
    );
    window.localStorage.setItem("eletroposto_perfil_ativo", JSON.stringify("op1"));
    const atual = inicioDoTurnoTres(new Date());
    window.localStorage.setItem(
      "eletroposto_perfil_turno_regra",
      JSON.stringify({ versao: "perfil-turno-obrigatorio-v1", inicioTurno: atual.iso })
    );
    boot();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.getElementById("modal-perfil-turno-obrigatorio").classList.contains("show")).toBe(false);

    // Confirmado num turno anterior: pede de novo, com o nome do turno configurado.
    const anterior = new Date(atual.iso);
    anterior.setHours(anterior.getHours() - 8);
    window.localStorage.setItem(
      "eletroposto_perfil_turno_regra",
      JSON.stringify({ versao: "perfil-turno-obrigatorio-v1", inicioTurno: anterior.toISOString() })
    );
    boot();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.getElementById("modal-perfil-turno-obrigatorio").classList.contains("show")).toBe(true);
    expect(document.getElementById("perfil-turno-obrigatorio-info").textContent).toContain("no " + atual.nome + ".");
  });

  it("monta a mensagem de encerramento com o horário dos turnos configurados", () => {
    window.localStorage.setItem("eletroposto_config", JSON.stringify({ turnos: TURNOS_TRES }));
    const abertas = [];
    window.open = (url) => abertas.push(url);
    boot();
    document.getElementById("btn-whatsapp-fechamento").click();
    const texto = decodeURIComponent(abertas[0].split("text=")[1]);
    expect(texto).toContain("Amanhã estamos de volta de 06:00h às 06:00h.");
    expect(texto).not.toContain("01:30");
  });

  it("não salva turnos sobrepostos", () => {
    comoAdmin();
    boot();
    document.getElementById("btn-abrir-turnos").click();
    document.getElementById("turno-fim-0").value = "18:00";
    enviar("form-turnos");
    expect(JSON.parse(window.localStorage.getItem("eletroposto_config") || "{}").turnos || []).not.toContainEqual(
      expect.objectContaining({ fim: "18:00" })
    );
    expect(document.getElementById("turnos-erro").textContent).toContain("se sobrepõem");
  });

  function iniciarComPlacaNova(placa) {
    window.localStorage.setItem(
      "eletroposto_modelos",
      JSON.stringify([{ modelo: "Dolphin", marca: "BYD", potenciaMaxKwh: 60, mediaKwh: 30, capacidadeBateria: 40 }])
    );
    boot();
    document.querySelector('#status-bicos-iniciar [data-bico="1"]').click();
    const busca = document.getElementById("select-placa");
    busca.value = placa;
    busca.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#select-placa-dropdown [data-nova-placa]").click();
    expect(document.getElementById("ini-placa-nova").hidden).toBe(false);
    document.querySelector('[data-quick-for="bateria-inicial"] [data-value="20"]').click();
    document.querySelector('[data-quick-for="bateria-alvo"] [data-value="80"]').click();
  }

  it("inicia uma recarga com placa não cadastrada, como cliente avulso", () => {
    iniciarComPlacaNova("abc1d23");
    document.getElementById("ini-novo-salvar").click();
    document.getElementById("ini-novo-modelo").value = "Dolphin";
    document.getElementById("ini-novo-modelo").dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("form-iniciar").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    const [sessao] = JSON.parse(window.localStorage.getItem("eletroposto_sessoes"));
    expect(sessao).toMatchObject({
      placa: "ABC-1D23",
      cliente: "Cliente avulso",
      modelo: "Dolphin",
      status: "carregando",
      tempoEstimadoMin: 48
    });
    expect(JSON.parse(window.localStorage.getItem("eletroposto_clientes") || "[]")).toEqual([]);
  });

  it("cadastra o cliente novo ao iniciar a recarga", () => {
    iniciarComPlacaNova("XYZ9K88");
    document.getElementById("ini-novo-nome").value = "Bravo";
    document.getElementById("ini-novo-nome").dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("ini-novo-modelo").value = "Dolphin";
    document.getElementById("ini-novo-modelo").dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("form-iniciar").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(JSON.parse(window.localStorage.getItem("eletroposto_clientes"))).toEqual([
      expect.objectContaining({ placa: "XYZ-9K88", nome: "Bravo", modelo: "Dolphin" })
    ]);
    expect(JSON.parse(window.localStorage.getItem("eletroposto_sessoes"))[0]).toMatchObject({
      cliente: "Bravo",
      modelo: "Dolphin"
    });
  });

  it("deixa o operador cadastrar um modelo sem potência e estima com 70% do bico", () => {
    iniciarComPlacaNova("KLM2B34");
    const modelo = document.getElementById("ini-novo-modelo");
    modelo.value = "__novo";
    modelo.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.getElementById("modal-cad-modelos").classList.contains("show")).toBe(true);
    document.getElementById("mod-marca").value = "GWM";
    document.getElementById("mod-nome").value = "Ora 03";
    document.getElementById("mod-capacidade").value = "42";
    document.getElementById("form-modelo").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(JSON.parse(window.localStorage.getItem("eletroposto_modelos"))).toContainEqual(
      expect.objectContaining({
        modelo: "Ora 03",
        marca: "GWM",
        potenciaMaxKwh: null,
        mediaKwh: null,
        capacidadeBateria: 42
      })
    );
    expect(modelo.value).toBe("Ora 03");
    document.querySelector('[data-quick-for="bateria-alvo"] [data-value="80"]').click();
    // 42 kWh × 60% = 25,2 kWh a 70% de 40 kW (bico 1) = 28 kW → 54 min
    expect(document.getElementById("tempo-estimado").value).toBe("54");
  });

  it("mostra a pista em tempo real: bicos, quem iniciou, fila e operador ativo", async () => {
    const agora = Date.now();
    const iso = (min) => new Date(agora - min * 60000).toISOString();
    window.localStorage.setItem(
      "eletroposto_config",
      JSON.stringify({ tarifaKwh: 2, carregadores: [{ potenciaKw: 40 }, { potenciaKw: 60 }, { potenciaKw: 60 }] })
    );
    window.localStorage.setItem(
      "eletroposto_modelos",
      JSON.stringify([{ modelo: "Dolphin", marca: "BYD", potenciaMaxKwh: 60, mediaKwh: 30, capacidadeBateria: 40 }])
    );
    window.localStorage.setItem(
      "eletroposto_sessoes",
      JSON.stringify([
        {
          id: "s1",
          placa: "ABC1D23",
          cliente: "Alfa",
          modelo: "Dolphin",
          bateriaInicial: 20,
          bateriaAlvo: 80,
          tempoEstimadoMin: 60,
          bico: 1,
          status: "carregando",
          inicio: iso(30),
          criadoEm: iso(30),
          operador: { id: "p1", nome: "Mira" }
        },
        { id: "s2", placa: "XYZ9K88", bico: 2, status: "vaga-liberada", criadoEm: iso(5) },
        { id: "s3", placa: "KLM2B34", cliente: "Charlie", modelo: "Seal", status: "aguardando", criadoEm: iso(12) }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_perfis",
      JSON.stringify([
        { id: "p1", nome: "Mira", turno: 1 },
        { id: "p2", nome: "Romeo", turno: 2 }
      ])
    );
    window.localStorage.setItem("eletroposto_perfil_ativo", JSON.stringify("p1"));
    comoAdmin();
    boot();
    document.getElementById("seg-dash-pista").click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const pista = document.getElementById("dash-pista");
    const texto = pista.textContent.replace(/\s+/g, " ");
    expect(pista.hidden).toBe(false);
    expect(document.querySelector("#tab-dashboard .dash-toolbar").hidden).toBe(true);
    // Operando agora é o operador escolhido no topo deste aparelho
    expect(pista.querySelector(".dash-figura.destaque strong").textContent).toBe("Mira");
    expect(texto).not.toContain("Romeo");
    const bicos = pista.querySelectorAll(".pista-bico");
    expect(bicos).toHaveLength(3);
    expect(bicos[0].dataset.estado).toBe("carregando");
    expect(bicos[0].textContent).toContain("ABC1D23");
    expect(bicos[0].textContent).toContain("50%");
    expect(bicos[0].textContent).toContain("Faltam30 min");
    expect(bicos[0].textContent).toContain("por Mira");
    // 40 kWh × 30% = 12 kWh a R$ 2,00
    expect(bicos[0].textContent.replace(/ /g, " ")).toContain("12,00 kWh, R$ 24,00");
    expect(bicos[1].dataset.estado).toBe("reservado");
    expect(bicos[2].dataset.estado).toBe("livre");
    expect(texto).toContain("KLM2B34");
    expect(texto).toContain("esperando há 12 min");
  });

  it("registra quem iniciou a recarga", () => {
    window.localStorage.setItem("eletroposto_perfis", JSON.stringify([{ id: "p1", nome: "Mira", turno: 1 }]));
    window.localStorage.setItem("eletroposto_perfil_ativo", JSON.stringify("p1"));
    window.localStorage.setItem(
      "eletroposto_clientes",
      JSON.stringify([{ placa: "ABC1D23", nome: "Alfa", modelo: "Dolphin" }])
    );
    window.localStorage.setItem(
      "eletroposto_modelos",
      JSON.stringify([{ modelo: "Dolphin", marca: "BYD", potenciaMaxKwh: 60, mediaKwh: 30, capacidadeBateria: 40 }])
    );
    boot();

    document.querySelector('#status-bicos-iniciar [data-bico="1"]').click();
    const busca = document.getElementById("select-placa");
    busca.value = "ABC";
    busca.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#select-placa-dropdown .combobox-option").click();
    document.querySelector('[data-quick-for="bateria-inicial"] [data-value="20"]').click();
    document.querySelector('[data-quick-for="bateria-alvo"] [data-value="80"]').click();
    document.getElementById("form-iniciar").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(JSON.parse(window.localStorage.getItem("eletroposto_sessoes"))[0].operador).toMatchObject({
      id: "p1",
      nome: "Mira"
    });
  });

  it("repõe os faltantes em lote e pula o que não veio", () => {
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        { id: "pai", tipo: "pai", nome: "Café", categoria: "Bebidas", ativo: true },
        {
          id: "exp",
          tipo: "sku",
          produtoPaiId: "pai",
          nome: "Café",
          variante: "Expresso",
          categoria: "Bebidas",
          valor: 6,
          estoque: 0,
          estoqueMinimo: 5,
          estoqueIdeal: 20,
          ativo: true
        },
        {
          id: "cap",
          tipo: "sku",
          produtoPaiId: "pai",
          nome: "Café",
          variante: "Cappuccino",
          categoria: "Bebidas",
          valor: 9,
          estoque: 3,
          estoqueMinimo: 4,
          ativo: true
        }
      ])
    );
    comoAdmin();
    boot();

    document.querySelector("#lista-produtos [data-repor-lote]").click();
    const itens = document.querySelectorAll("#lote-itens [data-lote]");
    expect(itens).toHaveLength(2);
    const cap = document.querySelector('#lote-itens [data-lote="cap"]');
    cap.querySelector("[data-lote-zero]").click();
    expect(document.getElementById("lote-total").textContent).toBe("20 un");
    enviar("form-repor-lote");

    const produtos = JSON.parse(window.localStorage.getItem("eletroposto_produtos"));
    expect(produtos.find((produto) => produto.id === "exp").estoque).toBe(20);
    expect(produtos.find((produto) => produto.id === "cap").estoque).toBe(3);
    expect(JSON.parse(window.localStorage.getItem("eletroposto_movimentos_estoque"))).toHaveLength(1);
  });

  it("cria e vende combo configuravel baixando o estoque das escolhas", async () => {
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        { id: "pai", tipo: "pai", nome: "Coca-Cola", categoria: "Bebidas", ativo: true },
        {
          id: "lata",
          tipo: "sku",
          produtoPaiId: "pai",
          nome: "Coca-Cola",
          variante: "Lata",
          categoria: "Bebidas",
          valor: 5,
          estoque: 10,
          estoqueMinimo: 2,
          ativo: true
        },
        {
          id: "garrafa",
          tipo: "sku",
          produtoPaiId: "pai",
          nome: "Coca-Cola",
          variante: "Garrafa",
          categoria: "Bebidas",
          valor: 8,
          estoque: 6,
          estoqueMinimo: 2,
          ativo: true
        }
      ])
    );
    window.localStorage.setItem("eletroposto_modo", "admin");
    boot();
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.getElementById("perfil-turno-obrigatorio-nome").value = "Operador de teste";
    document.getElementById("btn-cadastrar-perfil-turno").click();
    document.getElementById("btn-confirmar-perfil-turno").click();

    document.getElementById("combo-nome").value = "Combo 01";
    document.getElementById("combo-valor").value = "R$ 10,00";
    const primeiro = document.querySelector("#combo-grupos .combo-grupo");
    primeiro.querySelector(".combo-grupo-nome").value = "Bebida";
    primeiro.querySelector('input[value="lata"]').checked = true;
    document.getElementById("btn-add-combo-grupo").click();
    const segundo = document.querySelectorAll("#combo-grupos .combo-grupo")[1];
    segundo.querySelector(".combo-grupo-nome").value = "Extra";
    segundo.querySelector('input[value="garrafa"]').checked = true;
    document
      .getElementById("form-combo")
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

    let produtos = JSON.parse(window.localStorage.getItem("eletroposto_produtos"));
    const combo = produtos.find((produto) => produto.tipo === "combo");
    expect(combo).toMatchObject({ nome: "Combo 01", valor: 10 });
    expect(combo.gruposCombo).toHaveLength(2);
    document.getElementById("select-produto").focus();
    const opcaoCombo = Array.from(document.querySelectorAll("#select-produto-dropdown .combobox-option")).find(
      function (opcao) {
        return opcao.textContent.includes("Combo 01");
      }
    );
    opcaoCombo.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.getElementById("modal-combo-selecao").classList.contains("show")).toBe(true);
    const seletores = document.querySelectorAll("#combo-selecao-grupos select");
    seletores[0].value = "lata";
    seletores[1].value = "garrafa";
    document.getElementById("combo-selecao-confirmar").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.getElementById("venda-qtd").value = "1";
    document.getElementById("venda-metodo").value = "Pix";
    document
      .getElementById("form-venda")
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    produtos = JSON.parse(window.localStorage.getItem("eletroposto_produtos"));
    expect(produtos.find((produto) => produto.id === "lata").estoque).toBe(9);
    expect(produtos.find((produto) => produto.id === "garrafa").estoque).toBe(5);
  });

  it("edita um combo sem alterar seu identificador ou grupos existentes", () => {
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        {
          id: "bebida",
          tipo: "sku",
          nome: "Suco",
          categoria: "Bebidas",
          valor: 6,
          estoque: 8,
          estoqueMinimo: 1,
          ativo: true
        },
        {
          id: "combo",
          tipo: "combo",
          nome: "Combo antigo",
          categoria: "Combos",
          valor: 10,
          gruposCombo: [{ id: "grupo-bebida", nome: "Bebida", quantidade: 1, skuIds: ["bebida"] }],
          ativo: true
        }
      ])
    );
    boot();

    document.querySelector("[data-editar-combo]").click();
    expect(document.getElementById("combo-nome").value).toBe("Combo antigo");
    document.getElementById("combo-nome").value = "Combo atualizado";
    document.getElementById("combo-valor").value = "R$ 12,00";
    document
      .getElementById("form-combo")
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

    const combo = JSON.parse(window.localStorage.getItem("eletroposto_produtos")).find(
      (produto) => produto.id === "combo"
    );
    expect(combo).toMatchObject({ id: "combo", nome: "Combo atualizado", valor: 12 });
    expect(combo.gruposCombo[0].id).toBe("grupo-bebida");
  });

  it("exibe as escolhas de combo no histórico sem undefined", () => {
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        {
          id: "bebida",
          tipo: "sku",
          nome: "Refrigerante",
          variante: "Lata",
          categoria: "Bebidas",
          valor: 5,
          estoque: 4,
          estoqueMinimo: 1,
          ativo: true
        }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_vendas",
      JSON.stringify([
        {
          id: "venda-combo",
          produtoId: "combo",
          produto: "Combo lanche",
          categoria: "Combos",
          quantidade: 1,
          valorTotal: 12,
          metodoPagamento: "Pix",
          data: "2026-09-23T12:00:00.000Z",
          alocacoesEstoque: [
            { produtoId: "bebida", quantidade: 1 },
            { produtoId: "snack-removido", nome: "Salgadinho", quantidade: 2 },
            { produtoId: "sem-nome", quantidade: 1 }
          ]
        }
      ])
    );
    boot();

    const texto = document.getElementById("lista-vendas").textContent;
    expect(texto).toContain("Escolhas: Refrigerante x1 · Salgadinho x2 · Produto removido x1");
    expect(texto).not.toContain("undefined");
  });

  it("repara nomes ausentes de vendas e pendências a partir do produto", () => {
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        {
          id: "agua",
          tipo: "sku",
          nome: "Água",
          categoria: "Bebidas",
          valor: 3,
          estoque: 5,
          estoqueMinimo: 1,
          ativo: true
        }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_vendas",
      JSON.stringify([
        {
          id: "venda-sem-nome",
          produtoId: "agua",
          categoria: "Bebidas",
          quantidade: 1,
          valorTotal: 3,
          data: "2026-09-23T12:00:00.000Z"
        }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_vendas_pre",
      JSON.stringify([
        {
          id: "pendente-sem-referencia",
          produtoId: "removido",
          quantidade: 1,
          valorTotal: 4,
          data: "2026-09-23T12:00:00.000Z"
        }
      ])
    );
    boot();

    expect(document.getElementById("lista-vendas").textContent).toContain("Água");
    expect(document.getElementById("lista-vendas-pendentes").textContent).toContain("Produto removido");
    expect(JSON.parse(window.localStorage.getItem("eletroposto_vendas"))[0].produto).toBe("Água");
    expect(JSON.parse(window.localStorage.getItem("eletroposto_vendas_pre"))[0].produto).toBe("Produto removido");
  });

  it("identifica registros sem nome e sem produto sem renderizar undefined", () => {
    window.localStorage.setItem(
      "eletroposto_vendas",
      JSON.stringify([{ id: "venda-sem-referencia", quantidade: 1, valorTotal: 0, data: "2026-09-23T12:00:00.000Z" }])
    );
    boot();

    const texto = document.getElementById("lista-vendas").textContent;
    expect(texto).toContain("Produto não identificado");
    expect(texto).not.toContain("undefined");
  });

  it("corrige uma venda vinculada e atualiza o consumo espelho do abastecimento", async () => {
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        {
          id: "agua",
          tipo: "sku",
          nome: "Água",
          categoria: "Bebidas",
          valor: 3,
          estoque: 5,
          estoqueMinimo: 1,
          ativo: true
        }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_registros",
      JSON.stringify([
        {
          id: "ab-1",
          placa: "ABC1234",
          cliente: "Cliente",
          bateriaAlvo: 80,
          valorPagar: 10,
          consumoConveniencia: "Sim",
          consumoProdutos: [
            {
              id: "removido",
              nome: "Produto removido",
              quantidade: 1,
              valorUnitario: 4,
              valorTotal: 4,
              estoqueReferenciaId: "ref-1"
            }
          ]
        }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_vendas",
      JSON.stringify([
        {
          id: "v-1",
          idAbastecimento: "ab-1",
          produtoId: "removido",
          produto: "Produto removido",
          categoria: "Combos",
          quantidade: 1,
          valorUnitario: 4,
          valorTotal: 4,
          estoqueBaixado: true,
          estoqueReferenciaId: "ref-1",
          data: "2026-09-23T12:00:00.000Z"
        }
      ])
    );
    boot();

    document.querySelector("[data-editar-venda]").click();
    document.getElementById("editv-produto").value = "agua";
    document
      .getElementById("form-venda-edicao")
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const venda = JSON.parse(window.localStorage.getItem("eletroposto_vendas"))[0];
    const abastecimento = JSON.parse(window.localStorage.getItem("eletroposto_registros"))[0];
    const produto = JSON.parse(window.localStorage.getItem("eletroposto_produtos")).find((item) => item.id === "agua");
    expect(venda).toMatchObject({ produtoId: "agua", produto: "Água", estoqueReferenciaId: "ref-1" });
    expect(abastecimento.consumoProdutos[0]).toMatchObject({ id: "agua", nome: "Água", estoqueReferenciaId: "ref-1" });
    expect(produto.estoque).toBe(4);
  });

  it("preserva vendas e estoque ao excluir um abastecimento vinculado", () => {
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        {
          id: "sku-1",
          tipo: "sku",
          nome: "Água",
          categoria: "Bebidas",
          valor: 3,
          estoque: 4,
          estoqueMinimo: 1,
          ativo: true
        }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_registros",
      JSON.stringify([
        {
          id: "ab-1",
          placa: "ABC1234",
          cliente: "Cliente",
          modelo: "Modelo",
          kwhUtilizado: 10,
          valorKwh: 1,
          valorPagar: 10,
          metodoPagamento: "Dinheiro",
          data: "2026-09-22T10:00:00.000Z",
          consumoProdutos: [{ produtoId: "sku-1", quantidade: 1, estoqueBaixado: true, estoqueReferenciaId: "ref-1" }]
        }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_vendas",
      JSON.stringify([
        {
          id: "v-1",
          idAbastecimento: "ab-1",
          produto: "Água",
          categoria: "Bebidas",
          quantidade: 1,
          valorUnitario: 3,
          valorTotal: 3,
          metodoPagamento: "Pix",
          estoqueReferenciaId: "ref-1",
          estoqueBaixado: true
        }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_vendas_pre",
      JSON.stringify([
        {
          id: "vp-1",
          idAbastecimento: "ab-1",
          idSessao: "s-1",
          produto: "Água",
          categoria: "Bebidas",
          quantidade: 1,
          valorUnitario: 3,
          valorTotal: 3,
          estoqueReferenciaId: "ref-1",
          estoqueBaixado: true
        }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_caixa",
      JSON.stringify({
        cedulas: 20,
        moedas: 0,
        historico: [
          {
            id: "cx-ab",
            tipo: "entrada",
            cedulas: 10,
            moedas: 0,
            valor: 10,
            automatico: true,
            referencia: { tipo: "abastecimento", id: "ab-1" }
          },
          {
            id: "cx-venda",
            tipo: "entrada",
            cedulas: 10,
            moedas: 0,
            valor: 10,
            automatico: true,
            referencia: { tipo: "venda", id: "v-1" }
          }
        ]
      })
    );
    window.confirm = () => true;

    boot();
    document.querySelector('.tab-btn[data-tab="tab-historico"]').click();
    expect(document.getElementById("alert-box").textContent).not.toContain("Erro inesperado");
    expect(document.getElementById("lista-historico").textContent).toContain("ABC1234");
    document.querySelector("#lista-historico [data-editar-reg]").click();
    document.querySelector("#modal-edicao [data-remover-reg]").click();

    const produto = JSON.parse(window.localStorage.getItem("eletroposto_produtos"))[0];
    const vendas = JSON.parse(window.localStorage.getItem("eletroposto_vendas"));
    const pendentes = JSON.parse(window.localStorage.getItem("eletroposto_vendas_pre"));
    const caixa = JSON.parse(window.localStorage.getItem("eletroposto_caixa"));
    expect(JSON.parse(window.localStorage.getItem("eletroposto_registros"))).toEqual([]);
    expect(produto.estoque).toBe(4);
    expect(vendas).toHaveLength(1);
    expect(pendentes[0]).toMatchObject({ idAbastecimento: "", idSessao: "" });
    expect(caixa.cedulas).toBe(10);
    expect(caixa.historico).toHaveLength(1);
    expect(caixa.historico[0].referencia).toEqual({ tipo: "venda", id: "v-1" });
  });

  it("estorna apenas recebimentos de abastecimento ao limpar o histórico", () => {
    const criarAbastecimento = (id) => ({
      id,
      placa: "ABC1234",
      cliente: "Cliente",
      modelo: "Modelo",
      kwhUtilizado: 10,
      valorKwh: 1,
      valorPagar: 10,
      metodoPagamento: "Dinheiro",
      data: "2026-09-22T10:00:00.000Z"
    });
    window.localStorage.setItem(
      "eletroposto_registros",
      JSON.stringify([criarAbastecimento("ab-1"), criarAbastecimento("ab-2")])
    );
    window.localStorage.setItem(
      "eletroposto_caixa",
      JSON.stringify({
        cedulas: 30,
        moedas: 0,
        historico: [
          {
            id: "cx-ab-1",
            tipo: "entrada",
            cedulas: 10,
            moedas: 0,
            valor: 10,
            automatico: true,
            referencia: { tipo: "abastecimento", id: "ab-1" }
          },
          {
            id: "cx-ab-2",
            tipo: "entrada",
            cedulas: 10,
            moedas: 0,
            valor: 10,
            automatico: true,
            referencia: { tipo: "abastecimento", id: "ab-2" }
          },
          {
            id: "cx-venda",
            tipo: "entrada",
            cedulas: 10,
            moedas: 0,
            valor: 10,
            automatico: true,
            referencia: { tipo: "venda", id: "v-1" }
          }
        ]
      })
    );
    window.confirm = () => true;

    boot();
    document.getElementById("btn-limpar-historico").click();
    expect(document.getElementById("modal-apagar").classList.contains("show")).toBe(true);
    expect(document.getElementById("btn-confirmar-apagar").disabled).toBe(true);
    const confirmacao = document.getElementById("apagar-confirmacao");
    confirmacao.value = "apagar";
    confirmacao.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("btn-confirmar-apagar").click();

    const caixa = JSON.parse(window.localStorage.getItem("eletroposto_caixa"));
    expect(JSON.parse(window.localStorage.getItem("eletroposto_registros"))).toEqual([]);
    expect(caixa.cedulas).toBe(10);
    expect(caixa.historico).toHaveLength(1);
    expect(caixa.historico[0].referencia).toEqual({ tipo: "venda", id: "v-1" });
  });

  it("normaliza nome numérico importado para ordenar o inventário com segurança", () => {
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        {
          id: "codigo-123",
          nome: 123,
          categoria: "Bebidas",
          valor: 5,
          estoque: 7,
          estoqueMinimo: 2
        }
      ])
    );

    expect(boot).not.toThrow();

    const produtos = JSON.parse(window.localStorage.getItem("eletroposto_produtos"));
    expect(produtos.find((produto) => produto.id === "codigo-123").nome).toBe("123");
    expect(produtos.find((produto) => produto.tipo === "pai").nome).toBe("123");
  });

  it("migra carregadores agrupados para bicos com potência individual", () => {
    window.localStorage.setItem(
      "eletroposto_config",
      JSON.stringify({
        carregadores: [
          { potenciaKw: 60, numBicos: 2 },
          { potenciaKw: 40, numBicos: 1 }
        ]
      })
    );

    boot();

    const config = JSON.parse(window.localStorage.getItem("eletroposto_config"));
    expect(config.carregadores).toEqual([{ potenciaKw: 60 }, { potenciaKw: 60 }, { potenciaKw: 40 }]);
  });

  it("abre a finalização ao clicar em um bico ocupado", () => {
    window.localStorage.setItem(
      "eletroposto_sessoes",
      JSON.stringify([
        {
          id: "s1",
          placa: "ABC1D23",
          cliente: "Alfa",
          modelo: "Dolphin",
          bateriaInicial: 20,
          bateriaAlvo: 80,
          tempoEstimadoMin: 60,
          bico: 1,
          status: "carregando",
          inicio: new Date().toISOString(),
          criadoEm: new Date().toISOString()
        }
      ])
    );

    boot();

    document.querySelector('#status-bicos-iniciar [data-bico="1"]').click();
    expect(document.getElementById("modal-finalizar").classList.contains("show")).toBe(true);
  });

  it("mantém o foco ao digitar uma leitura parcial de kWh", () => {
    window.localStorage.setItem(
      "eletroposto_sessoes",
      JSON.stringify([
        {
          id: "s1",
          placa: "ABC1D23",
          cliente: "Alfa",
          modelo: "Dolphin",
          bateriaInicial: 20,
          bateriaAlvo: 80,
          tempoEstimadoMin: 60,
          bico: 1,
          status: "carregando",
          inicio: new Date().toISOString(),
          criadoEm: new Date().toISOString()
        }
      ])
    );

    boot();

    document.querySelector('#status-bicos-iniciar [data-bico="1"]').click();
    const campo = document.querySelector("#fin-kwh-partes [data-kwh-parte]");
    campo.focus();
    campo.value = "1";
    campo.dispatchEvent(new window.Event("input", { bubbles: true }));

    expect(document.querySelector("#fin-kwh-partes [data-kwh-parte]")).toBe(campo);
    expect(document.activeElement).toBe(campo);
  });

  it("salva uma leitura parcial e soma o restante ao finalizar", () => {
    window.localStorage.setItem(
      "eletroposto_sessoes",
      JSON.stringify([
        {
          id: "s1",
          placa: "ABC1D23",
          cliente: "Alfa",
          modelo: "Dolphin",
          bateriaInicial: 20,
          bateriaAlvo: 80,
          tempoEstimadoMin: 60,
          bico: 1,
          status: "carregando",
          inicio: new Date().toISOString(),
          criadoEm: new Date().toISOString()
        }
      ])
    );

    boot();
    document.querySelector('#status-bicos-iniciar [data-bico="1"]').click();
    const primeiraLeitura = document.querySelector("#fin-kwh-partes [data-kwh-parte]");
    primeiraLeitura.value = "4000";
    primeiraLeitura.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("btn-salvar-kwh-parcial").click();

    expect(JSON.parse(window.localStorage.getItem("eletroposto_sessoes"))[0].kwhPartes).toEqual([4]);
    expect(document.getElementById("modal-finalizar").classList.contains("show")).toBe(false);

    document.querySelector('#status-bicos-iniciar [data-bico="1"]').click();
    const leituras = document.querySelectorAll("#fin-kwh-partes [data-kwh-parte]");
    expect(leituras).toHaveLength(2);
    leituras[1].value = "1500";
    leituras[1].dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("form-finalizar").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    const [registro] = JSON.parse(window.localStorage.getItem("eletroposto_registros"));
    expect(registro.kwhUtilizado).toBe(5.5);
    expect(registro.kwhPartes).toEqual([4, 1.5]);
    expect(JSON.parse(window.localStorage.getItem("eletroposto_sessoes"))).toEqual([]);
  });

  function sessaoParaFinalizar() {
    window.localStorage.setItem(
      "eletroposto_sessoes",
      JSON.stringify([
        {
          id: "s1",
          placa: "ABC1D23",
          cliente: "Alfa",
          modelo: "Dolphin",
          bateriaInicial: 20,
          bateriaAlvo: 80,
          bico: 1,
          status: "carregando",
          inicio: new Date().toISOString()
        }
      ])
    );
  }

  function prepararFinalizarEmDinheiro(leituraKwh) {
    document.querySelector('#status-bicos-iniciar [data-bico="1"]').click();
    const leitura = document.querySelector("#fin-kwh-partes [data-kwh-parte]");
    leitura.value = leituraKwh;
    leitura.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("fin-metodo").value = "Dinheiro";
    document.getElementById("fin-metodo").dispatchEvent(new Event("change", { bubbles: true }));
  }

  const registrosSalvos = () => JSON.parse(window.localStorage.getItem("eletroposto_registros") || "[]");

  it("cobra até R$ 1,99 a mais pelo troco informado, sem confirmação", () => {
    sessaoParaFinalizar();
    boot();
    prepararFinalizarEmDinheiro("1000");
    expect(document.getElementById("fin-valor-pagar").value.replace(/ /g, " ")).toBe("R$ 1,50");
    document.getElementById("fin-cedulas-recebidas").value = "R$ 2,00";
    document.getElementById("fin-cedulas-troco").value = "R$ 0,00";
    document.getElementById("form-finalizar").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    const [registro] = registrosSalvos();
    expect(registro).toMatchObject({
      totalComConsumo: 1.5,
      valorCobrado: 1.5,
      diferencaDinheiroConfirmada: 0.5,
      arredondamentoDinheiro: 0.5
    });
  });

  it("arredonda para baixo pelo atalho e calcula o troco sozinho", () => {
    sessaoParaFinalizar();
    boot();
    prepararFinalizarEmDinheiro("1000");
    document.getElementById("fin-cedulas-recebidas").value = "R$ 1,00";
    document.getElementById("fin-cedulas-recebidas").dispatchEvent(new Event("input", { bubbles: true }));
    // Exato não cabe no que foi recebido
    document.getElementById("form-finalizar").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(registrosSalvos()).toHaveLength(0);

    document.querySelector('#arred-fin [data-arred="baixo"]').click();
    expect(document.querySelector("#arred-fin .arredondar-dica").textContent.replace(/ /g, " ")).toContain("−R$ 0,50");
    document.getElementById("form-finalizar").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    const [registro] = registrosSalvos();
    expect(registro).toMatchObject({
      valorPagoEfetivo: 1,
      descontoConcedido: 0.5,
      diferencaDinheiroConfirmada: -0.5,
      arredondamentoDinheiro: -0.5
    });
  });

  it("bloqueia diferença acima de R$ 1,99 ao receber um pagamento pendente", () => {
    window.localStorage.setItem(
      "eletroposto_registros",
      JSON.stringify([
        {
          id: "ab-pendente",
          placa: "ABC1D23",
          cliente: "Alfa",
          modelo: "Dolphin",
          bateriaAlvo: 80,
          kwhUtilizado: 5,
          valorKwh: 2,
          valorPagar: 10,
          totalComConsumo: 10,
          metodoPagamento: "Pendente",
          pendenteFin: true,
          data: new Date().toISOString()
        }
      ])
    );
    boot();

    document.querySelector("[data-registrar-pag]").click();
    document.getElementById("pag-metodo").value = "Dinheiro";
    document.getElementById("pag-metodo").dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("pag-cedulas-recebidas").value = "R$ 20,00";
    document.getElementById("pag-cedulas-troco").value = "R$ 0,00";
    document.getElementById("form-pagamento").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(registrosSalvos()[0].pendenteFin).toBe(true);

    // Troco em branco: o app devolve R$ 10,00 e fecha no valor exato
    document.getElementById("pag-cedulas-troco").value = "";
    document.getElementById("form-pagamento").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    const [registro] = registrosSalvos();
    expect(registro).toMatchObject({
      pendenteFin: false,
      metodoPagamento: "Dinheiro",
      troco: 10,
      arredondamentoDinheiro: 0
    });
    const caixa = JSON.parse(window.localStorage.getItem("eletroposto_caixa"));
    expect(caixa.cedulas).toBe(10);
  });

  it("arredonda uma venda em dinheiro para cima e registra o caixa real", () => {
    window.localStorage.setItem(
      "eletroposto_caixa",
      JSON.stringify({
        porMovimentos: true,
        historico: [{ id: "abertura", data: new Date().toISOString(), tipo: "entrada", origem: "Moedas", valor: 5 }]
      })
    );
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        { id: "pai", tipo: "pai", nome: "Café", categoria: "Bebidas", ativo: true },
        {
          id: "exp",
          tipo: "sku",
          produtoPaiId: "pai",
          nome: "Café",
          variante: "Expresso",
          categoria: "Bebidas",
          valor: 6.4,
          estoque: 10,
          estoqueMinimo: 1,
          ativo: true
        }
      ])
    );
    boot();

    document.querySelector('#grade-produtos [data-adicionar-produto="exp"]').click();
    document.getElementById("btn-cobrar").click();
    document.getElementById("venda-metodo").value = "Dinheiro";
    document.getElementById("venda-metodo").dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector('#arred-venda [data-arred="cima"]').click();
    document.getElementById("venda-cedulas-recebidas").value = "R$ 10,00";
    document.getElementById("form-venda").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    const [venda] = JSON.parse(window.localStorage.getItem("eletroposto_vendas"));
    expect(venda).toMatchObject({ valorTotal: 6.4, arredondamentoDinheiro: 0.6 });
    const caixa = JSON.parse(window.localStorage.getItem("eletroposto_caixa"));
    // R$ 5,00 em moedas + R$ 10,00 recebidos − R$ 3,00 de troco (uma nota de 2 e uma moeda de 1)
    expect(caixa).toMatchObject({ cedulas: 8, moedas: 4 });
  });

  it("troco em Pix deixa o dinheiro entregue inteiro na gaveta", () => {
    window.localStorage.setItem(
      "eletroposto_caixa",
      JSON.stringify({
        cedulas: 0,
        moedas: 0,
        porMovimentos: true,
        historico: []
      })
    );
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        {
          id: "exp",
          tipo: "sku",
          nome: "Café",
          categoria: "Bebidas",
          valor: 6.4,
          estoque: 10,
          estoqueMinimo: 1,
          ativo: true
        }
      ])
    );
    boot();

    document.querySelector('#grade-produtos [data-adicionar-produto="exp"]').click();
    document.getElementById("btn-cobrar").click();
    document.getElementById("venda-metodo").value = "Dinheiro";
    document.getElementById("venda-metodo").dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("venda-troco-pix").click();
    document.getElementById("venda-cedulas-recebidas").value = "R$ 10,00";
    document.getElementById("form-venda").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    const [venda] = JSON.parse(window.localStorage.getItem("eletroposto_vendas"));
    expect(venda.numerario).toMatchObject({ trocoPix: 3.6, cedulasTroco: 0, moedasTroco: 0, valorCobrado: 6.4 });
    const caixa = JSON.parse(window.localStorage.getItem("eletroposto_caixa"));
    expect(caixa).toMatchObject({ cedulas: 10, moedas: 0 });
    expect(caixa.historico.find((m) => m.tipo === "trocoPix")).toMatchObject({ valor: 3.6, cedulas: 0, moedas: 0 });
  });

  it("mantém o formato antigo da mensagem de WhatsApp por potência", () => {
    window.localStorage.setItem(
      "eletroposto_config",
      JSON.stringify({
        carregadores: [{ potenciaKw: 60 }, { potenciaKw: 60 }, { potenciaKw: 40 }]
      })
    );

    boot();

    const preview = document.getElementById("preview-whatsapp").textContent;
    expect(preview).toContain("🔋 60kW | 2 conectores");
    expect(preview).toContain("🔋 40kW | 1 conector");
    expect(preview).not.toContain("Bico 1 | 60 kW máximo");
  });

  it("abre uma aba diretamente pela URL", () => {
    window.location.hash = "#cash";

    boot();

    expect(document.getElementById("tab-caixa").classList.contains("active")).toBe(true);
    expect(document.querySelector('.tab-btn[data-tab="tab-caixa"]').classList.contains("active")).toBe(true);
  });
});

describe("carrinho de vendas", () => {
  function semear() {
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        {
          id: "cafe",
          tipo: "sku",
          nome: "Café",
          categoria: "Bebidas",
          valor: 6,
          estoque: 10,
          estoqueMinimo: 1,
          ativo: true
        },
        {
          id: "pao",
          tipo: "sku",
          nome: "Pão de queijo",
          categoria: "Lanches",
          valor: 7,
          estoque: 10,
          estoqueMinimo: 1,
          ativo: true
        }
      ])
    );
    window.localStorage.setItem("eletroposto_caixa", JSON.stringify({ cedulas: 100, moedas: 10, historico: [] }));
  }

  async function cobrar(metodo) {
    boot();
    window.confirm = () => true;
    document.querySelector('#grade-produtos [data-adicionar-produto="cafe"]').click();
    document.querySelector('#grade-produtos [data-adicionar-produto="pao"]').click();
    document.getElementById("btn-cobrar").click();
    const seletor = document.getElementById("venda-metodo");
    seletor.value = metodo;
    seletor.dispatchEvent(new Event("change", { bubbles: true }));
    if (metodo === "Dinheiro") {
      document.getElementById("venda-cedulas-recebidas").value = "R$ 20,00";
      document.getElementById("venda-cedulas-troco").value = "R$ 7,00";
    }
    document.getElementById("form-venda").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // O app pede o operador do turno num modal que bloqueia cliques fora dele.
    document.getElementById("modal-perfil-turno-obrigatorio").classList.remove("show");
  }

  it("grava uma venda por item, ligadas pela mesma cobrança", async () => {
    semear();
    await cobrar("Pix");

    const vendas = JSON.parse(window.localStorage.getItem("eletroposto_vendas"));
    expect(vendas).toHaveLength(2);
    expect(vendas.map((v) => v.produtoId).sort()).toEqual(["cafe", "pao"]);
    expect(vendas[0].cobrancaId).toBeTruthy();
    expect(vendas[1].cobrancaId).toBe(vendas[0].cobrancaId);
    const produtos = JSON.parse(window.localStorage.getItem("eletroposto_produtos"));
    expect(produtos.map((p) => p.estoque)).toEqual([9, 9]);
    expect(document.getElementById("modal-venda").classList.contains("show")).toBe(false);
  });

  it("em dinheiro registra um único recebimento e troco no caixa", async () => {
    semear();
    await cobrar("Dinheiro");

    const vendas = JSON.parse(window.localStorage.getItem("eletroposto_vendas"));
    expect(vendas).toHaveLength(2);
    expect(vendas.filter((v) => v.numerario)).toHaveLength(1);
    const caixa = JSON.parse(window.localStorage.getItem("eletroposto_caixa"));
    const automaticos = caixa.historico.filter((m) => m.automatico);
    expect(automaticos.map((m) => m.tipo).sort()).toEqual(["entrada", "saida"]);
    expect(automaticos.every((m) => m.referencia.tipo === "cobranca" && m.referencia.id === vendas[0].cobrancaId)).toBe(
      true
    );
    expect(caixa.cedulas).toBe(113);
  });

  it("excluir um item cobrado em dinheiro desfaz a cobrança inteira", async () => {
    semear();
    await cobrar("Dinheiro");

    document.querySelector("#lista-vendas [data-editar-venda]").click();
    document.querySelector("#modal-venda-edicao [data-remover-venda]").click();

    expect(JSON.parse(window.localStorage.getItem("eletroposto_vendas"))).toEqual([]);
    const caixa = JSON.parse(window.localStorage.getItem("eletroposto_caixa"));
    expect(caixa.historico.filter((m) => m.automatico)).toEqual([]);
    expect(caixa.cedulas).toBe(100);
    const produtos = JSON.parse(window.localStorage.getItem("eletroposto_produtos"));
    expect(produtos.map((p) => p.estoque)).toEqual([10, 10]);
  });
});

describe("operador do turno", () => {
  it("cadastra o operador do turno neste aparelho e libera a operação", async () => {
    boot();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const modal = document.getElementById("modal-perfil-turno-obrigatorio");
    expect(modal.classList.contains("show")).toBe(true);
    expect(document.getElementById("perfil-turno-obrigatorio-cadastro").hidden).toBe(false);

    document.getElementById("perfil-turno-obrigatorio-nome").value = "Alfa Operadora";
    document.getElementById("btn-cadastrar-perfil-turno").click();
    document.getElementById("btn-confirmar-perfil-turno").click();

    const perfis = JSON.parse(window.localStorage.getItem("eletroposto_perfis"));
    expect(perfis).toHaveLength(1);
    expect(perfis[0]).toMatchObject({ nome: "Alfa Operadora" });
    expect(perfis[0]).not.toHaveProperty("email");
    expect(JSON.parse(window.localStorage.getItem("eletroposto_perfil_ativo"))).toBe(perfis[0].id);
    expect(modal.classList.contains("show")).toBe(false);
    expect(document.getElementById("operador-nome").textContent).toBe("Alfa Operadora");
    // Continua no modo Operador: as abas de admin seguem ocultas.
    expect(document.querySelector('#tabs [data-tab="tab-config"]').hidden).toBe(true);
    expect(document.querySelector('#tabs [data-tab="tab-andamento"]').hidden).toBe(false);
  });
});

describe("folhas de iniciar e finalizar", () => {
  function semear(sessoes) {
    window.localStorage.setItem(
      "eletroposto_clientes",
      JSON.stringify([{ placa: "ABC1D23", nome: "Alfa", modelo: "Dolphin" }])
    );
    window.localStorage.setItem(
      "eletroposto_modelos",
      JSON.stringify([{ modelo: "Dolphin", marca: "BYD", potenciaMaxKwh: 60, mediaKwh: 30, capacidadeBateria: 40 }])
    );
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        {
          id: "cafe",
          tipo: "sku",
          nome: "Café",
          categoria: "Bebidas",
          valor: 6,
          estoque: 10,
          estoqueMinimo: 1,
          ativo: true
        }
      ])
    );
    if (sessoes) window.localStorage.setItem("eletroposto_sessoes", JSON.stringify(sessoes));
  }

  it("mostra o cartão do veículo e o tempo calculado ao iniciar", async () => {
    semear();
    boot();
    document.querySelector('#status-bicos-iniciar [data-bico="1"]').click();
    const busca = document.getElementById("select-placa");
    busca.value = "ABC";
    busca.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#select-placa-dropdown .combobox-option").click();

    const cartao = document.getElementById("ini-veiculo");
    expect(cartao.hidden).toBe(false);
    expect(cartao.textContent).toContain("ABC1D23");
    expect(cartao.textContent).toContain("Alfa");
    expect(busca.closest(".field").hidden).toBe(true);

    document.querySelector('[data-quick-for="bateria-inicial"] [data-value="20"]').click();
    document.querySelector('[data-quick-for="bateria-alvo"] [data-value="80"]').click();
    // 40 kWh × 60% = 24 kWh a 30 kW ≈ 48 min
    expect(document.getElementById("tempo-estimado").value).toBe("48");
    expect(document.getElementById("ini-tempo-card").textContent).toContain("48 min");

    document.getElementById("ini-trocar-veiculo").click();
    expect(cartao.hidden).toBe(true);
    expect(document.getElementById("select-placa-value").value).toBe("");
  });

  it("adiciona consumo pelos atalhos e mostra o total no rodapé ao finalizar", async () => {
    semear([
      {
        id: "s1",
        placa: "ABC1D23",
        cliente: "Alfa",
        modelo: "Dolphin",
        bateriaInicial: 20,
        bateriaAlvo: 80,
        tempoEstimadoMin: 60,
        bico: 1,
        status: "carregando",
        inicio: new Date().toISOString(),
        criadoEm: new Date().toISOString()
      }
    ]);
    boot();
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.getElementById("modal-perfil-turno-obrigatorio").classList.remove("show");
    document.querySelector('#status-bicos-iniciar [data-bico="1"]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.getElementById("modal-perfil-turno-obrigatorio").classList.remove("show");

    expect(document.getElementById("fin-veiculo").textContent).toContain("ABC1D23");
    document.querySelector('[data-consumo-rapido="cafe"]').click();
    document.querySelector('[data-consumo-rapido="cafe"]').click();

    expect(document.querySelector('input[name="fin-consumo"][value="Sim"]').checked).toBe(true);
    expect(document.querySelector("#sw-fin-consumo-rotulo + .switch").getAttribute("aria-checked")).toBe("true");
    expect(document.getElementById("fin-total").textContent.replace(/ /g, " ")).toBe("R$ 12,00");
    expect(document.querySelector('#form-finalizar button[type="submit"]').textContent).toBe("Receber no Pix");

    document.querySelector("#sw-fin-pag-div-rotulo + .switch").click();
    expect(document.querySelector('input[name="fin-pag-div"][value="Sim"]').checked).toBe(true);
    expect(document.getElementById("campo-fin-divisao").style.display).toBe("block");
  });
});

describe("seleção de operador já cadastrado", () => {
  it("lista os operadores existentes em vez de pedir cadastro", async () => {
    window.localStorage.setItem("eletroposto_modo", "admin");
    window.localStorage.setItem(
      "eletroposto_perfis",
      JSON.stringify([
        { id: "op1", nome: "Mira", turno: 2, foto: "" },
        { id: "op2", nome: "Delta", turno: 1, foto: "" }
      ])
    );
    boot();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const seletor = document.getElementById("select-perfil-turno-obrigatorio");
    const valores = Array.from(seletor.options)
      .map((o) => o.value)
      .filter(Boolean);
    expect(valores.sort()).toEqual(["op1", "op2"]);
    expect(seletor.closest(".field").hidden).toBe(false);
    expect(document.getElementById("perfil-turno-obrigatorio-cadastro").hidden).toBe(true);
    expect(document.getElementById("btn-abrir-cadastro-operador").hidden).toBe(false);

    seletor.value = "op1";
    document.getElementById("btn-confirmar-perfil-turno").click();
    expect(JSON.parse(window.localStorage.getItem("eletroposto_perfil_ativo"))).toBe("op1");
    expect(document.getElementById("modal-perfil-turno-obrigatorio").classList.contains("show")).toBe(false);
    expect(document.getElementById("operador-nome").textContent).toBe("Mira");
  });

  it("sem operadores cadastrados mostra só o cadastro", async () => {
    boot();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.getElementById("select-perfil-turno-obrigatorio").closest(".field").hidden).toBe(true);
    expect(document.getElementById("perfil-turno-obrigatorio-cadastro").hidden).toBe(false);
    expect(document.getElementById("btn-abrir-cadastro-operador").hidden).toBe(true);
  });
});

describe("assistente de primeira abertura", () => {
  beforeEach(() => {
    window.localStorage.removeItem("eletroposto_config");
  });

  it("abre num aparelho novo, sem marca de outro posto", async () => {
    boot();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.getElementById("modal-assistente").classList.contains("show")).toBe(true);
    expect(document.getElementById("assistente-passo").textContent).toBe("Passo 1 de 4: Nome do posto");
    // O pedido de operador espera o assistente terminar.
    expect(document.getElementById("modal-perfil-turno-obrigatorio").classList.contains("show")).toBe(false);
    expect(document.querySelector("[data-brand-name]").textContent).toBe("Eletroposto");
    expect(document.title).toBe("Eletroposto · Operação");
  });

  it("configura nome, bicos, tarifa, turnos e operadores e entra no modo Admin", () => {
    boot();
    document.getElementById("ass-nome").value = "Posto Serra Azul";
    document.getElementById("ass-continuar").click();

    const qtd = document.getElementById("ass-qtd-bicos");
    qtd.value = "2";
    qtd.dispatchEvent(new Event("input", { bubbles: true }));
    const bico2 = document.getElementById("ass-bico-1");
    bico2.value = "120";
    bico2.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("ass-continuar").click();

    document.getElementById("ass-tarifa").value = "R$ 1,95";
    document.getElementById("ass-continuar").click();
    expect(document.getElementById("assistente-passo").textContent).toBe("Passo 4 de 4: Turnos e operadores");
    expect(document.getElementById("ass-continuar").textContent).toBe("Concluir");

    document.getElementById("ass-operador").value = "Brava";
    document.getElementById("ass-operador-turno").value = "1";
    document.getElementById("ass-add-operador").click();
    expect(document.getElementById("ass-operadores").textContent).toContain("Brava");
    document.getElementById("ass-continuar").click();

    expect(document.getElementById("modal-assistente").classList.contains("show")).toBe(false);
    const config = JSON.parse(window.localStorage.getItem("eletroposto_config"));
    expect(config.nomeSistema).toBe("Posto Serra Azul");
    expect(config.carregadores).toEqual([{ potenciaKw: 40 }, { potenciaKw: 120 }]);
    expect(config.tarifaKwh).toBe(1.95);
    expect(config.turnos).toHaveLength(2);
    const perfis = JSON.parse(window.localStorage.getItem("eletroposto_perfis"));
    expect(perfis).toHaveLength(1);
    expect(perfis[0]).toMatchObject({ nome: "Brava", turno: 2 });
    expect(window.localStorage.getItem("eletroposto_modo")).toBe("admin");
    expect(document.getElementById("tab-dashboard").classList.contains("active")).toBe(true);
    expect(document.querySelector("[data-brand-name]").textContent).toBe("Posto Serra Azul");
  });

  it("deixa pular todas as etapas e mantém os padrões", () => {
    boot();
    for (let i = 0; i < 4; i++) document.getElementById("ass-pular").click();
    expect(document.getElementById("modal-assistente").classList.contains("show")).toBe(false);
    const config = JSON.parse(window.localStorage.getItem("eletroposto_config"));
    expect(config.nomeSistema).toBe("Eletroposto");
    expect(config.carregadores).toHaveLength(3);
    expect(config.textoAtendimento).toBe("");
    expect(config.localizacao).toBe("");
    expect(config.linkMapa).toBe("");
  });

  it("não deixa avançar com tarifa vazia nem com turnos sobrepostos", () => {
    boot();
    document.getElementById("ass-continuar").click();
    document.getElementById("ass-continuar").click();
    document.getElementById("ass-tarifa").value = "";
    document.getElementById("ass-continuar").click();
    expect(document.getElementById("assistente-passo").textContent).toBe("Passo 3 de 4: Tarifa");
    expect(document.getElementById("alert-box").textContent).toContain("Informe a tarifa por kWh.");

    document.getElementById("ass-tarifa").value = "R$ 2,00";
    document.getElementById("ass-continuar").click();
    const fim = document.getElementById("ass-turno-fim-0");
    fim.value = "20:00";
    fim.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("ass-continuar").click();
    expect(document.getElementById("modal-assistente").classList.contains("show")).toBe(true);
    expect(document.getElementById("ass-turnos-erro").hidden).toBe(false);
  });
});

describe("backup e recomeço", () => {
  function lerArquivo(texto) {
    const entrada = document.getElementById("arquivo-backup");
    Object.defineProperty(entrada, "files", {
      value: [new File([texto], "backup.json", { type: "application/json" })],
      configurable: true
    });
    entrada.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Espera o FileReader responder: ou abre a confirmação, ou mostra o erro.
  async function esperarLeitura() {
    for (let i = 0; i < 100; i++) {
      if (document.getElementById("modal-apagar").classList.contains("show")) return;
      if (document.getElementById("alert-box").textContent.includes("backup")) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  function textoDoBlob(blob) {
    return new Promise((resolve) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(leitor.result);
      leitor.readAsText(blob);
    });
  }

  function capturarDownloads() {
    const baixados = [];
    window.URL.createObjectURL = (blob) => {
      baixados.push(blob);
      return "blob:teste-" + baixados.length;
    };
    window.URL.revokeObjectURL = () => {};
    return baixados;
  }

  it("exporta um backup com todos os dados do aparelho", async () => {
    window.localStorage.setItem("eletroposto_modo", "admin");
    window.localStorage.setItem(
      "eletroposto_clientes",
      JSON.stringify([{ placa: "ABC1D23", nome: "Alfa", modelo: "Dolphin" }])
    );
    const baixados = capturarDownloads();
    boot();
    document.getElementById("btn-exportar-backup").click();

    expect(baixados).toHaveLength(1);
    const backup = JSON.parse(await textoDoBlob(baixados[0]));
    expect(backup.formato).toBe("eletroposto-backup");
    expect(backup.posto).toBe("Eletroposto");
    expect(JSON.parse(backup.dados.eletroposto_clientes)[0].nome).toBe("Alfa");
    expect(window.localStorage.getItem("eletroposto_ultimo_backup")).toBeTruthy();
    expect(document.getElementById("cfg-resumo-backup").textContent).toContain("Último backup em");
  });

  it("restaura um backup depois de baixar uma cópia do que está no aparelho", async () => {
    window.localStorage.setItem("eletroposto_modo", "admin");
    window.localStorage.setItem(
      "eletroposto_clientes",
      JSON.stringify([{ placa: "OLD0A00", nome: "Antigo", modelo: "" }])
    );
    const baixados = capturarDownloads();
    boot();
    const backup = {
      formato: "eletroposto-backup",
      versao: 1,
      criadoEm: new Date().toISOString(),
      posto: "Posto Serra Azul",
      dados: {
        eletroposto_config: JSON.stringify({ nomeSistema: "Posto Serra Azul" }),
        eletroposto_clientes: JSON.stringify([{ placa: "NEW1B11", nome: "Nova", modelo: "" }])
      }
    };
    lerArquivo(JSON.stringify(backup));
    await esperarLeitura();
    expect(document.getElementById("modal-apagar").classList.contains("show")).toBe(true);
    const confirmacao = document.getElementById("apagar-confirmacao");
    confirmacao.value = "apagar";
    confirmacao.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("btn-confirmar-apagar").click();

    // Primeiro baixa a cópia de segurança com os dados antigos
    expect(baixados).toHaveLength(1);
    expect(await textoDoBlob(baixados[0])).toContain("Antigo");
    expect(JSON.parse(window.localStorage.getItem("eletroposto_clientes"))[0].nome).toBe("Nova");
    expect(JSON.parse(window.localStorage.getItem("eletroposto_config")).nomeSistema).toBe("Posto Serra Azul");
    // O modo não estava no backup: o aparelho volta ao padrão ao recarregar
    expect(window.localStorage.getItem("eletroposto_modo")).toBeNull();
  });

  it("recusa um arquivo que não é backup do Eletroposto", async () => {
    window.localStorage.setItem("eletroposto_modo", "admin");
    window.localStorage.setItem(
      "eletroposto_clientes",
      JSON.stringify([{ placa: "OLD0A00", nome: "Antigo", modelo: "" }])
    );
    boot();
    lerArquivo(JSON.stringify({ formato: "outro", dados: { outro_clientes: "[]" } }));
    await esperarLeitura();
    expect(document.getElementById("alert-box").textContent).toContain("não é um backup do Eletroposto");
    expect(document.getElementById("modal-apagar").classList.contains("show")).toBe(false);
    expect(JSON.parse(window.localStorage.getItem("eletroposto_clientes"))[0].nome).toBe("Antigo");
  });

  it("apaga tudo e reabre o assistente de posto novo", () => {
    window.localStorage.setItem("eletroposto_modo", "admin");
    window.localStorage.setItem(
      "eletroposto_clientes",
      JSON.stringify([{ placa: "OLD0A00", nome: "Antigo", modelo: "" }])
    );
    window.localStorage.setItem("outro_app", "fica");
    boot();
    document.getElementById("btn-recomecar").click();
    const confirmacao = document.getElementById("apagar-confirmacao");
    confirmacao.value = "apagar";
    confirmacao.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("btn-confirmar-apagar").click();

    expect(Object.keys(window.localStorage).filter((k) => k.startsWith("eletroposto_"))).toEqual([]);
    expect(window.localStorage.getItem("outro_app")).toBe("fica");
    boot();
    expect(document.getElementById("modal-assistente").classList.contains("show")).toBe(true);
  });

  it("lembra do backup no modo Admin quando há dados e nenhum backup recente", () => {
    window.localStorage.setItem("eletroposto_modo", "admin");
    window.localStorage.setItem(
      "eletroposto_clientes",
      JSON.stringify([{ placa: "ABC1D23", nome: "Alfa", modelo: "" }])
    );
    window.localStorage.setItem("eletroposto_ultimo_backup", new Date(Date.now() - 9 * 86400000).toISOString());
    boot();
    const aviso = document.getElementById("aviso-backup");
    expect(aviso.hidden).toBe(false);
    expect(aviso.textContent).toContain("O último backup foi há 9 dias.");
    document.getElementById("btn-dispensar-aviso-backup").click();
    expect(aviso.hidden).toBe(true);

    window.localStorage.setItem("eletroposto_ultimo_backup", new Date().toISOString());
    boot();
    expect(document.getElementById("aviso-backup").hidden).toBe(true);
  });
});

describe("máscara R$ nos campos de valor", () => {
  it("formata tarifa, parada, combo e preço de variação ao digitar", () => {
    window.localStorage.setItem("eletroposto_modo", "admin");
    boot();
    ["ass-tarifa", "cfg-tarifa", "fin-valor-kwh", "edit-valor-kwh", "valor-parada", "combo-valor"].forEach((id) => {
      const campo = document.getElementById(id);
      expect(campo.type).toBe("text");
      campo.value = "185";
      campo.dispatchEvent(new Event("input", { bubbles: true }));
      expect(campo.value).toBe("R$ 1,85");
    });
    document.getElementById("seg-cad-produtos").click();
    document.getElementById("btn-novo-cadastro").click();
    const variacao = document.getElementById("var-valor-0");
    expect(variacao.classList.contains("currency-input")).toBe(true);
    variacao.value = "1250";
    variacao.dispatchEvent(new Event("input", { bubbles: true }));
    expect(variacao.value).toBe("R$ 12,50");
  });

  it("mostra a tarifa salva com máscara", () => {
    window.localStorage.setItem("eletroposto_config", JSON.stringify({ tarifaKwh: 1.5 }));
    boot();
    expect(document.getElementById("cfg-tarifa").value).toBe("R$ 1,50");
    expect(document.getElementById("fin-valor-kwh").value).toBe("R$ 1,50");
  });
});

describe("fechamento de caixa ao fechar o turno", () => {
  const DIA = "2026-10-30";
  // O fechamento conta pelo horário do movimento: `quando` é a hora local.
  const as = (dia, hora, minuto = 0) => new Date(2026, 9, dia, hora, minuto).toISOString();
  function mov(extra, quando = as(30, 9)) {
    return {
      id: "m" + Math.random().toString(36).slice(2),
      data: quando,
      turno: 1,
      dataOperacional: DIA,
      ...extra
    };
  }
  function semear(historicoExtra = []) {
    const historico = [
      mov(
        { tipo: "entrada", origem: "Cédulas", descricao: "Saldo inicial", valor: 100, saldoInicial: true },
        as(29, 10)
      ),
      mov({ tipo: "entrada", origem: "Moedas", descricao: "Saldo inicial", valor: 10, saldoInicial: true }, as(29, 10)),
      mov({ tipo: "entrada", origem: "Venda Café", automatico: true, cedulas: 50, moedas: 3, valor: 53 }),
      mov({ tipo: "saida", origem: "Venda Café", automatico: true, cedulas: 0, moedas: 1, valor: 1 }),
      mov(
        {
          tipo: "entrada",
          origem: "Abastecimento X",
          automatico: true,
          turno: 2,
          cedulas: 20,
          moedas: 0,
          valor: 20
        },
        as(30, 19)
      ),
      mov(
        {
          tipo: "entrada",
          origem: "Abastecimento Y",
          automatico: true,
          dataOperacional: "2026-10-29",
          cedulas: 30,
          moedas: 0,
          valor: 30
        },
        as(29, 12)
      )
    ].concat(historicoExtra);
    window.localStorage.setItem(
      "eletroposto_caixa",
      JSON.stringify({ cedulas: 0, moedas: 0, porMovimentos: true, historico })
    );
  }
  function abrirFechamento(turno = "1") {
    const urls = [];
    window.open = (destino) => {
      urls.push(destino);
      return null;
    };
    document.getElementById("btn-fechar-turno").click();
    document.getElementById("fechamento-turno").value = turno;
    document.getElementById("fechamento-data-de").value = DIA;
    document.getElementById("fechamento-data-ate").value = DIA;
    document
      .getElementById("form-fechar-turno")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    return urls;
  }
  const caixaSalvo = () => JSON.parse(window.localStorage.getItem("eletroposto_caixa"));

  it("preenche a saída com o dinheiro líquido do turno, sem enviar ainda", () => {
    semear();
    boot();
    const urls = abrirFechamento();

    expect(urls).toHaveLength(0);
    expect(document.getElementById("modal-fechar-turno").classList.contains("show")).toBe(false);
    expect(document.getElementById("modal-caixa-retirada").classList.contains("show")).toBe(true);
    expect(document.getElementById("caixa-retirada-titulo").textContent).toBe("Fechamento do caixa");
    expect(document.getElementById("caixa-retirada-cedulas").value).toBe("R$ 50,00");
    expect(document.getElementById("caixa-retirada-moedas").value).toBe("R$ 2,00");
    expect(document.getElementById("caixa-retirada-motivo").value).toBe("Fechamento de Turno 01 - 30/10/2026");
    expect(document.getElementById("caixa-retirada-aviso").hidden).toBe(true);
  });

  it("operador registra a saída e o relatório sai com o caixa descontado", () => {
    semear();
    boot();
    const urls = abrirFechamento();
    document
      .getElementById("form-caixa-retirada")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    const caixa = caixaSalvo();
    const saida = caixa.historico.find((m) => m.tipo === "retirada");
    expect(saida).toMatchObject({
      cedulas: 50,
      moedas: 2,
      valor: 52,
      descricao: "Fechamento de Turno 01 - 30/10/2026"
    });
    expect(saida.fechamentoTurno).toEqual({ turno: 1, dataDe: DIA, dataAte: DIA });
    expect(caixa.cedulas).toBe(150);
    expect(caixa.moedas).toBe(10);
    expect(urls).toHaveLength(1);
    const mensagem = decodeURIComponent(urls[0].replace("https://wa.me/?text=", "")).replace(/ /g, " ");
    expect(mensagem).toContain("Total em caixa: R$ 160,00");
    expect(document.getElementById("modal-caixa-retirada").classList.contains("show")).toBe(false);
    expect(document.getElementById("caixa-retirada-titulo").textContent).toBe("Registrar retirada");
  });

  it("enviar sem registrar saída não mexe no caixa", () => {
    semear();
    boot();
    const urls = abrirFechamento();
    document.getElementById("btn-enviar-sem-saida").click();

    expect(caixaSalvo().historico.some((m) => m.tipo === "retirada")).toBe(false);
    expect(urls).toHaveLength(1);
  });

  it("fechar a folha cancela o fechamento sem enviar", () => {
    semear();
    boot();
    const urls = abrirFechamento();
    document.querySelector("#modal-caixa-retirada [data-fechar-modal]").click();

    expect(urls).toHaveLength(0);
    expect(document.getElementById("btn-enviar-sem-saida").hidden).toBe(true);
  });

  it("num segundo fechamento do mesmo turno avisa e traz só o restante", () => {
    semear([
      mov(
        {
          tipo: "retirada",
          origem: "Retirada",
          descricao: "Fechamento de Turno 01 - 30/10/2026",
          cedulas: 50,
          moedas: 0,
          valor: 50,
          fechamentoTurno: { turno: 1, dataDe: DIA, dataAte: DIA }
        },
        as(30, 16)
      )
    ]);
    boot();
    abrirFechamento();

    expect(document.getElementById("caixa-retirada-cedulas").value).toBe("");
    expect(document.getElementById("caixa-retirada-moedas").value).toBe("R$ 2,00");
    const aviso = document.getElementById("caixa-retirada-aviso");
    expect(aviso.hidden).toBe(false);
    expect(aviso.textContent.replace(/ /g, " ")).toContain("Já houve fechamento de R$ 50,00 neste turno.");
  });
  it("fecha só o que entrou e saiu no horário do turno, e o caixa volta ao valor de abertura", () => {
    const entrada = (cedulas, moedas, quando, extra) =>
      mov(
        {
          tipo: "entrada",
          origem: "Abastecimento",
          automatico: true,
          cedulas,
          moedas,
          valor: cedulas + moedas,
          ...extra
        },
        quando
      );
    const historico = [
      // Caixa com que o turno 2 começa: 100 em cédulas e 9,75 em moedas.
      mov(
        { tipo: "entrada", origem: "Cédulas", descricao: "Saldo inicial", valor: 100, saldoInicial: true },
        as(29, 10)
      ),
      mov(
        { tipo: "entrada", origem: "Moedas", descricao: "Saldo inicial", valor: 9.75, saldoInicial: true },
        as(29, 10)
      ),
      // Recebido às 02:20 da madrugada (turno 2 do dia anterior), mas com a etiqueta do turno 2 de hoje,
      // e já retirado no fechamento daquele turno.
      entrada(22, 0, as(30, 2, 20), { turno: 2 }),
      mov(
        {
          tipo: "retirada",
          origem: "Retirada",
          cedulas: 22,
          moedas: 0,
          valor: 22,
          fechamentoTurno: { turno: 2, dataDe: "2026-10-29", dataAte: "2026-10-29" }
        },
        as(30, 2, 30)
      ),
      // Turno 1 de hoje, fechado às 17:10, já dentro do horário do turno 2.
      entrada(5, 0, as(30, 10)),
      mov(
        {
          tipo: "retirada",
          origem: "Retirada",
          cedulas: 5,
          moedas: 0,
          valor: 5,
          fechamentoTurno: { turno: 1, dataDe: DIA, dataAte: DIA }
        },
        as(30, 17, 10)
      ),
      // Turno 2 de hoje.
      entrada(19, 0, as(30, 18, 22), { turno: 2 }),
      entrada(32, 0, as(30, 21, 56), { turno: 2 }),
      entrada(50, 0, as(30, 23, 40), { turno: 2 }),
      mov(
        {
          tipo: "saida",
          origem: "Abastecimento",
          descricao: "Troco ao cliente",
          automatico: true,
          turno: 2,
          cedulas: 17,
          moedas: 1.5,
          valor: 18.5
        },
        as(30, 23, 40)
      ),
      entrada(30, 3.6, as(31, 0, 46), { turno: 2, dataOperacional: DIA })
    ];
    window.localStorage.setItem(
      "eletroposto_caixa",
      JSON.stringify({ cedulas: 0, moedas: 0, porMovimentos: true, historico })
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 31, 1, 0));
    try {
      boot();
      abrirFechamento("2");
      // Caixa agora: 214 em cédulas e 11,85 em moedas; abertura: 100 e 9,75.
      expect(document.getElementById("caixa-retirada-cedulas").value).toBe("R$ 114,00");
      expect(document.getElementById("caixa-retirada-moedas").value).toBe("R$ 2,10");
    } finally {
      vi.useRealTimers();
    }
  });
  // Caixa do turno: o card do topo da aba Caixa usa o mesmo cálculo do fechamento.
  function bootAs(dia, hora) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, dia, hora, 0));
    boot();
    document.querySelector('.tab-btn[data-tab="tab-caixa"]').click();
  }
  const texto = (id) => document.getElementById(id).textContent.replace(/\s/g, " ");

  it("mostra no Caixa do turno o dinheiro líquido do turno ativo, o fundo e o recebido", () => {
    semear();
    try {
      bootAs(30, 12);
      expect(texto("caixa-turno-quando")).toBe("Turno 1, 30/10/2026");
      expect(texto("caixa-turno-valor")).toBe("R$ 52,00");
      expect(texto("caixa-turno-cedulas")).toBe("R$ 50,00");
      expect(texto("caixa-turno-moedas")).toBe("R$ 2,00");
      expect(texto("caixa-turno-recebido")).toBe("R$ 53,00");
      expect(texto("caixa-turno-troco")).toBe("R$ 1,00");
      expect(texto("caixa-turno-fundo")).toBe("R$ 160,00");
      expect(document.getElementById("caixa-turno-vazio").hidden).toBe(true);
      expect(document.getElementById("caixa-turno-outros-linha").hidden).toBe(true);
      expect(document.getElementById("caixa-turno-fechado").hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("depois de um fechamento parcial mostra só o restante e avisa", () => {
    semear([
      mov(
        {
          tipo: "retirada",
          origem: "Fechamento",
          descricao: "Fechamento de Turno 01",
          cedulas: 50,
          moedas: 0,
          valor: 50,
          fechamentoTurno: { turno: 1, dataDe: DIA, dataAte: DIA }
        },
        as(30, 11)
      )
    ]);
    try {
      bootAs(30, 12);
      expect(texto("caixa-turno-valor")).toBe("R$ 2,00");
      expect(document.getElementById("caixa-turno-fechado").hidden).toBe(false);
      expect(texto("caixa-turno-fechado")).toContain("R$ 50,00");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sem dinheiro no turno mostra R$ 0,00 e o aviso, e o atalho filtra os lançamentos do turno", () => {
    semear();
    try {
      bootAs(31, 12);
      expect(texto("caixa-turno-valor")).toBe("R$ 0,00");
      expect(document.getElementById("caixa-turno-vazio").hidden).toBe(false);
      document.getElementById("btn-ver-lancamentos-turno").click();
      expect(document.getElementById("filtro-caixa-de").value).toBe("2026-10-31");
      expect(document.getElementById("filtro-caixa-ate").value).toBe("2026-10-31");
      expect(document.getElementById("filtro-caixa-turno").value).toBe("1");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("mensagem de estoque no WhatsApp", () => {
  it("separa faltando, acabando, em dia e sem contagem, com sugestão de compra", () => {
    window.localStorage.setItem("eletroposto_modo", "admin");
    const sku = (id, nome, estoque, estoqueMinimo, extra) =>
      Object.assign(
        {
          id: id,
          tipo: "sku",
          produtoPaiId: "pai-" + id,
          nome: nome,
          variante: "Padrão",
          categoria: "Bebidas",
          valor: 5,
          estoque: estoque,
          estoqueMinimo: estoqueMinimo,
          ativo: true
        },
        extra
      );
    const pai = (id, nome) => ({ id: "pai-" + id, tipo: "pai", nome: nome, categoria: "Bebidas", ativo: true });
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        pai("agua", "Água"),
        sku("agua", "Água", 0, 4),
        pai("coca", "Coca-Cola"),
        sku("coca", "Coca-Cola", 3, 4, { estoqueIdeal: 10 }),
        pai("suco", "Suco"),
        sku("suco", "Suco", 5, 4),
        pai("cafe", "Café"),
        sku("cafe", "Café", 20, 4),
        pai("bala", "Bala"),
        sku("bala", "Bala", null, 4),
        pai("velho", "Produto parado"),
        sku("velho", "Produto parado", 0, 4, { ativo: false })
      ])
    );
    boot();
    const urls = [];
    window.open = (destino) => {
      urls.push(destino);
      return null;
    };
    document.getElementById("btn-compartilhar-estoque").click();

    expect(urls).toHaveLength(1);
    const mensagem = decodeURIComponent(urls[0].replace("https://wa.me/?text=", ""));
    expect(mensagem).toContain("🔴 2 faltando   🟡 1 acabando   🟢 1 em dia   ⚪ 1 sem contagem");
    const faltando = mensagem.split("🔴 *Faltando, repor já*")[1].split("\n\n")[0];
    expect(faltando.trim().split("\n")).toEqual([
      "• Água: *zerado* (mín. 4), comprar 8",
      "• Coca-Cola: *3 un* (mín. 4), comprar 7"
    ]);
    expect(mensagem).toContain("🟡 *Acabando*\n• Suco: 5 un (mín. 4)");
    expect(mensagem).toContain("🟢 *Em dia*\n• Café: 20 un");
    expect(mensagem).toContain("⚪ *Sem contagem*\n• Bala");
    expect(mensagem).toContain("🛒 *Sugestão de compra: 15 un* em 2 itens");
    expect(mensagem).not.toContain("Produto parado");
  });
});

describe("modal do WhatsApp, uso por bico e variação única", () => {
  const admin = () => window.localStorage.setItem("eletroposto_modo", "admin");

  it("fecha o modal depois de abrir o WhatsApp em cada mensagem", () => {
    admin();
    boot();
    const urls = [];
    window.open = (destino) => {
      urls.push(destino);
      return null;
    };
    ["btn-whatsapp", "btn-whatsapp-abertura", "btn-whatsapp-fechamento"].forEach((id) => {
      document.getElementById("btn-abrir-whatsapp").click();
      expect(document.getElementById("modal-whatsapp").classList.contains("show")).toBe(true);
      document.getElementById(id).click();
      expect(document.getElementById("modal-whatsapp").classList.contains("show")).toBe(false);
    });
    expect(urls).toHaveLength(3);
    urls.forEach((url) => expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/));
  });

  it("mostra tempo ativo e ocioso de cada bico, com o contador do estado atual", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 28, 14, 20));
    try {
      window.localStorage.setItem(
        "eletroposto_config",
        JSON.stringify({ tarifaKwh: 2, carregadores: [{ potenciaKw: 60 }, { potenciaKw: 60 }] })
      );
      window.localStorage.setItem(
        "eletroposto_registros",
        JSON.stringify([
          {
            id: "r1",
            placa: "ABC-1234",
            bico: 1,
            inicio: new Date(2026, 9, 28, 9, 0).getTime(),
            data: new Date(2026, 9, 28, 9, 30).toISOString(),
            dataOperacional: "2026-10-28",
            turno: 1,
            duracaoSegundos: 1800,
            kwhUtilizado: 20,
            valorPagar: 40,
            metodoPagamento: "Pix"
          }
        ])
      );
      window.localStorage.setItem(
        "eletroposto_sessoes",
        JSON.stringify([
          {
            id: "s2",
            placa: "BIC-0002",
            cliente: "Cliente",
            modelo: "Modelo",
            bico: 2,
            status: "carregando",
            inicio: new Date(2026, 9, 28, 14, 10).toISOString()
          }
        ])
      );
      admin();
      boot();
      const bico = (n) => document.querySelector('#dash-operacao .rank-bico[data-bico="' + n + '"]');
      const tempo = (n, qual) => bico(n).querySelector('[data-tempo="' + qual + '"]');
      // Aberto das 07:00 às 14:20: 7h20 no turno 1.
      expect(tempo(1, "ativo").textContent).toBe("Ativo 00:30:00");
      expect(tempo(1, "ocioso").textContent).toBe("Ocioso 06:50:00");
      expect(tempo(1, "ocioso").querySelector("[data-cronometro]")).not.toBeNull();
      expect(tempo(1, "ativo").querySelector("[data-cronometro]")).toBeNull();
      expect(bico(1).textContent).toContain("Livre");
      expect(tempo(2, "ativo").textContent).toBe("Ativo 00:10:00");
      expect(tempo(2, "ocioso").textContent).toBe("Ocioso 07:10:00");
      expect(tempo(2, "ativo").querySelector("[data-cronometro]")).not.toBeNull();
      expect(tempo(2, "ocioso").querySelector("[data-cronometro]")).toBeNull();
      expect(bico(2).textContent).toContain("Carregando");
    } finally {
      vi.useRealTimers();
    }
  });

  it("mostra o nome da variação quando o produto tem só uma", () => {
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        { id: "pai-coca", tipo: "pai", nome: "Coca-Cola", categoria: "Bebidas", ativo: true },
        {
          id: "sku-coca",
          tipo: "sku",
          produtoPaiId: "pai-coca",
          nome: "Coca-Cola",
          variante: "Lata 350 ml",
          categoria: "Bebidas",
          valor: 5,
          estoque: 10,
          estoqueMinimo: 4,
          ativo: true
        }
      ])
    );
    admin();
    boot();
    document.querySelector('#estoque-chips-cad [data-filtro-estoque="todos"]').click();
    const linha = document.querySelector('#lista-produtos [data-sku="sku-coca"]');
    expect(linha.querySelector(".info strong").textContent).toContain("Lata 350 ml");
    expect(linha.querySelector(".info .muted").textContent.replace(/\s/g, " ")).toBe("10 un, mínimo 4, R$ 5,00");
  });
});

describe("itens de uso interno (preço R$ 0,00)", () => {
  function semearUsoInterno() {
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        { id: "pai-uso", tipo: "pai", nome: "Uso Interno", categoria: "Posto", ativo: true },
        {
          id: "sku-papel",
          tipo: "sku",
          produtoPaiId: "pai-uso",
          nome: "Uso Interno",
          variante: "Papel toalha",
          categoria: "Posto",
          valor: 0,
          estoque: 10,
          estoqueMinimo: 2,
          ativo: true
        },
        { id: "pai-agua", tipo: "pai", nome: "Água", categoria: "Bebidas", ativo: true },
        {
          id: "sku-agua",
          tipo: "sku",
          produtoPaiId: "pai-agua",
          nome: "Água",
          variante: "Padrão",
          categoria: "Bebidas",
          valor: 5,
          estoque: 10,
          estoqueMinimo: 2,
          ativo: true
        }
      ])
    );
    window.localStorage.setItem("eletroposto_vendas", "[]");
  }
  function comoOperador() {
    window.localStorage.removeItem("eletroposto_acesso_atual");
    window.localStorage.setItem("eletroposto_perfis", JSON.stringify([{ id: "p1", nome: "Mira", turno: 1 }]));
    window.localStorage.setItem("eletroposto_perfil_ativo", JSON.stringify("p1"));
  }

  it("cadastra variação com preço R$ 0,00", () => {
    window.localStorage.setItem("eletroposto_modo", "admin");
    window.localStorage.setItem("eletroposto_produtos", "[]");
    boot();
    document.getElementById("seg-cad-produtos").click();
    document.getElementById("btn-novo-cadastro").click();
    document.getElementById("prod-nome").value = "Uso Interno";
    document.getElementById("prod-categoria").value = "Posto";
    document.getElementById("var-valor-0").value = "R$ 0,00";
    document.getElementById("var-estoque-0").value = "5";
    document.getElementById("var-min-0").value = "1";
    document
      .getElementById("form-produto")
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    const produtos = JSON.parse(window.localStorage.getItem("eletroposto_produtos"));
    expect(produtos.find((p) => p.tipo === "sku")).toMatchObject({ valor: 0, estoque: 5 });
  });

  it("fica fora da venda e só aparece na busca, para registrar baixa", () => {
    semearUsoInterno();
    comoOperador();
    boot();
    const grade = document.getElementById("grade-produtos");
    expect(grade.textContent).toContain("Água");
    expect(grade.textContent).not.toContain("Papel toalha");

    const busca = document.getElementById("busca-produtos-venda");
    busca.value = "uso interno";
    busca.dispatchEvent(new window.Event("input", { bubbles: true }));
    const cartao = grade.querySelector('[data-baixa-produto="sku-papel"]');
    expect(cartao).not.toBeNull();
    expect(grade.querySelector('[data-adicionar-produto="sku-papel"]')).toBeNull();

    // O combobox de venda não oferece o item
    const campo = document.getElementById("select-produto");
    campo.value = "papel";
    campo.dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(document.getElementById("select-produto-dropdown").textContent).not.toContain("Papel toalha");

    cartao.click();
    expect(document.getElementById("modal-repor").classList.contains("show")).toBe(true);
    expect(document.getElementById("repor-titulo").textContent).toBe("Registrar baixa");
    expect(document.getElementById("repor-modos").hidden).toBe(false);
    expect(document.querySelector('#repor-modos [data-modo="contagem"]').hidden).toBe(true);
    document.getElementById("repor-qtd").value = "2";
    document.getElementById("repor-qtd").dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(document.getElementById("btn-repor-salvar").textContent).toBe("Dar baixa de 2 un");
    document
      .getElementById("form-repor")
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

    const produtos = JSON.parse(window.localStorage.getItem("eletroposto_produtos"));
    expect(produtos.find((p) => p.id === "sku-papel").estoque).toBe(8);
    const movimentos = JSON.parse(window.localStorage.getItem("eletroposto_movimentos_estoque") || "[]");
    expect(movimentos.at(-1)).toMatchObject({ produtoId: "sku-papel", tipo: "uso_interno", quantidade: -2 });
    expect(JSON.parse(window.localStorage.getItem("eletroposto_vendas"))).toEqual([]);
  });

  it("aparece na mensagem de estoque sem repetir o rótulo de uso interno", () => {
    semearUsoInterno();
    window.localStorage.setItem("eletroposto_modo", "admin");
    boot();
    const urls = [];
    window.open = (destino) => {
      urls.push(destino);
      return null;
    };
    document.getElementById("btn-compartilhar-estoque").click();
    const mensagem = decodeURIComponent(urls[0].replace("https://wa.me/?text=", ""));
    expect(mensagem).toContain("• Uso Interno: 10 un");
    expect(mensagem).not.toContain("Uso Interno (uso interno)");
    expect(mensagem).toContain("• Água: 10 un");
  });
});

describe("armazenamento do aparelho", () => {
  const FOTO = "data:image/jpeg;base64," + "A".repeat(200);

  it("tira dos registros as cópias da foto do operador", () => {
    window.localStorage.setItem(
      "eletroposto_registros",
      JSON.stringify([
        {
          id: "a1",
          data: "2026-10-30T12:00:00.000Z",
          placa: "ABC1D23",
          perfil: { id: "pf1", nome: "Alfa", foto: FOTO },
          operador: { id: "pf1", nome: "Alfa", foto: FOTO }
        }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_caixa",
      JSON.stringify({
        cedulas: 0,
        moedas: 0,
        porMovimentos: true,
        historico: [
          {
            id: "m1",
            tipo: "retirada",
            data: "2026-10-30T12:00:00.000Z",
            valor: 1,
            operador: { id: "pf1", nome: "Alfa", foto: FOTO }
          }
        ]
      })
    );
    boot();
    const recargas = window.localStorage.getItem("eletroposto_registros");
    expect(recargas).not.toContain("data:image/");
    expect(JSON.parse(recargas)[0].operador).toMatchObject({ id: "pf1", nome: "Alfa" });
    expect(window.localStorage.getItem("eletroposto_caixa")).not.toContain("data:image/");
  });

  it("sem espaço, avisa uma vez em vez de a cada registro", async () => {
    const original = Storage.prototype.setItem;
    const espiao = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (chave, valor) {
      if (chave === "eletroposto_registros") {
        const erro = new Error("cheio");
        erro.name = "QuotaExceededError";
        throw erro;
      }
      return original.call(this, chave, valor);
    });
    try {
      window.localStorage.removeItem("eletroposto_registros");
      original.call(
        window.localStorage,
        "eletroposto_registros",
        JSON.stringify([
          { id: "a1", data: "2026-10-30T12:00:00.000Z", operador: { id: "pf1", nome: "Alfa", foto: FOTO } }
        ])
      );
      const alertas = [];
      boot();
      const caixaAlerta = document.getElementById("alert-box");
      new window.MutationObserver(() => alertas.push(caixaAlerta.textContent)).observe(caixaAlerta, {
        childList: true
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(caixaAlerta.textContent).toContain("sem espaço");
      expect(alertas.filter((t) => t.includes("sem espaço"))).toHaveLength(1);
    } finally {
      espiao.mockRestore();
    }
  });
});

describe("combo, campos de dinheiro e edição de recarga em dinheiro", () => {
  const admin = () => window.localStorage.setItem("eletroposto_modo", "admin");
  const enviar = (id) =>
    document.getElementById(id).dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  const digitar = (id, valor) => {
    const campo = document.getElementById(id);
    campo.value = valor;
    campo.dispatchEvent(new window.Event("input", { bubbles: true }));
  };

  it("o primeiro grupo do combo mostra os produtos cadastrados depois da abertura", () => {
    admin();
    boot();
    document.getElementById("seg-cad-produtos").click();
    document.getElementById("btn-novo-cadastro").click();
    document.getElementById("prod-nome").value = "Água";
    document.getElementById("prod-categoria").value = "Bebidas";
    document.getElementById("var-valor-0").value = "R$ 3,00";
    enviar("form-produto");

    document.getElementById("seg-cad-combos").click();
    document.getElementById("btn-novo-cadastro").click();
    const grupos = document.querySelectorAll("#combo-grupos .combo-grupo");
    expect(grupos).toHaveLength(1);
    expect(grupos[0].querySelector(".combo-grupo-itens").textContent).toContain("Água");
  });

  it("cada campo de dinheiro diz se é cédulas ou moedas", () => {
    boot();
    ["fin", "pag", "venda", "pend", "edit"].forEach((prefixo) => {
      expect(document.getElementById(prefixo + "-cedulas-recebidas").closest(".cash-parte").textContent).toBe(
        "Cédulas"
      );
      expect(document.getElementById(prefixo + "-moedas-recebidas").closest(".cash-parte").textContent).toBe("Moedas");
      expect(document.getElementById(prefixo + "-cedulas-troco").closest(".cash-parte").textContent).toBe("Cédulas");
    });
  });

  it("na edição de recarga em dinheiro, o total novo pede o dinheiro recebido e corrige o caixa", () => {
    window.localStorage.setItem(
      "eletroposto_registros",
      JSON.stringify([
        {
          id: "ab-1",
          placa: "ABC1234",
          cliente: "Cliente",
          modelo: "Modelo",
          kwhUtilizado: 10,
          valorKwh: 1,
          valorPagar: 10,
          totalComConsumo: 10,
          metodoPagamento: "Dinheiro",
          turno: 1,
          data: "2026-09-22T10:00:00.000Z"
        }
      ])
    );
    window.localStorage.setItem(
      "eletroposto_caixa",
      JSON.stringify({
        cedulas: 10,
        moedas: 0,
        porMovimentos: true,
        historico: [
          {
            id: "cx-ab",
            tipo: "entrada",
            data: "2026-09-22T10:00:00.000Z",
            cedulas: 10,
            moedas: 0,
            valor: 10,
            automatico: true,
            referencia: { tipo: "abastecimento", id: "ab-1" }
          }
        ]
      })
    );
    boot();
    document.querySelector('.tab-btn[data-tab="tab-historico"]').click();
    document.querySelector("#lista-historico [data-editar-reg]").click();

    expect(document.getElementById("campo-edit-dinheiro").hidden).toBe(false);
    expect(document.getElementById("edit-cedulas-recebidas").value).toBe("R$ 10,00");

    const parte = document.querySelector("#edit-kwh-partes [data-kwh-parte]");
    parte.value = "15,000";
    parte.dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(document.getElementById("edit-dinheiro-dica").textContent).toContain("informe de novo");

    digitar("edit-cedulas-recebidas", "2000");
    digitar("edit-cedulas-troco", "500");
    expect(document.getElementById("edit-dinheiro-dica").textContent.replace(/\s/g, " ")).toContain(
      "Troco certo: R$ 5,00"
    );
    enviar("form-edicao");

    const caixa = JSON.parse(window.localStorage.getItem("eletroposto_caixa"));
    const movs = caixa.historico.filter((m) => m.referencia && m.referencia.id === "ab-1");
    expect(movs.filter((m) => m.tipo === "entrada").reduce((s, m) => s + m.cedulas, 0)).toBe(20);
    expect(movs.filter((m) => m.tipo === "saida").reduce((s, m) => s + m.cedulas, 0)).toBe(5);
    const registro = JSON.parse(window.localStorage.getItem("eletroposto_registros"))[0];
    expect(registro.valorEntregue).toBe(20);
    expect(registro.troco).toBe(5);
  });
});

describe("venda pendente reserva o estoque até a confirmação", () => {
  function semearUltimaUnidade(estoque = 1) {
    window.localStorage.setItem(
      "eletroposto_produtos",
      JSON.stringify([
        { id: "pai-agua", tipo: "pai", nome: "Água", categoria: "Bebidas", ativo: true },
        {
          id: "sku-agua",
          tipo: "sku",
          produtoPaiId: "pai-agua",
          nome: "Água",
          variante: "Padrão",
          categoria: "Bebidas",
          valor: 5,
          estoque,
          estoqueMinimo: 0,
          ativo: true
        }
      ])
    );
    window.localStorage.setItem("eletroposto_vendas", "[]");
    window.localStorage.removeItem("eletroposto_modo");
    window.localStorage.setItem("eletroposto_perfis", JSON.stringify([{ id: "p1", nome: "Mira", turno: 1 }]));
    window.localStorage.setItem("eletroposto_perfil_ativo", JSON.stringify("p1"));
  }
  function vender(metodo) {
    document.querySelector('.tab-btn[data-tab="tab-vendas"]').click();
    document.getElementById("select-produto-value").value = "sku-agua";
    document.getElementById("select-produto").value = "Água";
    document.getElementById("venda-qtd").value = "1";
    document.getElementById("venda-metodo").value = metodo;
    document
      .getElementById("form-venda")
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  }
  function confirmarPendente() {
    document.querySelector("#lista-vendas-pendentes [data-registrar-pend]").click();
    const produtoEscolhido = document.getElementById("pend-produto").value;
    document.getElementById("pend-metodo").value = "Pix";
    document
      .getElementById("form-venda-pendente")
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    return produtoEscolhido;
  }
  const estoqueSalvo = () =>
    JSON.parse(window.localStorage.getItem("eletroposto_produtos")).find((p) => p.id === "sku-agua").estoque;
  const pendentesSalvos = () => JSON.parse(window.localStorage.getItem("eletroposto_vendas_pre") || "[]");
  const vendasSalvas = () => JSON.parse(window.localStorage.getItem("eletroposto_vendas") || "[]");

  it("a última unidade fica reservada, não vai para outra venda e baixa ao confirmar", () => {
    semearUltimaUnidade(1);
    boot();
    vender("Pendente");
    expect(estoqueSalvo()).toBe(1);
    expect(pendentesSalvos()[0]).toMatchObject({ produtoId: "sku-agua", estoqueBaixado: false });
    expect(document.getElementById("lista-estoque").textContent).toContain("1 reservado em pendentes");

    vender("Pix");
    expect(vendasSalvas()).toHaveLength(0);
    expect(estoqueSalvo()).toBe(1);

    expect(confirmarPendente()).toBe("sku-agua");
    expect(pendentesSalvos()).toHaveLength(0);
    expect(vendasSalvas()).toHaveLength(1);
    expect(vendasSalvas()[0]).toMatchObject({ produtoId: "sku-agua", metodoPagamento: "Pix", estoqueBaixado: true });
    expect(estoqueSalvo()).toBe(0);
  });

  it("pendente antigo, que já baixou a última unidade, confirma sem baixar de novo", () => {
    semearUltimaUnidade(0);
    window.localStorage.setItem(
      "eletroposto_vendas_pre",
      JSON.stringify([
        {
          id: "vp-antigo",
          origem: "venda",
          idAbastecimento: "",
          idSessao: "",
          produtoId: "sku-agua",
          estoqueReferenciaId: "v-antigo",
          estoqueBaixado: true,
          produto: "Água",
          categoria: "Bebidas",
          valorUnitario: 5,
          quantidade: 1,
          valorTotal: 5,
          turno: 1,
          data: new Date().toISOString()
        }
      ])
    );
    boot();
    document.querySelector('.tab-btn[data-tab="tab-vendas"]').click();
    expect(confirmarPendente()).toBe("sku-agua");
    expect(pendentesSalvos()).toHaveLength(0);
    expect(vendasSalvas()).toHaveLength(1);
    expect(estoqueSalvo()).toBe(0);
  });

  it("descartar a pendente libera a reserva sem mexer no estoque", () => {
    semearUltimaUnidade(1);
    boot();
    vender("Pendente");
    window.confirm = () => true;
    document.querySelector("#lista-vendas-pendentes [data-descartar-pend]").click();
    expect(pendentesSalvos()).toHaveLength(0);
    expect(estoqueSalvo()).toBe(1);
    vender("Pix");
    expect(vendasSalvas()).toHaveLength(1);
    expect(estoqueSalvo()).toBe(0);
  });
});
