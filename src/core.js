/* Eletroposto — núcleo de lógica pura (sem DOM). Carregado antes de app.js; testável via Vitest. */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s) {
  return escapeHtml(s);
}
const fmt = (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtKwh = (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const fmtKwh2 = (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad2 = (n) => String(n).padStart(2, "0");
function hexParaRgb(hex) {
  const h = String(hex || "")
    .replace("#", "")
    .trim();
  if (h.length === 3) {
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
  }
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}
function ajustarHex(hex, fator) {
  const rgb = hexParaRgb(hex);
  if (!rgb) return hex;
  const ajustar = (v) => Math.max(0, Math.min(255, Math.round(v * fator)));
  return (
    "#" +
    [ajustar(rgb.r), ajustar(rgb.g), ajustar(rgb.b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}
function escurecerHex(hex, pct) {
  return ajustarHex(hex, 1 - pct);
}
function clarearHex(hex, pct) {
  return ajustarHex(hex, 1 + pct);
}
// Luminância relativa e razão de contraste conforme WCAG 2.x.
function luminanciaHex(hex) {
  const rgb = hexParaRgb(hex);
  if (!rgb) return null;
  const canal = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(rgb.r) + 0.7152 * canal(rgb.g) + 0.0722 * canal(rgb.b);
}
function contrasteHex(a, b) {
  const la = luminanciaHex(a);
  const lb = luminanciaHex(b);
  if (la === null || lb === null) return 0;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
// Escurece a cor até que texto branco sobre ela atinja o contraste mínimo.
function corComContrasteBranco(hex, minimo = 4.5) {
  if (!hexParaRgb(hex)) return hex;
  let cor = ajustarHex(hex, 1);
  for (let i = 0; i < 40 && contrasteHex(cor, "#FFFFFF") < minimo; i++) cor = escurecerHex(cor, 0.05);
  return cor;
}
function fmtMoeda(n) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function mascararKwhTres(val) {
  const digitos = String(val).replace(/\D/g, "");
  if (!digitos) return "";
  const d = String(parseInt(digitos, 10)).padStart(4, "0");
  return d.slice(0, -3) + "," + d.slice(-3);
}
function kwhDaMascara(val) {
  const digitos = String(val).replace(/\D/g, "");
  return digitos ? parseInt(digitos, 10) / 1000 : 0;
}
function mascararMoeda(val) {
  const digitos = String(val).replace(/\D/g, "");
  if (!digitos) return "";
  const num = parseInt(digitos, 10);
  const inteiros = String(Math.floor(num / 100));
  const decimais = String(num % 100).padStart(2, "0");
  const comPontos = inteiros.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return "R$ " + comPontos + "," + decimais;
}
function moedaDaMascara(val) {
  const digitos = String(val).replace(/\D/g, "");
  return digitos ? parseInt(digitos, 10) / 100 : 0;
}

// Turnos do posto, configuráveis em Configurações → Turnos. TURNOS fica indexado pelo id.
const TURNOS_PADRAO = [
  { id: 1, nome: "Turno 1", inicio: "07:00", fim: "16:48" },
  { id: 2, nome: "Turno 2", inicio: "16:48", fim: "01:30" }
];
const TURNOS = {};
let TURNOS_LISTA = [];

function definirTurnos(lista) {
  const validos = (Array.isArray(lista) && lista.length ? lista : TURNOS_PADRAO).filter(function (t) {
    return t && /^\d{2}:\d{2}$/.test(t.inicio) && /^\d{2}:\d{2}$/.test(t.fim) && t.inicio !== t.fim;
  });
  const usados = validos.length ? validos : TURNOS_PADRAO;
  Object.keys(TURNOS).forEach(function (k) {
    delete TURNOS[k];
  });
  TURNOS_LISTA = usados.map(function (t, i) {
    const turno = {
      id: Number(t.id) || i + 1,
      nome: String(t.nome || "Turno " + (i + 1)),
      inicio: t.inicio,
      fim: t.fim
    };
    TURNOS[turno.id] = turno;
    return turno;
  });
  return TURNOS_LISTA;
}

function listaTurnos() {
  return TURNOS_LISTA.slice();
}

function nomeTurno(id) {
  const t = TURNOS[Number(id)];
  return t ? t.nome : "Turno " + id;
}

// Confere uma lista de turnos: horários válidos, sem sobreposição, no máximo 4.
function validarTurnos(lista) {
  if (!Array.isArray(lista) || !lista.length) return "Cadastre pelo menos um turno.";
  if (lista.length > 4) return "O posto pode ter no máximo 4 turnos.";
  const inicioDia = parseTimeToMinutes(lista[0].inicio || "00:00");
  const faixas = [];
  for (let i = 0; i < lista.length; i++) {
    const t = lista[i];
    if (!String(t.nome || "").trim()) return "Dê um nome ao turno " + (i + 1) + ".";
    if (!/^\d{2}:\d{2}$/.test(t.inicio || "") || !/^\d{2}:\d{2}$/.test(t.fim || ""))
      return "Informe início e fim do " + t.nome + ".";
    if (t.inicio === t.fim) return "O início e o fim do " + t.nome + " não podem ser iguais.";
    const ini = (parseTimeToMinutes(t.inicio) - inicioDia + 1440) % 1440;
    const fim = (parseTimeToMinutes(t.fim) - inicioDia + 1440) % 1440 || 1440;
    if (fim <= ini) return "O " + t.nome + " termina depois do início do primeiro turno do dia seguinte.";
    faixas.push({ nome: t.nome, ini: ini, fim: fim });
  }
  faixas.sort(function (a, b) {
    return a.ini - b.ini;
  });
  for (let i = 1; i < faixas.length; i++) {
    if (faixas[i].ini < faixas[i - 1].fim)
      return "O " + faixas[i - 1].nome + " e o " + faixas[i].nome + " se sobrepõem.";
  }
  return "";
}

definirTurnos(TURNOS_PADRAO);

function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

// O dia operacional começa no início do primeiro turno. Um horário fora de todos os
// turnos conta no turno que acabou de terminar.
function getDadosTurnoAtual(dataReferencia = new Date()) {
  const d = dataReferencia instanceof Date ? dataReferencia : new Date(dataReferencia);
  const turnos = TURNOS_LISTA.length ? TURNOS_LISTA : definirTurnos(TURNOS_PADRAO);
  const inicioDia = parseTimeToMinutes(turnos[0].inicio);
  const agoraMin = d.getHours() * 60 + d.getMinutes();
  const minutosNoDia = (agoraMin - inicioDia + 1440) % 1440;
  const diaOperacional = new Date(d);
  if (agoraMin < inicioDia) diaOperacional.setDate(diaOperacional.getDate() - 1);
  diaOperacional.setHours(Math.floor(inicioDia / 60), inicioDia % 60, 0, 0);
  const faixas = turnos.map(function (t) {
    const ini = (parseTimeToMinutes(t.inicio) - inicioDia + 1440) % 1440;
    const fim = (parseTimeToMinutes(t.fim) - inicioDia + 1440) % 1440 || 1440;
    return { turno: t, ini: ini, fim: fim };
  });
  let atual = faixas.find(function (f) {
    return minutosNoDia >= f.ini && minutosNoDia < f.fim;
  });
  if (!atual) {
    const encerrados = faixas
      .filter(function (f) {
        return f.fim <= minutosNoDia;
      })
      .sort(function (a, b) {
        return b.fim - a.fim;
      });
    atual = encerrados[0] || faixas[faixas.length - 1];
  }
  const inicioTurno = new Date(diaOperacional.getTime() + atual.ini * 60000);
  const fimTurno = new Date(diaOperacional.getTime() + atual.fim * 60000);
  return {
    turnoId: atual.turno.id,
    dataOperacional: dataLocalISO(diaOperacional),
    inicioTurno: inicioTurno.toISOString(),
    fimTurno: fimTurno.toISOString()
  };
}

// Data operacional de um horário num turno escolhido (usada ao editar um registro).
function getDataOperacional(date, turnoId) {
  const d = date instanceof Date ? date : new Date(date);
  const totalMin = d.getHours() * 60 + d.getMinutes();
  const t = TURNOS[Number(turnoId)];
  if (t && parseTimeToMinutes(t.fim) < parseTimeToMinutes(t.inicio) && totalMin < parseTimeToMinutes(t.fim)) {
    return dataLocalISO(new Date(d.getTime() - 86400000));
  }
  return dataLocalISO(d);
}

function filtrarPorPeriodoTurno(registros, dataDe, dataAte, turnoId) {
  return registros
    .slice()
    .sort((a, b) => new Date(a.data) - new Date(b.data))
    .filter(function (r) {
      const turnoRegistro = r.turno || 1;
      if (turnoId && turnoRegistro !== turnoId) return false;
      const dia = r.dataOperacional || dataLocalISO(new Date(r.data));
      if (dataDe && dia < dataDe) return false;
      if (dataAte && dia > dataAte) return false;
      return true;
    });
}

function formatarDuracao(segundos) {
  segundos = Math.max(0, Math.floor(segundos));
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return pad(h) + ":" + pad(m) + ":" + pad(s);
}
function formatarData(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return (
    pad(d.getDate()) +
    "/" +
    pad(d.getMonth() + 1) +
    "/" +
    d.getFullYear() +
    " " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}
function dataLocalISO(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function ehPendente(r) {
  return r.metodoPagamento === "Pendente";
}
function detalhesPagamentoTexto(r) {
  if (r.pagamentoDividido === "Sim" && (r.detalhesPagamento || []).length) {
    return r.detalhesPagamento
      .map(function (p) {
        return p.metodo + " " + fmtMoeda(p.valor);
      })
      .join("; ");
  }
  return "";
}
function metodoPagamentoTexto(r) {
  if (ehPendente(r)) return "⏳ PENDENTE";
  if (r.pagamentoDividido === "Sim" && (r.detalhesPagamento || []).length >= 2) {
    return (
      "Múltiplos: " +
      r.detalhesPagamento
        .map(function (p) {
          return p.metodo;
        })
        .join(" + ")
    );
  }
  return r.metodoPagamento || "—";
}
function parcelasPagamento(r, valorPadrao) {
  let parcelas;
  if (r.pagamentoDividido === "Sim" && Array.isArray(r.detalhesPagamento) && r.detalhesPagamento.length) {
    parcelas = r.detalhesPagamento.map(function (parcela, indice) {
      return {
        idParcela: parcela.idParcela || "legada-" + indice,
        metodo: parcela.metodo || "Múltiplos",
        valor: Number(parcela.valor) || 0
      };
    });
  } else {
    const valor =
      valorPadrao == null
        ? Number(r.valorCobrado ?? r.totalComConsumo ?? r.valorPagar ?? r.valorTotal) || 0
        : Number(valorPadrao) || 0;
    parcelas = [{ idParcela: "unica", metodo: r.metodoPagamento || "—", valor: valor }];
  }
  // Troco em Pix: o dinheiro entrou a mais e o Pix saiu; a soma das parcelas continua igual ao total.
  const trocoPix = trocoPixDoRegistro(r);
  const dinheiro = parcelas.find(function (parcela) {
    return parcela.metodo === "Dinheiro";
  });
  if (trocoPix > 0 && dinheiro) {
    dinheiro.valor = arred(dinheiro.valor + trocoPix);
    parcelas.push({ idParcela: "troco-pix", metodo: "Pix", valor: -trocoPix });
  }
  return parcelas;
}
function trocoPixDoRegistro(r) {
  const valor = r.trocoPix != null ? r.trocoPix : r.numerario && r.numerario.trocoPix;
  return arred(Number(valor) || 0);
}
// Valida as parcelas de um pagamento dividido; retorna a mensagem de erro ou null.
function validarParcelasPagamento(linhas, totalEsperado, rotuloTotal) {
  if (linhas.length < 2) return "Informe pelo menos 2 métodos de pagamento.";
  if (linhas.some((l) => isNaN(l.valor) || l.valor <= 0)) {
    return "Preencha os valores de todas as parcelas do pagamento.";
  }
  const soma = linhas.reduce((s, l) => s + l.valor, 0);
  if (Math.abs(soma - totalEsperado) > 0.009) {
    return (
      "A soma das parcelas (" +
      fmtMoeda(soma) +
      ") não bate com o " +
      rotuloTotal +
      " (" +
      fmtMoeda(totalEsperado) +
      ")."
    );
  }
  return null;
}
function resumoPagamentos(registros, obterValor) {
  const resumo = { maquininha: 0, dinheiro: 0, outros: {} };
  (registros || []).forEach(function (registro) {
    const valor = obterValor ? obterValor(registro) : undefined;
    parcelasPagamento(registro, valor).forEach(function (parcela) {
      if (["Pix", "Crédito", "Débito"].includes(parcela.metodo)) resumo.maquininha += parcela.valor;
      else if (parcela.metodo === "Dinheiro") resumo.dinheiro += parcela.valor;
      else resumo.outros[parcela.metodo] = (resumo.outros[parcela.metodo] || 0) + parcela.valor;
    });
  });
  return resumo;
}
function arred(n) {
  return Math.round(n * 100) / 100;
}
function totalCaixa(c) {
  return arred((Number(c.cedulas) || 0) + (Number(c.moedas) || 0));
}
// Saldo do caixa pela soma dos movimentos. Entradas somam; trocos ("saida") e
// retiradas subtraem. Movimentos antigos sem cédulas/moedas separadas entram como
// cédulas, exceto os de origem "Moedas" (contagens).
function saldoDoCaixa(historico) {
  let cedulas = 0;
  let moedas = 0;
  (historico || []).forEach(function (mov) {
    if (!mov) return;
    const sinal = mov.tipo === "entrada" ? 1 : mov.tipo === "saida" || mov.tipo === "retirada" ? -1 : 0;
    if (!sinal) return;
    if (typeof mov.cedulas === "number" || typeof mov.moedas === "number") {
      cedulas += sinal * (Number(mov.cedulas) || 0);
      moedas += sinal * (Number(mov.moedas) || 0);
    } else if (mov.origem === "Moedas") {
      moedas += sinal * (Number(mov.valor) || 0);
    } else {
      cedulas += sinal * (Number(mov.valor) || 0);
    }
  });
  return { cedulas: arred(cedulas), moedas: arred(moedas) };
}

function caixaParaNumero(v) {
  const s = String(v).trim();
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", ".");
  return parseFloat(norm);
}
function subtrairDoCaixa(c, valor) {
  let restante = valor;
  const deCed = Math.min(Number(c.cedulas) || 0, restante);
  c.cedulas = arred((Number(c.cedulas) || 0) - deCed);
  restante = arred(restante - deCed);
  c.moedas = arred(Math.max(0, (Number(c.moedas) || 0) - restante));
}
function somarAoCaixa(c, valor) {
  c.cedulas = arred((Number(c.cedulas) || 0) + valor);
}
function filtrarPorPeriodo(registros, dataDe, dataAte) {
  return registros
    .slice()
    .sort((a, b) => new Date(a.data) - new Date(b.data))
    .filter(function (r) {
      const dia = dataLocalISO(new Date(r.data));
      if (dataDe && dia < dataDe) return false;
      if (dataAte && dia > dataAte) return false;
      return true;
    });
}
function xmlEsc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function celulaXlsx(ref, valor, estilo, tipo) {
  if (tipo === "num") {
    return '<c r="' + ref + '" s="' + estilo + '"><v>' + String(valor) + "</v></c>";
  }
  return '<c r="' + ref + '" t="inlineStr" s="' + estilo + '"><is><t>' + xmlEsc(valor) + "</t></is></c>";
}
function crc32(u8) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < u8.length; i++) crc = (crc >>> 8) ^ table[(crc ^ u8[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function zipStore(entries) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  let centralSize = 0;

  entries.forEach(function (e) {
    const name = enc.encode(e.name);
    const data = e.data;
    const crc = crc32(data);
    const n = name.length;

    const local = new Uint8Array(30 + n);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, n, true);
    local.set(name, 30);

    const cen = new Uint8Array(46 + n);
    const cdv = new DataView(cen.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, data.length, true);
    cdv.setUint32(24, data.length, true);
    cdv.setUint16(28, n, true);
    cdv.setUint32(42, offset, true);
    cen.set(name, 46);

    chunks.push(local, data);
    central.push(cen);
    offset += local.length + data.length;
    centralSize += cen.length;
  });

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  chunks.forEach(function (c) {
    out.set(c, pos);
    pos += c.length;
  });
  central.forEach(function (c) {
    out.set(c, pos);
    pos += c.length;
  });

  const eocd = new DataView(out.buffer, pos, 22);
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  return out;
}
function _gerarXLSX(registros, nomePerfil) {
  const cabecalho = [
    "#",
    "Data/Hora",
    "Duração (min)",
    "Placa",
    "Cliente",
    "Modelo",
    "Operador",
    "Turno",
    "Data Operacional",
    "Início Turno",
    "Fim Turno",
    "KWH Utilizado",
    "Valor do KWH",
    "Valor a Pagar",
    "Método de Pagamento",
    "Pagamento Dividido",
    "Detalhes do Pagamento",
    "Conveniência",
    "Valor do Consumo",
    "Bateria Inicial (%)",
    "Bateria Alvo (%)",
    "% Abastecido"
  ];
  const cols = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V"
  ];
  const totalKwh = registros.reduce((s, r) => s + r.kwhUtilizado, 0);
  const totalValor = registros.reduce((s, r) => s + r.valorPagar, 0);
  const totalConsumo = registros.reduce((s, r) => s + (r.consumoConveniencia === "Sim" ? r.valorConsumo || 0 : 0), 0);
  const totalDuracaoMin = registros.reduce((s, r) => s + (r.duracaoSegundos || 0) / 60, 0);
  const comPercentual = registros.filter((r) => r.percentualAbastecido != null);
  const mediaPercentual = comPercentual.length
    ? Math.round((comPercentual.reduce((s, r) => s + r.percentualAbastecido, 0) / comPercentual.length) * 100) / 100
    : null;

  let sheetData = '<row r="1">';
  cabecalho.forEach(function (h, i) {
    sheetData += celulaXlsx(cols[i] + "1", h, 1, "str");
  });
  sheetData += "</row>";

  registros.forEach(function (r, i) {
    const linha = i + 2;
    sheetData +=
      '<row r="' +
      linha +
      '">' +
      celulaXlsx("A" + linha, String(i + 1), 0, "str") +
      celulaXlsx("B" + linha, formatarData(r.data), 0, "str") +
      (r.duracaoSegundos != null
        ? celulaXlsx("C" + linha, Math.round((r.duracaoSegundos / 60) * 100) / 100, 3, "num")
        : celulaXlsx("C" + linha, "", 0, "str")) +
      celulaXlsx("D" + linha, r.placa, 0, "str") +
      celulaXlsx("E" + linha, r.cliente, 0, "str") +
      celulaXlsx("F" + linha, r.modelo, 0, "str") +
      celulaXlsx("G" + linha, r.perfil ? r.perfil.nome : "", 0, "str") +
      celulaXlsx("H" + linha, r.turno || 1, 0, "str") +
      celulaXlsx("I" + linha, r.dataOperacional || "", 0, "str") +
      celulaXlsx("J" + linha, r.inicioTurno ? formatarData(r.inicioTurno) : "", 0, "str") +
      celulaXlsx("K" + linha, r.fimTurno ? formatarData(r.fimTurno) : "", 0, "str") +
      celulaXlsx("L" + linha, r.kwhUtilizado, 3, "num") +
      celulaXlsx("M" + linha, r.valorKwh, 3, "num") +
      celulaXlsx("N" + linha, r.valorPagar, 2, "num") +
      celulaXlsx("O" + linha, r.metodoPagamento || "—", 0, "str") +
      celulaXlsx("P" + linha, r.pagamentoDividido === "Sim" ? "Sim" : "Não", 0, "str") +
      celulaXlsx("Q" + linha, detalhesPagamentoTexto(r), 0, "str") +
      celulaXlsx("R" + linha, r.consumoConveniencia === "Sim" ? "Sim" : "Não", 0, "str") +
      celulaXlsx("S" + linha, r.consumoConveniencia === "Sim" ? r.valorConsumo || 0 : 0, 2, "num") +
      (r.bateriaInicial != null
        ? celulaXlsx("T" + linha, r.bateriaInicial, 3, "num")
        : celulaXlsx("T" + linha, "", 0, "str")) +
      (r.bateriaAlvo != null
        ? celulaXlsx("U" + linha, r.bateriaAlvo, 3, "num")
        : celulaXlsx("U" + linha, "", 0, "str")) +
      (r.percentualAbastecido != null
        ? celulaXlsx("V" + linha, r.percentualAbastecido, 3, "num")
        : celulaXlsx("V" + linha, "", 0, "str")) +
      "</row>";
  });

  const linhaTotal = registros.length + 2;
  sheetData +=
    '<row r="' +
    linhaTotal +
    '">' +
    celulaXlsx("A" + linhaTotal, "", 0, "str") +
    celulaXlsx("B" + linhaTotal, "", 0, "str") +
    celulaXlsx("C" + linhaTotal, Math.round(totalDuracaoMin * 100) / 100, 3, "num") +
    celulaXlsx("D" + linhaTotal, "", 0, "str") +
    celulaXlsx("E" + linhaTotal, "TOTAL", 1, "str") +
    celulaXlsx("F" + linhaTotal, "", 0, "str") +
    celulaXlsx("G" + linhaTotal, nomePerfil || "", 0, "str") +
    celulaXlsx("H" + linhaTotal, "", 0, "str") +
    celulaXlsx("I" + linhaTotal, "", 0, "str") +
    celulaXlsx("J" + linhaTotal, "", 0, "str") +
    celulaXlsx("K" + linhaTotal, "", 0, "str") +
    celulaXlsx("L" + linhaTotal, totalKwh, 3, "num") +
    celulaXlsx("M" + linhaTotal, "", 0, "str") +
    celulaXlsx("N" + linhaTotal, totalValor, 2, "num") +
    celulaXlsx("O" + linhaTotal, "", 0, "str") +
    celulaXlsx("P" + linhaTotal, "", 0, "str") +
    celulaXlsx("Q" + linhaTotal, "", 0, "str") +
    celulaXlsx("R" + linhaTotal, "", 0, "str") +
    celulaXlsx("S" + linhaTotal, totalConsumo, 2, "num") +
    celulaXlsx("T" + linhaTotal, "", 0, "str") +
    celulaXlsx("U" + linhaTotal, "", 0, "str") +
    (mediaPercentual != null
      ? celulaXlsx("V" + linhaTotal, mediaPercentual, 3, "num")
      : celulaXlsx("V" + linhaTotal, "", 0, "str")) +
    "</row>";

  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    "<cols>" +
    '<col min="1" max="1" width="5"/>' +
    '<col min="2" max="2" width="18"/>' +
    '<col min="3" max="3" width="12"/>' +
    '<col min="4" max="4" width="12"/>' +
    '<col min="5" max="5" width="26"/>' +
    '<col min="6" max="6" width="20"/>' +
    '<col min="7" max="7" width="15"/>' +
    '<col min="8" max="8" width="13"/>' +
    '<col min="9" max="9" width="15"/>' +
    '<col min="10" max="10" width="16"/>' +
    '<col min="11" max="11" width="14"/>' +
    '<col min="12" max="12" width="30"/>' +
    '<col min="13" max="13" width="13"/>' +
    '<col min="14" max="14" width="16"/>' +
    '<col min="15" max="15" width="14"/>' +
    '<col min="16" max="16" width="14"/>' +
    '<col min="17" max="17" width="12"/>' +
    '<col min="18" max="18" width="14"/>' +
    "</cols>" +
    "<sheetData>" +
    sheetData +
    "</sheetData></worksheet>";

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    "</Types>";

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Relatorio" sheetId="1" r:id="rId1"/></sheets></workbook>';

  const workbookRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    "</Relationships>";

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="R$ #,##0.00"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>";

  const enc = new TextEncoder();
  return zipStore([
    { name: "[Content_Types].xml", data: enc.encode(contentTypesXml) },
    { name: "_rels/.rels", data: enc.encode(rootRelsXml) },
    { name: "xl/workbook.xml", data: enc.encode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(workbookRelsXml) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheetXml) },
    { name: "xl/styles.xml", data: enc.encode(stylesXml) }
  ]);
}
function gerarWorkbookXlsx(cabecalho, larguras, sheetData) {
  const cols = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q"];

  let rowData = '<row r="1">';
  cabecalho.forEach(function (h, i) {
    rowData += celulaXlsx(cols[i] + "1", h, 1, "str");
  });
  rowData += "</row>";
  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    "<cols>" +
    larguras
      .map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '"/>';
      })
      .join("") +
    "</cols>" +
    "<sheetData>" +
    rowData +
    sheetData +
    "</sheetData></worksheet>";
  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    "</Types>";
  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";
  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Relatorio" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const workbookRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    "</Relationships>";
  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="R$ #,##0.00"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>";
  const enc = new TextEncoder();
  return zipStore([
    { name: "[Content_Types].xml", data: enc.encode(contentTypesXml) },
    { name: "_rels/.rels", data: enc.encode(rootRelsXml) },
    { name: "xl/workbook.xml", data: enc.encode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(workbookRelsXml) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheetXml) },
    { name: "xl/styles.xml", data: enc.encode(stylesXml) }
  ]);
}
function _gerarXLSXVendas(registros) {
  const cabecalho = [
    "#",
    "Data/Hora",
    "Turno",
    "Data Operacional",
    "Início Turno",
    "Fim Turno",
    "Produto",
    "Categoria",
    "Quantidade",
    "Valor Unitário",
    "Valor Total",
    "Método de Pagamento"
  ];
  const larguras = [5, 18, 8, 15, 18, 18, 30, 20, 11, 14, 14, 18];
  const totalItens = registros.reduce((s, r) => s + r.quantidade, 0);
  const totalValor = registros.reduce((s, r) => s + r.valorTotal, 0);
  let sheetData = "";
  registros.forEach(function (r, i) {
    const linha = i + 2;
    sheetData +=
      '<row r="' +
      linha +
      '">' +
      celulaXlsx("A" + linha, String(i + 1), 0, "str") +
      celulaXlsx("B" + linha, formatarData(r.data), 0, "str") +
      celulaXlsx("C" + linha, r.turno || 1, 0, "str") +
      celulaXlsx("D" + linha, r.dataOperacional || "", 0, "str") +
      celulaXlsx("E" + linha, r.inicioTurno ? formatarData(r.inicioTurno) : "", 0, "str") +
      celulaXlsx("F" + linha, r.fimTurno ? formatarData(r.fimTurno) : "", 0, "str") +
      celulaXlsx("G" + linha, r.produto, 0, "str") +
      celulaXlsx("H" + linha, r.categoria, 0, "str") +
      celulaXlsx("I" + linha, r.quantidade, 3, "num") +
      celulaXlsx("J" + linha, r.valorUnitario, 2, "num") +
      celulaXlsx("K" + linha, r.valorTotal, 2, "num") +
      celulaXlsx("L" + linha, r.metodoPagamento || "—", 0, "str") +
      "</row>";
  });
  const linhaTotal = registros.length + 2;
  sheetData +=
    '<row r="' +
    linhaTotal +
    '">' +
    celulaXlsx("A" + linhaTotal, "", 0, "str") +
    celulaXlsx("B" + linhaTotal, "TOTAL", 1, "str") +
    celulaXlsx("C" + linhaTotal, "", 0, "str") +
    celulaXlsx("D" + linhaTotal, "", 0, "str") +
    celulaXlsx("E" + linhaTotal, "", 0, "str") +
    celulaXlsx("F" + linhaTotal, "", 0, "str") +
    celulaXlsx("G" + linhaTotal, "", 0, "str") +
    celulaXlsx("H" + linhaTotal, "", 0, "str") +
    celulaXlsx("I" + linhaTotal, totalItens, 3, "num") +
    celulaXlsx("J" + linhaTotal, "", 0, "str") +
    celulaXlsx("K" + linhaTotal, totalValor, 2, "num") +
    celulaXlsx("L" + linhaTotal, "", 0, "str") +
    "</row>";
  return gerarWorkbookXlsx(cabecalho, larguras, sheetData);
}

function statusEstoque(estoque, estoqueMinimo) {
  if (estoque === null || estoque === undefined || isNaN(estoque)) return "nao_informado";
  if (estoque <= 0) return "sem_estoque";
  if (estoque <= estoqueMinimo) return "baixo";
  return "ok";
}

// Situação para reposição: "faltando" já precisa repor (zerado ou no mínimo),
// "baixo" vai precisar logo (até 1,5× o mínimo), "sem" ainda não foi contado.
function situacaoEstoque(estoque, estoqueMinimo) {
  if (estoque === null || estoque === undefined || isNaN(estoque)) return "sem";
  const minimo = Number(estoqueMinimo) || 0;
  if (estoque <= minimo) return "faltando";
  if (estoque <= Math.ceil(minimo * 1.5)) return "baixo";
  return "ok";
}

// Quanto ter depois de repor: o ideal informado ou, sem ele, o dobro do mínimo.
function estoqueIdealDe(estoqueMinimo, estoqueIdeal) {
  const ideal = Number(estoqueIdeal);
  if (ideal > 0) return ideal;
  return (Number(estoqueMinimo) || 0) * 2;
}

function sugestaoReposicao(estoque, estoqueMinimo, estoqueIdeal) {
  const atual = typeof estoque === "number" && !isNaN(estoque) ? estoque : 0;
  return Math.max(0, estoqueIdealDe(estoqueMinimo, estoqueIdeal) - atual);
}

function _sortKeys(value) {
  if (Array.isArray(value)) return value.map(_sortKeys);
  if (value !== null && typeof value === "object") {
    const obj = {};
    Object.keys(value)
      .sort()
      .forEach(function (k) {
        obj[k] = _sortKeys(value[k]);
      });
    return obj;
  }
  return value;
}

function jsonCanonical(obj) {
  if (obj === null || obj === undefined) return "";
  return JSON.stringify(_sortKeys(obj));
}

/* global module */
// Resumo curto de um texto (cyrb53): guarda o PIN do admin sem o número em texto puro.
function hashTexto(texto) {
  const str = String(texto == null ? "" : texto);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ":" + str.length.toString(36);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    fmt,
    fmtKwh,
    fmtKwh2,
    pad2,
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
    trocoPixDoRegistro,
    validarParcelasPagamento,
    resumoPagamentos,
    arred,
    totalCaixa,
    saldoDoCaixa,
    caixaParaNumero,
    subtrairDoCaixa,
    somarAoCaixa,
    filtrarPorPeriodo,
    filtrarPorPeriodoTurno,
    getDadosTurnoAtual,
    getDataOperacional,
    parseTimeToMinutes,
    TURNOS,
    TURNOS_PADRAO,
    definirTurnos,
    listaTurnos,
    nomeTurno,
    validarTurnos,
    statusEstoque,
    situacaoEstoque,
    estoqueIdealDe,
    sugestaoReposicao,
    jsonCanonical,
    hashTexto,
    hexParaRgb,
    ajustarHex,
    escurecerHex,
    clarearHex,
    luminanciaHex,
    contrasteHex,
    corComContrasteBranco
  };
}
