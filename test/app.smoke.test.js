import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mascararMoeda } from "../src/core.js";

const ROOT = resolve(import.meta.dirname, "..");

let doc;

beforeAll(() => {
  const html = readFileSync(resolve(ROOT, "index.html"), "utf8").replace(/^<!DOCTYPE[^>]*>/i, "");
  document.documentElement.innerHTML = html;
  doc = document;

  window.localStorage.setItem(
    "eletroposto_registros",
    JSON.stringify([
      {
        id: "a1",
        data: new Date(2026, 7, 19, 9, 0).toISOString(),
        placa: "ABC-1234",
        cliente: "Mike",
        modelo: "Model 3",
        perfil: null,
        duracaoSegundos: 1800,
        kwhUtilizado: 10.5,
        valorKwh: 1.5,
        valorPagar: 15.75,
        metodoPagamento: "Pix",
        pagamentoDividido: "Não",
        detalhesPagamento: [],
        consumoConveniencia: "Não",
        valorConsumo: 0
      },
      {
        id: "a2",
        data: new Date(2026, 7, 19, 10, 0).toISOString(),
        placa: "XYZ-9999",
        cliente: "Charlie",
        modelo: "Golf",
        perfil: { id: "p1", nome: "Juliet", foto: "" },
        duracaoSegundos: 2400,
        kwhUtilizado: 20,
        valorKwh: 1.5,
        valorPagar: 30,
        metodoPagamento: "Pendente",
        pagamentoDividido: "Não",
        detalhesPagamento: [],
        consumoConveniencia: "Sim",
        valorConsumo: 8,
        consumoProduto: { nome: "Água", quantidade: 2 }
      }
    ])
  );
  window.localStorage.setItem(
    "eletroposto_caixa",
    JSON.stringify({
      cedulas: 500,
      moedas: 50,
      historico: [
        {
          id: "c1",
          data: new Date(2030, 0, 1, 11, 0).toISOString(),
          tipo: "entrada",
          origem: "Cédulas",
          descricao: "",
          operador: null,
          valor: 150
        },
        {
          id: "c2",
          data: new Date(2030, 0, 2, 9, 0).toISOString(),
          tipo: "retirada",
          origem: "Retirada",
          descricao: "Troco para caixa",
          operador: { id: "p1", nome: "Juliet", foto: "" },
          valor: 120
        }
      ]
    })
  );
  window.localStorage.setItem(
    "eletroposto_perfis",
    JSON.stringify([
      {
        id: "p1",
        nome: "Juliet",
        foto: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
      }
    ])
  );
  window.localStorage.setItem("eletroposto_perfil_ativo", JSON.stringify("p1"));
  window.localStorage.setItem("eletroposto_modo", "admin");
  window.localStorage.setItem("eletroposto_config", "{}");
  window.localStorage.setItem(
    "eletroposto_produtos",
    JSON.stringify([
      {
        id: "prod-agua",
        nome: "Água",
        categoria: "Bebidas",
        valor: 5,
        estoque: 5,
        estoqueMinimo: 1
      }
    ])
  );
  window.localStorage.setItem("eletroposto_vendas", "[]");
  window.localStorage.setItem("eletroposto_vendas_pre", "[]");
  window.localStorage.setItem(
    "eletroposto_sessoes",
    JSON.stringify([
      {
        id: "s1",
        placa: "ABC-1234",
        cliente: "Mike",
        modelo: "Model 3",
        bateriaInicial: 20,
        bateriaAlvo: 80,
        tempoEstimadoMin: 60,
        bico: 2,
        status: "carregando",
        inicio: new Date(2026, 7, 19, 8, 0).toISOString()
      }
    ])
  );

  window.confirm = () => true;

  window.__requisicoes = [];
  window.fetch = (url) => {
    window.__requisicoes.push(String(url));
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve("")
    });
  };

  const core = readFileSync(resolve(ROOT, "src", "core.js"), "utf8");
  const app = readFileSync(resolve(ROOT, "src", "app.js"), "utf8");
  eval(core + "\n" + app);
});

// Troca de modo quando a aba é do outro papel, como a pessoa faria no topo da tela.
function clickTab(tab) {
  const botao = doc.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (botao.hidden) doc.querySelector("[data-modo-app]:not(.active)").click();
  botao.click();
}

