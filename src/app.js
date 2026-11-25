
/* globais declarados em core.js */
/* global gerarDadosDemo, hashTexto, definirTurnos, listaTurnos, parseTimeToMinutes, nomeTurno, validarTurnos, TURNOS_PADRAO, saldoDoCaixa, TURNOS, situacaoEstoque, estoqueIdealDe, sugestaoReposicao, fmt, fmtKwh, fmtKwh2, pad2, fmtMoeda, mascararKwhTres, kwhDaMascara, mascararMoeda, moedaDaMascara, escapeHtml, escapeAttr, formatarDuracao, formatarData, dataLocalISO, ehPendente, metodoPagamentoTexto, validarParcelasPagamento, resumoPagamentos, arred, totalCaixa, subtrairDoCaixa, somarAoCaixa, filtrarPorPeriodoTurno, getDadosTurnoAtual, getDataOperacional, escurecerHex, clarearHex, corComContrasteBranco */
(function () {
  "use strict";

  const KEY_CLIENTES = "eletroposto_clientes";
  const KEY_ABASTECIMENTOS = "eletroposto_registros";
  const KEY_SESSOES = "eletroposto_sessoes";
  const KEY_CONFIG = "eletroposto_config";
  const KEY_TEMA = "eletroposto_tema";
  const KEY_PERFIS = "eletroposto_perfis";
  const KEY_PERFIL_ATIVO = "eletroposto_perfil_ativo";
  const KEY_MODO = "eletroposto_modo";
  const KEY_PERFIL_TURNO_REGRA = "eletroposto_perfil_turno_regra";
  const KEY_NOTIFICACOES_FECHADAS = "eletroposto_notificacoes_5min_fechadas";
  const PERFIL_TURNO_REGRA_VERSAO = "perfil-turno-obrigatorio-v1";
  const KEY_MODELOS = "eletroposto_modelos";
  const KEY_PRODUTOS = "eletroposto_produtos";
  const KEY_VENDAS = "eletroposto_vendas";
  const KEY_VENDAS_PENDENTES = "eletroposto_vendas_pre";
  const KEY_CAIXA = "eletroposto_caixa";
  const KEY_MOVIMENTOS_ESTOQUE = "eletroposto_movimentos_estoque";
  // Sem configuração salva, o aparelho abre o assistente de posto novo.
  const primeiroUso = localStorage.getItem(KEY_CONFIG) === null;
  const LOGO_PADRAO = "./icon-512.png";
  const NOME_PADRAO = "Eletroposto";
  const CONFIG_PADRAO = {
    tarifaKwh: 1.5,
    carregadores: [
      { potenciaKw: 40 },
      { potenciaKw: 60 },
      { potenciaKw: 60 }
    ],
    corPrimaria: "#f97316",
    corSecundaria: "#fff7ed",
    nomeSistema: NOME_PADRAO,
    logoSistema: LOGO_PADRAO,
    textoAtendimento: "",
    localizacao: "",
    linkMapa: ""
  };

  const $ = (id) => document.getElementById(id);

  const alertaGlobal = $("alert-box");
  alertaGlobal.setAttribute("role", "status");
  alertaGlobal.setAttribute("aria-live", "polite");
  document.querySelectorAll(".modal-overlay").forEach(function (modal) {
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const titulo = modal.querySelector("h1, h2, h3");
    if (titulo) {
      if (!titulo.id) titulo.id = modal.id + "-titulo";
      modal.setAttribute("aria-labelledby", titulo.id);
    }
  });

  function carregar(chave, padrao) {
    try {
      const dados = JSON.parse(localStorage.getItem(chave));
      return Array.isArray(dados) ? dados : padrao;
    } catch (e) {
      return padrao;
    }
  }

  function comDebounce(fn, espera) {
    let timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, espera);
    };
  }

  // Só a instância atual da página grava. Uma instância substituída (ao recarregar o app
  // sem fechar a página) pode ter uma resposta de rede atrasada e não pode sobrescrever dados.
  const instanciaApp = {};
  window.__eletropostoInstanciaAtual = instanciaApp;
  // Sem espaço, o aviso aparece no máximo a cada 5 minutos, e não a cada registro.
  let ultimoAvisoArmazenamento = 0;
  function salvar(chave, dados) {
    if (window.__eletropostoInstanciaAtual !== instanciaApp) return;
    try {
      localStorage.setItem(chave, JSON.stringify(dados));
    } catch (e) {
      console.error("Falha ao salvar '" + chave + "':", e);
      if (Date.now() - ultimoAvisoArmazenamento > 5 * 60000) {
        ultimoAvisoArmazenamento = Date.now();
        // Depois do ciclo atual: no começo do app o aviso ainda não existe.
        setTimeout(function () { mostrarAlerta("O aparelho está sem espaço para guardar os dados. Libere espaço no aparelho e faça um backup.", "error", true); }, 0);
      }
    }
  }

  let clientes = carregar(KEY_CLIENTES, []);
  let abastecimentos = carregar(KEY_ABASTECIMENTOS, []);
  let sessoes = carregar(KEY_SESSOES, []);
let modelos = carregar(KEY_MODELOS, []);
  let produtos = carregar(KEY_PRODUTOS, []);
  migrarProdutosEstoque();
  migrarAbastecimentosSync();
  let vendas = carregar(KEY_VENDAS, []);
  let vendasAlteradas = false;
  vendas.forEach(function (v) {
    if (v.estoqueBaixado === undefined && v.produtoId) {
      v.estoqueBaixado = true;
      v.estoqueReferenciaId = v.estoqueReferenciaId || v.id || gerarId("ref");
      vendasAlteradas = true;
    }
  });
  if (vendasAlteradas) salvar(KEY_VENDAS, vendas);
  let vendasPendentes = carregar(KEY_VENDAS_PENDENTES, []);
  const movimentosEstoque = carregar(KEY_MOVIMENTOS_ESTOQUE, []);
  const ROTULOS_SITUACAO = { faltando: "Faltando", baixo: "Baixo", sem: "Sem contagem", todos: "Todos" };
  const ROTULOS_MOVIMENTO = { reposicao: "Reposição", ajuste: "Ajuste de contagem", perda: "Perda", vencido: "Vencido", uso_interno: "Uso interno" };
  const filtroEstoque = { cad: null, venda: null };
  const reposicao = { skuId: null, modo: "repor", voltarParaPaiId: null };
  let produtoEditandoPaiId = null;
  let variacoesForm = [];
  let placaNova = null;
  const dashEstado = { periodo: "dia", de: "", ate: "", turno: "", operador: "", pagamento: "", rankModo: "valor", rankTodos: false, tabela: false };
  const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const DIA_MS = 86400000;
  let perfis = carregar(KEY_PERFIS, []);
  // Modo do aparelho: qualquer pessoa troca entre Operador e Admin na barra do topo.
  let modoApp = localStorage.getItem(KEY_MODO) === "admin" ? "admin" : "operador";
  if (repararSnapshotsProdutos()) {
    salvar(KEY_ABASTECIMENTOS, abastecimentos);
    salvar(KEY_VENDAS, vendas);
    salvar(KEY_VENDAS_PENDENTES, vendasPendentes);
  }

  function gerarId(prefixo) {
    return prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function produtoPorId(id) {
    if (!id) return null;
    return produtos.find((p) => p.id === id) || null;
  }

  function ehSku(produto) { return !!produto && produto.tipo === "sku"; }
  function skus() { return produtos.filter(ehSku); }
  function combos() { return produtos.filter(function (produto) { return produto.tipo === "combo"; }); }
  function itensVendaveis() { return skus().concat(combos()); }
  function paiDoSku(sku) { return sku && produtoPorId(sku.produtoPaiId); }
  function nomeProduto(sku) {
    const pai = paiDoSku(sku);
    return pai ? pai.nome + " — " + (sku.variante || "Padrão") : (sku ? sku.nome : "");
  }

  function textoProdutoValido(valor) {
    const texto = valor == null ? "" : String(valor).trim();
    return texto && texto !== "undefined" && texto !== "null" ? texto : "";
  }

  function nomeSnapshotProduto(registro) {
    const idProduto = registro && (registro.produtoId || (Object.prototype.hasOwnProperty.call(registro, "nome") ? registro.id : null));
    const produto = produtoPorId(idProduto);
    const salvo = textoProdutoValido(registro && (registro.produto != null ? registro.produto : registro.nome));
    if (salvo && salvo !== "Produto removido" && salvo !== "Produto não identificado") return salvo;
    if (produto) return nomeProduto(produto) || "Produto não identificado";
    if (salvo) return salvo;
    return idProduto ? "Produto removido" : "Produto não identificado";
  }

  function normalizarSnapshotProduto(registro, campo) {
    if (!registro) return false;
    const destino = campo || "produto";
    const atual = textoProdutoValido(registro[destino]);
    const resolvido = nomeSnapshotProduto(registro);
    if (atual === resolvido) return false;
    if (atual && atual !== "Produto removido" && atual !== "Produto não identificado") return false;
    registro[destino] = resolvido;
    return true;
  }

  function repararSnapshotsProdutos() {
    let mudou = false;
    const repararItens = function (itens) {
      (itens || []).forEach(function (item) {
        if (normalizarSnapshotProduto(item, "nome")) mudou = true;
        (item.alocacoesEstoque || []).forEach(function (alocacao) {
          if (normalizarSnapshotProduto(alocacao, "nome")) mudou = true;
        });
      });
    };
    vendas.forEach(function (venda) {
      if (normalizarSnapshotProduto(venda, "produto")) mudou = true;
      repararItens(venda.itensCombo);
      repararItens(venda.alocacoesEstoque);
    });
    vendasPendentes.forEach(function (venda) {
      if (normalizarSnapshotProduto(venda, "produto")) mudou = true;
      repararItens(venda.itensCombo);
      repararItens(venda.alocacoesEstoque);
    });
    abastecimentos.forEach(function (abastecimento) {
      if (abastecimento.consumoProduto && normalizarSnapshotProduto(abastecimento.consumoProduto, "nome")) mudou = true;
      repararItens(abastecimento.consumoProdutos);
    });
    return mudou;
  }
  function componentesCombo(combo, quantidade) {
    return (combo.itensCombo || []).map(function (item) {
      return { produto: produtoPorId(item.produtoId), quantidade: (Number(item.quantidade) || 1) * quantidade };
    });
  }
  // Variação com preço R$ 0,00 é de uso interno: fica no estoque, nunca é vendida.
  function usoInterno(p) { return ehSku(p) && Number(p.valor) === 0; }
  function vendavel(p) { return skuDisponivel(p) && !usoInterno(p); }
  function skuDisponivel(sku) {
    if (!sku || sku.ativo === false) return false;
    if (comboConfiguravel(sku)) return sku.gruposCombo.every(function (grupo) {
      return (grupo.skuIds || []).map(produtoPorId).filter(function (produto) { return produto && estoqueInformado(produto) && estoqueLivre(produto) > 0; }).length >= grupo.quantidade;
    });
    if (sku.tipo === "combo") return componentesCombo(sku, 1).every(function (item) { return item.produto && estoqueInformado(item.produto) && estoqueLivre(item.produto) >= item.quantidade; });
    return ehSku(sku) && (!estoqueInformado(sku) || estoqueLivre(sku) > 0);
  }

  // Pendente sem baixa reserva as unidades: o estoque só baixa na confirmação do
  // pagamento, mas a mesma unidade não pode ir para outra venda enquanto isso.
  // Na própria confirmação, a reserva da pendente não conta contra ela mesma.
  let reservasIgnoradas = [];
  function reservasDoEstoque() {
    const reservas = {};
    const somar = function (id, quantidade) { if (id) reservas[id] = (reservas[id] || 0) + (Number(quantidade) || 0); };
    vendasPendentes.forEach(function (vp) {
      if (!vp || vp.estoqueBaixado || reservasIgnoradas.includes(vp.id)) return;
      if (Array.isArray(vp.alocacoesEstoque) && vp.alocacoesEstoque.length) {
        vp.alocacoesEstoque.forEach(function (alocacao) { somar(alocacao.produtoId, alocacao.quantidade); });
        return;
      }
      const produto = produtoPorId(vp.produtoId);
      if (!produto) return;
      if (produto.tipo === "combo") componentesCombo(produto, Number(vp.quantidade) || 0).forEach(function (item) { if (item.produto) somar(item.produto.id, item.quantidade); });
      else somar(produto.id, vp.quantidade);
    });
    return reservas;
  }
  function estoqueReservado(produto) {
    return produto ? reservasDoEstoque()[produto.id] || 0 : 0;
  }
  function estoqueLivre(produto) {
    return (Number(produto.estoque) || 0) - estoqueReservado(produto);
  }

  function estoqueInformado(p) {
    return !!p && typeof p.estoque === "number";
  }

  function migrarProdutosEstoque() {
    let mudou = false;
    const migrados = [];
    produtos.forEach(function (p) {
      const nome = p.nome == null ? "" : String(p.nome);
      if (p.nome !== nome) { p.nome = nome; mudou = true; }
      if (!p.id) { p.id = gerarId("p"); mudou = true; }
      if (p.estoque === undefined) { p.estoque = null; mudou = true; }
      if (p.estoqueMinimo === undefined) { p.estoqueMinimo = 5; mudou = true; }
      if (!p.tipo) {
        const pai = { id: gerarId("pp"), tipo: "pai", nome: p.nome, categoria: p.categoria || "Sem categoria", ativo: true, criadoEm: p.criadoEm || new Date().toISOString() };
        p.tipo = "sku";
        p.produtoPaiId = pai.id;
        p.variante = "Padrão";
        p.ativo = true;
        migrados.push(pai);
        mudou = true;
      } else if (p.tipo === "sku") {
        if (!p.variante) { p.variante = "Padrão"; mudou = true; }
        if (p.ativo === undefined) { p.ativo = true; mudou = true; }
      }
    });
    if (migrados.length) produtos.push.apply(produtos, migrados);
    if (mudou) salvar(KEY_PRODUTOS, produtos);
  }

  function migrarAbastecimentosSync() {
    let mudou = false;
    abastecimentos.forEach(function (a) {
      if (a.kwh === undefined && a.kwhUtilizado != null) { a.kwh = a.kwhUtilizado; mudou = true; }
      if (a.kwhUtilizado === undefined && a.kwh != null) { a.kwhUtilizado = a.kwh; mudou = true; }
      if (a.inicio === undefined && a.inicioRecarga) { a.inicio = a.inicioRecarga; mudou = true; }
      if (a.duracaoSegundos === undefined && a.duracaoRecarga != null) {
        a.duracaoSegundos = Number(a.duracaoRecarga) || 0;
        mudou = true;
      }
      if (a.bico === undefined) { a.bico = null; mudou = true; }
      if (a.consumoQuantidade === undefined) {
        a.consumoQuantidade = (a.consumoConveniencia === "Sim" && a.consumoProduto && a.consumoProduto.quantidade != null) ? a.consumoProduto.quantidade : 0;
        mudou = true;
      }
      if (a.consumoValorTotal === undefined) {
        a.consumoValorTotal = a.consumoConveniencia === "Sim" ? (a.valorConsumo != null ? a.valorConsumo : null) : null;
        mudou = true;
      }
      if (!Array.isArray(a.consumoProdutos)) {
        a.consumoProdutos = a.consumoProduto ? [a.consumoProduto] : [];
        mudou = true;
      }
      if (!Array.isArray(a.kwhPartes)) {
        a.kwhPartes = a.kwhUtilizado != null ? [a.kwhUtilizado] : [];
        mudou = true;
      }
      if (a.pendenteFin === undefined) { a.pendenteFin = a.metodoPagamento === "Pendente" ? true : false; mudou = true; }
      if (a.operador === undefined) {
        a.operador = a.perfil ? { id: a.perfil.id || "", nome: a.perfil.nome || "" } : null;
        mudou = true;
      }
      if (a.perfil === undefined && a.operador) {
        a.perfil = { id: a.operador.id || "", nome: a.operador.nome || "" };
        mudou = true;
      }
    });
    if (mudou) salvar(KEY_ABASTECIMENTOS, abastecimentos);
  }

  function migrarIdsSync() {
    let mudou = false;
    clientes.forEach(function (c) { if (!c.id) { c.id = gerarId("c"); mudou = true; } });
    modelos.forEach(function (m) { if (!m.id) { m.id = gerarId("m"); mudou = true; } });
    if (mudou) {
      salvar(KEY_CLIENTES, clientes);
      salvar(KEY_MODELOS, modelos);
    }
  }

  function migrarModelosIniciais() {
    if (modelos.length > 0) return;
    const vistos = new Set();
    clientes.forEach(function (c) {
      const key = (c.modelo || "").trim().toLowerCase();
      if (key && !vistos.has(key)) {
        vistos.add(key);
        modelos.push({
          modelo: c.modelo.trim(),
          marca: "",
          potenciaMaxKwh: 60,
          mediaKwh: 50,
          capacidadeBateria: 60,
          criadoEm: new Date().toISOString()
        });
      }
    });
    if (modelos.length > 0) {
      salvar(KEY_MODELOS, modelos);
    }
  }
  migrarModelosIniciais();

  let caixa = { cedulas: 0, moedas: 0, historico: [] };
  try {
    const v = JSON.parse(localStorage.getItem(KEY_CAIXA));
    if (v && typeof v === "object" && Array.isArray(v.historico)) caixa = v;
  } catch (e) {}

  function removerFotosBase64(valor) {
    if (Array.isArray(valor)) return valor.map(removerFotosBase64);
    if (!valor || typeof valor !== "object") return valor;
    const limpo = {};
    Object.keys(valor).forEach(function (chave) {
      const item = valor[chave];
      if (chave === "foto" && typeof item === "string" && item.startsWith("data:image/")) return;
      limpo[chave] = removerFotosBase64(item);
    });
    return limpo;
  }

  // Registros antigos traziam uma cópia da foto do operador; a foto mostrada vem do perfil.
  // Sem elas, o aparelho guarda bem menos.
  function removerFotosDosRegistros() {
    const listas = [
      [KEY_ABASTECIMENTOS, abastecimentos],
      [KEY_VENDAS, vendas],
      [KEY_VENDAS_PENDENTES, vendasPendentes],
      [KEY_SESSOES, sessoes],
      [KEY_MOVIMENTOS_ESTOQUE, movimentosEstoque]
    ];
    const temFoto = function (registro) { return JSON.stringify(registro).indexOf('"foto":"data:image/') >= 0; };
    listas.forEach(function (par) {
      const lista = par[1];
      let mudou = false;
      for (let i = 0; i < lista.length; i++) {
        if (lista[i] && temFoto(lista[i])) { lista[i] = removerFotosBase64(lista[i]); mudou = true; }
      }
      if (mudou) salvar(par[0], lista);
    });
    let caixaMudou = false;
    caixa.historico = caixa.historico.map(function (mov) {
      if (!mov || !temFoto(mov)) return mov;
      caixaMudou = true;
      return removerFotosBase64(mov);
    });
    if (caixaMudou) salvar(KEY_CAIXA, caixa);
  }
  removerFotosDosRegistros();

  /* O caixa é a lista de movimentos; cédulas e moedas são sempre a soma deles.
     O total é sempre a soma dos movimentos. */
  function recalcularCaixa() {
    const saldo = saldoDoCaixa(caixa.historico);
    caixa.cedulas = saldo.cedulas;
    caixa.moedas = saldo.moedas;
  }

  // Na conversão, a diferença entre o total antigo e a soma dos movimentos vira um saldo
  // inicial com ids fixos, criados uma única vez.
  function garantirSaldoInicial(totais) {
    if (caixa.historico.some(function (mov) { return mov && mov.saldoInicial; })) return false;
    const soma = saldoDoCaixa(caixa.historico);
    const diferencas = [["cedulas", "Cédulas", arred((Number(totais.cedulas) || 0) - soma.cedulas)], ["moedas", "Moedas", arred((Number(totais.moedas) || 0) - soma.moedas)]];
    const datas = caixa.historico.map(function (mov) { return new Date(mov.data).getTime(); }).filter(function (t) { return !isNaN(t); });
    const quando = new Date(datas.length ? Math.min.apply(null, datas) - 60000 : Date.now());
    let criou = false;
    diferencas.forEach(function (d) {
      if (Math.abs(d[2]) < 0.009) return;
      const turno = getDadosTurnoAtual(quando);
      caixa.historico.push({ id: "saldo-inicial-" + d[0], data: quando.toISOString(), turno: turno.turnoId, dataOperacional: turno.dataOperacional, tipo: d[2] > 0 ? "entrada" : "saida", origem: d[1], descricao: "Saldo inicial", operador: null, valor: Math.abs(d[2]), saldoInicial: true });
      criou = true;
    });
    return criou;
  }

  if (!caixa.porMovimentos) {
    garantirSaldoInicial(caixa);
    caixa.porMovimentos = true;
    recalcularCaixa();
    salvar(KEY_CAIXA, caixa);
  } else {
    recalcularCaixa();
  }

  function valorNumerario(id) {
    const el = $(id);
    return el ? Math.max(0, moedaDaMascara(el.value)) : 0;
  }

  // Máscara R$ em todo campo .currency-input, inclusive os criados depois do boot.
  // Na fase de captura, para que os cálculos de cada campo já leiam o valor mascarado.
  document.addEventListener("input", function (e) {
    const campo = e.target;
    if (!campo.classList || !campo.classList.contains("currency-input")) return;
    campo.value = mascararMoeda(campo.value);
    campo.setSelectionRange(campo.value.length, campo.value.length);
  }, true);

  function moedaParaCampo(n) {
    return mascararMoeda(Math.round((Number(n) || 0) * 100));
  }

  /* ----- Dinheiro: cobrar até R$ 1,99 a mais ou a menos ----- */
  const ARREDONDAMENTO_MAXIMO = 1.99;
  const PREFIXOS_ARREDONDAMENTO = ["fin", "pag", "venda", "pend"];
  const arredondamentoDinheiro = {};
  const NOTAS_TROCO = [200, 100, 50, 20, 10, 5, 2];

  function alvoDinheiro(prefixo, total) {
    if (!PREFIXOS_ARREDONDAMENTO.includes(prefixo)) return total;
    const modo = (arredondamentoDinheiro[prefixo] || {}).modo || "exato";
    if (modo === "baixo") return Math.floor(total + 1e-9);
    if (modo === "cima") return Math.ceil(total - 1e-9);
    if (modo === "outro") {
      const campo = $(prefixo + "-cobrado-outro");
      const valor = campo ? moedaDaMascara(campo.value) : 0;
      return valor > 0 ? arred(valor) : total;
    }
    return total;
  }

  // Troco em branco: o valor certo, em notas quando der e o resto em moedas,
  // sem passar do que existe no caixa somado ao que o cliente entregou.
  function separarTroco(valor, cedulasDisponiveis, moedasDisponiveis) {
    let resto = arred(valor);
    let cedulas = 0;
    NOTAS_TROCO.forEach(function (nota) {
      while (resto + 1e-9 >= nota && cedulas + nota <= cedulasDisponiveis + 1e-9) {
        resto = arred(resto - nota);
        cedulas += nota;
      }
    });
    if (resto > moedasDisponiveis + 0.009) return { erro: "Não há moedas no caixa para o troco de " + fmtMoeda(valor) + ". Use um arredondamento ou informe o troco." };
    return { cedulas: arred(cedulas), moedas: arred(resto) };
  }

  function atualizarNumerario(prefixo, total) {
    const recebido = valorNumerario(prefixo + "-cedulas-recebidas") + valorNumerario(prefixo + "-moedas-recebidas");
    const troco = Math.max(0, recebido - alvoDinheiro(prefixo, total));
    const entregue = $(prefixo + "-valor-entregue");
    const trocoEl = $(prefixo + "-troco");
    if (entregue) entregue.value = recebido.toFixed(2);
    if (trocoEl) trocoEl.value = fmtMoeda(troco);
  }

  // Troco em Pix: o dinheiro entregue fica inteiro no caixa e a diferença volta ao cliente por Pix.
  // Nas edições, trocoPixEdicao guarda o Pix já enviado no registro aberto.
  const trocoPixEdicao = {};

  function trocoPixAtivo(prefixo) {
    const sw = $(prefixo + "-troco-pix");
    return !!sw && sw.getAttribute("aria-checked") === "true";
  }

  function obterNumerario(prefixo, total) {
    let cedulasRecebidas = valorNumerario(prefixo + "-cedulas-recebidas");
    let moedasRecebidas = valorNumerario(prefixo + "-moedas-recebidas");
    let cedulasTroco = valorNumerario(prefixo + "-cedulas-troco");
    let moedasTroco = valorNumerario(prefixo + "-moedas-troco");
    let recebido = arred(cedulasRecebidas + moedasRecebidas);
    const arredondavel = PREFIXOS_ARREDONDAMENTO.includes(prefixo);
    const pixMarcado = arredondavel && trocoPixAtivo(prefixo);
    let trocoPix = arredondavel ? 0 : arred(Number(trocoPixEdicao[prefixo]) || 0);
    if ((prefixo === "edit" || prefixo === "editv") && recebido === 0 && total > 0) {
      cedulasRecebidas = arred(total + trocoPix);
      moedasRecebidas = 0;
      cedulasTroco = 0;
      moedasTroco = 0;
      recebido = cedulasRecebidas;
    }
    const alvo = arred(alvoDinheiro(prefixo, total));
    if (arredondavel) {
      if (recebido < alvo - 0.009) return { erro: "O valor recebido (" + fmtMoeda(recebido) + ") é menor que o valor cobrado (" + fmtMoeda(alvo) + ")." };
      const trocoInformado = [prefixo + "-cedulas-troco", prefixo + "-moedas-troco"].some(function (id) { return $(id) && $(id).value.trim() !== ""; });
      if (pixMarcado) {
        cedulasTroco = 0;
        moedasTroco = 0;
        trocoPix = arred(Math.max(0, recebido - alvo));
      } else if (!trocoInformado && recebido > alvo + 0.009) {
        const automatico = separarTroco(recebido - alvo, cedulasRecebidas + (Number(caixa.cedulas) || 0), moedasRecebidas + (Number(caixa.moedas) || 0));
        if (automatico.erro) return { erro: automatico.erro };
        cedulasTroco = automatico.cedulas;
        moedasTroco = automatico.moedas;
      }
    }
    const troco = arred(cedulasTroco + moedasTroco + trocoPix);
    const trocoCorreto = arred(Math.max(0, recebido - (arredondavel ? alvo : total)));
    const diferencaTroco = arred(trocoCorreto - troco);
    const valorCobrado = arred(recebido - troco);
    if (arredondavel) {
      const diferenca = arred(valorCobrado - total);
      if (Math.abs(diferenca) > ARREDONDAMENTO_MAXIMO + 0.009) {
        return { erro: "Diferença de " + fmtMoeda(Math.abs(diferenca)) + (diferenca > 0 ? " a mais" : " a menos") + ", acima de " + fmtMoeda(ARREDONDAMENTO_MAXIMO) + ". Ajuste o valor ou registre como Pendente." };
      }
    } else {
      if (recebido < total - 0.009) return { erro: "O valor recebido em dinheiro é menor que o total a pagar." };
      if (recebido - troco < total - 0.009) return { erro: "O troco informado deixa o valor recebido menor que o total a pagar." };
      if (valorCobrado > total + 0.009) return { erro: "Informe o troco ideal para não cobrar acima do valor devido." };
    }
    if (troco > recebido + 0.009) return { erro: "O troco informado é maior que o valor recebido." };
    if (cedulasTroco > cedulasRecebidas + (Number(caixa.cedulas) || 0) + 0.009 || moedasTroco > moedasRecebidas + (Number(caixa.moedas) || 0) + 0.009) {
      return { erro: "Não há cédulas ou moedas suficientes no caixa para este troco." };
    }
    return { cedulasRecebidas: cedulasRecebidas, moedasRecebidas: moedasRecebidas, cedulasTroco: cedulasTroco, moedasTroco: moedasTroco, trocoPix: trocoPix, recebido: recebido, troco: troco, trocoCorreto: trocoCorreto, ajusteTroco: 0, excedente: diferencaTroco, valorCobrado: valorCobrado, arredondamento: arredondavel ? arred(valorCobrado - total) : 0 };
  }

  function atualizarOrigemCaixaAbastecimento(idAbastecimento, placa) {
    let mudou = false;
    caixa.historico.forEach(function (mov) {
      if (mov.automatico && mov.referencia && mov.referencia.tipo === "abastecimento" && mov.referencia.id === idAbastecimento) {
        mov.origem = "Abastecimento " + placa;
        mudou = true;
      }
    });
    if (mudou) salvarESyncIncremental(KEY_CAIXA, caixa);
  }

  function registrarNumerarioCaixa(referencia, origem, numerario, turno, operador, data) {
    const quando = data || new Date().toISOString();
    const entrada = arred(numerario.cedulasRecebidas + numerario.moedasRecebidas);
    const saida = arred(numerario.cedulasTroco + numerario.moedasTroco);
    caixa.cedulas = arred((Number(caixa.cedulas) || 0) + numerario.cedulasRecebidas - numerario.cedulasTroco);
    caixa.moedas = arred((Number(caixa.moedas) || 0) + numerario.moedasRecebidas - numerario.moedasTroco);
    const descricao = numerario.ajusteTroco > 0 ? "Recebimento em dinheiro (ajuste de troco de " + fmtMoeda(numerario.ajusteTroco) + ")" : (numerario.excedente > 0 ? "Recebimento em dinheiro (inclui excedente de " + fmtMoeda(numerario.excedente) + ")" : "Recebimento em dinheiro");
    if (entrada > 0) caixa.historico.push({ id: gerarId("cx"), data: quando, turno: turno || 1, dataOperacional: getDadosTurnoAtual(new Date(quando)).dataOperacional, tipo: "entrada", origem: origem, descricao: descricao, cedulas: numerario.cedulasRecebidas, moedas: numerario.moedasRecebidas, valor: entrada, operador: operador || null, referencia: referencia, automatico: true });
    if (saida > 0) caixa.historico.push({ id: gerarId("cx"), data: quando, turno: turno || 1, dataOperacional: getDadosTurnoAtual(new Date(quando)).dataOperacional, tipo: "saida", origem: origem, descricao: "Troco ao cliente", cedulas: numerario.cedulasTroco, moedas: numerario.moedasTroco, valor: saida, operador: operador || null, referencia: referencia, automatico: true });
    // Só informa: o Pix não passa pela gaveta, então não mexe em cédulas nem moedas.
    if (numerario.trocoPix > 0) caixa.historico.push({ id: gerarId("cx"), data: quando, turno: turno || 1, dataOperacional: getDadosTurnoAtual(new Date(quando)).dataOperacional, tipo: "trocoPix", origem: origem, descricao: "Troco em Pix ao cliente", cedulas: 0, moedas: 0, valor: arred(numerario.trocoPix), operador: operador || null, referencia: referencia, automatico: true });
    salvarESyncIncremental(KEY_CAIXA, caixa);
  }

  function estornarNumerarioCaixa(referencia) {
    const removidos = caixa.historico.filter(function (mov) {
      return mov.automatico && mov.referencia && mov.referencia.tipo === referencia.tipo && mov.referencia.id === referencia.id;
    });
    if (!removidos.length) return;
    removidos.forEach(function (mov) {
      const fator = mov.tipo === "entrada" ? -1 : 1;
      caixa.cedulas = arred((Number(caixa.cedulas) || 0) + fator * (Number(mov.cedulas) || 0));
      caixa.moedas = arred((Number(caixa.moedas) || 0) + fator * (Number(mov.moedas) || 0));
    });
    caixa.historico = caixa.historico.filter(function (mov) { return !removidos.includes(mov); });
    salvarESyncIncremental(KEY_CAIXA, caixa);
  }
  if (!Array.isArray(perfis)) perfis = [];
  let perfilAtivoId = "";
  try {
    const v = JSON.parse(localStorage.getItem(KEY_PERFIL_ATIVO));
    if (typeof v === "string") perfilAtivoId = v;
  } catch (e) {}

  window.addEventListener("error", function (ev) {
    try {
      const el = $("alert-box");
      if (el) {
        el.textContent = "Erro inesperado: " + (ev.message || "desconhecido");
        el.className = "alert error show";
      }
    } catch (e) {}
  });

  function carregarConfig() {
    try {
      const dados = JSON.parse(localStorage.getItem(KEY_CONFIG));
      if (dados && typeof dados === "object") {
        return Object.assign({}, CONFIG_PADRAO, dados);
      }
    } catch (e) {}
    return Object.assign({}, CONFIG_PADRAO);
  }
  let config = carregarConfig();

  function normalizarConfig() {
    const configuracaoAntiga = Array.isArray(config.carregadores) && config.carregadores.some(function (c) {
      return c && c.numBicos !== undefined;
    });
    if (configuracaoAntiga) {
      config.carregadores = config.carregadores.flatMap(function (c) {
        const quantidade = Math.max(1, Number(c.numBicos) || 1);
        const potencia = Number(c.potenciaKw) || 60;
        return Array.from({ length: quantidade }, function () { return { potenciaKw: potencia }; });
      });
      salvar(KEY_CONFIG, config);
    }
    const valido = Array.isArray(config.carregadores) && config.carregadores.length > 0 &&
      config.carregadores.every(function (c) { return c && Number(c.potenciaKw) > 0; });
    if (!valido) config.carregadores = CONFIG_PADRAO.carregadores.map(function (c) { return { potenciaKw: c.potenciaKw }; });
    if (!Array.isArray(config.turnos) || validarTurnos(config.turnos)) config.turnos = TURNOS_PADRAO.map(function (t) { return Object.assign({}, t); });
    definirTurnos(config.turnos);
  }
  normalizarConfig();

  function totalConectores() {
    return (config.carregadores || []).length;
  }

  function potenciaDoBico(bico) {
    const b = (config.carregadores || [])[Number(bico) - 1];
    return b ? Number(b.potenciaKw) || 0 : 0;
  }

  function detalhesPagamentoComIds(linhas) {
    return linhas.map(function (linha) {
      return { idParcela: linha.idParcela || gerarId("parc"), metodo: linha.metodo, valor: linha.valor };
    });
  }

  function renderTudo() {
    renderClientes();
    popularSelectPlacas();
    renderModelos();
    popularSelectModelos();
    popularSelectModelosEdit("");
    renderSessoes();
    renderPendentes();
    renderStatusBicos();
    renderProdutos();
    popularSelectProdutos();
    renderVendas();
    renderVendasPendentes();
    renderInventario();
    renderPerfis();
    popularSelectPerfilAtivo();
    popularSelectFiltroPerfil();
    renderHistorico();
    renderCaixa();
    atualizarPreviewWhatsApp();
  }

  (function migrarSessoes() {
    let alterado = false;
    const ocupados = {};
    sessoes.forEach(function (s) {
      if (!s.tempoEstimadoMin) { s.tempoEstimadoMin = 60; alterado = true; }
      if (s.status !== "aguardando" && s.status !== "carregando" && s.status !== "vaga-liberada") { s.status = "aguardando"; alterado = true; }
      if (s.status === "carregando" || s.status === "vaga-liberada") {
        if (!s.bico) {
          let b = 1;
          while (ocupados[b]) b++;
          s.bico = b;
          alterado = true;
        }
        ocupados[s.bico] = true;
      } else {
        s.bico = null;
      }
      if (!s.criadoEm) s.criadoEm = s.inicio;
    });
    if (alterado) salvar(KEY_SESSOES, sessoes);
  })();

  let alertaTimer = null;

  function mostrarAlerta(mensagem, tipo, persistir) {
    const el = $("alert-box");
    el.textContent = mensagem;
    el.className = "alert " + (tipo || "success") + " show";
    clearTimeout(alertaTimer);
    if (!persistir) {
      alertaTimer = setTimeout(() => { el.className = "alert"; }, 4000);
    }
  }

  /* ---------------- Tema claro/escuro ---------------- */
  let tema = localStorage.getItem(KEY_TEMA) ||
    (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  try { tema = JSON.parse(tema); } catch (e) {}
  if (tema !== "dark" && tema !== "light") tema = "light";

  function aplicarAparencia() {
    const cor = config.corPrimaria || "";
    const corSecundaria = config.corSecundaria || "";
    if (cor && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cor)) {
      const escuro = tema === "dark";
      document.body.style.setProperty("--primary", cor);
      document.body.style.setProperty("--primary-dark", escuro ? clarearHex(cor, 0.2) : escurecerHex(cor, 0.25));
      // A cor secundária é pensada para fundo claro; no tema escuro usamos uma variação escura da principal.
      document.body.style.setProperty("--primary-light", escuro ? escurecerHex(cor, 0.75) : (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(corSecundaria) ? corSecundaria : clarearHex(cor, 0.9)));
      // Superfícies com texto branco usam uma variação com contraste WCAG AA; a cor padrão mantém a paleta do CSS.
      if (cor.toLowerCase() === "#f97316") {
        document.body.style.removeProperty("--primary-strong");
        document.body.style.removeProperty("--primary-strong-hover");
      } else {
        const forte = corComContrasteBranco(cor);
        document.body.style.setProperty("--primary-strong", forte);
        document.body.style.setProperty("--primary-strong-hover", escurecerHex(forte, 0.15));
      }
    } else {
      ["--primary", "--primary-dark", "--primary-light", "--primary-strong", "--primary-strong-hover"].forEach(function (prop) {
        document.body.style.removeProperty(prop);
      });
    }
    const metaTema = document.querySelector('meta[name="theme-color"]');
    if (metaTema) metaTema.content = cor || "#f97316";
  }

  function nomePosto() {
    return String(config.nomeSistema || "").trim() || NOME_PADRAO;
  }

  function aplicarMarca() {
    const nome = nomePosto();
    const logo = config.logoSistema || LOGO_PADRAO;
    document.title = nome + " · Operação";
    const favicon = $("site-favicon");
    const appleTouchIcon = $("apple-touch-icon");
    document.querySelectorAll("[data-brand-name]").forEach(function (el) { el.textContent = nome; });
    document.querySelectorAll("[data-brand-logo]").forEach(function (el) {
      el.src = logo;
      if (el.alt) el.alt = nome;
    });
    if (favicon) favicon.href = logo;
    if (appleTouchIcon) appleTouchIcon.href = logo;
  }

  function aplicarTema() {
    document.body.classList.toggle("dark", tema === "dark");
    const proximoTema = tema === "dark" ? "Usar tema claro" : "Usar tema escuro";
    const icone = tema === "dark"
      ? '<svg aria-hidden="true"><use href="#i-sun"/></svg>'
      : '<svg aria-hidden="true"><use href="#i-moon"/></svg>';
    document.querySelectorAll("[data-theme-toggle], #btn-tema").forEach(function (botaoTema) {
      botaoTema.innerHTML = icone;
      botaoTema.title = proximoTema;
      botaoTema.setAttribute("aria-label", proximoTema);
    });
    aplicarAparencia();
  }

  document.querySelectorAll("[data-theme-toggle], #btn-tema").forEach(function (botaoTema) {
    botaoTema.addEventListener("click", function () {
    tema = tema === "dark" ? "light" : "dark";
    localStorage.setItem(KEY_TEMA, tema);
    aplicarTema();
    });
  });

  /* ---------------- Abas ---------------- */
  const tabBtns = document.querySelectorAll(".tab-btn");
  const rotasAbas = {
    dashboard: "tab-dashboard",
    analise: "tab-analise",
    operation: "tab-andamento",
    register: "tab-cadastro",
    sales: "tab-vendas",
    history: "tab-historico",
    cash: "tab-caixa",
    config: "tab-config"
  };
  const abasRotas = Object.fromEntries(Object.entries(rotasAbas).map(function (entry) { return [entry[1], entry[0]]; }));

  function ehAdmin() {
    return modoApp === "admin";
  }

  function definirModo(modo) {
    modoApp = modo === "admin" ? "admin" : "operador";
    localStorage.setItem(KEY_MODO, modoApp);
    document.querySelectorAll("[data-modo-app]").forEach(function (botao) {
      const ativo = botao.dataset.modoApp === modoApp;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    });
    document.body.dataset.modo = modoApp;
  }

  function abaPermitida(id) {
    const permitidas = ehAdmin()
      ? ["tab-dashboard", "tab-analise", "tab-cadastro", "tab-caixa", "tab-config"]
      : ["tab-andamento", "tab-vendas", "tab-historico", "tab-caixa"];
    return permitidas.includes(id);
  }

  function exigirAdmin() {
    if (ehAdmin()) return true;
    mostrarAlerta("Esta ação é exclusiva de administradores.", "error");
    return false;
  }

  function aplicarPermissoes() {
    tabBtns.forEach(function (btn) {
      const visivel = abaPermitida(btn.dataset.tab);
      btn.hidden = !visivel;
      btn.classList.toggle("menu-item-hidden", !visivel);
      btn.setAttribute("aria-hidden", String(!visivel));
      btn.tabIndex = visivel ? 0 : -1;
    });
    document.querySelectorAll("[data-admin-caixa]").forEach(function (el) { el.hidden = !ehAdmin(); });
    const modalOperador = $("modal-perfil-turno-obrigatorio");
    if (ehAdmin() && modalOperador) modalOperador.classList.remove("show");
    const ativa = document.querySelector(".tab-panel.active");
    if (ativa && !abaPermitida(ativa.id)) irParaAba(ehAdmin() ? "tab-dashboard" : "tab-andamento", true);
  }

  tabBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      irParaAba(btn.dataset.tab, true);
    });
  });

  function irParaAba(id, atualizarUrl) {
    if (!$(id)) return;
    if (!abaPermitida(id)) {
      mostrarAlerta("Você não tem permissão para acessar esta aba.", "error");
      return;
    }
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === id));
    if (id === "tab-andamento") { renderSessoes(); renderPendentes(); renderStatusBicos(); atualizarModoFormulario(); renderVendasPendentes(); }
    if (id === "tab-historico") renderHistorico();
    if (id === "tab-caixa") renderCaixa();
    if (id === "tab-cadastro") { renderClientes(); renderProdutos(); }
    if (id === "tab-vendas") renderVendas();
    if (id === "tab-dashboard") renderDashboard();
    // A aba Análise é montada por analise-entrada.js (módulo), que pode carregar depois deste script.
    if (id === "tab-analise" && window.eletropostoAnalise) window.eletropostoAnalise.mostrar();
    if (id === "tab-config") atualizarResumoConfig();
    if (atualizarUrl && abasRotas[id]) history.replaceState(null, "", "#" + abasRotas[id]);
    if (atualizarUrl && document.documentElement.scrollTop) window.scrollTo(0, 0);
  }

  function aplicarRotaUrl() {
    // A Análise tem subtelas no hash (#analise/concorrencia?estacao=...): a aba é o trecho antes de / ou ?.
    const rota = window.location.hash.slice(1).split(/[/?]/)[0];
    if (rotasAbas[rota]) irParaAba(rotasAbas[rota], false);
  }
  // Uma instância antiga do app (substituída na mesma página) não reage à rota.
  window.addEventListener("hashchange", function () { if (window.__eletropostoInstanciaAtual === instanciaApp) aplicarRotaUrl(); });

  // Salva no aparelho. O Caixa recalcula o total a partir dos movimentos.
  function salvarESyncIncremental(key, lista) {
    if (key === KEY_CAIXA) recalcularCaixa();
    salvar(key, lista);
  }

  /* ---------------- ABA 1: Clientes ---------------- */
  function formatarPlaca(input) {
    let v = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
    if (v.length > 3) {
      v = v.slice(0, 3) + "-" + v.slice(3);
    }
    input.value = v;
  }

  const placaInput = $("placa");
  placaInput.addEventListener("input", function () { formatarPlaca(this); });

  function placaNormalizada(placa) {
    return placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  $("form-cliente").addEventListener("submit", function (e) {
    e.preventDefault();
    const placa = placaInput.value.trim();
    const nome = $("nome-cliente").value.trim();
    const modelo = getModeloCliente();
    const placaNorm = placaNormalizada(placa);

    if (placaNorm.length !== 7) {
      mostrarAlerta("Placa inválida. Use o formato Mercosul (ex: ABC1D23).", "error");
      return;
    }
    if (!modelo) {
      mostrarAlerta("Selecione ou informe o modelo do carro.", "error");
      return;
    }
    if (clientes.some((c) => placaNormalizada(c.placa) === placaNorm)) {
      mostrarAlerta("Já existe um carro cadastrado com a placa " + placa + ".", "error");
      return;
    }

    clientes.push({ placa, nome, modelo, criadoEm: new Date().toISOString() });
    salvarESyncIncremental(KEY_CLIENTES, clientes, "clientes");
    renderClientes();
    popularSelectPlacas();
    this.reset();
    placaInput.value = "";
    if (modeloOutroInput) modeloOutroInput.style.display = "none";
    fecharFormCadastro("form-cliente");
    mostrarAlerta("Cliente " + nome + " cadastrado com sucesso!", "success");
  });

  let editandoClienteIdx = null;

  $("editc-placa").addEventListener("input", function () { formatarPlaca(this); });

  function fecharEdicaoCliente() {
    $("modal-cliente-edicao").classList.remove("show");
    editandoClienteIdx = null;
    const sel = $("editc-modelo");
    if (sel) sel.value = "";
    if (editModeloOutroInput) editModeloOutroInput.style.display = "none";
  }

  $("modal-fechar-cliente").addEventListener("click", fecharEdicaoCliente);
  $("btn-cancelar-cliente-edicao").addEventListener("click", fecharEdicaoCliente);
  $("modal-cliente-edicao").addEventListener("click", function (e) {
    if (e.target === this) fecharEdicaoCliente();
  });

  $("form-cliente-edicao").addEventListener("submit", function (e) {
    e.preventDefault();
    const idx = editandoClienteIdx;
    if (idx == null || !clientes[idx]) {
      fecharEdicaoCliente();
      return;
    }
    const placa = $("editc-placa").value.trim();
    const nome = $("editc-nome").value.trim();
    const modelo = getModeloClienteEdit();
    const placaNorm = placaNormalizada(placa);

    if (placaNorm.length !== 7) {
      mostrarAlerta("Placa inválida. Use o formato Mercosul (ex: ABC1D23).", "error");
      return;
    }
    if (!modelo) {
      mostrarAlerta("Selecione ou informe o modelo do carro.", "error");
      return;
    }
    if (clientes.some((c, i) => i !== idx && placaNormalizada(c.placa) === placaNorm)) {
      mostrarAlerta("Já existe um carro cadastrado com a placa " + placa + ".", "error");
      return;
    }

    const anterior = clientes[idx];
    const normAnterior = placaNormalizada(anterior.placa);
    const placaFinal = placa.toUpperCase();
    clientes[idx] = { id: anterior.id || gerarId("c"), placa: placaFinal, nome: nome, modelo: modelo, criadoEm: anterior.criadoEm || new Date().toISOString() };

    abastecimentos.forEach(function (r) {
      const norm = placaNormalizada(r.placa);
      if (norm === normAnterior || norm === placaNorm) {
        r.placa = placaFinal;
        r.cliente = nome;
        r.modelo = modelo;
      }
    });
    sessoes.forEach(function (s) {
      const norm = placaNormalizada(s.placa);
      if (norm === normAnterior || norm === placaNorm) {
        s.placa = placaFinal;
        s.cliente = nome;
        s.modelo = modelo;
      }
    });
    vendasPendentes.forEach(function (v) {
      const norm = placaNormalizada(v.placa || "");
      if (norm === normAnterior || norm === placaNorm) {
        v.placa = placaFinal;
        v.cliente = nome;
      }
    });
    abastecimentos.forEach(function (r) { atualizarOrigemCaixaAbastecimento(r.id, r.placa); });

    salvarESyncIncremental(KEY_CLIENTES, clientes, "clientes");
    salvarESyncIncremental(KEY_ABASTECIMENTOS, abastecimentos);
    salvarESyncIncremental(KEY_SESSOES, sessoes);
    salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
    fecharEdicaoCliente();
    renderClientes();
    popularSelectPlacas();
    renderSessoes();
    renderHistorico();
    mostrarAlerta("Cadastro da placa " + placaFinal + " atualizado com sucesso!", "success");
  });

  /* --- Modelo select na edição de cliente: opção "Outro" --- */
  const editModeloSelect = $("editc-modelo");
  let editModeloOutroInput = null;
  if (editModeloSelect) {
    editModeloSelect.addEventListener("change", function () {
      const wrapper = this.closest(".field");
      if (this.value === "__outro__") {
        if (!editModeloOutroInput) {
          editModeloOutroInput = document.createElement("input");
          editModeloOutroInput.type = "text";
          editModeloOutroInput.id = "editc-modelo-outro";
          editModeloOutroInput.placeholder = "Digite o modelo manualmente";
          editModeloOutroInput.autocomplete = "off";
          editModeloOutroInput.required = true;
          editModeloOutroInput.style.marginTop = "6px";
          wrapper.appendChild(editModeloOutroInput);
        }
        editModeloOutroInput.style.display = "block";
        editModeloOutroInput.focus();
        this.required = false;
      } else {
        if (editModeloOutroInput) editModeloOutroInput.style.display = "none";
        this.required = true;
      }
    });
  }

  function getModeloClienteEdit() {
    const sel = $("editc-modelo");
    if (!sel) return "";
    if (sel.value === "__outro__") {
      const input = $("editc-modelo-outro");
      return input ? input.value.trim() : "";
    }
    return sel.value;
  }

  function renderClientes() {
    $("qtd-clientes").textContent = clientes.length + " veículo" + (clientes.length === 1 ? "" : "s");
    const container = $("lista-clientes");
    const busca = $("busca-clientes");
    const termo = busca ? busca.value.trim().toLocaleLowerCase("pt-BR") : "";
    const clientesFiltrados = clientes.filter(function (cliente) {
      return !termo || (cliente.nome + " " + cliente.placa + " " + cliente.modelo).toLocaleLowerCase("pt-BR").includes(termo);
    });
    container.innerHTML = "";

    if (clientesFiltrados.length === 0) {
      container.innerHTML =
        '<div class="empty-state cadastro-empty"><strong>Nenhum cliente encontrado</strong>' +
        (termo ? "Tente buscar pelo nome ou placa do veículo." : "Cadastre um cliente para iniciar uma recarga.") +
        "</div>";
      return;
    }

    clientesFiltrados.slice().reverse().forEach(function (c) {
      const div = document.createElement("div");
      div.className = "list-item";
      const origem = clientes.indexOf(c);
      div.innerHTML =
        '<div class="cadastro-client-main">' +
          placaHtml(c.placa) +
          '<div class="info"><strong>' + escapeHtml(c.nome) + "</strong>" +
          '<div class="muted">' + escapeHtml(c.modelo) + "</div></div>" +
        "</div>" +
        '<div class="actions">' +
          '<button class="btn btn-edit" data-editar-cliente="' + origem + '">Editar</button>' +
          '<button class="btn btn-danger" data-remover="' + origem + '">Excluir</button>' +
        "</div>";
      container.appendChild(div);
    });

    container.querySelectorAll("[data-editar-cliente]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        const idx = parseInt(btn.dataset.editarCliente, 10);
        const cliente = clientes[idx];
        if (!cliente) return;
        editandoClienteIdx = idx;
        $("editc-titulo").textContent = cliente.placa;
        $("editc-placa").value = cliente.placa;
        $("editc-nome").value = cliente.nome;
        popularSelectModelosEdit(cliente.modelo);
        $("modal-cliente-edicao").classList.add("show");
      });
    });

container.querySelectorAll("[data-remover]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const idx = parseInt(btn.dataset.remover, 10);
        const cliente = clientes[idx];
        if (confirm("Excluir o cadastro da placa " + cliente.placa + "?")) {
          clientes.splice(idx, 1);
          salvarESyncIncremental(KEY_CLIENTES, clientes, "clientes");
          renderClientes();
          popularSelectPlacas();
          mostrarAlerta("Cadastro excluído.", "success");
        }
      });
    });
  }

  $("busca-clientes").addEventListener("input", renderClientes);

  /* ---------------- MODELOS DE CARRO ---------------- */
  let editandoModeloIdx = null;

  function modelosOrdenados() {
    return modelos.slice().sort((a, b) => (a.marca + " " + a.modelo).localeCompare(b.marca + " " + b.modelo, "pt-BR"));
  }

  function popularSelectModelos() {
    const sel = $("modelo");
    if (!sel) return;
    const valorAtual = sel.value;
    sel.innerHTML = '<option value="">Selecione ou digite...</option>';
    modelosOrdenados().forEach(function (m) {
      const opt = document.createElement("option");
      opt.value = m.modelo;
      opt.textContent = (m.marca ? m.marca + " " : "") + m.modelo;
      sel.appendChild(opt);
    });
    const optOutro = document.createElement("option");
    optOutro.value = "__outro__";
    optOutro.textContent = "Outro (digitar manualmente)";
    sel.appendChild(optOutro);
    if (valorAtual) {
      const existe = Array.from(sel.options).some((o) => o.value === valorAtual);
      if (existe) sel.value = valorAtual;
    }
  }

  function popularSelectModelosEdit(modeloAtual) {
    const sel = $("editc-modelo");
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione ou digite...</option>';
    modelosOrdenados().forEach(function (m) {
      const opt = document.createElement("option");
      opt.value = m.modelo;
      opt.textContent = (m.marca ? m.marca + " " : "") + m.modelo;
      sel.appendChild(opt);
    });
    const optOutro = document.createElement("option");
    optOutro.value = "__outro__";
    optOutro.textContent = "Outro (digitar manualmente)";
    sel.appendChild(optOutro);
    if (modeloAtual) {
      const existe = Array.from(sel.options).some((o) => o.value === modeloAtual);
      if (existe) {
        sel.value = modeloAtual;
      } else {
        sel.value = "__outro__";
        setTimeout(function () {
          const input = $("editc-modelo-outro");
          if (input) {
            input.style.display = "block";
            input.value = modeloAtual;
          }
        }, 0);
      }
    }
  }

  function renderModelos() {
    $("qtd-modelos").textContent = modelos.length + " cadastro" + (modelos.length === 1 ? "" : "s");
    const container = $("lista-modelos");
    container.innerHTML = "";
    const details = container.closest("details.collapsible");
    if (details) details.open = modelos.length === 0;

    const termo = $("busca-modelos").value.trim().toLocaleLowerCase("pt-BR");
    const modelosFiltrados = modelosOrdenados().filter(function (modelo) {
      return !termo || (modelo.marca + " " + modelo.modelo).toLocaleLowerCase("pt-BR").includes(termo);
    });
    if (modelosFiltrados.length === 0) {
      container.innerHTML = '<div class="empty-state"><strong>Nenhum modelo cadastrado</strong>Utilize o botão "➕ Cadastrar Modelo de Carro" acima para cadastrar o primeiro modelo.</div>';
      return;
    }

    modelosFiltrados.forEach(function (m, idx) {
      const div = document.createElement("div");
      div.className = "list-item";
      const origem = modelos.findIndex(function (orig) { return orig.modelo === m.modelo && orig.marca === m.marca; });
      div.innerHTML =
        '<div class="info"><strong>' + escapeHtml(m.marca ? m.marca + " " + m.modelo : m.modelo) + "</strong>" +
          '<div class="muted">Bateria ' + escapeHtml(String(m.capacidadeBateria)) + " kWh, até " + escapeHtml(String(m.potenciaMaxKwh)) + " kW, média " + escapeHtml(String(m.mediaKwh)) + " kW</div></div>" +
        '<div class="actions">' +
          '<button class="btn btn-edit" data-editar-modelo="' + origem + '">Editar</button>' +
          '<button class="btn btn-danger" data-remover-modelo="' + origem + '">Excluir</button>' +
        "</div>";
      container.appendChild(div);
    });

    container.querySelectorAll("[data-editar-modelo]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        const idx = parseInt(btn.dataset.editarModelo, 10);
        abrirEdicaoModelo(idx);
      });
    });

    container.querySelectorAll("[data-remover-modelo]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const idx = parseInt(btn.dataset.removerModelo, 10);
        const modelo = modelos[idx];
        if (confirm("Excluir o modelo " + modelo.marca + " " + modelo.modelo + "?")) {
          modelos.splice(idx, 1);
          salvarESyncIncremental(KEY_MODELOS, modelos, "modelos");
          renderModelos();
          popularSelectModelos();
          popularSelectModelosEdit("");
          mostrarAlerta("Modelo excluído.", "success");
        }
      });
    });
  }

  $("busca-modelos").addEventListener("input", renderModelos);

  function calcularTempoEstimado(bateriaInicial, bateriaAlvo, modeloNome, bico) {
    const modelo = modelos.find(function (m) { return m.modelo === modeloNome; });
    if (!modelo) return null;
    const kwhNecessario = ((bateriaAlvo - bateriaInicial) / 100) * modelo.capacidadeBateria;
    const potenciaBico = potenciaDoBico(bico);
    const media = Number(modelo.mediaKwh) || 0;
    const maxima = Number(modelo.potenciaMaxKwh) || 0;
    const teto = potenciaBico > 0 ? (maxima > 0 ? Math.min(maxima, potenciaBico) : potenciaBico) : maxima;
    // Sem a média real do modelo, estima com 70% do que o bico (ou o carro) aguenta.
    const potencia = media > 0 ? (teto > 0 ? Math.min(media, teto) : media) : teto * 0.7;
    if (!potencia || potencia <= 0) return null;
    const tempoMin = Math.ceil((kwhNecessario / potencia) * 60);
    return Math.max(1, tempoMin);
  }

  function recalcularSessoesPorModelo(modeloAlterado) {
    let alterado = false;
    sessoes.forEach(function (s) {
      if (s.status === "carregando" && s.modelo === modeloAlterado.modelo) {
        if (s.bateriaInicial != null && s.bateriaAlvo != null) {
          const novoTempo = calcularTempoEstimado(s.bateriaInicial, s.bateriaAlvo, modeloAlterado.modelo, s.bico);
          if (novoTempo && novoTempo !== s.tempoEstimadoMin) {
            s.tempoEstimadoMin = novoTempo;
            alterado = true;
          }
        }
      }
    });
    if (alterado) {
      salvarESyncIncremental(KEY_SESSOES, sessoes);
      renderSessoes();
      renderStatusBicos();
      atualizarPreviewWhatsApp();
    }
  }

  function fecharFormCadastro(formId) {
    const form = document.getElementById(formId);
    const details = form && form.closest("details.collapsible");
    if (details) details.open = false;
    const folha = form && form.closest(".modal-overlay");
    if (folha) folha.classList.remove("show");
  }

  $("form-modelo").addEventListener("submit", function (e) {
    e.preventDefault();
    const modelo = $("mod-nome").value.trim();
    const marca = $("mod-marca").value.trim();
    const potenciaTexto = $("mod-potencia-max").value.trim();
    const mediaTexto = $("mod-media").value.trim();
    const potenciaMaxKwh = potenciaTexto ? parseInt(potenciaTexto, 10) : null;
    const mediaKwh = mediaTexto ? parseInt(mediaTexto, 10) : null;
    const capacidadeBateria = parseFloat(String($("mod-capacidade").value).replace(",", "."));

    if (!modelo || !marca) {
      mostrarAlerta("Preencha modelo e marca.", "error");
      return;
    }
    if (potenciaMaxKwh !== null && (isNaN(potenciaMaxKwh) || potenciaMaxKwh <= 0)) {
      mostrarAlerta("Potência máxima inválida. Deixe vazio se não souber.", "error");
      return;
    }
    if (mediaKwh !== null && (isNaN(mediaKwh) || mediaKwh <= 0)) {
      mostrarAlerta("Média de carregamento inválida. Deixe vazio se não souber.", "error");
      return;
    }
    if (isNaN(capacidadeBateria) || capacidadeBateria <= 0) {
      mostrarAlerta("Capacidade da bateria inválida.", "error");
      return;
    }

    const modeloNormalizado = modelo.toLowerCase();
    const marcaNormalizada = marca.toLowerCase();
    const jaExiste = modelos.some(function (m) {
      return m.modelo.toLowerCase() === modeloNormalizado && m.marca.toLowerCase() === marcaNormalizada;
    });
    if (jaExiste) {
      mostrarAlerta("Já existe um modelo com esse nome e marca.", "error");
      return;
    }
    modelos.push({ modelo, marca, potenciaMaxKwh, mediaKwh, capacidadeBateria, criadoEm: new Date().toISOString() });
    salvarESyncIncremental(KEY_MODELOS, modelos, "modelos");
    renderModelos();
    popularSelectModelos();
    popularSelectModelosEdit("");
    this.reset();
    fecharFormCadastro("form-modelo");
    if (placaNova && placaNova.aguardandoModelo) {
      placaNova.aguardandoModelo = false;
      popularModelosPlacaNova(modelo);
      aplicarPlacaNova();
    }
    mostrarAlerta("Modelo " + marca + " " + modelo + " cadastrado!", "success");
  });

  function abrirEdicaoModelo(idx) {
    const m = modelos[idx];
    if (!m) return;
    editandoModeloIdx = idx;
    $("editm-titulo").textContent = (m.marca ? m.marca + " " : "") + m.modelo;
    $("editm-nome").value = m.modelo;
    $("editm-marca").value = m.marca;
    $("editm-potencia-max").value = m.potenciaMaxKwh;
    $("editm-media").value = m.mediaKwh;
    $("editm-capacidade").value = m.capacidadeBateria;
    $("modal-modelo-edicao").classList.add("show");
  }

  function fecharEdicaoModelo() {
    $("modal-modelo-edicao").classList.remove("show");
    editandoModeloIdx = null;
  }

  $("modal-fechar-modelo").addEventListener("click", fecharEdicaoModelo);
  $("btn-cancelar-modelo-edicao").addEventListener("click", fecharEdicaoModelo);
  $("modal-modelo-edicao").addEventListener("click", function (e) {
    if (e.target === this) fecharEdicaoModelo();
  });

  $("form-modelo-edicao").addEventListener("submit", function (e) {
    e.preventDefault();
    if (editandoModeloIdx === null) {
      fecharEdicaoModelo();
      return;
    }
    const modelo = $("editm-nome").value.trim();
    const marca = $("editm-marca").value.trim();
    const potenciaMaxKwh = parseInt($("editm-potencia-max").value, 10);
    const mediaKwh = parseInt($("editm-media").value, 10);
    const capacidadeBateria = parseFloat($("editm-capacidade").value);

    if (!modelo || !marca) {
      mostrarAlerta("Preencha modelo e marca.", "error");
      return;
    }
    if (isNaN(potenciaMaxKwh) || potenciaMaxKwh <= 0) {
      mostrarAlerta("Potência máxima inválida.", "error");
      return;
    }
    if (isNaN(mediaKwh) || mediaKwh <= 0) {
      mostrarAlerta("Média de carregamento inválida.", "error");
      return;
    }
    if (isNaN(capacidadeBateria) || capacidadeBateria <= 0) {
      mostrarAlerta("Capacidade da bateria inválida.", "error");
      return;
    }

    const modeloNormalizado = modelo.toLowerCase();
    const marcaNormalizada = marca.toLowerCase();
    const jaExiste = modelos.some(function (m, i) {
      return i !== editandoModeloIdx && m.modelo.toLowerCase() === modeloNormalizado && m.marca.toLowerCase() === marcaNormalizada;
    });
    if (jaExiste) {
      mostrarAlerta("Já existe um modelo com esse nome e marca.", "error");
      return;
    }

    const anterior = modelos[editandoModeloIdx];
    modelos[editandoModeloIdx] = { id: anterior.id || gerarId("m"), modelo, marca, potenciaMaxKwh, mediaKwh, capacidadeBateria, criadoEm: anterior.criadoEm || new Date().toISOString() };
    clientes.forEach(function (cliente) { if (cliente.modelo === anterior.modelo) cliente.modelo = modelo; });
    sessoes.forEach(function (sessao) { if (sessao.modelo === anterior.modelo) sessao.modelo = modelo; });
    abastecimentos.forEach(function (registro) { if (registro.modelo === anterior.modelo) registro.modelo = modelo; });
    recalcularSessoesPorModelo(modelos[editandoModeloIdx]);
    salvarESyncIncremental(KEY_MODELOS, modelos, "modelos");
    salvarESyncIncremental(KEY_CLIENTES, clientes);
    salvarESyncIncremental(KEY_SESSOES, sessoes);
    salvarESyncIncremental(KEY_ABASTECIMENTOS, abastecimentos);
    renderModelos();
    popularSelectModelos();
    popularSelectModelosEdit("");
    fecharEdicaoModelo();
    mostrarAlerta("Modelo " + marca + " " + modelo + " atualizado!", "success");
  });

  /* --- Modelo select no cadastro de cliente: opção "Outro" --- */
  const modeloSelect = $("modelo");
  let modeloOutroInput = null;
  if (modeloSelect) {
    modeloSelect.addEventListener("change", function () {
      const wrapper = this.closest(".field");
      if (this.value === "__outro__") {
        if (!modeloOutroInput) {
          modeloOutroInput = document.createElement("input");
          modeloOutroInput.type = "text";
          modeloOutroInput.id = "modelo-outro";
          modeloOutroInput.placeholder = "Digite o modelo manualmente";
          modeloOutroInput.autocomplete = "off";
          modeloOutroInput.required = true;
          modeloOutroInput.style.marginTop = "6px";
          wrapper.appendChild(modeloOutroInput);
        }
        modeloOutroInput.style.display = "block";
        modeloOutroInput.focus();
        this.required = false;
      } else {
        if (modeloOutroInput) modeloOutroInput.style.display = "none";
        this.required = true;
      }
    });
  }

  function getModeloCliente() {
    const sel = $("modelo");
    if (!sel) return "";
    if (sel.value === "__outro__") {
      const input = $("modelo-outro");
      return input ? input.value.trim() : "";
    }
    return sel.value;
  }

  /* ---------------- ABA 2: Abastecimento ---------------- */
  let comboboxHighlightedIndex = -1;
  let comboboxFilteredClientes = [];

  function popularSelectPlacas() {
    const aviso = $("aviso-sem-clientes");
    if (aviso) aviso.style.display = clientes.length === 0 ? "block" : "none";
    const input = $("select-placa");
    if (input) input.required = clientes.length > 0;
  }

  function filtrarClientes(termo) {
    const t = (termo || "").toUpperCase().trim();
    if (!t) return clientes.slice().sort((a, b) => a.placa.localeCompare(b.placa));
    return clientes
      .filter(function (c) {
        const placa = c.placa.toUpperCase();
        const nome = (c.nome || "").toUpperCase();
        const modelo = (c.modelo || "").toUpperCase();
        return placa.startsWith(t) || nome.includes(t) || modelo.includes(t);
      })
      .sort(function (a, b) {
        const pa = a.placa.toUpperCase(), pb = b.placa.toUpperCase();
        const aStarts = pa.startsWith(t), bStarts = pb.startsWith(t);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return pa.localeCompare(pb);
      });
  }

  function highlightMatch(text, termo) {
    if (!termo) return escapeHtml(text);
    const t = termo.toUpperCase();
    const upper = text.toUpperCase();
    const idx = upper.indexOf(t);
    if (idx === -1) return escapeHtml(text);
    const before = escapeHtml(text.slice(0, idx));
    const match = escapeHtml(text.slice(idx, idx + t.length));
    const after = escapeHtml(text.slice(idx + t.length));
    return before + '<span class="match-highlight">' + match + '</span>' + after;
  }

  // Mantém os atributos ARIA do padrão combobox (lista + opção ativa) em sincronia com o estado visual.
  function sincronizarAriaCombobox(input, dropdown, indice) {
    const aberto = dropdown.classList.contains("show");
    const opcoes = dropdown.querySelectorAll(".combobox-option");
    opcoes.forEach(function (opt, i) {
      opt.id = dropdown.id + "-opcao-" + i;
      opt.setAttribute("aria-selected", String(i === indice));
    });
    input.setAttribute("aria-expanded", String(aberto));
    if (aberto && opcoes[indice]) input.setAttribute("aria-activedescendant", opcoes[indice].id);
    else input.removeAttribute("aria-activedescendant");
  }

  function renderComboboxDropdown() {
    const dropdown = $("select-placa-dropdown");
    const input = $("select-placa");
    if (!dropdown || !input) return;

    const termo = input.value;
    comboboxFilteredClientes = filtrarClientes(termo);
    comboboxHighlightedIndex = -1;
    const placaDigitada = placaNormalizada(termo);
    const placaValida = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placaDigitada);
    const jaCadastrada = clientes.some(function (c) { return placaNormalizada(c.placa) === placaDigitada; });
    const opcaoNova = placaValida && !jaCadastrada
      ? '<button type="button" class="combobox-option combobox-nova" data-nova-placa="' + escapeAttr(placaDigitada) + '"><span class="placa"><b>' + escapeHtml(placaDigitada) + '</b></span><span class="client-info"><span class="client-name">Placa nova</span><span class="client-model">Iniciar sem cadastro ou cadastrar agora</span></span></button>'
      : "";

    if (comboboxFilteredClientes.length === 0) {
      dropdown.innerHTML = opcaoNova + (opcaoNova ? "" : '<div class="combobox-empty">Nenhuma placa encontrada para "' + escapeHtml(termo) + '". Digite a placa completa para iniciar com uma placa nova.</div>');
      dropdown.classList.add("show");
      sincronizarAriaCombobox(input, dropdown, -1);
      return;
    }

    dropdown.innerHTML = opcaoNova + comboboxFilteredClientes.map(function (c, idx) {
      return (
        '<div class="combobox-option" data-index="' + idx + '" role="option" tabindex="-1">' +
          '<span class="placa"><b>' + highlightMatch(c.placa, termo) + '</b></span>' +
          '<div class="client-info">' +
            '<span class="client-name">' + highlightMatch(c.nome, termo) + '</span>' +
            '<span class="client-model">' + highlightMatch(c.modelo, termo) + '</span>' +
          '</div>' +
        '</div>'
      );
    }).join("");

    dropdown.classList.add("show");
    sincronizarAriaCombobox(input, dropdown, -1);
  }

  function selectComboboxOption(index) {
    const input = $("select-placa");
    const hidden = $("select-placa-value");
    const dropdown = $("select-placa-dropdown");
    if (index < 0 || index >= comboboxFilteredClientes.length) return;

    const cliente = comboboxFilteredClientes[index];
    descartarPlacaNova();
    input.value = cliente.placa + " — " + cliente.nome;
    hidden.value = cliente.placa;
    $("auto-nome").value = cliente.nome;
    $("auto-modelo").value = cliente.modelo;

    dropdown.classList.remove("show");
    sincronizarAriaCombobox(input, dropdown, -1);
    input.blur();
    atualizarModoFormulario();
  }

  function closeCombobox() {
    const dropdown = $("select-placa-dropdown");
    const wrapper = dropdown ? dropdown.closest(".combobox") : null;
    if (dropdown) dropdown.classList.remove("show");
    if (wrapper) wrapper.classList.remove("open");
    comboboxHighlightedIndex = -1;
    if (dropdown) sincronizarAriaCombobox($("select-placa"), dropdown, -1);
  }

  const selectPlacaInput = $("select-placa");
  if (selectPlacaInput) {
    selectPlacaInput.addEventListener("input", function () {
      this.setAttribute("aria-invalid", "false");
      renderComboboxDropdown();
      this.closest(".combobox").classList.add("open");
    });

    selectPlacaInput.addEventListener("focus", function () {
      if (this.value || clientes.length > 0) {
        renderComboboxDropdown();
        this.closest(".combobox").classList.add("open");
      }
    });

    selectPlacaInput.addEventListener("keydown", function (e) {
      const dropdown = $("select-placa-dropdown");
      if (!dropdown.classList.contains("show")) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        comboboxHighlightedIndex = Math.min(comboboxHighlightedIndex + 1, comboboxFilteredClientes.length - 1);
        updateHighlight();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        comboboxHighlightedIndex = Math.max(comboboxHighlightedIndex - 1, 0);
        updateHighlight();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (comboboxHighlightedIndex >= 0) {
          selectComboboxOption(comboboxHighlightedIndex);
        }
      } else if (e.key === "Escape") {
        closeCombobox();
      }
    });

    function updateHighlight() {
      const dropdown = $("select-placa-dropdown");
      const options = dropdown.querySelectorAll(".combobox-option");
      options.forEach(function (opt, i) {
        opt.classList.toggle("highlighted", i === comboboxHighlightedIndex);
        if (i === comboboxHighlightedIndex) opt.scrollIntoView({ block: "nearest" });
      });
      sincronizarAriaCombobox($("select-placa"), dropdown, comboboxHighlightedIndex);
    }
  }

  document.addEventListener("click", function (e) {
    const combobox = document.querySelector(".combobox");
    const dropdown = $("select-placa-dropdown");
    if (combobox && dropdown && !combobox.contains(e.target)) {
      closeCombobox();
    }
  });

  $("select-placa-dropdown").addEventListener("click", function (e) {
    const nova = e.target.closest("[data-nova-placa]");
    if (nova) {
      iniciarPlacaNova(nova.dataset.novaPlaca);
      return;
    }
    const opt = e.target.closest(".combobox-option");
    if (opt) {
      const idx = parseInt(opt.dataset.index, 10);
      selectComboboxOption(idx);
    }
  });

  /* ----- Placa nova ao iniciar: cliente avulso ou cadastro rápido ----- */
  function formatarPlacaCadastro(placa) {
    const p = placaNormalizada(placa);
    return p.slice(0, 3) + "-" + p.slice(3);
  }

  function popularModelosPlacaNova(selecionado) {
    const sel = $("ini-novo-modelo");
    const atual = selecionado !== undefined ? selecionado : sel.value;
    sel.innerHTML = '<option value="">Não sei o modelo</option>' +
      modelos.slice().sort(function (a, b) { return (a.marca + a.modelo).localeCompare(b.marca + b.modelo, "pt-BR"); }).map(function (m) {
        return '<option value="' + escapeAttr(m.modelo) + '">' + escapeHtml((m.marca ? m.marca + " " : "") + m.modelo) + "</option>";
      }).join("") + '<option value="__novo">+ Novo modelo</option>';
    sel.value = Array.from(sel.options).some(function (o) { return o.value === atual; }) ? atual : "";
  }

  // Leva o que foi digitado no painel para os campos que o resto da folha já usa.
  function aplicarPlacaNova() {
    if (!placaNova) return;
    $("select-placa-value").value = formatarPlacaCadastro(placaNova.placa);
    $("auto-nome").value = $("ini-novo-nome").value.trim() || "Cliente avulso";
    $("auto-modelo").value = $("ini-novo-modelo").value === "__novo" ? "" : $("ini-novo-modelo").value;
    atualizarModoFormulario();
    atualizarTempoEstimadoAuto();
  }

  function iniciarPlacaNova(placa) {
    placaNova = { placa: placa, aguardandoModelo: false };
    $("ini-novo-nome").value = "";
    $("ini-novo-salvar").setAttribute("aria-checked", "true");
    popularModelosPlacaNova("");
    $("ini-placa-nova").hidden = false;
    $("select-placa").value = placa;
    closeCombobox();
    aplicarPlacaNova();
    setTimeout(function () { try { $("ini-novo-nome").focus({ preventScroll: true }); } catch (e) {} }, 60);
  }

  function descartarPlacaNova() {
    placaNova = null;
    if ($("ini-placa-nova")) $("ini-placa-nova").hidden = true;
  }

  $("ini-novo-nome").addEventListener("input", aplicarPlacaNova);
  $("ini-novo-modelo").addEventListener("change", function () {
    if (this.value === "__novo") {
      placaNova.aguardandoModelo = true;
      this.value = "";
      aplicarPlacaNova();
      $("form-modelo").reset();
      $("modal-cad-modelos").classList.add("show");
      setTimeout(function () { try { $("mod-marca").focus({ preventScroll: true }); } catch (e) {} }, 60);
      return;
    }
    aplicarPlacaNova();
  });
  $("ini-novo-salvar").addEventListener("click", function () {
    this.setAttribute("aria-checked", String(this.getAttribute("aria-checked") !== "true"));
  });

  // Antes de iniciar: grava o cliente novo (se pedido) e devolve os dados da placa nova.
  function confirmarPlacaNova() {
    if (!placaNova) return { ok: true, avulso: null };
    const nome = $("ini-novo-nome").value.trim();
    const modelo = $("ini-novo-modelo").value === "__novo" ? "" : $("ini-novo-modelo").value;
    const placa = formatarPlacaCadastro(placaNova.placa);
    if (clientes.some(function (c) { return placaNormalizada(c.placa) === placaNormalizada(placa); })) return { ok: true, avulso: null };
    if ($("ini-novo-salvar").getAttribute("aria-checked") === "true") {
      clientes.push({ placa: placa, nome: nome, modelo: modelo, criadoEm: new Date().toISOString(), cadastradoPor: (perfilAtivoSnapshot() || {}).nome || "" });
      salvarESyncIncremental(KEY_CLIENTES, clientes, "clientes");
      if (typeof renderClientes === "function") renderClientes();
      return { ok: true, avulso: null, cadastrado: true };
    }
    return { ok: true, avulso: { nome: nome || "Cliente avulso", modelo: modelo } };
  }

  /* -------- Combobox Produtos (Vendas) -------- */
  let produtoComboboxHighlightedIndex = -1;
  let produtoComboboxFiltered = [];
  let vendaAlocacoesEstoque = null;
  let vendaComboId = null;
  let carrinho = [];
  let categoriaVenda = "Todos";

  function filtrarProdutos(termo) {
    const t = (termo || "").toUpperCase().trim();
    const lista = produtosOrdenados().filter(vendavel);
    if (!t) return lista;
    return lista
      .filter(function (p) {
        const nome = nomeProduto(p).toUpperCase();
        const cat = p.categoria.toUpperCase();
        return nome.includes(t) || cat.includes(t);
      })
      .sort(function (a, b) {
        const aNome = nomeProduto(a).toUpperCase(), bNome = nomeProduto(b).toUpperCase();
        const aStarts = aNome.startsWith(t), bStarts = bNome.startsWith(t);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return aNome.localeCompare(bNome, "pt-BR");
      });
  }

  function renderProdutoComboboxDropdown() {
    const dropdown = $("select-produto-dropdown");
    const input = $("select-produto");
    if (!dropdown || !input) return;

    const termo = input.value;
    produtoComboboxFiltered = filtrarProdutos(termo);
    produtoComboboxHighlightedIndex = -1;

    if (produtoComboboxFiltered.length === 0) {
      dropdown.innerHTML = '<div class="combobox-empty">Nenhum produto encontrado para "' + escapeHtml(termo) + '"</div>';
      dropdown.classList.add("show");
      sincronizarAriaCombobox(input, dropdown, -1);
      return;
    }

    dropdown.innerHTML = produtoComboboxFiltered.map(function (p, idx) {
      return (
        '<div class="combobox-option" data-index="' + idx + '" role="option" tabindex="-1">' +
          '<div class="plate">' + highlightMatch(nomeProduto(p), termo) + '</div>' +
          '<div class="client-info">' +
            '<span class="client-name">' + highlightMatch(p.categoria, termo) + '</span>' +
            '<span class="client-model">' + fmtMoeda(p.valor) + ' · Est: ' + (estoqueInformado(p) ? p.estoque : "—") + '</span>' +
          '</div>' +
        '</div>'
      );
    }).join("");

    dropdown.classList.add("show");
    sincronizarAriaCombobox(input, dropdown, -1);
  }

  async function selectProdutoComboboxOption(index) {
    const input = $("select-produto");
    const hidden = $("select-produto-value");
    const dropdown = $("select-produto-dropdown");
    if (index < 0 || index >= produtoComboboxFiltered.length) return;

    const produto = produtoComboboxFiltered[index];
    let alocacoes = null;
    if (comboConfiguravel(produto)) {
      alocacoes = await escolherItensCombo(produto);
      if (!alocacoes) {
        input.value = "";
        hidden.value = "";
        vendaAlocacoesEstoque = null;
        vendaComboId = null;
        atualizarHintProduto();
        dropdown.classList.remove("show");
        sincronizarAriaCombobox(input, dropdown, -1);
        return;
      }
    }
    input.value = nomeProduto(produto) + " (" + fmtMoeda(produto.valor) + ")";
    hidden.value = produto.id;
    vendaAlocacoesEstoque = alocacoes;
    vendaComboId = alocacoes ? produto.id : null;
    atualizarHintProduto();
    dropdown.classList.remove("show");
    sincronizarAriaCombobox(input, dropdown, -1);
    input.blur();
  }

  function closeProdutoCombobox() {
    const dropdown = $("select-produto-dropdown");
    const wrapper = dropdown ? dropdown.closest(".combobox") : null;
    if (dropdown) dropdown.classList.remove("show");
    if (wrapper) wrapper.classList.remove("open");
    produtoComboboxHighlightedIndex = -1;
    if (dropdown) sincronizarAriaCombobox($("select-produto"), dropdown, -1);
  }

  const selectProdutoInput = $("select-produto");
  if (selectProdutoInput) {
    selectProdutoInput.addEventListener("input", function () {
      this.setAttribute("aria-invalid", "false");
      $("select-produto-value").value = "";
      vendaAlocacoesEstoque = null;
      vendaComboId = null;
      renderProdutoComboboxDropdown();
      this.closest(".combobox").classList.add("open");
    });

    selectProdutoInput.addEventListener("focus", function () {
      if (this.value || produtos.length > 0) {
        renderProdutoComboboxDropdown();
        this.closest(".combobox").classList.add("open");
      }
    });

    selectProdutoInput.addEventListener("keydown", function (e) {
      const dropdown = $("select-produto-dropdown");
      if (!dropdown.classList.contains("show")) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        produtoComboboxHighlightedIndex = Math.min(produtoComboboxHighlightedIndex + 1, produtoComboboxFiltered.length - 1);
        updateProdutoHighlight();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        produtoComboboxHighlightedIndex = Math.max(produtoComboboxHighlightedIndex - 1, 0);
        updateProdutoHighlight();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (produtoComboboxHighlightedIndex >= 0) {
          selectProdutoComboboxOption(produtoComboboxHighlightedIndex);
        }
      } else if (e.key === "Escape") {
        closeProdutoCombobox();
      }
    });

    function updateProdutoHighlight() {
      const dropdown = $("select-produto-dropdown");
      const options = dropdown.querySelectorAll(".combobox-option");
      options.forEach(function (opt, i) {
        opt.classList.toggle("highlighted", i === produtoComboboxHighlightedIndex);
        if (i === produtoComboboxHighlightedIndex) opt.scrollIntoView({ block: "nearest" });
      });
      sincronizarAriaCombobox($("select-produto"), dropdown, produtoComboboxHighlightedIndex);
    }
  }

  document.addEventListener("click", function (e) {
    const combobox = document.querySelector(".combobox");
    const dropdown = $("select-placa-dropdown");
    if (combobox && dropdown && !combobox.contains(e.target)) {
      closeCombobox();
    }
    const produtoCombobox = document.querySelector("#select-produto")?.closest(".combobox");
    const produtoDropdown = $("select-produto-dropdown");
    if (produtoCombobox && produtoDropdown && !produtoCombobox.contains(e.target)) {
      closeProdutoCombobox();
    }
    document.querySelectorAll(".consumo-item .combobox").forEach(function (consumoCombobox) {
      if (!consumoCombobox.contains(e.target)) {
        consumoCombobox.classList.remove("open");
        const consumoDropdown = consumoCombobox.querySelector("[data-consumo-dropdown]");
        if (consumoDropdown) consumoDropdown.classList.remove("show");
      }
    });
  });

  $("select-produto-dropdown").addEventListener("click", function (e) {
    const opt = e.target.closest(".combobox-option");
    if (opt) {
      const idx = parseInt(opt.dataset.index, 10);
      selectProdutoComboboxOption(idx);
    }
  });

  function limparFormIniciar() {
    descartarPlacaNova();
    const input = $("select-placa");
    const hidden = $("select-placa-value");
    if (input) input.value = "";
    if (hidden) hidden.value = "";
    $("auto-nome").value = "";
    $("auto-modelo").value = "";
    $("bateria-inicial").value = "";
    $("bateria-alvo").value = "";
    $("tempo-estimado").value = "";
    $("valor-parada").value = "";
    popularBicosFormulario();
    closeCombobox();
    atualizarModoFormulario();
    fecharModalIniciar();
  }

  function lerValoresRecarga() {
    const bateriaInicial = parseInt($("bateria-inicial").value, 10);
    const alvoRaw = String($("bateria-alvo").value || "").trim();
    let bateriaAlvo = parseInt(alvoRaw, 10);
    const valorRaw = String($("valor-parada").value || "").trim();
    const valorParada = valorRaw !== "" ? moedaDaMascara(valorRaw) : null;
    if (isNaN(bateriaInicial) || bateriaInicial < 0 || bateriaInicial > 100) {
      mostrarAlerta("Informe a bateria inicial (valor entre 0 e 100).", "error");
      return null;
    }
    if (valorParada != null && (isNaN(valorParada) || valorParada <= 0)) {
      mostrarAlerta("Informe um valor de parada válido (maior que zero).", "error");
      return null;
    }
    if (valorParada == null) {
      if (isNaN(bateriaAlvo) || bateriaAlvo < 0 || bateriaAlvo > 100) {
        mostrarAlerta("Informe a bateria inicial e a bateria alvo (valores entre 0 e 100).", "error");
        return null;
      }
      if (bateriaAlvo <= bateriaInicial) {
        mostrarAlerta("A bateria alvo deve ser maior que a bateria inicial.", "error");
        return null;
      }
    } else if (alvoRaw !== "") {
      if (isNaN(bateriaAlvo) || bateriaAlvo < 0 || bateriaAlvo > 100) {
        mostrarAlerta("A bateria alvo deve estar entre 0 e 100 (ou deixe vazio para usar 100%).", "error");
        return null;
      }
      if (bateriaAlvo <= bateriaInicial) {
        mostrarAlerta("A bateria alvo deve ser maior que a bateria inicial.", "error");
        return null;
      }
    } else {
      bateriaAlvo = 100;
    }
    return { bateriaInicial: bateriaInicial, bateriaAlvo: bateriaAlvo, valorParada: valorParada };
  }

  $("form-iniciar").addEventListener("submit", function (e) {
    e.preventDefault();
    const novaPlaca = confirmarPlacaNova();
    const avulso = novaPlaca.avulso;
    const placa = $("select-placa-value").value;
    if (!placa) {
      mostrarAlerta("Busque a placa do carro. Se ela ainda não existe, digite a placa completa e escolha Placa nova.", "error");
      $("select-placa").setAttribute("aria-invalid", "true");
      return;
    }
    $("select-placa").setAttribute("aria-invalid", "false");

    const reservaFila = filaLiberadaSelecionadaId
      ? sessoes.find(function (s) { return s.id === filaLiberadaSelecionadaId && s.status === "vaga-liberada"; })
      : null;
    if (reservaFila) {
      const sessaoExistente = sessoes.find(function (s) {
        return s.id !== reservaFila.id && placaNormalizada(s.placa) === placaNormalizada(placa);
      });
      if (sessaoExistente) {
        alertaPlacaJaNaLista(sessaoExistente);
        return;
      }
      const vals = lerValoresRecarga();
      if (!vals) return;
      const tempoEstimado = parseInt($("tempo-estimado").value, 10);
      if (isNaN(tempoEstimado) || tempoEstimado <= 0) {
        mostrarAlerta("Informe o tempo estimado de recarga em minutos.", "error");
        return;
      }
      const clienteReserva = clientes.find((x) => placaNormalizada(x.placa) === placaNormalizada(placa)) || avulso;
      reservaFila.placa = placa.toUpperCase();
      reservaFila.cliente = clienteReserva ? clienteReserva.nome : "";
      reservaFila.modelo = clienteReserva ? clienteReserva.modelo : "";
      reservaFila.bateriaInicial = vals.bateriaInicial;
      reservaFila.bateriaAlvo = vals.bateriaAlvo;
      reservaFila.tempoEstimadoMin = tempoEstimado;
      reservaFila.valorParada = vals.valorParada;
      reservaFila.status = "carregando";
      reservaFila.operador = perfilAtivoSnapshot();
      reservaFila.inicio = new Date().toISOString();
      filaLiberadaSelecionadaId = null;
      salvarESyncIncremental(KEY_SESSOES, sessoes);
      limparFormIniciar();
      renderSessoes();
      renderStatusBicos();
      atualizarPreviewWhatsApp();
      irParaAba("tab-andamento");
      mostrarAlerta("Abastecimento iniciado no Bico " + reservaFila.bico + " para a placa " + placa.toUpperCase() + "!", "success");
      return;
    }

    const conectada = sessaoConectadaDaPlaca(placa);
    if (conectada) {
      const vals = lerValoresRecarga();
      if (!vals) return;
      const tempoEstimado = parseInt($("tempo-estimado").value, 10);
      if (isNaN(tempoEstimado) || tempoEstimado <= 0) {
        mostrarAlerta("Informe o tempo estimado de recarga em minutos.", "error");
        return;
      }
      conectada.bateriaInicial = vals.bateriaInicial;
      conectada.bateriaAlvo = vals.bateriaAlvo;
      conectada.tempoEstimadoMin = tempoEstimado;
      conectada.valorParada = vals.valorParada;
      conectada.inicio = new Date().toISOString();
      conectada.operador = perfilAtivoSnapshot();
      salvarESyncIncremental(KEY_SESSOES, sessoes);
      limparFormIniciar();
      renderSessoes();
      renderStatusBicos();
      atualizarPreviewWhatsApp();
      irParaAba("tab-andamento");
      mostrarAlerta("Recarga da placa " + placa.toUpperCase() + " iniciada no Bico " + conectada.bico + "!", "success");
      return;
    }

    if (sessoes.some((s) => placaNormalizada(s.placa) === placaNormalizada(placa))) {
      alertaPlacaJaNaLista(sessoes.find((s) => placaNormalizada(s.placa) === placaNormalizada(placa)));
      return;
    }

    const cliente = clientes.find((x) => placaNormalizada(x.placa) === placaNormalizada(placa)) || avulso || { nome: "", modelo: "" };
    const bico = parseInt($("bico-utilizado").value, 10);
    const agora = new Date().toISOString();

    if (!isNaN(bico) && bicoEstaLivre(bico) && modoIniciar !== "fila") {
      const vals = lerValoresRecarga();
      if (!vals) return;
      const tempoEstimado = parseInt($("tempo-estimado").value, 10);
      if (isNaN(tempoEstimado) || tempoEstimado <= 0) {
        mostrarAlerta("Informe o tempo estimado de recarga em minutos.", "error");
        return;
      }
      sessoes.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        placa: placa.toUpperCase(),
        cliente: cliente.nome,
        modelo: cliente.modelo,
        bateriaInicial: vals.bateriaInicial,
        bateriaAlvo: vals.bateriaAlvo,
        tempoEstimadoMin: tempoEstimado,
        valorParada: vals.valorParada,
        bico: bico,
        status: "carregando",
        operador: perfilAtivoSnapshot(),
        inicio: agora,
        kwhPartes: [],
        criadoEm: agora
      });
      salvarESyncIncremental(KEY_SESSOES, sessoes);
      limparFormIniciar();
      renderSessoes();
      renderStatusBicos();
      atualizarPreviewWhatsApp();
      irParaAba("tab-andamento");
      mostrarAlerta("Abastecimento iniciado no Bico " + bico + " para a placa " + placa.toUpperCase() + "!", "success");
    } else {
      if (modoIniciar !== "fila" && !isNaN(bico) && !bicoEstaLivre(bico)) {
        mostrarAlerta("O Bico " + bico + " foi ocupado antes do início. Selecione outro bico disponível.", "error");
        popularBicosFormulario();
        return;
      }
      sessoes.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        placa: placa.toUpperCase(),
        cliente: cliente ? cliente.nome : "",
        modelo: cliente ? cliente.modelo : "",
        bateriaInicial: null,
        bateriaAlvo: null,
        tempoEstimadoMin: null,
        bico: null,
        status: "aguardando",
        inicio: null,
        criadoEm: agora
      });
      salvarESyncIncremental(KEY_SESSOES, sessoes);
      limparFormIniciar();
      renderSessoes();
      renderStatusBicos();
      atualizarPreviewWhatsApp();
      irParaAba("tab-andamento");
      mostrarAlerta("A placa " + placa.toUpperCase() + " entrou na fila de espera. Quando uma vaga liberar, os valores de recarga serão solicitados.", "success");
    }
  });

  function alertaPlacaJaNaLista(s) {
    if (s.status === "aguardando") {
      const pos = aguardando().indexOf(s) + 1;
      mostrarAlerta("A placa " + s.placa + " já está na fila de espera (posição " + pos + ").", "success");
      irParaAba("tab-andamento");
      return;
    }
    if (s.status === "carregando" && s.bateriaInicial == null) {
      mostrarAlerta("A placa " + s.placa + " está conectada no Bico " + s.bico + " — informe os valores de recarga para iniciar.", "success");
      prepararFormularioPara(s.placa);
      irParaAba("tab-andamento");
      return;
    }
    mostrarAlerta("Este veículo já está abastecendo. Finalize a sessão atual antes de iniciar outra.", "error");
    irParaAba("tab-andamento");
  }

  $("btn-entrar-fila").addEventListener("click", function () {
    const placa = $("select-placa-value").value;
    const existente = placa
      ? sessoes.find((s) => placaNormalizada(s.placa) === placaNormalizada(placa))
      : null;
    if (existente) {
      alertaPlacaJaNaLista(existente);
      return;
    }
    const cliente = clientes.find((x) => placaNormalizada(x.placa) === placaNormalizada(placa));
    const agora = new Date().toISOString();
    sessoes.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      placa: placa ? placa.toUpperCase() : "",
      cliente: cliente ? cliente.nome : "",
      modelo: cliente ? cliente.modelo : "",
      bateriaInicial: null,
      bateriaAlvo: null,
      tempoEstimadoMin: null,
      bico: null,
      status: "aguardando",
      inicio: null,
      criadoEm: agora
    });
    salvarESyncIncremental(KEY_SESSOES, sessoes);
    limparFormIniciar();
    renderSessoes();
    renderStatusBicos();
    atualizarPreviewWhatsApp();
    irParaAba("tab-andamento");
    mostrarAlerta("Espera adicionada à fila. Quando uma vaga liberar, selecione o cliente para iniciar o abastecimento.", "success");
  });

  /* ---------------- Pagamento dividido ---------------- */
  const METODOS = ["Pix", "Dinheiro", "Crédito", "Débito", "Cortesia"];

  function totalDeValorExibido(str) {
    const limpo = String(str || "").replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
    return parseFloat(limpo) || 0;
  }

  function criarLinhaDivisao(metodo, valor, onChange, idParcela) {
    const div = document.createElement("div");
    div.className = "split-row";
    div.dataset.idParcela = idParcela || "";
    const sel = document.createElement("select");
    sel.className = "split-metodo";
    METODOS.forEach(function (m) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      sel.appendChild(opt);
    });
    if (metodo && METODOS.indexOf(metodo) !== -1) sel.value = metodo;
    const inp = document.createElement("input");
    inp.type = "text";
    inp.inputMode = "numeric";
    inp.autocomplete = "off";
    inp.placeholder = "R$ 0,00";
    inp.className = "split-valor currency-input";
    inp.setAttribute("aria-label", "Valor da parcela");
    if (valor !== "" && valor != null && !isNaN(Number(valor))) {
      inp.value = moedaParaCampo(valor);
      div.dataset.manual = "1";
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-remove";
    btn.textContent = "✕";
    btn.title = "Remover parcela";
    btn.addEventListener("click", function () {
      div.remove();
      onChange();
    });
    inp.addEventListener("input", function () {
      // Parcela digitada pelo operador não é mais preenchida com o restante.
      div.dataset.manual = inp.value.trim() ? "1" : "";
      onChange();
    });
    sel.addEventListener("change", onChange);
    div.appendChild(sel);
    div.appendChild(inp);
    div.appendChild(btn);
    return div;
  }

  function obterLinhasDivisao(container) {
    const linhas = [];
    container.querySelectorAll(".split-row").forEach(function (row) {
      const metodo = row.querySelector(".split-metodo").value;
      const campo = row.querySelector(".split-valor").value.trim();
      linhas.push({ idParcela: row.dataset.idParcela || "", metodo: metodo, valor: campo ? moedaDaMascara(campo) : NaN });
    });
    return linhas;
  }

  function totalDinheiroDividido(container) {
    return arred(obterLinhasDivisao(container).reduce(function (total, linha) {
      return total + (linha.metodo === "Dinheiro" && !isNaN(linha.valor) ? linha.valor : 0);
    }, 0));
  }

  function temParcelaDinheiro(container) {
    return obterLinhasDivisao(container).some(function (linha) { return linha.metodo === "Dinheiro"; });
  }

  // Com uma única parcela ainda não digitada, ela recebe o que falta cobrar.
  function preencherRestanteDivisao(container, total) {
    const rows = Array.from(container.querySelectorAll(".split-row"));
    const livres = rows.filter(function (row) { return row.dataset.manual !== "1"; });
    if (livres.length !== 1 || livres.length === rows.length) return;
    const digitado = rows.reduce(function (soma, row) {
      if (row === livres[0]) return soma;
      const campo = row.querySelector(".split-valor").value.trim();
      return soma + (campo ? moedaDaMascara(campo) : 0);
    }, 0);
    const restante = arred(Math.max(0, total - digitado));
    livres[0].querySelector(".split-valor").value = restante > 0 ? moedaParaCampo(restante) : "";
  }

  function atualizarSomaDivisao(container, somaEl, getTotal) {
    const el = $(somaEl);
    const total = getTotal();
    preencherRestanteDivisao(container, total);
    const linhas = obterLinhasDivisao(container);
    if (linhas.length === 0) {
      el.textContent = "";
      el.classList.remove("warn");
      return;
    }
    let soma = 0;
    let incompleto = false;
    linhas.forEach(function (l) {
      if (isNaN(l.valor)) incompleto = true;
      else soma += l.valor;
    });
    const dif = arred(total - soma);
    const vazias = linhas.filter(function (l) { return isNaN(l.valor); });
    let msg;
    if (Math.abs(dif) <= 0.009 && !incompleto) msg = "Parcelas conferem: " + fmtMoeda(total) + " — OK";
    else if (dif > 0.009) msg = "Falta cobrar " + fmtMoeda(dif) + (vazias.length === 1 ? " no " + vazias[0].metodo : "") + " · Total " + fmtMoeda(total);
    else if (dif < -0.009) msg = "Passou " + fmtMoeda(-dif) + " do total de " + fmtMoeda(total);
    else msg = "Total " + fmtMoeda(total) + " (preencha os valores)";
    el.textContent = msg;
    el.classList.toggle("warn", incompleto || Math.abs(dif) > 0.009);
  }

  function renderLinhasDivisao(container, somaEl, getTotal, lista, onChange) {
    container.innerHTML = "";
    const linhas = (lista && lista.length) ? lista : [
      { metodo: "Dinheiro", valor: "" },
      { metodo: "Crédito", valor: "" }
    ];
    const refresh = function () {
      atualizarSomaDivisao(container, somaEl, getTotal);
      if (onChange) onChange();
    };
    linhas.forEach(function (l) {
      container.appendChild(criarLinhaDivisao(l.metodo, l.valor, refresh, l.idParcela));
    });
    refresh();
  }

  function getTotalEdit() { return totalDeValorExibido($("edit-valor-pagar").value); }
  function getTotalFin() { return totalDeValorExibido($("fin-valor-pagar").value); }

  /* ---------------- Bicos de recarga, fila e progresso ---------------- */
  function bicoLivre() {
    const ocupados = {};
    sessoes.forEach(function (s) {
      if ((s.status === "carregando" || s.status === "vaga-liberada") && s.bico != null) ocupados[s.bico] = true;
    });
    for (let b = 1; b <= totalConectores(); b++) {
      if (!ocupados[b]) return b;
    }
    return null;
  }

  function bicoEstaLivre(bico) {
    return !sessoes.some(function (s) {
      return (s.status === "carregando" || s.status === "vaga-liberada") && Number(s.bico) === Number(bico);
    });
  }

  function popularBicosFormulario(preferido) {
    const select = $("bico-utilizado");
    if (!select) return;
    const atual = Number(select.value);
    select.innerHTML = "";
    for (let b = 1; b <= totalConectores(); b++) {
      const livre = bicoEstaLivre(b);
      const option = document.createElement("option");
      option.value = String(b);
      option.textContent = "Bico " + b + " · " + potenciaDoBico(b) + " kW" + (livre ? "" : " · ocupado");
      option.disabled = !livre;
      select.appendChild(option);
    }
    const escolhido = Number(preferido);
    const manterAtual = atual && bicoEstaLivre(atual);
    const livre = escolhido && bicoEstaLivre(escolhido) ? escolhido : (manterAtual ? atual : bicoLivre());
    if (livre != null) select.value = String(livre);
    atualizarHintBico();
  }

  function atualizarHintBico() {
    const select = $("bico-utilizado");
    const hint = $("bico-potencia-hint");
    if (!select || !hint) return;
    const bico = Number(select.value);
    const potencia = potenciaDoBico(bico);
    hint.textContent = bico && potencia ? "Potência máxima configurada: " + potencia + " kW" : "Nenhum bico disponível no momento";
  }

  function abrirNovaRecarga(bico) {
    if (bico != null && !bicoEstaLivre(bico)) {
      mostrarAlerta("O Bico " + bico + " está ocupado.", "error");
      return;
    }
    popularBicosFormulario(bico);
    atualizarModoFormulario();
    abrirModalIniciar($("select-placa"));
  }

  function abrirModalIniciar(foco) {
    const modal = $("modal-iniciar");
    if (!modal) return;
    modal.classList.add("show");
    if (foco && foco.focus) setTimeout(function () { try { foco.focus({ preventScroll: true }); } catch (e) {} }, 60);
  }

  function fecharModalIniciar() {
    const modal = $("modal-iniciar");
    if (modal) modal.classList.remove("show");
  }

  function carregando() {
    return sessoes.filter(function (s) { return s.status === "carregando"; });
  }

  function placaHtml(placa, grande) {
    return '<span class="placa' + (grande ? " lg" : "") + '"><b>' + escapeHtml(placa || "—") + "</b></span>";
  }

  function aguardando() {
    return sessoes.filter(function (s) { return s.status === "aguardando"; });
  }

  function progressoSessao(s) {
    if (s.status !== "carregando" || !s.inicio || !s.tempoEstimadoMin ||
        s.bateriaInicial == null || s.bateriaAlvo == null) return null;
    const agora = Date.now();
    const decorridoMin = (agora - new Date(s.inicio).getTime()) / 60000;
    let pct;
    if (s.pctManual != null && s.pctManualInicio && s.pctManualRestanteMin > 0) {
      const desdeEdicaoMin = (agora - new Date(s.pctManualInicio).getTime()) / 60000;
      const fracaoManual = Math.min(desdeEdicaoMin / s.pctManualRestanteMin, 1);
      pct = Math.round(s.pctManual + (s.bateriaAlvo - s.pctManual) * fracaoManual);
    } else {
      const fracao = Math.min(decorridoMin / s.tempoEstimadoMin, 1);
      pct = Math.round(s.bateriaInicial + (s.bateriaAlvo - s.bateriaInicial) * fracao);
    }
    const restanteMin = Math.max(0, Math.ceil(s.tempoEstimadoMin - decorridoMin));
    const termino = new Date(new Date(s.inicio).getTime() + s.tempoEstimadoMin * 60000);
    return { pct: pct, restanteMin: restanteMin, termino: termino, decorridoMin: decorridoMin };
  }

  function promoverFila() {
    const livres = [];
    const ocupados = {};
    sessoes.forEach(function (s) {
      if ((s.status === "carregando" || s.status === "vaga-liberada") && s.bico != null) ocupados[s.bico] = true;
    });
    for (let b = 1; b <= totalConectores(); b++) if (!ocupados[b]) livres.push(b);
    let alterado = false;
    const fila = aguardando().sort(function (a, b) {
      return new Date(a.criadoEm) - new Date(b.criadoEm);
    });
    const promovidos = [];
    fila.forEach(function (s) {
      if (!livres.length) return;
      s.bico = livres.shift();
      s.status = "vaga-liberada";
      s.inicio = null;
      alterado = true;
      promovidos.push(s);
    });
    if (alterado) {
      salvarESyncIncremental(KEY_SESSOES, sessoes);
      renderSessoes();
      renderStatusBicos();
      atualizarPreviewWhatsApp();
    }
    return promovidos;
  }

  function sessaoConectadaDaPlaca(placa) {
    const norm = placaNormalizada(placa);
    return sessoes.find(function (s) {
      return s.status === "carregando" && s.bateriaInicial == null &&
        placaNormalizada(s.placa) === norm;
    });
  }

  let modoIniciar = "bico";
  let filaLiberadaSelecionadaId = null;

  function atualizarModoFormulario() {
    const placa = $("select-placa-value").value;
    const conectada = sessaoConectadaDaPlaca(placa);
    const livre = bicoLivre();
    const filaLiberada = filaLiberadaSelecionadaId
      ? sessoes.find(function (s) { return s.id === filaLiberadaSelecionadaId && s.status === "vaga-liberada"; })
      : null;
    if (filaLiberada) {
      modoIniciar = "fila-liberada";
      $("campos-recarga").style.display = "grid";
      $("aviso-bicos-ocupados").style.display = "none";
      $("aviso-conectado").style.display = "block";
      $("aviso-conectado-texto").textContent = "Vaga liberada no Bico " + filaLiberada.bico + ". Selecione o cliente e informe os valores.";
      $("bico-utilizado").value = String(filaLiberada.bico);
      $("btn-iniciar-submit").textContent = "Iniciar recarga";
      $("btn-iniciar-submit").style.display = "";
      $("btn-entrar-fila").style.display = "none";
    } else if (conectada) {
      modoIniciar = "valores";
      $("campos-recarga").style.display = "grid";
      $("aviso-bicos-ocupados").style.display = "none";
      $("aviso-conectado").style.display = "block";
      $("aviso-conectado-texto").textContent =
        "Bico " + conectada.bico + " reservado para a placa " + conectada.placa;
      $("btn-iniciar-submit").textContent = "Salvar valores e iniciar";
      $("btn-iniciar-submit").style.display = "";
      $("btn-entrar-fila").style.display = "";
    } else if (livre != null) {
      modoIniciar = "bico";
      $("campos-recarga").style.display = "grid";
      $("aviso-bicos-ocupados").style.display = "none";
      $("aviso-conectado").style.display = "none";
      $("btn-iniciar-submit").textContent = "Iniciar recarga";
      $("btn-iniciar-submit").style.display = "";
      $("btn-entrar-fila").style.display = "";
    } else {
      modoIniciar = "fila";
      $("campos-recarga").style.display = "none";
      $("aviso-bicos-ocupados").style.display = "block";
      $("aviso-conectado").style.display = "none";
      $("btn-iniciar-submit").style.display = "none";
      $("btn-entrar-fila").style.display = "";
    }
    const titulo = $("iniciar-titulo");
    if (titulo) titulo.textContent = modoIniciar === "fila" ? "Entrar na fila" : "Iniciar recarga";
    if ($("ini-veiculo")) atualizarFolhaIniciar();
    if ($("bico-utilizado")) sincronizarChips($("bico-utilizado"));
  }

  function prepararFormularioPara(placa) {
    const cliente = clientes.find(function (c) {
      return placaNormalizada(c.placa) === placaNormalizada(placa);
    });
    const input = $("select-placa");
    const hidden = $("select-placa-value");
    if (cliente) {
      input.value = cliente.placa + " — " + cliente.nome;
      hidden.value = cliente.placa;
    } else {
      input.value = placa;
      hidden.value = placa;
    }
    $("auto-nome").value = cliente ? cliente.nome : "";
    $("auto-modelo").value = cliente ? cliente.modelo : "";
    atualizarModoFormulario();
    atualizarTempoEstimadoAuto();
    const campos = $("campos-recarga");
    if (campos) campos.style.display = "grid";
    abrirModalIniciar($("bateria-inicial"));
  }

  function atualizarTempoEstimadoAuto() {
    const bateriaInicial = parseInt($("bateria-inicial").value, 10);
    const bateriaAlvo = parseInt($("bateria-alvo").value, 10);
    const modelo = $("auto-modelo").value;
    if (!isNaN(bateriaInicial) && !isNaN(bateriaAlvo) && bateriaAlvo > bateriaInicial && modelo) {
      const tempo = calcularTempoEstimado(bateriaInicial, bateriaAlvo, modelo, $("bico-utilizado").value);
      if (tempo) {
        $("tempo-estimado").value = tempo;
      }
    }
  }

  $("bateria-inicial").addEventListener("input", atualizarTempoEstimadoAuto);
  $("bateria-alvo").addEventListener("input", atualizarTempoEstimadoAuto);
  $("bico-utilizado").addEventListener("change", function () {
    atualizarHintBico();
    atualizarTempoEstimadoAuto();
  });

  $("btn-fechar-turno").addEventListener("click", abrirFechamentoTurno);

  document.querySelectorAll("[data-quick-for]").forEach(function (grupo) {
    const campo = $(grupo.dataset.quickFor);
    const marcar = function () {
      grupo.querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.value === String(campo.value)));
      });
    };
    grupo.addEventListener("click", function (e) {
      const b = e.target.closest("button[data-value]");
      if (!b) return;
      campo.value = b.dataset.value;
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    });
    campo.addEventListener("input", marcar);
    marcar();
  });

  $("modal-fechar-iniciar").addEventListener("click", fecharModalIniciar);
  $("modal-iniciar").addEventListener("click", function (e) {
    if (e.target === this) fecharModalIniciar();
  });

  function fecharModalWhatsapp() { $("modal-whatsapp").classList.remove("show"); }
  $("btn-abrir-whatsapp").addEventListener("click", function () {
    atualizarPreviewWhatsApp();
    $("modal-whatsapp").classList.add("show");
  });
  $("modal-fechar-whatsapp").addEventListener("click", fecharModalWhatsapp);
  $("modal-whatsapp").addEventListener("click", function (e) {
    if (e.target === this) fecharModalWhatsapp();
  });

  const opData = $("op-data");
  if (opData) opData.textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  $("btn-ver-caixa").addEventListener("click", function () { irParaAba("tab-caixa"); });

  let htmlBicosRenderizado = null;

  function renderStatusBicos() {
    const fila = aguardando();
    const elQtd = $("qtd-fila-iniciar");
    if (elQtd) elQtd.textContent = fila.length + " aguardando";
    const cards = [];
    const cabecalho = function (b, estado) {
      return '<span class="bico-head"><span class="bico-name">Bico ' + b + '<span class="bico-kw">' + potenciaDoBico(b) + ' kW</span></span>' +
        '<span class="bico-state">' + estado + '</span></span>';
    };
    const anel = function (pct, alvo, legenda) {
      return '<span class="ring" style="--p:' + Math.max(0, Math.min(100, pct)) + ';--t:' + Math.max(0, Math.min(100, alvo)) + '">' +
        '<span class="ring-target"></span><span class="ring-value"><strong>' + pct + '%</strong><small>' + legenda + '</small></span></span>';
    };
    for (let b = 1; b <= totalConectores(); b++) {
      const s = sessoes.find(function (x) { return (x.status === "carregando" || x.status === "vaga-liberada") && x.bico === b; });
      if (s && s.status === "vaga-liberada") {
        cards.push(
          '<article class="bico" data-state="reservado" data-bico="' + b + '" data-fila-liberada="' + s.id + '" tabindex="0" role="button" aria-label="Bico ' + b + ' reservado para a fila. Selecionar cliente">' +
            '<span class="ring ring-icon"><svg aria-hidden="true"><use href="#i-clock"/></svg></span>' +
            cabecalho(b, "Vaga liberada") +
            '<span class="bico-body"><span class="who">Selecione o cliente da fila</span><span class="bico-cta">Iniciar</span></span>' +
          '</article>'
        );
      } else if (s) {
        const prog = progressoSessao(s);
        const final = prog && prog.restanteMin <= 5;
        const estado = !prog ? "Conectado" : final ? "Terminando" : "Carregando";
        const fim = prog
          ? '<span class="bico-time"><strong>' + prog.restanteMin + ' min</strong><small>término ' + pad2(prog.termino.getHours()) + ":" + pad2(prog.termino.getMinutes()) + '</small></span>'
          : '<span class="bico-time"><small>Aguardando valores</small></span>';
        cards.push(
          '<article class="bico" data-state="' + (final ? "final" : "carregando") + '" data-bico="' + b + '" tabindex="0" role="button" aria-label="Bico ' + b + ', ' + estado + ', placa ' + escapeAttr(s.placa) + '. Finalizar recarga">' +
            (prog ? anel(prog.pct, s.bateriaAlvo, "de " + s.bateriaAlvo + "%") : '<span class="ring ring-icon"><svg aria-hidden="true"><use href="#i-plug"/></svg></span>') +
            cabecalho(b, estado) +
            '<span class="bico-body">' + placaHtml(s.placa) +
              '<span class="who who-occ"><strong>' + escapeHtml(s.cliente || "Cliente não informado") + '</strong><span>' + escapeHtml(s.modelo || "") + '</span></span>' + fim +
            '</span>' +
          '</article>'
        );
      } else {
        cards.push(
          '<article class="bico" data-state="livre" data-bico="' + b + '" tabindex="0" role="button" aria-label="Bico ' + b + ' livre. Iniciar recarga">' +
            '<span class="ring ring-icon"><svg aria-hidden="true"><use href="#i-plug"/></svg></span>' +
            cabecalho(b, "Livre") +
            '<span class="bico-body"><span class="bico-free"><svg aria-hidden="true"><use href="#i-plus"/></svg>Iniciar recarga</span></span>' +
          '</article>'
        );
      }
    }
    const semVaga = bicoLivre() == null;
    if (fila.length > 0 || semVaga) {
      cards.push(
        '<div class="charger-queue">' +
          '<svg aria-hidden="true"><use href="#i-clock"/></svg>' +
          '<span class="charger-queue-label"><strong>Fila</strong>' + (fila.length ? fila.length + " aguardando" : "vazia") + '</span>' +
          '<span class="charger-queue-plates">' + fila.map(function (s, i) { return s.placa ? placaHtml(s.placa) : '<span class="tag">Cliente ' + (i + 1) + "</span>"; }).join("") + '</span>' +
          '<button type="button" class="btn btn-outline" data-fila-adicionar>Adicionar</button>' +
        '</div>'
      );
    }
    const elBicos = $("status-bicos-iniciar");
    const htmlBicos = cards.join("");
    if (elBicos && htmlBicos !== htmlBicosRenderizado) {
      htmlBicosRenderizado = htmlBicos;
      elBicos.innerHTML = htmlBicos;
      const adicionarFila = elBicos.querySelector("[data-fila-adicionar]");
      if (adicionarFila) adicionarFila.addEventListener("click", function () { abrirNovaRecarga(null); });
      elBicos.querySelectorAll("[data-bico]").forEach(function (card) {
        const agir = function () {
          const bico = Number(card.dataset.bico);
          const sessao = sessoes.find(function (s) { return (s.status === "carregando" || s.status === "vaga-liberada") && Number(s.bico) === bico; });
          if (sessao && sessao.status === "vaga-liberada") selecionarFilaLiberada(sessao.id);
          else if (sessao) abrirFinalizar(sessao.id);
          else abrirNovaRecarga(bico);
        };
        card.addEventListener("click", agir);
        card.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            agir();
          }
        });
      });
    }
  }

  /* ---------------- Sessões: Em Andamento ---------------- */

  function atualizarResumoOperacao() {
    const ativas = carregando().length;
    const fila = aguardando().length;
    const reservados = sessoes.filter(function (s) { return s.status === "vaga-liberada"; }).length;
    const livres = Math.max(0, totalConectores() - ativas - reservados);
    const pagamentos = abastecimentos.filter(ehPendente).length;
    $("op-stat-ativas").textContent = ativas;
    $("op-stat-ativas-info").textContent = ativas ? "Acompanhamento ao vivo" : "Nenhuma sessão em curso";
    $("op-stat-livres").textContent = livres;
    $("op-stat-livres-info").textContent = livres ? "Disponíveis agora" : "Todos ocupados";
    $("op-stat-fila").textContent = fila;
    $("op-stat-fila-info").textContent = fila ? "Próxima vaga por ordem" : "Sem espera";
    $("op-stat-pagamentos").textContent = pagamentos;
    $("op-stat-pagamentos-info").textContent = pagamentos ? "Ação necessária" : "Tudo em dia";
  }

  function renderSessoes() {
    const container = $("lista-sessoes");
    container.innerHTML = "";
    const ativas = carregando();
    const emFila = aguardando();
    const vagasLiberadas = sessoes.filter(function (s) { return s.status === "vaga-liberada"; });
    const total = ativas.length;
    $("qtd-sessoes").textContent = total + " ativa" + (total === 1 ? "" : "s");
    atualizarResumoOperacao();

    if (sessoes.length === 0) {
      container.innerHTML =
        '<div class="empty-state"><strong>Nenhum veículo abastecendo</strong>Use o formulário <strong>Iniciar Abastecimento</strong> acima.</div>';
      return;
    }

    ativas.forEach(function (s) {
      const div = document.createElement("div");
      div.className = "operation-session";
      const prog = progressoSessao(s);
      const bicoInfo = s.bico != null ? "Bico " + s.bico : "Bico não informado";
      const kwhParada = s.valorParada != null ? s.valorParada / config.tarifaKwh : null;
      const paradaHtml = kwhParada != null
        ? " · Parar em " + fmtKwh2(kwhParada) + " kWh (" + fmtMoeda(s.valorParada) + ")"
        : "";
      const kwhPreSalvos = totalKwhPartes(Array.isArray(s.kwhPartes) ? s.kwhPartes : []);
      const progressHtml = prog
        ? '<div class="operation-session-progress"><span style="width:' + Math.min(100, prog.pct) + '%;"></span></div>' +
          '<div class="operation-session-progress-line"><span>' + prog.pct + "% estimado</span><span>" + prog.restanteMin + " min restantes</span></div>"
        : '<div class="operation-session-pending">Aguardando valores para calcular a previsão.</div>';
      const btnValores = !prog
        ? '<button class="btn btn-edit" data-informar-valores="' + s.placa + '">Informar valores</button>'
        : "";
      const btnPrevisao = prog
        ? '<button class="btn btn-edit" data-previsao="' + s.id + '">Previsão</button>'
        : "";
      div.innerHTML =
        '<div class="operation-session-top">' +
          '<div class="operation-session-title">' +
            placaHtml(s.placa) +
            "<div><h3>" + escapeHtml(s.cliente) + "</h3>" +
              "<small>" + escapeHtml(s.modelo) + " · " + bicoInfo + "</small></div>" +
          "</div>" +
          '<span class="operation-session-status">Em andamento</span>' +
        "</div>" +
        progressHtml +
        '<div class="operation-session-grid">' +
          '<div><span>Bateria</span><strong>' + (s.bateriaInicial != null ? s.bateriaInicial + "% → " + s.bateriaAlvo + "%" : "—") + "</strong></div>" +
          '<div><span>Início</span><strong>' + formatarData(s.inicio) + "</strong></div>" +
          '<div><span>Término previsto</span><strong>' + (prog ? pad2(prog.termino.getHours()) + ":" + pad2(prog.termino.getMinutes()) : "A definir") + "</strong></div>" +
        "</div>" +
        (kwhPreSalvos > 0 || paradaHtml ? '<span class="operation-session-note">' + (kwhPreSalvos > 0 ? "kWh pré-salvos: " + fmtKwh(kwhPreSalvos) : "") + paradaHtml + "</span>" : "") +
        '<div class="operation-session-actions">' +
          btnValores + btnPrevisao +
          '<button class="btn btn-primary" data-finalizar="' + s.id + '">Finalizar</button>' +
          '<button class="btn btn-danger" data-cancelar="' + s.id + '">Cancelar</button>' +
        "</div>";
      container.appendChild(div);
    });

    if (emFila.length) {
      const fila = document.createElement("div");
      fila.className = "operation-session-queue";
      fila.innerHTML = "<h3>Na fila</h3>";
      emFila.forEach(function (s) {
        const item = document.createElement("div");
        item.className = "operation-session-queue-row";
        item.innerHTML =
            '<div><strong>' + escapeHtml(s.placa || "Espera sem cliente") + (s.cliente ? " · " + escapeHtml(s.cliente) : "") + "</strong>" +
            "<span>" + escapeHtml(s.modelo) + " · aguardando vaga</span></div>" +
          '<div class="operation-session-queue-actions">' +
            '<button class="btn btn-danger" data-cancelar="' + s.id + '">Cancelar</button>' +
          "</div>";
        fila.appendChild(item);
      });
      container.appendChild(fila);
    }

    if (vagasLiberadas.length) {
      const liberadas = document.createElement("div");
      liberadas.className = "operation-session-queue";
      liberadas.innerHTML = "<h3>Vagas liberadas</h3>";
      vagasLiberadas.forEach(function (s) {
        const item = document.createElement("div");
        item.className = "operation-session-queue-row";
        item.innerHTML =
          '<div><strong>Bico ' + escapeHtml(String(s.bico)) + " · Selecione o cliente</strong>" +
            "<span>Espera liberada — clique para iniciar o abastecimento</span></div>" +
          '<div class="operation-session-queue-actions">' +
            '<button class="btn btn-primary" data-fila-liberada="' + escapeAttr(s.id) + '">Selecionar cliente</button>' +
            '<button class="btn btn-danger" data-cancelar="' + escapeAttr(s.id) + '">Cancelar</button>' +
          "</div>";
        liberadas.appendChild(item);
      });
      container.appendChild(liberadas);
    }

    container.querySelectorAll("[data-finalizar]").forEach(function (btn) {
      btn.addEventListener("click", function () { abrirFinalizar(btn.dataset.finalizar); });
    });

    container.querySelectorAll("[data-informar-valores]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        prepararFormularioPara(btn.dataset.informarValores);
        irParaAba("tab-andamento");
      });
    });

    container.querySelectorAll("[data-previsao]").forEach(function (btn) {
      btn.addEventListener("click", function () { abrirPrevisao(btn.dataset.previsao); });
    });

    container.querySelectorAll("[data-fila-liberada]").forEach(function (btn) {
      btn.addEventListener("click", function () { selecionarFilaLiberada(btn.dataset.filaLiberada); });
    });

    container.querySelectorAll("[data-cancelar]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const s = sessoes.find((x) => x.id === btn.dataset.cancelar);
        if (!s) return;
        if (confirm("Cancelar o abastecimento da placa " + s.placa + "?")) {
          sessoes = sessoes.filter((x) => x.id !== s.id);
          salvarESyncIncremental(KEY_SESSOES, sessoes);
          renderSessoes();
          const promovidos = promoverFila();
          renderStatusBicos();
          atualizarPreviewWhatsApp();
          if (promovidos.length) {
            const p = promovidos[0];
            irParaAba("tab-andamento");
            mostrarAlerta("Abastecimento cancelado. O Bico " + p.bico + " foi liberado para selecionar o próximo cliente.", "success");
          } else {
            mostrarAlerta("Abastecimento cancelado.", "success");
          }
        }
      });
    });
  }

  /* ---------------- Pagamentos pendentes ---------------- */

  function renderPendentes() {
    const container = $("lista-pendentes");
    const pendentes = abastecimentos
      .filter(ehPendente)
      .slice()
      .sort(function (a, b) { return new Date(b.data) - new Date(a.data); });
    $("qtd-pendentes").textContent = pendentes.length + " pendente" + (pendentes.length === 1 ? "" : "s");
    atualizarResumoOperacao();
    container.innerHTML = "";

    if (pendentes.length === 0) {
      container.innerHTML =
        '<div class="empty-state operation-feed-empty"><strong>Nenhum pagamento a receber</strong>Recargas finalizadas como pendentes aparecem aqui.</div>';
      return;
    }

    pendentes.forEach(function (r) {
      const div = document.createElement("div");
      div.className = "list-item pend-item";
      div.dataset.kind = "pagamento";
      const consumo = r.consumoConveniencia === "Sim" && r.valorConsumo
        ? " + consumo " + fmtMoeda(r.valorConsumo)
        : "";
      div.innerHTML =
        '<span class="pend-type">Pagamento a receber<time>' + formatarData(r.data) + "</time></span>" +
        '<span class="pend-main">' + placaHtml(r.placa) +
          '<span class="pend-who"><strong>' + escapeHtml(r.cliente) + "</strong>" + escapeHtml(r.modelo) + " · " + fmtKwh(r.kwhUtilizado) + " kWh" + consumo + "</span>" +
          '<span class="pend-amount">' + fmtMoeda(r.valorPagar) + "</span>" +
        "</span>" +
        '<button class="btn btn-primary" data-registrar-pag="' + r.id + '">Receber</button>';
      container.appendChild(div);
    });

    container.querySelectorAll("[data-registrar-pag]").forEach(function (btn) {
      btn.addEventListener("click", function () { abrirPagamento(btn.dataset.registrarPag); });
    });
  }

  /* ---------------- Finalização ---------------- */
  let finalizandoId = null;
  // Notificações fechadas persistem entre recargas da página enquanto a sessão estiver ativa.
  let notificacoes5MinFechadas = new Set(carregar(KEY_NOTIFICACOES_FECHADAS, []));

  function textoRestante5Min(progresso) {
    return progresso.restanteMin > 0 ? progresso.restanteMin + " min restantes" : "Tempo previsto atingido";
  }

  // Os 5 minutos finais aparecem no pulso do bico e num ponto na aba Operação.
  function atualizarAlertaAbaOperacao(ativas) {
    const terminando = ativas.some(function (s) {
      const progresso = progressoSessao(s);
      return progresso && progresso.restanteMin <= 5;
    });
    document.querySelectorAll('.tab-btn[data-tab="tab-andamento"]').forEach(function (botao) {
      botao.classList.toggle("tem-alerta", terminando);
    });
  }

  function renderNotificacoes5Min() {
    const container = $("notificacoes-5min");
    if (!container) return;
    const ativas = carregando();
    atualizarAlertaAbaOperacao(ativas);
    const idsAtivos = new Set(ativas.map(function (s) { return s.id; }));

    container.querySelectorAll("[data-notificacao-sessao]").forEach(function (el) {
      if (!idsAtivos.has(el.dataset.notificacaoSessao)) el.remove();
    });
    const fechadasAtivas = new Set(Array.from(notificacoes5MinFechadas).filter(function (id) { return idsAtivos.has(id); }));
    if (fechadasAtivas.size !== notificacoes5MinFechadas.size) {
      notificacoes5MinFechadas = fechadasAtivas;
      salvar(KEY_NOTIFICACOES_FECHADAS, Array.from(notificacoes5MinFechadas));
    }

    ativas.forEach(function (s) {
      const progresso = progressoSessao(s);
      if (!progresso) return;
      const existente = $("notificacao-5min-" + s.id);
      if (existente) {
        const barra = existente.querySelector("[data-notificacao-progresso]");
        const percentual = existente.querySelector("[data-notificacao-percentual]");
        const restante = existente.querySelector("[data-notificacao-restante]");
        const termino = existente.querySelector("[data-notificacao-termino]");
        if (barra) barra.style.width = Math.min(100, progresso.pct) + "%";
        if (percentual) percentual.textContent = progresso.pct + "% de " + s.bateriaAlvo + "%";
        if (restante) restante.textContent = textoRestante5Min(progresso);
        if (termino) termino.textContent = pad2(progresso.termino.getHours()) + ":" + pad2(progresso.termino.getMinutes());
        return;
      }
      if (progresso.restanteMin > 5 || notificacoes5MinFechadas.has(s.id)) return;

      const notificacao = document.createElement("article");
      notificacao.id = "notificacao-5min-" + s.id;
      notificacao.className = "notificacao-5min-item";
      notificacao.dataset.notificacaoSessao = s.id;
      notificacao.tabIndex = 0;
      notificacao.setAttribute("role", "button");
      notificacao.setAttribute("aria-label", "Abrir abastecimento da placa " + (s.placa || "não informada"));
      notificacao.innerHTML =
        '<div class="notificacao-5min-head"><div><span class="notificacao-5min-title">Carregando</span><span class="notificacao-5min-status">5 min finais</span></div>' +
          '<span class="notificacao-5min-bico">BICO ' + escapeHtml(String(s.bico)) + '</span></div>' +
        '<div class="notificacao-5min-carro">' + placaHtml(s.placa) + '<span>' + escapeHtml(s.cliente || "Cliente não informado") + ' · ' + escapeHtml(s.modelo || "Modelo não informado") + '</span></div>' +
        '<div class="notificacao-5min-progress"><div class="progress-track"><div class="progress-fill" data-notificacao-progresso style="width:' + Math.min(100, progresso.pct) + '%;"></div></div>' +
          '<div class="notificacao-5min-progress-line"><span data-notificacao-percentual>' + progresso.pct + '% de ' + s.bateriaAlvo + '%</span><span data-notificacao-restante>' + textoRestante5Min(progresso) + '</span></div></div>' +
        '<div class="notificacao-5min-termino">Término previsto: <strong data-notificacao-termino>' + pad2(progresso.termino.getHours()) + ':' + pad2(progresso.termino.getMinutes()) + '</strong></div>' +
        '<div class="notificacao-5min-actions">' +
          '<button type="button" class="btn btn-edit" data-notificacao-previsao="' + escapeAttr(s.id) + '">Previsão</button>' +
          '<button type="button" class="btn btn-primary" data-notificacao-finalizar="' + escapeAttr(s.id) + '">Finalizar</button>' +
          '<button type="button" class="btn btn-outline" data-notificacao-fechar="' + escapeAttr(s.id) + '" aria-label="Fechar notificação">Fechar</button>' +
        '</div>';
      container.appendChild(notificacao);
    });
  }

  function selecionarFilaLiberada(id) {
    const reserva = sessoes.find(function (s) { return s.id === id && s.status === "vaga-liberada"; });
    if (!reserva) return;
    filaLiberadaSelecionadaId = id;
    $("select-placa").value = "";
    $("select-placa-value").value = "";
    $("auto-nome").value = "";
    $("auto-modelo").value = "";
    atualizarModoFormulario();
    abrirModalIniciar($("select-placa"));
  }

  $("notificacoes-5min").addEventListener("click", function (e) {
    const previsao = e.target.closest("[data-notificacao-previsao]");
    const finalizar = e.target.closest("[data-notificacao-finalizar]");
    const fechar = e.target.closest("[data-notificacao-fechar]");
    const item = e.target.closest("[data-notificacao-sessao]");
    if (previsao) {
      e.stopPropagation();
      abrirPrevisao(previsao.dataset.notificacaoPrevisao);
    } else if (finalizar) {
      e.stopPropagation();
      abrirFinalizar(finalizar.dataset.notificacaoFinalizar);
    } else if (fechar) {
      e.stopPropagation();
      const notificacao = $("notificacao-5min-" + fechar.dataset.notificacaoFechar);
      if (notificacao) notificacao.remove();
      notificacoes5MinFechadas.add(fechar.dataset.notificacaoFechar);
      salvar(KEY_NOTIFICACOES_FECHADAS, Array.from(notificacoes5MinFechadas));
    } else if (item) {
      const sessao = sessoes.find(function (s) { return s.id === item.dataset.notificacaoSessao; });
      if (!sessao) {
        item.remove();
        return;
      }
      prepararFormularioPara(sessao.placa);
      irParaAba("tab-andamento");
    }
  });

  $("notificacoes-5min").addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-notificacao-sessao]")) {
      e.preventDefault();
      e.target.click();
    }
  });
  let itensConsumoFin = [];
  let consumosVinculadosFin = [];
  let kwhPartesFin = [];

  function totalKwhPartes(partes) {
    return partes.reduce(function (total, parte) { return total + (Number(parte) || 0); }, 0);
  }

  function renderKwhPartes(containerId, partes, hiddenId, aoAlterar) {
    const container = $(containerId);
    container.innerHTML = partes.map(function (parte, i) {
      return '<div class="kwh-parte"><input type="text" inputmode="decimal" autocomplete="off" placeholder="0,000" value="' + mascararKwhTres(Math.round((Number(parte) || 0) * 1000)) + '" data-kwh-parte="' + i + '"><button type="button" class="btn btn-outline" data-remover-kwh="' + i + '"' + (partes.length === 1 ? ' disabled' : '') + '>Remover</button></div>';
    }).join("");
    $(hiddenId).value = mascararKwhTres(Math.round(totalKwhPartes(partes) * 1000));
    aoAlterar();
  }

  function atualizarKwhParte(el, partes, hiddenId, aoAlterar) {
    const indice = parseInt(el.dataset.kwhParte, 10);
    el.value = mascararKwhTres(el.value);
    partes[indice] = kwhDaMascara(el.value);
    $(hiddenId).value = mascararKwhTres(Math.round(totalKwhPartes(partes) * 1000));
    aoAlterar();
    try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {}
  }

  function renderItensConsumo(containerId, itens, aoAlterar) {
    const container = $(containerId);
    container.innerHTML = itens.map(function (item, i) {
      const produto = produtoPorId(item.produtoId);
      const texto = produto ? nomeProduto(produto) + " (" + fmtMoeda(produto.valor) + ")" : "";
      return '<div class="consumo-item"><div class="combobox"><input type="text" autocomplete="off" placeholder="Digite para buscar produto..." value="' + escapeAttr(texto) + '" data-consumo-busca="' + i + '"><input type="hidden" data-consumo-produto="' + i + '" value="' + escapeAttr(item.produtoId || "") + '"><div class="combobox-dropdown" data-consumo-dropdown="' + i + '" role="listbox" aria-label="Sugestões de produtos"></div><span class="combobox-arrow">▾</span></div><input type="number" min="1" step="1" value="' + (item.quantidade || 1) + '" data-consumo-qtd="' + i + '" title="Quantidade"><button type="button" class="btn btn-danger" data-remover-consumo="' + i + '">Remover</button></div>';
    }).join("");
    aoAlterar();
  }

  function produtosParaConsumo(termo) {
    const normalizar = function (valor) { return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(); };
    const busca = normalizar(termo).trim();
    return produtosOrdenados().filter(function (produto) {
      return vendavel(produto) && (!busca || normalizar(nomeProduto(produto)).includes(busca) || normalizar(produto.categoria).includes(busca));
    });
  }

  function renderSugestoesConsumo(input) {
    const dropdown = input.parentElement.querySelector("[data-consumo-dropdown]");
    const produtosFiltrados = produtosParaConsumo(input.value);
    if (!produtosFiltrados.length) {
      dropdown.innerHTML = '<div class="combobox-empty">Nenhum produto encontrado para "' + escapeHtml(input.value) + '"</div>';
    } else {
      dropdown.innerHTML = produtosFiltrados.map(function (produto) {
        return '<div class="combobox-option" data-consumo-opcao="' + escapeAttr(produto.id) + '" role="option" tabindex="-1"><div class="plate">' + highlightMatch(nomeProduto(produto), input.value) + '</div><div class="client-info"><span class="client-name">' + highlightMatch(produto.categoria, input.value) + '</span><span class="client-model">' + fmtMoeda(produto.valor) + ' · Est: ' + (estoqueInformado(produto) ? produto.estoque : "—") + '</span></div></div>';
      }).join("");
    }
    dropdown.classList.add("show");
    input.closest(".combobox").classList.add("open");
  }

  function configurarItensConsumo(containerId, obterItens, aoAlterar) {
    const container = $(containerId);
    container.addEventListener("input", function (e) {
      const qtd = e.target.closest("[data-consumo-qtd]");
      if (qtd) {
        const itens = obterItens();
        itens[parseInt(qtd.dataset.consumoQtd, 10)].quantidade = qtd.value;
        aoAlterar();
        return;
      }
      const busca = e.target.closest("[data-consumo-busca]");
      if (!busca) return;
      const itens = obterItens();
      const indice = parseInt(busca.dataset.consumoBusca, 10);
      itens[indice].produtoId = "";
      busca.parentElement.querySelector("[data-consumo-produto]").value = "";
      renderSugestoesConsumo(busca);
      aoAlterar();
    });
    container.addEventListener("focusin", function (e) {
      const busca = e.target.closest("[data-consumo-busca]");
      if (busca) renderSugestoesConsumo(busca);
    });
    container.addEventListener("keydown", function (e) {
      const busca = e.target.closest("[data-consumo-busca]");
      if (!busca) return;
      const dropdown = busca.parentElement.querySelector("[data-consumo-dropdown]");
      const opcoes = Array.from(dropdown.querySelectorAll("[data-consumo-opcao]"));
      if (e.key === "Escape") { dropdown.classList.remove("show"); busca.closest(".combobox").classList.remove("open"); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
      e.preventDefault();
      const atual = opcoes.findIndex(function (opcao) { return opcao.classList.contains("highlighted"); });
      if (e.key === "Enter" && atual >= 0) opcoes[atual].click();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const proximo = e.key === "ArrowDown" ? Math.min(atual + 1, opcoes.length - 1) : Math.max(atual - 1, 0);
        opcoes.forEach(function (opcao, i) { opcao.classList.toggle("highlighted", i === proximo); });
        if (opcoes[proximo]) opcoes[proximo].scrollIntoView({ block: "nearest" });
      }
    });
    container.addEventListener("click", async function (e) {
      const opcao = e.target.closest("[data-consumo-opcao]");
      if (opcao) {
        const itens = obterItens();
        const indice = parseInt(opcao.closest(".combobox").querySelector("[data-consumo-busca]").dataset.consumoBusca, 10);
        const produto = produtoPorId(opcao.dataset.consumoOpcao);
        if (!produto) return;
        if (comboConfiguravel(produto)) {
          const escolhas = await escolherItensCombo(produto);
          if (!escolhas) return;
          itens[indice].alocacoesEstoque = escolhas;
        } else delete itens[indice].alocacoesEstoque;
        itens[indice].produtoId = produto.id;
        const combobox = opcao.closest(".combobox");
        combobox.querySelector("[data-consumo-busca]").value = nomeProduto(produto) + " (" + fmtMoeda(produto.valor) + ")";
        combobox.querySelector("[data-consumo-produto]").value = produto.id;
        combobox.querySelector("[data-consumo-dropdown]").classList.remove("show");
        combobox.classList.remove("open");
        aoAlterar();
        return;
      }
      const btn = e.target.closest("[data-remover-consumo]");
      if (!btn) return;
      const itens = obterItens();
      itens.splice(parseInt(btn.dataset.removerConsumo, 10), 1);
      renderItensConsumo(containerId, itens, aoAlterar);
    });
  }

  function itensConsumoDetalhados(itens) {
    const detalhados = [];
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      const produto = produtoPorId(item.produtoId);
      const quantidade = parseInt(item.quantidade, 10);
      if (!produto || isNaN(quantidade) || quantidade <= 0) return null;
      const alocacoes = item.alocacoesEstoque ? item.alocacoesEstoque.map(function (alocacao) { return Object.assign({}, alocacao, { quantidade: alocacao.quantidade * quantidade }); }) : null;
      detalhados.push({ id: produto.id, produtoPaiId: produto.produtoPaiId || null, variante: produto.variante || "Padrão", nome: nomeProduto(produto), categoria: produto.categoria, valorUnitario: produto.valor, quantidade: quantidade, valorTotal: produto.valor * quantidade, alocacoesEstoque: alocacoes, estoqueBaixado: true, estoqueReferenciaId: item.estoqueReferenciaId || gerarId("ref") });
    }
    return detalhados;
  }

  function validarEstoqueItens(itens) {
    const totais = {};
    itens.forEach(function (item) {
      if (item.alocacoesEstoque) item.alocacoesEstoque.forEach(function (alocacao) { totais[alocacao.produtoId] = (totais[alocacao.produtoId] || 0) + alocacao.quantidade; });
      else totais[item.id] = (totais[item.id] || 0) + item.quantidade;
    });
    for (const id in totais) {
      const erro = validarBaixaEstoque(produtoPorId(id), totais[id]);
      if (erro) return erro;
    }
    return null;
  }

  function baixarEstoqueItens(itens) {
    itens.forEach(function (item) {
      if (item.alocacoesEstoque) alterarAlocacoesEstoque(item.alocacoesEstoque, -1);
      else baixarEstoque(produtoPorId(item.id), item.quantidade);
    });
    if (itens.some(function (item) { return item.alocacoesEstoque; })) salvarESyncIncremental(KEY_PRODUTOS, produtos, "produtos");
  }

  function registrarVendasDoAbastecimento(registro, itens, metodoPagamento) {
    itens.forEach(function (item) {
      const vendaId = gerarId("v");
      vendas.push({
        id: vendaId,
        idAbastecimento: registro.id,
        produtoId: item.id || item.produtoId || null,
        produtoPaiId: item.produtoPaiId || null,
        variante: item.variante || "Padrão",
        itensCombo: item.itensCombo || null,
        estoqueReferenciaId: item.estoqueReferenciaId || vendaId,
        estoqueBaixado: true,
        alocacoesEstoque: item.alocacoesEstoque || null,
        produto: nomeSnapshotProduto(item),
        categoria: item.categoria,
        valorUnitario: item.valorUnitario,
        quantidade: item.quantidade,
        valorTotal: item.valorTotal,
        metodoPagamento: metodoPagamento,
        turno: registro.turno,
        dataOperacional: registro.dataOperacional,
        inicioTurno: registro.inicioTurno,
        fimTurno: registro.fimTurno,
        operador: registro.operador,
        perfil: registro.perfil,
        data: registro.data
      });
    });
    if (itens.length) salvarESyncIncremental(KEY_VENDAS, vendas);
  }

  function abrirFinalizar(id) {
    const s = sessoes.find((x) => x.id === id);
    if (!s) return;
    finalizandoId = id;
    consumosVinculadosFin = vendasPendentes.filter(function (venda) { return venda.idSessao === s.id; }).map(function (venda) {
      return { id: venda.produtoId, produtoPaiId: venda.produtoPaiId || null, variante: venda.variante || "Padrão", itensCombo: venda.itensCombo || null, nome: nomeSnapshotProduto(venda), categoria: venda.categoria, valorUnitario: venda.valorUnitario, quantidade: venda.quantidade, valorTotal: venda.valorTotal, estoqueBaixado: !!venda.estoqueBaixado, estoqueReferenciaId: venda.estoqueReferenciaId, alocacoesEstoque: venda.alocacoesEstoque || null };
    });
    $("fin-titulo").textContent = s.placa;
    $("fin-info").textContent =
      "Modelo: " + s.modelo + " · Início: " + formatarData(s.inicio) +
      " · Bateria: " + (s.bateriaInicial != null ? s.bateriaInicial + "% → " + s.bateriaAlvo + "%" : "—") +
      " · Tempo decorrido: " + formatarDuracao((Date.now() - new Date(s.inicio)) / 1000);
    const partesSalvas = Array.isArray(s.kwhPartes) ? s.kwhPartes.filter(function (parte) { return (Number(parte) || 0) > 0; }) : [];
    kwhPartesFin = partesSalvas.concat([0]);
    $("fin-valor-kwh").value = moedaParaCampo(config.tarifaKwh);
    $("fin-valor-pagar").value = "R$ 0,00";
    $("fin-metodo").value = "Pix";
    $("fin-valor-entregue").value = "";
    $("fin-troco").value = "R$ 0,00";
    ["fin-cedulas-recebidas", "fin-moedas-recebidas", "fin-cedulas-troco", "fin-moedas-troco"].forEach(function (id) { $(id).value = ""; });
    $("campo-fin-dinheiro").style.display = "none";
    $("campo-fin-troco").style.display = "none";
    document.querySelector('input[name="fin-pag-div"][value="Não"]').checked = true;
    $("campo-fin-div").style.display = "flex";
    $("campo-fin-divisao").style.display = "none";
    $("campo-fin-metodo").style.display = "flex";
    $("fin-divisao-lista").innerHTML = "";
    $("soma-fin-divisao").textContent = "";
    $("soma-fin-divisao").classList.remove("warn");
    document.querySelector('input[name="fin-consumo"][value="Não"]').checked = true;
    $("campo-fin-produto-consumo").style.display = "none";
    $("campo-fin-consumos-vinculados").style.display = consumosVinculadosFin.length ? "flex" : "none";
    $("fin-consumos-vinculados").innerHTML = consumosVinculadosFin.map(function (item) {
      return '<div class="consumo-item"><span><strong>' + escapeHtml(nomeSnapshotProduto(item)) + '</strong><br><small>' + escapeHtml(item.categoria || "—") + '</small></span><span>x' + item.quantidade + '</span><strong>' + fmtMoeda(item.valorTotal) + '</strong></div>';
    }).join("");
    itensConsumoFin = [];
    renderKwhPartes("fin-kwh-partes", kwhPartesFin, "fin-kwh", calcularValorFin);
    renderItensConsumo("fin-consumo-itens", itensConsumoFin, calcularValorFin);
    calcularValorFin();
    $("modal-finalizar").classList.add("show");
  }

  function fecharFinalizar() {
    $("modal-finalizar").classList.remove("show");
    finalizandoId = null;
  }

  function valorConsumoFin() {
    return itensConsumoFin.reduce(function (total, item) {
      const produto = produtoPorId(item.produtoId);
      return total + (produto ? produto.valor * (parseInt(item.quantidade, 10) || 0) : 0);
    }, 0);
  }

  function calcularValorFin() {
    const kwh = totalKwhPartes(kwhPartesFin);
    const valorKwh = moedaDaMascara($("fin-valor-kwh").value);
    if (isNaN(kwh) || isNaN(valorKwh) || kwh < 0 || valorKwh < 0) {
      $("fin-valor-pagar").value = "R$ 0,00";
      return;
    }
    const totalCalculado = kwh * valorKwh + valorConsumoFin() + valorConsumoVinculadoFin();
    $("fin-valor-pagar").value = fmtMoeda(totalCalculado);
    if ($("fin-total")) atualizarResumoFin();
    atualizarSomaDivisao($("fin-divisao-lista"), "soma-fin-divisao", getTotalFin);
    calcularTroco();
  }

  function calcularTroco() {
    const dividido = document.querySelector('input[name="fin-pag-div"]:checked').value === "Sim";
    atualizarNumerario("fin", dividido ? totalDinheiroDividido($("fin-divisao-lista")) : totalDeValorExibido($("fin-valor-pagar").value));
  }

  function atualizarCampoDinheiro() {
    const radioPagDiv = document.querySelector('input[name="fin-pag-div"]:checked');
    const divididoSim = radioPagDiv ? radioPagDiv.value === "Sim" : false;
    const mostrar = divididoSim
      ? temParcelaDinheiro($("fin-divisao-lista"))
      : $("fin-metodo").value === "Dinheiro";
    $("campo-fin-dinheiro").style.display = mostrar ? "flex" : "none";
    $("campo-fin-troco").style.display = mostrar ? "flex" : "none";
    if (!mostrar) {
      $("fin-valor-entregue").value = "";
      $("fin-troco").value = "R$ 0,00";
      ["fin-cedulas-recebidas", "fin-moedas-recebidas", "fin-cedulas-troco", "fin-moedas-troco"].forEach(function (id) { $(id).value = ""; });
    } else {
      calcularTroco();
    }
  }

  $("fin-valor-entregue").addEventListener("input", calcularTroco);
  ["fin-cedulas-recebidas", "fin-moedas-recebidas"].forEach(function (id) { $(id).addEventListener("input", calcularTroco); });

  $("fin-valor-kwh").addEventListener("input", calcularValorFin);

  const TOTAL_EM_DINHEIRO = {
    fin: function () {
      const dividido = document.querySelector('input[name="fin-pag-div"]:checked').value === "Sim";
      return dividido ? totalDinheiroDividido($("fin-divisao-lista")) : totalDeValorExibido($("fin-valor-pagar").value);
    },
    pag: function () {
      const dividido = document.querySelector('input[name="pag-pag-div"]:checked').value === "Sim";
      return dividido ? totalDinheiroDividido($("pag-divisao-lista")) : getTotalPag();
    },
    venda: function () { return totalDeValorExibido($("venda-total").textContent); },
    pend: function () { return totalDeValorExibido($("pend-total").value); }
  };
  const FORM_DINHEIRO = { fin: "form-finalizar", pag: "form-pagamento", venda: "form-venda", pend: "form-venda-pendente" };

  function sinalMoeda(v) {
    return (v > 0 ? "+" : "−") + fmtMoeda(Math.abs(v));
  }

  function atualizarArredondamento(prefixo) {
    const bloco = $("arred-" + prefixo);
    if (!bloco) return;
    const total = arred(TOTAL_EM_DINHEIRO[prefixo]());
    const estado = arredondamentoDinheiro[prefixo] || (arredondamentoDinheiro[prefixo] = { modo: "exato" });
    const baixo = Math.floor(total + 1e-9);
    const cima = Math.ceil(total - 1e-9);
    const opcoes = [{ modo: "exato", rotulo: "Exato", valor: total }];
    if (baixo > 0 && baixo < total - 0.009) opcoes.push({ modo: "baixo", rotulo: fmtMoeda(baixo), valor: baixo });
    if (cima > total + 0.009) opcoes.push({ modo: "cima", rotulo: fmtMoeda(cima), valor: cima });
    opcoes.push({ modo: "outro", rotulo: "Outro valor" });
    if (!opcoes.some(function (o) { return o.modo === estado.modo; })) estado.modo = "exato";
    const grupo = bloco.querySelector(".arredondar-opcoes");
    grupo.style.gridTemplateColumns = "repeat(" + opcoes.length + ", minmax(0, 1fr))";
    grupo.innerHTML = opcoes.map(function (o) {
      const nota = o.modo === "exato" ? fmtMoeda(total) : o.valor != null ? sinalMoeda(o.valor - total) : "até " + fmtMoeda(ARREDONDAMENTO_MAXIMO);
      return '<button type="button" class="chip-option" role="radio" data-arred="' + o.modo + '" aria-checked="' + (o.modo === estado.modo) + '">' + o.rotulo + "<small>" + nota + "</small></button>";
    }).join("");
    const outro = bloco.querySelector(".arredondar-outro");
    outro.hidden = estado.modo !== "outro";
    const alvo = arred(alvoDinheiro(prefixo, total));
    const diferenca = arred(alvo - total);
    const dica = bloco.querySelector(".arredondar-dica");
    dica.classList.toggle("erro", Math.abs(diferenca) > ARREDONDAMENTO_MAXIMO + 0.009);
    dica.textContent = Math.abs(diferenca) > ARREDONDAMENTO_MAXIMO + 0.009
      ? "Passa de " + fmtMoeda(ARREDONDAMENTO_MAXIMO) + " de diferença. Ajuste o valor ou registre como Pendente."
      : diferenca
        ? "Cobrando " + fmtMoeda(alvo) + ", " + sinalMoeda(diferenca) + " de arredondamento."
        : "Pode cobrar até " + fmtMoeda(ARREDONDAMENTO_MAXIMO) + " a mais ou a menos.";
    atualizarTrocoPix(prefixo);
  }

  function atualizarTrocoPix(prefixo) {
    const dica = $(prefixo + "-troco-pix-dica");
    if (!dica) return;
    const ativo = trocoPixAtivo(prefixo);
    dica.hidden = !ativo;
    if (!ativo) return;
    const recebido = valorNumerario(prefixo + "-cedulas-recebidas") + valorNumerario(prefixo + "-moedas-recebidas");
    const valor = arred(Math.max(0, recebido - alvoDinheiro(prefixo, arred(TOTAL_EM_DINHEIRO[prefixo]()))));
    dica.textContent = valor > 0
      ? "Envie " + fmtMoeda(valor) + " por Pix ao cliente. O dinheiro entregue fica todo na gaveta."
      : "Informe o dinheiro recebido para calcular o troco em Pix.";
  }

  function definirTrocoPix(prefixo, ativo) {
    const sw = $(prefixo + "-troco-pix");
    if (!sw) return;
    sw.setAttribute("aria-checked", String(ativo));
    sw.closest(".field").classList.toggle("troco-pix-on", ativo);
    if (ativo) [prefixo + "-cedulas-troco", prefixo + "-moedas-troco"].forEach(function (id) { $(id).value = ""; });
    atualizarTrocoPix(prefixo);
  }

  PREFIXOS_ARREDONDAMENTO.forEach(function (prefixo) {
    const campo = $("campo-" + prefixo + "-dinheiro");
    if (!campo) return;
    const bloco = document.createElement("div");
    bloco.className = "arredondar";
    bloco.id = "arred-" + prefixo;
    bloco.innerHTML = '<span class="field-label">Valor cobrado</span>' +
      '<div class="chip-select arredondar-opcoes" role="radiogroup" aria-label="Valor cobrado em dinheiro"></div>' +
      '<div class="arredondar-outro" hidden><label for="' + prefixo + '-cobrado-outro" class="sr-only">Outro valor cobrado</label><input type="text" class="currency-input" id="' + prefixo + '-cobrado-outro" inputmode="numeric" placeholder="R$ 0,00" autocomplete="off"></div>' +
      '<p class="help arredondar-dica"></p>';
    campo.insertBefore(bloco, campo.firstChild);
    const outro = bloco.querySelector("input");
    outro.addEventListener("input", function () {
      this.value = mascararMoeda(this.value);
      atualizarArredondamento(prefixo);
      this.dispatchEvent(new Event("change", { bubbles: true }));
    });
    bloco.addEventListener("click", function (e) {
      const b = e.target.closest("[data-arred]");
      if (!b) return;
      arredondamentoDinheiro[prefixo] = { modo: b.dataset.arred };
      atualizarArredondamento(prefixo);
      if (b.dataset.arred === "outro") outro.focus();
      if (prefixo === "fin") calcularTroco();
      if (prefixo === "pag") calcularTrocoPag();
    });
    const form = $(FORM_DINHEIRO[prefixo]);
    ["input", "change"].forEach(function (tipo) {
      form.addEventListener(tipo, function (e) {
        if (e.target === outro) return;
        atualizarArredondamento(prefixo);
      });
    });
    form.addEventListener("click", function () { setTimeout(function () { atualizarArredondamento(prefixo); }, 0); });
    // Cada cobrança começa no valor exato
    new MutationObserver(function () {
      if (!form.closest(".modal-overlay").classList.contains("show")) return;
      arredondamentoDinheiro[prefixo] = { modo: "exato" };
      outro.value = "";
      atualizarArredondamento(prefixo);
    }).observe(form.closest(".modal-overlay"), { attributes: true, attributeFilter: ["class"] });
  });

  PREFIXOS_ARREDONDAMENTO.forEach(function (prefixo) {
    const cedulasTroco = $(prefixo + "-cedulas-troco");
    if (!cedulasTroco) return;
    const grade = cedulasTroco.closest(".cash-breakdown");
    grade.classList.add("troco-dinheiro");
    const sugerido = $(prefixo + "-troco");
    if (sugerido) sugerido.classList.add("troco-dinheiro");
    const linha = document.createElement("div");
    linha.className = "toggle-row troco-pix-linha";
    linha.innerHTML = '<span id="' + prefixo + '-troco-pix-rotulo">Troco em Pix</span><button type="button" class="switch" role="switch" aria-checked="false" aria-labelledby="' + prefixo + '-troco-pix-rotulo" id="' + prefixo + '-troco-pix"></button>';
    grade.parentNode.insertBefore(linha, grade);
    const dica = document.createElement("p");
    dica.className = "help troco-pix-dica";
    dica.id = prefixo + "-troco-pix-dica";
    dica.setAttribute("aria-live", "polite");
    dica.hidden = true;
    (sugerido || grade).after(dica);
    $(prefixo + "-troco-pix").addEventListener("click", function () {
      definirTrocoPix(prefixo, this.getAttribute("aria-checked") !== "true");
      if (prefixo === "fin") calcularTroco();
      if (prefixo === "pag") calcularTrocoPag();
    });
    // Cada cobrança começa com o troco em dinheiro
    const overlay = $(FORM_DINHEIRO[prefixo]).closest(".modal-overlay");
    new MutationObserver(function () {
      if (overlay.classList.contains("show")) definirTrocoPix(prefixo, false);
    }).observe(overlay, { attributes: true, attributeFilter: ["class"] });
  });

  $("btn-add-fin-kwh").addEventListener("click", function () { kwhPartesFin.push(0); renderKwhPartes("fin-kwh-partes", kwhPartesFin, "fin-kwh", calcularValorFin); });
  $("fin-kwh-partes").addEventListener("input", function (e) { const el = e.target.closest("[data-kwh-parte]"); if (el) atualizarKwhParte(el, kwhPartesFin, "fin-kwh", calcularValorFin); });
  $("fin-kwh-partes").addEventListener("click", function (e) { const btn = e.target.closest("[data-remover-kwh]"); if (!btn) return; kwhPartesFin.splice(parseInt(btn.dataset.removerKwh, 10), 1); renderKwhPartes("fin-kwh-partes", kwhPartesFin, "fin-kwh", calcularValorFin); });
  $("btn-salvar-kwh-parcial").addEventListener("click", function () {
    const sessao = sessoes.find((x) => x.id === finalizandoId);
    const partes = kwhPartesFin.filter(function (parte) { return (Number(parte) || 0) > 0; });
    if (!sessao || totalKwhPartes(partes) <= 0) {
      mostrarAlerta("Informe pelo menos uma leitura de kWh para salvar parcialmente.", "error");
      return;
    }
    sessao.kwhPartes = partes;
    sessao.kwhParcialAtualizadoEm = new Date().toISOString();
    salvarESyncIncremental(KEY_SESSOES, sessoes);
    fecharFinalizar();
    renderSessoes();
    renderStatusBicos();
    atualizarPreviewWhatsApp();
    mostrarAlerta("Leitura parcial de " + fmtKwh(totalKwhPartes(partes)) + " kWh salva. A recarga continua em andamento.", "success");
  });
  $("btn-add-fin-consumo").addEventListener("click", function () { itensConsumoFin.push({ produtoId: "", quantidade: 1 }); renderItensConsumo("fin-consumo-itens", itensConsumoFin, calcularValorFin); });
  configurarItensConsumo("fin-consumo-itens", function () { return itensConsumoFin; }, calcularValorFin);

  document.querySelectorAll('input[name="fin-consumo"]').forEach(function (r) {
    r.addEventListener("change", function () {
      const sim = this.value === "Sim";
      $("campo-fin-produto-consumo").style.display = sim ? "flex" : "none";
      if (sim && itensConsumoFin.length === 0) itensConsumoFin.push({ produtoId: "", quantidade: 1 });
      if (!sim) itensConsumoFin = [];
      renderItensConsumo("fin-consumo-itens", itensConsumoFin, calcularValorFin);
      calcularValorFin();
    });
  });

  $("fin-metodo").addEventListener("change", function () {
    const pendente = this.value === "Pendente";
    $("campo-fin-div").style.display = pendente ? "none" : "flex";
    if (pendente) {
      document.querySelector('input[name="fin-pag-div"][value="Não"]').checked = true;
      $("campo-fin-divisao").style.display = "none";
      $("campo-fin-metodo").style.display = "flex";
      $("fin-divisao-lista").innerHTML = "";
      $("soma-fin-divisao").textContent = "";
      $("soma-fin-divisao").classList.remove("warn");
    }
    atualizarCampoDinheiro();
    calcularValorFin();
  });

  document.querySelectorAll('input[name="fin-pag-div"]').forEach(function (r) {
    r.addEventListener("change", function () {
      const sim = this.value === "Sim";
      $("campo-fin-divisao").style.display = sim ? "block" : "none";
      $("campo-fin-metodo").style.display = sim ? "none" : "flex";
      if (sim) renderLinhasDivisao($("fin-divisao-lista"), "soma-fin-divisao", getTotalFin, null, atualizarCampoDinheiro);
      atualizarCampoDinheiro();
    });
  });

  $("btn-add-fin-divisao").addEventListener("click", function () {
    $("fin-divisao-lista").appendChild(criarLinhaDivisao(null, null, function () {
      atualizarSomaDivisao($("fin-divisao-lista"), "soma-fin-divisao", getTotalFin);
      atualizarCampoDinheiro();
    }));
  });

  $("modal-fechar-finalizar").addEventListener("click", fecharFinalizar);
  $("btn-cancelar-finalizar").addEventListener("click", fecharFinalizar);
  $("modal-finalizar").addEventListener("click", function (e) {
    if (e.target === this) fecharFinalizar();
  });

  /* ---------------- Editar previsão de término ---------------- */
  let prevendoId = null;

  function atualizarHintsPrevisao() {
    const v = parseInt($("prev-restante").value, 10);
    const b = parseFloat(($("prev-bateria").value || "").replace(",", "."));
    const s = sessoes.find((x) => x.id === prevendoId);
    if (s && !isNaN(v) && v > 0) {
      const t = new Date(Date.now() + v * 60000);
      $("prev-novo-termino").textContent = pad2(t.getHours()) + ":" + pad2(t.getMinutes());
    } else {
      $("prev-novo-termino").textContent = "—";
    }
    if (s && !isNaN(b) && b >= 0 && b <= s.bateriaAlvo) {
      $("prev-novo-bateria").textContent = "subirá de " + b + "% até " + s.bateriaAlvo + "% em " +
        (isNaN(v) || v <= 0 ? "?" : v) + " min";
    } else {
      $("prev-novo-bateria").textContent = "—";
    }
  }

  function abrirPrevisao(id) {
    const s = sessoes.find((x) => x.id === id);
    if (!s || !progressoSessao(s)) return;
    prevendoId = id;
    $("prev-titulo").textContent = s.placa;
    const prog = progressoSessao(s);
    $("prev-titulo").textContent = s.placa + (s.bico != null ? ", bico " + s.bico : "");
    $("prev-info").textContent =
      "Agora em " + prog.pct + "% de " + s.bateriaAlvo + "%. Faltam " + prog.restanteMin +
      " min, término às " + pad2(prog.termino.getHours()) + ":" + pad2(prog.termino.getMinutes()) + ".";
    $("prev-bateria").value = prog.pct;
    $("prev-restante").value = prog.restanteMin;
    atualizarHintsPrevisao();
    $("modal-previsao").classList.add("show");
  }

  function fecharPrevisao() {
    $("modal-previsao").classList.remove("show");
    prevendoId = null;
  }

  $("prev-bateria").addEventListener("input", atualizarHintsPrevisao);
  $("prev-restante").addEventListener("input", atualizarHintsPrevisao);
  $("modal-fechar-previsao").addEventListener("click", fecharPrevisao);
  $("btn-cancelar-previsao").addEventListener("click", fecharPrevisao);
  $("modal-previsao").addEventListener("click", function (e) {
    if (e.target === this) fecharPrevisao();
  });

  $("form-previsao").addEventListener("submit", function (e) {
    e.preventDefault();
    const s = sessoes.find((x) => x.id === prevendoId);
    if (!s) {
      fecharPrevisao();
      return;
    }
    const v = parseInt($("prev-restante").value, 10);
    const b = parseFloat(($("prev-bateria").value || "").replace(",", "."));
    if (isNaN(v) || v <= 0) {
      mostrarAlerta("Informe um tempo restante válido (mínimo 1 min).", "error");
      return;
    }
    if (isNaN(b) || b < 0) {
      mostrarAlerta("Informe uma bateria atual válida (0% ou mais).", "error");
      return;
    }
    if (b > s.bateriaAlvo) {
      mostrarAlerta("A bateria atual não pode ser maior que o alvo (" + s.bateriaAlvo + "%).", "error");
      return;
    }
    const decorridoMin = (Date.now() - new Date(s.inicio).getTime()) / 60000;
    s.tempoEstimadoMin = Math.max(1, decorridoMin + v);
    s.pctManual = b;
    s.pctManualInicio = new Date().toISOString();
    s.pctManualRestanteMin = v;
    salvarESyncIncremental(KEY_SESSOES, sessoes);
    renderSessoes();
    renderStatusBicos();
    atualizarPreviewWhatsApp();
    fecharPrevisao();
    mostrarAlerta("Previsão de " + s.placa + " atualizada: " + b + "% → " + s.bateriaAlvo + "% em " + v + " min.", "success");
  });

  $("form-finalizar").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!finalizandoId) return;
    const sessao = sessoes.find((x) => x.id === finalizandoId);
    if (!sessao) {
      fecharFinalizar();
      renderSessoes();
      return;
    }
    const kwh = totalKwhPartes(kwhPartesFin);
    const valorKwh = moedaDaMascara($("fin-valor-kwh").value);

    if (isNaN(kwh) || kwh <= 0) {
      mostrarAlerta("Informe o KWH utilizado (valor maior que zero).", "error");
      return;
    }
    if (isNaN(valorKwh) || valorKwh <= 0) {
      mostrarAlerta("Informe um valor de KWH válido.", "error");
      return;
    }

    const pendentesVinculados = vendasPendentes.filter(function (venda) { return venda.idSessao === sessao.id; });
    const consumosVinculados = consumosVinculadosFin;
    const radioConsumo = document.querySelector('input[name="fin-consumo"]:checked');
    let consumoConveniencia = radioConsumo ? radioConsumo.value : "Não";
    if (consumosVinculados.length) consumoConveniencia = "Sim";
    let valorConsumo = 0;
    let consumoProdutos = [];
    let consumoProdutosManuais = [];
    if (consumoConveniencia === "Sim") {
      if (itensConsumoFin.length) consumoProdutosManuais = itensConsumoDetalhados(itensConsumoFin);
      if (itensConsumoFin.length && (!consumoProdutosManuais || consumoProdutosManuais.length === 0)) {
        mostrarAlerta(
          produtos.length === 0
            ? "Cadastre um produto na aba Cadastro de Clientes, Carros e Produtos antes de finalizar com consumo."
            : "Informe os produtos consumidos na conveniência.",
          "error"
        );
        return;
      }
      const erroConsumo = validarEstoqueItens(consumoProdutosManuais);
      if (erroConsumo) {
        mostrarAlerta(erroConsumo, "error");
        return;
      }
      consumoProdutos = consumoProdutosManuais.concat(consumosVinculados);
      valorConsumo = consumoProdutos.reduce(function (total, item) { return total + item.valorTotal; }, 0);
    }

    const metodoSel = $("fin-metodo").value;
    const pendenteFin = metodoSel === "Pendente";
    const radioPagDiv = document.querySelector('input[name="fin-pag-div"]:checked');
    let pagamentoDividido = radioPagDiv ? radioPagDiv.value : "Não";
    if (pendenteFin) pagamentoDividido = "Não";
    let detalhesPagamento = [];
    if (pagamentoDividido === "Sim") {
      const linhas = obterLinhasDivisao($("fin-divisao-lista"));
      const totalEsperado = kwh * valorKwh + valorConsumo;
      const erroParcelas = validarParcelasPagamento(linhas, totalEsperado, "Valor a ser Pago");
      if (erroParcelas) {
        mostrarAlerta(erroParcelas, "error");
        return;
      }
      detalhesPagamento = detalhesPagamentoComIds(linhas);
    }

    let valorEntregue = null;
    let troco = null;
    let valorExcedente = null;
    let numerario = null;
    const totalCalculado = kwh * valorKwh + valorConsumo;
    const totalCobrado = totalCalculado;
    const totalDinheiro = pagamentoDividido === "Sim" ? totalDinheiroDividido($("fin-divisao-lista")) : totalCobrado;
    if ((pagamentoDividido === "Sim" && totalDinheiro > 0) || (metodoSel === "Dinheiro" && pagamentoDividido !== "Sim")) {
      const totalEsperado = totalDinheiro;
      numerario = obterNumerario("fin", totalEsperado);
      if (numerario.erro) { mostrarAlerta(numerario.erro, "error"); return; }
      valorEntregue = numerario.recebido;
      troco = numerario.troco;
      valorExcedente = numerario.excedente;
    }

    const diferencaDinheiroConfirmada = numerario && Math.abs(numerario.valorCobrado - totalDinheiro) > 0.009
      ? arred(numerario.valorCobrado - totalDinheiro)
      : 0;
    const descontoConcedido = diferencaDinheiroConfirmada < 0 ? Math.abs(diferencaDinheiroConfirmada) : 0;

    // Recarga pendente: o consumo só reserva. Paga: baixa o consumo novo e o das vendas
    // pendentes vinculadas que ainda não tinham baixado.
    if (!pendenteFin) {
      const vinculadosSemBaixa = pendentesVinculados.filter(function (venda) { return !venda.estoqueBaixado; }).map(function (venda) {
        return { id: venda.produtoId, quantidade: venda.quantidade, alocacoesEstoque: venda.alocacoesEstoque || null };
      }).filter(function (item) { return produtoPorId(item.id); });
      const aBaixar = consumoProdutosManuais.concat(vinculadosSemBaixa);
      if (aBaixar.length) baixarEstoqueItens(aBaixar);
    }

    const agora = new Date();
    const turnoInfo = getTurnoAtivo();
    const registro = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      sessaoOrigemId: sessao.id,
      placa: sessao.placa,
      cliente: sessao.cliente,
      modelo: sessao.modelo,
      bico: sessao.bico != null ? sessao.bico : null,
      kwh: kwh,
      consumoQuantidade: consumoProdutos.reduce(function (total, item) { return total + item.quantidade; }, 0),
      consumoValorTotal: consumoConveniencia === "Sim" ? valorConsumo : null,
      pendenteFin: !!pendenteFin,
      operador: perfilAtivoSnapshot(),
      perfil: perfilAtivoSnapshot(),
      turno: turnoInfo.turnoId,
      dataOperacional: turnoInfo.dataOperacional,
      inicioTurno: turnoInfo.inicioTurno,
      fimTurno: turnoInfo.fimTurno,
      kwhUtilizado: kwh,
      kwhPartes: kwhPartesFin.filter(function (parte) { return (Number(parte) || 0) > 0; }),
      valorKwh: valorKwh,
      valorPagar: kwh * valorKwh,
      totalComConsumo: totalCobrado,
      valorCobrado: totalCobrado,
      arredondamentoDinheiro: diferencaDinheiroConfirmada,
      metodoPagamento: pagamentoDividido === "Sim" ? "Múltiplos" : metodoSel,
      pagamentoDividido: pagamentoDividido,
      detalhesPagamento: detalhesPagamento,
      consumoConveniencia: consumoConveniencia,
      valorConsumo: consumoConveniencia === "Sim" ? valorConsumo : 0,
      consumoProduto: consumoProdutos[0] || null,
      consumoProdutos: consumoProdutos,
      valorEntregue: valorEntregue,
      troco: troco,
      trocoPix: numerario ? numerario.trocoPix || 0 : 0,
      trocoCorreto: numerario ? numerario.trocoCorreto : null,
      ajusteTroco: numerario ? numerario.ajusteTroco : null,
      valorExcedente: valorExcedente,
      diferencaDinheiroConfirmada: diferencaDinheiroConfirmada,
      descontoConcedido: descontoConcedido,
      valorPagoEfetivo: numerario ? numerario.valorCobrado : totalCalculado,
      inicio: sessao.inicio,
      duracaoSegundos: Math.floor((agora.getTime() - new Date(sessao.inicio).getTime()) / 1000),
      bateriaInicial: sessao.bateriaInicial != null ? sessao.bateriaInicial : null,
      bateriaAlvo: sessao.bateriaAlvo != null ? sessao.bateriaAlvo : null,
      percentualAbastecido: sessao.bateriaInicial != null && sessao.bateriaAlvo != null
        ? sessao.bateriaAlvo - sessao.bateriaInicial
        : null,
      data: agora.toISOString()
    };
    abastecimentos.push(registro);
    salvarESyncIncremental(KEY_ABASTECIMENTOS, abastecimentos);
    if (numerario) registrarNumerarioCaixa({ tipo: "abastecimento", id: registro.id }, "Abastecimento " + registro.placa, numerario, turnoInfo.turnoId, registro.operador, registro.data);
    if (pendenteFin) {
      pendentesVinculados.forEach(function (venda) { venda.idSessao = ""; venda.idAbastecimento = registro.id; });
      consumoProdutosManuais.forEach(function (consumoProduto) {
        vendasPendentes.push({
          id: "vp" + Date.now() + Math.random().toString(36).slice(2, 7),
          idAbastecimento: registro.id,
          produtoId: consumoProduto.id,
          produtoPaiId: consumoProduto.produtoPaiId || null,
          variante: consumoProduto.variante || "Padrão",
          itensCombo: consumoProduto.itensCombo || null,
          estoqueReferenciaId: consumoProduto.estoqueReferenciaId,
          estoqueBaixado: false,
          alocacoesEstoque: consumoProduto.alocacoesEstoque || null,
          placa: registro.placa,
          cliente: registro.cliente,
          produto: consumoProduto.nome,
          categoria: consumoProduto.categoria,
          valorUnitario: consumoProduto.valorUnitario,
          quantidade: consumoProduto.quantidade,
          valorTotal: consumoProduto.valorTotal,
          turno: turnoInfo.turnoId,
          dataOperacional: turnoInfo.dataOperacional,
          data: agora.toISOString()
        });
      });
      if (consumoProdutosManuais.length || pendentesVinculados.length) salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
      renderInventario();
    } else if (consumoProdutos.length) {
      registrarVendasDoAbastecimento(registro, consumoProdutos, registro.metodoPagamento);
      vendasPendentes = vendasPendentes.filter(function (venda) { return venda.idSessao !== sessao.id; });
      salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
      renderVendas();
      renderInventario();
    }
    renderVendasPendentes();
    sessoes = sessoes.filter((x) => x.id !== sessao.id);
    salvarESyncIncremental(KEY_SESSOES, sessoes);
    fecharFinalizar();
    renderSessoes();
    renderPendentes();
    const promovidos = promoverFila();
    renderStatusBicos();
    atualizarPreviewWhatsApp();
    const fimTexto = fmtKwh(kwh) + " kWh = " + fmtMoeda(registro.valorPagar) +
      (consumoConveniencia === "Sim"
        ? " + consumos " + consumoProdutos.map(function (item) { return item.nome + " x" + item.quantidade; }).join(", ") + " = " + fmtMoeda(registro.totalComConsumo) + " (registre as vendas na aba Em Andamento)"
        : "") +
      (troco != null ? (registro.trocoPix ? " Troco em Pix: " : " Troco: ") + fmtMoeda(troco) : "") +
      (pendenteFin ? " Pagamento pendente — registre na tela Em Andamento." : "");
    if (promovidos.length) {
      const p = promovidos[0];
      prepararFormularioPara(p.placa);
      irParaAba("tab-andamento");
      mostrarAlerta(
        "Abastecimento finalizado: " + fimTexto +
        " Bico " + p.bico + " livre — conecte a placa " + p.placa + " e informe os valores.",
        "success"
      );
    } else {
      mostrarAlerta("Abastecimento finalizado: " + fimTexto, "success");
    }
  });

  /* ---------------- Registrar pagamento ---------------- */
  let pagandoId = null;

  function abrirPagamento(id) {
    const r = abastecimentos.find((x) => x.id === id);
    if (!r) return;
    pagandoId = id;
    $("pag-titulo").textContent = r.placa;
    $("pag-info").textContent =
      r.cliente + ", " + r.modelo + ". Recarga finalizada em " + formatarData(r.data) + ". Valor a receber: " + fmtMoeda(r.totalComConsumo != null ? r.totalComConsumo : r.valorPagar) + ".";
    $("pag-metodo").value = "Pix";
    $("pag-valor-entregue").value = "";
    $("pag-troco").value = "R$ 0,00";
    ["pag-cedulas-recebidas", "pag-moedas-recebidas", "pag-cedulas-troco", "pag-moedas-troco"].forEach(function (id) { $(id).value = ""; });
    $("campo-pag-dinheiro").style.display = "none";
    $("campo-pag-troco").style.display = "none";
    document.querySelector('input[name="pag-pag-div"][value="Não"]').checked = true;
    $("campo-pag-divisao").style.display = "none";
    $("pag-divisao-lista").innerHTML = "";
    $("soma-pag-divisao").textContent = "";
    $("soma-pag-divisao").classList.remove("warn");
    $("modal-pagamento").classList.add("show");
  }

  function fecharPagamento() {
    $("modal-pagamento").classList.remove("show");
    pagandoId = null;
  }

  function getTotalPag() {
    const r = abastecimentos.find((x) => x.id === pagandoId);
    const total = r ? (r.totalComConsumo != null ? r.totalComConsumo : r.valorPagar) : 0;
    return total;
  }

  function calcularTrocoPag() {
    const dividido = document.querySelector('input[name="pag-pag-div"]:checked').value === "Sim";
    atualizarNumerario("pag", dividido ? totalDinheiroDividido($("pag-divisao-lista")) : getTotalPag());
  }

  function atualizarCampoDinheiroPag() {
    const radioPagDiv = document.querySelector('input[name="pag-pag-div"]:checked');
    const divididoSim = radioPagDiv ? radioPagDiv.value === "Sim" : false;
    const mostrar = divididoSim
      ? temParcelaDinheiro($("pag-divisao-lista"))
      : $("pag-metodo").value === "Dinheiro";
    $("campo-pag-dinheiro").style.display = mostrar ? "flex" : "none";
    $("campo-pag-troco").style.display = mostrar ? "flex" : "none";
    if (!mostrar) {
      $("pag-valor-entregue").value = "";
      $("pag-troco").value = "R$ 0,00";
      ["pag-cedulas-recebidas", "pag-moedas-recebidas", "pag-cedulas-troco", "pag-moedas-troco"].forEach(function (id) { $(id).value = ""; });
    } else {
      calcularTrocoPag();
    }
  }

  $("pag-metodo").addEventListener("change", function () {
    atualizarCampoDinheiroPag();
  });
  $("pag-valor-entregue").addEventListener("input", calcularTrocoPag);
  ["pag-cedulas-recebidas", "pag-moedas-recebidas"].forEach(function (id) { $(id).addEventListener("input", calcularTrocoPag); });

  $("modal-fechar-pagamento").addEventListener("click", fecharPagamento);
  $("btn-cancelar-pagamento").addEventListener("click", fecharPagamento);
  $("modal-pagamento").addEventListener("click", function (e) {
    if (e.target === this) fecharPagamento();
  });

  document.querySelectorAll('input[name="pag-pag-div"]').forEach(function (r) {
    r.addEventListener("change", function () {
      const sim = this.value === "Sim";
      $("campo-pag-divisao").style.display = sim ? "block" : "none";
      if (sim) {
        renderLinhasDivisao($("pag-divisao-lista"), "soma-pag-divisao", getTotalPag, null, atualizarCampoDinheiroPag);
      } else {
        $("pag-divisao-lista").innerHTML = "";
        $("soma-pag-divisao").textContent = "";
        $("soma-pag-divisao").classList.remove("warn");
      }
      atualizarCampoDinheiroPag();
    });
  });

  $("btn-add-pag-divisao").addEventListener("click", function () {
    $("pag-divisao-lista").appendChild(criarLinhaDivisao(null, null, function () {
      atualizarSomaDivisao($("pag-divisao-lista"), "soma-pag-divisao", getTotalPag);
      atualizarCampoDinheiroPag();
    }));
  });

  $("form-pagamento").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!pagandoId) return;
    const idx = abastecimentos.findIndex((a) => a.id === pagandoId);
    if (idx === -1) {
      fecharPagamento();
      return;
    }
    const radioPagDiv = document.querySelector('input[name="pag-pag-div"]:checked');
    const pagamentoDividido = radioPagDiv ? radioPagDiv.value : "Não";
    let detalhesPagamento = [];
    if (pagamentoDividido === "Sim") {
      const linhas = obterLinhasDivisao($("pag-divisao-lista"));
      const totalEsperado = abastecimentos[idx].totalComConsumo != null ? abastecimentos[idx].totalComConsumo : abastecimentos[idx].valorPagar;
      const erroParcelas = validarParcelasPagamento(linhas, totalEsperado, "valor a pagar");
      if (erroParcelas) {
        mostrarAlerta(erroParcelas, "error");
        return;
      }
      detalhesPagamento = detalhesPagamentoComIds(linhas);
    }
    const metodoPagSel = $("pag-metodo").value;
    let valorEntregue = null;
    let troco = null;
    let valorExcedente = null;
    let numerario = null;
    const totalDinheiro = pagamentoDividido === "Sim" ? totalDinheiroDividido($("pag-divisao-lista")) : getTotalPag();
    if ((pagamentoDividido === "Sim" && totalDinheiro > 0) || (metodoPagSel === "Dinheiro" && pagamentoDividido !== "Sim")) {
      numerario = obterNumerario("pag", totalDinheiro);
      if (numerario.erro) { mostrarAlerta(numerario.erro, "error"); return; }
      valorEntregue = numerario.recebido;
      troco = numerario.troco;
      valorExcedente = numerario.excedente;
    }
    const diferencaDinheiroConfirmada = numerario && Math.abs(numerario.valorCobrado - totalDinheiro) > 0.009
      ? arred(numerario.valorCobrado - totalDinheiro)
      : 0;
    const descontoConcedido = diferencaDinheiroConfirmada < 0 ? Math.abs(diferencaDinheiroConfirmada) : 0;
    const r = abastecimentos[idx];
    r.metodoPagamento = pagamentoDividido === "Sim" ? "Múltiplos" : metodoPagSel;
    r.pagamentoDividido = pagamentoDividido;
    r.detalhesPagamento = detalhesPagamento;
    r.valorEntregue = valorEntregue;
    r.troco = troco;
    r.trocoPix = numerario ? numerario.trocoPix || 0 : 0;
    r.trocoCorreto = numerario ? numerario.trocoCorreto : null;
    r.ajusteTroco = numerario ? numerario.ajusteTroco : null;
    r.valorExcedente = valorExcedente;
    r.diferencaDinheiroConfirmada = diferencaDinheiroConfirmada;
    r.descontoConcedido = descontoConcedido;
    const totalBase = r.totalComConsumo != null ? r.totalComConsumo : r.valorPagar;
    r.valorCobrado = totalBase;
    r.valorPagoEfetivo = numerario ? numerario.valorCobrado : totalBase;
    r.arredondamentoDinheiro = diferencaDinheiroConfirmada;
    r.pendenteFin = false;
    delete r.status;
    salvarESyncIncremental(KEY_ABASTECIMENTOS, abastecimentos);
    if (numerario) registrarNumerarioCaixa({ tipo: "abastecimento", id: r.id }, "Abastecimento " + r.placa, numerario, r.turno, r.operador || r.perfil, r.data);
    const vendasDoAbastecimento = vendasPendentes.filter(function (venda) { return venda.idAbastecimento === r.id; });
    if (vendasDoAbastecimento.length) {
      registrarVendasDoAbastecimento(r, vendasDoAbastecimento, r.metodoPagamento);
      vendasPendentes = vendasPendentes.filter(function (venda) { return venda.idAbastecimento !== r.id; });
      salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
      renderVendas();
      renderInventario();
    }
    fecharPagamento();
    renderPendentes();
    renderHistorico();
    mostrarAlerta(
      "Pagamento registrado: " + fmtMoeda(r.valorPagar) + " via " +
      (r.metodoPagamento === "Múltiplos" ? "múltiplos métodos" : r.metodoPagamento) +
      (troco != null ? (r.trocoPix ? " — Troco em Pix: " : " — Troco: ") + fmtMoeda(troco) : "") + ".",
      "success"
    );
  });

  setInterval(function () {
    if ($("tab-andamento").classList.contains("active")) {
      document.querySelectorAll("[data-timer]").forEach(function (el) {
        const s = sessoes.find((x) => x.id === el.dataset.timer);
        if (s) el.textContent = formatarDuracao((Date.now() - new Date(s.inicio)) / 1000);
      });
    }
    if (finalizandoId) {
      const s = sessoes.find((x) => x.id === finalizandoId);
      if (s) {
        $("fin-info").textContent =
          "Modelo: " + s.modelo + " · Início: " + formatarData(s.inicio) +
          " · Bateria: " + (s.bateriaInicial != null ? s.bateriaInicial + "% → " + s.bateriaAlvo + "%" : "—") +
          " · Tempo decorrido: " + formatarDuracao((Date.now() - new Date(s.inicio)) / 1000);
      }
    }
    // Só atualiza a cada segundo o que está visível; as notificações ficam fora das abas.
    const abaOperacao = $("tab-andamento").classList.contains("active");
    if (abaOperacao) renderStatusBicos();
    renderNotificacoes5Min();
    if (abaOperacao || $("tab-config").classList.contains("active")) atualizarPreviewWhatsApp();
  }, 1000);

  /* ---------------- ABA 3: Histórico ---------------- */

  function celulaPagamento(r) {
    if (ehPendente(r)) {
      return '<span class="status-badge pendente">⏳ PENDENTE</span>';
    }
    if (r.pagamentoDividido === "Sim" && (r.detalhesPagamento || []).length >= 2) {
      const nomes = r.detalhesPagamento.map(function (p) { return p.metodo; });
      const detalhes = r.detalhesPagamento.map(function (p) { return p.metodo + " " + fmtMoeda(p.valor); }).join(" + ");
      return '<span class="tag" style="cursor:help;" title="' + escapeAttr(detalhes) + '">Múltiplos: ' +
        escapeHtml(nomes.join(" + ")) + "</span>";
    }
    return escapeHtml(r.metodoPagamento || "—");
  }

  let filtradosHistorico = [];

  function pagamentoHistoricoCorresponde(registro, pagamento) {
    if (!pagamento) return true;
    if (pagamento === "Pendente") return ehPendente(registro);
    if (registro.pagamentoDividido === "Sim") {
      return (registro.detalhesPagamento || []).some(function (item) { return item.metodo === pagamento; });
    }
    return registro.metodoPagamento === pagamento;
  }

  function renderHistorico() {
    const termo = ($("busca").value || "").toLowerCase().trim();
    const dataDe = $("filtro-de").value;
    const dataAte = $("filtro-ate").value;
    const pagamentoFiltro = $("filtro-pagamento").value;
    const perfilFiltro = $("filtro-perfil").value;
    const turnoFiltro = $("filtro-turno").value ? parseInt($("filtro-turno").value, 10) : null;
    if (dataDe && dataAte && dataAte < dataDe) {
      mostrarAlerta("A data final deve ser maior ou igual à data inicial.", "error");
      return;
    }
    filtradosHistorico = abastecimentos
      .slice()
      .sort((a, b) => new Date(b.data) - new Date(a.data))
      .filter(function (r) {
        if (r.status === "desfeito_para_pendente") return false;
        const turnoRegistro = r.turno || 1;
        const dia = r.dataOperacional || dataLocalISO(new Date(r.data));
        if (turnoFiltro && turnoRegistro !== turnoFiltro) return false;
        if (dataDe || dataAte) {
          if (dataDe && dia < dataDe) return false;
          if (dataAte && dia > dataAte) return false;
        }
        const operador = r.perfil || r.operador || {};
        if (perfilFiltro && operador.id !== perfilFiltro) return false;
        if (!pagamentoHistoricoCorresponde(r, pagamentoFiltro)) return false;
        if (!termo) return true;
        const textoPag = r.pagamentoDividido === "Sim"
          ? (r.detalhesPagamento || []).map((p) => p.metodo).join(" ")
          : (r.metodoPagamento || "");
        return (
          r.placa.toLowerCase().includes(termo) ||
          r.cliente.toLowerCase().includes(termo) ||
          r.modelo.toLowerCase().includes(termo) ||
          textoPag.toLowerCase().includes(termo)
        );
      });
    const filtrados = filtradosHistorico;
    const ativos = abastecimentos.filter(function (r) { return r.status !== "desfeito_para_pendente"; });
    const desfeitos = abastecimentos.length - ativos.length;

    $("stat-qtd").textContent = filtrados.length + " de " + ativos.length;
    const subtituloQtd = $("stat-qtd").nextElementSibling;
    if (subtituloQtd) subtituloQtd.textContent = "Visíveis no filtro" + (desfeitos ? " · " + desfeitos + " desfeito" + (desfeitos === 1 ? "" : "s") : "");
    const pagantes = filtrados.filter(function (r) { return !ehPendente(r); });
    const totalKwh = filtrados.reduce((s, r) => s + r.kwhUtilizado, 0);
    const totalValor = pagantes.reduce((s, r) => s + r.valorPagar, 0);
    const totalConsumo = pagantes.reduce((s, r) => s + (r.consumoConveniencia === "Sim" ? (r.valorConsumo || 0) : 0), 0);
    $("stat-kwh").textContent = fmtKwh(totalKwh) + " kWh";
    $("stat-consumo").textContent = fmtMoeda(totalConsumo);
    $("stat-total").textContent = fmtMoeda(totalValor);

    const container = $("lista-historico");
    container.innerHTML = "";
    $("empty-historico").style.display = filtrados.length === 0 ? "block" : "none";

    filtrados.forEach(function (r, i) {
      const div = document.createElement("div");
      const operador = r.perfil || r.operador || {};
      const consumo = r.consumoConveniencia === "Sim" && r.valorConsumo
        ? fmtMoeda(r.valorConsumo) + " · " + (Array.isArray(r.consumoProdutos) && r.consumoProdutos.length ? r.consumoProdutos : (r.consumoProduto ? [r.consumoProduto] : [])).map(function (item) {
          return resumoEscolhasCombo(item) || escapeHtml(nomeSnapshotProduto(item)) + " x" + (item.quantidade || 1);
        }).join(", ")
        : "Sem consumo";
      div.className = "history-data-row";
      div.innerHTML =
        "<div class='history-main'>" + placaHtml(r.placa) + "<div><strong>" + escapeHtml(r.cliente) + "</strong>" +
        '<span class="sub">' + escapeHtml(r.modelo) + " · " + formatarData(r.data) + " · " + escapeHtml(operador.nome || "Sem operador") + "</span></div></div>" +
        '<div><strong class="history-value">' + fmtKwh(r.kwhUtilizado) + " kWh</strong>" +
        '<span class="sub">' + (r.duracaoSegundos != null ? formatarDuracao(r.duracaoSegundos) : "Duração não informada") + " · " + fmtMoeda(r.valorKwh) + "/kWh</span></div>" +
        '<div><strong class="history-value">' + fmtMoeda(r.valorPagar) + "</strong>" +
        '<span class="sub">' + celulaPagamento(r) + " · " + consumo + " · Turno " + (r.turno || operador.turno || "—") + "</span></div>" +
        "";
      div.dataset.editarReg = i;
      div.tabIndex = 0;
      div.setAttribute("role", "button");
      div.setAttribute("aria-label", "Editar recarga de " + (r.placa || "placa não informada") + ", " + formatarData(r.data));
      container.appendChild(div);
    });
  }

  function desvincularPendentesDoAbastecimento(idAbastecimento) {
    let mudou = false;
    vendasPendentes.forEach(function (venda) {
      if (venda.idAbastecimento !== idAbastecimento) return;
      venda.idAbastecimento = "";
      venda.idSessao = "";
      mudou = true;
    });
    if (mudou) salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
    return mudou;
  }

  function acoesHistorico(ev) {
    const btnDesfazer = ev.target.closest("[data-desfazer-reg]");
    if (btnDesfazer) {
      const alvo = filtradosHistorico[parseInt(btnDesfazer.dataset.desfazerReg, 10)];
      if (!alvo || ehPendente(alvo) || !confirm("Desfazer o pagamento deste abastecimento e retorná-lo aos pagamentos pendentes?")) return;
      estornarNumerarioCaixa({ tipo: "abastecimento", id: alvo.id });
      vendas.filter(function (venda) { return venda.idAbastecimento === alvo.id && venda.status !== "desfeito_para_pendente"; }).forEach(function (venda) {
        estornarNumerarioCaixa({ tipo: "venda", id: venda.id });
        venda.status = "desfeito_para_pendente";
        venda.desfeitoParaPendente = { em: new Date().toISOString(), operador: perfilAtivoSnapshot(), pagamentoAnterior: { metodoPagamento: venda.metodoPagamento, numerario: venda.numerario || null } };
        vendasPendentes.push({ id: "vp" + gerarId(""), origem: "desfazer", vendaOrigemId: venda.id, idAbastecimento: alvo.id, idSessao: "", produtoId: venda.produtoId, estoqueReferenciaId: venda.estoqueReferenciaId, estoqueBaixado: !!venda.estoqueBaixado, itensCombo: venda.itensCombo || null, alocacoesEstoque: venda.alocacoesEstoque || null, placa: alvo.placa, cliente: alvo.cliente, produto: venda.produto, categoria: venda.categoria, valorUnitario: venda.valorUnitario, quantidade: venda.quantidade, valorTotal: venda.valorOriginal != null ? venda.valorOriginal : venda.valorTotal, turno: venda.turno, dataOperacional: venda.dataOperacional, inicioTurno: venda.inicioTurno, fimTurno: venda.fimTurno, operador: venda.operador, perfil: venda.perfil, data: venda.data });
      });
      alvo.desfeitoParaPendente = { em: new Date().toISOString(), operador: perfilAtivoSnapshot(), pagamentoAnterior: { metodoPagamento: alvo.metodoPagamento, pagamentoDividido: alvo.pagamentoDividido, detalhesPagamento: alvo.detalhesPagamento, valorEntregue: alvo.valorEntregue, troco: alvo.troco, valorCobrado: alvo.valorCobrado } };
      alvo.metodoPagamento = "Pendente";
      alvo.pendenteFin = true;
      alvo.pagamentoDividido = "Não";
      alvo.detalhesPagamento = [];
      alvo.valorEntregue = alvo.troco = alvo.trocoCorreto = alvo.ajusteTroco = alvo.valorExcedente = null;
      alvo.valorCobrado = alvo.totalComConsumo != null ? alvo.totalComConsumo : alvo.valorPagar;
      alvo.arredondamentoDinheiro = 0;
      salvarESyncIncremental(KEY_ABASTECIMENTOS, abastecimentos);
      salvarESyncIncremental(KEY_VENDAS, vendas);
      salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
      fecharEdicao();
      renderHistorico(); renderPendentes(); renderVendas(); renderVendasPendentes(); renderInventario();
      mostrarAlerta("Abastecimento desfeito e retornado aos pagamentos pendentes.", "success");
      return;
    }
    const btnRemover = ev.target.closest("[data-remover-reg]");
    if (btnRemover) {
      const idx = parseInt(btnRemover.dataset.removerReg, 10);
      const alvo = filtradosHistorico[idx];
      if (!alvo) return;
      if (confirm("Excluir este abastecimento do histórico?")) {
        abastecimentos = abastecimentos.filter((a) => a.id !== alvo.id);
        salvarESyncIncremental(KEY_ABASTECIMENTOS, abastecimentos);
        estornarNumerarioCaixa({ tipo: "abastecimento", id: alvo.id });
        desvincularPendentesDoAbastecimento(alvo.id);
        fecharEdicao();
        renderHistorico();
        renderPendentes();
        renderVendasPendentes();
        mostrarAlerta("Registro excluído.", "success");
      }
      return;
    }
    const btnEditar = ev.target.closest("[data-editar-reg]");
    if (btnEditar) {
      const idx = parseInt(btnEditar.dataset.editarReg, 10);
      const alvo = filtradosHistorico[idx];
      if (!alvo) return;
      abrirEdicao(alvo);
      $("btn-edicao-desfazer").dataset.desfazerReg = idx;
      $("btn-edicao-desfazer").hidden = ehPendente(alvo);
      $("btn-edicao-excluir").dataset.removerReg = idx;
    }
  }
  $("lista-historico").addEventListener("click", acoesHistorico);
  $("modal-edicao").addEventListener("click", function (ev) {
    if (ev.target.closest(".edicao-acoes-registro")) acoesHistorico(ev);
  });

  $("busca").addEventListener("input", comDebounce(renderHistorico, 200));
  $("filtro-de").addEventListener("input", renderHistorico);
  $("filtro-ate").addEventListener("input", renderHistorico);
  $("filtro-pagamento").addEventListener("change", renderHistorico);
  $("filtro-turno").addEventListener("change", renderHistorico);

  $("btn-limpar-filtro").addEventListener("click", function () {
    $("filtro-de").value = "";
    $("filtro-ate").value = "";
    $("filtro-pagamento").value = "";
    $("filtro-perfil").value = "";
    $("filtro-turno").value = "";
    renderHistorico();
  });

  $("btn-limpar-historico").addEventListener("click", function () {
    if (abastecimentos.length === 0) {
      mostrarAlerta("Não há recargas no histórico deste aparelho.", "error");
      return;
    }
    confirmarApagamento(
      "Apagar histórico de recargas",
      "Remove " + abastecimentos.length + (abastecimentos.length === 1 ? " recarga" : " recargas") + " deste aparelho e estorna os lançamentos automáticos no caixa. Não dá para desfazer.",
      "Apagar histórico",
      function () {
      abastecimentos.forEach(function (abastecimento) {
        estornarNumerarioCaixa({ tipo: "abastecimento", id: abastecimento.id });
        desvincularPendentesDoAbastecimento(abastecimento.id);
      });
      abastecimentos = [];
      salvarESyncIncremental(KEY_ABASTECIMENTOS, abastecimentos);
      renderHistorico();
      renderPendentes();
      renderVendasPendentes();
      mostrarAlerta("Histórico apagado.", "success");
      }
    );
  });

  /* ---------------- Aba Caixa ---------------- */

  /* ---------------- Dashboards: período, comparação e filtros ----------------
     O período anterior é comparado até o mesmo ponto: hoje até agora contra ontem
     até a mesma hora, a semana até hoje contra a semana passada até o mesmo dia. */

  function inicioDiaOperacional(iso) {
    const partes = String(iso).split("-").map(Number);
    const hm = String(TURNOS[1].inicio).split(":").map(Number);
    return new Date(partes[0], partes[1] - 1, partes[2], hm[0], hm[1] || 0, 0, 0);
  }
  function somarDias(iso, n) {
    const d = inicioDiaOperacional(iso);
    d.setDate(d.getDate() + n);
    return dataLocalISO(d);
  }
  function diasEntre(a, b) {
    return Math.round((inicioDiaOperacional(b) - inicioDiaOperacional(a)) / DIA_MS);
  }
  function dataCurtaDash(iso) {
    const d = inicioDiaOperacional(iso);
    return d.getDate() + "/" + (d.getMonth() + 1);
  }
  function horaAgora(d) {
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function periodoDashboard() {
    const agora = new Date();
    const hoje = getDadosTurnoAtual(agora).dataOperacional;
    const hora = horaAgora(agora);
    let de = hoje;
    let ate = hoje;
    let prevDe;
    let prevAte;
    let rotulo;
    let titulo;
    let gran = "dia";
    if (dashEstado.periodo === "semana") {
      de = somarDias(hoje, -((inicioDiaOperacional(hoje).getDay() + 6) % 7));
      prevDe = somarDias(de, -7);
      prevAte = somarDias(hoje, -7);
      rotulo = "a semana passada até " + DIAS_SEMANA[inicioDiaOperacional(hoje).getDay()] + ", " + hora;
      titulo = "Esta semana";
    } else if (dashEstado.periodo === "mes") {
      de = hoje.slice(0, 8) + "01";
      const inicioAnterior = inicioDiaOperacional(de);
      inicioAnterior.setMonth(inicioAnterior.getMonth() - 1);
      prevDe = dataLocalISO(inicioAnterior);
      const fimAnterior = somarDias(de, -1);
      prevAte = somarDias(prevDe, diasEntre(de, hoje));
      if (prevAte > fimAnterior) prevAte = fimAnterior;
      rotulo = MESES[inicioAnterior.getMonth()] + " até o dia " + inicioDiaOperacional(hoje).getDate() + ", " + hora;
      titulo = MESES[inicioDiaOperacional(hoje).getMonth()].replace(/^./, function (c) { return c.toUpperCase(); }) + " de " + hoje.slice(0, 4);
    } else if (dashEstado.periodo === "personalizado") {
      de = dashEstado.de || hoje;
      ate = dashEstado.ate || hoje;
      if (de > ate) { const t = de; de = ate; ate = t; }
      const n = diasEntre(de, ate) + 1;
      prevAte = somarDias(de, -1);
      prevDe = somarDias(de, -n);
      rotulo = (n === 1 ? "o dia anterior" : "os " + n + " dias anteriores") + " (" + dataCurtaDash(prevDe) + (n === 1 ? "" : " a " + dataCurtaDash(prevAte)) + ")";
      titulo = de === ate ? formatarData(inicioDiaOperacional(de).toISOString()).slice(0, 10) : dataCurtaDash(de) + " a " + dataCurtaDash(ate);
      if (n > 62) gran = "semana";
    } else if (dashEstado.periodo === "turno") {
      prevDe = somarDias(hoje, -1);
      prevAte = prevDe;
      const turnoAtual = getDadosTurnoAtual(agora).turnoId;
      rotulo = "o mesmo turno de ontem até " + hora;
      titulo = nomeTurno(turnoAtual) + ", hoje";
      gran = "hora";
    } else {
      prevDe = somarDias(hoje, -1);
      prevAte = prevDe;
      rotulo = "ontem até " + hora;
      titulo = "Hoje, " + inicioDiaOperacional(hoje).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
      gran = "hora";
    }
    return { de: de, ate: ate, prevDe: prevDe, prevAte: prevAte, deslocamento: inicioDiaOperacional(de) - inicioDiaOperacional(prevDe), agora: agora.getTime(), rotulo: rotulo, titulo: titulo, gran: gran };
  }

  // Registros sem data válida ficam fora de qualquer período.
  function dataValida(r) {
    const d = new Date(r && r.data);
    return isNaN(d.getTime()) ? null : d;
  }
  function diaOperacionalDe(r) {
    if (r.dataOperacional) return r.dataOperacional;
    const d = dataValida(r);
    return d ? getDadosTurnoAtual(d).dataOperacional : "";
  }
  function turnoDoRegistro(r) {
    const d = dataValida(r);
    return Number(r.turno) || (d ? getDadosTurnoAtual(d).turnoId : 0);
  }
  function operadorDoRegistro(r) {
    const o = r.operador || r.perfil;
    return o && o.id ? o.id : "sem";
  }
  function pagamentoConfere(r, metodo) {
    if (!metodo) return true;
    if (metodo === "Pendente") return ehPendente(r);
    return r.metodoPagamento === metodo || (r.detalhesPagamento || []).some(function (d) { return d && d.metodo === metodo; });
  }
  // "Turno atual" fixa o turno em andamento; nos outros períodos vale o filtro escolhido.
  function turnoFiltroDash() {
    if (dashEstado.periodo === "turno") return getDadosTurnoAtual(new Date()).turnoId;
    return dashEstado.turno ? Number(dashEstado.turno) : 0;
  }
  function passaFiltrosDash(r) {
    const turno = turnoFiltroDash();
    if (turno && turnoDoRegistro(r) !== turno) return false;
    if (dashEstado.operador && operadorDoRegistro(r) !== dashEstado.operador) return false;
    return pagamentoConfere(r, dashEstado.pagamento);
  }
  // No período anterior, só entra o que aconteceu até o mesmo ponto do período atual.
  function registrosDoPeriodo(lista, de, ate, deslocamento, agora) {
    return lista.filter(function (r) {
      const dia = diaOperacionalDe(r);
      if (!dia || dia < de || dia > ate) return false;
      if (deslocamento && r.data && new Date(r.data).getTime() + deslocamento > agora) return false;
      return passaFiltrosDash(r);
    });
  }

  function deltaHtml(atual, anterior, inverter) {
    if (!anterior && !atual) return '<span class="delta igual">igual</span>';
    if (!anterior) return '<span class="delta igual">sem base de comparação</span>';
    const pct = ((atual - anterior) / anterior) * 100;
    if (Math.abs(pct) < 0.5) return '<span class="delta igual">igual</span>';
    const sobe = pct > 0;
    const bom = inverter ? !sobe : sobe;
    return '<span class="delta ' + (bom ? "bom" : "ruim") + '"><svg aria-hidden="true"><use href="#i-' + (sobe ? "up" : "down") + '"/></svg>' + (sobe ? "+" : "−") + Math.round(Math.abs(pct)) + "%</span>";
  }

  function figuraDash(rotulo, valor, delta, nota, extra) {
    return '<div class="dash-figura' + (extra || "") + '"><span>' + rotulo + "</span><strong>" + valor + "</strong>" + (delta || "") + (nota ? "<small>" + nota + "</small>" : "") + "</div>";
  }

  function nomeOperadorDash(id) {
    if (id === "sem") return "Sem operador";
    const p = perfis.find(function (x) { return x.id === id; });
    return p ? p.nome : "Operador removido";
  }

  function renderFiltrosDashboard(per) {
    document.querySelectorAll("#dash-periodos [data-dash-periodo]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.dashPeriodo === dashEstado.periodo));
    });
    const ativos = [];
    if (dashEstado.periodo === "personalizado") ativos.push('<button type="button" class="filtro-ativo" data-dash-abrir-filtros>' + escapeHtml(per.titulo) + "</button>");
    if (dashEstado.turno && dashEstado.periodo !== "turno") ativos.push('<button type="button" class="filtro-ativo" data-dash-tirar="turno" aria-label="Tirar filtro Turno ' + dashEstado.turno + '">Turno ' + dashEstado.turno + '<svg aria-hidden="true"><use href="#i-close"/></svg></button>');
    if (dashEstado.operador) ativos.push('<button type="button" class="filtro-ativo" data-dash-tirar="operador" aria-label="Tirar filtro ' + escapeAttr(nomeOperadorDash(dashEstado.operador)) + '">' + escapeHtml(nomeOperadorDash(dashEstado.operador)) + '<svg aria-hidden="true"><use href="#i-close"/></svg></button>');
    if (dashEstado.pagamento) ativos.push('<button type="button" class="filtro-ativo" data-dash-tirar="pagamento" aria-label="Tirar filtro ' + escapeAttr(dashEstado.pagamento) + '">' + escapeHtml(dashEstado.pagamento) + '<svg aria-hidden="true"><use href="#i-close"/></svg></button>');
    $("dash-ativos").innerHTML = ativos.join("");
    const n = [dashEstado.periodo === "turno" ? "" : dashEstado.turno, dashEstado.operador, dashEstado.pagamento].filter(Boolean).length;
    $("dash-filtros-n").hidden = !n;
    $("dash-filtros-n").textContent = n;
    $("dash-compara").textContent = "Comparando com " + per.rotulo;
    $("dash-sub").textContent = per.titulo;
  }

  /* ----- Pista: bicos, fila e operador, agora ----- */
  function minutosDesde(iso) {
    return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  }

  function renderDashPista() {
    const painel = $("dash-pista");
    if (!painel) return;
    const agora = new Date();
    const turno = getDadosTurnoAtual(agora);
    const operadorAtivo = perfis.find(function (p) { return p.id === perfilAtivoId; });
    const fila = aguardando();
    const pendentes = abastecimentos.filter(ehPendente);
    const aReceber = pendentes.reduce(function (soma, r) { return soma + (Number(r.totalComConsumo != null ? r.totalComConsumo : r.valorPagar) || 0); }, 0);
    const tarifa = Number(config.tarifaKwh) || 0;
    let cartoes = "";
    for (let b = 1; b <= totalConectores(); b++) {
      const s = sessoes.find(function (x) { return (x.status === "carregando" || x.status === "vaga-liberada") && Number(x.bico) === b; });
      const cabeca = '<div class="pista-bico-head"><strong>Bico ' + b + '</strong><span class="muted">' + potenciaDoBico(b) + " kW</span>";
      if (!s) {
        cartoes += '<article class="card pista-bico" data-estado="livre">' + cabeca + '<span class="pista-estado">Livre</span></div><p class="muted">Pronto para a próxima recarga.</p></article>';
        continue;
      }
      if (s.status === "vaga-liberada") {
        cartoes += '<article class="card pista-bico" data-estado="reservado">' + cabeca + '<span class="pista-estado">Reservado</span></div><p class="muted">Liberado para ' + escapeHtml(s.placa || "o próximo da fila") + ".</p></article>";
        continue;
      }
      const prog = progressoSessao(s);
      const final = prog && prog.restanteMin <= 5;
      const modelo = modelos.find(function (m) { return m.modelo === s.modelo || (m.marca + " " + m.modelo) === s.modelo; });
      const kwh = prog && modelo ? Math.max(0, ((prog.pct - s.bateriaInicial) / 100) * (Number(modelo.capacidadeBateria) || 0)) : 0;
      const quem = s.operador && s.operador.nome ? " por " + escapeHtml(s.operador.nome) : "";
      cartoes += '<article class="card pista-bico" data-estado="' + (!prog ? "conectado" : final ? "final" : "carregando") + '">' + cabeca +
        '<span class="pista-estado">' + (!prog ? "Conectado" : final ? "Terminando" : "Carregando") + "</span></div>" +
        '<div class="pista-carro">' + placaHtml(s.placa) + '<div><strong>' + escapeHtml(s.cliente || "Cliente avulso") + '</strong><span class="muted">' + escapeHtml(s.modelo || "Modelo não informado") + "</span></div></div>" +
        (prog
          ? '<div class="pista-progresso"><div class="progress-track" aria-hidden="true"><div class="progress-fill" style="width:' + Math.min(100, prog.pct) + '%"></div></div><span><strong>' + prog.pct + "%</strong> de " + s.bateriaAlvo + "%</span></div>" +
            '<dl class="pista-dados"><div><dt>Faltam</dt><dd>' + prog.restanteMin + " min</dd></div><div><dt>Término</dt><dd>" + pad2(prog.termino.getHours()) + ":" + pad2(prog.termino.getMinutes()) + "</dd></div>" +
            (kwh ? "<div><dt>Energia até agora</dt><dd>" + fmtKwh(kwh) + " kWh, " + fmtMoeda(kwh * tarifa) + "</dd></div>" : "") + "</dl>"
          : '<p class="muted">Sem previsão: falta a bateria ou o tempo estimado.</p>') +
        '<p class="pista-rodape muted">Início às ' + (s.inicio ? pad2(new Date(s.inicio).getHours()) + ":" + pad2(new Date(s.inicio).getMinutes()) : "—") + quem + (s.valorParada ? ", parar em " + fmtMoeda(Number(s.valorParada)) : "") + "</p>" +
      "</article>";
    }
    painel.innerHTML =
      '<div class="dash-figuras dash-figuras-4 pista-resumo">' +
        figuraDash("Operando agora", operadorAtivo ? escapeHtml(operadorAtivo.nome) : "Ninguém selecionado", "", operadorAtivo ? escapeHtml(rotuloTurnoOperador(operadorAtivo)) : "Escolha o operador no topo da tela", " destaque") +
        figuraDash("Turno", escapeHtml(nomeTurno(turno.turnoId)), "", pad2(new Date(turno.inicioTurno).getHours()) + ":" + pad2(new Date(turno.inicioTurno).getMinutes()) + " a " + pad2(new Date(turno.fimTurno).getHours()) + ":" + pad2(new Date(turno.fimTurno).getMinutes())) +
        figuraDash("Na fila", fila.length, "", fila.length ? "Mais antigo há " + minutosDesde(fila.map(function (f) { return f.criadoEm; }).sort()[0]) + " min" : "Ninguém esperando") +
        figuraDash("A receber", fmtMoeda(aReceber), "", pendentes.length + (pendentes.length === 1 ? " recarga pendente" : " recargas pendentes")) +
      "</div>" +
      '<div class="op-section-title"><h2>Bicos</h2><span>' + carregando().length + " de " + totalConectores() + " em uso</span></div>" +
      '<div class="pista-bicos">' + cartoes + "</div>" +
      (fila.length
        ? '<div class="op-section-title"><h2>Fila</h2><span>' + fila.length + (fila.length === 1 ? " carro" : " carros") + '</span></div><div class="card list-surface">' +
          fila.map(function (f) { return '<div class="list-item pista-fila">' + placaHtml(f.placa) + '<div class="info"><strong>' + escapeHtml(f.cliente || "Cliente avulso") + '</strong><span class="muted">' + escapeHtml(f.modelo || "") + '</span></div><span class="muted">esperando há ' + minutosDesde(f.criadoEm) + " min</span></div>"; }).join("") + "</div>"
        : "") +
      '<p class="help pista-atualizacao">Atualizado às ' + pad2(agora.getHours()) + ":" + pad2(agora.getMinutes()) + ":" + pad2(agora.getSeconds()) + ".</p>";
  }

  function pistaVisivel() {
    return $("tab-dashboard").classList.contains("active") && !$("dash-pista").hidden;
  }
  setInterval(function () { if (ehAdmin() && pistaVisivel()) renderDashPista(); }, 10000);

  function renderDashboard() {
    if (!ehAdmin() || !$("dash-operacao")) return;
    const per = periodoDashboard();
    renderFiltrosDashboard(per);
    renderDashOperacao(per);
    renderDashProdutos(per);
    renderDashPista();
    // Período e filtros não valem para a Pista, que mostra o momento atual.
    const naPista = !$("dash-pista").hidden;
    document.querySelector("#tab-dashboard .dash-toolbar").hidden = naPista;
    if (naPista) $("dash-sub").textContent = "Agora, atualizado a cada 10 segundos";
  }

  // Horário aberto do período: as faixas dos turnos de cada dia operacional, até agora.
  // Com filtro de turno, só as faixas daquele turno.
  function janelasAbertas(per) {
    const turnos = listaTurnos();
    if (!turnos.length) return [];
    const inicioDia = parseTimeToMinutes(turnos[0].inicio);
    const so = turnoFiltroDash();
    const janelas = [];
    for (let dia = per.de; dia <= per.ate; dia = somarDias(dia, 1)) {
      const base = inicioDiaOperacional(dia).getTime();
      turnos.forEach(function (t) {
        if (so && Number(t.id) !== so) return;
        const ini = (parseTimeToMinutes(t.inicio) - inicioDia + 1440) % 1440;
        const fim = (parseTimeToMinutes(t.fim) - inicioDia + 1440) % 1440 || 1440;
        const de = base + ini * 60000;
        const ate = Math.min(base + fim * 60000, per.agora);
        if (ate > de) janelas.push({ de: de, ate: ate, aberta: ate === per.agora });
      });
    }
    return janelas;
  }

  // Tempo de cada bico no período: o ativo soma as recargas concluídas e a que está
  // em andamento; o ocioso é o resto do horário aberto. Só o contador do estado atual anda.
  function temposBicos(per, registros) {
    const janelas = janelasAbertas(per);
    const aberto = janelas.reduce(function (soma, j) { return soma + (j.ate - j.de) / 1000; }, 0);
    const abertoAgora = janelas.some(function (j) { return j.aberta; });
    const hoje = getDadosTurnoAtual(new Date(per.agora)).dataOperacional;
    const incluiHoje = hoje >= per.de && hoje <= per.ate;
    const inicioPeriodo = janelas.length ? janelas[0].de : per.agora;
    const tempos = {};
    for (let b = 1; b <= totalConectores(); b++) {
      let ativo = registros.filter(function (r) { return Number(r.bico) === b; }).reduce(function (soma, r) { return soma + (Number(r.duracaoSegundos) || 0); }, 0);
      const sessao = incluiHoje && sessoes.find(function (s) { return s.status === "carregando" && Number(s.bico) === b && !isNaN(new Date(s.inicio).getTime()); });
      if (sessao) ativo += Math.max(0, per.agora - Math.max(new Date(sessao.inicio).getTime(), inicioPeriodo)) / 1000;
      tempos[b] = {
        ativo: Math.floor(ativo),
        ocioso: Math.floor(Math.max(0, aberto - ativo)),
        anda: sessao ? "ativo" : abertoAgora ? "ocioso" : "",
        carregando: !!sessao
      };
    }
    return tempos;
  }

  function cronometroHtml(rotulo, segundos, anda, agora) {
    return '<span class="rank-tempo' + (anda ? " vivo" : "") + '" data-tempo="' + rotulo.toLowerCase() + '">' + rotulo + " <strong" + (anda ? ' data-cronometro data-base="' + segundos + '" data-desde="' + agora + '"' : "") + ">" + formatarDuracao(segundos) + "</strong></span>";
  }

  function atualizarCronometros() {
    const agora = Date.now();
    document.querySelectorAll("#dash-operacao [data-cronometro]").forEach(function (el) {
      el.textContent = formatarDuracao(Number(el.dataset.base) + (agora - Number(el.dataset.desde)) / 1000);
    });
  }
  setInterval(function () { if ($("tab-dashboard").classList.contains("active") && !$("dash-operacao").hidden) atualizarCronometros(); }, 1000);

  function renderDashOperacao(per) {
    const cur = registrosDoPeriodo(abastecimentos, per.de, per.ate, 0, per.agora);
    const prev = registrosDoPeriodo(abastecimentos, per.prevDe, per.prevAte, per.deslocamento, per.agora);
    const vCur = registrosDoPeriodo(vendas, per.de, per.ate, 0, per.agora);
    const vPrev = registrosDoPeriodo(vendas, per.prevDe, per.prevAte, per.deslocamento, per.agora);
    const pagas = function (l) { return l.filter(function (r) { return !ehPendente(r); }); };
    const receita = function (l) { return pagas(l).reduce(function (soma, r) { return soma + (Number(r.valorPagar) || 0) + (Number(r.arredondamentoDinheiro) || 0); }, 0); };
    const arredondamentos = function (l) { return l.reduce(function (soma, r) { return soma + (Number(r.arredondamentoDinheiro) || 0); }, 0); };
    const kwh = function (l) { return l.reduce(function (soma, r) { return soma + (Number(r.kwhUtilizado || r.kwh) || 0); }, 0); };
    const ticket = function (l) { return pagas(l).length ? receita(l) / pagas(l).length : 0; };
    const duracao = function (l) { return l.length ? l.reduce(function (soma, r) { return soma + (Number(r.duracaoSegundos) || 0); }, 0) / l.length / 60 : 0; };
    const conveniencia = function (l) { return l.reduce(function (soma, v) { return soma + (Number(v.valorTotal) || 0) + (Number(v.arredondamentoDinheiro) || 0); }, 0); };
    const totalArredondado = arred(arredondamentos(cur) + arredondamentos(vCur));
    const cobrancas = function (l) { return new Set(l.map(function (v) { return v.cobrancaId || v.id; })).size; };
    const pendentes = function (l) { return l.filter(ehPendente); };
    const ativos = carregando().length;
    const livres = Math.max(0, totalConectores() - ativos - sessoes.filter(function (s) { return s.status === "vaga-liberada"; }).length);
    const faltando = skusFaltando().length;
    let usoBicos = "";
    const porBico = [];
    for (let b = 1; b <= totalConectores(); b++) {
      const l = cur.filter(function (r) { return Number(r.bico) === b; });
      porBico.push({ bico: b, qtd: l.length, kwh: kwh(l), prev: kwh(prev.filter(function (r) { return Number(r.bico) === b; })) });
    }
    const maxBico = Math.max.apply(null, porBico.map(function (x) { return x.kwh; }).concat([0]));
    const tempos = temposBicos(per, cur);
    usoBicos = porBico.map(function (x) {
      const t = tempos[x.bico];
      const total = t.ativo + t.ocioso;
      return '<div class="rank-linha rank-bico" data-bico="' + x.bico + '"><span class="rank-pos">' + x.bico + '</span><span class="rank-nome"><strong>Bico ' + x.bico + '</strong><span class="stock-badge' + (t.carregando ? " ok" : "") + '">' + (t.carregando ? "Carregando" : "Livre") + '</span><span class="stock-badge">' + x.qtd + (x.qtd === 1 ? " recarga" : " recargas") + '</span></span><span class="rank-valor"><strong>' + fmtKwh(x.kwh) + " kWh</strong>" + deltaHtml(x.kwh, x.prev) + '</span><span class="rank-trilho" aria-hidden="true"><span style="width:' + (maxBico ? (x.kwh / maxBico) * 100 : 0).toFixed(1) + '%"></span></span>' +
        '<span class="rank-tempos">' + cronometroHtml("Ativo", t.ativo, t.anda === "ativo", per.agora) + cronometroHtml("Ocioso", t.ocioso, t.anda === "ocioso", per.agora) +
        '<span class="rank-divisao" aria-hidden="true"><span style="width:' + (total ? (t.ativo / total) * 100 : 0).toFixed(1) + '%"></span></span></span></div>';
    }).join("");
    $("dash-operacao").innerHTML =
      '<div class="dash-figuras dash-figuras-5">' +
        figuraDash("Receita de recargas", fmtMoeda(receita(cur)), deltaHtml(receita(cur), receita(prev)), totalArredondado ? "Inclui " + sinalMoeda(totalArredondado) + " em arredondamentos de dinheiro, somando recargas e vendas" : "", " destaque") +
        figuraDash("Recargas concluídas", cur.length, deltaHtml(cur.length, prev.length), "Ticket médio " + fmtMoeda(ticket(cur))) +
        figuraDash("Energia entregue", fmtKwh(kwh(cur)) + " kWh", deltaHtml(kwh(cur), kwh(prev)), "Duração média " + Math.round(duracao(cur)) + " min") +
        figuraDash("Vendas de conveniência", fmtMoeda(conveniencia(vCur)), deltaHtml(conveniencia(vCur), conveniencia(vPrev)), cobrancas(vCur) + (cobrancas(vCur) === 1 ? " venda" : " vendas")) +
        figuraDash("Pagamentos pendentes", pendentes(cur).length, deltaHtml(pendentes(cur).length, pendentes(prev).length, true), fmtMoeda(pendentes(cur).reduce(function (soma, r) { return soma + (Number(r.valorPagar) || 0); }, 0)) + " a receber") +
      "</div>" +
      '<div class="op-section-title"><h2>Agora</h2><span>Não muda com período nem filtros</span></div>' +
      '<div class="dash-figuras dash-figuras-3">' +
        figuraDash("Operação", ativos + (ativos === 1 ? " ativa" : " ativas"), "", aguardando().length + " na fila, " + livres + (livres === 1 ? " bico livre" : " bicos livres")) +
        figuraDash("Caixa físico", fmtMoeda(totalCaixa(caixa)), "", "Em cédulas e moedas") +
        '<button type="button" class="dash-figura" data-dash-ver-faltando><span>Estoque</span><strong>' + (faltando ? faltando + " faltando" : "Tudo em dia") + '</strong><small class="dash-link">' + (faltando ? "Repor produtos" : "Ver produtos") + "</small></button>" +
      "</div>" +
      '<div class="op-section-title"><h2>Uso por bico</h2><span>Energia e tempo no período. Ocioso conta só no horário dos turnos</span></div>' +
      '<div class="card list-surface rank-lista">' + usoBicos + "</div>";
  }

  /* ----- Vendas por produto: combos contam unidades nos itens e faturamento à parte ----- */
  function vendaEhCombo(v) {
    const p = produtoPorId(v.produtoId);
    return (p && p.tipo === "combo") || v.categoria === "Combos" || (Array.isArray(v.alocacoesEstoque) && v.alocacoesEstoque.length > 0) || (Array.isArray(v.itensCombo) && v.itensCombo.length > 0);
  }
  function componentesDaVenda(v) {
    const qtd = Number(v.quantidade) || 1;
    if (Array.isArray(v.alocacoesEstoque) && v.alocacoesEstoque.length) {
      return v.alocacoesEstoque.map(function (a) { return { produtoId: a.produtoId, quantidade: Number(a.quantidade) || 0 }; });
    }
    return (v.itensCombo || []).map(function (i) { return { produtoId: i.produtoId, quantidade: (Number(i.quantidade) || 1) * qtd }; });
  }

  function agregarVendasProdutos(lista) {
    const porProduto = {};
    const porCombo = {};
    const porCategoria = {};
    let faturamento = 0;
    let itens = 0;
    const grupoDe = function (skuId, snapshot) {
      const sku = produtoPorId(skuId);
      const pai = sku ? paiDoSku(sku) : null;
      const chave = pai ? pai.id : (snapshot && snapshot.produtoPaiId) || "nome:" + String((snapshot && snapshot.produto) || "Produto").split(" — ")[0];
      if (!porProduto[chave]) porProduto[chave] = { id: chave, paiId: pai ? pai.id : null, nome: pai ? pai.nome : String((snapshot && snapshot.produto) || "Produto removido").split(" — ")[0], categoria: pai ? pai.categoria : (snapshot && snapshot.categoria) || "Sem categoria", un: 0, valor: 0, vars: {} };
      const g = porProduto[chave];
      const chaveVar = skuId || "?";
      if (!g.vars[chaveVar]) g.vars[chaveVar] = { id: skuId, nome: sku ? sku.variante || "Padrão" : (snapshot && snapshot.variante) || "Padrão", un: 0, valor: 0 };
      return { g: g, v: g.vars[chaveVar] };
    };
    lista.forEach(function (venda) {
      const valor = Number(venda.valorTotal) || 0;
      const qtd = Number(venda.quantidade) || 0;
      faturamento += valor + (Number(venda.arredondamentoDinheiro) || 0);
      if (vendaEhCombo(venda)) {
        const combo = produtoPorId(venda.produtoId);
        const chave = venda.produtoId || "combo:" + venda.produto;
        if (!porCombo[chave]) porCombo[chave] = { id: chave, nome: combo ? combo.nome : venda.produto || "Combo", un: 0, valor: 0 };
        porCombo[chave].un += qtd;
        porCombo[chave].valor += valor;
        porCategoria.Combos = (porCategoria.Combos || 0) + valor;
        componentesDaVenda(venda).forEach(function (c) {
          const alvo = grupoDe(c.produtoId, null);
          alvo.g.un += c.quantidade;
          alvo.v.un += c.quantidade;
          itens += c.quantidade;
        });
      } else {
        const alvo = grupoDe(venda.produtoId, venda);
        alvo.g.un += qtd;
        alvo.g.valor += valor;
        alvo.v.un += qtd;
        alvo.v.valor += valor;
        itens += qtd;
        const categoria = alvo.g.categoria || "Sem categoria";
        porCategoria[categoria] = (porCategoria[categoria] || 0) + valor;
      }
    });
    const n = new Set(lista.map(function (v) { return v.cobrancaId || v.id; })).size;
    return { faturamento: faturamento, itens: itens, n: n, ticket: n ? faturamento / n : 0, porProduto: porProduto, porCombo: porCombo, porCategoria: porCategoria };
  }

  function serieDashboard(lista, de, ate, gran, valorDe) {
    const inicio = inicioDiaOperacional(de).getTime();
    const passo = gran === "hora" ? 3600000 : gran === "semana" ? 7 * DIA_MS : DIA_MS;
    const n = gran === "hora" ? 19 : Math.max(1, Math.ceil((diasEntre(de, ate) + 1) / (gran === "semana" ? 7 : 1)));
    const out = new Array(n).fill(0);
    lista.forEach(function (r) {
      const d = dataValida(r);
      if (!d) return;
      const i = gran === "hora"
        ? Math.floor((d.getTime() - inicio) / passo)
        : Math.floor(diasEntre(de, diaOperacionalDe(r)) / (gran === "semana" ? 7 : 1));
      if (i >= 0 && i < n) out[i] += valorDe(r);
    });
    return out;
  }

  function renderDashProdutos(per) {
    const cur = registrosDoPeriodo(vendas, per.de, per.ate, 0, per.agora);
    const prev = registrosDoPeriodo(vendas, per.prevDe, per.prevAte, per.deslocamento, per.agora);
    const A = agregarVendasProdutos(cur);
    const P = agregarVendasProdutos(prev);
    const faltando = skusFaltando();
    const emValor = dashEstado.rankModo === "valor";
    const chave = emValor ? "valor" : "un";
    let linhas = Object.keys(Object.assign({}, A.porProduto, P.porProduto)).map(function (id) {
      const a = A.porProduto[id] || P.porProduto[id];
      return { tipo: "produto", id: id, paiId: a.paiId, nome: a.nome, atual: (A.porProduto[id] || {})[chave] || 0, anterior: (P.porProduto[id] || {})[chave] || 0, faltando: !!a.paiId && skus().some(function (sku) { return sku.produtoPaiId === a.paiId && situacaoSku(sku) === "faltando"; }) };
    });
    if (emValor) {
      linhas = linhas.concat(Object.keys(Object.assign({}, A.porCombo, P.porCombo)).map(function (id) {
        const c = A.porCombo[id] || P.porCombo[id];
        return { tipo: "combo", id: id, nome: c.nome, atual: (A.porCombo[id] || {}).valor || 0, anterior: (P.porCombo[id] || {}).valor || 0 };
      }));
    }
    linhas = linhas.filter(function (l) { return l.atual > 0; }).sort(function (a, b) { return b.atual - a.atual; });
    const visiveis = dashEstado.rankTodos ? linhas : linhas.slice(0, 10);
    const maxRank = Math.max.apply(null, linhas.map(function (l) { return l.atual; }).concat([1]));
    const fmtRank = function (v) { return emValor ? fmtMoeda(v) : v + " un"; };
    const categorias = Object.keys(A.porCategoria).map(function (c) { return [c, A.porCategoria[c]]; }).sort(function (a, b) { return b[1] - a[1]; });
    const maxCat = Math.max.apply(null, categorias.map(function (c) { return c[1]; }).concat([1]));
    const granRotulo = per.gran === "hora" ? "hora" : per.gran === "semana" ? "semana" : "dia";

    $("dash-produtos").innerHTML =
      (faltando.length ? '<button type="button" class="dash-alerta-estoque" data-dash-ver-faltando><svg aria-hidden="true"><use href="#i-alert"/></svg><span>' + faltando.length + (faltando.length === 1 ? " variação faltando" : " variações faltando") + " no estoque, incluindo " + escapeHtml(nomeCurtoSku(faltando[0])) + "</span><b>Repor</b></button>" : "") +
      '<div class="dash-figuras dash-figuras-4">' +
        figuraDash("Faturamento de produtos", fmtMoeda(A.faturamento), deltaHtml(A.faturamento, P.faturamento), "", " destaque") +
        figuraDash("Itens vendidos", A.itens, deltaHtml(A.itens, P.itens)) +
        figuraDash("Vendas", A.n, deltaHtml(A.n, P.n)) +
        figuraDash("Ticket médio", fmtMoeda(A.ticket), deltaHtml(A.ticket, P.ticket)) +
      "</div>" +
      '<section class="card dash-grafico"><div class="dash-bloco-head"><div><h3>Vendas por data</h3><p>Faturamento por ' + granRotulo + '</p></div><button type="button" class="dash-link-btn" data-dash-tabela>' + (dashEstado.tabela ? "Ver gráfico" : "Ver tabela") + "</button></div>" +
        '<div class="dash-legenda"><span><i class="chave-barra"></i>Este período</span><span><i class="chave-linha"></i>Período anterior</span></div>' +
        '<div class="dash-chart" id="dash-chart-datas"></div></section>' +
      '<div class="dash-duas">' +
        '<section class="card list-surface rank-lista"><div class="dash-bloco-head"><div><h3>' + (emValor ? "Melhores produtos" : "Mais vendidos") + "</h3><p>" + (emValor ? "Por faturamento. Combos aparecem como itens próprios." : "Por unidades, contando os itens dos combos.") + "</p></div></div>" +
          '<div class="segmented dash-rank-modo" role="group" aria-label="Ordenar ranking por"><button type="button" role="tab" data-dash-rank="valor" aria-selected="' + emValor + '">R$</button><button type="button" role="tab" data-dash-rank="un" aria-selected="' + !emValor + '">Unidades</button></div>' +
          (visiveis.length
            ? visiveis.map(function (l, i) {
                return '<button type="button" class="rank-linha' + (l.tipo === "combo" ? " combo" : "") + '" data-dash-rank-item="' + escapeAttr(l.tipo + ":" + l.id) + '">' +
                  '<span class="rank-pos">' + (i + 1) + '</span><span class="rank-nome"><strong>' + escapeHtml(l.nome) + "</strong>" + (l.tipo === "combo" ? '<span class="stock-badge">Combo</span>' : "") + (l.faltando ? '<span class="stock-badge danger">Faltando</span>' : "") + "</span>" +
                  '<span class="rank-valor"><strong>' + fmtRank(l.atual) + "</strong>" + deltaHtml(l.atual, l.anterior) + "</span>" +
                  '<span class="rank-trilho" aria-hidden="true"><span style="width:' + ((l.atual / maxRank) * 100).toFixed(1) + '%"></span></span></button>';
              }).join("")
            : '<div class="empty-state"><strong>Nenhuma venda no período</strong>Mude o período ou tire algum filtro.</div>') +
          (linhas.length > 10 ? '<button type="button" class="dash-mais" data-dash-rank-todos>' + (dashEstado.rankTodos ? "Mostrar só os 10 primeiros" : "Ver todos os " + linhas.length) + "</button>" : "") +
        "</section>" +
        '<section class="card list-surface rank-lista"><div class="dash-bloco-head"><div><h3>Por categoria</h3><p>Faturamento no período</p></div></div>' +
          (categorias.length
            ? categorias.map(function (c) {
                return '<div class="rank-linha' + (c[0] === "Combos" ? " combo" : "") + '"><span class="rank-pos"></span><span class="rank-nome"><strong>' + escapeHtml(c[0]) + '</strong></span><span class="rank-valor"><strong>' + fmtMoeda(c[1]) + '</strong><span class="delta igual">' + Math.round((c[1] / Math.max(A.faturamento, 1)) * 100) + '%</span></span><span class="rank-trilho" aria-hidden="true"><span style="width:' + ((c[1] / maxCat) * 100).toFixed(1) + '%"></span></span></div>';
              }).join("")
            : '<div class="empty-state"><strong>Sem vendas</strong>As categorias aparecem quando houver vendas no período.</div>') +
        "</section>" +
      "</div>";

    const valorVenda = function (v) { return Number(v.valorTotal) || 0; };
    const passo = per.gran === "hora" ? 3600000 : per.gran === "semana" ? 7 * DIA_MS : DIA_MS;
    const sAtual = serieDashboard(cur, per.de, per.ate, per.gran, valorVenda);
    const sAnterior = serieDashboard(prev, per.prevDe, per.prevAte, per.gran, valorVenda);
    const inicio = inicioDiaOperacional(per.de).getTime();
    const inicioAnterior = inicioDiaOperacional(per.prevDe).getTime();
    const fimAnterior = per.gran === "hora" ? per.agora - per.deslocamento : inicioDiaOperacional(per.prevAte).getTime() + DIA_MS;
    desenharColunasDash($("dash-chart-datas"), {
      gran: per.gran,
      rotulos: sAtual.map(function (_, i) {
        const d = new Date(inicio + i * passo);
        return per.gran === "hora" ? d.getHours() + "h" : d.getDate() + "/" + (d.getMonth() + 1);
      }),
      atual: sAtual,
      anterior: sAnterior.map(function (v, i) { return inicioAnterior + i * passo <= fimAnterior ? v : null; }),
      qAtual: serieDashboard(cur, per.de, per.ate, per.gran, function () { return 1; }),
      qAnterior: serieDashboard(prev, per.prevDe, per.prevAte, per.gran, function () { return 1; }),
      futuro: sAtual.map(function (_, i) { return inicio + i * passo > per.agora; })
    });
  }

  // Colunas do período atual e linha do período anterior, no mesmo eixo.
  function desenharColunasDash(el, d) {
    if (!el) return;
    if (dashEstado.tabela) {
      el.innerHTML = '<table class="dash-tabela"><thead><tr><th>' + (d.gran === "hora" ? "Hora" : "Data") + "</th><th>Este período</th><th>Anterior</th></tr></thead><tbody>" +
        d.rotulos.map(function (r, i) {
          return d.futuro[i] ? "" : "<tr><td>" + r + "</td><td>" + fmtMoeda(d.atual[i]) + "</td><td>" + (d.anterior[i] == null ? "—" : fmtMoeda(d.anterior[i])) + "</td></tr>";
        }).join("") + "</tbody></table>";
      return;
    }
    const W = Math.max(280, el.clientWidth || 0);
    const H = 200;
    const m = { t: 8, r: 4, b: 22, l: 44 };
    const n = d.rotulos.length;
    const max = Math.max.apply(null, d.atual.concat(d.anterior.filter(function (v) { return v != null; })).concat([1]));
    const passoY = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000].find(function (p) { return max / p <= 4; }) || 100000;
    const topo = Math.ceil(max / passoY) * passoY;
    const slot = (W - m.l - m.r) / n;
    const x = function (i) { return m.l + slot * (i + 0.5); };
    const y = function (v) { return m.t + (H - m.t - m.b) * (1 - v / topo); };
    const bw = Math.min(24, Math.max(3, slot - 4));
    const cada = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((W - m.l) / 46))));
    const fmtEixo = function (v) { return v >= 1000 ? (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil" : String(v); };
    let svg = '<svg viewBox="0 0 ' + W + " " + H + '" height="' + H + '" role="img" aria-label="Faturamento por ' + d.gran + '. Use Ver tabela para os valores.">';
    for (let v = 0; v <= topo; v += passoY) {
      svg += '<line class="grade" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="marca" x="' + (m.l - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fmtEixo(v) + "</text>";
    }
    d.atual.forEach(function (v, i) {
      svg += '<rect class="faixa" x="' + (x(i) - slot / 2) + '" y="' + m.t + '" width="' + slot + '" height="' + (H - m.t - m.b) + '"/>';
      if (v > 0) {
        const h = Math.max(1, y(0) - y(v));
        const r = Math.min(4, bw / 2, h);
        const x0 = x(i) - bw / 2;
        const y0 = y(v);
        svg += '<path class="barra" d="M' + x0 + "," + y(0) + " V" + (y0 + r) + " Q" + x0 + "," + y0 + " " + (x0 + r) + "," + y0 + " H" + (x0 + bw - r) + " Q" + (x0 + bw) + "," + y0 + " " + (x0 + bw) + "," + (y0 + r) + " V" + y(0) + ' Z"/>';
      }
      if (i % cada === 0) svg += '<text class="marca" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + d.rotulos[i] + "</text>";
    });
    const pontos = d.anterior.map(function (v, i) { return v == null ? null : x(i) + "," + y(v); }).filter(Boolean);
    if (pontos.length > 1) svg += '<polyline class="anterior" points="' + pontos.join(" ") + '"/>';
    d.atual.forEach(function (_, i) { svg += '<rect class="alvo" data-i="' + i + '" x="' + (x(i) - slot / 2) + '" y="0" width="' + slot + '" height="' + H + '"/>'; });
    el.innerHTML = svg + "</svg>";
    const dica = $("dash-tip");
    const faixas = el.querySelectorAll(".faixa");
    const mostrar = function (i, ev) {
      faixas.forEach(function (f, k) { f.classList.toggle("ativa", k === i); });
      dica.innerHTML = "<strong>" + (d.gran === "hora" ? "Às " + d.rotulos[i] : d.rotulos[i]) + "</strong>" +
        (d.futuro[i] ? "Ainda não chegou" : '<i class="chave-barra"></i>' + fmtMoeda(d.atual[i]) + ", " + d.qAtual[i] + (d.qAtual[i] === 1 ? " venda" : " vendas")) +
        '<br><i class="chave-linha"></i>' + (d.anterior[i] == null ? "Anterior: —" : "Anterior: " + fmtMoeda(d.anterior[i]) + ", " + d.qAnterior[i] + (d.qAnterior[i] === 1 ? " venda" : " vendas"));
      dica.hidden = false;
      const caixaDica = dica.getBoundingClientRect();
      dica.style.left = Math.min(window.innerWidth - caixaDica.width - 8, Math.max(8, ev.clientX - caixaDica.width / 2)) + "px";
      dica.style.top = Math.max(8, ev.clientY - caixaDica.height - 14) + "px";
    };
    el.querySelectorAll(".alvo").forEach(function (alvo) {
      alvo.addEventListener("pointermove", function (ev) { mostrar(Number(alvo.dataset.i), ev); });
      alvo.addEventListener("pointerdown", function (ev) { mostrar(Number(alvo.dataset.i), ev); });
      alvo.addEventListener("pointerleave", function () {
        dica.hidden = true;
        faixas.forEach(function (f) { f.classList.remove("ativa"); });
      });
    });
  }

  function abrirDetalheRanking(tipo, id) {
    const per = periodoDashboard();
    const A = agregarVendasProdutos(registrosDoPeriodo(vendas, per.de, per.ate, 0, per.agora));
    const P = agregarVendasProdutos(registrosDoPeriodo(vendas, per.prevDe, per.prevAte, per.deslocamento, per.agora));
    const acoes = $("dash-detalhe-acoes");
    acoes.hidden = true;
    if (tipo === "combo") {
      const c = A.porCombo[id] || { nome: "Combo", un: 0, valor: 0 };
      const combo = produtoPorId(id);
      $("dash-detalhe-titulo").textContent = c.nome;
      $("dash-detalhe-sub").textContent = "Combo, " + per.titulo.toLocaleLowerCase("pt-BR");
      $("dash-detalhe-corpo").innerHTML = '<div class="dash-figuras dash-figuras-3">' +
        figuraDash("Faturamento", fmtMoeda(c.valor), deltaHtml(c.valor, (P.porCombo[id] || {}).valor || 0)) +
        figuraDash("Vendidos", c.un) +
        figuraDash("Preço", combo ? fmtMoeda(Number(combo.valor) || 0) : "—") +
        '</div><p class="help">O faturamento do combo fica nesta linha. As unidades de cada item entram em Mais vendidos, no produto correspondente.</p>';
    } else {
      const g = A.porProduto[id] || { nome: "Produto", categoria: "", un: 0, valor: 0, vars: {} };
      const gp = P.porProduto[id] || { un: 0, valor: 0, vars: {} };
      const atuais = g.paiId ? skus().filter(function (sku) { return sku.produtoPaiId === g.paiId; }) : [];
      $("dash-detalhe-titulo").textContent = g.nome;
      $("dash-detalhe-sub").textContent = (g.categoria ? g.categoria + ", " : "") + per.titulo.toLocaleLowerCase("pt-BR");
      const chavesVar = Object.keys(g.vars);
      atuais.forEach(function (sku) { if (!g.vars[sku.id]) chavesVar.push(sku.id); });
      $("dash-detalhe-corpo").innerHTML = '<div class="dash-figuras dash-figuras-3">' +
        figuraDash("Faturamento", fmtMoeda(g.valor), deltaHtml(g.valor, gp.valor)) +
        figuraDash("Unidades", g.un, deltaHtml(g.un, gp.un)) +
        figuraDash("Em estoque", atuais.reduce(function (soma, sku) { return soma + (estoqueInformado(sku) ? sku.estoque : 0); }, 0)) +
        '</div><div class="card list-surface">' + chavesVar.map(function (k) {
          const v = g.vars[k] || { nome: (produtoPorId(k) || {}).variante || "Padrão", un: 0, valor: 0 };
          const vp = gp.vars[k] || { valor: 0 };
          const sku = produtoPorId(k);
          return '<div class="list-item dash-var"><div class="info"><strong>' + escapeHtml(v.nome) + " " + (sku ? etiquetaSituacao(sku) : "") + '</strong><span class="muted">' + v.un + " un vendidas" + (sku ? ", " + (estoqueInformado(sku) ? sku.estoque + " em estoque" : "sem contagem") : "") + '</span></div><div class="rank-valor"><strong>' + fmtMoeda(v.valor) + "</strong>" + deltaHtml(v.valor, vp.valor) + "</div></div>";
        }).join("") + '</div><p class="help">As unidades incluem os itens vendidos dentro de combos. O faturamento conta só as vendas avulsas.</p>';
      const paraRepor = atuais.find(function (sku) { return situacaoSku(sku) === "faltando"; });
      if (paraRepor) {
        acoes.hidden = false;
        $("btn-dash-detalhe-repor").textContent = "Repor " + nomeCurtoSku(paraRepor).toLocaleLowerCase("pt-BR");
        $("btn-dash-detalhe-repor").dataset.sku = paraRepor.id;
      }
    }
    $("modal-dash-detalhe").classList.add("show");
  }

  function abrirFiltrosDashboard(periodoPedido) {
    const per = periodoDashboard();
    const sel = $("dash-f-operador");
    sel.innerHTML = '<option value="">Todos</option>' + perfisOrdenadosPorTurno().map(function (p) {
      return '<option value="' + escapeAttr(p.id) + '">' + escapeHtml(p.nome) + "</option>";
    }).join("") + '<option value="sem">Sem operador</option>';
    sel.value = dashEstado.operador;
    $("dash-f-turno").value = dashEstado.turno;
    $("dash-f-pagamento").value = dashEstado.pagamento;
    const comDatas = (periodoPedido || dashEstado.periodo) === "personalizado";
    $("dash-f-datas").hidden = !comDatas;
    $("dash-f-turno").closest(".field").hidden = !comDatas && dashEstado.periodo === "turno";
    $("dash-f-de").value = dashEstado.de || per.de;
    $("dash-f-ate").value = dashEstado.ate || per.ate;
    $("form-dash-filtros").dataset.periodo = periodoPedido || dashEstado.periodo;
    ["dash-f-turno", "dash-f-pagamento"].forEach(function (id) {
      $(id).dataset.chipsTodos = "1";
      aprimorarSelectEmChips($(id));
      sincronizarChips($(id));
    });
    $("modal-dash-filtros").classList.add("show");
  }

  $("dash-periodos").addEventListener("click", function (e) {
    const b = e.target.closest("[data-dash-periodo]");
    if (!b) return;
    if (b.dataset.dashPeriodo === "personalizado") return abrirFiltrosDashboard("personalizado");
    dashEstado.periodo = b.dataset.dashPeriodo;
    renderDashboard();
  });
  $("btn-dash-filtros").addEventListener("click", function () { abrirFiltrosDashboard(); });
  $("form-dash-filtros").addEventListener("submit", function (e) {
    e.preventDefault();
    dashEstado.turno = $("dash-f-turno").value;
    dashEstado.operador = $("dash-f-operador").value;
    dashEstado.pagamento = $("dash-f-pagamento").value;
    if (this.dataset.periodo === "personalizado") {
      const de = $("dash-f-de").value;
      const ate = $("dash-f-ate").value;
      if (!de || !ate) { mostrarAlerta("Escolha a data inicial e a final.", "error"); return; }
      dashEstado.periodo = "personalizado";
      dashEstado.de = de <= ate ? de : ate;
      dashEstado.ate = de <= ate ? ate : de;
    }
    $("modal-dash-filtros").classList.remove("show");
    renderDashboard();
  });
  $("btn-dash-limpar").addEventListener("click", function () {
    dashEstado.turno = "";
    dashEstado.operador = "";
    dashEstado.pagamento = "";
    $("modal-dash-filtros").classList.remove("show");
    renderDashboard();
  });
  $("tab-dashboard").addEventListener("click", function (e) {
    const tirar = e.target.closest("[data-dash-tirar]");
    if (tirar) { dashEstado[tirar.dataset.dashTirar] = ""; return renderDashboard(); }
    if (e.target.closest("[data-dash-abrir-filtros]")) return abrirFiltrosDashboard("personalizado");
    if (e.target.closest("[data-dash-ver-faltando]")) {
      filtroEstoque.cad = "faltando";
      const aba = document.querySelector('.tab-btn[data-tab="tab-cadastro"]');
      if (aba) aba.click();
      $("seg-cad-produtos").click();
      return;
    }
    if (e.target.closest("[data-dash-tabela]")) { dashEstado.tabela = !dashEstado.tabela; return renderDashboard(); }
    if (e.target.closest("[data-dash-rank-todos]")) { dashEstado.rankTodos = !dashEstado.rankTodos; return renderDashboard(); }
    const modo = e.target.closest("[data-dash-rank]");
    if (modo) { dashEstado.rankModo = modo.dataset.dashRank; dashEstado.rankTodos = false; return renderDashboard(); }
    const item = e.target.closest("[data-dash-rank-item]");
    if (item) {
      const partes = item.dataset.dashRankItem.split(":");
      return abrirDetalheRanking(partes[0], partes.slice(1).join(":"));
    }
  });
  $("dash-abas").addEventListener("click", function () { setTimeout(renderDashboard, 0); });
  $("btn-dash-detalhe-repor").addEventListener("click", function () {
    $("modal-dash-detalhe").classList.remove("show");
    abrirRepor(this.dataset.sku);
  });
  let redimensionarDash = null;
  window.addEventListener("resize", function () {
    clearTimeout(redimensionarDash);
    redimensionarDash = setTimeout(function () {
      if ($("tab-dashboard").classList.contains("active")) renderDashboard();
    }, 150);
  });

  let movsCaixaFiltrados = [];

  function renderCaixa() {
    $("stat-caixa-cedulas").textContent = fmtMoeda(Number(caixa.cedulas) || 0);
    $("stat-caixa-moedas").textContent = fmtMoeda(Number(caixa.moedas) || 0);
    $("stat-caixa-total").textContent = fmtMoeda(totalCaixa(caixa));
    $("caixa-cedulas").value = mascararMoeda(Math.round((Number(caixa.cedulas) || 0) * 100));
    $("caixa-moedas").value = mascararMoeda(Math.round((Number(caixa.moedas) || 0) * 100));
    const perfil = perfilAtivoSnapshot();
    $("caixa-operador-hint").textContent = perfil ? perfil.nome : "—";
    renderCaixaTurno();

    const container = $("lista-caixa");
    container.innerHTML = "";
    const dataDe = $("filtro-caixa-de").value;
    const dataAte = $("filtro-caixa-ate").value;
    const turnoFiltro = $("filtro-caixa-turno").value ? parseInt($("filtro-caixa-turno").value, 10) : null;
    movsCaixaFiltrados = caixa.historico
      .slice()
      .filter(function (m) {
        const turnoRegistro = m.turno || 1;
        const dia = m.dataOperacional || dataLocalISO(new Date(m.data));
        if (turnoFiltro && turnoRegistro !== turnoFiltro) return false;
        if (dataDe && dia < dataDe) return false;
        if (dataAte && dia > dataAte) return false;
        return true;
      })
      .sort((a, b) => new Date(b.data) - new Date(a.data));
    const movs = movsCaixaFiltrados;
    $("empty-caixa").style.display = movs.length === 0 ? "block" : "none";

    movs.forEach(function (m, i) {
      const rotulo = m.tipo === "entrada"
        ? "<span class='tag-entrada'>Entrada</span>"
        : m.tipo === "saida"
          ? "<span class='tag-saida'>Saída</span>"
          : m.tipo === "trocoPix"
            ? "<span class='tag-pix'>Pix</span>"
            : "<span class='tag-retirada'>Retirada</span>";
      const detalhes = m.tipo === "retirada"
        ? escapeHtml(m.descricao || "—")
        : (m.automatico ? escapeHtml(m.descricao || m.origem) + " — " + escapeHtml(m.origem) : "Ajuste de contagem — " + escapeHtml(m.origem));
      const composicao = m.tipo === "retirada" && (typeof m.cedulas === "number" || typeof m.moedas === "number")
        ? " · Cédulas " + fmtMoeda(m.cedulas || 0) + " · Moedas " + fmtMoeda(m.moedas || 0)
        : "";
      const operador = m.operador && m.operador.nome ? m.operador.nome : "Sem operador";
      const valor = (m.tipo === "entrada" ? "+" : "−") + fmtMoeda(m.valor);
      const editavel = Boolean(m.automatico && m.referencia && m.referencia.id);
      const div = document.createElement("div");
      div.className = "cash-data-row" + (editavel ? " cash-row-editavel" : "");
      if (editavel) div.dataset.editarCaixa = i;
      div.innerHTML =
        "<div><strong>" + detalhes + "</strong>" +
        '<span class="sub">' + formatarData(m.data) + " · " + escapeHtml(operador) + " · Turno " + (m.turno || 1) + (m.tipo === "trocoPix" ? " · Não sai da gaveta" : m.automatico ? " · Cédulas " + fmtMoeda(m.cedulas || 0) + " · Moedas " + fmtMoeda(m.moedas || 0) : composicao) + (m.autorizacao && m.autorizacao.porPin ? " · Corrigido com PIN do admin" + (m.autorizacao.operador && m.autorizacao.operador.nome ? " por " + escapeHtml(m.autorizacao.operador.nome) : "") + " em " + formatarData(m.autorizacao.em) : "") + "</span></div>" +
        "<div>" + rotulo + "</div>" +
        '<div><strong class="cash-value">' + valor + "</strong></div>" +
        "<div class='row-actions'>" + (m.automatico
          ? (editavel ? "<button type='button' class='btn btn-outline'>Editar</button>" : "")
          : "<button class='btn btn-danger' data-excluir-caixa=" + i + ">Excluir</button>") + "</div>";
      container.appendChild(div);
    });
  }

  function valorConsumoVinculadoFin() {
    return consumosVinculadosFin.reduce(function (total, item) { return total + (Number(item.valorTotal) || 0); }, 0);
  }

  /* ----- Admin corrige o dinheiro recebido e o troco de um registro ----- */
  let caixaRegistroEditando = null;

  function movimentosDaReferencia(referencia) {
    return caixa.historico.filter(function (mov) {
      return mov.automatico && mov.referencia && mov.referencia.tipo === referencia.tipo && mov.referencia.id === referencia.id;
    });
  }

  function registroDaReferencia(referencia) {
    if (referencia.tipo === "abastecimento") return { lista: abastecimentos, chave: KEY_ABASTECIMENTOS, registro: abastecimentos.find(function (r) { return r.id === referencia.id; }) };
    if (referencia.tipo === "venda") return { lista: vendas, chave: KEY_VENDAS, registro: vendas.find(function (v) { return v.id === referencia.id; }) };
    return { registro: null };
  }

  function numerarioCaixaRegistro() {
    const cedulasRecebidas = valorNumerario("cxr-cedulas-recebidas");
    const moedasRecebidas = valorNumerario("cxr-moedas-recebidas");
    const cedulasTroco = valorNumerario("cxr-cedulas-troco");
    const moedasTroco = valorNumerario("cxr-moedas-troco");
    return {
      cedulasRecebidas: cedulasRecebidas,
      moedasRecebidas: moedasRecebidas,
      cedulasTroco: cedulasTroco,
      moedasTroco: moedasTroco,
      recebido: arred(cedulasRecebidas + moedasRecebidas),
      troco: arred(cedulasTroco + moedasTroco),
      ajusteTroco: 0,
      excedente: 0
    };
  }

  function atualizarResumoCaixaRegistro() {
    const n = numerarioCaixaRegistro();
    $("cxr-resumo").textContent = "Entrada " + fmtMoeda(n.recebido) + " · Saída (troco) " + fmtMoeda(n.troco) + " · Fica no caixa " + fmtMoeda(arred(n.recebido - n.troco));
  }

  /* ---------------- PIN do admin ---------------- */
  // Barreira para o uso no balcão, não segurança forte: o hash fica no localStorage.
  const PIN_PADRAO = "0000";
  const PIN_TENTATIVAS = 5;
  const PIN_BLOQUEIO_MS = 60000;
  const KEY_PIN_BLOQUEIO = "eletroposto_pin_bloqueio";
  let pinErros = 0;
  let pinResolver = null;

  function hashPin(pin) {
    return hashTexto("eletroposto-pin:" + pin);
  }

  function pinAdminHash() {
    return (config.pinAdmin && config.pinAdmin.hash) || hashPin(PIN_PADRAO);
  }

  function bloqueioPinRestante() {
    let ate = 0;
    try { ate = Number(localStorage.getItem(KEY_PIN_BLOQUEIO)) || 0; } catch (e) {}
    return Math.max(0, ate - Date.now());
  }

  function digitosPin() {
    return Array.from(document.querySelectorAll("#pin-caixas .pin-digito"));
  }

  function limparPin() {
    digitosPin().forEach(function (d) { d.value = ""; });
  }

  function avisarBloqueioPin() {
    const restante = bloqueioPinRestante();
    if (!restante) return false;
    $("pin-admin-erro").textContent = "Muitas tentativas erradas. Tente de novo em " + Math.ceil(restante / 1000) + " s.";
    return true;
  }

  function pedirPinAdmin(motivo) {
    if (pinResolver) pinResolver(false);
    return new Promise(function (resolve) {
      pinResolver = resolve;
      $("pin-admin-motivo").textContent = motivo;
      $("pin-admin-erro").textContent = "";
      $("pin-caixas").classList.remove("pin-errado");
      limparPin();
      $("modal-pin-admin").classList.add("show");
      avisarBloqueioPin();
      setTimeout(function () { digitosPin()[0].focus(); }, 50);
    });
  }

  function fecharPinAdmin(ok) {
    $("modal-pin-admin").classList.remove("show");
    limparPin();
    const resolver = pinResolver;
    pinResolver = null;
    if (resolver) resolver(ok);
  }

  function conferirPinAdmin() {
    if (avisarBloqueioPin()) return;
    const pin = digitosPin().map(function (d) { return d.value; }).join("");
    if (!/^\d{4}$/.test(pin)) {
      $("pin-admin-erro").textContent = "Digite os 4 números do PIN.";
      return;
    }
    if (hashPin(pin) === pinAdminHash()) {
      pinErros = 0;
      fecharPinAdmin(true);
      return;
    }
    pinErros++;
    const caixas = $("pin-caixas");
    caixas.classList.remove("pin-errado");
    void caixas.offsetWidth;
    caixas.classList.add("pin-errado");
    limparPin();
    if (pinErros >= PIN_TENTATIVAS) {
      pinErros = 0;
      try { localStorage.setItem(KEY_PIN_BLOQUEIO, String(Date.now() + PIN_BLOQUEIO_MS)); } catch (e) {}
      avisarBloqueioPin();
      return;
    }
    const restam = PIN_TENTATIVAS - pinErros;
    $("pin-admin-erro").textContent = "PIN incorreto. " + (restam === 1 ? "Resta 1 tentativa." : "Restam " + restam + " tentativas.");
    digitosPin()[0].focus();
  }

  $("pin-caixas").addEventListener("input", function (e) {
    const campo = e.target.closest(".pin-digito");
    if (!campo) return;
    const digitos = digitosPin();
    const numeros = campo.value.replace(/\D/g, "");
    let indice = digitos.indexOf(campo);
    // Colar o PIN inteiro numa casa distribui os números pelas seguintes.
    campo.value = numeros.slice(0, 1);
    numeros.slice(1).split("").forEach(function (n) {
      if (indice + 1 < digitos.length) digitos[++indice].value = n;
    });
    $("pin-caixas").classList.remove("pin-errado");
    if (!numeros) return;
    if (indice + 1 < digitos.length) digitos[indice + 1].focus();
    else if (digitos.every(function (d) { return d.value; })) conferirPinAdmin();
  });
  $("pin-caixas").addEventListener("keydown", function (e) {
    const campo = e.target.closest(".pin-digito");
    if (!campo) return;
    const digitos = digitosPin();
    const indice = digitos.indexOf(campo);
    if (e.key === "Backspace" && !campo.value && indice > 0) {
      digitos[indice - 1].value = "";
      digitos[indice - 1].focus();
      e.preventDefault();
    } else if (e.key === "Escape") {
      fecharPinAdmin(false);
    }
  });
  $("form-pin-admin").addEventListener("submit", function (e) {
    e.preventDefault();
    conferirPinAdmin();
  });
  $("btn-pin-cancelar").addEventListener("click", function () { fecharPinAdmin(false); });
  $("btn-pin-fechar").addEventListener("click", function () { fecharPinAdmin(false); });
  $("modal-pin-admin").addEventListener("click", function (e) {
    if (e.target === this) fecharPinAdmin(false);
  });

  function abrirEdicaoCaixaRegistro(mov, autorizadoPorPin) {
    if (!autorizadoPorPin && !exigirAdmin()) return;
    const movs = movimentosDaReferencia(mov.referencia);
    const soma = function (tipo, campo) {
      return arred(movs.reduce(function (t, m) { return t + (m.tipo === tipo ? Number(m[campo]) || 0 : 0); }, 0));
    };
    const base = movs.find(function (m) { return m.tipo === "entrada"; }) || mov;
    caixaRegistroEditando = { referencia: mov.referencia, origem: base.origem, data: base.data, turno: base.turno, operador: base.operador || null, trocoPix: soma("trocoPix", "valor"), autorizadoPorPin: !!autorizadoPorPin };
    const alvo = registroDaReferencia(mov.referencia).registro;
    const cobrado = alvo ? Number(alvo.valorCobrado != null ? alvo.valorCobrado : alvo.valorTotal) : NaN;
    $("cxr-titulo").textContent = base.origem || "Registro";
    $("cxr-info").textContent = formatarData(base.data) + " · " + (base.operador && base.operador.nome ? base.operador.nome : "Sem operador") + " · Turno " + (base.turno || 1) + (isNaN(cobrado) ? "" : " · Total do registro " + fmtMoeda(cobrado));
    $("cxr-cedulas-recebidas").value = moedaParaCampo(soma("entrada", "cedulas"));
    $("cxr-moedas-recebidas").value = moedaParaCampo(soma("entrada", "moedas"));
    $("cxr-cedulas-troco").value = moedaParaCampo(soma("saida", "cedulas"));
    $("cxr-moedas-troco").value = moedaParaCampo(soma("saida", "moedas"));
    atualizarResumoCaixaRegistro();
    $("modal-caixa-registro").classList.add("show");
  }

  ["cxr-cedulas-recebidas", "cxr-moedas-recebidas", "cxr-cedulas-troco", "cxr-moedas-troco"].forEach(function (id) {
    $(id).addEventListener("input", atualizarResumoCaixaRegistro);
  });

  $("form-caixa-registro").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!caixaRegistroEditando || (!caixaRegistroEditando.autorizadoPorPin && !exigirAdmin())) return;
    const n = numerarioCaixaRegistro();
    if (n.troco > n.recebido + 0.009) {
      mostrarAlerta("O troco não pode ser maior que o valor recebido.", "error");
      return;
    }
    const ed = caixaRegistroEditando;
    n.trocoPix = ed.trocoPix || 0;
    estornarNumerarioCaixa(ed.referencia);
    registrarNumerarioCaixa(ed.referencia, ed.origem, n, ed.turno, ed.operador, ed.data);
    if (ed.autorizadoPorPin) {
      const autorizacao = { porPin: true, operador: perfilAtivoSnapshot(), em: new Date().toISOString() };
      movimentosDaReferencia(ed.referencia).forEach(function (m) { m.autorizacao = autorizacao; });
      salvarESyncIncremental(KEY_CAIXA, caixa);
    }
    const alvo = registroDaReferencia(ed.referencia);
    if (alvo.registro) {
      alvo.registro.valorEntregue = n.recebido;
      alvo.registro.troco = arred(n.troco + n.trocoPix);
      salvarESyncIncremental(alvo.chave, alvo.lista);
    }
    caixaRegistroEditando = null;
    $("modal-caixa-registro").classList.remove("show");
    renderCaixa();
    mostrarAlerta("Dinheiro do registro corrigido: entrada " + fmtMoeda(n.recebido) + ", troco " + fmtMoeda(n.troco) + ".", "success");
  });

  $("lista-caixa").addEventListener("click", function (ev) {
    const linhaEditavel = ev.target.closest("[data-editar-caixa]");
    if (linhaEditavel && !ev.target.closest("[data-excluir-caixa]")) {
      const movEditar = movsCaixaFiltrados[parseInt(linhaEditavel.dataset.editarCaixa, 10)];
      if (!movEditar) return;
      if (ehAdmin()) {
        abrirEdicaoCaixaRegistro(movEditar);
        return;
      }
      pedirPinAdmin("Para corrigir o dinheiro deste registro, peça ao admin que digite o PIN.").then(function (ok) {
        if (ok) abrirEdicaoCaixaRegistro(movEditar, true);
      });
      return;
    }
    const btn = ev.target.closest("[data-excluir-caixa]");
    if (!btn) return;
    if (!exigirAdmin()) return;
    const idx = parseInt(btn.dataset.excluirCaixa, 10);
    const mov = caixa.historico.find((x) => x.id === movsCaixaFiltrados[idx].id);
    if (!mov) return;
    let mensagem = "";
    if (mov.tipo === "retirada") {
      mensagem = "Excluir esta retirada? O valor será devolvido ao caixa.";
    } else if (mov.tipo === "entrada") {
      mensagem = "Excluir esta entrada? O valor será subtraído do caixa.";
    } else if (mov.tipo === "saida") {
      mensagem = "Excluir esta saída? O valor será adicionado ao caixa.";
    }
    if (confirm(mensagem)) {
      if (mov.tipo === "retirada") {
        if (typeof mov.cedulas === "number" || typeof mov.moedas === "number") {
          caixa.cedulas = arred((Number(caixa.cedulas) || 0) + (Number(mov.cedulas) || 0));
          caixa.moedas = arred((Number(caixa.moedas) || 0) + (Number(mov.moedas) || 0));
        } else somarAoCaixa(caixa, mov.valor);
      } else if (mov.tipo === "entrada") {
        subtrairDoCaixa(caixa, mov.valor);
      } else if (mov.tipo === "saida") {
        somarAoCaixa(caixa, mov.valor);
      }
      caixa.historico = caixa.historico.filter((x) => x.id !== mov.id);
      salvarESyncIncremental(KEY_CAIXA, caixa);
      renderCaixa();
      mostrarAlerta("Movimento excluído; caixa ajustado.", "success");
    }
  });

  $("form-caixa-contagem").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!exigirAdmin()) return;
    const novaC = moedaDaMascara($("caixa-cedulas").value);
    const novaM = moedaDaMascara($("caixa-moedas").value);
    if (isNaN(novaC) || isNaN(novaM) || novaC < 0 || novaM < 0) {
      mostrarAlerta("Informe valores válidos (maiores ou iguais a zero) para cédulas e moedas.", "error");
      return;
    }
    const deltaC = arred(novaC - (Number(caixa.cedulas) || 0));
    const deltaM = arred(novaM - (Number(caixa.moedas) || 0));
    if (deltaC === 0 && deltaM === 0) {
      mostrarAlerta("Nenhuma alteração nos valores.", "error");
      return;
    }
    const agora = new Date().toISOString();
    const turnoInfo = getTurnoAtivo();
    const mudancas = [];
    if (deltaC !== 0) {
      caixa.historico.push({
        id: "c" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        data: agora,
        turno: turnoInfo.turnoId,
        dataOperacional: turnoInfo.dataOperacional,
        tipo: deltaC > 0 ? "entrada" : "saida",
        origem: "Cédulas",
        descricao: "",
        operador: null,
        valor: Math.abs(deltaC)
      });
      mudancas.push((deltaC > 0 ? "+" : "−") + fmtMoeda(Math.abs(deltaC)) + " em cédulas");
    }
    if (deltaM !== 0) {
      caixa.historico.push({
        id: "c" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        data: agora,
        turno: turnoInfo.turnoId,
        dataOperacional: turnoInfo.dataOperacional,
        tipo: deltaM > 0 ? "entrada" : "saida",
        origem: "Moedas",
        descricao: "",
        operador: null,
        valor: Math.abs(deltaM)
      });
      mudancas.push((deltaM > 0 ? "+" : "−") + fmtMoeda(Math.abs(deltaM)) + " em moedas");
    }
    caixa.cedulas = arred(novaC);
    caixa.moedas = arred(novaM);
    salvarESyncIncremental(KEY_CAIXA, caixa);
    renderCaixa();
    $("modal-caixa-contagem").classList.remove("show");
    mostrarAlerta("Caixa atualizado: " + mudancas.join(", ") + ".", "success");
  });

  $("form-caixa-retirada").addEventListener("submit", function (e) {
    e.preventDefault();
    // No fechamento de turno o operador também registra a saída do dinheiro do turno.
    if (!fechamentoPendente && !exigirAdmin()) return;
    const cedulas = arred(moedaDaMascara($("caixa-retirada-cedulas").value));
    const moedas = arred(moedaDaMascara($("caixa-retirada-moedas").value));
    const valor = arred(cedulas + moedas);
    const motivo = $("caixa-retirada-motivo").value.trim();
    if (isNaN(cedulas) || isNaN(moedas) || cedulas < 0 || moedas < 0 || valor <= 0) {
      mostrarAlerta("Informe uma retirada válida em cédulas e/ou moedas.", "error");
      return;
    }
    if (!motivo) {
      mostrarAlerta("Informe o motivo da retirada.", "error");
      return;
    }
    if (cedulas > (Number(caixa.cedulas) || 0) + 0.0001) {
      mostrarAlerta("Retirada maior que as cédulas disponíveis (" + fmtMoeda(caixa.cedulas) + ").", "error");
      return;
    }
    if (moedas > (Number(caixa.moedas) || 0) + 0.0001) {
      mostrarAlerta("Retirada maior que as moedas disponíveis (" + fmtMoeda(caixa.moedas) + ").", "error");
      return;
    }
    const perfil = perfilAtivoSnapshot();
    const turnoInfo = getTurnoAtivo();
    caixa.cedulas = arred((Number(caixa.cedulas) || 0) - cedulas);
    caixa.moedas = arred((Number(caixa.moedas) || 0) - moedas);
    caixa.historico.push({
      id: "r" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      data: new Date().toISOString(),
      turno: turnoInfo.turnoId,
      dataOperacional: turnoInfo.dataOperacional,
      tipo: "retirada",
      origem: "Retirada",
      descricao: motivo,
      operador: perfil ? { id: perfil.id, nome: perfil.nome } : null,
      cedulas: cedulas,
      moedas: moedas,
      valor: valor,
      fechamentoTurno: fechamentoPendente ? { turno: fechamentoPendente.turno, dataDe: fechamentoPendente.dataDe, dataAte: fechamentoPendente.dataAte } : undefined
    });
    salvarESyncIncremental(KEY_CAIXA, caixa);
    if (fechamentoPendente) {
      renderCaixa();
      mostrarAlerta("Saída de " + fmtMoeda(valor) + " registrada no caixa.", "success");
      concluirFechamento();
      return;
    }
    $("caixa-retirada-cedulas").value = "";
    $("caixa-retirada-moedas").value = "";
    $("caixa-retirada-motivo").value = "";
    renderCaixa();
    $("modal-caixa-retirada").classList.remove("show");
    mostrarAlerta("Retirada de " + fmtMoeda(valor) + " registrada.", "success");
  });

  $("filtro-caixa-de").addEventListener("input", renderCaixa);
  $("filtro-caixa-ate").addEventListener("input", renderCaixa);
  $("filtro-caixa-turno").addEventListener("change", renderCaixa);

  $("btn-limpar-filtro-caixa").addEventListener("click", function () {
    $("filtro-caixa-de").value = "";
    $("filtro-caixa-ate").value = "";
    $("filtro-caixa-turno").value = "";
    renderCaixa();
  });

  function obterPeriodoRelatorio(filtroDeId, filtroAteId, dataRelId) {
    let dataDe = $(filtroDeId).value;
    let dataAte = $(filtroAteId).value;
    if (dataDe && dataAte && dataAte < dataDe) {
      mostrarAlerta("A data final deve ser maior ou igual à data inicial.", "error");
      return null;
    }
    let descricaoData = "";
    if (dataDe || dataAte) {
      descricaoData = dataDe && dataAte
        ? dataDe.split("-").reverse().join("/") + " a " + dataAte.split("-").reverse().join("/")
        : (dataDe || dataAte).split("-").reverse().join("/");
    } else if ($(dataRelId).value) {
      descricaoData = $(dataRelId).value.split("-").reverse().join("/");
      dataDe = dataAte = $(dataRelId).value;
    } else {
      mostrarAlerta("Selecione o período no filtro ou a data do relatório.", "error");
      return null;
    }
    return { dataDe: dataDe, dataAte: dataAte, descricaoData: descricaoData };
  }

  function abrirWhatsApp(msg) {
    window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
  }

  function abrirFechamentoTurno() {
    const turno = getTurnoAtivo();
    const seletor = $("fechamento-operador");
    seletor.innerHTML = '<option value="">Todos os operadores</option>';
    perfis.forEach(function (perfil) {
      const opcao = document.createElement("option");
      opcao.value = perfil.id;
      opcao.textContent = perfil.nome;
      seletor.appendChild(opcao);
    });
    seletor.value = perfilAtivoId || "";
    $("fechamento-turno").value = String(turno.turnoId);
    $("fechamento-data-de").value = turno.dataOperacional;
    $("fechamento-data-ate").value = turno.dataOperacional;
    $("modal-fechar-turno").classList.add("show");
  }

  function fecharFechamentoTurno() {
    $("modal-fechar-turno").classList.remove("show");
  }

  function operadorDoRegistro(registro) {
    return registro.operador || registro.perfil || null;
  }

  function pertenceAoOperador(registro, operadorId) {
    const operador = operadorDoRegistro(registro);
    return !operadorId || (operador && operador.id === operadorId);
  }

  $("modal-fechar-fechamento").addEventListener("click", fecharFechamentoTurno);
  $("btn-cancelar-fechamento").addEventListener("click", fecharFechamentoTurno);
  $("modal-fechar-turno").addEventListener("click", function (e) { if (e.target === this) fecharFechamentoTurno(); });
  // Fechar turno em duas etapas: primeiro a saída do dinheiro do turno no caixa,
  // depois os relatórios no WhatsApp, já com o caixa descontado.
  let fechamentoPendente = null;

  $("form-fechar-turno").addEventListener("submit", function (e) {
    e.preventDefault();
    const dataDe = $("fechamento-data-de").value;
    const dataAte = $("fechamento-data-ate").value;
    const turno = parseInt($("fechamento-turno").value, 10);
    const operadorId = $("fechamento-operador").value;
    if (!dataDe || !dataAte || dataAte < dataDe) {
      mostrarAlerta("Informe um período de fechamento válido.", "error");
      return;
    }
    fecharFechamentoTurno();
    abrirSaidaFechamento({ turno: turno, dataDe: dataDe, dataAte: dataAte, operadorId: operadorId });
  });

  function descricaoPeriodo(dataDe, dataAte) {
    const de = dataDe.split("-").reverse().join("/");
    return dataDe === dataAte ? de : de + " a " + dataAte.split("-").reverse().join("/");
  }

  function mesmoFechamento(mov, pendente) {
    const f = mov && mov.tipo === "retirada" ? mov.fechamentoTurno : null;
    return !!f && f.turno === pendente.turno && f.dataDe === pendente.dataDe && f.dataAte === pendente.dataAte;
  }

  // Horário de cada turno pedido no fechamento: do início dele ao início do turno
  // seguinte (o intervalo depois do último turno conta nele, como em getDadosTurnoAtual).
  function janelasDoFechamento(pendente) {
    const turnos = listaTurnos();
    if (!turnos.length) return [];
    const inicioDia = parseTimeToMinutes(turnos[0].inicio);
    const inicios = turnos.map(function (t) {
      return { id: Number(t.id), ini: (parseTimeToMinutes(t.inicio) - inicioDia + 1440) % 1440 };
    }).sort(function (a, b) { return a.ini - b.ini; });
    const so = Number(pendente.turno) || 0;
    const janelas = [];
    for (let dia = pendente.dataDe; dia && dia <= pendente.dataAte; dia = somarDias(dia, 1)) {
      const base = inicioDiaOperacional(dia).getTime();
      inicios.forEach(function (t, i) {
        if (so && t.id !== so) return;
        const fim = i + 1 < inicios.length ? inicios[i + 1].ini : 1440;
        janelas.push({ de: base + t.ini * 60000, ate: base + fim * 60000 });
      });
    }
    return janelas;
  }

  // Dinheiro do turno: tudo o que entrou e saiu do caixa no horário do turno, por espécie,
  // para o caixa voltar ao valor com que o turno começou. Conta pelo horário do movimento,
  // não pela etiqueta de turno, e não conta fechamentos: o deste turno é descontado à parte
  // e os dos outros turnos pertencem a eles. Nunca passa do que há no caixa.
  function movimentosDoTurno(pendente) {
    const janelas = janelasDoFechamento(pendente);
    return caixa.historico.filter(function (mov) {
      if (!mov || (mov.tipo === "retirada" && mov.fechamentoTurno)) return false;
      const quando = new Date(mov.data).getTime();
      return janelas.some(function (j) { return quando >= j.de && quando < j.ate; });
    });
  }

  function dinheiroDoTurno(pendente) {
    const saldo = saldoDoCaixa(movimentosDoTurno(pendente));
    let cedulas = saldo.cedulas;
    let moedas = saldo.moedas;
    let jaRetirado = 0;
    caixa.historico.forEach(function (mov) {
      if (!mesmoFechamento(mov, pendente)) return;
      cedulas -= Number(mov.cedulas) || 0;
      moedas -= Number(mov.moedas) || 0;
      jaRetirado += Number(mov.valor) || 0;
    });
    return {
      cedulas: arred(Math.min(Math.max(0, cedulas), Number(caixa.cedulas) || 0)),
      moedas: arred(Math.min(Math.max(0, moedas), Number(caixa.moedas) || 0)),
      jaRetirado: arred(jaRetirado)
    };
  }

  function turnoAtualDoCaixa() {
    const turno = getTurnoAtivo();
    return { turno: Number(turno.turnoId), dataDe: turno.dataOperacional, dataAte: turno.dataOperacional };
  }

  // Caixa do turno: o mesmo dinheiro que o fechamento vai sugerir, para o operador
  // conferir a gaveta durante o turno. Fundo inicial é o que já estava no caixa antes.
  function renderCaixaTurno() {
    if (!$("caixa-turno")) return;
    const pendente = turnoAtualDoCaixa();
    const dinheiro = dinheiroDoTurno(pendente);
    const liquido = arred(dinheiro.cedulas + dinheiro.moedas);
    let recebido = 0;
    let troco = 0;
    let trocoPix = 0;
    let liquidoBruto = 0;
    movimentosDoTurno(pendente).forEach(function (mov) {
      const valor = Number(mov.valor) || 0;
      if (mov.tipo === "trocoPix") { trocoPix += valor; return; }
      if (mov.automatico && mov.tipo === "entrada") recebido += valor;
      else if (mov.automatico && mov.tipo === "saida") troco += valor;
      liquidoBruto += mov.tipo === "entrada" ? valor : -valor;
    });
    recebido = arred(recebido);
    troco = arred(troco);
    const outros = arred(liquidoBruto - (recebido - troco));
    const total = totalCaixa(caixa);
    const fundo = arred(Math.max(0, total - liquido));
    $("caixa-turno-quando").textContent = nomeTurno(pendente.turno) + ", " + descricaoPeriodo(pendente.dataDe, pendente.dataAte);
    $("caixa-turno-valor").textContent = fmtMoeda(liquido);
    $("caixa-turno-vazio").hidden = Boolean(recebido || troco || outros || dinheiro.jaRetirado);
    $("caixa-turno-cedulas").textContent = fmtMoeda(dinheiro.cedulas);
    $("caixa-turno-moedas").textContent = fmtMoeda(dinheiro.moedas);
    $("caixa-turno-fundo").textContent = fmtMoeda(fundo);
    $("caixa-turno-recebido").textContent = fmtMoeda(recebido);
    $("caixa-turno-troco").textContent = fmtMoeda(troco);
    $("caixa-turno-pix-linha").hidden = !trocoPix;
    $("caixa-turno-pix").textContent = fmtMoeda(arred(trocoPix));
    $("caixa-turno-outros-linha").hidden = !outros;
    $("caixa-turno-outros").textContent = (outros > 0 ? "+" : "−") + fmtMoeda(Math.abs(outros));
    const parteTurno = total > 0 ? Math.min(100, Math.round((liquido / total) * 1000) / 10) : 0;
    $("caixa-turno-barra").style.setProperty("--parte-turno", parteTurno + "%");
    const fechado = $("caixa-turno-fechado");
    fechado.hidden = !dinheiro.jaRetirado;
    fechado.textContent = dinheiro.jaRetirado ? "Já houve fechamento de " + fmtMoeda(dinheiro.jaRetirado) + " neste turno. O valor acima é só o restante." : "";
  }

  $("btn-ver-lancamentos-turno").addEventListener("click", function () {
    const pendente = turnoAtualDoCaixa();
    const filtroTurno = $("filtro-caixa-turno");
    $("filtro-caixa-de").value = pendente.dataDe;
    $("filtro-caixa-ate").value = pendente.dataAte;
    filtroTurno.value = String(pendente.turno);
    if (filtroTurno.value !== String(pendente.turno)) filtroTurno.value = "";
    renderCaixa();
    const lista = $("lista-caixa");
    if (lista.scrollIntoView) lista.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // O turno muda com o relógio: a cada minuto o card confere se já é outro turno.
  setInterval(function () {
    if (window.__eletropostoInstanciaAtual === instanciaApp) renderCaixaTurno();
  }, 60000);

  function abrirSaidaFechamento(pendente) {
    fechamentoPendente = pendente;
    const dinheiro = dinheiroDoTurno(pendente);
    const sobrou = dinheiro.cedulas + dinheiro.moedas > 0;
    renderCaixa();
    $("caixa-retirada-titulo").textContent = "Fechamento do caixa";
    $("caixa-retirada-intro").hidden = false;
    $("caixa-retirada-cedulas").value = dinheiro.cedulas > 0 ? moedaParaCampo(dinheiro.cedulas) : "";
    $("caixa-retirada-moedas").value = dinheiro.moedas > 0 ? moedaParaCampo(dinheiro.moedas) : "";
    $("caixa-retirada-motivo").value = "Fechamento de Turno " + String(pendente.turno).padStart(2, "0") + " - " + descricaoPeriodo(pendente.dataDe, pendente.dataAte);
    const aviso = $("caixa-retirada-aviso");
    aviso.hidden = !dinheiro.jaRetirado;
    aviso.textContent = dinheiro.jaRetirado ? "Já houve fechamento de " + fmtMoeda(dinheiro.jaRetirado) + " neste turno." + (sobrou ? " Os campos trazem só o restante." : " Não sobrou dinheiro do turno para retirar.") : "";
    const registrar = $("btn-registrar-retirada");
    const pular = $("btn-enviar-sem-saida");
    registrar.textContent = "Registrar saída e enviar relatórios";
    registrar.className = "btn " + (sobrou ? "btn-primary" : "btn-outline");
    pular.className = "btn " + (sobrou ? "btn-outline" : "btn-primary");
    pular.hidden = false;
    $("modal-caixa-retirada").classList.add("show");
  }

  // Volta a folha de retirada ao modo normal (botão "Registrar retirada" do Caixa).
  function sairModoFechamento() {
    fechamentoPendente = null;
    $("caixa-retirada-titulo").textContent = "Registrar retirada";
    $("caixa-retirada-intro").hidden = true;
    $("caixa-retirada-aviso").hidden = true;
    $("btn-registrar-retirada").textContent = "Registrar retirada";
    $("btn-registrar-retirada").className = "btn btn-primary";
    $("btn-enviar-sem-saida").hidden = true;
  }

  function concluirFechamento() {
    const pendente = fechamentoPendente;
    $("modal-caixa-retirada").classList.remove("show");
    sairModoFechamento();
    $("caixa-retirada-cedulas").value = "";
    $("caixa-retirada-moedas").value = "";
    $("caixa-retirada-motivo").value = "";
    if (pendente) enviarRelatoriosFechamento(pendente);
  }

  $("btn-enviar-sem-saida").addEventListener("click", concluirFechamento);

  function enviarRelatoriosFechamento(pendente) {
    const dataDe = pendente.dataDe;
    const dataAte = pendente.dataAte;
    const turno = pendente.turno;
    const operadorId = pendente.operadorId;
    const descricao = descricaoPeriodo(dataDe, dataAte);
    const filtro = function (registro) { return pertenceAoOperador(registro, operadorId); };
    const abastecimentosFechamento = filtrarPorPeriodoTurno(abastecimentos, dataDe, dataAte, turno).filter(filtro);
    const vendasFechamento = filtrarPorPeriodoTurno(vendas, dataDe, dataAte, turno).filter(filtro);
    const relatorioVendas = montarRelatorioWhatsApp({
      titulo: "*" + nomePosto() + "* - 🛒 Relatório de Vendas",
      descricaoData: descricao + " | Turno " + turno,
      registros: vendasFechamento,
      linhaPorItem: function (venda, indice, destino) {
        destino.push("Produto: " + (venda.produto || "—"));
        destino.push("Categoria: " + (venda.categoria || "—"));
        destino.push("Qtd: " + venda.quantidade);
        destino.push("Valor: " + fmtMoeda(venda.valorTotal));
        destino.push("Método de Pagamento: " + (venda.metodoPagamento || "—"));
      },
      resumo: function (destino) {
        const totalItens = vendasFechamento.reduce(function (soma, venda) { return soma + (Number(venda.quantidade) || 0); }, 0);
        const total = vendasFechamento.reduce(function (soma, venda) { return soma + (Number(venda.valorTotal) || 0); }, 0);
        destino.push("Total: " + totalItens + " item(ns) — " + fmtMoeda(total));
        adicionarResumoPagamentos(destino, vendasFechamento, function (venda) { return venda.valorTotal; });
        const arredVendas = arred(vendasFechamento.reduce(function (soma, venda) { return soma + (Number(venda.arredondamentoDinheiro) || 0); }, 0));
        if (arredVendas) destino.push("Arredondamentos em dinheiro: " + sinalMoeda(arredVendas));
      }
    });
    const relatorioAbastecimentos = montarRelatorioWhatsApp({
      titulo: "*" + nomePosto() + "* - 📋 Relatório de Abastecimento",
      descricaoData: descricao,
      registros: abastecimentosFechamento,
      linhaPorItem: function (abastecimento, indice, destino) {
        destino.push((indice + 1) + ". Modelo: " + (abastecimento.modelo || "—"));
        destino.push("Placa: " + (abastecimento.placa || "—"));
        destino.push("Cliente: " + (abastecimento.cliente || "—"));
        destino.push("KWH: " + fmtKwh(abastecimento.kwhUtilizado) + " kWh");
        destino.push("Valor: " + fmtMoeda(abastecimento.valorPagar));
        destino.push("Metodo de Pagamento: " + metodoPagamentoTexto(abastecimento));
      },
      resumo: function (destino) {
        const totalKwh = abastecimentosFechamento.reduce(function (soma, abastecimento) { return soma + (Number(abastecimento.kwhUtilizado) || 0); }, 0);
        const total = abastecimentosFechamento.reduce(function (soma, abastecimento) { return soma + (Number(abastecimento.valorPagar) || 0); }, 0);
        destino.push("Total de KWH: " + fmtKwh(totalKwh) + " kWh");
        destino.push("Total de Valor: " + fmtMoeda(total));
        destino.push("Total de abastecimentos: " + abastecimentosFechamento.length);
        adicionarResumoPagamentos(destino, abastecimentosFechamento);
      }
    });
    const relatorioCaixa = ["*" + nomePosto() + "* - 💰 Caixa", "", "Cédulas: " + fmtMoeda(Number(caixa.cedulas) || 0), "Moedas: " + fmtMoeda(Number(caixa.moedas) || 0), "Total em caixa: " + fmtMoeda(totalCaixa(caixa))].join("\n");
    abrirWhatsApp([relatorioVendas, relatorioAbastecimentos, relatorioCaixa].join("\n\n━━━━━━━━━━━━━━━━━━━\n\n"));
  }

  function montarRelatorioWhatsApp(opts) {
    const linhas = [];
    linhas.push(opts.titulo);
    linhas.push("");
    linhas.push("Data: " + opts.descricaoData);
    opts.registros.forEach(function (r, i) {
      linhas.push("");
      opts.linhaPorItem(r, i, linhas);
    });
    if (opts.resumo) {
      linhas.push("");
      opts.resumo(linhas);
    }
    return linhas.join("\n");
  }

  function adicionarResumoPagamentos(destino, registros, obterValor) {
    const resumo = resumoPagamentos(registros, obterValor);
    if (resumo.maquininha) destino.push("Recebido na Maquininha (Pix, Crédito e Débito): " + fmtMoeda(resumo.maquininha));
    if (resumo.dinheiro) destino.push("Recebido em Dinheiro: " + fmtMoeda(resumo.dinheiro));
    ["Pendente", "Cortesia"].concat(Object.keys(resumo.outros).filter(function (metodo) { return metodo !== "Pendente" && metodo !== "Cortesia"; })).forEach(function (metodo) {
      if (!resumo.outros[metodo]) return;
      destino.push((metodo === "Pendente" ? "Pendente (a receber)" : metodo) + ": " + fmtMoeda(resumo.outros[metodo]));
    });
  }

  function compartilharResumoCaixaWhatsApp() {
    const msg = [
      "*" + nomePosto() + "* - 💰 Caixa",
      "",
      "Cédulas: " + fmtMoeda(Number(caixa.cedulas) || 0),
      "Moedas: " + fmtMoeda(Number(caixa.moedas) || 0),
      "Total em caixa: " + fmtMoeda(totalCaixa(caixa))
    ].join("\n");
    abrirWhatsApp(msg);
  }

  $("btn-compartilhar-caixa").addEventListener("click", compartilharResumoCaixaWhatsApp);

  function compartilharRelatorioWhatsApp() {
    const turnoFiltro = $("filtro-turno").value ? parseInt($("filtro-turno").value, 10) : null;
    const periodo = obterPeriodoRelatorio("filtro-de", "filtro-ate", "data-relatorio");
    if (!periodo) return;
    const perfilFiltro = $("filtro-perfil").value;
    const registros = filtrarPorPeriodoTurno(abastecimentos, periodo.dataDe, periodo.dataAte, turnoFiltro).filter(function (r) {
      if (perfilFiltro && (!r.perfil || r.perfil.id !== perfilFiltro)) return false;
      return true;
    });
    if (registros.length === 0) {
      mostrarAlerta("Nenhum abastecimento registrado no período selecionado.", "error");
      return;
    }
    const msg = montarRelatorioWhatsApp({
      titulo: "*" + nomePosto() + "* - 📋 Relatório de Abastecimento",
      descricaoData: periodo.descricaoData,
      registros: registros,
      linhaPorItem: function (r, i, linhas) {
        linhas.push((i + 1) + ". Modelo: " + (r.modelo || "—"));
        linhas.push("Placa: " + (r.placa || "—"));
        linhas.push("Cliente: " + (r.cliente || "—"));
        linhas.push("KWH: " + fmtKwh(r.kwhUtilizado) + " kWh");
        linhas.push("Valor: " + fmtMoeda(r.valorPagar));
        linhas.push("Metodo de Pagamento: " + metodoPagamentoTexto(r));
      },
      resumo: function (linhas) {
        const totalKwh = registros.reduce((s, r) => s + (r.kwhUtilizado || 0), 0);
        const totalValor = registros.reduce((s, r) => s + (r.valorPagar || 0), 0);
        linhas.push("Total de KWH: " + fmtKwh(totalKwh) + " kWh");
        linhas.push("Total de Valor: " + fmtMoeda(totalValor));
        linhas.push("Total de abastecimentos: " + registros.length);
        adicionarResumoPagamentos(linhas, registros);
      }
    });
    abrirWhatsApp(msg);
  }

  $("btn-compartilhar").addEventListener("click", compartilharRelatorioWhatsApp);

  /* ---------------- Mensagem WhatsApp ---------------- */
  function montarMensagemWhatsApp() {
    const linhas = [];
    linhas.push("*" + nomePosto() + "* - 💰" + fmt(config.tarifaKwh) + " kW/h");
    linhas.push("");
    const carregandoLista = carregando();
    const fila = aguardando();
    const bicosLivres = carregandoLista.length === 0;
    if (bicosLivres) {
      linhas.push(pad2(totalConectores()) + " VAGAS DISPONÍVEIS");
    } else {
      let ocupados = 0;
      for (let b = 1; b <= totalConectores(); b++) {
        const s = carregandoLista.find(function (x) { return x.bico === b; });
        if (s) {
          ocupados++;
          const prog = progressoSessao(s);
          if (prog) {
            linhas.push(
              "01 VAGA COM " + Math.min(prog.pct, 99) + "% - " + Math.max(prog.restanteMin, 5) + " MIN"
            );
          } else {
            linhas.push("01 VAGA CONECTANDO");
          }
        }
      }
      const livres = totalConectores() - ocupados;
      if (livres > 0) {
        linhas.push(pad2(livres) + " VAGAS DISPONÍVEIS");
      }
    }
    if (fila.length > 0) {
      linhas.push("⏳ " + pad2(fila.length) + " AGUARDANDO VAGA");
    }
    linhas.push("");
    let potenciaAtual = null;
    let quantidadePotencia = 0;
    function adicionarGrupoPotencia() {
      if (potenciaAtual == null) return;
      linhas.push("🔋 " + potenciaAtual + "kW | " + quantidadePotencia + (quantidadePotencia > 1 ? " conectores" : " conector"));
    }
    (config.carregadores || []).forEach(function (c) {
      const potencia = Number(c.potenciaKw) || 0;
      if (potenciaAtual !== null && potencia !== potenciaAtual) {
        adicionarGrupoPotencia();
        quantidadePotencia = 0;
      }
      potenciaAtual = potencia;
      quantidadePotencia++;
    });
    adicionarGrupoPotencia();
    if (config.textoAtendimento) {
      linhas.push("");
      linhas.push("🤝 " + config.textoAtendimento);
    }
    if (config.localizacao || config.linkMapa) linhas.push("");
    if (config.localizacao) linhas.push("📍 " + config.localizacao);
    if (config.linkMapa) linhas.push(config.linkMapa);
    return linhas.join("\n");
  }

  function atualizarPreviewWhatsApp() {
    const msg = montarMensagemWhatsApp();
    const p1 = $("preview-whatsapp");
    const p2 = $("preview-whatsapp-config");
    if (p1) p1.textContent = msg;
    if (p2) p2.textContent = msg;
  }

  $("btn-whatsapp").addEventListener("click", function () {
    abrirWhatsApp(montarMensagemWhatsApp());
    fecharModalWhatsapp();
  });

  function montarMensagemAbertura() {
    return "Bom dia ⚡️☀️\n\nJá estamos funcionando! ";
  }

  // Horário de funcionamento: do início do primeiro turno ao fim do último.
  function horarioFuncionamento() {
    const turnos = listaTurnos();
    if (!turnos.length) return "";
    const inicio = turnos[0].inicio;
    const fim = turnos[turnos.length - 1].fim;
    const madrugada = Number(fim.slice(0, 2)) < 6 ? " da madrugada" : "";
    return "de " + inicio + "h às " + fim + "h" + madrugada;
  }

  function montarMensagemFechamento() {
    const horario = horarioFuncionamento();
    return "Boa noite, pessoal!\n\n*Turno finalizado.*\n\nAmanhã estamos de volta" + (horario ? " " + horario : "") + ". Uma boa noite de descanso a todos! ⚡️💤";
  }

  $("btn-whatsapp-abertura").addEventListener("click", function () {
    abrirWhatsApp(montarMensagemAbertura());
    fecharModalWhatsapp();
  });

  $("btn-whatsapp-fechamento").addEventListener("click", function () {
    abrirWhatsApp(montarMensagemFechamento());
    fecharModalWhatsapp();
  });

  /* ---------------- Configurações ---------------- */
  function renderCarregadoresConfig() {
    const container = $("cfg-carregadores");
    container.innerHTML = "";
    (config.carregadores || []).forEach(function (c, i) {
      const row = document.createElement("div");
      row.className = "form-row";
      row.style.marginBottom = "8px";
      row.style.alignItems = "end";
      row.innerHTML =
        '<div class="field" style="flex:1 1 70%;">' +
          '<label>Bico ' + (i + 1) + ' — Potência máxima (kW)</label>' +
          '<input type="number" class="cfg-potencia-cg" min="1" step="1" value="' + c.potenciaKw + '">' +
        '</div>' +
        '<div class="field" style="flex:0 0 auto;">' +
          '<button type="button" class="btn btn-danger" data-remover-carregador="' + i + '"' +
            (config.carregadores.length <= 1 ? ' disabled' : '') + '>✕</button>' +
        '</div>';
      container.appendChild(row);
    });
    const btnAdd = $("btn-adicionar-carregador");
    if (btnAdd) btnAdd.style.display = config.carregadores.length >= 20 ? "none" : "";
  }

  function preencherConfig() {
    $("cfg-tarifa").value = moedaParaCampo(config.tarifaKwh);
    renderCarregadoresConfig();
    $("cfg-cor").value = config.corPrimaria || "#f97316";
    $("cfg-cor-valor").textContent = (config.corPrimaria || "#f97316").toUpperCase();
    $("cfg-cor-secundaria").value = config.corSecundaria || "#fff7ed";
    $("cfg-cor-secundaria-valor").textContent = (config.corSecundaria || "#fff7ed").toUpperCase();
    $("cfg-nome-sistema").value = nomePosto();
    $("cfg-logo-preview").src = config.logoSistema || LOGO_PADRAO;
    $("cfg-atendimento").value = config.textoAtendimento || "";
    $("cfg-localizacao").value = config.localizacao || "";
    $("cfg-mapa").value = config.linkMapa || "";
  }

  $("cfg-cor").addEventListener("input", function () {
    $("cfg-cor-valor").textContent = $("cfg-cor").value.toUpperCase();
  });

  $("cfg-cor-secundaria").addEventListener("input", function () {
    $("cfg-cor-secundaria-valor").textContent = $("cfg-cor-secundaria").value.toUpperCase();
  });

  let logoSistemaPendente = null;

  function gerarLogoQuadrada(arquivo) {
    return new Promise(function (resolve, reject) {
      const leitor = new FileReader();
      leitor.onerror = function () { reject(new Error("Não foi possível ler a imagem.")); };
      leitor.onload = function () {
        const imagem = new Image();
        imagem.onerror = function () { reject(new Error("Selecione uma imagem válida.")); };
        imagem.onload = function () {
          const lado = Math.min(imagem.naturalWidth, imagem.naturalHeight);
          const origemX = (imagem.naturalWidth - lado) / 2;
          const origemY = (imagem.naturalHeight - lado) / 2;
          const criar = function (tamanho) {
            const canvas = document.createElement("canvas");
            canvas.width = tamanho;
            canvas.height = tamanho;
            canvas.getContext("2d").drawImage(imagem, origemX, origemY, lado, lado, 0, 0, tamanho, tamanho);
            return canvas.toDataURL("image/png");
          };
          resolve({ logo192: criar(192), logo512: criar(512) });
        };
        imagem.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  $("cfg-logo-sistema").addEventListener("change", async function () {
    const arquivo = this.files && this.files[0];
    if (!arquivo) return;
    try {
      logoSistemaPendente = await gerarLogoQuadrada(arquivo);
      $("cfg-logo-preview").src = logoSistemaPendente.logo512;
    } catch (e) {
      this.value = "";
      logoSistemaPendente = null;
      mostrarAlerta(e.message, "error");
    }
  });

  $("btn-adicionar-carregador").addEventListener("click", function () {
    if (config.carregadores.length >= 20) { mostrarAlerta("Limite de 20 bicos.", "error"); return; }
    config.carregadores.push({ potenciaKw: 60 });
    renderCarregadoresConfig();
    atualizarPreviewWhatsApp();
  });

  $("cfg-carregadores").addEventListener("click", function (ev) {
    const btn = ev.target.closest("[data-remover-carregador]");
    if (!btn) return;
    if (config.carregadores.length <= 1) { mostrarAlerta("Mantenha pelo menos 1 bico.", "error"); return; }
    if (carregando().length) { mostrarAlerta("Finalize as recargas ativas antes de remover um bico.", "error"); return; }
    config.carregadores.splice(parseInt(btn.dataset.removerCarregador, 10), 1);
    renderCarregadoresConfig();
    atualizarPreviewWhatsApp();
  });

  $("form-config").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!exigirAdmin()) return;
    const tarifa = moedaDaMascara($("cfg-tarifa").value);
    if (isNaN(tarifa) || tarifa <= 0) { mostrarAlerta("Informe a tarifa do KWH.", "error"); return; }
    const carregadores = [];
    const rows = document.querySelectorAll("#cfg-carregadores .form-row");
    for (const row of rows) {
      const potencia = parseInt(row.querySelector(".cfg-potencia-cg").value, 10);
      if (isNaN(potencia) || potencia <= 0) { mostrarAlerta("Informe a potência máxima de cada bico em kW.", "error"); return; }
      carregadores.push({ potenciaKw: potencia });
    }
    if (carregadores.length === 0) { mostrarAlerta("Adicione pelo menos 1 carregador.", "error"); return; }
    config.tarifaKwh = tarifa;
    config.carregadores = carregadores;
    config.textoAtendimento = $("cfg-atendimento").value.trim();
    config.localizacao = $("cfg-localizacao").value.trim();
    config.linkMapa = $("cfg-mapa").value.trim();
    salvar(KEY_CONFIG, config);
    config.nomeSistema = $("cfg-nome-sistema").value.trim() || NOME_PADRAO;
    config.corPrimaria = $("cfg-cor").value.trim() || "#f97316";
    config.corSecundaria = $("cfg-cor-secundaria").value.trim() || "#fff7ed";
    if (logoSistemaPendente) {
      config.logoSistema = logoSistemaPendente.logo512;
      logoSistemaPendente = null;
      $("cfg-logo-sistema").value = "";
    }
    salvar(KEY_CONFIG, config);
    renderCarregadoresConfig();
    popularBicosFormulario();
    renderStatusBicos();
    atualizarPreviewWhatsApp();
    aplicarAparencia();
    aplicarMarca();
    fecharFormCadastro("form-config");
    mostrarAlerta("Configurações salvas com sucesso!", "success");
  });

  /* ---------------- Perfis de usuário ---------------- */
  function perfilAtivoSnapshot() {
    const p = perfis.find((x) => x.id === perfilAtivoId);
    return p ? { id: p.id, nome: p.nome, turno: p.turno || 1 } : null;
  }

  function getTurnoAtivo() {
    const perfil = perfilAtivoSnapshot();
    const dados = getDadosTurnoAtual(new Date());
    return perfil?.turno ? { ...dados, turnoId: perfil.turno } : dados;
  }

  function renderPerfis() {
    const container = $("lista-perfis");
    container.innerHTML = "";
    if (perfis.length === 0) {
      container.innerHTML =
        '<div class="empty-state"><strong>Nenhum perfil cadastrado</strong>Adicione um perfil com nome e foto acima.</div>';
      return;
    }
    perfis.forEach(function (p, i) {
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML =
        '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">' +
          (p.foto
            ? '<img class="perfil-foto" src="' + escapeAttr(p.foto) + '" alt="">'
            : '<div class="perfil-foto" style="background:var(--primary-light);display:flex;align-items:center;justify-content:center;color:var(--primary-dark);font-weight:800;">' + escapeHtml(p.nome.charAt(0).toUpperCase()) + "</div>") +
          '<div class="info"><strong>' + escapeHtml(p.nome) + "</strong>" +
            '<div class="muted">' + escapeHtml(rotuloTurnoOperador(p)) + (p.id === perfilAtivoId ? ", operador ativo" : "") + "</div></div>" +
        "</div>" +
        '<div class="actions">' +
          '<button class="btn btn-edit" data-editar-perfil="' + i + '">Editar</button>' +
          '<button class="btn btn-danger" data-remover-perfil="' + i + '">Excluir</button>' +
        "</div>";
      container.appendChild(div);
    });
    container.querySelectorAll("[data-editar-perfil]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const idx = parseInt(btn.dataset.editarPerfil, 10);
        const p = perfis[idx];
        if (!p) return;
        editandoPerfilIdx = idx;
        $("editpf-titulo").textContent = p.nome;
        $("editpf-nome").value = p.nome;
        $("editpf-turno").value = String(p.turno || 1);
        $("editpf-foto").value = "";
        $("modal-perfil-edicao").classList.add("show");
      });
    });
    container.querySelectorAll("[data-remover-perfil]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const idx = parseInt(btn.dataset.removerPerfil, 10);
        const p = perfis[idx];
        if (confirm("Excluir o perfil \"" + p.nome + "\"? Os abastecimentos já registrados mantêm o operador.")) {
          perfis.splice(idx, 1);
          salvarESyncIncremental(KEY_PERFIS, perfis);
          if (perfilAtivoId === p.id) {
            perfilAtivoId = "";
            salvar(KEY_PERFIL_ATIVO, "");
          }
          renderPerfis();
          popularSelectPerfilAtivo();
          popularSelectFiltroPerfil();
          renderHistorico();
          mostrarAlerta("Perfil excluído.", "success");
        }
      });
    });
  }

  function popularSelectPerfilAtivo() {
    if (perfilAtivoId && !perfis.some(function (p) { return p.id === perfilAtivoId; })) {
      perfilAtivoId = "";
      salvar(KEY_PERFIL_ATIVO, "");
    }
    document.querySelectorAll("#select-perfil-ativo, #select-perfil-ativo-topbar").forEach(function (sel) {
      sel.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Selecionar operador";
      sel.appendChild(opt);
      // Qualquer operador cadastrado pode ser escolhido neste aparelho.
      perfisOrdenadosPorTurno().forEach(function (p) {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = p.nome + " (Turno " + (p.turno || 1) + ")";
        sel.appendChild(o);
      });
      sel.value = perfilAtivoId;
    });
    popularSelectPerfilTurnoObrigatorio();
    atualizarFotoPerfilAtivo();
  }

  // Operadores do turno atual primeiro, depois os demais, em ordem alfabética.
  function perfisOrdenadosPorTurno() {
    const turnoAtual = getDadosTurnoAtual(new Date()).turnoId;
    return perfis.slice().sort(function (a, b) {
      const doTurnoA = Number(a.turno || 1) === turnoAtual ? 0 : 1;
      const doTurnoB = Number(b.turno || 1) === turnoAtual ? 0 : 1;
      return doTurnoA - doTurnoB || String(a.nome).localeCompare(String(b.nome), "pt-BR");
    });
  }

  let cadastroOperadorAberto = false;

  function popularSelectPerfilTurnoObrigatorio() {
    const sel = $("select-perfil-turno-obrigatorio");
    if (!sel) return;
    const atual = sel.value;
    const lista = perfisOrdenadosPorTurno();
    sel.innerHTML = '<option value="">Selecionar operador</option>';
    lista.forEach(function (p) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.nome + " (Turno " + (p.turno || 1) + ")";
      sel.appendChild(opt);
    });
    sel.value = lista.some(function (p) { return p.id === atual; }) ? atual : (lista.some(function (p) { return p.id === perfilAtivoId; }) ? perfilAtivoId : "");
    const temOperadores = lista.length > 0;
    const semPerfil = $("perfil-turno-obrigatorio-sem-perfil");
    const confirmar = $("btn-confirmar-perfil-turno");
    const cadastro = $("perfil-turno-obrigatorio-cadastro");
    const campoSelecao = sel.closest(".field");
    const abrirCadastro = $("btn-abrir-cadastro-operador");
    // Sem operadores: só o cadastro. Com operadores: a lista, e o cadastro fica atrás de um link.
    if (campoSelecao) campoSelecao.hidden = !temOperadores;
    if (semPerfil) semPerfil.hidden = true;
    if (cadastro) cadastro.hidden = temOperadores && !cadastroOperadorAberto;
    if (abrirCadastro) abrirCadastro.hidden = !temOperadores || cadastroOperadorAberto;
    if (confirmar) confirmar.disabled = !temOperadores;
  }

  // Início do turno em andamento, conforme os turnos configurados.
  function chaveUltimoInicioTurno() {
    return getDadosTurnoAtual().inicioTurno;
  }

  function deveSelecionarPerfilTurno() {
    let estado = {};
    try { estado = JSON.parse(localStorage.getItem(KEY_PERFIL_TURNO_REGRA)) || {}; } catch (e) {}
    return estado.versao !== PERFIL_TURNO_REGRA_VERSAO || estado.inicioTurno !== chaveUltimoInicioTurno();
  }

  function abrirSelecaoPerfilTurno() {
    const modal = $("modal-perfil-turno-obrigatorio");
    if (!modal || ehAdmin() || assistenteAberto() || !deveSelecionarPerfilTurno()) return;
    popularSelectPerfilTurnoObrigatorio();
    const turno = getDadosTurnoAtual(new Date()).turnoId;
    $("perfil-turno-obrigatorio-info").textContent =
      "Escolha quem está operando no " + nomeTurno(turno) + ".";
    modal.classList.add("show");
    setTimeout(function () {
      const alvo = $("btn-confirmar-perfil-turno").disabled
        ? $("perfil-turno-obrigatorio-nome")
        : $("select-perfil-turno-obrigatorio");
      if (alvo) alvo.focus();
    }, 0);
  }

  $("btn-cadastrar-perfil-turno").addEventListener("click", function () {
    const nome = $("perfil-turno-obrigatorio-nome").value.trim();
    if (!nome) {
      mostrarAlerta("Informe o nome do operador.", "error");
      return;
    }
    const turno = getDadosTurnoAtual(new Date()).turnoId;
    const perfil = { id: gerarId("pf"), nome: nome, foto: "", turno: turno };
    perfis.push(perfil);
    salvarESyncIncremental(KEY_PERFIS, perfis);
    $("perfil-turno-obrigatorio-nome").value = "";
    renderPerfis();
    popularSelectPerfilAtivo();
    cadastroOperadorAberto = false;
    popularSelectPerfilTurnoObrigatorio();
    $("select-perfil-turno-obrigatorio").value = perfil.id;
    $("btn-confirmar-perfil-turno").disabled = false;
    mostrarAlerta("Operador " + nome + " cadastrado. Confirme para começar o turno.", "success");
  });

  $("btn-abrir-cadastro-operador").addEventListener("click", function () {
    cadastroOperadorAberto = true;
    popularSelectPerfilTurnoObrigatorio();
    $("perfil-turno-obrigatorio-nome").focus();
  });

  $("btn-confirmar-perfil-turno").addEventListener("click", function () {
    const id = $("select-perfil-turno-obrigatorio").value;
    if (!id || !perfis.some(function (p) { return p.id === id; })) {
      mostrarAlerta("Escolha um operador para continuar.", "error");
      return;
    }
    perfilAtivoId = id;
    salvar(KEY_PERFIL_ATIVO, perfilAtivoId);
    salvar(KEY_PERFIL_TURNO_REGRA, {
      versao: PERFIL_TURNO_REGRA_VERSAO,
      inicioTurno: chaveUltimoInicioTurno()
    });
    popularSelectPerfilAtivo();
    $("modal-perfil-turno-obrigatorio").classList.remove("show");
  });

  document.addEventListener("click", function (e) {
    const modal = $("modal-perfil-turno-obrigatorio");
    if (modal.classList.contains("show") && !modal.contains(e.target)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener("keydown", function (e) {
    const modal = $("modal-perfil-turno-obrigatorio");
    if (!modal.classList.contains("show")) return;
    const foco = Array.from(modal.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled])"));
    if (e.key === "Tab" && foco.length) {
      const indice = foco.indexOf(document.activeElement);
      const proximo = e.shiftKey ? (indice <= 0 ? foco.length - 1 : indice - 1) : (indice === foco.length - 1 ? 0 : indice + 1);
      e.preventDefault();
      foco[proximo].focus();
      return;
    }
    if (e.key === "Escape" || !modal.contains(e.target)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  function atualizarFotoPerfilAtivo() {
    const p = perfis.find((x) => x.id === perfilAtivoId);
    const img = $("perfil-ativo-foto");
    const nomeEl = $("operador-nome");
    const turnoEl = $("operador-turno");
    const avatarEl = $("operador-avatar");
    if (nomeEl) nomeEl.textContent = p ? p.nome : "Operador";
    if (turnoEl) turnoEl.textContent = p ? (p.turno ? rotuloTurnoOperador(p) : "Operador ativo") : "Toque para escolher";
    if (avatarEl) {
      avatarEl.textContent = p
        ? p.nome.trim().split(/\s+/).slice(0, 2).map(function (parte) { return parte.charAt(0); }).join("").toUpperCase()
        : "OP";
    }
    if (p && p.foto) {
      img.src = p.foto;
      img.hidden = false;
    } else {
      img.removeAttribute("src");
      img.hidden = true;
    }
  }

  function popularSelectFiltroPerfil() {
    const sel = $("filtro-perfil");
    const atual = sel.value;
    sel.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Todos";
    sel.appendChild(opt);
    perfis.forEach(function (p) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = "👤 " + p.nome;
      sel.appendChild(o);
    });
    if (perfis.some((p) => p.id === atual)) sel.value = atual;
  }

  function popularSelectFiltroVendasOperador() {
    const sel = $("filtro-vendas-operador");
    const atual = sel.value;
    sel.innerHTML = '<option value="">Todos os operadores</option>';
    perfis.forEach(function (p) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.nome;
      sel.appendChild(opt);
    });
    if (perfis.some((p) => p.id === atual)) sel.value = atual;
  }

  function redimensionarFoto(file, cb) {
    const reader = new FileReader();
    reader.onload = function (ev) {
      const img = new Image();
      img.onload = function () {
        try {
          const TAM = 96;
          const escala = Math.min(1, TAM / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * escala));
          canvas.height = Math.max(1, Math.round(img.height * escala));
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          cb(canvas.toDataURL("image/jpeg", 0.8));
        } catch (e) {
          cb("", "Não foi possível processar a foto selecionada.");
        }
      };
      img.onerror = function () { cb("", "Não foi possível ler a foto selecionada."); };
      img.src = ev.target.result;
    };
    reader.onerror = function () { cb("", "Não foi possível ler a foto selecionada."); };
    reader.readAsDataURL(file);
  }

  $("form-perfil").addEventListener("submit", function (e) {
    e.preventDefault();
    const form = this;
    const nome = $("perfil-nome").value.trim();
    const turno = parseInt($("perfil-turno").value, 10);
    if (!nome) {
      mostrarAlerta("Informe o nome do operador.", "error");
      return;
    }
    if (!turno) {
      mostrarAlerta("Selecione o turno do operador.", "error");
      return;
    }
    if (perfis.some((p) => p.nome.toLowerCase() === nome.toLowerCase())) {
      mostrarAlerta("Já existe um operador com esse nome.", "error");
      return;
    }
    const file = $("perfil-foto").files && $("perfil-foto").files[0];
    const finalizar = function (fotoData, erroFoto) {
      if (erroFoto) {
        mostrarAlerta(erroFoto, "error");
        return;
      }
      perfis.push({ id: "pf" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), nome: nome, foto: fotoData || "", turno: turno });
      salvarESyncIncremental(KEY_PERFIS, perfis);
      form.reset();
      renderPerfis();
      popularSelectPerfilAtivo();
      popularSelectFiltroPerfil();
      mostrarAlerta("Operador " + nome + " adicionado!", "success");
    };
    if (file) {
      redimensionarFoto(file, finalizar);
    } else {
      finalizar("");
    }
  });

  document.querySelectorAll("#select-perfil-ativo, #select-perfil-ativo-topbar").forEach(function (sel) {
    sel.addEventListener("change", function () {
      perfilAtivoId = this.value;
      salvar(KEY_PERFIL_ATIVO, perfilAtivoId);
      popularSelectPerfilAtivo();
    });
  });

  $("filtro-perfil").addEventListener("change", renderHistorico);

  /* ---------------- Edição de abastecimentos ---------------- */
  let editandoId = null;
  let editConsumoExcluido = null;
  let itensConsumoEdit = [];
  let kwhPartesEdit = [];

  function dataParaInput(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function popularSelectEdicao(placaAtual) {
    const sel = $("edit-placa");
    sel.innerHTML = "";
    const placas = clientes.map((c) => c.placa);
    if (placaAtual && !placas.some((p) => placaNormalizada(p) === placaNormalizada(placaAtual))) {
      placas.unshift(placaAtual);
    }
    placas.sort((a, b) => a.localeCompare(b));
    placas.forEach(function (p) {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    });
  }

  function popularSelectEdicaoOperador(perfilId) {
    const sel = $("edit-operador");
    sel.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sem operador (—)";
    sel.appendChild(opt);
    perfis.forEach(function (p) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.nome;
      sel.appendChild(o);
    });
    sel.value = perfilId || "";
  }

  function abrirEdicao(registro) {
    editandoId = registro.id;
    $("edit-data").value = dataParaInput(registro.data);
    popularSelectEdicao(registro.placa);
    $("edit-placa").value = registro.placa;
    $("edit-cliente").value = registro.cliente;
    $("edit-modelo").value = registro.modelo;
    popularSelectEdicaoOperador(registro.perfil ? registro.perfil.id : "");
    $("edit-turno").value = String(registro.turno || 1);
    $("edit-kwh").value = mascararKwhTres(Math.round(registro.kwhUtilizado * 1000));
    $("edit-valor-kwh").value = moedaParaCampo(registro.valorKwh);
    $("edit-metodo").value = registro.metodoPagamento || "Pix";
    preencherDinheiroEdicao(registro);
    const teveConsumo = registro.consumoConveniencia === "Sim" && (registro.valorConsumo || 0) > 0;
    document.querySelector('input[name="edit-consumo"][value="' + (teveConsumo ? "Sim" : "Não") + '"]').checked = true;
    $("campo-edit-produto-consumo").style.display = teveConsumo ? "flex" : "none";
    editConsumoExcluido = null;
    popularSelectProdutos();
    if (teveConsumo) {
      const cp = registro.consumoProduto || { nome: "Consumo anterior", categoria: "—", valorUnitario: registro.valorConsumo || 0, quantidade: 1 };
      const idx = produtosOrdenados().findIndex((p) => p.nome === cp.nome);
      if (idx === -1) {
        const o = document.createElement("option");
        o.value = "-1";
        o.textContent = "(excluído) " + cp.nome;
        $("edit-consumo-produto").appendChild(o);
        $("edit-consumo-produto").value = "-1";
        editConsumoExcluido = { nome: cp.nome, categoria: cp.categoria, valorUnitario: cp.valorUnitario };
      } else {
        $("edit-consumo-produto").value = String(idx);
      }
      $("edit-consumo-qtd").value = cp.quantidade || 1;
      $("edit-consumo-hint").textContent = "Valor unitário: " + (cp.valorUnitario != null ? fmtMoeda(Number(cp.valorUnitario) || 0) : "—") + " · o consumo é um pré-registro de venda na aba Em Andamento.";
    } else {
      $("edit-consumo-produto").value = "";
      $("edit-consumo-qtd").value = "1";
    }
    const dividido = registro.pagamentoDividido === "Sim" && (registro.detalhesPagamento || []).length >= 1;
    document.querySelector('input[name="edit-pag-div"][value="' + (dividido ? "Sim" : "Não") + '"]').checked = true;
    $("campo-edit-divisao").style.display = dividido ? "block" : "none";
    $("campo-edit-metodo").style.display = dividido ? "none" : "flex";
    renderLinhasDivisao($("edit-divisao-lista"), "soma-edit-divisao", getTotalEdit, dividido ? registro.detalhesPagamento : null);
    kwhPartesEdit = Array.isArray(registro.kwhPartes) && registro.kwhPartes.length ? registro.kwhPartes.slice() : [registro.kwhUtilizado];
    itensConsumoEdit = Array.isArray(registro.consumoProdutos) && registro.consumoProdutos.length
      ? registro.consumoProdutos.map(function (item) { return { produtoId: item.id || item.produtoId || "", quantidade: item.quantidade, estoqueReferenciaId: item.estoqueReferenciaId, alocacoesEstoque: item.alocacoesEstoque || null }; })
      : (registro.consumoProduto ? [{ produtoId: registro.consumoProduto.id || registro.consumoProduto.produtoId || "", quantidade: registro.consumoProduto.quantidade, estoqueReferenciaId: registro.consumoProduto.estoqueReferenciaId, alocacoesEstoque: registro.consumoProduto.alocacoesEstoque || null }] : []);
    renderKwhPartes("edit-kwh-partes", kwhPartesEdit, "edit-kwh", recalcularEdicao);
    renderItensConsumo("edit-consumo-itens", itensConsumoEdit, recalcularEdicao);
    $("modal-edicao").classList.add("show");
  }

  function recalcularEdicao() {
    const kwh = parseFloat(($("edit-kwh").value || "0").replace(",", "."));
    const valorKwh = moedaDaMascara($("edit-valor-kwh").value);
    if (isNaN(kwh) || isNaN(valorKwh) || kwh < 0 || valorKwh < 0) {
      $("edit-valor-pagar").value = "R$ 0,00";
      return;
    }
    $("edit-valor-pagar").value = fmtMoeda(kwh * valorKwh + valorConsumoEdit());
    atualizarSomaDivisao($("edit-divisao-lista"), "soma-edit-divisao", getTotalEdit);
    atualizarDinheiroEdicao();
  }

  // Ao abrir, os campos trazem o que foi lançado no caixa para esta recarga.
  function preencherDinheiroEdicao(registro) {
    const soma = function (tipo, especie) {
      return arred(movimentosDaReferencia({ tipo: "abastecimento", id: registro.id }).filter(function (mov) { return mov.tipo === tipo; }).reduce(function (total, mov) { return total + (Number(mov[especie]) || 0); }, 0));
    };
    const campo = function (v) { return v ? moedaParaCampo(v) : ""; };
    $("edit-cedulas-recebidas").value = campo(soma("entrada", "cedulas"));
    $("edit-moedas-recebidas").value = campo(soma("entrada", "moedas"));
    $("edit-cedulas-troco").value = campo(soma("saida", "cedulas"));
    $("edit-moedas-troco").value = campo(soma("saida", "moedas"));
    trocoPixEdicao.edit = soma("trocoPix", "valor");
  }

  function totalDinheiroEdicao() {
    if (document.querySelector('input[name="edit-pag-div"]:checked').value === "Sim") return totalDinheiroDividido($("edit-divisao-lista"));
    return $("edit-metodo").value === "Dinheiro" ? getTotalEdit() : 0;
  }

  // Mudou o total (consumo, kWh) ou o pagamento: os campos de dinheiro aparecem e avisam
  // quando o que foi informado não cobre mais o valor.
  function atualizarDinheiroEdicao() {
    const total = arred(totalDinheiroEdicao());
    const mostrar = total > 0;
    $("campo-edit-dinheiro").hidden = !mostrar;
    $("campo-edit-troco").hidden = !mostrar;
    if (!mostrar) return;
    const recebido = arred(valorNumerario("edit-cedulas-recebidas") + valorNumerario("edit-moedas-recebidas"));
    const troco = arred(valorNumerario("edit-cedulas-troco") + valorNumerario("edit-moedas-troco"));
    const dica = $("edit-dinheiro-dica");
    if (!recebido) {
      dica.textContent = "Total em dinheiro: " + fmtMoeda(total) + ". Em branco, conta como " + fmtMoeda(total) + " em cédulas, sem troco.";
    } else if (arred(recebido - troco) < total - 0.009) {
      dica.textContent = "Total em dinheiro: " + fmtMoeda(total) + ". O recebido menos o troco dá " + fmtMoeda(recebido - troco) + ": informe de novo o que o cliente entregou.";
    } else {
      dica.textContent = "Total em dinheiro: " + fmtMoeda(total) + ". Troco certo: " + fmtMoeda(Math.max(0, recebido - total)) + ".";
    }
  }

  function produtoConsumoEdit() {
    const v = $("edit-consumo-produto").value;
    if (v === "-1" && editConsumoExcluido) return editConsumoExcluido;
    const idx = parseInt(v, 10);
    return produtosOrdenados()[idx] || null;
  }

  function valorConsumoEdit() {
    return itensConsumoEdit.reduce(function (total, item) {
      const produto = produtoPorId(item.produtoId);
      return total + (produto ? produto.valor * (parseInt(item.quantidade, 10) || 0) : 0);
    }, 0);
  }

  $("edit-kwh").addEventListener("input", function () {
    const el = $("edit-kwh");
    el.value = mascararKwhTres(el.value);
    try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {}
    recalcularEdicao();
  });
  $("edit-valor-kwh").addEventListener("input", recalcularEdicao);
  $("edit-metodo").addEventListener("change", atualizarDinheiroEdicao);
  ["edit-cedulas-recebidas", "edit-moedas-recebidas", "edit-cedulas-troco", "edit-moedas-troco"].forEach(function (id) { $(id).addEventListener("input", atualizarDinheiroEdicao); });
  ["input", "change"].forEach(function (evento) { $("edit-divisao-lista").addEventListener(evento, function () { setTimeout(atualizarDinheiroEdicao, 0); }); });
  $("btn-add-edit-kwh").addEventListener("click", function () { kwhPartesEdit.push(0); renderKwhPartes("edit-kwh-partes", kwhPartesEdit, "edit-kwh", recalcularEdicao); });
  $("edit-kwh-partes").addEventListener("input", function (e) { const el = e.target.closest("[data-kwh-parte]"); if (el) atualizarKwhParte(el, kwhPartesEdit, "edit-kwh", recalcularEdicao); });
  $("edit-kwh-partes").addEventListener("click", function (e) { const btn = e.target.closest("[data-remover-kwh]"); if (!btn) return; kwhPartesEdit.splice(parseInt(btn.dataset.removerKwh, 10), 1); renderKwhPartes("edit-kwh-partes", kwhPartesEdit, "edit-kwh", recalcularEdicao); });
  $("btn-add-edit-consumo").addEventListener("click", function () { itensConsumoEdit.push({ produtoId: "", quantidade: 1 }); renderItensConsumo("edit-consumo-itens", itensConsumoEdit, recalcularEdicao); });
  configurarItensConsumo("edit-consumo-itens", function () { return itensConsumoEdit; }, recalcularEdicao);

  $("edit-consumo-produto").addEventListener("change", function () {
    const p = produtoConsumoEdit();
    $("edit-consumo-hint").textContent = p
      ? "Valor unitário: " + fmtMoeda(p.valor) + " · Categoria: " + p.categoria + " · vira pré-registro de venda na aba Em Andamento."
      : "Valor unitário: — · o consumo vira um pré-registro de venda na aba Em Andamento.";
    recalcularEdicao();
  });
  $("edit-consumo-qtd").addEventListener("input", recalcularEdicao);

  document.querySelectorAll('input[name="edit-consumo"]').forEach(function (r) {
    r.addEventListener("change", function () {
      const sim = this.value === "Sim";
      $("campo-edit-produto-consumo").style.display = sim ? "flex" : "none";
      if (sim && itensConsumoEdit.length === 0) itensConsumoEdit.push({ produtoId: "", quantidade: 1 });
      if (!sim) {
        $("edit-consumo-produto").value = "";
        $("edit-consumo-qtd").value = "1";
        itensConsumoEdit = [];
      }
      renderItensConsumo("edit-consumo-itens", itensConsumoEdit, recalcularEdicao);
      recalcularEdicao();
    });
  });

  document.querySelectorAll('input[name="edit-pag-div"]').forEach(function (r) {
    r.addEventListener("change", function () {
      const sim = this.value === "Sim";
      $("campo-edit-divisao").style.display = sim ? "block" : "none";
      $("campo-edit-metodo").style.display = sim ? "none" : "flex";
      if (sim) {
        renderLinhasDivisao($("edit-divisao-lista"), "soma-edit-divisao", getTotalEdit, null);
      } else {
        const selMetodo = $("edit-metodo");
        if (["Pix", "Dinheiro", "Crédito", "Débito", "Cortesia", "Pendente"].indexOf(selMetodo.value) === -1) {
          selMetodo.value = "Pix";
        }
      }
      atualizarDinheiroEdicao();
    });
  });

  $("btn-add-edit-divisao").addEventListener("click", function () {
    $("edit-divisao-lista").appendChild(criarLinhaDivisao(null, null, function () {
      atualizarSomaDivisao($("edit-divisao-lista"), "soma-edit-divisao", getTotalEdit);
    }));
  });

  $("edit-placa").addEventListener("change", function () {
    const c = clientes.find((x) => placaNormalizada(x.placa) === placaNormalizada(this.value));
    if (c) {
      $("edit-cliente").value = c.nome;
      $("edit-modelo").value = c.modelo;
    }
  });

  function fecharEdicao() {
    $("modal-edicao").classList.remove("show");
    editandoId = null;
  }

  $("modal-fechar").addEventListener("click", fecharEdicao);
  $("btn-cancelar-edicao").addEventListener("click", fecharEdicao);
  $("modal-edicao").addEventListener("click", function (e) {
    if (e.target === this) fecharEdicao();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && $("modal-edicao").classList.contains("show")) fecharEdicao();
    if (e.key === "Escape" && $("modal-finalizar").classList.contains("show")) fecharFinalizar();
    if (e.key === "Escape" && $("modal-previsao").classList.contains("show")) fecharPrevisao();
    if (e.key === "Escape" && $("modal-pagamento").classList.contains("show")) fecharPagamento();
    if (e.key === "Escape" && $("modal-cliente-edicao").classList.contains("show")) fecharEdicaoCliente();
    if (e.key === "Escape" && $("modal-modelo-edicao").classList.contains("show")) fecharEdicaoModelo();
    if (e.key === "Escape" && $("modal-perfil-edicao").classList.contains("show")) fecharEdicaoPerfil();
    if (e.key === "Escape" && $("modal-venda-edicao").classList.contains("show")) fecharEdicaoVenda();
    if (e.key === "Escape" && $("modal-venda-pendente").classList.contains("show")) fecharRegistroPendente();
  });

  $("form-edicao").addEventListener("submit", function (e) {
    e.preventDefault();
    const idx = abastecimentos.findIndex((a) => a.id === editandoId);
    if (idx === -1) {
      fecharEdicao();
      return;
    }
    const dataValor = new Date($("edit-data").value);
    const kwh = totalKwhPartes(kwhPartesEdit);
    const valorKwh = moedaDaMascara($("edit-valor-kwh").value);

    if (isNaN(dataValor.getTime())) {
      mostrarAlerta("Data/hora inválida.", "error");
      return;
    }
    if (isNaN(kwh) || kwh <= 0) {
      mostrarAlerta("Informe o KWH utilizado (valor maior que zero).", "error");
      return;
    }
    if (isNaN(valorKwh) || valorKwh <= 0) {
      mostrarAlerta("Informe um valor de KWH válido.", "error");
      return;
    }

    const radioConsumoEdit = document.querySelector('input[name="edit-consumo"]:checked');
    const consumoConveniencia = radioConsumoEdit ? radioConsumoEdit.value : "Não";
    let valorConsumo = 0;
    let consumoProdutos = [];
    const itensAntigos = Array.isArray(abastecimentos[idx].consumoProdutos) && abastecimentos[idx].consumoProdutos.length
      ? abastecimentos[idx].consumoProdutos
      : (abastecimentos[idx].consumoProduto ? [abastecimentos[idx].consumoProduto] : []);
    if (consumoConveniencia === "Sim") {
      consumoProdutos = itensConsumoDetalhados(itensConsumoEdit);
      if (!consumoProdutos || consumoProdutos.length === 0) {
        mostrarAlerta(
          produtos.length === 0
            ? "Cadastre um produto na aba Cadastro de Clientes, Carros e Produtos antes de registrar consumo."
            : "Informe os produtos consumidos na conveniência.",
          "error"
        );
        return;
      }
      valorConsumo = consumoProdutos.reduce(function (total, item) { return total + item.valorTotal; }, 0);
    }
    // Sem venda registrada, o consumo da recarga fica pendente e só reserva o estoque.
    // Pendentes antigos, que já tinham baixado, devolvem a unidade antes de reservar.
    const consumoPendenteEdit = !vendas.some(function (v) { return v.idAbastecimento === abastecimentos[idx].id; });
    if (consumoPendenteEdit) {
      const pendentesAntes = vendasPendentes.filter(function (vp) { return vp.idAbastecimento === abastecimentos[idx].id; });
      const baixadosAntes = pendentesAntes.filter(function (vp) { return vp.estoqueBaixado && produtoPorId(vp.produtoId); }).map(function (vp) {
        return { id: vp.produtoId, quantidade: vp.quantidade, alocacoesEstoque: vp.alocacoesEstoque || null };
      });
      reservasIgnoradas = pendentesAntes.map(function (vp) { return vp.id; });
      baixadosAntes.forEach(function (item) {
        if (item.alocacoesEstoque) alterarAlocacoesEstoque(item.alocacoesEstoque, 1);
        else alterarEstoque(produtoPorId(item.id), item.quantidade);
      });
      const erroReserva = consumoProdutos.length ? validarEstoqueItens(consumoProdutos) : null;
      reservasIgnoradas = [];
      if (erroReserva) {
        baixadosAntes.forEach(function (item) {
          if (item.alocacoesEstoque) alterarAlocacoesEstoque(item.alocacoesEstoque, -1);
          else alterarEstoque(produtoPorId(item.id), -item.quantidade);
        });
        mostrarAlerta(erroReserva, "error");
        return;
      }
      if (baixadosAntes.length) salvarESyncIncremental(KEY_PRODUTOS, produtos, "produtos");
      consumoProdutos.forEach(function (item) { item.estoqueBaixado = false; });
    } else {
      const resEstoque = reconciliarEstoqueItens(itensAntigos, consumoProdutos);
      if (resEstoque.erro) {
        mostrarAlerta(resEstoque.erro, "error");
        return;
      }
    }

    const radioPagDivEdit = document.querySelector('input[name="edit-pag-div"]:checked');
    const pagamentoDividido = radioPagDivEdit ? radioPagDivEdit.value : "Não";
    let detalhesPagamento = [];
    if (pagamentoDividido === "Sim") {
      const linhas = obterLinhasDivisao($("edit-divisao-lista"));
      const totalEsperado = kwh * valorKwh + valorConsumo;
      const erroParcelas = validarParcelasPagamento(linhas, totalEsperado, "Valor a ser Pago");
      if (erroParcelas) {
        mostrarAlerta(erroParcelas, "error");
        return;
      }
      detalhesPagamento = detalhesPagamentoComIds(linhas);
    }

    const metodoEditado = pagamentoDividido === "Sim" ? "Múltiplos" : $("edit-metodo").value;
    const totalDinheiro = pagamentoDividido === "Sim" ? totalDinheiroDividido($("edit-divisao-lista")) : (metodoEditado === "Dinheiro" ? kwh * valorKwh + valorConsumo : 0);
    let numerarioEditado = null;
    if (totalDinheiro > 0) {
      numerarioEditado = obterNumerario("edit", totalDinheiro);
      if (numerarioEditado.erro) { mostrarAlerta(numerarioEditado.erro, "error"); return; }
    }
    estornarNumerarioCaixa({ tipo: "abastecimento", id: abastecimentos[idx].id });

    abastecimentos[idx].data = dataValor.toISOString();
    abastecimentos[idx].placa = $("edit-placa").value.toUpperCase();
    abastecimentos[idx].cliente = $("edit-cliente").value.trim();
    abastecimentos[idx].modelo = $("edit-modelo").value.trim();
    abastecimentos[idx].kwhUtilizado = kwh;
    abastecimentos[idx].kwh = kwh;
    abastecimentos[idx].kwhPartes = kwhPartesEdit.slice();
    abastecimentos[idx].consumoQuantidade = consumoProdutos.reduce(function (total, item) { return total + item.quantidade; }, 0);
    abastecimentos[idx].consumoValorTotal = consumoConveniencia === "Sim" ? valorConsumo : null;
    abastecimentos[idx].valorKwh = valorKwh;
    abastecimentos[idx].valorPagar = kwh * valorKwh;
    const totalEditado = kwh * valorKwh + valorConsumo;
    abastecimentos[idx].totalComConsumo = totalEditado;
    abastecimentos[idx].valorCobrado = totalEditado;
    abastecimentos[idx].arredondamentoDinheiro = arred(abastecimentos[idx].valorCobrado - totalEditado);
    abastecimentos[idx].metodoPagamento = metodoEditado;
    abastecimentos[idx].pagamentoDividido = pagamentoDividido;
    abastecimentos[idx].detalhesPagamento = detalhesPagamento;
    abastecimentos[idx].valorEntregue = numerarioEditado ? numerarioEditado.recebido : null;
    abastecimentos[idx].troco = numerarioEditado ? numerarioEditado.troco : null;
    abastecimentos[idx].trocoPix = numerarioEditado ? numerarioEditado.trocoPix || 0 : 0;
    abastecimentos[idx].trocoCorreto = numerarioEditado ? numerarioEditado.trocoCorreto : null;
    abastecimentos[idx].ajusteTroco = numerarioEditado ? numerarioEditado.ajusteTroco : null;
    abastecimentos[idx].valorExcedente = numerarioEditado ? numerarioEditado.excedente : null;
    abastecimentos[idx].pendenteFin = metodoEditado === "Pendente";
    abastecimentos[idx].consumoConveniencia = consumoConveniencia;
    abastecimentos[idx].valorConsumo = consumoConveniencia === "Sim" ? valorConsumo : 0;
    abastecimentos[idx].consumoProduto = consumoProdutos[0] || null;
    abastecimentos[idx].consumoProdutos = consumoProdutos;
    const perfilEditado = perfis.find((p) => p.id === $("edit-operador").value);
    abastecimentos[idx].perfil = perfilEditado ? { id: perfilEditado.id, nome: perfilEditado.nome } : null;
    abastecimentos[idx].operador = perfilEditado ? { id: perfilEditado.id, nome: perfilEditado.nome } : null;

    const turnoEditado = parseInt($("edit-turno").value, 10);
    abastecimentos[idx].turno = turnoEditado;
    abastecimentos[idx].dataOperacional = getDataOperacional(dataValor, turnoEditado);
    const turnoInfo = getDadosTurnoAtual(dataValor);
    abastecimentos[idx].inicioTurno = turnoInfo.inicioTurno;
    abastecimentos[idx].fimTurno = turnoInfo.fimTurno;

    const pendentesDoAbastecimento = vendasPendentes.filter((vp) => vp.idAbastecimento === abastecimentos[idx].id);
    if (consumoConveniencia === "Sim") {
      if (vendas.some((v) => v.idAbastecimento === abastecimentos[idx].id)) {
        mostrarAlerta("A venda do consumo já foi registrada na aba Em Andamento; ajuste o valor lá, se necessário.", "error");
      } else {
        vendasPendentes = vendasPendentes.filter((vp) => vp.idAbastecimento !== abastecimentos[idx].id);
        consumoProdutos.forEach(function (consumoProduto) {
          vendasPendentes.push({
            id: "vp" + Date.now() + Math.random().toString(36).slice(2, 7),
            idAbastecimento: abastecimentos[idx].id,
            produtoId: consumoProduto.id,
            estoqueReferenciaId: consumoProduto.estoqueReferenciaId,
            estoqueBaixado: false,
            alocacoesEstoque: consumoProduto.alocacoesEstoque || null,
            placa: abastecimentos[idx].placa,
            cliente: abastecimentos[idx].cliente,
            produto: consumoProduto.nome,
            categoria: consumoProduto.categoria,
            valorUnitario: consumoProduto.valorUnitario,
            quantidade: consumoProduto.quantidade,
            valorTotal: consumoProduto.valorTotal,
            data: abastecimentos[idx].data
          });
        });
        salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
      }
    } else if (pendentesDoAbastecimento.length) {
      vendasPendentes = vendasPendentes.filter((vp) => vp.idAbastecimento !== abastecimentos[idx].id);
      salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
    }
    renderVendasPendentes();
    renderInventario();

    salvarESyncIncremental(KEY_ABASTECIMENTOS, abastecimentos);
    if (numerarioEditado) registrarNumerarioCaixa({ tipo: "abastecimento", id: abastecimentos[idx].id }, "Abastecimento " + abastecimentos[idx].placa, numerarioEditado, abastecimentos[idx].turno, abastecimentos[idx].operador, abastecimentos[idx].data);
    fecharEdicao();
    renderHistorico();
    renderPendentes();
    mostrarAlerta("Abastecimento atualizado com sucesso!", "success");
  });

  /* ---------------- ABA: Vendas (produtos e vendas) ---------------- */
  /* ---------------- Produtos e estoque ----------------
     Cadastros → Produtos (admin) e Vendas → Estoque (operador) usam a mesma lista,
     agrupada por produto e filtrada pela situação do estoque. */

  function situacaoSku(sku) {
    return situacaoEstoque(estoqueInformado(sku) ? sku.estoque : null, sku.estoqueMinimo);
  }
  function idealSku(sku) { return estoqueIdealDe(sku.estoqueMinimo, sku.estoqueIdeal); }
  function sugestaoSku(sku) { return sugestaoReposicao(estoqueInformado(sku) ? sku.estoque : null, sku.estoqueMinimo, sku.estoqueIdeal); }
  function skusFaltando() { return skus().filter(function (sku) { return situacaoSku(sku) === "faltando"; }); }
  function nomeCurtoSku(sku) {
    const irmaos = skus().filter(function (outro) { return outro.produtoPaiId === sku.produtoPaiId; });
    const pai = paiDoSku(sku);
    if (!pai) return sku.nome || "";
    return irmaos.length > 1 ? pai.nome + " " + String(sku.variante || "").toLocaleLowerCase("pt-BR") : pai.nome;
  }

  function etiquetaSituacao(sku) {
    const st = situacaoSku(sku);
    if (st === "faltando") return '<span class="stock-badge danger">' + (sku.estoque <= 0 ? "Zerado" : "Abaixo do mínimo") + "</span>";
    if (st === "baixo") return '<span class="stock-badge warn">Baixo</span>';
    if (st === "sem") return '<span class="stock-badge">Sem contagem</span>';
    return "";
  }

  // Barra até o estoque atual, marca no mínimo, fim da escala no ideal.
  function medidorEstoque(sku) {
    const st = situacaoSku(sku);
    if (st === "sem") return '<div class="medidor-estoque" data-st="sem" aria-hidden="true"></div>';
    const topo = Math.max(idealSku(sku), sku.estoque, 1);
    return '<div class="medidor-estoque" data-st="' + st + '" aria-hidden="true"><span style="width:' + Math.min(100, (sku.estoque / topo) * 100).toFixed(1) + '%"></span><i style="left:' + ((Number(sku.estoqueMinimo) || 0) / topo * 100).toFixed(1) + '%"></i></div>';
  }

  function linhaVariacaoEstoque(sku) {
    const st = situacaoSku(sku);
    const reservado = st === "sem" ? 0 : estoqueReservado(sku);
    const qtd = st === "sem" ? "Sem contagem" : '<strong class="qtd">' + sku.estoque + " un</strong>" + (reservado ? ", " + reservado + " reservado" + (reservado === 1 ? "" : "s") + " em pendentes" : "") + ", mínimo " + (Number(sku.estoqueMinimo) || 0);
    const contar = st === "sem" && ehAdmin();
    const interno = usoInterno(sku);
    const baixa = interno && !contar && st !== "faltando" && st !== "sem";
    const acao = contar ? "Contar" : baixa ? "Baixa" : "Repor";
    return '<div class="estoque-variacao" data-sku="' + escapeAttr(sku.id) + '">' +
      '<div class="info"><strong>' + escapeHtml(sku.variante || "Padrão") + " " + etiquetaSituacao(sku) + "</strong>" +
        '<span class="muted">' + qtd + ", " + (interno ? "uso interno" : fmtMoeda(sku.valor)) + "</span></div>" +
      '<button type="button" class="btn btn-sm ' + (st === "faltando" ? "btn-primary" : "btn-outline") + '" data-repor="' + escapeAttr(sku.id) + '"' + (contar ? ' data-modo="contagem"' : baixa ? ' data-modo="baixa"' : "") + ' aria-label="' + (baixa ? "Registrar baixa de " : acao + " ") + escapeAttr(nomeCurtoSku(sku)) + '">' + acao + "</button>" +
      medidorEstoque(sku) +
    "</div>";
  }

  function renderEstoqueLista(contexto) {
    const cad = contexto === "cad";
    const container = $(cad ? "lista-produtos" : "lista-estoque");
    const chipsEl = $(cad ? "estoque-chips-cad" : "estoque-chips-venda");
    const busca = $(cad ? "busca-produtos" : "busca-estoque");
    if (!container || !chipsEl) return;
    const catalogo = skus();
    const contagem = { faltando: 0, baixo: 0, sem: 0, todos: catalogo.length };
    catalogo.forEach(function (sku) {
      const st = situacaoSku(sku);
      if (contagem[st] !== undefined) contagem[st]++;
    });
    if (!filtroEstoque[contexto]) filtroEstoque[contexto] = contagem.faltando ? "faltando" : "todos";
    const filtro = filtroEstoque[contexto];
    chipsEl.innerHTML = ["faltando", "baixo", "sem", "todos"].map(function (k) {
      return '<button type="button" class="chip" data-filtro-estoque="' + k + '" data-tom="' + k + '" aria-pressed="' + (k === filtro) + '">' + ROTULOS_SITUACAO[k] + ' <span class="n">' + contagem[k] + "</span></button>";
    }).join("");
    if (catalogo.length === 0) {
      container.innerHTML = '<div class="empty-state"><strong>Nenhum produto cadastrado</strong>' + (cad ? "Toque em Novo produto para cadastrar o primeiro." : "O admin cadastra os produtos em Cadastros.") + "</div>";
      return;
    }
    const termo = (busca ? busca.value : "").trim().toLocaleLowerCase("pt-BR");
    const porNome = function (a, b) { return String(a).localeCompare(String(b), "pt-BR"); };
    const passa = function (sku, pai) {
      if (filtro !== "todos" && situacaoSku(sku) !== filtro) return false;
      return !termo || ((pai ? pai.nome + " " + pai.categoria : "") + " " + sku.nome + " " + (sku.variante || "")).toLocaleLowerCase("pt-BR").includes(termo);
    };
    const grupos = produtos.filter(function (p) { return p.tipo === "pai"; }).sort(function (a, b) { return porNome(a.nome, b.nome); }).map(function (pai) {
      const todas = catalogo.filter(function (sku) { return sku.produtoPaiId === pai.id; }).sort(function (a, b) { return porNome(a.variante, b.variante); });
      return { pai: pai, total: todas.length, vars: todas.filter(function (sku) { return passa(sku, pai); }) };
    });
    const orfaos = catalogo.filter(function (sku) { return !paiDoSku(sku); });
    if (orfaos.length) grupos.push({ pai: null, total: orfaos.length, vars: orfaos.filter(function (sku) { return passa(sku, null); }) });
    const visiveis = grupos.filter(function (g) { return g.vars.length || (cad && filtro === "todos" && !termo && g.pai && g.total === 0); });
    const faltando = skusFaltando();
    let html = "";
    if (filtro === "faltando" && faltando.length) {
      const unidades = faltando.reduce(function (soma, sku) { return soma + sugestaoSku(sku); }, 0);
      html += '<div class="reposicao-barra"><p><strong>' + faltando.length + (faltando.length === 1 ? " variação" : " variações") + "</strong> no mínimo ou abaixo. Sugestão de compra: <strong>" + unidades + ' un</strong>.</p><button type="button" class="btn btn-primary btn-sm" data-repor-lote>Repor faltantes</button></div>';
    }
    if (!visiveis.length) {
      html += filtro === "faltando" && !termo
        ? '<div class="empty-state"><strong>Nada faltando</strong>Todos os produtos estão acima do mínimo.</div>'
        : '<div class="empty-state"><strong>Nenhum produto encontrado</strong>Tente outro filtro ou outra busca.</div>';
      container.innerHTML = html;
      return;
    }
    html += visiveis.map(function (g) {
      const nome = g.pai ? g.pai.nome : "Produtos sem agrupamento";
      const sub = g.pai ? g.pai.categoria + (g.total > 1 ? ", " + g.total + " variações" : "") : "";
      const cabeca = '<span class="info"><strong>' + escapeHtml(nome) + '</strong><span class="muted">' + escapeHtml(sub) + "</span></span>";
      return '<section class="card estoque-grupo">' +
        (cad && g.pai
          ? '<button type="button" class="estoque-grupo-head" data-editar-produto-pai="' + escapeAttr(g.pai.id) + '" aria-label="Editar ' + escapeAttr(nome) + '">' + cabeca + '<svg class="settings-chev" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>'
          : '<div class="estoque-grupo-head">' + cabeca + "</div>") +
        (g.vars.length ? g.vars.map(function (sku) { return linhaVariacaoEstoque(sku); }).join("") : '<p class="muted estoque-sem-variacao">Nenhuma variação cadastrada.</p>') +
      "</section>";
    }).join("");
    container.innerHTML = html;
  }

  function atualizarBadgeFaltantes() {
    const n = skusFaltando().length;
    document.querySelectorAll('.tab-btn[data-tab="tab-cadastro"]').forEach(function (botao) {
      let badge = botao.querySelector(".tab-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "tab-badge";
        botao.appendChild(badge);
      }
      badge.textContent = n;
      badge.hidden = !n;
      badge.title = n + (n === 1 ? " variação faltando no estoque" : " variações faltando no estoque");
    });
  }

  function aposMudarEstoque() {
    renderProdutos();
    renderInventario();
    popularSelectProdutos();
    atualizarHintProduto();
    renderDashboard();
  }

  function registrarMovimentoEstoque(sku, tipo, quantidade, antes) {
    const quem = perfilAtivoSnapshot();
    const turno = getTurnoAtivo();
    movimentosEstoque.push({
      id: gerarId("me"),
      data: new Date().toISOString(),
      produtoId: sku.id,
      produtoPaiId: sku.produtoPaiId || "",
      produto: nomeProduto(sku),
      tipo: tipo,
      quantidade: quantidade,
      estoqueAntes: antes,
      estoqueDepois: sku.estoque,
      operadorId: quem ? quem.id : "",
      operadorNome: quem ? quem.nome : (ehAdmin() ? "Admin" : ""),
      turno: turno.turnoId,
      dataOperacional: turno.dataOperacional
    });
  }

  function renderProdutos() {
    $("aviso-sem-produtos").style.display = skus().length === 0 ? "block" : "none";
    const dl = $("lista-categorias");
    dl.innerHTML = "";
    categoriasDeProduto().forEach(function (c) {
      const opt = document.createElement("option");
      opt.value = c;
      dl.appendChild(opt);
    });
    renderEstoqueLista("cad");
    atualizarBadgeFaltantes();
    renderCombos();
  }

  function categoriasDeProduto() {
    return [...new Set(produtos.filter(function (p) { return p.tipo === "pai"; }).map(function (p) { return p.categoria; }).filter(Boolean))].sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
  }

  ["cad", "venda"].forEach(function (contexto) {
    const chipsEl = $(contexto === "cad" ? "estoque-chips-cad" : "estoque-chips-venda");
    chipsEl.addEventListener("click", function (e) {
      const chip = e.target.closest("[data-filtro-estoque]");
      if (!chip) return;
      filtroEstoque[contexto] = chip.dataset.filtroEstoque;
      renderEstoqueLista(contexto);
    });
    $(contexto === "cad" ? "lista-produtos" : "lista-estoque").addEventListener("click", function (e) {
      const repor = e.target.closest("[data-repor]");
      if (repor) return abrirRepor(repor.dataset.repor, repor.dataset.modo);
      if (e.target.closest("[data-repor-lote]")) return abrirReporLote();
      const editar = e.target.closest("[data-editar-produto-pai]");
      if (editar && ehAdmin()) abrirFolhaProduto(editar.dataset.editarProdutoPai);
    });
  });

  $("busca-produtos").addEventListener("input", function () { renderEstoqueLista("cad"); });

  function criarGrupoCombo(grupo) {
    const dados = grupo || { nome: "", quantidade: 1, skuIds: [] };
    const linha = document.createElement("div");
    linha.className = "combo-grupo";
    linha.dataset.grupoId = dados.id || "";
    linha.innerHTML = '<div class="form-row combo-grupo-topo"><div class="field"><label>Nome do item</label><input type="text" class="combo-grupo-nome" placeholder="Ex.: Bebida" value="' + escapeAttr(dados.nome) + '"></div><div class="field"><label>Quantidade</label><input type="number" class="combo-grupo-qtd" min="1" step="1" inputmode="numeric" value="' + (dados.quantidade || 1) + '"></div><button type="button" class="btn-icon combo-grupo-remover" aria-label="Remover item"><svg aria-hidden="true"><use href="#i-trash"/></svg></button></div><p class="help">Marque mais de uma opção para o cliente escolher na hora.</p><div class="combo-grupo-itens"></div>';
    preencherOpcoesGrupoCombo(linha.querySelector(".combo-grupo-itens"), dados.skuIds || []);
    linha.querySelector(".combo-grupo-remover").addEventListener("click", function () { linha.remove(); });
    return linha;
  }

  function preencherOpcoesGrupoCombo(itens, marcados) {
    itens.innerHTML = "";
    skus().forEach(function (produto) {
      const marcado = marcados.includes(produto.id) ? " checked" : "";
      if (usoInterno(produto) && !marcado) return;
      itens.insertAdjacentHTML("beforeend", '<label><input type="checkbox" value="' + escapeAttr(produto.id) + '"' + marcado + '> ' + escapeHtml(nomeProduto(produto)) + ' <span>' + fmtMoeda(produto.valor) + '</span></label>');
    });
  }

  // O primeiro grupo nasce na abertura do app, às vezes antes de haver produtos
  // cadastrados: as opções de cada grupo são refeitas quando a lista de produtos muda.
  function atualizarOpcoesGruposCombo() {
    const lista = $("combo-grupos");
    if (!lista) return;
    lista.querySelectorAll(".combo-grupo-itens").forEach(function (itens) {
      const marcados = Array.from(itens.querySelectorAll("input:checked")).map(function (c) { return c.value; });
      preencherOpcoesGrupoCombo(itens, marcados);
    });
  }

  function comboConfiguravel(produto) {
    return produto && produto.tipo === "combo" && Array.isArray(produto.gruposCombo) && produto.gruposCombo.length;
  }

  function escolherItensCombo(combo) {
    if (!comboConfiguravel(combo)) return Promise.resolve(null);
    const container = $("combo-selecao-grupos");
    container.innerHTML = "";
    $("combo-selecao-titulo").textContent = "Montar " + combo.nome;
    $("combo-selecao-info").textContent = "Escolha exatamente os itens exigidos em cada grupo. Preço do combo: " + fmtMoeda(combo.valor) + ".";
    combo.gruposCombo.forEach(function (grupo, indice) {
      const disponiveis = (grupo.skuIds || []).map(produtoPorId).filter(function (produto) { return produto && estoqueInformado(produto) && estoqueLivre(produto) > 0; });
      const bloco = document.createElement("div");
      bloco.className = "combo-selecao-grupo";
      bloco.innerHTML = "<strong>" + escapeHtml(grupo.nome) + "</strong><span>Escolha " + grupo.quantidade + " item(ns)</span>";
      for (let posicao = 0; posicao < grupo.quantidade; posicao++) {
        const seletor = document.createElement("select");
        seletor.dataset.comboGrupo = indice;
        seletor.innerHTML = '<option value="">Selecione...</option>' + disponiveis.map(function (produto) { return '<option value="' + escapeAttr(produto.id) + '">' + escapeHtml(nomeProduto(produto)) + " · Est: " + estoqueLivre(produto) + "</option>"; }).join("");
        bloco.appendChild(seletor);
      }
      container.appendChild(bloco);
    });
    $("modal-combo-selecao").classList.add("show");
    return new Promise(function (resolve) {
      const fechar = function (valor) {
        $("modal-combo-selecao").classList.remove("show");
        $("combo-selecao-confirmar").onclick = null;
        $("combo-selecao-cancelar").onclick = null;
        $("combo-selecao-fechar").onclick = null;
        resolve(valor);
      };
      const cancelar = function () { fechar(null); };
      $("combo-selecao-cancelar").onclick = cancelar;
      $("combo-selecao-fechar").onclick = cancelar;
      $("combo-selecao-confirmar").onclick = function () {
        const ids = Array.from(container.querySelectorAll("select")).map(function (select) { return select.value; });
        if (ids.some(function (id) { return !id; }) || new Set(ids).size !== ids.length) { mostrarAlerta("Escolha todos os itens do combo sem repetir produtos.", "error"); return; }
        const alocacoes = {};
        ids.forEach(function (id) { alocacoes[id] = (alocacoes[id] || 0) + 1; });
        const resultado = Object.keys(alocacoes).map(function (id) { return { produtoId: id, quantidade: alocacoes[id], nome: nomeProduto(produtoPorId(id)) }; });
        const erro = validarAlocacoesEstoque(resultado);
        if (erro) { mostrarAlerta(erro, "error"); return; }
        fechar(resultado);
      };
    });
  }

  function validarAlocacoesEstoque(alocacoes) {
    for (const alocacao of alocacoes || []) {
      const produto = produtoPorId(alocacao.produtoId);
      if (!produto || !estoqueInformado(produto) || estoqueLivre(produto) < alocacao.quantidade) return "Estoque insuficiente para " + (produto ? nomeProduto(produto) : "um item do combo") + ".";
    }
    return null;
  }

  function alterarAlocacoesEstoque(alocacoes, sinal) {
    (alocacoes || []).forEach(function (alocacao) {
      const produto = produtoPorId(alocacao.produtoId);
      if (produto) produto.estoque += sinal * alocacao.quantidade;
    });
  }

  function resumoEscolhasCombo(registro) {
    const escolhas = Array.isArray(registro && registro.alocacoesEstoque) && registro.alocacoesEstoque.length
      ? registro.alocacoesEstoque
      : (Array.isArray(registro && registro.itensCombo) ? registro.itensCombo : []);
    return escolhas.map(function (item) {
      const produto = produtoPorId(item.produtoId);
      const nome = item.nome || (produto ? nomeProduto(produto) : "") || "Item do combo";
      const quantidade = Number(item.quantidade) > 0 ? item.quantidade : 1;
      return escapeHtml(nome) + " x" + quantidade;
    }).join(" · ");
  }

  function renderCombos() {
    atualizarOpcoesGruposCombo();
    const lista = $("lista-combos");
    if (!lista) return;
    const cadastrados = combos();
    const termo = $("busca-combos").value.trim().toLocaleLowerCase("pt-BR");
    const combosFiltrados = cadastrados.filter(function (combo) {
      const grupos = (combo.gruposCombo || []).map(function (grupo) {
        return grupo.nome + " " + (grupo.skuIds || []).map(function (id) { return nomeProduto(produtoPorId(id)); }).join(" ");
      }).join(" ");
      const itens = (combo.itensCombo || []).map(function (item) { return item.nome || nomeProduto(produtoPorId(item.produtoId)); }).join(" ");
      return !termo || (combo.nome + " " + grupos + " " + itens).toLocaleLowerCase("pt-BR").includes(termo);
    });
    $("qtd-combos").textContent = cadastrados.length + " combos";
    lista.innerHTML = combosFiltrados.length ? "" : '<div class="empty-state"><strong>' + (termo ? "Nenhum combo encontrado" : "Nenhum combo cadastrado") + '</strong>Adicione itens e descontos para criar um combo.</div>';
    combosFiltrados.forEach(function (combo) {
      const div = document.createElement("div");
      div.className = "list-item";
      const itens = comboConfiguravel(combo)
        ? combo.gruposCombo.map(function (grupo) { return escapeHtml(grupo.nome) + " x" + grupo.quantidade + " (" + grupo.skuIds.length + " opções)"; }).join(" · ")
        : (combo.itensCombo || []).map(function (item) { return escapeHtml(item.nome || (produtoPorId(item.produtoId) || {}).nome || "Item") + " x" + item.quantidade; }).join(" · ");
      div.innerHTML = '<div class="info"><strong>' + escapeHtml(combo.nome) + '</strong><div class="muted">' + itens + " · " + fmtMoeda(combo.valor) + '</div></div><div class="actions"><button class="btn btn-outline" data-editar-combo="' + escapeAttr(combo.id) + '">Editar</button><button class="btn btn-danger" data-remover-combo="' + escapeAttr(combo.id) + '">Excluir</button></div>';
      lista.appendChild(div);
    });
    lista.querySelectorAll("[data-editar-combo]").forEach(function (btn) {
      btn.addEventListener("click", function () { abrirEdicaoCombo(btn.dataset.editarCombo); });
    });
    lista.querySelectorAll("[data-remover-combo]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const combo = produtoPorId(btn.dataset.removerCombo);
        if (!combo || !confirm("Excluir o combo \"" + combo.nome + "\"?")) return;
        produtos = produtos.filter(function (produto) { return produto.id !== combo.id; });
        salvarESyncIncremental(KEY_PRODUTOS, produtos, "produtos");
        renderProdutos();
        popularSelectProdutos();
        mostrarAlerta("Combo excluído.", "success");
      });
    });
  }

  $("busca-combos").addEventListener("input", renderCombos);

  function validarBaixaEstoque(produto, qtd) {
    const componentes = produto && produto.tipo === "combo" ? componentesCombo(produto, qtd) : [{ produto: produto, quantidade: qtd }];
    if (componentes.some(function (item) { return !item.produto; })) return "Um item deste combo não está mais cadastrado.";
    const totais = {};
    componentes.forEach(function (item) { if (item.produto) totais[item.produto.id] = (totais[item.produto.id] || 0) + item.quantidade; });
    for (const id in totais) {
      const item = produtoPorId(id);
      if (!item || !estoqueInformado(item)) return "Estoque de " + (item ? item.nome : "um item do combo") + " não informado. Faça a contagem antes de vender.";
      const livre = estoqueLivre(item);
      if (livre < totais[id]) return "Estoque insuficiente de " + item.nome + " (disponível: " + Math.max(0, livre) + (estoqueReservado(item) ? ", " + estoqueReservado(item) + " reservado em pendentes" : "") + ", solicitado: " + totais[id] + ").";
    }
    return null;
  }

  function baixarEstoque(produto, qtd) {
    alterarEstoque(produto, -qtd);
    salvarESyncIncremental(KEY_PRODUTOS, produtos, "produtos");
  }

  function reporEstoque(produto, qtd) {
    alterarEstoque(produto, qtd);
    salvarESyncIncremental(KEY_PRODUTOS, produtos, "produtos");
  }

  function alterarEstoque(produto, quantidade) {
    const componentes = produto && produto.tipo === "combo" ? componentesCombo(produto, quantidade) : [{ produto: produto, quantidade: quantidade }];
    componentes.forEach(function (item) { if (item.produto) item.produto.estoque += item.quantidade; });
  }

  function reconciliarEstoque(alocAntiga, alocNova) {
    const pAntigo = alocAntiga ? produtoPorId(alocAntiga.produtoId) : null;
    const pNovo = alocNova ? produtoPorId(alocNova.produtoId) : null;
    if (pAntigo) alterarEstoque(pAntigo, alocAntiga.quantidade);
    if (alocNova && !pNovo) {
      if (pAntigo) alterarEstoque(pAntigo, -alocAntiga.quantidade);
      return { erro: "Produto não encontrado." };
    }
    if (pNovo) {
      const erro = validarBaixaEstoque(pNovo, alocNova.quantidade);
      if (erro) {
        if (pAntigo) alterarEstoque(pAntigo, -alocAntiga.quantidade);
        return { erro: erro };
      }
      alterarEstoque(pNovo, -alocNova.quantidade);
    }
    if (alocAntiga || alocNova) salvarESyncIncremental(KEY_PRODUTOS, produtos, "produtos");
    return { erro: null };
  }

  function reconciliarEstoqueItens(itensAntigos, itensNovos) {
    const antigos = itensAntigos || [];
    const novos = itensNovos || [];
    antigos.forEach(function (item) {
      if (item.alocacoesEstoque) alterarAlocacoesEstoque(item.alocacoesEstoque, 1);
      else { const produto = produtoPorId(item.id || item.produtoId); if (produto) alterarEstoque(produto, item.quantidade); }
    });
    const totais = {};
    novos.forEach(function (item) {
      if (item.alocacoesEstoque) {
        item.alocacoesEstoque.forEach(function (alocacao) { totais[alocacao.produtoId] = (totais[alocacao.produtoId] || 0) + alocacao.quantidade; });
        return;
      }
      const produto = produtoPorId(item.id || item.produtoId);
      const componentes = produto && produto.tipo === "combo" ? componentesCombo(produto, item.quantidade) : [{ produto: produto, quantidade: item.quantidade }];
      componentes.forEach(function (componente) { if (componente.produto) totais[componente.produto.id] = (totais[componente.produto.id] || 0) + componente.quantidade; });
    });
    for (const id in totais) {
      const produto = produtoPorId(id);
      if (!produto || !estoqueInformado(produto) || estoqueLivre(produto) < totais[id]) {
        antigos.forEach(function (item) {
          if (item.alocacoesEstoque) alterarAlocacoesEstoque(item.alocacoesEstoque, -1);
          else { const antigo = produtoPorId(item.id || item.produtoId); if (antigo) alterarEstoque(antigo, -item.quantidade); }
        });
        return { erro: "Estoque insuficiente ou não informado para um item do consumo." };
      }
    }
    novos.forEach(function (item) {
      if (item.alocacoesEstoque) alterarAlocacoesEstoque(item.alocacoesEstoque, -1);
      else { const produto = produtoPorId(item.id || item.produtoId); if (produto) alterarEstoque(produto, -item.quantidade); }
    });
    if (antigos.length || novos.length) salvarESyncIncremental(KEY_PRODUTOS, produtos, "produtos");
    return { erro: null };
  }

  function renderInventario() {
    renderGradeProdutos();
    renderEstoqueLista("venda");
    atualizarBadgeFaltantes();
  }

  $("busca-estoque").addEventListener("input", function () { renderEstoqueLista("venda"); });

  // Mensagem do estoque em blocos por situação, na mesma régua da tela de estoque:
  // primeiro o que falta (com quanto comprar), depois o que está acabando e o resto.
  function mensagemEstoqueWhatsApp(agora) {
    const quando = agora || new Date();
    const catalogo = skus().filter(function (sku) { return sku.ativo !== false; });
    const grupos = { faltando: [], baixo: [], ok: [], sem: [] };
    catalogo.forEach(function (sku) { grupos[situacaoSku(sku)].push(sku); });
    const porNome = function (a, b) { return nomeCurtoSku(a).localeCompare(nomeCurtoSku(b), "pt-BR"); };
    const folga = function (sku) { return sku.estoque / Math.max(1, Number(sku.estoqueMinimo) || 0); };
    const porFolga = function (a, b) { return folga(a) - folga(b) || porNome(a, b); };
    grupos.faltando.sort(porFolga);
    grupos.baixo.sort(porFolga);
    grupos.ok.sort(porNome);
    grupos.sem.sort(porNome);
    const minimo = function (sku) { return " (mín. " + (Number(sku.estoqueMinimo) || 0) + ")"; };
    const nome = function (sku) {
      const curto = nomeCurtoSku(sku);
      return usoInterno(sku) && !/uso interno/i.test(curto) ? curto + " (uso interno)" : curto;
    };
    const linhas = [];
    linhas.push("📦 *Estoque - " + nomePosto() + "*");
    const dia = quando.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    const hora = quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    linhas.push("_" + dia.charAt(0).toLocaleUpperCase("pt-BR") + dia.slice(1) + ", " + hora + "_");
    linhas.push("");
    if (!catalogo.length) {
      linhas.push("Nenhum produto cadastrado.");
      return linhas.join("\n");
    }
    const resumo = [];
    if (grupos.faltando.length) resumo.push("🔴 " + grupos.faltando.length + " faltando");
    if (grupos.baixo.length) resumo.push("🟡 " + grupos.baixo.length + " acabando");
    if (grupos.ok.length) resumo.push("🟢 " + grupos.ok.length + " em dia");
    if (grupos.sem.length) resumo.push("⚪ " + grupos.sem.length + " sem contagem");
    linhas.push(resumo.join("   "));
    if (grupos.faltando.length) {
      linhas.push("");
      linhas.push("🔴 *Faltando, repor já*");
      grupos.faltando.forEach(function (sku) {
        const qtd = sku.estoque <= 0 ? "*zerado*" : "*" + sku.estoque + " un*";
        const comprar = sugestaoSku(sku);
        linhas.push("• " + nome(sku) + ": " + qtd + minimo(sku) + (comprar ? ", comprar " + comprar : ""));
      });
    } else {
      linhas.push("");
      linhas.push("✅ Nada faltando.");
    }
    if (grupos.baixo.length) {
      linhas.push("");
      linhas.push("🟡 *Acabando*");
      grupos.baixo.forEach(function (sku) { linhas.push("• " + nome(sku) + ": " + sku.estoque + " un" + minimo(sku)); });
    }
    if (grupos.ok.length) {
      linhas.push("");
      linhas.push("🟢 *Em dia*");
      grupos.ok.forEach(function (sku) { linhas.push("• " + nome(sku) + ": " + sku.estoque + " un"); });
    }
    if (grupos.sem.length) {
      linhas.push("");
      linhas.push("⚪ *Sem contagem*");
      grupos.sem.forEach(function (sku) { linhas.push("• " + nome(sku)); });
    }
    const compra = grupos.faltando.reduce(function (soma, sku) { return soma + sugestaoSku(sku); }, 0);
    if (compra) {
      linhas.push("");
      linhas.push("🛒 *Sugestão de compra: " + compra + " un* em " + grupos.faltando.length + (grupos.faltando.length === 1 ? " item" : " itens"));
    }
    return linhas.join("\n");
  }

  function compartilharInventarioWhatsApp() {
    abrirWhatsApp(mensagemEstoqueWhatsApp());
  }

  const btnCompartilharEstoque = $("btn-compartilhar-estoque");
  if (btnCompartilharEstoque) btnCompartilharEstoque.addEventListener("click", compartilharInventarioWhatsApp);

  let editandoPerfilIdx = null;
  let comboEditandoId = null;

  function limparFormCombo() {
    comboEditandoId = null;
    $("form-combo").reset();
    $("combo-grupos").innerHTML = "";
    $("combo-grupos").appendChild(criarGrupoCombo());
    $("combo-titulo").textContent = "Novo combo";
    $("btn-salvar-combo").textContent = "Salvar combo";
    $("btn-cancelar-combo-edicao").style.display = "none";
  }

  function abrirEdicaoCombo(id) {
    const combo = produtoPorId(id);
    if (!combo || combo.tipo !== "combo") return;
    comboEditandoId = combo.id;
    $("combo-nome").value = combo.nome;
    $("combo-valor").value = moedaParaCampo(combo.valor);
    $("combo-grupos").innerHTML = "";
    const grupos = combo.gruposCombo || (combo.itensCombo || []).map(function (item) {
      return { nome: item.nome || nomeProduto(produtoPorId(item.produtoId)), quantidade: item.quantidade || 1, skuIds: item.produtoId ? [item.produtoId] : [] };
    });
    grupos.forEach(function (grupo) { $("combo-grupos").appendChild(criarGrupoCombo(grupo)); });
    if (!$("combo-grupos").children.length) $("combo-grupos").appendChild(criarGrupoCombo());
    $("combo-titulo").textContent = "Editar combo";
    $("btn-salvar-combo").textContent = "Salvar alterações";
    $("btn-cancelar-combo-edicao").style.display = "";
    $("modal-cad-combos").classList.add("show");
  }

  function fecharEdicaoPerfil() {
    $("modal-perfil-edicao").classList.remove("show");
    editandoPerfilIdx = null;
  }

  $("modal-fechar-perfil-edicao").addEventListener("click", fecharEdicaoPerfil);
  $("btn-cancelar-perfil-edicao").addEventListener("click", fecharEdicaoPerfil);
  $("modal-perfil-edicao").addEventListener("click", function (e) {
    if (e.target === this) fecharEdicaoPerfil();
  });

  /* ----- Produto: uma folha com nome, categoria e variações ----- */

  function variacaoVazia() {
    return { id: "", variante: "", valor: "", estoque: "", estoqueMinimo: 5, estoqueIdeal: "" };
  }

  function abrirFolhaProduto(paiId) {
    const pai = paiId ? produtoPorId(paiId) : null;
    produtoEditandoPaiId = pai && pai.tipo === "pai" ? pai.id : null;
    const novo = !produtoEditandoPaiId;
    $("prod-folha-titulo").textContent = novo ? "Novo produto" : "Editar produto";
    $("prod-nome").value = pai ? pai.nome : "";
    $("prod-categoria").value = pai ? pai.categoria : "";
    variacoesForm = novo ? [] : skus().filter(function (sku) { return sku.produtoPaiId === pai.id; }).map(function (sku) {
      return { id: sku.id, variante: sku.variante || "Padrão", valor: sku.valor, estoque: estoqueInformado(sku) ? sku.estoque : "", estoqueMinimo: sku.estoqueMinimo != null ? sku.estoqueMinimo : 5, estoqueIdeal: sku.estoqueIdeal || "" };
    });
    // Vazio: o campo mostra "Padrão" como dica e é assim que a variação fica se ninguém der nome.
    if (!variacoesForm.length) variacoesForm.push(variacaoVazia());
    desenharVariacoesProduto();
    desenharAtalhosCategoria();
    desenharMovimentosProduto(pai);
    $("btn-excluir-produto").hidden = novo;
    $("btn-salvar-produto").textContent = novo ? "Salvar produto" : "Salvar alterações";
    $("modal-cad-produtos").classList.add("show");
    if (novo) setTimeout(function () { try { $("prod-nome").focus({ preventScroll: true }); } catch (e) {} }, 60);
  }

  function campoNumero(valor) {
    return valor === "" || valor == null ? "" : String(valor).replace(".", ",");
  }

  function desenharVariacoesProduto() {
    const multi = variacoesForm.length > 1;
    $("prod-variacoes-titulo").textContent = multi ? variacoesForm.length + " variações" : "Preço e estoque";
    $("prod-variacoes-dica").textContent = multi ? "Cada variação tem o próprio preço e estoque." : "Tem tamanhos ou sabores diferentes? Adicione uma variação.";
    $("prod-variacoes").innerHTML = variacoesForm.map(function (v, i) {
      const existente = !!v.id;
      const minimo = parseInt(v.estoqueMinimo, 10) || 0;
      return '<div class="prod-variacao' + (multi ? " em-cartao" : "") + '" data-variacao="' + i + '">' +
        // O nome aparece mesmo com uma variação só; vazio, ela fica como "Padrão".
        '<div class="prod-variacao-topo"><div class="field"><label for="var-nome-' + i + '">Variação ' + (multi ? '<span class="req">*</span>' : '<span class="opt">(opcional)</span>') + '</label><input type="text" id="var-nome-' + i + '" data-campo="variante" value="' + escapeAttr(v.variante) + '" placeholder="' + (multi ? "Ex.: Lata 350 ml" : "Padrão") + '" autocomplete="off"></div>' +
          (multi ? '<button type="button" class="btn-icon" data-remover-variacao="' + i + '" aria-label="Remover variação ' + escapeAttr(v.variante || String(i + 1)) + '"><svg aria-hidden="true"><use href="#i-trash"/></svg></button>' : "") +
        "</div>" +
        '<div class="form-row prod-variacao-campos">' +
          '<div class="field"><label for="var-valor-' + i + '">Preço (R$) <span class="req">*</span></label><input type="text" id="var-valor-' + i + '" data-campo="valor" class="currency-input" inputmode="numeric" value="' + escapeAttr(typeof v.valor === "number" ? moedaParaCampo(v.valor) : v.valor || "") + '" placeholder="R$ 0,00" autocomplete="off"></div>' +
          '<div class="field"><label for="var-estoque-' + i + '">' + (existente ? "Estoque agora" : "Estoque inicial") + '</label><input type="text" id="var-estoque-' + i + '" data-campo="estoque" inputmode="numeric" value="' + escapeAttr(campoNumero(v.estoque)) + '" placeholder="' + (existente ? "Sem contagem" : "0") + '"' + (existente ? " readonly" : "") + ' autocomplete="off"><span class="hint">' + (existente ? "Para mudar, use Repor ou Corrigir contagem." : "Deixe vazio se ainda não contou.") + "</span></div>" +
          '<div class="field"><label for="var-min-' + i + '">Mínimo</label><input type="text" id="var-min-' + i + '" data-campo="estoqueMinimo" inputmode="numeric" value="' + escapeAttr(campoNumero(v.estoqueMinimo)) + '" autocomplete="off"><span class="hint">No mínimo ou abaixo, entra em Faltando.</span></div>' +
          '<div class="field"><label for="var-ideal-' + i + '">Ideal <span class="opt">(opcional)</span></label><input type="text" id="var-ideal-' + i + '" data-campo="estoqueIdeal" inputmode="numeric" value="' + escapeAttr(campoNumero(v.estoqueIdeal)) + '" placeholder="' + minimo * 2 + '" autocomplete="off"><span class="hint">Quanto ter depois de repor. Vazio usa o dobro do mínimo.</span></div>' +
        "</div>" +
        (existente ? '<button type="button" class="btn btn-outline btn-sm" data-repor-variacao="' + escapeAttr(v.id) + '">Repor ou corrigir ' + (multi ? escapeHtml(String(v.variante).toLocaleLowerCase("pt-BR")) : "estoque") + "</button>" : "") +
      "</div>";
    }).join("");
  }

  function lerVariacoesDoForm() {
    $("prod-variacoes").querySelectorAll("[data-variacao]").forEach(function (bloco) {
      const v = variacoesForm[Number(bloco.dataset.variacao)];
      if (!v) return;
      bloco.querySelectorAll("[data-campo]").forEach(function (campo) {
        if (campo.readOnly) return;
        v[campo.dataset.campo] = campo.value.trim();
      });
    });
  }

  function desenharAtalhosCategoria() {
    const atual = $("prod-categoria").value.trim().toLocaleLowerCase("pt-BR");
    $("prod-cat-atalhos").innerHTML = categoriasDeProduto().map(function (c) {
      return '<button type="button" class="chip" data-categoria="' + escapeAttr(c) + '" aria-pressed="' + (c.toLocaleLowerCase("pt-BR") === atual) + '">' + escapeHtml(c) + "</button>";
    }).join("");
  }

  function desenharMovimentosProduto(pai) {
    const secao = $("prod-movimentos-secao");
    if (!pai) {
      secao.hidden = true;
      return;
    }
    const ids = new Set(skus().filter(function (sku) { return sku.produtoPaiId === pai.id; }).map(function (sku) { return sku.id; }));
    const multi = ids.size > 1;
    const lista = movimentosEstoque.filter(function (m) { return ids.has(m.produtoId); }).sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); }).slice(0, 8);
    secao.hidden = false;
    $("prod-movimentos").innerHTML = lista.length
      ? '<div class="card list-surface">' + lista.map(function (m) {
          const sku = produtoPorId(m.produtoId);
          const q = Number(m.quantidade) || 0;
          return '<div class="list-item movimento-estoque"><div class="info"><strong>' + escapeHtml(ROTULOS_MOVIMENTO[m.tipo] || m.tipo) + (multi && sku ? ", " + escapeHtml(String(sku.variante || "").toLocaleLowerCase("pt-BR")) : "") + '</strong><span class="muted">' + escapeHtml(formatarData(m.data)) + (m.operadorNome ? ", " + escapeHtml(m.operadorNome) : "") + "</span></div>" +
            '<strong class="movimento-qtd ' + (q >= 0 ? "entrada" : "saida") + '">' + (q > 0 ? "+" : q < 0 ? "−" : "") + Math.abs(q) + " un</strong></div>";
        }).join("") + "</div>"
      : '<p class="muted">Nenhum movimento registrado ainda.</p>';
  }

  $("prod-categoria").addEventListener("input", desenharAtalhosCategoria);
  $("prod-cat-atalhos").addEventListener("click", function (e) {
    const chip = e.target.closest("[data-categoria]");
    if (!chip) return;
    $("prod-categoria").value = chip.dataset.categoria;
    desenharAtalhosCategoria();
  });
  $("btn-add-variacao").addEventListener("click", function () {
    lerVariacoesDoForm();
    if (variacoesForm.length === 1 && variacoesForm[0].variante === "Padrão" && !variacoesForm[0].id) variacoesForm[0].variante = "";
    variacoesForm.push(variacaoVazia());
    desenharVariacoesProduto();
    const campo = $("var-nome-" + (variacoesForm.length - 1));
    if (campo) campo.focus();
  });
  $("prod-variacoes").addEventListener("click", function (e) {
    const remover = e.target.closest("[data-remover-variacao]");
    if (remover) {
      lerVariacoesDoForm();
      variacoesForm.splice(Number(remover.dataset.removerVariacao), 1);
      if (variacoesForm.length === 1 && !variacoesForm[0].variante) variacoesForm[0].variante = "Padrão";
      desenharVariacoesProduto();
      return;
    }
    const repor = e.target.closest("[data-repor-variacao]");
    if (repor) {
      const paiId = produtoEditandoPaiId;
      $("modal-cad-produtos").classList.remove("show");
      abrirRepor(repor.dataset.reporVariacao, null, paiId);
    }
  });

  function numeroDoCampo(valor) {
    return valor === "" || valor == null ? null : Number(String(valor).replace(/\s/g, "").replace(",", "."));
  }

  $("form-produto").addEventListener("submit", function (e) {
    e.preventDefault();
    lerVariacoesDoForm();
    const nome = $("prod-nome").value.trim();
    const categoria = $("prod-categoria").value.trim();
    if (!nome) { mostrarAlerta("Informe o nome do produto.", "error"); return; }
    if (!categoria) { mostrarAlerta("Informe a categoria do produto.", "error"); return; }
    const editando = produtoEditandoPaiId ? produtoPorId(produtoEditandoPaiId) : null;
    if (produtos.some(function (p) { return p.tipo === "pai" && (!editando || p.id !== editando.id) && p.nome.toLowerCase() === nome.toLowerCase(); })) {
      mostrarAlerta("Este produto já está cadastrado.", "error");
      return;
    }
    const multi = variacoesForm.length > 1;
    const nomesVistos = new Set();
    const lidas = [];
    for (let i = 0; i < variacoesForm.length; i++) {
      const v = variacoesForm[i];
      const variante = multi ? String(v.variante || "").trim() : (String(v.variante || "").trim() || "Padrão");
      const valor = typeof v.valor === "number" ? v.valor : v.valor ? moedaDaMascara(v.valor) : null;
      const estoque = v.id ? null : numeroDoCampo(v.estoque);
      const minimo = numeroDoCampo(v.estoqueMinimo);
      const ideal = numeroDoCampo(v.estoqueIdeal);
      const rotulo = multi ? " da variação " + (variante || i + 1) : "";
      if (!variante) { mostrarAlerta("Informe o nome da variação " + (i + 1) + ".", "error"); return; }
      if (nomesVistos.has(variante.toLowerCase())) { mostrarAlerta("A variação " + variante + " aparece duas vezes.", "error"); return; }
      nomesVistos.add(variante.toLowerCase());
      if (valor === null || isNaN(valor) || valor < 0) { mostrarAlerta("Informe um preço válido" + rotulo + " (R$ 0,00 para uso interno).", "error"); return; }
      if (estoque !== null && (isNaN(estoque) || estoque < 0 || !Number.isInteger(estoque))) { mostrarAlerta("Informe o estoque inicial" + rotulo + " em unidades (0 ou mais).", "error"); return; }
      if (minimo === null || isNaN(minimo) || minimo < 0) { mostrarAlerta("Informe o estoque mínimo" + rotulo + " (0 ou mais).", "error"); return; }
      if (ideal !== null && (isNaN(ideal) || ideal <= 0)) { mostrarAlerta("O estoque ideal" + rotulo + " precisa ser maior que zero, ou fique vazio.", "error"); return; }
      lidas.push({ id: v.id, variante: variante, valor: valor, estoque: estoque, estoqueMinimo: minimo, estoqueIdeal: ideal });
    }
    let pai = editando;
    if (!pai) {
      pai = { id: gerarId("pp"), tipo: "pai", nome: nome, categoria: categoria, ativo: true, criadoEm: new Date().toISOString() };
      produtos.push(pai);
    } else {
      pai.nome = nome;
      pai.categoria = categoria;
    }
    const mantidos = new Set();
    lidas.forEach(function (v) {
      const sku = v.id ? produtoPorId(v.id) : null;
      if (sku) {
        sku.nome = nome;
        sku.variante = v.variante;
        sku.categoria = categoria;
        sku.valor = v.valor;
        sku.estoqueMinimo = v.estoqueMinimo;
        sku.estoqueIdeal = v.estoqueIdeal;
        mantidos.add(sku.id);
      } else {
        const novo = { id: gerarId("p"), tipo: "sku", produtoPaiId: pai.id, nome: nome, variante: v.variante, categoria: categoria, valor: v.valor, estoque: v.estoque, estoqueMinimo: v.estoqueMinimo, estoqueIdeal: v.estoqueIdeal, ativo: true, criadoEm: new Date().toISOString() };
        produtos.push(novo);
        mantidos.add(novo.id);
      }
    });
    if (editando) produtos = produtos.filter(function (p) { return p.tipo !== "sku" || p.produtoPaiId !== pai.id || mantidos.has(p.id); });
    // Nomes e categorias de vendas e consumos acompanham o cadastro; valores já cobrados não mudam.
    const atualizarItem = function (item) {
      if (!item || !mantidos.has(item.produtoId || item.id)) return;
      const sku = produtoPorId(item.produtoId || item.id);
      if (!sku) return;
      if (item.nome !== undefined) item.nome = nomeProduto(sku);
      if (item.produto !== undefined) item.produto = nomeProduto(sku);
      item.categoria = categoria;
    };
    if (editando) {
      vendas.forEach(atualizarItem);
      vendasPendentes.forEach(atualizarItem);
      abastecimentos.forEach(function (registro) {
        atualizarItem(registro.consumoProduto);
        (registro.consumoProdutos || []).forEach(atualizarItem);
      });
      salvarESyncIncremental(KEY_VENDAS, vendas);
      salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
      salvarESyncIncremental(KEY_ABASTECIMENTOS, abastecimentos);
    }
    salvarESyncIncremental(KEY_PRODUTOS, produtos, "produtos");
    $("modal-cad-produtos").classList.remove("show");
    produtoEditandoPaiId = null;
    aposMudarEstoque();
    mostrarAlerta(editando ? nome + " atualizado." : nome + " cadastrado com " + lidas.length + (lidas.length === 1 ? " variação." : " variações."), "success");
  });

  $("btn-excluir-produto").addEventListener("click", function () {
    const pai = produtoPorId(produtoEditandoPaiId);
    if (!pai || pai.tipo !== "pai") return;
    const total = skus().filter(function (sku) { return sku.produtoPaiId === pai.id; }).length;
    if (!confirm("Excluir " + pai.nome + " e " + (total === 1 ? "a variação" : "as " + total + " variações") + "? Vendas e históricos ficam preservados.")) return;
    produtos = produtos.filter(function (produto) { return produto.id !== pai.id && produto.produtoPaiId !== pai.id; });
    salvarESyncIncremental(KEY_PRODUTOS, produtos, "produtos");
    $("modal-cad-produtos").classList.remove("show");
    produtoEditandoPaiId = null;
    aposMudarEstoque();
    mostrarAlerta(pai.nome + " excluído. Vendas e históricos foram preservados.", "success");
  });

  /* ----- Repor ou corrigir a contagem de uma variação ----- */

  function abrirRepor(skuId, modo, voltarParaPaiId) {
    const sku = produtoPorId(skuId);
    if (!ehSku(sku)) return;
    reposicao.skuId = sku.id;
    reposicao.modo = ehAdmin() && modo === "contagem" ? "contagem" : usoInterno(sku) && modo === "baixa" ? "baixa" : "repor";
    reposicao.voltarParaPaiId = voltarParaPaiId || null;
    // Contagem é só do admin; a baixa só existe para itens de uso interno, para qualquer papel.
    let modosVisiveis = 0;
    $("repor-modos").querySelectorAll("[data-modo]").forEach(function (b) {
      b.hidden = (b.dataset.modo === "contagem" && !ehAdmin()) || (b.dataset.modo === "baixa" && !usoInterno(sku));
      if (!b.hidden) modosVisiveis++;
    });
    $("repor-modos").hidden = modosVisiveis < 2;
    desenharRepor(true);
    $("modal-repor").classList.add("show");
  }

  function desenharRepor(preencher) {
    const sku = produtoPorId(reposicao.skuId);
    if (!sku) return;
    const contar = reposicao.modo === "contagem";
    const baixa = reposicao.modo === "baixa";
    const informado = estoqueInformado(sku);
    $("repor-titulo").textContent = contar ? "Corrigir contagem" : baixa ? "Registrar baixa" : "Repor estoque";
    $("repor-sub").textContent = nomeCurtoSku(sku);
    $("repor-modos").querySelectorAll("[data-modo]").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.modo === reposicao.modo)); });
    $("repor-agora").textContent = informado ? sku.estoque : "—";
    $("repor-min").textContent = Number(sku.estoqueMinimo) || 0;
    $("repor-ideal").textContent = idealSku(sku);
    $("repor-aviso").hidden = contar || baixa || informado;
    $("repor-qtd-rotulo").textContent = contar ? "Quantas unidades você contou?" : baixa ? "Quantas unidades saíram?" : "Chegou";
    $("repor-atalhos").hidden = contar || baixa;
    $("repor-motivo-campo").hidden = !contar;
    const sugestao = sugestaoSku(sku);
    $("repor-btn-sugestao").textContent = "Sugestão " + sugestao;
    $("repor-btn-sugestao").dataset.valor = sugestao;
    $("repor-dica").textContent = contar ? "" : baixa ? "Item de uso interno: a baixa tira do estoque sem registrar venda." : Number(sku.estoqueIdeal) > 0 ? "A sugestão completa até o ideal de " + sku.estoqueIdeal + " un." : "Sem estoque ideal definido, a sugestão é o dobro do mínimo (" + idealSku(sku) + " un).";
    if (preencher) $("repor-qtd").value = contar ? (informado ? sku.estoque : 0) : baixa ? (informado && sku.estoque > 0 ? 1 : 0) : sugestao;
    atualizarResultadoRepor();
  }

  function atualizarResultadoRepor() {
    const sku = produtoPorId(reposicao.skuId);
    if (!sku) return;
    const q = Math.max(0, parseInt($("repor-qtd").value, 10) || 0);
    const atual = estoqueInformado(sku) ? sku.estoque : 0;
    const botao = $("btn-repor-salvar");
    if (reposicao.modo === "repor") {
      $("repor-resultado-rotulo").textContent = "Fica com";
      $("repor-resultado-valor").textContent = atual + q + " un";
      botao.textContent = q ? "Repor " + q + " un" : "Informe a quantidade";
      botao.disabled = !q;
    } else if (reposicao.modo === "baixa") {
      $("repor-resultado-rotulo").textContent = "Fica com";
      $("repor-resultado-valor").textContent = Math.max(0, atual - q) + " un";
      botao.textContent = !q ? "Informe a quantidade" : q > atual ? "Só há " + atual + " un" : "Dar baixa de " + q + " un";
      botao.disabled = !q || q > atual;
    } else {
      const d = q - atual;
      $("repor-resultado-rotulo").textContent = "Diferença";
      $("repor-resultado-valor").textContent = (d > 0 ? "+" : d < 0 ? "−" : "") + Math.abs(d) + " un";
      botao.textContent = !estoqueInformado(sku) ? "Salvar contagem" : d ? "Salvar correção" : "Contagem confere";
      botao.disabled = false;
    }
  }

  $("repor-modos").addEventListener("click", function (e) {
    const b = e.target.closest("[data-modo]");
    if (!b || b.hidden) return;
    reposicao.modo = b.dataset.modo;
    desenharRepor(true);
  });
  $("repor-qtd").addEventListener("input", atualizarResultadoRepor);
  $("form-repor").addEventListener("click", function (e) {
    const campo = $("repor-qtd");
    const atual = parseInt(campo.value, 10) || 0;
    const delta = e.target.closest("[data-repor-delta]");
    const soma = e.target.closest("[data-repor-soma]");
    const sugestao = e.target.closest("[data-repor-sugestao]");
    if (delta) campo.value = Math.max(0, atual + Number(delta.dataset.reporDelta));
    else if (soma) campo.value = atual + Number(soma.dataset.reporSoma);
    else if (sugestao) campo.value = sugestao.dataset.valor;
    else return;
    atualizarResultadoRepor();
  });

  $("form-repor").addEventListener("submit", function (e) {
    e.preventDefault();
    const sku = produtoPorId(reposicao.skuId);
    if (!ehSku(sku)) return;
    const q = parseInt($("repor-qtd").value, 10);
    if (isNaN(q) || q < 0) { mostrarAlerta("Informe a quantidade em unidades.", "error"); return; }
    const antes = estoqueInformado(sku) ? sku.estoque : null;
    let mensagem;
    if (reposicao.modo === "repor") {
      if (!q) { mostrarAlerta("Informe quantas unidades chegaram.", "error"); return; }
      sku.estoque = (antes || 0) + q;
      registrarMovimentoEstoque(sku, "reposicao", q, antes);
      mensagem = nomeCurtoSku(sku) + ": reposição de " + q + " un registrada.";
    } else if (reposicao.modo === "baixa") {
      if (!usoInterno(sku)) return;
      if (!q || q > (antes || 0)) { mostrarAlerta("Informe de 1 a " + (antes || 0) + " unidades.", "error"); return; }
      sku.estoque = antes - q;
      registrarMovimentoEstoque(sku, "uso_interno", -q, antes);
      mensagem = nomeCurtoSku(sku) + ": baixa de " + q + " un registrada.";
    } else {
      if (!ehAdmin()) return;
      const diferenca = q - (antes || 0);
      const motivo = $("repor-motivo").value;
      sku.estoque = q;
      if (antes === null || diferenca !== 0) registrarMovimentoEstoque(sku, diferenca < 0 && motivo !== "ajuste" ? motivo : "ajuste", diferenca, antes);
      mensagem = nomeCurtoSku(sku) + ": contagem salva com " + q + " un.";
    }
    salvarESyncIncremental(KEY_PRODUTOS, produtos, "produtos");
    salvarESyncIncremental(KEY_MOVIMENTOS_ESTOQUE, movimentosEstoque);
    $("modal-repor").classList.remove("show");
    aposMudarEstoque();
    if (reposicao.voltarParaPaiId) abrirFolhaProduto(reposicao.voltarParaPaiId);
    mostrarAlerta(mensagem, "success");
  });

  /* ----- Repor faltantes em lote: conferência da entrega ----- */
  function abrirReporLote() {
    const lista = skusFaltando().sort(function (a, b) { return nomeCurtoSku(a).localeCompare(nomeCurtoSku(b), "pt-BR"); });
    if (!lista.length) { mostrarAlerta("Nada faltando no estoque.", "success"); return; }
    $("lote-itens").innerHTML = lista.map(function (sku) {
      const nome = nomeCurtoSku(sku);
      return '<div class="lote-item" data-lote="' + escapeAttr(sku.id) + '">' +
        '<div class="info"><strong>' + escapeHtml(nome) + '</strong><span class="muted">Tem <b>' + sku.estoque + "</b>, mínimo " + (Number(sku.estoqueMinimo) || 0) + ", ideal " + idealSku(sku) + "</span></div>" +
        '<div class="stepper stepper-largo"><button type="button" data-lote-delta="-1" aria-label="Menos uma unidade de ' + escapeAttr(nome) + '">−</button><input type="number" inputmode="numeric" min="0" step="1" value="' + sugestaoSku(sku) + '" aria-label="Chegou de ' + escapeAttr(nome) + '"><button type="button" data-lote-delta="1" aria-label="Mais uma unidade de ' + escapeAttr(nome) + '">+</button></div>' +
        '<div class="quick-values"><button type="button" data-lote-soma="6">+6</button><button type="button" data-lote-soma="12">+12</button><button type="button" data-lote-soma="24">+24</button><button type="button" data-lote-zero>Não veio</button></div>' +
      "</div>";
    }).join("");
    atualizarLote();
    $("modal-repor-lote").classList.add("show");
  }

  function atualizarLote() {
    let unidades = 0;
    let itens = 0;
    const blocos = $("lote-itens").querySelectorAll("[data-lote]");
    blocos.forEach(function (bloco) {
      const q = Math.max(0, parseInt(bloco.querySelector("input").value, 10) || 0);
      bloco.classList.toggle("pulado", !q);
      if (q) { unidades += q; itens++; }
    });
    $("lote-resumo").textContent = itens + " de " + blocos.length + (blocos.length === 1 ? " variação" : " variações");
    $("lote-total").textContent = unidades + " un";
    $("btn-lote-salvar").disabled = !unidades;
  }

  $("lote-itens").addEventListener("click", function (e) {
    const bloco = e.target.closest("[data-lote]");
    if (!bloco) return;
    const campo = bloco.querySelector("input");
    const atual = parseInt(campo.value, 10) || 0;
    const delta = e.target.closest("[data-lote-delta]");
    const soma = e.target.closest("[data-lote-soma]");
    if (delta) campo.value = Math.max(0, atual + Number(delta.dataset.loteDelta));
    else if (soma) campo.value = atual + Number(soma.dataset.loteSoma);
    else if (e.target.closest("[data-lote-zero]")) campo.value = 0;
    else return;
    atualizarLote();
  });
  $("lote-itens").addEventListener("input", atualizarLote);

  $("form-repor-lote").addEventListener("submit", function (e) {
    e.preventDefault();
    let unidades = 0;
    let itens = 0;
    $("lote-itens").querySelectorAll("[data-lote]").forEach(function (bloco) {
      const sku = produtoPorId(bloco.dataset.lote);
      const q = Math.max(0, parseInt(bloco.querySelector("input").value, 10) || 0);
      if (!ehSku(sku) || !q) return;
      const antes = estoqueInformado(sku) ? sku.estoque : null;
      sku.estoque = (antes || 0) + q;
      registrarMovimentoEstoque(sku, "reposicao", q, antes);
      unidades += q;
      itens++;
    });
    if (!unidades) { mostrarAlerta("Informe o que chegou em pelo menos uma variação.", "error"); return; }
    salvarESyncIncremental(KEY_PRODUTOS, produtos, "produtos");
    salvarESyncIncremental(KEY_MOVIMENTOS_ESTOQUE, movimentosEstoque);
    $("modal-repor-lote").classList.remove("show");
    aposMudarEstoque();
    mostrarAlerta("Reposição salva: " + itens + (itens === 1 ? " variação, " : " variações, ") + unidades + " unidades.", "success");
  });

  $("btn-add-combo-grupo").addEventListener("click", function () {
    $("combo-grupos").appendChild(criarGrupoCombo());
  });
  $("btn-cancelar-combo-edicao").addEventListener("click", function () {
    limparFormCombo();
    fecharFormCadastro("form-combo");
  });

  $("form-combo").addEventListener("submit", function (e) {
    e.preventDefault();
    const nome = $("combo-nome").value.trim();
    const valor = moedaDaMascara($("combo-valor").value);
    const grupos = Array.from($("combo-grupos").querySelectorAll(".combo-grupo")).map(function (linha) {
      return { id: linha.dataset.grupoId || gerarId("grupo"), nome: linha.querySelector(".combo-grupo-nome").value.trim(), quantidade: parseInt(linha.querySelector(".combo-grupo-qtd").value, 10), skuIds: Array.from(linha.querySelectorAll("input[type=checkbox]:checked")).map(function (input) { return input.value; }) };
    });
    if (!nome) { mostrarAlerta("Informe o nome do combo.", "error"); return; }
    if (isNaN(valor) || valor <= 0) { mostrarAlerta("Informe um preço fixo válido para o combo.", "error"); return; }
    if (!grupos.length || grupos.some(function (grupo) { return !grupo.nome || !grupo.quantidade || !grupo.skuIds.length; })) { mostrarAlerta("Preencha o nome, a quantidade e os produtos permitidos em cada grupo.", "error"); return; }
    if (combos().some(function (combo) { return combo.id !== comboEditandoId && combo.nome.toLowerCase() === nome.toLowerCase(); })) { mostrarAlerta("Este combo já está cadastrado.", "error"); return; }
    const combo = produtoPorId(comboEditandoId);
    if (combo) {
      combo.nome = nome;
      combo.valor = valor;
      combo.gruposCombo = grupos;
    } else {
      produtos.push({ id: gerarId("co"), tipo: "combo", nome: nome, categoria: "Combos", gruposCombo: grupos, valor: valor, ativo: true, criadoEm: new Date().toISOString() });
    }
    salvarESyncIncremental(KEY_PRODUTOS, produtos, "produtos");
    limparFormCombo();
    renderProdutos();
    popularSelectProdutos();
    fecharFormCadastro("form-combo");
    mostrarAlerta(combo ? "Combo atualizado com sucesso!" : "Combo cadastrado com sucesso!", "success");
  });

  $("form-perfil-edicao").addEventListener("submit", function (e) {
    e.preventDefault();
    if (editandoPerfilIdx == null) return;
    const nome = $("editpf-nome").value.trim();
    const turno = parseInt($("editpf-turno").value, 10);
    if (!nome) {
      mostrarAlerta("Informe o nome do operador.", "error");
      return;
    }
    if (!turno) {
      mostrarAlerta("Selecione o turno do operador.", "error");
      return;
    }
    if (perfis.some((p, i) => i !== editandoPerfilIdx && p.nome.toLowerCase() === nome.toLowerCase())) {
      mostrarAlerta("Já existe outro operador com esse nome.", "error");
      return;
    }
    const p = perfis[editandoPerfilIdx];
    const fotoFile = $("editpf-foto").files && $("editpf-foto").files[0];
    const finalizar = function (fotoData, erroFoto) {
      if (erroFoto) {
        mostrarAlerta(erroFoto, "error");
        return;
      }
      p.nome = nome;
      p.turno = turno;
      if (fotoData) p.foto = fotoData;
      const atualizarOperador = function (registro) {
        if (!registro) return;
        const operador = registro.operador || registro.perfil;
        if (operador && operador.id === p.id) {
          if (registro.operador) registro.operador = Object.assign({}, registro.operador, { nome: nome });
          if (registro.perfil) registro.perfil = Object.assign({}, registro.perfil, { nome: nome });
        }
      };
      abastecimentos.forEach(atualizarOperador);
      vendas.forEach(atualizarOperador);
      vendasPendentes.forEach(atualizarOperador);
      caixa.historico.forEach(function (mov) { if (mov.operador && mov.operador.id === p.id) mov.operador = Object.assign({}, mov.operador, { nome: nome }); });
      salvarESyncIncremental(KEY_PERFIS, perfis);
      salvarESyncIncremental(KEY_ABASTECIMENTOS, abastecimentos);
      salvarESyncIncremental(KEY_VENDAS, vendas);
      salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
      salvarESyncIncremental(KEY_CAIXA, caixa);
      fecharEdicaoPerfil();
      renderPerfis();
      popularSelectPerfilAtivo();
      popularSelectFiltroPerfil();
      renderHistorico();
      mostrarAlerta("Perfil " + nome + " atualizado!", "success");
    };
    if (fotoFile) {
      redimensionarFoto(fotoFile, finalizar);
    } else {
      finalizar("");
    }
  });

  function produtosOrdenados() {
    return itensVendaveis().slice().sort(function (a, b) { return nomeProduto(a).localeCompare(nomeProduto(b), "pt-BR"); });
  }

  function popularSelectProdutos() {
    ["editv-produto", "fin-consumo-produto", "edit-consumo-produto", "pend-produto"].forEach(function (id) {
      const sel = $(id);
      if (!sel) return;
      sel.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Selecione o produto...";
      sel.appendChild(opt);
      produtosOrdenados().filter(vendavel).forEach(function (p) {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = nomeProduto(p) + " (" + fmtMoeda(p.valor) + ")";
          sel.appendChild(o);
        });
    });
  }

  function atualizarHintProduto() {
    const p = produtoPorId($("select-produto-value").value);
    let txt = "Valor unitário: —";
    if (p) {
      txt = "Valor unitário: " + fmtMoeda(p.valor) + " · Categoria: " + p.categoria;
      if (p.tipo === "combo") {
        txt += " · Combo com " + (p.itensCombo || []).length + " item(ns)";
      } else if (estoqueInformado(p)) {
        const qtd = parseInt($("venda-qtd").value, 10);
        txt += " · Estoque: " + p.estoque + (qtd > 0 ? " → " + Math.max(0, p.estoque - qtd) : "");
      } else {
        txt += " · Estoque não informado";
      }
    }
    $("hint-produto").textContent = txt;
    recalcularVendaTotal();
  }

  function recalcularVendaTotal() {
    if (carrinho.length) {
      $("venda-total").textContent = fmtMoeda(totalCarrinho());
      return;
    }
    const p = produtoPorId($("select-produto-value").value);
    const qtd = parseInt($("venda-qtd").value, 10);
    const total = p && qtd > 0 ? p.valor * qtd : 0;
    $("venda-total").textContent = fmtMoeda(total);
  }

  $("venda-qtd").addEventListener("input", recalcularVendaTotal);
  function popularRecargasVendaPendente() {
    const seletor = $("venda-recarga");
    seletor.innerHTML = '<option value="">Venda avulsa</option>';
    sessoes.filter(function (sessao) { return sessao.status === "carregando"; }).forEach(function (sessao) {
      const opcao = document.createElement("option");
      opcao.value = sessao.id;
      opcao.textContent = sessao.placa + " · " + sessao.cliente + " · Bico " + sessao.bico;
      seletor.appendChild(opcao);
    });
  }

  $("venda-metodo").addEventListener("change", function () {
    const dinheiro = this.value === "Dinheiro";
    const pendente = this.value === "Pendente";
    $("campo-venda-dinheiro").style.display = dinheiro ? "flex" : "none";
    $("campo-venda-recarga").style.display = pendente ? "flex" : "none";
    if (pendente) popularRecargasVendaPendente();
    if (!dinheiro) ["venda-cedulas-recebidas", "venda-moedas-recebidas", "venda-cedulas-troco", "venda-moedas-troco"].forEach(function (id) { $(id).value = ""; });
    recalcularVendaTotal();
  });

  $("form-venda").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (carrinho.length) {
      await registrarCarrinho(this);
      return;
    }
    const p = produtoPorId($("select-produto-value").value);
    if (!p || !vendavel(p)) {
      mostrarAlerta("Selecione um produto.", "error");
      $("select-produto").setAttribute("aria-invalid", "true");
      return;
    }
    $("select-produto").setAttribute("aria-invalid", "false");
    const qtd = parseInt($("venda-qtd").value, 10);
    if (isNaN(qtd) || qtd <= 0) {
      mostrarAlerta("Informe uma quantidade válida.", "error");
      return;
    }
    let alocacoesCombo = null;
    if (comboConfiguravel(p)) {
      const escolhas = vendaComboId === p.id && vendaAlocacoesEstoque
        ? vendaAlocacoesEstoque
        : await escolherItensCombo(p);
      if (!escolhas) return;
      alocacoesCombo = escolhas.map(function (alocacao) { return Object.assign({}, alocacao, { quantidade: alocacao.quantidade * qtd }); });
    }
    await registrarItensVenda([{ p: p, qtd: qtd, alocacoesCombo: alocacoesCombo }], this);
  });

  /* ---------------- Carrinho de vendas ----------------
     Cada item vira uma venda própria. Quando há mais de um item, todas
     recebem o mesmo cobrancaId; em dinheiro, o recebimento e o troco
     entram no Caixa uma única vez, referenciando a cobrança. */
  async function registrarCarrinho(form) {
    const itens = [];
    for (const linha of carrinho) {
      const p = produtoPorId(linha.id);
      if (!p || !vendavel(p)) {
        mostrarAlerta("Um produto do carrinho não está mais disponível. Revise o carrinho.", "error");
        return;
      }
      let alocacoesCombo = null;
      if (comboConfiguravel(p)) {
        const escolhas = await escolherItensCombo(p);
        if (!escolhas) return;
        alocacoesCombo = escolhas.map(function (alocacao) { return Object.assign({}, alocacao, { quantidade: alocacao.quantidade * linha.qtd }); });
      }
      itens.push({ p: p, qtd: linha.qtd, alocacoesCombo: alocacoesCombo });
    }
    await registrarItensVenda(itens, form);
  }

  async function registrarItensVenda(itens, form) {
    for (const item of itens) {
      const erroEstoque = item.alocacoesCombo ? validarAlocacoesEstoque(item.alocacoesCombo) : validarBaixaEstoque(item.p, item.qtd);
      if (erroEstoque) {
        mostrarAlerta(erroEstoque, "error");
        $("select-produto").setAttribute("aria-invalid", "true");
        return;
      }
    }
    const metodo = $("venda-metodo").value;
    const totalVenda = arred(itens.reduce(function (soma, item) { return soma + item.p.valor * item.qtd; }, 0));
    const numerario = metodo === "Dinheiro" ? obterNumerario("venda", totalVenda) : null;
    if (numerario && numerario.erro) {
      mostrarAlerta(numerario.erro, "error");
      return;
    }
    const turnoInfo = getTurnoAtivo();
    const operador = perfilAtivoSnapshot();
    const agora = new Date().toISOString();
    const cobrancaId = itens.length > 1 ? gerarId("cb") : null;
    const sessaoVinculada = metodo === "Pendente"
      ? sessoes.find(function (sessao) { return sessao.id === $("venda-recarga").value; })
      : null;
    const idsVenda = [];
    itens.forEach(function (item, i) {
      const p = item.p;
      const qtd = item.qtd;
      const alocacoesCombo = item.alocacoesCombo;
      // Pendente só reserva; o estoque baixa quando o pagamento for confirmado.
      if (metodo !== "Pendente") {
        if (alocacoesCombo) {
          alterarAlocacoesEstoque(alocacoesCombo, -1);
          salvarESyncIncremental(KEY_PRODUTOS, produtos, "produtos");
        } else baixarEstoque(p, qtd);
      }
      const vendaId = gerarId("v");
      idsVenda.push(vendaId);
      const totalItem = p.valor * qtd;
      if (metodo === "Pendente") {
        vendasPendentes.push({
          id: "vp" + gerarId(""),
          origem: "venda",
          idAbastecimento: "",
          idSessao: sessaoVinculada ? sessaoVinculada.id : "",
          produtoId: p.id,
          produtoPaiId: p.produtoPaiId || null,
          variante: p.variante || "Padrão",
          itensCombo: p.tipo === "combo" ? p.itensCombo : null,
          alocacoesEstoque: alocacoesCombo,
          estoqueReferenciaId: vendaId,
          estoqueBaixado: false,
          placa: sessaoVinculada ? sessaoVinculada.placa : "",
          cliente: sessaoVinculada ? sessaoVinculada.cliente : "",
          produto: nomeProduto(p),
          categoria: p.categoria,
          valorUnitario: p.valor,
          quantidade: qtd,
          valorTotal: totalItem,
          turno: turnoInfo.turnoId,
          dataOperacional: turnoInfo.dataOperacional,
          inicioTurno: turnoInfo.inicioTurno,
          fimTurno: turnoInfo.fimTurno,
          operador: operador,
          perfil: operador,
          data: agora
        });
      } else {
        // Numa cobrança agrupada o numerário fica só no primeiro item, para não somar em dobro.
        const numerarioItem = i === 0 ? numerario : null;
        vendas.push({
          id: vendaId,
          cobrancaId: cobrancaId,
          produtoId: p.id,
          produtoPaiId: p.produtoPaiId || null,
          variante: p.variante || "Padrão",
          itensCombo: p.tipo === "combo" ? p.itensCombo : null,
          alocacoesEstoque: alocacoesCombo,
          estoqueReferenciaId: vendaId,
          estoqueBaixado: true,
          produto: nomeProduto(p),
          categoria: p.categoria,
          valorUnitario: p.valor,
          quantidade: qtd,
          valorTotal: totalItem,
          valorOriginal: totalItem,
          arredondamentoDinheiro: i === 0 && numerario ? numerario.arredondamento : 0,
          metodoPagamento: metodo,
          turno: turnoInfo.turnoId,
          dataOperacional: turnoInfo.dataOperacional,
          inicioTurno: turnoInfo.inicioTurno,
          fimTurno: turnoInfo.fimTurno,
          operador: operador,
          perfil: operador,
          numerario: numerarioItem,
          trocoCorreto: numerarioItem ? numerarioItem.trocoCorreto : null,
          ajusteTroco: numerarioItem ? numerarioItem.ajusteTroco : null,
          data: agora
        });
      }
    });
    if (metodo === "Pendente") {
      salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
      renderVendasPendentes();
      renderInventario();
      popularSelectProdutos();
    } else {
      salvarESyncIncremental(KEY_VENDAS, vendas);
      if (numerario) {
        const referencia = cobrancaId ? { tipo: "cobranca", id: cobrancaId } : { tipo: "venda", id: idsVenda[0] };
        const origem = itens.length > 1 ? "Venda de " + itens.length + " itens" : "Venda " + itens[0].p.nome;
        registrarNumerarioCaixa(referencia, origem, numerario, turnoInfo.turnoId, operador, agora);
      }
    }
    carrinho = [];
    renderVendas();
    renderInventario();
    if (form) form.reset();
    $("venda-qtd").value = "1";
    $("venda-total").textContent = "R$ 0,00";
    $("select-produto").value = "";
    $("select-produto-value").value = "";
    vendaAlocacoesEstoque = null;
    vendaComboId = null;
    closeProdutoCombobox();
    atualizarHintProduto();
    fecharModalVenda();
    renderCarrinho();
    const unico = itens.length === 1 ? itens[0] : null;
    mostrarAlerta(metodo === "Pendente"
      ? (unico
        ? "Consumo pendente: " + nomeProduto(unico.p) + " x" + unico.qtd + " — confirme o pagamento na aba Em Andamento."
        : itens.length + " itens ficaram pendentes. Confirme o pagamento na Operação.")
      : (unico
        ? "Venda registrada: " + nomeProduto(unico.p) + " x" + unico.qtd + " — " + fmtMoeda(unico.p.valor * unico.qtd) + " via " + metodo + "."
        : "Venda de " + itens.length + " itens registrada: " + fmtMoeda(totalVenda) + " via " + metodo + "."), "success");
  }

  function categoriaProduto(p) {
    const pai = paiDoSku(p);
    return (p.tipo === "combo" ? "Combos" : p.categoria || (pai && pai.categoria)) || "Outros";
  }

  function totalCarrinho() {
    return arred(carrinho.reduce(function (soma, linha) {
      const p = produtoPorId(linha.id);
      return soma + (p ? p.valor * linha.qtd : 0);
    }, 0));
  }

  function renderGradeProdutos() {
    const grade = $("grade-produtos");
    if (!grade) return;
    const vendaveis = produtosOrdenados().filter(function (p) { return p.ativo !== false; });
    const categorias = ["Todos"].concat(Array.from(new Set(vendaveis.filter(function (p) { return !usoInterno(p); }).map(categoriaProduto))).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); }));
    if (!categorias.includes(categoriaVenda)) categoriaVenda = "Todos";
    $("categorias-venda").innerHTML = categorias.length > 2
      ? categorias.map(function (c) { return '<button type="button" class="chip" data-categoria="' + escapeAttr(c) + '" aria-pressed="' + (c === categoriaVenda) + '">' + escapeHtml(c) + "</button>"; }).join("")
      : "";
    const termo = ($("busca-produtos-venda").value || "").toLowerCase().trim();
    // Uso interno só aparece quando a busca chega nele, e só para registrar baixa.
    const lista = vendaveis.filter(function (p) {
      if (usoInterno(p) && !termo) return false;
      return (categoriaVenda === "Todos" || categoriaProduto(p) === categoriaVenda) &&
        (!termo || (nomeProduto(p) + " " + categoriaProduto(p)).toLowerCase().includes(termo));
    });
    grade.innerHTML = lista.length
      ? lista.map(function (p) {
        const linha = carrinho.find(function (l) { return l.id === p.id; });
        const disponivel = skuDisponivel(p);
        const estoque = p.tipo === "combo" ? "Combo" : !estoqueInformado(p) ? "" : p.estoque <= 0 ? "Sem estoque" : p.estoque + " un.";
        const baixo = estoqueInformado(p) && p.estoqueMinimo != null && p.estoque <= Number(p.estoqueMinimo);
        if (usoInterno(p)) {
          return '<button type="button" class="product uso-interno" data-baixa-produto="' + escapeAttr(p.id) + '"' + (estoqueInformado(p) && p.estoque > 0 ? "" : " disabled") + ' aria-label="Registrar baixa de ' + escapeAttr(nomeProduto(p)) + '">' +
            "<strong>" + escapeHtml(nomeProduto(p)) + "</strong>" +
            '<span class="p-foot"><span class="price">Registrar baixa</span><span class="stock' + (baixo ? " low" : "") + '">' + estoque + "</span></span>" +
          "</button>";
        }
        return '<button type="button" class="product' + (linha ? " in-cart" : "") + '" data-adicionar-produto="' + escapeAttr(p.id) + '"' + (disponivel ? "" : " disabled") + ' aria-label="Adicionar ' + escapeAttr(nomeProduto(p)) + '">' +
          "<strong>" + escapeHtml(nomeProduto(p)) + "</strong>" +
          '<span class="p-foot"><span class="price">' + fmtMoeda(p.valor) + '</span><span class="stock' + (baixo ? " low" : "") + '">' + estoque + "</span></span>" +
          (linha ? '<span class="qty-badge">' + linha.qtd + "</span>" : "") +
        "</button>";
      }).join("")
      : '<div class="empty-state" style="display:block;grid-column:1/-1"><strong>Nenhum produto encontrado</strong>Ajuste a busca ou cadastre o produto em Cadastros.</div>';
  }

  function renderCarrinho() {
    const qtd = carrinho.reduce(function (soma, linha) { return soma + linha.qtd; }, 0);
    const total = totalCarrinho();
    const barra = $("carrinho-barra");
    if (barra) barra.classList.toggle("is-empty", !qtd);
    $("carrinho-resumo").textContent = qtd ? qtd + (qtd === 1 ? " item no carrinho" : " itens no carrinho") : "Carrinho vazio";
    $("carrinho-total").textContent = fmtMoeda(total);
    $("btn-cobrar").disabled = !qtd;
    const linhas = carrinho.map(function (linha) {
      const p = produtoPorId(linha.id);
      return p ? { p: p, qtd: linha.qtd } : null;
    }).filter(Boolean);
    $("carrinho-linhas").innerHTML = linhas.length
      ? linhas.map(function (l) { return "<div><span>" + l.qtd + "× " + escapeHtml(nomeProduto(l.p)) + "</span><span>" + fmtMoeda(l.p.valor * l.qtd) + "</span></div>"; }).join("")
      : '<p class="cart-empty">Toque nos produtos para montar a venda.</p>';
    $("carrinho-itens").innerHTML = linhas.map(function (l) {
      return '<div class="list-item carrinho-linha"><span class="carrinho-nome"><strong>' + escapeHtml(nomeProduto(l.p)) + "</strong>" + fmtMoeda(l.p.valor) + ' cada</span>' +
        '<span class="stepper"><button type="button" data-carrinho-delta="-1" data-id="' + escapeAttr(l.p.id) + '" aria-label="Diminuir ' + escapeAttr(nomeProduto(l.p)) + '">−</button>' +
        '<output aria-live="polite">' + l.qtd + "</output>" +
        '<button type="button" data-carrinho-delta="1" data-id="' + escapeAttr(l.p.id) + '" aria-label="Aumentar ' + escapeAttr(nomeProduto(l.p)) + '">+</button></span></div>';
    }).join("");
    if ($("modal-venda").classList.contains("show")) recalcularVendaTotal();
    renderGradeProdutos();
  }

  function alterarCarrinho(id, delta) {
    const linha = carrinho.find(function (l) { return l.id === id; });
    if (linha) linha.qtd += delta;
    else if (delta > 0) carrinho.push({ id: id, qtd: delta });
    carrinho = carrinho.filter(function (l) { return l.qtd > 0; });
    renderCarrinho();
    if (!carrinho.length) fecharModalVenda();
  }

  function fecharModalVenda() {
    $("modal-venda").classList.remove("show");
  }

  $("grade-produtos").addEventListener("click", function (e) {
    const baixa = e.target.closest("[data-baixa-produto]");
    if (baixa && !baixa.disabled) return abrirRepor(baixa.dataset.baixaProduto, "baixa");
    const b = e.target.closest("[data-adicionar-produto]");
    if (b && !b.disabled) alterarCarrinho(b.dataset.adicionarProduto, 1);
  });
  $("categorias-venda").addEventListener("click", function (e) {
    const b = e.target.closest("[data-categoria]");
    if (!b) return;
    categoriaVenda = b.dataset.categoria;
    renderGradeProdutos();
  });
  $("busca-produtos-venda").addEventListener("input", renderGradeProdutos);
  $("carrinho-itens").addEventListener("click", function (e) {
    const b = e.target.closest("[data-carrinho-delta]");
    if (b) alterarCarrinho(b.dataset.id, Number(b.dataset.carrinhoDelta));
  });
  $("btn-cobrar").addEventListener("click", function () {
    if (!carrinho.length) return;
    renderCarrinho();
    $("modal-venda").classList.add("show");
    recalcularVendaTotal();
  });
  $("modal-fechar-cobranca").addEventListener("click", fecharModalVenda);
  $("modal-venda").addEventListener("click", function (e) {
    if (e.target === this) fecharModalVenda();
  });

  // Itens cobrados juntos em dinheiro compartilham um único lançamento no Caixa.
  function vendasDaCobrancaEmDinheiro(venda) {
    if (!venda || !venda.cobrancaId || venda.metodoPagamento !== "Dinheiro") return [venda];
    return vendas.filter(function (v) { return v.cobrancaId === venda.cobrancaId && v.status !== "desfeito_para_pendente"; });
  }

  function estornarCaixaDaVenda(venda) {
    estornarNumerarioCaixa({ tipo: "venda", id: venda.id });
    if (venda.cobrancaId) estornarNumerarioCaixa({ tipo: "cobranca", id: venda.cobrancaId });
  }

  function renderVendas() {
    const termo = ($("busca-vendas").value || "").toLowerCase().trim();
    const dataDe = $("filtro-vendas-de").value;
    const dataAte = $("filtro-vendas-ate").value;
    const pagamentoFiltro = $("filtro-vendas-pagamento").value;
    const turnoFiltro = $("filtro-vendas-turno").value ? parseInt($("filtro-vendas-turno").value, 10) : null;
    const operadorFiltro = $("filtro-vendas-operador").value;
    popularSelectFiltroVendasOperador();
    if (dataDe && dataAte && dataAte < dataDe) {
      mostrarAlerta("A data final deve ser maior ou igual à data inicial.", "error");
      return;
    }
    const filtrados = vendas
      .slice()
      .sort((a, b) => new Date(b.data) - new Date(a.data))
      .filter(function (r) {
        if (r.status === "desfeito_para_pendente") return false;
        const turnoRegistro = r.turno || 1;
        const dia = r.dataOperacional || dataLocalISO(new Date(r.data));
        const operador = r.operador || r.perfil || {};
        if (turnoFiltro && turnoRegistro !== turnoFiltro) return false;
        if (pagamentoFiltro && r.metodoPagamento !== pagamentoFiltro) return false;
        if (operadorFiltro && operador.id !== operadorFiltro) return false;
        if (dataDe || dataAte) {
          if (dataDe && dia < dataDe) return false;
          if (dataAte && dia > dataAte) return false;
        }
        if (!termo) return true;
        return (
          (r.produto || "").toLowerCase().includes(termo) ||
          (r.categoria || "").toLowerCase().includes(termo) ||
          (r.metodoPagamento || "").toLowerCase().includes(termo) ||
          (operador.nome || "").toLowerCase().includes(termo)
        );
      });

    const totalValor = filtrados.reduce((s, r) => s + r.valorTotal, 0);
    const totalItens = filtrados.reduce((s, r) => s + r.quantidade, 0);
    const estoqueBaixo = produtos.filter(function (p) {
      return estoqueInformado(p) && p.estoque <= p.estoqueMinimo;
    }).length;
    $("stat-vendas-qtd").textContent = filtrados.length;
    $("stat-vendas-itens").textContent = totalItens;
    $("stat-vendas-total").textContent = fmtMoeda(totalValor);
    $("stat-vendas-baixo").textContent = estoqueBaixo;

    const container = $("lista-vendas");
    container.innerHTML = "";
    $("empty-vendas").style.display = filtrados.length === 0 ? "block" : "none";

    filtrados.forEach(function (r, i) {
      const div = document.createElement("div");
      const operador = r.operador || r.perfil || {};
      const escolhasCombo = resumoEscolhasCombo(r);
      div.className = "sales-data-row";
      div.innerHTML =
        "<div><strong>" + escapeHtml(nomeSnapshotProduto(r)) + "</strong>" +
        '<span class="sub">' + formatarData(r.data) + " · " + escapeHtml(r.categoria || "Sem categoria") + " · " + escapeHtml(operador.nome || "Sem operador") + "</span>" +
        (escolhasCombo ? '<span class="sub">Escolhas: ' + escolhasCombo + "</span>" : "") + "</div>" +
        '<div class="sales-quantity">x' + r.quantidade + "</div>" +
        '<div><strong class="sales-value">' + fmtMoeda(r.valorTotal) + "</strong>" +
        '<span class="sub">' + escapeHtml(r.metodoPagamento || "—") + " · Turno " + (r.turno || operador.turno || "—") + "</span></div>" +
        "";
      div.dataset.editarVenda = i;
      div.tabIndex = 0;
      div.setAttribute("role", "button");
      div.setAttribute("aria-label", "Editar venda de " + nomeSnapshotProduto(r) + ", " + formatarData(r.data));
      container.appendChild(div);
    });

    removerVendaPeloBotao = function (btn) {
        const idx = parseInt(btn.dataset.removerVenda, 10);
        const original = vendas.findIndex((v) => v.id === filtrados[idx].id);
        const venda = vendas[original];
        const grupo = vendasDaCobrancaEmDinheiro(venda);
        const pergunta = grupo.length > 1
          ? "Esta venda foi cobrada em dinheiro junto com mais " + (grupo.length - 1) + (grupo.length === 2 ? " item" : " itens") + ". Excluir remove a cobrança inteira e restabelece o estoque de todos. Continuar?"
          : "Excluir esta venda do registro? O estoque do produto será restabelecido.";
        if (confirm(pergunta)) {
          grupo.forEach(function (v) {
            if (v && v.estoqueBaixado && v.produtoId) {
              const prod = produtoPorId(v.produtoId);
              if (prod && estoqueInformado(prod)) reporEstoque(prod, v.quantidade);
            }
            const pos = vendas.indexOf(v);
            if (pos !== -1) vendas.splice(pos, 1);
            estornarCaixaDaVenda(v);
          });
          salvarESyncIncremental(KEY_VENDAS, vendas);
          renderVendas();
          renderInventario();
          mostrarAlerta("Venda excluída. Estoque restabelecido.", "success");
        }
    };

    desfazerVendaPeloBotao = function (btn) {
        const vendaClicada = filtrados[parseInt(btn.dataset.desfazerVenda, 10)];
        if (!vendaClicada) return;
        const grupo = vendasDaCobrancaEmDinheiro(vendaClicada);
        const pergunta = grupo.length > 1
          ? "Esta venda foi cobrada em dinheiro junto com mais " + (grupo.length - 1) + (grupo.length === 2 ? " item" : " itens") + ". Desfazer devolve a cobrança inteira aos consumos pendentes. Continuar?"
          : "Desfazer esta venda e retorná-la aos consumos pendentes?";
        if (!confirm(pergunta)) return;
        grupo.forEach(function (venda) {
        estornarCaixaDaVenda(venda);
        venda.status = "desfeito_para_pendente";
        venda.desfeitoParaPendente = { em: new Date().toISOString(), operador: perfilAtivoSnapshot(), pagamentoAnterior: { metodoPagamento: venda.metodoPagamento, numerario: venda.numerario || null } };
        vendasPendentes.push({ id: "vp" + gerarId(""), origem: "desfazer", vendaOrigemId: venda.id, idAbastecimento: venda.idAbastecimento || "", idSessao: "", produtoId: venda.produtoId, estoqueReferenciaId: venda.estoqueReferenciaId, estoqueBaixado: !!venda.estoqueBaixado, itensCombo: venda.itensCombo || null, alocacoesEstoque: venda.alocacoesEstoque || null, placa: venda.placa || "", cliente: venda.cliente || "", produto: venda.produto, categoria: venda.categoria, valorUnitario: venda.valorUnitario, quantidade: venda.quantidade, valorTotal: venda.valorOriginal != null ? venda.valorOriginal : venda.valorTotal, turno: venda.turno, dataOperacional: venda.dataOperacional, inicioTurno: venda.inicioTurno, fimTurno: venda.fimTurno, operador: venda.operador, perfil: venda.perfil, data: venda.data });
        });
        salvarESyncIncremental(KEY_VENDAS, vendas);
        salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
        renderVendas(); renderVendasPendentes(); renderInventario();
        mostrarAlerta("Venda desfeita e retornada aos consumos pendentes.", "success");
    };

    filtradosVendas = filtrados;
    renderInventario();
  }

  // Linha da venda abre a edição; Desfazer e Excluir ficam na folha de edição.
  let filtradosVendas = [];
  let removerVendaPeloBotao = function () {};
  let desfazerVendaPeloBotao = function () {};
  function acoesVendas(ev) {
    const remover = ev.target.closest("[data-remover-venda]");
    if (remover) {
      fecharEdicaoVenda();
      removerVendaPeloBotao(remover);
      return;
    }
    const desfazer = ev.target.closest("[data-desfazer-venda]");
    if (desfazer) {
      fecharEdicaoVenda();
      desfazerVendaPeloBotao(desfazer);
      return;
    }
    const editar = ev.target.closest("[data-editar-venda]");
    if (editar) {
      const idx = parseInt(editar.dataset.editarVenda, 10);
      const venda = filtradosVendas[idx];
      if (!venda) return;
      abrirEdicaoVenda(venda);
      $("btn-editv-desfazer").dataset.desfazerVenda = idx;
      $("btn-editv-excluir").dataset.removerVenda = idx;
    }
  }
  $("lista-vendas").addEventListener("click", acoesVendas);
  $("modal-venda-edicao").addEventListener("click", function (ev) {
    if (ev.target.closest(".edicao-acoes-registro")) acoesVendas(ev);
  });

  // Enter ou espaço numa linha clicável abre a edição
  ["lista-historico", "lista-vendas"].forEach(function (id) {
    $(id).addEventListener("keydown", function (e) {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"]')) {
        e.preventDefault();
        e.target.click();
      }
    });
  });

  $("busca-vendas").addEventListener("input", comDebounce(renderVendas, 200));
  $("filtro-vendas-de").addEventListener("input", renderVendas);
  $("filtro-vendas-ate").addEventListener("input", renderVendas);
  $("filtro-vendas-pagamento").addEventListener("change", renderVendas);
  $("filtro-vendas-turno").addEventListener("change", renderVendas);
  $("filtro-vendas-operador").addEventListener("change", renderVendas);

  $("btn-limpar-filtro-vendas").addEventListener("click", function () {
    $("filtro-vendas-de").value = "";
    $("filtro-vendas-ate").value = "";
    $("filtro-vendas-pagamento").value = "";
    $("filtro-vendas-turno").value = "";
    $("filtro-vendas-operador").value = "";
    renderVendas();
  });

  $("btn-limpar-vendas").addEventListener("click", function () {
    if (vendas.length === 0) {
      mostrarAlerta("Não há vendas registradas neste aparelho.", "error");
      return;
    }
    confirmarApagamento(
      "Apagar histórico de vendas",
      "Remove " + vendas.length + (vendas.length === 1 ? " venda" : " vendas") + " deste aparelho e devolve ao estoque os produtos controlados. Não dá para desfazer.",
      "Apagar vendas",
      function () {
      vendas.forEach(function (v) {
        if (v && v.estoqueBaixado && v.produtoId) {
          const prod = produtoPorId(v.produtoId);
          if (prod && estoqueInformado(prod)) reporEstoque(prod, v.quantidade);
        }
      });
      vendas = [];
      salvarESyncIncremental(KEY_VENDAS, vendas);
      renderVendas();
      renderInventario();
      mostrarAlerta("Vendas apagadas e estoque restabelecido.", "success");
      }
    );
  });

  let editandoVendaId = null;

  function fecharEdicaoVenda() {
    $("modal-venda-edicao").classList.remove("show");
    editandoVendaId = null;
  }

  $("modal-fechar-venda").addEventListener("click", fecharEdicaoVenda);
  $("btn-cancelar-venda-edicao").addEventListener("click", fecharEdicaoVenda);
  $("modal-venda-edicao").addEventListener("click", function (e) {
    if (e.target === this) fecharEdicaoVenda();
  });

  function abrirEdicaoVenda(v) {
    editandoVendaId = v.id;
    $("editv-titulo").textContent = nomeSnapshotProduto(v);
    $("editv-data").value = dataParaInput(v.data);
    $("editv-qtd").value = v.quantidade;
    $("editv-metodo").value = v.metodoPagamento || "Pix";
    trocoPixEdicao.editv = arred(movimentosDaReferencia({ tipo: "venda", id: v.id }).reduce(function (t, m) { return t + (m.tipo === "trocoPix" ? Number(m.valor) || 0 : 0); }, 0));
    ["cedulas-recebidas", "moedas-recebidas", "cedulas-troco", "moedas-troco"].forEach(function (parte) { $("editv-" + parte).value = ""; });
    popularSelectProdutos();
    const sel = $("editv-produto");
    const produtoAtual = produtoPorId(v.produtoId);
    if (!produtoAtual) {
      const o = document.createElement("option");
      o.value = "-1";
      o.textContent = "(excluído) " + nomeSnapshotProduto(v);
      sel.appendChild(o);
      sel.value = "-1";
    } else {
      if (!Array.from(sel.options).some(function (opcao) { return opcao.value === produtoAtual.id; })) {
        const o = document.createElement("option");
        o.value = produtoAtual.id;
        o.textContent = nomeProduto(produtoAtual) + " (produto histórico sem estoque)";
        sel.appendChild(o);
      }
      sel.value = produtoAtual.id;
    }
    recalcularEdicaoVenda();
    $("modal-venda-edicao").classList.add("show");
  }

  function recalcularEdicaoVenda() {
    const sel = $("editv-produto");
    const qtd = parseInt($("editv-qtd").value, 10);
    let unitario = null;
    if (sel.value === "-1" && editandoVendaId) {
      const v = vendas.find((x) => x.id === editandoVendaId);
      if (v) unitario = v.valorUnitario;
    } else if (sel.value) {
      const p = produtoPorId(sel.value);
      if (p) unitario = p.valor;
    }
    const total = unitario != null && qtd > 0 ? unitario * qtd : 0;
    $("editv-total").value = fmtMoeda(total);
  }

  $("editv-produto").addEventListener("change", recalcularEdicaoVenda);
  $("editv-qtd").addEventListener("input", recalcularEdicaoVenda);
  $("editv-metodo").addEventListener("change", function () {
    recalcularEdicaoVenda();
  });

  function atualizarConsumoEspelhoVenda(venda) {
    const abastecimento = abastecimentos.find(function (item) { return item.id === venda.idAbastecimento; });
    if (!abastecimento) return;
    const itens = Array.isArray(abastecimento.consumoProdutos) ? abastecimento.consumoProdutos : [];
    const indice = itens.findIndex(function (item) {
      return item.estoqueReferenciaId && item.estoqueReferenciaId === venda.estoqueReferenciaId;
    });
    if (indice === -1) return;
    const item = itens[indice];
    Object.assign(item, {
      id: venda.produtoId,
      produtoPaiId: venda.produtoPaiId || null,
      variante: venda.variante || "Padrão",
      itensCombo: venda.itensCombo || null,
      alocacoesEstoque: venda.alocacoesEstoque || null,
      nome: venda.produto,
      categoria: venda.categoria,
      valorUnitario: venda.valorUnitario,
      quantidade: venda.quantidade,
      valorTotal: venda.valorUnitario * venda.quantidade
    });
    abastecimento.consumoProdutos = itens;
    abastecimento.consumoProduto = itens[0] || null;
    abastecimento.consumoQuantidade = itens.reduce(function (total, consumo) { return total + consumo.quantidade; }, 0);
    abastecimento.valorConsumo = itens.reduce(function (total, consumo) { return total + consumo.valorTotal; }, 0);
    abastecimento.consumoValorTotal = abastecimento.valorConsumo;
    abastecimento.totalComConsumo = (abastecimento.valorPagar || 0) + abastecimento.valorConsumo;
  }

  $("form-venda-edicao").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!editandoVendaId) return;
    const idx = vendas.findIndex((v) => v.id === editandoVendaId);
    if (idx === -1) {
      fecharEdicaoVenda();
      return;
    }
    const grupoCobranca = vendasDaCobrancaEmDinheiro(vendas[idx]);
    if (grupoCobranca.length > 1 && $("editv-metodo").value !== "Dinheiro") {
      mostrarAlerta("Esta venda foi cobrada em dinheiro junto com outros itens. Para trocar o pagamento, desfaça a venda e cobre de novo.", "error");
      return;
    }
    const dataValor = new Date($("editv-data").value);
    if (isNaN(dataValor.getTime())) {
      mostrarAlerta("Data/hora inválida.", "error");
      return;
    }
    const qtd = parseInt($("editv-qtd").value, 10);
    if (isNaN(qtd) || qtd <= 0) {
      mostrarAlerta("Informe uma quantidade válida.", "error");
      return;
    }
    const selVal = $("editv-produto").value;
    if (!selVal) {
      mostrarAlerta("Selecione um produto.", "error");
      return;
    }
    let produto, categoria, valorUnitario, novoProdutoId, produtoSelecionado = null;
    let novasAlocacoes = vendas[idx].alocacoesEstoque || null;
    let novosItensCombo = vendas[idx].itensCombo || null;
    if (selVal === "-1") {
      produto = nomeSnapshotProduto(vendas[idx]);
      categoria = vendas[idx].categoria;
      valorUnitario = vendas[idx].valorUnitario;
      novoProdutoId = vendas[idx].produtoId || null;
    } else {
      const p = produtoPorId(selVal);
      if (!p) {
        mostrarAlerta("Selecione um produto.", "error");
        return;
      }
      produto = nomeProduto(p);
      categoria = p.categoria;
      valorUnitario = p.valor;
      novoProdutoId = p.id;
      produtoSelecionado = p;
      novosItensCombo = p.tipo === "combo" ? p.itensCombo || null : null;
      novasAlocacoes = null;
      if (comboConfiguravel(p)) {
        if (p.id === vendas[idx].produtoId && vendas[idx].alocacoesEstoque && qtd === vendas[idx].quantidade) {
          novasAlocacoes = vendas[idx].alocacoesEstoque;
        } else {
          const escolhas = await escolherItensCombo(p);
          if (!escolhas) return;
          novasAlocacoes = escolhas.map(function (alocacao) { return Object.assign({}, alocacao, { quantidade: alocacao.quantidade * qtd }); });
        }
      }
    }
    if (selVal !== "-1") {
      const res = reconciliarEstoqueItens(
        [{ id: vendas[idx].produtoId, quantidade: vendas[idx].quantidade, alocacoesEstoque: vendas[idx].alocacoesEstoque || null }],
        [{ id: novoProdutoId, quantidade: qtd, alocacoesEstoque: novasAlocacoes }]
      );
      if (res.erro) {
        mostrarAlerta(res.erro, "error");
        return;
      }
    }
    const metodoEditado = $("editv-metodo").value;
    const totalOriginal = valorUnitario * qtd;
    const totalEditado = totalOriginal;
    let numerarioEditado = null;
    // Em cobrança agrupada o dinheiro já está no Caixa como um lançamento único: não mexe nele.
    const manterNumerario = grupoCobranca.length > 1;
    if (metodoEditado === "Dinheiro" && !manterNumerario) {
      numerarioEditado = obterNumerario("editv", totalEditado);
      if (numerarioEditado.erro) { mostrarAlerta(numerarioEditado.erro, "error"); return; }
    }
    if (!manterNumerario) estornarNumerarioCaixa({ tipo: "venda", id: vendas[idx].id });
    vendas[idx].data = dataValor.toISOString();
    vendas[idx].produto = produto;
    vendas[idx].categoria = categoria;
    vendas[idx].valorUnitario = valorUnitario;
    vendas[idx].quantidade = qtd;
    vendas[idx].valorTotal = totalEditado;
    vendas[idx].valorOriginal = totalOriginal;
    vendas[idx].arredondamentoDinheiro = arred(totalEditado - totalOriginal);
    vendas[idx].metodoPagamento = metodoEditado;
    if (!manterNumerario) vendas[idx].numerario = numerarioEditado;
    vendas[idx].produtoId = novoProdutoId || null;
    vendas[idx].produtoPaiId = produtoSelecionado ? produtoSelecionado.produtoPaiId || null : vendas[idx].produtoPaiId || null;
    vendas[idx].variante = produtoSelecionado ? produtoSelecionado.variante || "Padrão" : vendas[idx].variante || "Padrão";
    vendas[idx].itensCombo = novosItensCombo;
    vendas[idx].alocacoesEstoque = novasAlocacoes;
    if (novoProdutoId) {
      vendas[idx].estoqueReferenciaId = vendas[idx].estoqueReferenciaId || vendas[idx].id;
      vendas[idx].estoqueBaixado = true;
    }

    atualizarConsumoEspelhoVenda(vendas[idx]);
    salvarESyncIncremental(KEY_VENDAS, vendas);
    salvarESyncIncremental(KEY_ABASTECIMENTOS, abastecimentos);
    if (numerarioEditado) registrarNumerarioCaixa({ tipo: "venda", id: vendas[idx].id }, "Venda " + produto, numerarioEditado, vendas[idx].turno, vendas[idx].operador || vendas[idx].perfil, vendas[idx].data);
    fecharEdicaoVenda();
    renderVendas();
    renderInventario();
    mostrarAlerta("Venda atualizada com sucesso!", "success");
  });

  function compartilharRelatorioVendasWhatsApp() {
    const turnoFiltro = $("filtro-vendas-turno").value ? parseInt($("filtro-vendas-turno").value, 10) : null;
    const periodo = obterPeriodoRelatorio("filtro-vendas-de", "filtro-vendas-ate", "data-relatorio-vendas");
    if (!periodo) return;
    const registros = filtrarPorPeriodoTurno(vendas, periodo.dataDe, periodo.dataAte, turnoFiltro);
    if (registros.length === 0) {
      mostrarAlerta("Nenhuma venda registrada no período selecionado.", "error");
      return;
    }
    const totalItens = registros.reduce((s, r) => s + r.quantidade, 0);
    const totalValor = registros.reduce((s, r) => s + r.valorTotal, 0);
    const turnoTxt = turnoFiltro ? " | Turno " + turnoFiltro : "";
    const msg = montarRelatorioWhatsApp({
      titulo: "*" + nomePosto() + "* - 🛒 Relatório de Vendas",
      descricaoData: periodo.descricaoData + turnoTxt,
      registros: registros,
      linhaPorItem: function (r, i, linhas) {
        linhas.push("Produto: " + (r.produto || "—"));
        linhas.push("Categoria: " + (r.categoria || "—"));
        linhas.push("Qtd: " + r.quantidade);
        linhas.push("Valor: " + fmtMoeda(r.valorTotal));
        linhas.push("Método de Pagamento: " + (r.metodoPagamento || "—"));
      },
      resumo: function (linhas) {
        linhas.push("Total: " + totalItens + " item(ns) — " + fmtMoeda(totalValor));
        adicionarResumoPagamentos(linhas, registros, function (venda) { return venda.valorTotal; });
      }
    });
    abrirWhatsApp(msg);
  }

  $("btn-compartilhar-vendas").addEventListener("click", compartilharRelatorioVendasWhatsApp);

  /* ---------------- Pré-registros de consumo (vendas pendentes) ---------------- */
  let registrandoPendId = null;

  function renderVendasPendentes() {
    const pendentes = vendasPendentes.slice().sort((a, b) => new Date(a.data) - new Date(b.data));
    $("qtd-vendas-pendentes").textContent = pendentes.length + (pendentes.length === 1 ? " aguardando" : " aguardando");
    $("aviso-sem-pendentes").style.display = pendentes.length === 0 ? "block" : "none";
    const container = $("lista-vendas-pendentes");
    container.innerHTML = "";
    pendentes.forEach(function (vp, i) {
      const ab = abastecimentos.find((a) => a.id === vp.idAbastecimento);
      const vinculo = vp.cliente || vp.placa
        ? escapeHtml(vp.cliente || "—") + (vp.placa ? " · " + escapeHtml(vp.placa) : "")
        : "Venda avulsa";
      const div = document.createElement("div");
      div.className = "list-item pend-item";
      div.dataset.kind = "consumo";
      div.innerHTML =
        '<span class="pend-type">' + (vp.origem === "venda" ? "Venda a confirmar" : "Consumo para registrar") + "<time>" + formatarData(vp.data) + "</time></span>" +
        '<span class="pend-main">' + (vp.placa ? placaHtml(vp.placa) : "") +
          '<span class="pend-who"><strong>' + escapeHtml(nomeSnapshotProduto(vp)) + " ×" + vp.quantidade + "</strong>" + vinculo +
            (ab ? " · recarga " + fmtMoeda(ab.valorPagar) : "") + "</span>" +
          '<span class="pend-amount">' + fmtMoeda(vp.valorTotal) + "</span>" +
        "</span>" +
        '<span class="pend-actions">' +
          '<button class="btn btn-outline" data-descartar-pend="' + i + '">Descartar</button>' +
          '<button class="btn btn-primary" data-registrar-pend="' + i + '">' + (vp.origem === "venda" ? "Confirmar pagamento" : "Registrar venda") + "</button>" +
        "</span>";
      container.appendChild(div);
    });
    container.querySelectorAll("[data-registrar-pend]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        abrirRegistroPendente(parseInt(btn.dataset.registrarPend, 10));
      });
    });
    container.querySelectorAll("[data-descartar-pend]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const pendentes2 = vendasPendentes.slice().sort((a, b) => new Date(a.data) - new Date(b.data));
        const vp = pendentes2[parseInt(btn.dataset.descartarPend, 10)];
        const original = vendasPendentes.findIndex((x) => x.id === vp.id);
        if (confirm("Descartar o pré-registro de " + nomeSnapshotProduto(vp) + " x" + vp.quantidade + "? " + avisoDescartePendente(vp))) {
          if (vp && vp.estoqueBaixado && vp.produtoId) {
            const prod = produtoPorId(vp.produtoId);
            if (prod && estoqueInformado(prod)) reporEstoque(prod, vp.quantidade);
          }
          vendasPendentes.splice(original, 1);
          salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
          renderVendasPendentes();
          renderInventario();
          popularSelectProdutos();
          mostrarAlerta(vp.estoqueBaixado ? "Pré-registro descartado e estoque restabelecido." : "Pré-registro descartado e reserva liberada.", "success");
        }
      });
    });
  }

  function avisoDescartePendente(vp) {
    return vp.estoqueBaixado ? "O estoque será restabelecido." : "A reserva será liberada.";
  }

  function fecharRegistroPendente() {
    $("modal-venda-pendente").classList.remove("show");
    registrandoPendId = null;
    reservasIgnoradas = [];
  }

  $("modal-fechar-pend").addEventListener("click", fecharRegistroPendente);
  $("btn-cancelar-pend").addEventListener("click", fecharRegistroPendente);
  $("modal-venda-pendente").addEventListener("click", function (e) {
    if (e.target === this) fecharRegistroPendente();
  });

  $("btn-descartar-pend").addEventListener("click", function () {
    if (!registrandoPendId) return;
    const pendIdx = vendasPendentes.findIndex((x) => x.id === registrandoPendId);
    if (pendIdx === -1) return;
    const vp = vendasPendentes[pendIdx];
    if (confirm("Descartar o pré-registro de " + nomeSnapshotProduto(vp) + " x" + vp.quantidade + "? " + avisoDescartePendente(vp))) {
      if (vp && vp.estoqueBaixado && vp.produtoId) {
        const prod = produtoPorId(vp.produtoId);
        if (prod && estoqueInformado(prod)) reporEstoque(prod, vp.quantidade);
      }
      vendasPendentes.splice(pendIdx, 1);
      salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
      fecharRegistroPendente();
      renderVendasPendentes();
      renderInventario();
      popularSelectProdutos();
      mostrarAlerta(vp.estoqueBaixado ? "Pré-registro descartado e estoque restabelecido." : "Pré-registro descartado e reserva liberada.", "success");
    }
  });

  function abrirRegistroPendente(i) {
    const pendentes = vendasPendentes.slice().sort((a, b) => new Date(a.data) - new Date(b.data));
    const vp = pendentes[i];
    if (!vp) return;
    registrandoPendId = vp.id;
    reservasIgnoradas = [vp.id];
    $("pend-titulo").textContent = vp.quantidade + "× " + nomeSnapshotProduto(vp);
    popularSelectProdutos();
    const sel = $("pend-produto");
    const produtoPendente = produtoPorId(vp.produtoId);
    // Pendentes antigos já baixaram o estoque: com a última unidade, o produto não
    // está mais à venda, mas a pendente continua podendo ser confirmada com ele.
    if (produtoPendente && !Array.from(sel.options).some(function (o) { return o.value === produtoPendente.id; })) {
      const o = document.createElement("option");
      o.value = produtoPendente.id;
      o.textContent = nomeProduto(produtoPendente) + " (" + fmtMoeda(produtoPendente.valor) + ")";
      sel.appendChild(o);
    }
    if (!produtoPendente) {
      const o = document.createElement("option");
      o.value = "-1";
      o.textContent = "(excluído) " + nomeSnapshotProduto(vp);
      sel.appendChild(o);
      sel.value = "-1";
    } else {
      sel.value = produtoPendente.id;
    }
    $("pend-qtd").value = vp.quantidade;
    $("pend-metodo").value = "Pix";
    $("campo-pend-dinheiro").style.display = "none";
    ["pend-cedulas-recebidas", "pend-moedas-recebidas", "pend-cedulas-troco", "pend-moedas-troco"].forEach(function (id) { $(id).value = ""; });
    atualizarResumoPendente();
    $("modal-venda-pendente").classList.add("show");
  }

  function atualizarResumoPendente() {
    const vp = vendasPendentes.find((x) => x.id === registrandoPendId);
    if (!vp) return;
    let unitario = null;
    const v = $("pend-produto").value;
    if (v === "-1") {
      unitario = vp.valorUnitario;
    } else if (v) {
      const p = produtoPorId(v);
      if (p) unitario = p.valor;
    }
    const qtd = parseInt($("pend-qtd").value, 10);
    const consumo = unitario != null && qtd > 0 ? unitario * qtd : 0;
    $("pend-total").value = consumo > 0 ? fmtMoeda(consumo) : "R$ 0,00";
    const ab = abastecimentos.find((a) => a.id === vp.idAbastecimento);
    const recarga = ab ? ab.valorPagar : null;
    const vinculo = vp.cliente || vp.placa
      ? ". " + [vp.cliente, vp.placa].filter(Boolean).join(", ") + "."
      : ". Venda avulsa.";
    $("pend-resumo").textContent =
      (recarga != null
        ? "Recarga " + fmtMoeda(recarga) + ", consumo " + fmtMoeda(consumo) + ", total " + fmtMoeda(recarga + consumo)
        : "Consumo de " + fmtMoeda(consumo)) +
      vinculo;
  }

  $("pend-produto").addEventListener("change", atualizarResumoPendente);
  $("pend-qtd").addEventListener("input", atualizarResumoPendente);
  $("pend-metodo").addEventListener("change", function () {
    const dinheiro = this.value === "Dinheiro";
    $("campo-pend-dinheiro").style.display = dinheiro ? "flex" : "none";
    if (!dinheiro) ["pend-cedulas-recebidas", "pend-moedas-recebidas", "pend-cedulas-troco", "pend-moedas-troco"].forEach(function (id) { $(id).value = ""; });
  });

  $("form-venda-pendente").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!registrandoPendId) return;
    const pendIdx = vendasPendentes.findIndex((x) => x.id === registrandoPendId);
    if (pendIdx === -1) {
      fecharRegistroPendente();
      return;
    }
    const vp = vendasPendentes[pendIdx];
    const selVal = $("pend-produto").value;
    const qtd = parseInt($("pend-qtd").value, 10);
    if (!selVal) {
      mostrarAlerta("Selecione um produto.", "error");
      return;
    }
    if (isNaN(qtd) || qtd <= 0) {
      mostrarAlerta("Informe uma quantidade válida.", "error");
      return;
    }
    let produto, categoria, valorUnitario, novoProdutoId;
    if (selVal === "-1") {
      produto = nomeSnapshotProduto(vp);
      categoria = vp.categoria;
      valorUnitario = vp.valorUnitario;
      novoProdutoId = vp.produtoId || null;
} else {
      const p = produtoPorId(selVal);
      if (!p) {
        mostrarAlerta("Selecione um produto.", "error");
        return;
      }
      produto = nomeProduto(p);
      categoria = p.categoria;
      valorUnitario = p.valor;
      novoProdutoId = p.id;
    }
    const alocAntiga = (vp.estoqueBaixado && vp.produtoId)
      ? { produtoId: vp.produtoId, quantidade: vp.quantidade }
      : null;
    // Combo montado na pendente: confirma com os mesmos itens escolhidos.
    const mesmasEscolhas = selVal === vp.produtoId && qtd === vp.quantidade && Array.isArray(vp.alocacoesEstoque) && vp.alocacoesEstoque.length;
    reservasIgnoradas = [vp.id];
    if (mesmasEscolhas) {
      if (!vp.estoqueBaixado) {
        const erro = validarAlocacoesEstoque(vp.alocacoesEstoque);
        if (erro) {
          mostrarAlerta(erro, "error");
          return;
        }
        alterarAlocacoesEstoque(vp.alocacoesEstoque, -1);
        salvarESyncIncremental(KEY_PRODUTOS, produtos, "produtos");
      }
    } else if (selVal !== "-1" && novoProdutoId) {
      const res = reconciliarEstoque(alocAntiga, { produtoId: novoProdutoId, quantidade: qtd });
      if (res.erro) {
        mostrarAlerta(res.erro, "error");
        return;
      }
    }
    const metodo = $("pend-metodo").value;
    const totalOriginal = valorUnitario * qtd;
    const totalVenda = totalOriginal;
    const numerario = metodo === "Dinheiro" ? obterNumerario("pend", totalVenda) : null;
    if (numerario && numerario.erro) {
      mostrarAlerta(numerario.erro, "error");
      return;
    }
    const vendaId = gerarId("v");
    const escolhasCombo = selVal === "-1" || mesmasEscolhas ? vp.alocacoesEstoque || null : null;
    const itensCombo = selVal === "-1" || mesmasEscolhas ? vp.itensCombo || null : null;
    vendas.push({
      id: vendaId,
      idAbastecimento: vp.idAbastecimento,
      produtoId: novoProdutoId || null,
      estoqueReferenciaId: novoProdutoId ? (vp.estoqueReferenciaId || vendaId) : null,
      estoqueBaixado: !!novoProdutoId,
      itensCombo: itensCombo,
      alocacoesEstoque: escolhasCombo,
      produto: produto,
      categoria: categoria,
      valorUnitario: valorUnitario,
      quantidade: qtd,
      valorTotal: totalVenda,
      valorOriginal: totalOriginal,
      arredondamentoDinheiro: numerario ? numerario.arredondamento : 0,
      metodoPagamento: metodo,
      numerario: numerario,
      trocoCorreto: numerario ? numerario.trocoCorreto : null,
      ajusteTroco: numerario ? numerario.ajusteTroco : null,
      turno: vp.turno || 1,
      dataOperacional: vp.dataOperacional || dataLocalISO(new Date(vp.data)),
      inicioTurno: vp.inicioTurno || null,
      fimTurno: vp.fimTurno || null,
      operador: vp.operador || vp.perfil || (abastecimentos.find((a) => a.id === vp.idAbastecimento) || {}).operador || null,
      perfil: vp.perfil || vp.operador || (abastecimentos.find((a) => a.id === vp.idAbastecimento) || {}).perfil || null,
      data: vp.data
    });

    salvarESyncIncremental(KEY_VENDAS, vendas);
    if (numerario) registrarNumerarioCaixa({ tipo: "venda", id: vendaId }, "Venda " + produto, numerario, vp.turno, vp.operador || vp.perfil, new Date().toISOString());
    vendasPendentes.splice(pendIdx, 1);
    salvarESyncIncremental(KEY_VENDAS_PENDENTES, vendasPendentes);
    if (novoProdutoId) {
      const ab = abastecimentos.find((a) => a.id === vp.idAbastecimento);
      if (ab) {
        const consumo = {
          id: novoProdutoId,
          nome: produto,
          categoria: categoria,
          valorUnitario: valorUnitario,
          quantidade: qtd,
          estoqueBaixado: true,
          estoqueReferenciaId: vp.estoqueReferenciaId || vendaId,
          itensCombo: itensCombo,
          alocacoesEstoque: escolhasCombo
        };
        const consumos = Array.isArray(ab.consumoProdutos) ? ab.consumoProdutos.slice() : [];
        const indiceConsumo = consumos.findIndex(function (item) {
          return item.estoqueReferenciaId === consumo.estoqueReferenciaId;
        });
        if (indiceConsumo >= 0) consumos[indiceConsumo] = consumo;
        else consumos.push(consumo);
        ab.consumoProdutos = consumos;
        ab.consumoProduto = consumo;
        salvarESyncIncremental(KEY_ABASTECIMENTOS, abastecimentos);
      }
    }
    fecharRegistroPendente();
    renderVendas();
    renderVendasPendentes();
    renderInventario();
    mostrarAlerta("Venda registrada: " + produto + " x" + qtd + " — " + fmtMoeda(valorUnitario * qtd) + " via " + metodo + ".", "success");
  });

  /* ---------------- Init ---------------- */
  $("data-relatorio").value = dataLocalISO(new Date());
  $("data-relatorio-vendas").value = dataLocalISO(new Date());
  aplicarTema();
  aplicarMarca();
  renderClientes();
  popularSelectPlacas();
  renderModelos();
  popularSelectModelos();
  popularSelectModelosEdit("");
  renderSessoes();
  renderPendentes();
  popularBicosFormulario();
  renderStatusBicos();
  atualizarModoFormulario();
  atualizarPreviewWhatsApp();
  preencherConfig();
  renderProdutos();
  if (!$("combo-grupos").children.length) $("combo-grupos").appendChild(criarGrupoCombo());
  popularSelectProdutos();
  renderVendas();
  renderVendasPendentes();
  renderInventario();
  renderPerfis();
  popularSelectPerfilAtivo();
  aplicarPermissoes();
  setTimeout(abrirSelecaoPerfilTurno, 0);
  setInterval(abrirSelecaoPerfilTurno, 15000);
  popularSelectFiltroPerfil();
  migrarIdsSync();

  /* ---------------- Selects de pagamento como chips ----------------
     O <select> segue sendo a fonte da verdade (validação, lógica e testes);
     os chips só espelham as opções e disparam "change" nele. */
  function sincronizarChips(sel) {
    const grupo = sel.nextElementSibling;
    if (!grupo || !grupo.classList.contains("chip-select")) return;
    const incluirVazio = sel.dataset.chipsTodos === "1";
    const opcoes = Array.from(sel.options).filter(function (o) { return (o.value || incluirVazio) && !o.hidden; });
    const assinatura = opcoes.map(function (o) { return o.value + ":" + o.textContent; }).join("|");
    if (grupo.dataset.assinatura !== assinatura) {
      grupo.dataset.assinatura = assinatura;
      grupo.innerHTML = "";
      opcoes.forEach(function (o) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip-option";
        b.setAttribute("role", "radio");
        b.dataset.value = o.value;
        // "Bico 1 · 40 kW · ocupado" vira título + detalhe; "Todos os turnos" vira "Todos"
        const partes = (o.value ? o.textContent : "Todos").split(" · ");
        b.textContent = partes[0];
        if (partes.length > 1) {
          const detalhe = document.createElement("small");
          detalhe.textContent = partes.slice(1).join(", ");
          b.appendChild(detalhe);
        }
        grupo.appendChild(b);
      });
    }
    Array.from(grupo.children).forEach(function (b, i) {
      const marcado = b.dataset.value === sel.value;
      b.setAttribute("aria-checked", String(marcado));
      b.tabIndex = marcado || (!sel.value && i === 0) ? 0 : -1;
      b.disabled = sel.disabled || opcoes[i].disabled;
    });
  }

  function aprimorarSelectEmChips(sel) {
    if (sel.dataset.chipsPronto) return;
    sel.dataset.chipsPronto = "1";
    sel.classList.add("chip-source");
    const grupo = document.createElement("div");
    grupo.className = "chip-select";
    grupo.setAttribute("role", "radiogroup");
    const seletorRotulo = 'label[for="' + sel.id + '"]';
    const rotulo = sel.id && ((sel.parentElement && sel.parentElement.querySelector(seletorRotulo)) || document.querySelector(seletorRotulo));
    if (rotulo) {
      if (!rotulo.id) rotulo.id = sel.id + "-rotulo";
      grupo.setAttribute("aria-labelledby", rotulo.id);
    }
    sel.after(grupo);
    grupo.addEventListener("click", function (e) {
      const b = e.target.closest(".chip-option");
      if (!b || b.disabled) return;
      sel.value = b.dataset.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      sincronizarChips(sel);
    });
    grupo.addEventListener("keydown", function (e) {
      if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
      const botoes = Array.from(grupo.children);
      const i = botoes.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const prox = botoes[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : botoes.length - 1)) % botoes.length];
      prox.focus();
      prox.click();
    });
    sel.addEventListener("change", function () { sincronizarChips(sel); });
    sincronizarChips(sel);
  }

  document.querySelectorAll("[data-segmented]").forEach(function (grupo) {
    const abas = Array.from(grupo.querySelectorAll('[role="tab"]'));
    const ativar = function (aba) {
      abas.forEach(function (a) {
        const ativa = a === aba;
        a.setAttribute("aria-selected", String(ativa));
        a.tabIndex = ativa ? 0 : -1;
        const painel = $(a.getAttribute("aria-controls"));
        if (painel) painel.hidden = !ativa;
      });
    };
    grupo.addEventListener("click", function (e) {
      const aba = e.target.closest('[role="tab"]');
      if (aba) ativar(aba);
    });
    grupo.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const i = abas.indexOf(document.activeElement);
      if (i < 0) return;
      const prox = abas[(i + (e.key === "ArrowRight" ? 1 : abas.length - 1)) % abas.length];
      prox.focus();
      ativar(prox);
    });
    ativar(abas.find(function (a) { return a.getAttribute("aria-selected") === "true"; }) || abas[0]);
  });

  renderCarrinho();

  // Dois campos lado a lado só com "R$ 0,00" não dizem qual é qual: cada um ganha o rótulo.
  document.querySelectorAll(".cash-breakdown input").forEach(function (campo) {
    const especie = /cedulas/.test(campo.id) ? "Cédulas" : /moedas/.test(campo.id) ? "Moedas" : "";
    if (!especie || campo.parentElement.classList.contains("cash-parte")) return;
    const rotulo = document.createElement("label");
    rotulo.className = "cash-parte";
    rotulo.innerHTML = '<span class="cash-parte-nome">' + especie + "</span>";
    campo.parentElement.insertBefore(rotulo, campo);
    rotulo.appendChild(campo);
  });

  const SELECTS_EM_CHIPS = ["fechamento-turno", "edit-turno", "editpf-turno", "bico-utilizado", "fin-metodo", "pag-metodo", "pend-metodo", "edit-metodo", "editv-metodo", "venda-metodo"];
  SELECTS_EM_CHIPS.forEach(function (id) { if ($(id)) aprimorarSelectEmChips($(id)); });

  // O app altera esses selects por código ao abrir os modais; ressincroniza ao exibir.
  const observadorModais = new MutationObserver(function () {
    SELECTS_EM_CHIPS.forEach(function (id) { if ($(id)) sincronizarChips($(id)); });
  });
  document.querySelectorAll(".modal-overlay").forEach(function (m) {
    observadorModais.observe(m, { attributes: true, attributeFilter: ["class"] });
  });

  /* ---------------- Folhas Iniciar e Finalizar (apresentação) ----------------
     Os campos originais continuam sendo a fonte da verdade; aqui só mudamos a forma. */
  function radioComoInterruptor(nome, rotulo) {
    const sim = document.querySelector('input[name="' + nome + '"][value="Sim"]');
    const nao = document.querySelector('input[name="' + nome + '"][value="Não"]');
    if (!sim || !nao) return function () {};
    const grupo = sim.closest(".radio-group");
    const campo = grupo.closest(".field");
    const rotuloAntigo = campo.querySelector(":scope > label");
    grupo.hidden = true;
    if (rotuloAntigo) rotuloAntigo.hidden = true;
    const linha = document.createElement("div");
    linha.className = "toggle-row";
    linha.innerHTML = '<span id="sw-' + nome + '-rotulo">' + rotulo + '</span>' +
      '<button type="button" class="switch" role="switch" aria-checked="false" aria-labelledby="sw-' + nome + '-rotulo"></button>';
    campo.insertBefore(linha, grupo);
    const botao = linha.querySelector(".switch");
    const sincronizar = function () { botao.setAttribute("aria-checked", String(sim.checked)); };
    botao.addEventListener("click", function () {
      const alvo = sim.checked ? nao : sim;
      alvo.checked = true;
      alvo.dispatchEvent(new Event("change", { bubbles: true }));
      sincronizar();
    });
    [sim, nao].forEach(function (r) { r.addEventListener("change", sincronizar); });
    return sincronizar;
  }

  function envolverComStepper(input, passo) {
    const caixa = document.createElement("div");
    caixa.className = "stepper stepper-campo";
    input.parentNode.insertBefore(caixa, input);
    const menos = document.createElement("button");
    menos.type = "button";
    menos.textContent = "−";
    menos.setAttribute("aria-label", "Diminuir");
    const mais = document.createElement("button");
    mais.type = "button";
    mais.textContent = "+";
    mais.setAttribute("aria-label", "Aumentar");
    caixa.appendChild(menos);
    caixa.appendChild(input);
    caixa.appendChild(mais);
    const mudar = function (delta) {
      const atual = parseInt(input.value, 10);
      const base = isNaN(atual) ? (delta > 0 ? 0 : 100) : atual;
      input.value = Math.max(0, Math.min(100, base + delta));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    menos.addEventListener("click", function () { mudar(-passo); });
    mais.addEventListener("click", function () { mudar(passo); });
  }

  // ----- Iniciar recarga -----
  const campoPlaca = $("select-placa").closest(".field");
  const cartaoVeiculo = document.createElement("div");
  cartaoVeiculo.className = "vehicle";
  cartaoVeiculo.id = "ini-veiculo";
  cartaoVeiculo.hidden = true;
  campoPlaca.after(cartaoVeiculo);
  ["bateria-inicial", "bateria-alvo"].forEach(function (id) {
    envolverComStepper($(id), 5);
    $(id).placeholder = "—";
  });

  const campoTempo = $("tempo-estimado").closest(".field");
  const cartaoTempo = document.createElement("div");
  cartaoTempo.className = "calc";
  cartaoTempo.id = "ini-tempo-card";
  campoTempo.before(cartaoTempo);
  let tempoManual = false;

  const campoParada = $("valor-parada").closest(".field");
  const linhaParada = document.createElement("div");
  linhaParada.className = "toggle-row";
  linhaParada.innerHTML = '<span id="sw-parada-rotulo">Parar num valor em reais</span><button type="button" class="switch" role="switch" aria-checked="false" aria-labelledby="sw-parada-rotulo" id="sw-parada"></button>';
  campoParada.before(linhaParada);
  campoParada.hidden = true;
  $("sw-parada").addEventListener("click", function () {
    const ligar = this.getAttribute("aria-checked") !== "true";
    this.setAttribute("aria-checked", String(ligar));
    campoParada.hidden = !ligar;
    if (ligar) $("valor-parada").focus();
    else $("valor-parada").value = "";
  });

  function atualizarFolhaIniciar() {
    const placa = $("select-placa-value").value;
    const cliente = placa ? clientes.find(function (c) { return placaNormalizada(c.placa) === placaNormalizada(placa); }) : null;
    if (placa) {
      cartaoVeiculo.innerHTML = placaHtml(placa, true) +
        "<div><strong>" + escapeHtml(cliente ? cliente.nome : $("auto-nome").value || "Cliente") + "</strong><span>" + escapeHtml(cliente ? cliente.modelo : $("auto-modelo").value || "") + "</span></div>" +
        '<button type="button" class="btn btn-quiet" id="ini-trocar-veiculo">Trocar</button>';
      cartaoVeiculo.hidden = false;
      campoPlaca.hidden = true;
      cartaoVeiculo.classList.toggle("placa-nova", !!placaNova);
      $("ini-trocar-veiculo").addEventListener("click", function () {
        descartarPlacaNova();
        $("select-placa").value = "";
        $("select-placa-value").value = "";
        $("auto-nome").value = "";
        $("auto-modelo").value = "";
        atualizarModoFormulario();
        $("select-placa").focus();
      });
    } else {
      cartaoVeiculo.hidden = true;
      campoPlaca.hidden = false;
    }
    if ($("sw-parada").getAttribute("aria-checked") !== "true" && !$("valor-parada").value) campoParada.hidden = true;
    if (!$("valor-parada").value && !$("tempo-estimado").value) tempoManual = false;
    atualizarCartaoTempo();
  }

  function atualizarCartaoTempo() {
    const ini = parseInt($("bateria-inicial").value, 10);
    const alvo = parseInt($("bateria-alvo").value, 10);
    const modeloNome = $("auto-modelo").value;
    const tempo = parseInt($("tempo-estimado").value, 10);
    const modelo = modelos.find(function (m) { return m.modelo === modeloNome; });
    let titulo = "—";
    let detalhe = "Escolha o veículo e a bateria para calcular.";
    let precisaDigitar = false;
    if (!isNaN(ini) && !isNaN(alvo) && alvo <= ini) {
      detalhe = "A carga final precisa ser maior que a atual.";
    } else if (!isNaN(tempo) && tempo > 0) {
      titulo = tempo + " min";
      const kwh = modelo && !isNaN(ini) && !isNaN(alvo) ? ((alvo - ini) / 100) * (Number(modelo.capacidadeBateria) || 0) : 0;
      detalhe = tempoManual ? "Ajustado manualmente." : kwh > 0 ? "Cerca de " + fmtKwh(kwh) + " kWh, " + fmtMoeda(kwh * (Number(config.tarifaKwh) || 0)) : "Tempo previsto para a recarga.";
    } else if (modeloNome && !isNaN(ini) && !isNaN(alvo)) {
      detalhe = "O modelo não tem dados para calcular. Informe o tempo.";
      precisaDigitar = true;
    }
    cartaoTempo.innerHTML = '<svg aria-hidden="true"><use href="#i-clock"/></svg><div>Tempo estimado<strong>' + titulo + "</strong>" + detalhe + "</div>" +
      '<button type="button" class="btn btn-quiet" id="ini-ajustar-tempo">' + (campoTempo.hidden ? "Ajustar" : "Pronto") + "</button>";
    if (precisaDigitar) campoTempo.hidden = false;
    $("ini-ajustar-tempo").addEventListener("click", function () {
      campoTempo.hidden = !campoTempo.hidden;
      if (!campoTempo.hidden) {
        tempoManual = true;
        $("tempo-estimado").focus();
      }
      atualizarCartaoTempo();
    });
  }
  campoTempo.hidden = true;
  ["bateria-inicial", "bateria-alvo", "tempo-estimado"].forEach(function (id) { $(id).addEventListener("input", atualizarCartaoTempo); });
  $("bico-utilizado").addEventListener("change", atualizarCartaoTempo);
  new MutationObserver(function () {
    if ($("modal-iniciar").classList.contains("show")) {
      campoTempo.hidden = true;
      atualizarFolhaIniciar();
    }
  }).observe($("modal-iniciar"), { attributes: true, attributeFilter: ["class"] });
  atualizarFolhaIniciar();

  // ----- Finalizar recarga -----
  const formFinalizar = $("form-finalizar");
  const veiculoFin = document.createElement("div");
  veiculoFin.className = "vehicle";
  veiculoFin.id = "fin-veiculo";
  formFinalizar.prepend(veiculoFin);
  const infoFin = $("fin-info").closest(".alert");
  infoFin.classList.add("fin-info");
  veiculoFin.after(infoFin);

  $("btn-add-fin-kwh").textContent = "+ Somar outra leitura";
  $("btn-add-fin-kwh").className = "btn btn-quiet btn-sm";
  const salvarParcial = $("btn-salvar-kwh-parcial");
  salvarParcial.textContent = "Salvar leitura e continuar depois";
  salvarParcial.className = "btn btn-quiet btn-sm";
  $("btn-add-fin-kwh").after(salvarParcial);
  $("fin-valor-kwh").closest(".field").querySelector("label").textContent = "Tarifa (R$/kWh)";
  $("fin-valor-pagar").closest(".field").classList.add("fin-oculto");
  $("btn-cancelar-finalizar").classList.add("fin-oculto");

  // Pagamento: interruptor "Dividir" acima dos chips
  const campoDiv = $("campo-fin-div");
  $("campo-fin-metodo").before(campoDiv);
  const sincronizarDividir = radioComoInterruptor("fin-pag-div", "Dividir em dois métodos");
  const rotuloPagamento = document.createElement("span");
  rotuloPagamento.className = "field-label fin-rotulo-pagamento";
  rotuloPagamento.textContent = "Pagamento";
  campoDiv.before(rotuloPagamento);
  $("campo-fin-metodo").querySelector("label").classList.add("sr-only");

  // Consumo: interruptor + atalhos de produto
  const sincronizarConsumo = radioComoInterruptor("fin-consumo", "Consumo na conveniência");
  const sincronizarDividirEdicao = radioComoInterruptor("edit-pag-div", "Dividir em dois métodos");
  const sincronizarConsumoEdicao = radioComoInterruptor("edit-consumo", "Consumiu na conveniência");
  const sincronizarDividirPagamento = radioComoInterruptor("pag-pag-div", "Dividir em dois métodos");
  // Os modais trocam os rádios por código ao abrir; o interruptor acompanha.
  new MutationObserver(function () {
    sincronizarDividirEdicao();
    sincronizarConsumoEdicao();
  }).observe($("modal-edicao"), { attributes: true, attributeFilter: ["class"] });
  new MutationObserver(sincronizarDividirPagamento).observe($("modal-pagamento"), { attributes: true, attributeFilter: ["class"] });
  // Estimativa de 20% a 80% nos formulários de modelo
  [["mod", "form-modelo"], ["editm", "form-modelo-edicao"]].forEach(function (par) {
    const estimativa = document.createElement("p");
    estimativa.className = "help estimativa-modelo";
    $(par[1]).querySelector(".form-actions").before(estimativa);
    const atualizar = function () {
      const bateria = parseFloat(String($(par[0] + "-capacidade").value).replace(",", "."));
      const media = parseFloat(String($(par[0] + "-media").value).replace(",", "."));
      estimativa.textContent = bateria > 0 && media > 0 ? "De 20% a 80%, uma recarga leva cerca de " + Math.round(((bateria * 0.6) / media) * 60) + " min." : "";
    };
    [par[0] + "-capacidade", par[0] + "-media"].forEach(function (id) { $(id).addEventListener("input", atualizar); });
    new MutationObserver(atualizar).observe($(par[1]).closest(".modal-overlay"), { attributes: true, attributeFilter: ["class"] });
  });
  const campoConsumo = document.querySelector('input[name="fin-consumo"]').closest(".field");
  const atalhosConsumo = document.createElement("div");
  atalhosConsumo.className = "chips fin-atalhos-consumo";
  atalhosConsumo.setAttribute("role", "group");
  atalhosConsumo.setAttribute("aria-label", "Adicionar produto");
  campoConsumo.appendChild(atalhosConsumo);
  function desenharAtalhosConsumo() {
    const lista = produtosOrdenados().filter(function (p) { return vendavel(p) && !comboConfiguravel(p); }).slice(0, 8);
    atalhosConsumo.innerHTML = lista.map(function (p) {
      return '<button type="button" class="chip" data-consumo-rapido="' + escapeAttr(p.id) + '">+ ' + escapeHtml(nomeProduto(p)) + "</button>";
    }).join("");
  }
  atalhosConsumo.addEventListener("click", function (e) {
    const b = e.target.closest("[data-consumo-rapido]");
    if (!b) return;
    const sim = document.querySelector('input[name="fin-consumo"][value="Sim"]');
    if (!sim.checked) {
      sim.checked = true;
      sim.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const id = b.dataset.consumoRapido;
    const existente = itensConsumoFin.find(function (item) { return item.produtoId === id; });
    const vazio = itensConsumoFin.find(function (item) { return !item.produtoId; });
    if (existente) existente.quantidade = (parseInt(existente.quantidade, 10) || 0) + 1;
    else if (vazio) vazio.produtoId = id;
    else itensConsumoFin.push({ produtoId: id, quantidade: 1 });
    renderItensConsumo("fin-consumo-itens", itensConsumoFin, calcularValorFin);
    calcularValorFin();
    sincronizarConsumo();
  });

  // Resumo e total fixo no rodapé
  const resumoFin = document.createElement("div");
  resumoFin.className = "fin-resumo";
  resumoFin.id = "fin-resumo";
  const acoesFin = formFinalizar.querySelector(".form-actions");
  acoesFin.before(resumoFin);
  const totalFin = document.createElement("div");
  totalFin.className = "total";
  totalFin.innerHTML = '<small>Total</small><strong id="fin-total"></strong>';
  acoesFin.prepend(totalFin);
  const botaoFinalizar = formFinalizar.querySelector('button[type="submit"]');

  function atualizarResumoFin() {
    const kwh = totalKwhPartes(kwhPartesFin);
    const tarifa = moedaDaMascara($("fin-valor-kwh").value);
    const conveniencia = valorConsumoFin() + valorConsumoVinculadoFin();
    const total = kwh * tarifa + conveniencia;
    resumoFin.innerHTML =
      "<div><span>Energia</span><span>" + fmtKwh(kwh) + " kWh × " + fmtMoeda(tarifa) + "</span></div>" +
      "<div><span>Recarga</span><span>" + fmtMoeda(kwh * tarifa) + "</span></div>" +
      (conveniencia ? "<div><span>Conveniência</span><span>" + fmtMoeda(conveniencia) + "</span></div>" : "") +
      '<div class="resumo-total"><span>Total</span><span>' + fmtMoeda(total) + "</span></div>";
    $("fin-total").textContent = fmtMoeda(total);
    const dividido = document.querySelector('input[name="fin-pag-div"][value="Sim"]').checked;
    const metodo = $("fin-metodo").value;
    botaoFinalizar.textContent = dividido ? "Finalizar e receber"
      : metodo === "Pendente" ? "Finalizar como pendente"
      : metodo === "Cortesia" ? "Registrar cortesia"
      : "Receber no " + metodo;
  }
  $("fin-metodo").addEventListener("change", atualizarResumoFin);
  document.querySelectorAll('input[name="fin-pag-div"]').forEach(function (r) { r.addEventListener("change", atualizarResumoFin); });

  new MutationObserver(function () {
    if (!$("modal-finalizar").classList.contains("show")) return;
    const sessao = sessoes.find(function (x) { return x.id === finalizandoId; });
    veiculoFin.innerHTML = sessao
      ? placaHtml(sessao.placa, true) + "<div><strong>" + escapeHtml(sessao.cliente || "Cliente não informado") + "</strong><span>" + escapeHtml((sessao.modelo || "") + (sessao.bico != null ? " · Bico " + sessao.bico : "")) + "</span></div>"
      : "";
    veiculoFin.hidden = !sessao;
    sincronizarDividir();
    sincronizarConsumo();
    desenharAtalhosConsumo();
    atualizarResumoFin();
  }).observe($("modal-finalizar"), { attributes: true, attributeFilter: ["class"] });

  /* ---------------- Cadastros: uma lista por aba, novo cadastro em folha ---------------- */
  function abaCadastroAtiva() {
    return document.querySelector('#cad-segmentos [aria-selected="true"]');
  }
  function atualizarBotaoNovoCadastro() {
    const aba = abaCadastroAtiva();
    if (aba) $("btn-novo-cadastro-rotulo").textContent = "Novo " + aba.dataset.novo;
  }
  $("cad-segmentos").addEventListener("click", function () { setTimeout(atualizarBotaoNovoCadastro, 0); });
  $("cad-segmentos").addEventListener("keydown", function () { setTimeout(atualizarBotaoNovoCadastro, 0); });
  $("btn-novo-cadastro").addEventListener("click", function () {
    const aba = abaCadastroAtiva();
    if (!aba) return;
    const chave = aba.getAttribute("aria-controls").replace("cad-", "");
    if (chave === "produtos") return abrirFolhaProduto(null);
    if (chave === "combos" && comboEditandoId) limparFormCombo();
    else if (chave === "combos") atualizarOpcoesGruposCombo();
    const folha = $("modal-cad-" + chave);
    folha.classList.add("show");
    const primeiro = folha.querySelector("form input:not([type=hidden]), form select");
    if (primeiro) setTimeout(function () { try { primeiro.focus({ preventScroll: true }); } catch (e) {} }, 60);
  });
  document.querySelectorAll("[data-cadastro-folha]").forEach(function (folha) {
    folha.addEventListener("click", function (e) {
      if (e.target === this) this.classList.remove("show");
    });
  });
  atualizarBotaoNovoCadastro();

  /* ---------------- Turnos do posto ---------------- */
  function rotuloTurnoOperador(p) {
    const id = Number(p && p.turno) || 1;
    return listaTurnos().some(function (t) { return t.id === id; }) ? nomeTurno(id) : "Turno removido";
  }

  // Todo select de turno (filtros, operadores, fechamento, edição) lista os turnos configurados.
  function popularSelectsTurno() {
    document.querySelectorAll("select").forEach(function (sel) {
      const um = sel.querySelector('option[value="1"]');
      if (!sel.dataset.turnos && !(um && /^Turno/.test(um.textContent))) return;
      sel.dataset.turnos = "1";
      const atual = sel.value;
      Array.from(sel.options).forEach(function (o) { if (o.value !== "") o.remove(); });
      listaTurnos().forEach(function (t) {
        const o = document.createElement("option");
        o.value = String(t.id);
        o.textContent = t.nome;
        sel.appendChild(o);
      });
      if (Array.from(sel.options).some(function (o) { return o.value === atual; })) sel.value = atual;
      if (sel.nextElementSibling && sel.nextElementSibling.classList.contains("chip-select")) sincronizarChips(sel);
    });
    const resumo = $("cfg-resumo-turnos");
    if (resumo) resumo.textContent = listaTurnos().map(function (t) { return t.nome + " " + t.inicio + " a " + t.fim; }).join(", ");
    atualizarResumoPin();
  }

  function atualizarResumoPin() {
    const resumo = $("cfg-resumo-pin");
    if (!resumo) return;
    resumo.textContent = config.pinAdmin && config.pinAdmin.em
      ? "Trocado em " + formatarData(config.pinAdmin.em)
      : "Ainda é o padrão 0000. Troque por um PIN só seu.";
  }

  $("form-cfg-pin").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!exigirAdmin()) return;
    const novo = $("cfg-pin-novo").value.trim();
    const confirmar = $("cfg-pin-confirmar").value.trim();
    if (!/^\d{4}$/.test(novo)) {
      mostrarAlerta("O PIN precisa ter exatamente 4 números.", "error");
      return;
    }
    if (novo !== confirmar) {
      mostrarAlerta("Os dois PINs não são iguais. Digite de novo.", "error");
      return;
    }
    config.pinAdmin = { hash: hashPin(novo), em: new Date().toISOString() };
    salvar(KEY_CONFIG, config);
    $("cfg-pin-novo").value = "";
    $("cfg-pin-confirmar").value = "";
    atualizarResumoPin();
    $("modal-cfg-pin").classList.remove("show");
    mostrarAlerta("PIN salvo neste aparelho.", "success");
  });

  let turnosForm = [];
  function desenharTurnosForm() {
    $("turnos-lista").innerHTML = turnosForm.map(function (t, i) {
      return '<div class="turno-linha" data-turno-linha="' + i + '">' +
        '<div class="field"><label for="turno-nome-' + i + '">Nome</label><input type="text" id="turno-nome-' + i + '" data-campo="nome" value="' + escapeAttr(t.nome) + '" autocomplete="off"></div>' +
        '<div class="field"><label for="turno-inicio-' + i + '">Início</label><input type="time" id="turno-inicio-' + i + '" data-campo="inicio" value="' + escapeAttr(t.inicio) + '"></div>' +
        '<div class="field"><label for="turno-fim-' + i + '">Fim</label><input type="time" id="turno-fim-' + i + '" data-campo="fim" value="' + escapeAttr(t.fim) + '"></div>' +
        (turnosForm.length > 1 ? '<button type="button" class="btn-icon" data-remover-turno="' + i + '" aria-label="Remover ' + escapeAttr(t.nome) + '"><svg aria-hidden="true"><use href="#i-trash"/></svg></button>' : '<span></span>') +
      "</div>";
    }).join("");
    $("btn-add-turno").hidden = turnosForm.length >= 4;
    const erro = validarTurnos(turnosForm);
    $("turnos-erro").textContent = erro;
    $("turnos-erro").hidden = !erro;
  }
  function lerTurnosForm() {
    $("turnos-lista").querySelectorAll("[data-turno-linha]").forEach(function (linha) {
      const t = turnosForm[Number(linha.dataset.turnoLinha)];
      linha.querySelectorAll("[data-campo]").forEach(function (campo) { t[campo.dataset.campo] = campo.value.trim(); });
    });
  }
  function abrirTurnos() {
    turnosForm = listaTurnos().map(function (t) { return Object.assign({}, t); });
    desenharTurnosForm();
    $("modal-cfg-turnos").classList.add("show");
  }
  $("turnos-lista").addEventListener("input", function () {
    lerTurnosForm();
    const erro = validarTurnos(turnosForm);
    $("turnos-erro").textContent = erro;
    $("turnos-erro").hidden = !erro;
  });
  $("turnos-lista").addEventListener("click", function (e) {
    const b = e.target.closest("[data-remover-turno]");
    if (!b) return;
    lerTurnosForm();
    turnosForm.splice(Number(b.dataset.removerTurno), 1);
    desenharTurnosForm();
  });
  $("btn-add-turno").addEventListener("click", function () {
    lerTurnosForm();
    const ultimo = turnosForm[turnosForm.length - 1];
    const proximoId = Math.max.apply(null, turnosForm.map(function (t) { return Number(t.id) || 0; }).concat([0])) + 1;
    turnosForm.push({ id: proximoId, nome: "Turno " + (turnosForm.length + 1), inicio: ultimo ? ultimo.fim : "07:00", fim: "" });
    desenharTurnosForm();
  });
  $("form-turnos").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!exigirAdmin()) return;
    lerTurnosForm();
    const erro = validarTurnos(turnosForm);
    if (erro) {
      $("turnos-erro").textContent = erro;
      $("turnos-erro").hidden = false;
      mostrarAlerta(erro, "error");
      return;
    }
    config.turnos = turnosForm.map(function (t) { return { id: Number(t.id), nome: t.nome.trim(), inicio: t.inicio, fim: t.fim }; });
    definirTurnos(config.turnos);
    salvar(KEY_CONFIG, config);
    popularSelectsTurno();
    $("modal-cfg-turnos").classList.remove("show");
    renderTudo();
    const semTurno = perfis.filter(function (p) { return rotuloTurnoOperador(p) === "Turno removido"; }).length;
    mostrarAlerta("Turnos salvos." + (semTurno ? " " + semTurno + (semTurno === 1 ? " operador ficou" : " operadores ficaram") + " sem turno: escolha um novo em Operadores." : ""), semTurno ? "error" : "success");
  });
  $("btn-abrir-turnos").addEventListener("click", function () {
    if (!exigirAdmin()) return;
    abrirTurnos();
  });
  $("modal-cfg-turnos").addEventListener("click", function (e) { if (e.target === this) this.classList.remove("show"); });
  popularSelectsTurno();

  /* ---------------- Configurações: lista agrupada que abre folhas ---------------- */
  function atualizarResumoConfig() {
    const resumo = function (id, texto) { if ($(id)) $(id).textContent = texto; };
    const bicos = totalConectores();
    resumo("cfg-resumo-estacao", "Tarifa " + fmtMoeda(Number(config.tarifaKwh) || 0) + "/kWh, " + bicos + (bicos === 1 ? " bico" : " bicos"));
    resumo("cfg-resumo-perfis", perfis.length ? perfis.length + (perfis.length === 1 ? " perfil cadastrado" : " perfis cadastrados") : "Nenhum perfil cadastrado");
    resumo("cfg-resumo-whatsapp", "Prévia da mensagem de status dos bicos");
  }
  document.querySelectorAll("[data-abrir-cfg]").forEach(function (linhaCfg) {
    linhaCfg.addEventListener("click", function () {
      if (linhaCfg.dataset.abrirCfg === "modal-cfg-whatsapp") atualizarPreviewWhatsApp();
      $(linhaCfg.dataset.abrirCfg).classList.add("show");
    });
  });
  document.querySelectorAll("[data-cfg-folha]").forEach(function (folha) {
    folha.addEventListener("click", function (e) {
      if (e.target === this) this.classList.remove("show");
    });
    new MutationObserver(function () {
      if (!folha.classList.contains("show")) atualizarResumoConfig();
    }).observe(folha, { attributes: true, attributeFilter: ["class"] });
  });
  atualizarResumoConfig();

  /* ---------------- Apagar dados com confirmação digitada ---------------- */
  let acaoApagar = null;
  function confirmarApagamento(titulo, aviso, rotuloBotao, acao) {
    acaoApagar = acao;
    $("apagar-titulo").textContent = titulo;
    $("apagar-aviso").textContent = aviso;
    $("btn-confirmar-apagar").textContent = rotuloBotao;
    $("btn-confirmar-apagar").disabled = true;
    $("apagar-confirmacao").value = "";
    $("modal-apagar").classList.add("show");
    setTimeout(function () { try { $("apagar-confirmacao").focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  $("apagar-confirmacao").addEventListener("input", function () {
    $("btn-confirmar-apagar").disabled = this.value.trim().toLowerCase() !== "apagar";
  });
  $("btn-confirmar-apagar").addEventListener("click", function () {
    if (this.disabled) return;
    const acao = acaoApagar;
    acaoApagar = null;
    $("modal-apagar").classList.remove("show");
    if (acao) acao();
  });
  $("modal-apagar").addEventListener("click", function (e) {
    if (e.target === this) this.classList.remove("show");
  });

  /* ---------------- Folhas do caixa ---------------- */
  document.querySelectorAll("[data-fechar-modal]").forEach(function (botao) {
    botao.addEventListener("click", function () { $(botao.dataset.fecharModal).classList.remove("show"); });
  });
  ["modal-caixa-contagem", "modal-repor", "modal-repor-lote", "modal-dash-filtros", "modal-dash-detalhe"].forEach(function (id) {
    $(id).addEventListener("click", function (e) {
      if (e.target === this) this.classList.remove("show");
    });
  });

  const ESPECIES = [
    { valor: 200, tipo: "cedula" }, { valor: 100, tipo: "cedula" }, { valor: 50, tipo: "cedula" },
    { valor: 20, tipo: "cedula" }, { valor: 10, tipo: "cedula" }, { valor: 5, tipo: "cedula" },
    { valor: 2, tipo: "cedula" }, { valor: 1, tipo: "moeda" }, { valor: 0.5, tipo: "moeda" },
    { valor: 0.25, tipo: "moeda" }, { valor: 0.1, tipo: "moeda" }, { valor: 0.05, tipo: "moeda" }
  ];
  let contagemEspecies = {};

  function atualizarResumoContagem() {
    const contado = arred((moedaDaMascara($("caixa-cedulas").value) || 0) + (moedaDaMascara($("caixa-moedas").value) || 0));
    const esperado = totalCaixa(caixa);
    const diferenca = arred(contado - esperado);
    const semDiferenca = Math.abs(diferenca) < 0.005;
    $("contagem-resumo").innerHTML =
      "<div><span>Esperado pelo sistema</span><span>" + fmtMoeda(esperado) + "</span></div>" +
      "<div><span>Contado agora</span><span>" + fmtMoeda(contado) + "</span></div>" +
      '<div class="resumo-total"><span>Diferença</span><span class="' + (semDiferenca ? "ok" : "bad") + '">' +
        (semDiferenca ? "Sem diferença" : (diferenca > 0 ? "+" : "−") + fmtMoeda(Math.abs(diferenca))) + "</span></div>";
  }

  function desenharEspecies() {
    const grupo = function (tipo, titulo) {
      return '<p class="especies-titulo">' + titulo + "</p>" + ESPECIES.filter(function (e) { return e.tipo === tipo; }).map(function (e) {
        const qtd = contagemEspecies[e.valor] || 0;
        const rotulo = fmtMoeda(e.valor).replace(",00", "");
        return '<div class="especie"><span class="especie-valor">' + rotulo + '</span>' +
          '<span class="stepper"><button type="button" data-especie="' + e.valor + '" data-delta="-1" aria-label="Menos uma de ' + rotulo + '">−</button>' +
          "<output>" + qtd + "</output>" +
          '<button type="button" data-especie="' + e.valor + '" data-delta="1" aria-label="Mais uma de ' + rotulo + '">+</button></span>' +
          '<span class="especie-subtotal">' + fmtMoeda(arred(e.valor * qtd)) + "</span></div>";
      }).join("");
    };
    $("contagem-especies").innerHTML = grupo("cedula", "Cédulas") + grupo("moeda", "Moedas");
  }

  $("contagem-especies").addEventListener("click", function (e) {
    const b = e.target.closest("[data-especie]");
    if (!b) return;
    const valor = b.dataset.especie;
    contagemEspecies[valor] = Math.max(0, (contagemEspecies[valor] || 0) + Number(b.dataset.delta));
    let cedulas = 0;
    let moedas = 0;
    ESPECIES.forEach(function (esp) {
      const total = esp.valor * (contagemEspecies[esp.valor] || 0);
      if (esp.tipo === "cedula") cedulas += total; else moedas += total;
    });
    $("caixa-cedulas").value = mascararMoeda(Math.round(cedulas * 100));
    $("caixa-moedas").value = mascararMoeda(Math.round(moedas * 100));
    desenharEspecies();
    atualizarResumoContagem();
  });
  $("btn-contar-cedulas").addEventListener("click", function () {
    const abrir = $("contagem-especies").hidden;
    $("contagem-especies").hidden = !abrir;
    this.setAttribute("aria-expanded", String(abrir));
    if (abrir) desenharEspecies();
  });
  ["caixa-cedulas", "caixa-moedas"].forEach(function (id) { $(id).addEventListener("input", atualizarResumoContagem); });

  $("btn-abrir-contagem").addEventListener("click", function () {
    renderCaixa();
    contagemEspecies = {};
    $("contagem-especies").hidden = true;
    $("btn-contar-cedulas").setAttribute("aria-expanded", "false");
    atualizarResumoContagem();
    $("modal-caixa-contagem").classList.add("show");
  });
  // Fechar a folha de retirada (X ou clique fora) cancela um fechamento de turno em andamento.
  $("modal-caixa-retirada").addEventListener("click", function (e) {
    if (e.target !== this && !e.target.closest("[data-fechar-modal]")) return;
    this.classList.remove("show");
    if (fechamentoPendente) {
      sairModoFechamento();
      $("caixa-retirada-cedulas").value = "";
      $("caixa-retirada-moedas").value = "";
      $("caixa-retirada-motivo").value = "";
    }
  });

  $("btn-abrir-retirada").addEventListener("click", function () {
    sairModoFechamento();
    renderCaixa();
    $("modal-caixa-retirada").classList.add("show");
  });

  /* ---------------- Filtros: busca + atalhos de período + folha ----------------
     Os controles originais (com seus ids e eventos) são apenas movidos para a folha. */
  function montarFiltros(cfg) {
    const barra = document.querySelector(cfg.barra);
    if (!barra) return;
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar filtros-toolbar";
    if (cfg.busca) {
      const busca = $(cfg.busca);
      const rotulo = document.createElement("label");
      rotulo.className = "search";
      rotulo.innerHTML = '<svg aria-hidden="true"><use href="#i-search"/></svg><span class="sr-only">Buscar</span>';
      rotulo.appendChild(busca);
      toolbar.appendChild(rotulo);
    }
    const linha = document.createElement("div");
    linha.className = "chip-row";
    const chips = document.createElement("div");
    chips.className = "chips";
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "Período");
    const atalhos = [
      { id: "tudo", rotulo: "Tudo" },
      { id: "hoje", rotulo: "Hoje" },
      { id: "ontem", rotulo: "Ontem" },
      { id: "7dias", rotulo: "7 dias" }
    ];
    if (cfg.turno) atalhos.push({ id: "turno", rotulo: "Turno atual" });
    chips.innerHTML = atalhos.map(function (a) {
      return '<button type="button" class="chip" data-atalho="' + a.id + '" aria-pressed="false">' + a.rotulo + "</button>";
    }).join("");
    const botaoFiltros = document.createElement("button");
    botaoFiltros.type = "button";
    botaoFiltros.className = "chip filter-btn";
    botaoFiltros.innerHTML = '<svg aria-hidden="true"><use href="#i-sliders"/></svg>Filtros<span class="count" hidden></span>';
    linha.appendChild(chips);
    linha.appendChild(botaoFiltros);
    toolbar.appendChild(linha);

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "modal-filtros-" + cfg.nome;
    modal.innerHTML = '<div class="modal"><div class="modal-header"><h2>Filtros</h2><button type="button" class="modal-close" title="Fechar" aria-label="Fechar"><svg aria-hidden="true"><use href="#i-close"/></svg></button></div>' +
      '<div class="filtros-campos"></div><div class="form-actions"></div></div>';
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Filtros");
    const campos = modal.querySelector(".filtros-campos");
    const acoes = modal.querySelector(".form-actions");
    const extras = [];
    let datas = null;
    Array.from(barra.children).forEach(function (el) {
      if (cfg.limpar && el.id === cfg.limpar) return;
      if (el.tagName === "BUTTON") { extras.push(el); return; }
      const campo = document.createElement("div");
      campo.className = "field";
      const rotulo = document.createElement("label");
      rotulo.htmlFor = el.id;
      rotulo.textContent = (cfg.rotulos && cfg.rotulos[el.id]) || (el.getAttribute("aria-label") || "").replace(/^Filtrar por /, "").replace(/^./, function (c) { return c.toUpperCase(); });
      el.removeAttribute("aria-label");
      campo.appendChild(rotulo);
      campo.appendChild(el);
      if (el.id === cfg.de || el.id === cfg.ate) {
        if (!datas) {
          datas = document.createElement("div");
          datas.className = "form-row filtros-datas";
          campos.appendChild(datas);
        }
        datas.appendChild(campo);
      } else campos.appendChild(campo);
      if (el.tagName === "SELECT" && el.options.length <= 7 && el.id !== cfg.operador) {
        el.dataset.chipsTodos = "1";
        aprimorarSelectEmChips(el);
      }
    });
    if (cfg.limpar && $(cfg.limpar)) {
      const limpar = $(cfg.limpar);
      limpar.textContent = "Limpar";
      acoes.appendChild(limpar);
    }
    const mostrar = document.createElement("button");
    mostrar.type = "button";
    mostrar.className = "btn btn-primary";
    mostrar.textContent = "Mostrar resultados";
    acoes.appendChild(mostrar);
    if (extras.length) {
      const linhaExtras = document.createElement("div");
      linhaExtras.className = "toolbar-acoes";
      extras.forEach(function (b) { linhaExtras.appendChild(b); });
      toolbar.appendChild(linhaExtras);
    }
    barra.replaceWith(toolbar);
    document.body.appendChild(modal);

    const campoDe = $(cfg.de);
    const campoAte = $(cfg.ate);
    const campoTurno = cfg.turno ? $(cfg.turno) : null;
    const disparar = function (el, tipo) { if (el) el.dispatchEvent(new Event(tipo, { bubbles: true })); };
    const diaISO = function (desloc) {
      const d = new Date();
      d.setDate(d.getDate() + desloc);
      return dataLocalISO(d);
    };
    const valoresAtalho = function (id) {
      if (id === "tudo") return { de: "", ate: "", turno: "" };
      if (id === "hoje") return { de: diaISO(0), ate: diaISO(0), turno: "" };
      if (id === "ontem") return { de: diaISO(-1), ate: diaISO(-1), turno: "" };
      if (id === "7dias") return { de: diaISO(-6), ate: diaISO(0), turno: "" };
      const t = getDadosTurnoAtual(new Date());
      return { de: t.dataOperacional, ate: t.dataOperacional, turno: String(t.turnoId) };
    };
    const atalhoAtivo = function () {
      return atalhos.map(function (a) { return a.id; }).find(function (id) {
        const v = valoresAtalho(id);
        return campoDe.value === v.de && campoAte.value === v.ate && (!campoTurno || campoTurno.value === v.turno);
      });
    };
    const atualizar = function () {
      const ativo = atalhoAtivo();
      chips.querySelectorAll("[data-atalho]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.atalho === ativo)); });
      let n = 0;
      campos.querySelectorAll("input, select").forEach(function (el) {
        if (!el.value || el.id === cfg.relatorio) return;
        if (ativo && (el === campoDe || el === campoAte || el === campoTurno)) return;
        if (el === campoDe && campoAte.value) return; // período conta uma vez
        n++;
      });
      const contador = botaoFiltros.querySelector(".count");
      contador.textContent = n;
      contador.hidden = !n;
      botaoFiltros.setAttribute("aria-label", n ? "Filtros, " + n + " ativo" + (n === 1 ? "" : "s") : "Filtros");
      campos.querySelectorAll(".chip-source").forEach(sincronizarChips);
    };
    chips.addEventListener("click", function (e) {
      const b = e.target.closest("[data-atalho]");
      if (!b) return;
      const v = valoresAtalho(b.dataset.atalho);
      campoDe.value = v.de;
      campoAte.value = v.ate;
      if (campoTurno) campoTurno.value = v.turno;
      disparar(campoDe, "input");
      disparar(campoAte, "input");
      disparar(campoTurno, "change");
      atualizar();
    });
    const fechar = function () { modal.classList.remove("show"); };
    botaoFiltros.addEventListener("click", function () { modal.classList.add("show"); });
    modal.querySelector(".modal-close").addEventListener("click", fechar);
    mostrar.addEventListener("click", fechar);
    modal.addEventListener("click", function (e) { if (e.target === modal) fechar(); });
    campos.addEventListener("input", atualizar);
    campos.addEventListener("change", atualizar);
    if (cfg.limpar && $(cfg.limpar)) $(cfg.limpar).addEventListener("click", function () { setTimeout(atualizar, 0); });
    atualizar();
  }

  montarFiltros({
    nome: "historico", barra: ".history-filters", busca: "busca", de: "filtro-de", ate: "filtro-ate",
    turno: "filtro-turno", operador: "filtro-perfil", limpar: "btn-limpar-filtro", relatorio: "data-relatorio",
    rotulos: { "filtro-de": "De", "filtro-ate": "Até", "data-relatorio": "Dia do resumo no WhatsApp" }
  });
  montarFiltros({
    nome: "vendas", barra: ".sales-filters", busca: "busca-vendas", de: "filtro-vendas-de", ate: "filtro-vendas-ate",
    turno: "filtro-vendas-turno", operador: "filtro-vendas-operador", limpar: "btn-limpar-filtro-vendas", relatorio: "data-relatorio-vendas",
    rotulos: { "filtro-vendas-de": "De", "filtro-vendas-ate": "Até", "data-relatorio-vendas": "Dia do relatório no WhatsApp" }
  });
  montarFiltros({
    nome: "caixa", barra: ".cash-filters", de: "filtro-caixa-de", ate: "filtro-caixa-ate",
    turno: "filtro-caixa-turno", limpar: "btn-limpar-filtro-caixa", relatorio: "data-relatorio-caixa",
    rotulos: { "filtro-caixa-de": "De", "filtro-caixa-ate": "Até", "data-relatorio-caixa": "Dia do relatório no WhatsApp" }
  });

  aplicarRotaUrl();

  /* ---------------- Modo do aparelho: Operador ou Admin ---------------- */
  function trocarModo(modo) {
    if (modo === modoApp) return;
    definirModo(modo);
    aplicarPermissoes();
    popularSelectPerfilAtivo();
    if (ehAdmin()) renderDashboard();
    atualizarAvisoBackup();
    setTimeout(abrirSelecaoPerfilTurno, 0);
    mostrarAlerta(ehAdmin() ? "Modo Admin: dashboard, cadastros, caixa e configurações." : "Modo Operador: operação, vendas, histórico e caixa.", "success");
  }
  document.querySelectorAll("[data-modo-app]").forEach(function (botao) {
    botao.addEventListener("click", function () { trocarModo(botao.dataset.modoApp); });
  });
  // O admin não escolhe operador: entra direto pelo aviso de operador do turno.
  $("btn-perfil-turno-admin").addEventListener("click", function () { trocarModo("admin"); });
  definirModo(modoApp);

  /* ---------------- Assistente de primeira abertura ---------------- */
  const assistente = { etapa: 1, pulados: {}, bicos: [], turnos: [], operadores: [] };
  const ETAPAS_ASSISTENTE = ["Nome do posto", "Bicos de recarga", "Tarifa", "Turnos e operadores"];

  function assistenteAberto() {
    const modal = $("modal-assistente");
    return Boolean(modal && modal.classList.contains("show"));
  }

  function abrirAssistente() {
    assistente.etapa = 1;
    assistente.pulados = {};
    assistente.bicos = (config.carregadores || []).map(function (c) { return { potenciaKw: Number(c.potenciaKw) || 60 }; });
    assistente.turnos = listaTurnos().map(function (t) { return Object.assign({}, t); });
    assistente.operadores = [];
    $("ass-nome").value = nomePosto() === NOME_PADRAO ? "" : nomePosto();
    $("ass-qtd-bicos").value = String(assistente.bicos.length);
    $("ass-tarifa").value = moedaParaCampo(config.tarifaKwh);
    $("ass-operador").value = "";
    desenharBicosAssistente();
    desenharTurnosAssistente();
    desenharOperadoresAssistente();
    mostrarEtapaAssistente();
    $("modal-perfil-turno-obrigatorio").classList.remove("show");
    $("modal-assistente").classList.add("show");
    setTimeout(function () { try { $("ass-nome").focus({ preventScroll: true }); } catch (e) {} }, 60);
  }

  function mostrarEtapaAssistente() {
    const etapa = assistente.etapa;
    document.querySelectorAll("#modal-assistente [data-etapa]").forEach(function (secao) {
      secao.hidden = Number(secao.dataset.etapa) !== etapa;
    });
    document.querySelectorAll("#modal-assistente .assistente-trilha li").forEach(function (item, i) {
      item.classList.toggle("feito", i < etapa - 1);
      item.classList.toggle("atual", i === etapa - 1);
    });
    $("assistente-passo").textContent = "Passo " + etapa + " de 4: " + ETAPAS_ASSISTENTE[etapa - 1];
    $("ass-voltar").hidden = etapa === 1;
    $("ass-continuar").textContent = etapa === 4 ? "Concluir" : "Continuar";
    $("ass-pular").textContent = etapa === 4 ? "Pular e concluir" : "Pular";
  }

  function desenharBicosAssistente() {
    $("ass-bicos").innerHTML = assistente.bicos.map(function (b, i) {
      return '<div class="field"><label for="ass-bico-' + i + '">Bico ' + (i + 1) + " (kW)</label>" +
        '<input type="number" id="ass-bico-' + i + '" data-bico="' + i + '" min="1" step="1" inputmode="numeric" value="' + escapeAttr(String(b.potenciaKw)) + '"></div>';
    }).join("");
  }

  $("ass-qtd-bicos").addEventListener("input", function () {
    const qtd = parseInt(this.value, 10);
    if (!(qtd >= 1 && qtd <= 20)) return;
    const ultima = assistente.bicos.length ? assistente.bicos[assistente.bicos.length - 1].potenciaKw : 60;
    while (assistente.bicos.length < qtd) assistente.bicos.push({ potenciaKw: ultima });
    assistente.bicos.length = qtd;
    desenharBicosAssistente();
  });
  $("ass-bicos").addEventListener("input", function (e) {
    const campo = e.target.closest("[data-bico]");
    if (campo) assistente.bicos[Number(campo.dataset.bico)].potenciaKw = parseInt(campo.value, 10) || 0;
  });

  function desenharTurnosAssistente() {
    $("ass-turnos").innerHTML = assistente.turnos.map(function (t, i) {
      return '<div class="turno-linha" data-ass-turno="' + i + '">' +
        '<div class="field"><label for="ass-turno-nome-' + i + '">Nome</label><input type="text" id="ass-turno-nome-' + i + '" data-campo="nome" value="' + escapeAttr(t.nome) + '" autocomplete="off"></div>' +
        '<div class="field"><label for="ass-turno-inicio-' + i + '">Início</label><input type="time" id="ass-turno-inicio-' + i + '" data-campo="inicio" value="' + escapeAttr(t.inicio) + '"></div>' +
        '<div class="field"><label for="ass-turno-fim-' + i + '">Fim</label><input type="time" id="ass-turno-fim-' + i + '" data-campo="fim" value="' + escapeAttr(t.fim) + '"></div>' +
        (assistente.turnos.length > 1 ? '<button type="button" class="btn-icon" data-remover-ass-turno="' + i + '" aria-label="Remover ' + escapeAttr(t.nome) + '"><svg aria-hidden="true"><use href="#i-trash"/></svg></button>' : "<span></span>") +
      "</div>";
    }).join("");
    $("ass-add-turno").hidden = assistente.turnos.length >= 4;
    conferirTurnosAssistente();
    popularTurnosOperadorAssistente();
  }

  function conferirTurnosAssistente() {
    const erro = validarTurnos(assistente.turnos);
    $("ass-turnos-erro").textContent = erro;
    $("ass-turnos-erro").hidden = !erro;
    return erro;
  }

  function popularTurnosOperadorAssistente() {
    const sel = $("ass-operador-turno");
    const atual = sel.value;
    sel.innerHTML = assistente.turnos.map(function (t, i) {
      return '<option value="' + i + '">' + escapeHtml(t.nome || "Turno " + (i + 1)) + "</option>";
    }).join("");
    if (Array.from(sel.options).some(function (o) { return o.value === atual; })) sel.value = atual;
  }

  $("ass-turnos").addEventListener("input", function (e) {
    const linha = e.target.closest("[data-ass-turno]");
    const campo = e.target.closest("[data-campo]");
    if (!linha || !campo) return;
    assistente.turnos[Number(linha.dataset.assTurno)][campo.dataset.campo] = campo.value.trim();
    conferirTurnosAssistente();
    if (campo.dataset.campo === "nome") {
      popularTurnosOperadorAssistente();
      desenharOperadoresAssistente();
    }
  });
  $("ass-turnos").addEventListener("click", function (e) {
    const botao = e.target.closest("[data-remover-ass-turno]");
    if (!botao) return;
    const idx = Number(botao.dataset.removerAssTurno);
    assistente.turnos.splice(idx, 1);
    assistente.operadores.forEach(function (op) {
      if (op.turno === idx) op.turno = 0;
      else if (op.turno > idx) op.turno -= 1;
    });
    desenharTurnosAssistente();
    desenharOperadoresAssistente();
  });
  $("ass-add-turno").addEventListener("click", function () {
    if (assistente.turnos.length >= 4) return;
    const anterior = assistente.turnos[assistente.turnos.length - 1];
    assistente.turnos.push({ id: assistente.turnos.length + 1, nome: "Turno " + (assistente.turnos.length + 1), inicio: anterior ? anterior.fim : "07:00", fim: "" });
    desenharTurnosAssistente();
  });

  function desenharOperadoresAssistente() {
    const lista = $("ass-operadores");
    lista.innerHTML = assistente.operadores.map(function (op, i) {
      const turno = assistente.turnos[op.turno];
      return '<li><span><strong>' + escapeHtml(op.nome) + '</strong><span class="muted">' + escapeHtml(turno ? turno.nome : "Sem turno") + "</span></span>" +
        '<button type="button" class="btn-icon" data-remover-ass-operador="' + i + '" aria-label="Remover ' + escapeAttr(op.nome) + '"><svg aria-hidden="true"><use href="#i-trash"/></svg></button></li>';
    }).join("");
    lista.hidden = !assistente.operadores.length;
  }

  function adicionarOperadorAssistente() {
    const nome = $("ass-operador").value.trim();
    if (!nome) {
      mostrarAlerta("Digite o nome do operador.", "error");
      return;
    }
    if (assistente.operadores.some(function (op) { return op.nome.toLowerCase() === nome.toLowerCase(); })) {
      mostrarAlerta("Esse operador já está na lista.", "error");
      return;
    }
    assistente.operadores.push({ nome: nome, turno: Number($("ass-operador-turno").value) || 0 });
    $("ass-operador").value = "";
    desenharOperadoresAssistente();
    $("ass-operador").focus();
  }
  $("ass-add-operador").addEventListener("click", adicionarOperadorAssistente);
  $("ass-operador").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      adicionarOperadorAssistente();
    }
  });
  $("ass-operadores").addEventListener("click", function (e) {
    const botao = e.target.closest("[data-remover-ass-operador]");
    if (!botao) return;
    assistente.operadores.splice(Number(botao.dataset.removerAssOperador), 1);
    desenharOperadoresAssistente();
  });

  // Confere a etapa atual antes de avançar. Devolve a mensagem de erro, se houver.
  function erroEtapaAssistente(etapa) {
    if (etapa === 2) {
      if (!assistente.bicos.length) return "Informe pelo menos 1 bico.";
      if (assistente.bicos.some(function (b) { return !(b.potenciaKw > 0); })) return "Informe a potência de cada bico em kW.";
    }
    if (etapa === 3) {
      const tarifa = moedaDaMascara($("ass-tarifa").value);
      if (!(tarifa > 0)) return "Informe a tarifa por kWh.";
    }
    if (etapa === 4) return conferirTurnosAssistente();
    return "";
  }

  function avancarAssistente(pular) {
    const etapa = assistente.etapa;
    if (pular) {
      assistente.pulados[etapa] = true;
    } else {
      const erro = erroEtapaAssistente(etapa);
      if (erro) {
        mostrarAlerta(erro, "error");
        return;
      }
      delete assistente.pulados[etapa];
    }
    if (etapa < 4) {
      assistente.etapa = etapa + 1;
      mostrarEtapaAssistente();
      const primeiro = document.querySelector('#modal-assistente [data-etapa="' + assistente.etapa + '"] input');
      if (primeiro) setTimeout(function () { try { primeiro.focus({ preventScroll: true }); } catch (e) {} }, 0);
      return;
    }
    concluirAssistente();
  }

  function concluirAssistente() {
    const usa = function (etapa) { return !assistente.pulados[etapa]; };
    if (usa(1)) config.nomeSistema = $("ass-nome").value.trim() || NOME_PADRAO;
    if (usa(2)) config.carregadores = assistente.bicos.map(function (b) { return { potenciaKw: b.potenciaKw }; });
    if (usa(3)) config.tarifaKwh = moedaDaMascara($("ass-tarifa").value);
    if (usa(4)) {
      config.turnos = assistente.turnos.map(function (t, i) { return { id: i + 1, nome: t.nome.trim(), inicio: t.inicio, fim: t.fim }; });
      definirTurnos(config.turnos);
      assistente.operadores.forEach(function (op) {
        perfis.push({ id: gerarId("pf"), nome: op.nome, foto: "", turno: op.turno + 1 });
      });
      salvar(KEY_PERFIS, perfis);
    }
    salvar(KEY_CONFIG, config);
    $("modal-assistente").classList.remove("show");
    definirModo("admin");
    aplicarMarca();
    aplicarAparencia();
    preencherConfig();
    popularSelectsTurno();
    popularBicosFormulario();
    renderPerfis();
    popularSelectPerfilAtivo();
    popularSelectFiltroPerfil();
    atualizarPreviewWhatsApp();
    aplicarPermissoes();
    renderTudo();
    irParaAba("tab-dashboard", true);
    renderDashboard();
    atualizarResumoConfig();
    mostrarAlerta("Posto configurado. Você está no modo Admin; para atender, troque para Operador no topo.", "success");
  }

  $("ass-continuar").addEventListener("click", function () { avancarAssistente(false); });
  $("ass-pular").addEventListener("click", function () { avancarAssistente(true); });
  $("ass-voltar").addEventListener("click", function () {
    if (assistente.etapa > 1) {
      assistente.etapa -= 1;
      mostrarEtapaAssistente();
    }
  });
  $("ass-nome").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      avancarAssistente(false);
    }
  });
  $("ass-tarifa").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      avancarAssistente(false);
    }
  });

  if (primeiroUso) abrirAssistente();

  /* ---------------- Backup, restauração e recomeço ---------------- */
  const KEY_ULTIMO_BACKUP = "eletroposto_ultimo_backup";
  const PREFIXO_CHAVES = "eletroposto_";
  const BACKUP_FORMATO = "eletroposto-backup";
  const BACKUP_LEMBRETE_DIAS = 7;
  let avisoBackupDispensado = false;

  function chavesDoApp() {
    const chaves = [];
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (chave && chave.indexOf(PREFIXO_CHAVES) === 0) chaves.push(chave);
    }
    return chaves.sort();
  }

  function montarBackup() {
    const dados = {};
    chavesDoApp().forEach(function (chave) {
      if (chave !== KEY_ULTIMO_BACKUP) dados[chave] = localStorage.getItem(chave);
    });
    return { formato: BACKUP_FORMATO, versao: 1, criadoEm: new Date().toISOString(), posto: nomePosto(), dados: dados };
  }

  function nomeArquivoPosto() {
    return nomePosto().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "eletroposto";
  }

  function baixarBackup(prefixo) {
    const backup = montarBackup();
    const texto = JSON.stringify(backup);
    const link = document.createElement("a");
    let url = "";
    if (typeof Blob === "function" && window.URL && typeof URL.createObjectURL === "function") {
      url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
      link.href = url;
    } else {
      link.href = "data:application/json;charset=utf-8," + encodeURIComponent(texto);
    }
    link.download = (prefixo || "backup") + "-" + nomeArquivoPosto() + "-" + dataLocalISO(new Date()) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (url) setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    localStorage.setItem(KEY_ULTIMO_BACKUP, backup.criadoEm);
    atualizarAvisoBackup();
    atualizarResumoBackup();
    return backup;
  }

  function validarBackup(backup) {
    if (!backup || backup.formato !== BACKUP_FORMATO || !backup.dados || typeof backup.dados !== "object") {
      return "Este arquivo não é um backup do Eletroposto.";
    }
    const chaves = Object.keys(backup.dados);
    if (!chaves.length || chaves.some(function (chave) { return chave.indexOf(PREFIXO_CHAVES) !== 0 || typeof backup.dados[chave] !== "string"; })) {
      return "O backup está incompleto ou foi alterado. Escolha outro arquivo.";
    }
    return "";
  }

  // Impede que esta instância grave por cima dos dados novos antes de recarregar.
  function encerrarGravacoes() {
    window.__eletropostoInstanciaAtual = {};
  }

  function limparDadosDoApp() {
    chavesDoApp().forEach(function (chave) { localStorage.removeItem(chave); });
  }

  function recarregarApp() {
    try { window.location.reload(); } catch (e) {}
  }

  function restaurarBackup(backup) {
    baixarBackup("antes-de-restaurar");
    encerrarGravacoes();
    limparDadosDoApp();
    Object.keys(backup.dados).forEach(function (chave) { localStorage.setItem(chave, backup.dados[chave]); });
    localStorage.setItem(KEY_ULTIMO_BACKUP, new Date().toISOString());
    recarregarApp();
  }

  function diasDesdeBackup() {
    const ultimo = localStorage.getItem(KEY_ULTIMO_BACKUP);
    if (!ultimo) return null;
    return Math.floor((Date.now() - new Date(ultimo).getTime()) / DIA_MS);
  }

  function atualizarAvisoBackup() {
    const aviso = $("aviso-backup");
    if (!aviso) return;
    const dias = diasDesdeBackup();
    const temDados = abastecimentos.length > 0 || vendas.length > 0 || clientes.length > 0;
    const mostrar = ehAdmin() && !avisoBackupDispensado && temDados && (dias === null || dias >= BACKUP_LEMBRETE_DIAS);
    aviso.hidden = !mostrar;
    if (mostrar) {
      $("aviso-backup-texto").textContent = dias === null
        ? "Os dados ficam só neste aparelho e ainda não têm backup."
        : "O último backup foi há " + dias + " dias.";
    }
  }

  function atualizarResumoBackup() {
    const resumo = $("cfg-resumo-backup");
    if (!resumo) return;
    const ultimo = localStorage.getItem(KEY_ULTIMO_BACKUP);
    resumo.textContent = ultimo
      ? "Último backup em " + new Date(ultimo).toLocaleDateString("pt-BR")
      : "Nenhum backup feito neste aparelho";
  }

  $("btn-exportar-backup").addEventListener("click", function () {
    if (!exigirAdmin()) return;
    baixarBackup("backup");
    mostrarAlerta("Backup exportado. Guarde o arquivo fora deste aparelho.", "success");
  });
  $("btn-backup-aviso").addEventListener("click", function () {
    baixarBackup("backup");
    mostrarAlerta("Backup exportado. Guarde o arquivo fora deste aparelho.", "success");
  });
  $("btn-dispensar-aviso-backup").addEventListener("click", function () {
    avisoBackupDispensado = true;
    atualizarAvisoBackup();
  });
  $("btn-restaurar-backup").addEventListener("click", function () {
    if (!exigirAdmin()) return;
    $("arquivo-backup").value = "";
    $("arquivo-backup").click();
  });
  $("arquivo-backup").addEventListener("change", function () {
    const arquivo = this.files && this.files[0];
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onerror = function () { mostrarAlerta("Não foi possível ler o arquivo.", "error"); };
    leitor.onload = function () {
      let backup = null;
      try { backup = JSON.parse(leitor.result); } catch (e) {}
      const erro = validarBackup(backup);
      if (erro) {
        mostrarAlerta(erro, "error");
        return;
      }
      const quando = backup.criadoEm ? new Date(backup.criadoEm).toLocaleString("pt-BR") : "data desconhecida";
      confirmarApagamento(
        "Restaurar backup",
        "Os dados deste aparelho serão trocados pelos do backup de " + quando + " (" + (backup.posto || NOME_PADRAO) + "). Antes disso, o app baixa um backup do que está aqui agora.",
        "Restaurar",
        function () { restaurarBackup(backup); }
      );
    };
    leitor.readAsText(arquivo);
  });
  $("btn-recomecar").addEventListener("click", function () {
    if (!exigirAdmin()) return;
    confirmarApagamento(
      "Apagar tudo e configurar um posto novo",
      "Remove clientes, recargas, vendas, estoque, caixa, operadores e configurações deste aparelho. Não dá para desfazer. Exporte um backup antes se quiser guardar os dados.",
      "Apagar tudo",
      function () {
        encerrarGravacoes();
        limparDadosDoApp();
        recarregarApp();
      }
    );
  });
  atualizarAvisoBackup();
  atualizarResumoBackup();

  /* ---------------- Demonstração ---------------- */
  // Posto fictício para conhecer o sistema sem configurar nada. src/demo.js gera os dados
  // dos últimos 30 dias até agora; "Restaurar dados da demo" volta a esse estado.
  const KEY_DEMO = "eletroposto_demo";
  // Guardadas como texto puro, e não em JSON, como o app já faz com elas.
  const CHAVES_TEXTO_DEMO = ["ultimo_backup"];

  function carregarDemo() {
    encerrarGravacoes();
    limparDadosDoApp();
    const dados = gerarDadosDemo(new Date());
    Object.keys(dados).forEach(function (chave) {
      const valor = CHAVES_TEXTO_DEMO.indexOf(chave) >= 0 ? dados[chave] : JSON.stringify(dados[chave]);
      localStorage.setItem(PREFIXO_CHAVES + chave, valor);
    });
    localStorage.setItem(KEY_MODO, "admin");
    localStorage.setItem(KEY_DEMO, "1");
    recarregarApp();
  }

  $("btn-entrar-demo").addEventListener("click", carregarDemo);
  $("btn-restaurar-demo").addEventListener("click", carregarDemo);
  $("faixa-demo").hidden = localStorage.getItem(KEY_DEMO) !== "1";

  // Link direto para a demonstração (?demo). Só carrega num aparelho sem posto configurado,
  // para o link nunca apagar dados de verdade.
  if (new URLSearchParams(window.location.search).has("demo")) {
    if (primeiroUso) carregarDemo();
    else history.replaceState(null, "", window.location.pathname + window.location.hash);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  }
})();
