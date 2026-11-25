/* globais declarados em core.js */
/* global definirTurnos, getDadosTurnoAtual, arred, saldoDoCaixa, hashTexto */

// Dados de DEMONSTRAÇÃO. Pessoas, placas e valores são inventados.
// Gerador determinístico: a mesma semente produz o mesmo posto, sempre com os últimos 30 dias
// contados a partir de "agora", para a demo nunca parecer parada no tempo.

const DEMO_DIAS = 30;

const DEMO_TURNOS = [
  { id: 1, nome: "Manhã", inicio: "07:00", fim: "15:00" },
  { id: 2, nome: "Tarde", inicio: "15:00", fim: "23:00" }
];

const DEMO_BICOS = [{ potenciaKw: 60 }, { potenciaKw: 60 }, { potenciaKw: 40 }];

const DEMO_OPERADORES = [
  { id: "pf-demo-1", nome: "Carla Mendes", turno: 1 },
  { id: "pf-demo-2", nome: "Diego Rocha", turno: 1 },
  { id: "pf-demo-3", nome: "Lúcia Prado", turno: 2 },
  { id: "pf-demo-4", nome: "Bruno Siqueira", turno: 2 }
];

// [modelo, marca, potência máxima de recarga (kW), kWh médio por recarga, bateria (kWh), peso]
const DEMO_MODELOS = [
  ["Dolphin", "BYD", 60, 32, 44.9, 6],
  ["Dolphin Mini", "BYD", 40, 26, 38, 6],
  ["Yuan Plus", "BYD", 80, 42, 60.5, 3],
  ["Seal", "BYD", 150, 55, 82.5, 2],
  ["Ora 03", "GWM", 64, 34, 48, 3],
  ["EX30", "Volvo", 153, 45, 69, 2],
  ["Kwid E-Tech", "Renault", 30, 18, 26.8, 2],
  ["e-2008", "Peugeot", 100, 36, 50, 1]
];

const DEMO_NOMES = [
  "Adriana",
  "Caio",
  "Débora",
  "Eduardo",
  "Fabiana",
  "Gustavo",
  "Helena",
  "Igor",
  "Juliana",
  "Leandro",
  "Mônica",
  "Nelson",
  "Otávio",
  "Patrícia",
  "Renata",
  "Sérgio",
  "Tânia",
  "Vinícius"
];
const DEMO_SOBRENOMES = ["Albuquerque", "Barros", "Cardoso", "Duarte", "Farias", "Guimarães", "Moraes", "Teixeira"];

// [id, produto, variante, categoria, preço, estoque inicial, mínimo, ideal, peso nas vendas, repõe]
// Os três com "repõe" falso ficam sem reposição e terminam abaixo do mínimo.
const DEMO_PRODUTOS = [
  ["agua", "Água mineral", "500 ml", "Bebidas", 4, 60, 24, 72, 14, true],
  ["agua-gas", "Água com gás", "500 ml", "Bebidas", 5, 24, 8, 24, 3, true],
  ["refri-cola", "Refrigerante lata", "Cola", "Bebidas", 6, 36, 12, 36, 7, true],
  ["refri-guarana", "Refrigerante lata", "Guaraná", "Bebidas", 6, 36, 12, 36, 6, true],
  ["refri-limao", "Refrigerante lata", "Limão", "Bebidas", 6, 12, 6, 18, 3, false],
  ["suco", "Suco de caixinha", "Laranja 300 ml", "Bebidas", 7, 18, 6, 18, 2, true],
  ["energetico", "Energético", "250 ml", "Bebidas", 12, 12, 6, 18, 3, false],
  ["isotonico", "Isotônico", "500 ml", "Bebidas", 8, 12, 4, 12, 1, true],
  ["cafe", "Café", "Expresso", "Cafeteria", 5, 80, 30, 100, 12, true],
  ["cappuccino", "Café", "Cappuccino", "Cafeteria", 8, 40, 15, 50, 4, true],
  ["pao-queijo", "Pão de queijo", "Tradicional", "Cafeteria", 6, 40, 15, 50, 8, true],
  ["croissant", "Croissant", "Presunto e queijo", "Cafeteria", 9, 15, 6, 18, 2, true],
  ["chips", "Batata chips", "45 g", "Snacks", 9, 15, 6, 18, 3, true],
  ["barra", "Barra de cereal", "Castanhas", "Snacks", 4.5, 20, 8, 24, 3, true],
  ["chocolate", "Chocolate", "Ao leite 90 g", "Snacks", 10, 15, 6, 18, 3, true],
  ["amendoim", "Amendoim", "Japonês 70 g", "Snacks", 5, 15, 5, 15, 1, true],
  ["biscoito", "Biscoito recheado", "Chocolate", "Snacks", 5, 12, 6, 18, 3, false],
  ["cabo", "Cabo USB-C", "1 m", "Conveniência", 35, 6, 2, 6, 0.4, true],
  ["carregador", "Carregador veicular", "USB duplo", "Conveniência", 45, 4, 2, 5, 0.3, true],
  ["lenco", "Lenço umedecido", "Pacote", "Conveniência", 8, 10, 4, 12, 0.6, true]
];