describe("boot", () => {
  it("inicializa sem erros inesperados", () => {
    expect(doc.getElementById("alert-box").textContent).not.toContain("Erro inesperado");
  });

  it("oferece os controles da identidade visual", () => {
    expect(doc.querySelector('link[rel="manifest"]').getAttribute("href")).toBe("./manifest.json");
    expect(doc.getElementById("cfg-cor-secundaria").value).toBe("#fff7ed");
    expect(doc.getElementById("cfg-nome-sistema").value).toBe("Eletroposto");
    expect(doc.getElementById("cfg-logo-sistema").getAttribute("accept")).toBe("image/png,image/jpeg");
  });

  it("mostra cada lista de cadastro numa aba e abre o novo cadastro numa folha", () => {
    ["clientes", "modelos", "produtos", "combos"].forEach((tipo) => {
      const aba = doc.getElementById("seg-cad-" + tipo);
      aba.click();
      expect(aba.getAttribute("aria-selected")).toBe("true");
      expect(doc.getElementById("cad-" + tipo).hidden).toBe(false);
      expect(doc.getElementById("lista-" + tipo).hidden).toBe(false);
    });
    expect(doc.querySelectorAll("[data-cadastro-list-toggle]")).toHaveLength(0);

    doc.getElementById("seg-cad-clientes").click();
    doc.getElementById("btn-novo-cadastro").click();
    expect(doc.getElementById("modal-cad-clientes").classList.contains("show")).toBe(true);
    doc.querySelector('[data-fechar-modal="modal-cad-clientes"]').click();
    expect(doc.getElementById("modal-cad-clientes").classList.contains("show")).toBe(false);
  });

  it("mantem a busca visivel em cada lista de cadastro", () => {
    ["clientes", "modelos", "produtos", "combos"].forEach((tipo) => {
      const busca = doc.getElementById("busca-" + tipo);
      expect(busca.hidden).toBe(false);
    });
    expect(doc.querySelectorAll("[data-cadastro-search-toggle]")).toHaveLength(0);
  });

  it("nao oferece exclusao total de produtos", () => {
    expect(doc.getElementById("btn-limpar-produtos")).toBeNull();
  });

  it("filtra clientes pelo modelo", () => {
    const modelo = doc.getElementById("modelo");
    if (!modelo.querySelector('option[value="Model 3"]')) {
      const opcao = doc.createElement("option");
      opcao.value = "Model 3";
      opcao.textContent = "Model 3";
      modelo.appendChild(opcao);
    }
    doc.getElementById("placa").value = "TES7E89";
    doc.getElementById("nome-cliente").value = "Cliente de teste";
    modelo.value = "Model 3";
    doc.getElementById("form-cliente").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    const busca = doc.getElementById("busca-clientes");
    busca.value = "model 3";
    busca.dispatchEvent(new Event("input", { bubbles: true }));
    expect(doc.getElementById("lista-clientes").textContent).toContain("Cliente de teste");

    busca.value = "inexistente";
    busca.dispatchEvent(new Event("input", { bubbles: true }));
    expect(doc.getElementById("lista-clientes").textContent).toContain("Nenhum cliente encontrado");
    busca.value = "";
    busca.dispatchEvent(new Event("input", { bubbles: true }));
  });

  it("mostra o estoque agrupado e repõe uma variação", () => {
    const inventario = doc.getElementById("lista-estoque");
    doc.querySelector('#estoque-chips-venda [data-filtro-estoque="todos"]').click();
    expect(inventario.querySelector(".estoque-grupo-head strong").textContent).toBe("Água");
    const repor = inventario.querySelectorAll("[data-repor]");
    expect(repor.length).toBeGreaterThan(0);

    const id = repor[0].dataset.repor;
    const antes =
      JSON.parse(window.localStorage.getItem("eletroposto_produtos")).find((produto) => produto.id === id).estoque || 0;
    repor[0].click();
    doc.getElementById("repor-qtd").value = "3";
    doc.getElementById("form-repor").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    const depois = JSON.parse(window.localStorage.getItem("eletroposto_produtos")).find(
      (produto) => produto.id === id
    ).estoque;
    expect(depois).toBe(antes + 3);

    // Volta ao estoque original para não afetar os testes seguintes
    doc.querySelector('#lista-estoque [data-repor="' + id + '"]').click();
    doc.querySelector('#repor-modos [data-modo="contagem"]').click();
    doc.getElementById("repor-qtd").value = String(antes);
    doc.getElementById("form-repor").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    const busca = doc.getElementById("busca-estoque");
    busca.value = "inexistente";
    busca.dispatchEvent(new Event("input", { bubbles: true }));
    expect(inventario.textContent).toContain("Nenhum produto encontrado");
    busca.value = "";
    busca.dispatchEvent(new Event("input", { bubbles: true }));
  });

  it("mascara campos de cedulas e moedas em centavos", () => {
    const campos = [...doc.querySelectorAll(".currency-input")];
    // 20 campos de cédulas e moedas + 4 de "Outro valor" cobrado + 6 de tarifa, parada e combo
    // + 4 da correção de dinheiro pelo caixa + 4 do dinheiro na edição da recarga
    expect(campos).toHaveLength(38);
    campos.forEach((campo) => {
      expect(campo.type).toBe("text");
      expect(campo.inputMode).toBe("numeric");
    });

    const campo = doc.getElementById("caixa-cedulas");
    campo.value = "1";
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    expect(campo.value).toBe("R$ 0,01");
    campo.value += "0";
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    expect(campo.value).toBe("R$ 0,10");
    campo.value += "0";
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    expect(campo.value).toBe("R$ 1,00");
  });

  it("carrega perfis e operador ativo", () => {
    expect(doc.getElementById("select-perfil-ativo").value).toBe("p1");
    expect(doc.getElementById("select-perfil-ativo").selectedOptions[0].textContent).toContain("Juliet");
    expect(doc.getElementById("perfil-ativo-foto").src).toContain("data:image/gif");
    expect(doc.getElementById("perfil-ativo-foto").hidden).toBe(false);
  });

  it("permite imagens data URL na politica de conteudo", () => {
    const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
    expect(csp).toContain("img-src 'self' data:");
  });

  it("usa o icone padrao do sistema como favicon", () => {
    expect(doc.querySelector('link[rel="icon"]').getAttribute("href")).toBe("./icon-512.png");
  });

  it("mantem a escrita dos modais sem icones decorativos", () => {
    expect(doc.querySelector("#modal-finalizar h2").textContent).toContain("Finalizar recarga");
    expect(doc.querySelector("#modal-venda-pendente h2").textContent).toBe("Registrar consumo");
    expect(doc.querySelector("#modal-pagamento h2").textContent).toBe("Receber pagamento");
  });

  it("renderiza a sessao ativa no card operacional detalhado", () => {
    const sessao = doc.querySelector("#lista-sessoes .operation-session");
    expect(sessao).not.toBeNull();
    expect(sessao.querySelector(".operation-session-status").textContent).toBe("Em andamento");
    expect(sessao.querySelectorAll(".operation-session-grid > div")).toHaveLength(3);
    expect(sessao.querySelector("[data-finalizar]").textContent).toBe("Finalizar");
    expect(sessao.querySelector("[data-cancelar]").textContent).toBe("Cancelar");
  });

  it("mantem a navegacao mobile sincronizada com as abas", () => {
    const botoes = doc.querySelectorAll('.tab-btn[data-tab="tab-dashboard"]');
    expect(botoes).toHaveLength(2);
    botoes[1].click();
    expect(doc.getElementById("tab-dashboard").classList.contains("active")).toBe(true);
    botoes.forEach((botao) => expect(botao.classList.contains("active")).toBe(true));
  });

  it("preenche o bico ao iniciar uma recarga pelo card disponível", () => {
    const card = doc.querySelector('#status-bicos-iniciar [data-bico="1"]');
    card.click();
    expect(doc.getElementById("bico-utilizado").value).toBe("1");
  });

  it("leva diretamente ao caixa pela ação rápida", () => {
    expect(doc.querySelector("#btn-ver-caixa use").getAttribute("href")).toBe("#i-wallet");
    doc.getElementById("btn-ver-caixa").click();
    expect(doc.getElementById("tab-caixa").classList.contains("active")).toBe(true);
  });
});

describe("aba historico", () => {
  it("renderiza os registros e totais", () => {
    clickTab("tab-historico");
    const rows = doc.querySelectorAll("#lista-historico .history-data-row");
    expect(rows.length).toBe(2);
    expect(doc.getElementById("stat-qtd").textContent).toBe("2 de 2");
    expect(doc.getElementById("stat-total").textContent.replace(/\u00A0/g, " ")).toBe("R$ 15,75");
    expect(doc.getElementById("stat-consumo").textContent.replace(/\u00A0/g, " ")).toBe("R$ 0,00");
  });

  it("exclui um registro com confirmacao", () => {
    doc.querySelector("#lista-historico [data-editar-reg]").click();
    doc.querySelector("#modal-edicao [data-remover-reg]").click();
    expect(doc.querySelectorAll("#lista-historico .history-data-row").length).toBe(1);
    expect(JSON.parse(window.localStorage.getItem("eletroposto_registros")).length).toBe(1);
  });
});

// Contagem e retirada do caixa são do modo Admin.
function modoAdmin() {
  const botao = doc.querySelector('[data-modo-app="admin"]');
  if (!botao.classList.contains("active")) botao.click();
}

describe("aba caixa", () => {
  it("renderiza totais e historico", () => {
    modoAdmin();
    clickTab("tab-caixa");
    expect(doc.getElementById("stat-caixa-total").textContent.replace(/\u00A0/g, " ")).toBe("R$ 550,00");
    expect(doc.querySelectorAll("#lista-caixa .cash-data-row").length).toBe(4);
    expect(doc.getElementById("caixa-operador-hint").textContent).toBe("Juliet");
  });

  it("registra entrada/saida pela contagem fisica", () => {
    const form = doc.getElementById("form-caixa-contagem");
    doc.getElementById("caixa-cedulas").value = "700,00";
    doc.getElementById("caixa-moedas").value = "50,00";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    expect(doc.getElementById("stat-caixa-total").textContent.replace(/\u00A0/g, " ")).toBe("R$ 750,00");
    expect(doc.querySelectorAll("#lista-caixa .cash-data-row").length).toBe(5);
  });

  it("bloqueia retirada maior que a espécie disponível", () => {
    const form = doc.getElementById("form-caixa-retirada");
    doc.getElementById("caixa-retirada-moedas").value = "9999,00";
    doc.getElementById("caixa-retirada-motivo").value = "teste";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    expect(doc.querySelectorAll("#lista-caixa .cash-data-row").length).toBe(5);
  });

  it("registra retirada valida com motivo e operador", () => {
    const form = doc.getElementById("form-caixa-retirada");
    doc.getElementById("caixa-retirada-cedulas").value = "100,00";
    doc.getElementById("caixa-retirada-moedas").value = "20,00";
    doc.getElementById("caixa-retirada-motivo").value = "Troco";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    expect(doc.getElementById("stat-caixa-total").textContent.replace(/\u00A0/g, " ")).toBe("R$ 630,00");
    expect(doc.querySelectorAll("#lista-caixa .cash-data-row").length).toBe(6);
    expect(doc.getElementById("lista-caixa").textContent.replace(/\u00A0/g, " ")).toContain(
      "Cédulas R$ 100,00 · Moedas R$ 20,00"
    );
  });

  it("exclui retirada devolvendo o valor ao caixa", () => {
    doc.querySelector("#lista-caixa [data-excluir-caixa]").click();
    expect(doc.getElementById("stat-caixa-total").textContent.replace(/\u00A0/g, " ")).toBe("R$ 750,00");
    expect(doc.querySelectorAll("#lista-caixa .cash-data-row").length).toBe(5);
  });
});