const DEMO_TARIFA = 1.89;
const DEMO_FUNDO = { cedulas: 150, moedas: 40 };

function demoPrng(semente) {
  let a = semente >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function demoPlaca(rand) {
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const l = () => letras[Math.floor(rand() * 26)];
  const n = () => String(Math.floor(rand() * 10));
  return l() + l() + l() + n() + l() + n() + n();
}

function demoNomeProduto(p) {
  return p.variante ? p.nome + " — " + p.variante : p.nome;
}

// Monta todas as chaves do app (sem o prefixo "eletroposto_"), prontas para gravar no localStorage.
function gerarDadosDemo(agora, semente) {
  const rand = demoPrng(semente || 2026);
  const sorteio = (lista, pesos) => {
    const total = pesos.reduce((s, p) => s + p, 0);
    let r = rand() * total;
    for (let i = 0; i < lista.length; i++) {
      r -= pesos[i];
      if (r < 0) return lista[i];
    }
    return lista[lista.length - 1];
  };
  const entre = (min, max) => min + rand() * (max - min);
  let sequencia = 0;
  const id = (prefixo) => prefixo + "-demo-" + (++sequencia).toString(36);

  definirTurnos(DEMO_TURNOS);
  const agoraMs = agora.getTime();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicioDemo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (DEMO_DIAS - 1), 6, 50);

  const config = {
    tarifaKwh: DEMO_TARIFA,
    carregadores: DEMO_BICOS.map((b) => ({ potenciaKw: b.potenciaKw })),
    corPrimaria: "#f97316",
    corSecundaria: "#fff7ed",
    nomeSistema: "Eletroposto Demo",
    logoSistema: "./icon-512.png",
    textoAtendimento: "Atendimento todos os dias, das 7h às 23h.",
    localizacao: "",
    linkMapa: "",
    turnos: DEMO_TURNOS.map((t) => Object.assign({}, t)),
    // PIN 1234, avisado na faixa de demonstração (mesmo hash de hashPin em app.js).
    pinAdmin: { hash: hashTexto("eletroposto-pin:1234"), em: inicioDemo.toISOString() }
  };

  const modelos = DEMO_MODELOS.map((m) => ({
    modelo: m[0],
    marca: m[1],
    potenciaMaxKwh: m[2],
    mediaKwh: m[3],
    capacidadeBateria: m[4],
    criadoEm: inicioDemo.toISOString()
  }));

  const clientes = [];
  const placasUsadas = {};
  for (let i = 0; i < 48; i++) {
    let placa = demoPlaca(rand);
    while (placasUsadas[placa]) placa = demoPlaca(rand);
    placasUsadas[placa] = true;
    const modelo = sorteio(
      DEMO_MODELOS,
      DEMO_MODELOS.map((m) => m[5])
    );
    clientes.push({
      placa: placa,
      nome: DEMO_NOMES[i % DEMO_NOMES.length] + " " + DEMO_SOBRENOMES[Math.floor(rand() * DEMO_SOBRENOMES.length)],
      modelo: modelo[0],
      criadoEm: inicioDemo.toISOString()
    });
  }
  // Clientes frequentes voltam mais vezes: o peso cai ao longo da lista.
  const pesoCliente = clientes.map((c, i) => (i < 10 ? 5 : i < 25 ? 2 : 1));

  const produtos = [];
  const pais = {};
  DEMO_PRODUTOS.forEach(function (d) {
    if (!pais[d[1]]) {
      pais[d[1]] = {
        id: "pp-demo-" + d[0],
        tipo: "pai",
        nome: d[1],
        categoria: d[3],
        ativo: true,
        criadoEm: inicioDemo.toISOString()
      };
      produtos.push(pais[d[1]]);
    }
    produtos.push({
      id: "p-demo-" + d[0],
      tipo: "sku",
      produtoPaiId: pais[d[1]].id,
      nome: d[1],
      variante: d[2] || "Padrão",
      categoria: d[3],
      valor: d[4],
      estoque: d[5],
      estoqueMinimo: d[6],
      estoqueIdeal: d[7],
      ativo: true,
      criadoEm: inicioDemo.toISOString()
    });
  });
  const skus = produtos.filter((p) => p.tipo === "sku");
  const infoSku = {};
  DEMO_PRODUTOS.forEach((d) => {
    infoSku["p-demo-" + d[0]] = { peso: d[8], repoe: d[9], variante: d[2] };
  });
  const nomeSku = (sku) => demoNomeProduto({ nome: sku.nome, variante: infoSku[sku.id].variante });

  const registros = [];
  const vendas = [];
  const movimentosEstoque = [];
  const historicoCaixa = [];
  const operadorDoTurno = {};

  const quandoTurno = (data) => getDadosTurnoAtual(data);
  const movCaixa = (dados) => {
    const t = quandoTurno(new Date(dados.data));
    historicoCaixa.push(
      Object.assign({ id: id("cx"), turno: t.turnoId, dataOperacional: t.dataOperacional, automatico: true }, dados)
    );
  };

  [
    ["cedulas", "Cédulas"],
    ["moedas", "Moedas"]
  ].forEach(function (par) {
    const t = quandoTurno(inicioDemo);
    historicoCaixa.push({
      id: "saldo-inicial-" + par[0],
      data: inicioDemo.toISOString(),
      turno: t.turnoId,
      dataOperacional: t.dataOperacional,
      tipo: "entrada",
      origem: par[1],
      descricao: "Saldo inicial",
      operador: null,
      cedulas: par[0] === "cedulas" ? DEMO_FUNDO.cedulas : 0,
      moedas: par[0] === "moedas" ? DEMO_FUNDO.moedas : 0,
      valor: DEMO_FUNDO[par[0]],
      saldoInicial: true
    });
  });

  // Dinheiro em notas: o cliente entrega a menor nota (ou soma de notas) que cobre o valor;
  // com troco ímpar ele completa com R$ 1,00 em moeda, para o troco sair só em cédulas.
  function numerarioEmDinheiro(cobrado) {
    const notas = [10, 20, 50, 100, 150, 200];
    let entregue = notas.find((n) => n >= cobrado) || Math.ceil(cobrado / 50) * 50;
    let moedas = 0;
    let troco = entregue - cobrado;
    if (troco % 2 === 1) {
      moedas = 1;
      troco += 1;
    }
    if (troco === 0 && moedas === 0) entregue = cobrado;
    return {
      cedulasRecebidas: entregue,
      moedasRecebidas: moedas,
      cedulasTroco: troco,
      moedasTroco: 0,
      trocoPix: 0,
      recebido: entregue + moedas,
      troco: troco,
      trocoCorreto: troco,
      ajusteTroco: 0,
      excedente: 0,
      valorCobrado: cobrado,
      arredondamento: 0
    };
  }

  function lancarDinheiro(referencia, origem, numerario, quando, operador) {
    const entrada = arred(numerario.cedulasRecebidas + numerario.moedasRecebidas);
    movCaixa({
      data: quando,
      tipo: "entrada",
      origem: origem,
      descricao: "Recebimento em dinheiro",
      cedulas: numerario.cedulasRecebidas,
      moedas: numerario.moedasRecebidas,
      valor: entrada,
      operador: operador,
      referencia: referencia
    });
    if (numerario.troco > 0) {
      movCaixa({
        data: quando,
        tipo: "saida",
        origem: origem,
        descricao: "Troco ao cliente",
        cedulas: numerario.cedulasTroco,
        moedas: numerario.moedasTroco,
        valor: numerario.troco,
        operador: operador,
        referencia: referencia
      });
    }
  }

  const METODOS = ["Pix", "Crédito", "Débito", "Dinheiro"];
  const PESO_METODOS_RECARGA = [52, 18, 14, 16];
  const PESO_METODOS_VENDA = [45, 12, 18, 25];

  function registrarRecarga(inicio, fim, bico, cliente, operador, t) {
    const modelo = DEMO_MODELOS.find((m) => m[0] === cliente.modelo);
    const kwh = arred(Math.max(8, modelo[3] * entre(0.6, 1.25)));
    const valor = kwh * DEMO_TARIFA;
    const metodo = sorteio(METODOS, PESO_METODOS_RECARGA);
    // Em dinheiro o app aceita cobrar até R$ 1,99 a mais ou a menos: arredonda para o real inteiro.
    const numerario = metodo === "Dinheiro" ? numerarioEmDinheiro(Math.round(valor)) : null;
    const cobrado = numerario ? numerario.valorCobrado : valor;
    const diferenca = numerario ? arred(cobrado - valor) : 0;
    const bateriaInicial = Math.round(entre(12, 40));
    const registro = {
      id: id("ab"),
      sessaoOrigemId: id("s"),
      placa: cliente.placa,
      cliente: cliente.nome,
      modelo: cliente.modelo,
      bico: bico,
      kwh: kwh,
      consumoQuantidade: 0,
      consumoValorTotal: null,
      pendenteFin: false,
      operador: operador,
      perfil: operador,
      turno: t.turnoId,
      dataOperacional: t.dataOperacional,
      inicioTurno: t.inicioTurno,
      fimTurno: t.fimTurno,
      kwhUtilizado: kwh,
      kwhPartes: [],
      valorKwh: DEMO_TARIFA,
      valorPagar: valor,
      totalComConsumo: valor,
      valorCobrado: valor,
      arredondamentoDinheiro: diferenca,
      metodoPagamento: metodo,
      pagamentoDividido: "Não",
      detalhesPagamento: null,
      consumoConveniencia: "Não",
      valorConsumo: 0,
      consumoProduto: null,
      consumoProdutos: [],
      valorEntregue: numerario ? numerario.recebido : null,
      troco: numerario ? numerario.troco : null,
      trocoPix: 0,
      trocoCorreto: numerario ? numerario.trocoCorreto : null,
      ajusteTroco: numerario ? 0 : null,
      valorExcedente: 0,
      diferencaDinheiroConfirmada: diferenca,
      descontoConcedido: diferenca < 0 ? -diferenca : 0,
      valorPagoEfetivo: cobrado,
      inicio: inicio.toISOString(),
      duracaoSegundos: Math.round((fim - inicio) / 1000),
      bateriaInicial: bateriaInicial,
      bateriaAlvo: Math.min(100, bateriaInicial + Math.round((kwh / modelo[4]) * 100)),
      percentualAbastecido: Math.min(100 - bateriaInicial, Math.round((kwh / modelo[4]) * 100)),
      data: fim.toISOString()
    };
    registros.push(registro);
    if (numerario) {
      lancarDinheiro(
        { tipo: "abastecimento", id: registro.id },
        "Abastecimento " + registro.placa,
        numerario,
        registro.data,
        operador
      );
    }
  }

  function registrarVenda(quando, operador, t) {
    const itens = [];
    const quantidadeItens = rand() < 0.3 ? 2 : 1;
    for (let i = 0; i < quantidadeItens; i++) {
      const sku = sorteio(
        skus,
        skus.map((s) => (s.estoque > 0 ? infoSku[s.id].peso : 0))
      );
      if (!sku || sku.estoque <= 0 || itens.some((it) => it.sku === sku)) continue;
      const qtd = Math.min(sku.estoque, rand() < 0.2 ? 2 : 1);
      itens.push({ sku: sku, qtd: qtd });
    }
    if (!itens.length) return;
    const total = arred(itens.reduce((s, it) => s + it.sku.valor * it.qtd, 0));
    const metodo = sorteio(METODOS, PESO_METODOS_VENDA);
    // Venda em dinheiro da conveniência: o cliente paga o valor exato, sem troco.
    const numerario =
      metodo === "Dinheiro"
        ? {
            cedulasRecebidas: Math.floor(total),
            moedasRecebidas: arred(total - Math.floor(total)),
            cedulasTroco: 0,
            moedasTroco: 0,
            trocoPix: 0,
            recebido: total,
            troco: 0,
            trocoCorreto: 0,
            ajusteTroco: 0,
            excedente: 0,
            valorCobrado: total,
            arredondamento: 0
          }
        : null;
    const cobrancaId = id("cb");
    let primeiraVenda = null;
    itens.forEach(function (it, i) {
      const vendaId = id("v");
      if (i === 0) primeiraVenda = vendaId;
      const valorTotal = arred(it.sku.valor * it.qtd);
      const numerarioItem = i === 0 ? numerario : null;
      vendas.push({
        id: vendaId,
        cobrancaId: cobrancaId,
        produtoId: it.sku.id,
        produtoPaiId: it.sku.produtoPaiId,
        variante: it.sku.variante,
        itensCombo: null,
        alocacoesEstoque: null,
        estoqueReferenciaId: vendaId,
        estoqueBaixado: true,
        produto: nomeSku(it.sku),
        categoria: it.sku.categoria,
        valorUnitario: it.sku.valor,
        quantidade: it.qtd,
        valorTotal: valorTotal,
        valorOriginal: valorTotal,
        arredondamentoDinheiro: 0,
        metodoPagamento: metodo,
        turno: t.turnoId,
        dataOperacional: t.dataOperacional,
        inicioTurno: t.inicioTurno,
        fimTurno: t.fimTurno,
        operador: operador,
        perfil: operador,
        numerario: numerarioItem,
        trocoCorreto: numerarioItem ? 0 : null,
        ajusteTroco: numerarioItem ? 0 : null,
        data: quando.toISOString()
      });
      it.sku.estoque -= it.qtd;
    });
    if (numerario) {
      lancarDinheiro(
        { tipo: "venda", id: primeiraVenda },
        "Venda " + itens.map((it) => nomeSku(it.sku)).join(", "),
        numerario,
        quando.toISOString(),
        operador
      );
    }
  }

  // Reposição semanal (segunda de manhã) até o estoque ideal, menos para os itens esquecidos.
  function repor(quando) {
    const t = quandoTurno(quando);
    skus.forEach(function (sku) {
      if (!infoSku[sku.id].repoe || sku.estoque >= sku.estoqueIdeal) return;
      const antes = sku.estoque;
      const quantidade = sku.estoqueIdeal - antes;
      sku.estoque = sku.estoqueIdeal;
      movimentosEstoque.push({
        id: id("me"),
        data: quando.toISOString(),
        produtoId: sku.id,
        produtoPaiId: sku.produtoPaiId,
        produto: nomeSku(sku),
        tipo: "reposicao",
        quantidade: quantidade,
        estoqueAntes: antes,
        estoqueDepois: sku.estoque,
        operadorId: "",
        operadorNome: "Admin",
        turno: t.turnoId,
        dataOperacional: t.dataOperacional
      });
    });
  }

  // Fechamento: o operador leva o dinheiro do turno e a gaveta volta ao fundo de troco.
  function fecharTurno(quando, operador, t) {
    const saldo = saldoDoCaixa(historicoCaixa);
    const cedulas = arred(Math.max(0, saldo.cedulas - DEMO_FUNDO.cedulas));
    const moedas = arred(Math.max(0, saldo.moedas - DEMO_FUNDO.moedas));
    if (cedulas + moedas <= 0) return;
    historicoCaixa.push({
      id: id("r"),
      data: quando.toISOString(),
      turno: t.turnoId,
      dataOperacional: t.dataOperacional,
      tipo: "retirada",
      origem: "Retirada",
      descricao:
        "Fechamento de Turno " +
        String(t.turnoId).padStart(2, "0") +
        " - " +
        t.dataOperacional.split("-").reverse().join("/"),
      operador: { id: operador.id, nome: operador.nome },
      cedulas: cedulas,
      moedas: moedas,
      valor: arred(cedulas + moedas),
      fechamentoTurno: { turno: t.turnoId, dataDe: t.dataOperacional, dataAte: t.dataOperacional }
    });
  }

  const sessoes = [];
  // Até quando cada carro está ocupado: o mesmo carro nunca carrega em dois bicos ao mesmo tempo.
  const carroLivreEm = {};
  for (let d = DEMO_DIAS - 1; d >= 0; d--) {
    const dia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - d);
    const fimDeSemana = dia.getDay() === 0 || dia.getDay() === 6;
    if (dia.getDay() === 1 || d === DEMO_DIAS - 1) repor(new Date(dia.getTime() + 6.9 * 3600000));

    DEMO_TURNOS.forEach(function (turno, iTurno) {
      const [hIni, mIni] = turno.inicio.split(":").map(Number);
      const [hFim, mFim] = turno.fim.split(":").map(Number);
      const inicioTurno = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), hIni, mIni);
      const fimTurno = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), hFim, mFim);
      if (inicioTurno.getTime() > agoraMs) return;
      const doTurno = DEMO_OPERADORES.filter((o) => o.turno === turno.id);
      const op = doTurno[(DEMO_DIAS - d + iTurno) % doTurno.length];
      const operador = { id: op.id, nome: op.nome, turno: op.turno };
      operadorDoTurno[turno.id] = operador;
      const t = quandoTurno(new Date(inicioTurno.getTime() + 60000));

      // Recargas: chegadas espalhadas no turno; cada uma ocupa o bico que liberar primeiro.
      const chegadas = Math.round(entre(6, 9) + (fimDeSemana ? 2 : 0));
      const livreEm = DEMO_BICOS.map(() => inicioTurno.getTime());
      const horarios = [];
      for (let i = 0; i < chegadas; i++)
        horarios.push(inicioTurno.getTime() + entre(0.02, 0.85) * (fimTurno - inicioTurno));
      horarios.sort((a, b) => a - b);
      horarios.forEach(function (chegada) {
        let cliente = sorteio(clientes, pesoCliente);
        for (let i = 0; i < 20 && (carroLivreEm[cliente.placa] || 0) > chegada; i++)
          cliente = sorteio(clientes, pesoCliente);
        if ((carroLivreEm[cliente.placa] || 0) > chegada) return;
        const modelo = DEMO_MODELOS.find((m) => m[0] === cliente.modelo);
        let bico = 0;
        for (let b = 1; b < livreEm.length; b++) if (livreEm[b] < livreEm[bico]) bico = b;
        const inicio = new Date(Math.max(chegada, livreEm[bico]) + 3 * 60000);
        const potencia = Math.min(DEMO_BICOS[bico].potenciaKw, modelo[2]) * 0.8;
        const minutos = (modelo[3] / potencia) * 60 * entre(0.8, 1.3);
        const fim = new Date(inicio.getTime() + minutos * 60000);
        if (fim.getTime() > fimTurno.getTime() - 5 * 60000) return;
        if (fim.getTime() > agoraMs) {
          // Ainda carregando agora: vira uma sessão aberta na Operação.
          if (inicio.getTime() < agoraMs && !sessoes.some((s) => s.bico === bico + 1)) {
            sessoes.push({
              id: id("s"),
              placa: cliente.placa,
              cliente: cliente.nome,
              modelo: cliente.modelo,
              bateriaInicial: Math.round(entre(15, 35)),
              bateriaAlvo: 80,
              tempoEstimadoMin: Math.round(minutos),
              valorParada: null,
              bico: bico + 1,
              status: "carregando",
              operador: operador,
              inicio: inicio.toISOString(),
              kwhPartes: [],
              criadoEm: inicio.toISOString()
            });
            livreEm[bico] = fim.getTime();
            carroLivreEm[cliente.placa] = Infinity;
          }
          return;
        }
        livreEm[bico] = fim.getTime();
        carroLivreEm[cliente.placa] = fim.getTime() + 30 * 60000;
        registrarRecarga(inicio, fim, bico + 1, cliente, operador, quandoTurno(fim));
      });

      // Vendas da conveniência, independentes das recargas.
      const qtdVendas = Math.round(entre(1, 4) + (fimDeSemana ? 1 : 0));
      for (let i = 0; i < qtdVendas; i++) {
        const quando = new Date(inicioTurno.getTime() + entre(0.05, 0.95) * (fimTurno - inicioTurno));
        if (quando.getTime() > agoraMs) continue;
        registrarVenda(quando, operador, quandoTurno(quando));
      }

      const fechamento = new Date(fimTurno.getTime() - 3 * 60000);
      if (fechamento.getTime() <= agoraMs) fecharTurno(fechamento, operador, t);
    });
  }

  // Com o posto aberto, a Operação nunca fica vazia: completa até dois bicos carregando.
  const abertoAgora = DEMO_TURNOS.some(function (turno) {
    const [hIni, mIni] = turno.inicio.split(":").map(Number);
    const [hFim, mFim] = turno.fim.split(":").map(Number);
    const minutos = agora.getHours() * 60 + agora.getMinutes();
    return minutos >= hIni * 60 + mIni + 30 && minutos < hFim * 60 + mFim - 30;
  });
  if (abertoAgora) {
    const operadorAgora = operadorDoTurno[quandoTurno(agora).turnoId];
    for (let bico = 1; bico <= DEMO_BICOS.length && sessoes.length < 2; bico++) {
      if (sessoes.some((s) => s.bico === bico)) continue;
      const fimUltima = registros
        .filter((r) => r.bico === bico)
        .reduce((max, r) => Math.max(max, new Date(r.data).getTime()), 0);
      const inicio = Math.max(fimUltima + 2 * 60000, agoraMs - Math.round(entre(8, 30)) * 60000);
      if (inicio >= agoraMs - 60000) continue;
      const cliente = clientes.find(
        (c) => !sessoes.some((s) => s.placa === c.placa) && (carroLivreEm[c.placa] || 0) < inicio
      );
      if (!cliente) break;
      carroLivreEm[cliente.placa] = Infinity;
      sessoes.push({
        id: id("s"),
        placa: cliente.placa,
        cliente: cliente.nome,
        modelo: cliente.modelo,
        bateriaInicial: Math.round(entre(15, 35)),
        bateriaAlvo: 80,
        tempoEstimadoMin: Math.round(entre(35, 60)),
        valorParada: null,
        bico: bico,
        status: "carregando",
        operador: operadorAgora,
        inicio: new Date(inicio).toISOString(),
        kwhPartes: [],
        criadoEm: new Date(inicio).toISOString()
      });
    }
  }

  // Com o posto aberto, um cliente espera na fila.
  if (sessoes.length) {
    const naFila = clientes.find(
      (c) => !sessoes.some((s) => s.placa === c.placa) && (carroLivreEm[c.placa] || 0) < agoraMs
    );
    sessoes.push({
      id: id("s"),
      placa: naFila.placa,
      cliente: naFila.nome,
      modelo: naFila.modelo,
      bateriaInicial: null,
      bateriaAlvo: null,
      tempoEstimadoMin: null,
      bico: null,
      status: "aguardando",
      inicio: null,
      criadoEm: new Date(agoraMs - 4 * 60000).toISOString()
    });
  }

  const porData = (a, b) => new Date(a.data) - new Date(b.data);
  historicoCaixa.sort(porData);
  registros.sort(porData);
  vendas.sort(porData);
  movimentosEstoque.sort(porData);
  const saldo = saldoDoCaixa(historicoCaixa);
  const turnoAgora = quandoTurno(agora);
  const perfilAtivo = operadorDoTurno[turnoAgora.turnoId] || DEMO_OPERADORES[0];

  // Cadastros da aba Análise (chaves eletroposto_analise_*): localização e custos do posto e
  // concorrentes num raio de poucos quilômetros. Coordenadas numa cidade fictícia.
  const CENTRO = { lat: -15.83, lng: -48.02 };
  const mes = (deslocamento) => {
    const m = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento, 1);
    return m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0");
  };
  const analiseEstacoes = [
    {
      id: "posto",
      nome: config.nomeSistema,
      cidade: "Cidade Demo",
      uf: "DF",
      lat: CENTRO.lat,
      lng: CENTRO.lng,
      hubId: null,
      noPlano: true,
      custoKwh: 0.82,
      conectores: DEMO_BICOS.map((b, i) => ({ id: "posto-b" + (i + 1), tipo: "DC" }))
    }
  ];
  const analiseCustos = [-1, 0].map((d) => ({
    id: "custo-posto-" + mes(d),
    estacaoId: "posto",
    tipo: "fixo",
    mes: mes(d),
    valor: 4200
  }));
  const analiseConcorrentes = [];
  for (let i = 0; i < 14; i++) {
    const tipo = rand() < 0.7 ? "DC" : "AC";
    const preco = arred(tipo === "DC" ? 1.55 + rand() * 0.7 : 1.15 + rand() * 0.5);
    analiseConcorrentes.push({
      id: "conc-demo-" + (i + 1),
      nome: "Concorrente Demo " + (i + 1),
      lat: Math.round((CENTRO.lat + (rand() - 0.5) * 0.14) * 1e5) / 1e5,
      lng: Math.round((CENTRO.lng + (rand() - 0.5) * 0.16) * 1e5) / 1e5,
      tipo: tipo,
      potenciaKw: tipo === "DC" ? [40, 60, 60, 120][Math.floor(rand() * 4)] : [7, 11, 22][Math.floor(rand() * 3)],
      preco: preco,
      ocupacaoPorHora: Array.from({ length: 24 }, (_, h) =>
        arred(Math.max(0, Math.sin(((h - 6) / 18) * Math.PI)) * (0.35 + rand() * 0.35))
      ),
      coletadoEm: new Date(hoje.getTime() - Math.floor(rand() * 5) * 86400000).toISOString(),
      fonte: "demonstração"
    });
  }

  return {
    analise_hubs: [],
    analise_estacoes: analiseEstacoes,
    analise_custos: analiseCustos,
    analise_concorrentes: analiseConcorrentes,
    config: config,
    perfis: DEMO_OPERADORES.map((o) => ({ id: o.id, nome: o.nome, foto: "", turno: o.turno })),
    perfil_ativo: perfilAtivo.id,
    modelos: modelos,
    clientes: clientes,
    produtos: produtos,
    registros: registros,
    vendas: vendas,
    vendas_pre: [],
    sessoes: sessoes,
    movimentos_estoque: movimentosEstoque,
    caixa: { cedulas: saldo.cedulas, moedas: saldo.moedas, porMovimentos: true, historico: historicoCaixa },
    ultimo_backup: agora.toISOString()
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { gerarDadosDemo, DEMO_PRODUTOS, DEMO_OPERADORES, DEMO_DIAS };
}