describe("resumo whatsapp do caixa", () => {
  it("abre wa.me com os valores físicos atuais", () => {
    let captured = "";
    window.open = (url) => {
      captured = url;
      return null;
    };
    doc.getElementById("btn-compartilhar-caixa").click();
    expect(captured).toContain("https://wa.me/?text=");
    const msg = decodeURIComponent(captured.replace("https://wa.me/?text=", "")).replace(/\u00A0/g, " ");
    expect(msg).toContain("*Eletroposto* - 💰 Caixa");
    expect(msg).toContain("Cédulas: R$ 720,00");
    expect(msg).toContain("Moedas: R$ 30,00");
    expect(msg).toContain("Total em caixa: R$ 750,00");
    expect(msg).not.toContain("Entrada —");
  });
});

describe("vendas pendentes", () => {
  function registrarVendaPendente(quantidade) {
    clickTab("tab-vendas");
    doc.getElementById("select-produto-value").value = "prod-agua";
    doc.getElementById("select-produto").value = "Água";
    doc.getElementById("venda-qtd").value = String(quantidade);
    doc.getElementById("venda-metodo").value = "Pendente";
    doc.getElementById("form-venda").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  }

  it("reserva estoque e só baixa ao confirmar uma venda avulsa pendente", () => {
    registrarVendaPendente(2);

    expect(JSON.parse(window.localStorage.getItem("eletroposto_vendas_pre"))).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem("eletroposto_produtos"))[0].estoque).toBe(5);
    expect(doc.getElementById("lista-vendas-pendentes").textContent).toContain("Venda avulsa");

    doc.querySelector("#lista-vendas-pendentes [data-registrar-pend]").click();
    doc.getElementById("pend-metodo").value = "Débito";
    doc
      .getElementById("form-venda-pendente")
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

    const vendas = JSON.parse(window.localStorage.getItem("eletroposto_vendas"));
    expect(JSON.parse(window.localStorage.getItem("eletroposto_vendas_pre"))).toHaveLength(0);
    expect(vendas).toHaveLength(1);
    expect(vendas[0].metodoPagamento).toBe("Débito");
    expect(JSON.parse(window.localStorage.getItem("eletroposto_produtos"))[0].estoque).toBe(3);
  });

  it("libera a reserva ao descartar uma venda avulsa pendente, sem mexer no estoque", () => {
    registrarVendaPendente(1);
    expect(JSON.parse(window.localStorage.getItem("eletroposto_produtos"))[0].estoque).toBe(3);

    doc.querySelector("#lista-vendas-pendentes [data-descartar-pend]").click();

    expect(JSON.parse(window.localStorage.getItem("eletroposto_vendas_pre"))).toHaveLength(0);
    expect(JSON.parse(window.localStorage.getItem("eletroposto_produtos"))[0].estoque).toBe(3);
  });
});

describe("caixa automático", () => {
  it("registra cédulas recebidas e troco de uma venda em dinheiro", () => {
    clickTab("tab-vendas");
    doc.getElementById("select-produto-value").value = "prod-agua";
    doc.getElementById("select-produto").value = "Água";
    doc.getElementById("venda-qtd").value = "1";
    doc.getElementById("venda-metodo").value = "Dinheiro";
    doc.getElementById("venda-metodo").dispatchEvent(new window.Event("change", { bubbles: true }));
    doc.getElementById("venda-cedulas-recebidas").value = "R$ 10,00";
    doc.getElementById("venda-moedas-recebidas").value = "R$ 0,00";
    doc.getElementById("venda-cedulas-troco").value = "R$ 5,00";
    doc.getElementById("venda-moedas-troco").value = "R$ 0,00";
    doc.getElementById("form-venda").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

    const caixa = JSON.parse(window.localStorage.getItem("eletroposto_caixa"));
    expect(caixa.cedulas).toBe(725);
    expect(caixa.moedas).toBe(30);
    expect(caixa.historico.some((mov) => mov.automatico && mov.origem === "Venda Água" && mov.cedulas === 10)).toBe(
      true
    );
    expect(
      caixa.historico.some((mov) => mov.automatico && mov.descricao === "Troco ao cliente" && mov.cedulas === 5)
    ).toBe(true);
  });

  it("admin corrige pelo caixa o dinheiro recebido e o troco do registro", () => {
    const admin = doc.querySelector('.modo-switch [data-modo-app="admin"]');
    if (!admin.classList.contains("active")) admin.click();
    clickTab("tab-caixa");
    const linha = Array.from(doc.querySelectorAll("#lista-caixa [data-editar-caixa]")).find((row) =>
      row.textContent.includes("Venda Água")
    );
    linha.click();
    expect(doc.getElementById("modal-caixa-registro").classList.contains("show")).toBe(true);
    expect(doc.getElementById("cxr-cedulas-recebidas").value).toBe("R$ 10,00");
    expect(doc.getElementById("cxr-cedulas-troco").value).toBe("R$ 5,00");
    doc.getElementById("cxr-cedulas-recebidas").value = "R$ 20,00";
    doc.getElementById("cxr-cedulas-troco").value = "R$ 10,00";
    doc
      .getElementById("form-caixa-registro")
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

    const caixa = JSON.parse(window.localStorage.getItem("eletroposto_caixa"));
    expect(caixa.cedulas).toBe(730);
    const movs = caixa.historico.filter((mov) => mov.automatico && mov.origem === "Venda Água");
    expect(movs.find((mov) => mov.tipo === "entrada").cedulas).toBe(20);
    expect(movs.find((mov) => mov.tipo === "saida").cedulas).toBe(10);
    const venda = JSON.parse(window.localStorage.getItem("eletroposto_vendas")).find(
      (v) => v.metodoPagamento === "Dinheiro"
    );
    expect(venda.valorEntregue).toBe(20);
    expect(venda.troco).toBe(10);
  });
});

describe("admin", () => {
  it("não precisa escolher o operador do turno", () => {
    expect(doc.getElementById("modal-perfil-turno-obrigatorio").classList.contains("show")).toBe(false);
  });

  it("filtra os dashboards pelo turno atual", () => {
    clickTab("tab-dashboard");
    doc.querySelector('#dash-periodos [data-dash-periodo="turno"]').click();
    expect(doc.querySelector('#dash-periodos [data-dash-periodo="turno"]').getAttribute("aria-pressed")).toBe("true");
    expect(doc.getElementById("dash-sub").textContent).toContain(", hoje");
    expect(doc.getElementById("dash-compara").textContent).toContain("mesmo turno de ontem");
  });
});

describe("consumo na finalização", () => {
  it("permite buscar e selecionar produto digitando", () => {
    doc.querySelector("#lista-sessoes [data-finalizar]").click();
    doc.getElementById("btn-add-fin-consumo").click();
    const busca = doc.querySelector("#fin-consumo-itens [data-consumo-busca]");
    busca.value = "agu";
    busca.dispatchEvent(new window.Event("input", { bubbles: true }));

    const opcao = doc.querySelector("#fin-consumo-itens [data-consumo-opcao]");
    expect(opcao.textContent).toContain("Água");
    opcao.click();
    expect(doc.querySelector("#fin-consumo-itens [data-consumo-produto]").value).toBe("prod-agua");
  });
});

describe("fechamento de turno", () => {
  it("envia vendas, abastecimentos e caixa em uma mensagem consolidada", () => {
    const urls = [];
    window.open = (destino) => {
      urls.push(destino);
      return null;
    };
    doc.getElementById("btn-fechar-turno").click();
    expect(doc.getElementById("modal-fechar-turno").classList.contains("show")).toBe(true);
    doc.getElementById("fechamento-data-de").value = "2026-08-19";
    doc.getElementById("fechamento-data-ate").value = "2026-08-19";
    doc.getElementById("fechamento-turno").value = "1";
    doc.getElementById("fechamento-operador").value = "";
    doc
      .getElementById("form-fechar-turno")
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    // Antes do WhatsApp, a folha de saída do caixa do turno.
    expect(urls).toHaveLength(0);
    expect(doc.getElementById("modal-caixa-retirada").classList.contains("show")).toBe(true);
    doc.getElementById("btn-enviar-sem-saida").click();

    expect(urls).toHaveLength(1);
    const mensagem = decodeURIComponent(urls[0].replace("https://wa.me/?text=", ""));
    expect(mensagem).toContain("Relatório de Vendas");
    expect(mensagem).toContain("Relatório de Abastecimento");
    expect(mensagem).toContain("💰 Caixa");
  });
});

describe("pagamento múltiplo em dinheiro", () => {
  it("soma venda pendente vinculada e registra excedente sem troco no caixa", () => {
    clickTab("tab-vendas");
    doc.getElementById("select-produto-value").value = "prod-agua";
    doc.getElementById("select-produto").value = "Água";
    doc.getElementById("venda-qtd").value = "1";
    doc.getElementById("venda-metodo").value = "Pendente";
    doc.getElementById("venda-metodo").dispatchEvent(new window.Event("change", { bubbles: true }));
    const estoqueAntes = JSON.parse(window.localStorage.getItem("eletroposto_produtos")).find(
      (p) => p.id === "prod-agua"
    ).estoque;
    doc.getElementById("venda-recarga").value = "s1";
    doc.getElementById("form-venda").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    expect(JSON.parse(window.localStorage.getItem("eletroposto_vendas_pre"))[0].idSessao).toBe("s1");
    // Pendente vinculada só reserva; a baixa vem quando a recarga é paga.
    expect(
      JSON.parse(window.localStorage.getItem("eletroposto_produtos")).find((p) => p.id === "prod-agua").estoque
    ).toBe(estoqueAntes);

    doc.querySelector("#lista-sessoes [data-finalizar]").click();
    expect(doc.getElementById("fin-consumos-vinculados").textContent).toContain("Água");
    expect(doc.getElementById("fin-valor-pagar").value.replace(/\u00A0/g, " ")).toBe("R$ 5,00");
    const leitura = doc.querySelector("#fin-kwh-partes [data-kwh-parte]");
    leitura.value = "3334";
    leitura.dispatchEvent(new window.Event("input", { bubbles: true }));
    const pagamentoMultiplo = doc.querySelector('input[name="fin-pag-div"][value="Sim"]');
    pagamentoMultiplo.checked = true;
    pagamentoMultiplo.dispatchEvent(new window.Event("change", { bubbles: true }));
    expect(doc.getElementById("campo-fin-dinheiro").style.display).toBe("flex");
    const parcelas = doc.querySelectorAll("#fin-divisao-lista .split-valor");
    const total = Number(
      doc
        .getElementById("fin-valor-pagar")
        .value.replace(/[^\d,]/g, "")
        .replace(",", ".")
    );
    expect(parcelas[0].classList.contains("currency-input")).toBe(true);
    parcelas[0].value = "500";
    parcelas[0].dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(parcelas[0].value.replace(/ /g, " ")).toBe("R$ 5,00");
    // A outra parcela recebe sozinha o que falta cobrar.
    expect(parcelas[1].value).toBe(mascararMoeda(Math.round((total - 5) * 100)));
    expect(doc.getElementById("soma-fin-divisao").textContent).toContain("OK");
    const caixaAntes = JSON.parse(window.localStorage.getItem("eletroposto_caixa")).cedulas;
    doc.getElementById("fin-cedulas-recebidas").value = "R$ 5,00";
    doc.getElementById("fin-moedas-recebidas").value = "R$ 0,00";
    doc.getElementById("form-finalizar").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

    const registros = JSON.parse(window.localStorage.getItem("eletroposto_registros"));
    const registro = registros[registros.length - 1];
    const caixaDepois = JSON.parse(window.localStorage.getItem("eletroposto_caixa"));
    expect(registro.metodoPagamento).toBe("Múltiplos");
    expect(registro.troco).toBe(0);
    expect(registro.valorExcedente).toBe(0);
    expect(caixaDepois.cedulas).toBe(caixaAntes + 5);
    expect(registro.consumoProdutos).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem("eletroposto_vendas_pre"))).toHaveLength(0);
    expect(
      JSON.parse(window.localStorage.getItem("eletroposto_produtos")).find((p) => p.id === "prod-agua").estoque
    ).toBe(estoqueAntes - 1);
    expect(
      JSON.parse(window.localStorage.getItem("eletroposto_vendas")).some(
        (venda) => venda.idAbastecimento === registro.id
      )
    ).toBe(true);
  });
});

describe("desfazer registros", () => {
  it("move uma venda confirmada para consumos pendentes sem alterar estoque", () => {
    clickTab("tab-vendas");
    const estoqueAntes = JSON.parse(window.localStorage.getItem("eletroposto_produtos"))[0].estoque;
    doc.querySelector("#lista-vendas [data-editar-venda]").click();
    doc.querySelector("#modal-venda-edicao [data-desfazer-venda]").click();

    expect(doc.getElementById("lista-vendas-pendentes").textContent).toContain("Água");
    expect(JSON.parse(window.localStorage.getItem("eletroposto_produtos"))[0].estoque).toBe(estoqueAntes);
  });

  it("move um abastecimento confirmado para pagamentos pendentes", () => {
    clickTab("tab-historico");
    doc.getElementById("btn-limpar-filtro").click();
    doc.querySelector("#lista-historico [data-editar-reg]").click();
    doc.querySelector("#modal-edicao [data-desfazer-reg]").click();

    expect(doc.querySelector("#lista-pendentes [data-registrar-pag]")).not.toBeNull();
  });
});

describe("sem internet", () => {
  // Única exceção: imagens do fundo do mapa da Análise (tiles do OpenStreetMap). Nenhum dado sai do aparelho.
  it("não faz nenhuma requisição de rede e a CSP só libera os tiles do mapa", () => {
    expect(window.__requisicoes).toEqual([]);
    const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(csp).not.toMatch(/google/);
    expect(csp.match(/https:\/\/[^\s;]+/g)).toEqual(["https://tile.openstreetmap.org"]);
    expect(csp).toMatch(/img-src [^;]*https:\/\/tile\.openstreetmap\.org/);
    expect(csp).toContain("connect-src 'self'");
  });
});
