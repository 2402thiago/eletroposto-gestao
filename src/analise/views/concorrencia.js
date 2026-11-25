// Concorrência: preço de cada estação contra os concorrentes no raio.

import { analisarEstacao, picoDeUso, picoDosVizinhos, precoPorHora } from "../core/concorrencia.js";
import { fmtDistancia, fmtPct, fmtPrecoKwh } from "../core/formato.js";
import { graficoPrecoPorHora, montarResponsivo } from "../ui/graficos.js";
import { estacoesAtivas } from "../data/fonte.js";
import { temLocalizacao } from "../data/posto.js";
import { nomeArquivo, planilhaAnaliseConcorrencia } from "../core/exportar.js";
import { baixarPlanilha } from "../ui/baixar.js";
import { esc, juntar } from "../ui/html.js";
import { removerMapa } from "../ui/mapa.js";
import { montarHash } from "../ui/rotas.js";

const FILTROS = [
  { valor: "todos", rotulo: "Todos", teste: () => true },
  { valor: "DC", rotulo: "Rápidos (DC)", teste: (c) => c.tipo === "DC" },
  { valor: "AC", rotulo: "Lentos (AC)", teste: (c) => c.tipo === "AC" },
  { valor: "preco", rotulo: "Com preço", teste: (c) => c.preco != null }
];
const DIAS_PICO = 30;

function precoUnidade(p) {
  return p == null ? "sem preço" : fmtPrecoKwh(p) + "/kWh";
}

function diferencaTexto(a) {
  if (a.diferenca == null)
    return a.seuPreco == null ? "Cadastre o seu preço para comparar" : "Sem concorrentes com preço no raio";
  const valor = fmtPrecoKwh(Math.abs(a.diferenca)) + "/kWh";
  if (Math.abs(a.diferenca) < 0.005) return "Igual à mediana";
  return valor + (a.diferenca > 0 ? " acima" : " abaixo") + " da mediana";
}

function etiquetaHtml(a) {
  const segmento = a.etiqueta.chave === "sem-preco" ? "" : " · " + a.segmento;
  return '<span class="etiqueta etiqueta-' + a.etiqueta.chave + '">' + esc(a.etiqueta.rotulo + segmento) + "</span>";
}

function cartaoEstacao(a, selecionada) {
  const e = a.estacao;
  const concorrentes =
    a.concorrentesComPreco +
    (a.concorrentesComPreco === 1 ? " concorrente" : " concorrentes") +
    (a.mercadoRaso ? " · mercado raso" : "");
  return (
    '<li><button type="button" class="estacao-cartao" data-estacao="' +
    esc(e.id) +
    '" aria-pressed="' +
    String(selecionada) +
    '">' +
    '<span class="cartao-topo"><strong>' +
    esc(e.nome) +
    '</strong><span class="raio">raio ' +
    a.raioKm +
    " km</span></span>" +
    '<span class="muted">' +
    esc(juntar(e.cidade, e.uf, a.potenciaKw + " kW")) +
    "</span>" +
    etiquetaHtml(a) +
    '<span class="cartao-precos">' +
    '<span><span class="muted">Seu preço</span><strong class="num">' +
    fmtPrecoKwh(a.seuPreco) +
    "</strong></span>" +
    '<span class="dir"><span class="muted">Mediana</span><strong class="num">' +
    (a.mediana == null ? "—" : fmtPrecoKwh(a.mediana)) +
    "</strong></span>" +
    "</span>" +
    '<span class="cartao-rodape muted">' +
    esc(concorrentes) +
    "</span>" +
    "</button></li>"
  );
}

// Faixa de preço do mercado (mín. a máx.) com mediana e a posição da estação. A escala inclui o seu preço,
// para o marcador nunca sair da faixa.
function faixaHtml(a) {
  if (a.minimo == null) return '<p class="estado">Nenhum concorrente com preço neste segmento.</p>';
  const lo = Math.min(a.minimo, a.seuPreco ?? a.minimo);
  const hi = Math.max(a.maximo, a.seuPreco ?? a.maximo);
  const pos = (v) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
  const voce =
    a.seuPreco == null
      ? ""
      : '<div class="faixa-voce' +
        (pos(a.seuPreco) < 15 ? " borda-inicio" : pos(a.seuPreco) > 85 ? " borda-fim" : "") +
        '" style="left:' +
        pos(a.seuPreco).toFixed(1) +
        '%"><span>Você ' +
        fmtPrecoKwh(a.seuPreco) +
        "</span></div>";
  return (
    '<div class="faixa" role="img" aria-label="' +
    esc(
      "Mercado de " +
        fmtPrecoKwh(a.minimo) +
        " a " +
        fmtPrecoKwh(a.maximo) +
        ", mediana " +
        fmtPrecoKwh(a.mediana) +
        (a.seuPreco != null ? ", seu preço " + fmtPrecoKwh(a.seuPreco) : "")
    ) +
    '">' +
    '<div class="faixa-trilho">' +
    '<div class="faixa-mercado" style="left:' +
    pos(a.minimo).toFixed(1) +
    "%;right:" +
    (100 - pos(a.maximo)).toFixed(1) +
    '%"></div>' +
    '<div class="faixa-mediana" style="left:' +
    pos(a.mediana).toFixed(1) +
    '%"></div>' +
    voce +
    "</div>" +
    '<div class="faixa-legenda num"><span>mín. ' +
    fmtPrecoKwh(a.minimo) +
    "</span><span>mediana " +
    fmtPrecoKwh(a.mediana) +
    "</span><span>máx. " +
    fmtPrecoKwh(a.maximo) +
    "</span></div>" +
    "</div>"
  );
}

function picoHtml(proprio, vizinhos) {
  const seu = proprio
    ? "<strong>" +
      proprio.hora +
      "h</strong><span>" +
      proprio.cargasNaHora +
      " das " +
      proprio.totalCargas +
      " cargas dos últimos " +
      DIAS_PICO +
      " dias começaram nessa hora</span>"
    : "<strong>—</strong><span>Sem cargas nos últimos " + DIAS_PICO + " dias</span>";
  const viz = vizinhos
    ? "<strong>" +
      vizinhos.hora +
      "h</strong><span>" +
      fmtPct(vizinhos.ocupacao) +
      " em uso nessa hora, em média</span>"
    : "<strong>—</strong><span>Concorrentes sem dado de ocupação</span>";
  return (
    '<dl class="picos"><div><dt>Seu pico</dt><dd>' +
    seu +
    "</dd></div><div><dt>Vizinhos</dt><dd>" +
    viz +
    "</dd></div></dl>"
  );
}

function listaConcorrentes(a, filtro) {
  const f = FILTROS.find((x) => x.valor === filtro) || FILTROS[0];
  const lista = a.concorrentes.filter(f.teste);
  const botoes = FILTROS.map(
    (x) =>
      '<button type="button" class="filtro" data-filtro="' +
      x.valor +
      '" aria-pressed="' +
      String(x.valor === f.valor) +
      '">' +
      x.rotulo +
      "</button>"
  ).join("");
  const linhas = lista.length
    ? lista
        .map(
          (c) =>
            '<tr><th scope="row">' +
            esc(c.nome) +
            "</th>" +
            "<td>" +
            (c.tipo === "DC" ? "Rápido" : "Lento") +
            " · " +
            c.potenciaKw +
            " kW</td>" +
            '<td class="num">' +
            fmtDistancia(c.distanciaKm) +
            "</td>" +
            '<td class="num">' +
            precoUnidade(c.preco) +
            "</td></tr>"
        )
        .join("")
    : '<tr><td colspan="4" class="estado">Nenhum concorrente neste filtro.</td></tr>';
  return (
    '<div class="filtros" role="group" aria-label="Filtrar concorrentes">' +
    botoes +
    "</div>" +
    '<div class="tabela-rolagem" tabindex="0" role="region" aria-label="Concorrentes no raio"><table class="tabela-concorrentes"><thead><tr><th scope="col">Concorrente</th><th scope="col">Tipo</th><th scope="col">Distância</th><th scope="col">Preço</th></tr></thead><tbody>' +
    linhas +
    "</tbody></table></div>"
  );
}

function detalheHtml(a, ctx) {
  const e = a.estacao;
  const vizinho = a.vizinhoMaisProximo;
  const coleta = ctx.coletadoEm ? " Coleta mais recente: " + ctx.coletadoEm.toLocaleDateString("pt-BR") + "." : "";
  return (
    '<div class="detalhe-cabeca">' +
    '<h2 id="t-detalhe">' +
    esc(e.nome) +
    "</h2>" +
    '<p class="muted">' +
    esc(juntar(e.cidade, e.uf, a.potenciaKw + " kW")) +
    " · raio " +
    a.raioKm +
    " km" +
    (a.adaptado ? " (ampliado por falta de concorrentes)" : "") +
    "</p>" +
    etiquetaHtml(a) +
    "</div>" +
    '<div class="resumo-preco">' +
    '<div class="resumo-seu"><span>Seu preço</span><strong class="num">' +
    precoUnidade(a.seuPreco) +
    "</strong></div>" +
    '<div class="resumo-mediana"><span>Mediana dos ' +
    a.segmento +
    '</span><strong class="num">' +
    (a.mediana == null ? "—" : precoUnidade(a.mediana)) +
    "</strong></div>" +
    '<p class="resumo-diferenca">' +
    esc(diferencaTexto(a)) +
    "</p>" +
    "</div>" +
    '<section class="sub" aria-labelledby="t-faixa"><h3 id="t-faixa">Onde você está no mercado</h3>' +
    '<p class="muted">' +
    a.concorrentesComPreco +
    " concorrentes " +
    a.segmento +
    " com preço no raio" +
    (a.mercadoRaso ? ". Mercado raso: poucos preços para comparar." : ".") +
    "</p>" +
    faixaHtml(a) +
    "</section>" +
    '<section class="sub" aria-labelledby="t-horas"><h3 id="t-horas">Preço ao longo do dia</h3>' +
    '<p class="muted">Barras: mediana dos rápidos (DC) em cada hora. Linha: o seu preço. Barra destacada: agora (' +
    ctx.horaAtual +
    "h).</p>" +
    '<div class="grafico-horas"></div>' +
    (a.tipo === "AC"
      ? '<p class="muted">Sua estação é lenta (AC); o gráfico mostra os rápidos como referência.</p>'
      : "") +
    "</section>" +
    '<section class="sub" aria-labelledby="t-pico"><h3 id="t-pico">Pico de uso</h3>' +
    picoHtml(ctx.pico, picoDosVizinhos(a.concorrentes)) +
    "</section>" +
    '<section class="sub" aria-labelledby="t-mapa"><h3 id="t-mapa">Mapa da região</h3>' +
    (vizinho
      ? '<p class="muted">Rápido mais próximo: ' +
        esc(vizinho.nome) +
        " · " +
        precoUnidade(vizinho.preco) +
        " · " +
        fmtDistancia(vizinho.distanciaKm) +
        "</p>"
      : "") +
    '<div class="mapa" id="mapa" aria-label="Mapa com a estação e os concorrentes no raio"></div>' +
    '<ul class="mapa-legenda"><li><span class="pino pino-voce"></span>Sua estação</li><li><span class="pino pino-dc"></span>Rápido (DC), com preço</li><li><span class="pino pino-ac"></span>Lento (AC)</li></ul>' +
    "</section>" +
    '<section class="sub" aria-labelledby="t-lista"><h3 id="t-lista">Concorrentes no raio (' +
    a.concorrentes.length +
    ")</h3>" +
    '<p class="muted">Preços de referência, não em tempo real.' +
    esc(coleta) +
    "</p>" +
    "<div data-lista-concorrentes>" +
    listaConcorrentes(a, ctx.filtro) +
    "</div>" +
    "</section>"
  );
}

async function desenharMapa(el, a) {
  const L = await import("../vendor/leaflet/leaflet-src.esm.js");
  const e = a.estacao;
  const mapa = L.map(el, { scrollWheelZoom: false });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapa);
  L.circle([e.lat, e.lng], { radius: a.raioKm * 1000, className: "mapa-raio" }).addTo(mapa);
  const rotulo = (classe, texto) =>
    L.divIcon({
      className: "",
      html: '<span class="pino-rotulo ' + classe + '">' + esc(texto) + "</span>",
      iconSize: null
    });
  for (const c of a.concorrentes) {
    const icone =
      c.tipo === "DC" && c.preco != null
        ? rotulo("pino-dc", fmtPrecoKwh(c.preco).replace("R$ ", ""))
        : L.divIcon({
            className: "",
            html: '<span class="pino pino-' + (c.tipo === "DC" ? "dc" : "ac") + '"></span>',
            iconSize: null
          });
    L.marker([c.lat, c.lng], { icon: icone, title: c.nome + " · " + precoUnidade(c.preco) }).addTo(mapa);
  }
  L.marker([e.lat, e.lng], {
    icon: rotulo("pino-voce", "Você " + fmtPrecoKwh(e.precoKwh).replace("R$ ", "")),
    title: e.nome,
    zIndexOffset: 1000
  }).addTo(mapa);
  // Sem animação: a tela pode trocar de estação logo em seguida.
  mapa.fitBounds(L.latLng(e.lat, e.lng).toBounds(a.raioKm * 2000), { padding: [8, 8], animate: false });
  return mapa;
}

export function renderizar(alvo, { dados, hoje, params, caminho }) {
  const hora = hoje.getHours();
  const ativas = estacoesAtivas(dados.estacoes);
  // Sem localização não há raio: a estação fica de fora até ser marcada no mapa (ex.: posto vindo do app).
  const semLocal = ativas.filter((e) => !temLocalizacao(e));
  const analises = ativas.filter(temLocalizacao).map((e) => analisarEstacao(e, dados.concorrentes, hora));
  const coletas = dados.concorrentes
    .map((c) => c.coletadoEm)
    .filter(Boolean)
    .sort();
  const coletadoEm = coletas.length ? new Date(coletas[coletas.length - 1]) : null;
  const desde = new Date(hoje.getTime() - DIAS_PICO * 86400000);
  let selecionada = analises.find((a) => a.estacao.id === params.get("estacao")) || analises[0];
  let filtro = "todos";
  let mapa = null;
  let geracao = 0;
  let pararGrafico = () => {};

  alvo.innerHTML =
    '<div class="page-head"><div><h1>Concorrência na região</h1>' +
    '<p class="muted subtitulo">Preço dos concorrentes no raio de cada estação. A decisão de preço é sua.</p></div>' +
    (analises.length
      ? '<button type="button" class="btn btn-secondary" data-acao="exportar-analise">Exportar análise (XLSX)</button>'
      : "") +
    "</div>" +
    (semLocal.length
      ? '<p class="aviso aviso-atencao" role="status">' +
        (semLocal.length === 1
          ? esc(semLocal[0].nome) + " está sem localização"
          : semLocal.length + " estações estão sem localização") +
        " e não entra na comparação. " +
        '<a href="' +
        montarHash("/cadastros", { aba: "estacoes" }) +
        '">Marcar no mapa</a></p>'
      : "") +
    (!dados.concorrentes.length && analises.length
      ? '<p class="aviso aviso-atencao" role="status">Nenhum concorrente cadastrado ainda. <a href="' +
        montarHash("/cadastros", { aba: "concorrentes" }) +
        '">Cadastrar concorrentes</a></p>'
      : "") +
    (analises.length
      ? '<div class="conc-grade"><section aria-label="Suas estações"><ul class="estacoes-lista">' +
        analises.map((a) => cartaoEstacao(a, a === selecionada)).join("") +
        '</ul></section><section class="card detalhe" aria-labelledby="t-detalhe" tabindex="-1"></section></div>'
      : semLocal.length
        ? ""
        : '<section class="card estado">Nenhuma estação ativa. <a href="' +
          montarHash("/cadastros", { aba: "estacoes" }) +
          '">Cadastre uma estação</a> para comparar preços.</section>');
  if (!analises.length) return null;
  const detalhe = alvo.querySelector(".detalhe");

  function desenharDetalhe() {
    pararGrafico();
    removerMapa(mapa);
    mapa = null;
    const recs = dados.recargas.filter(
      (r) => r.estacaoId === selecionada.estacao.id && new Date(r.inicio) >= desde && new Date(r.inicio) <= hoje
    );
    detalhe.innerHTML = detalheHtml(selecionada, { horaAtual: hora, pico: picoDeUso(recs), filtro, coletadoEm });
    const horas = precoPorHora(selecionada.concorrentes);
    const seuPreco = selecionada.seuPreco;
    pararGrafico = montarResponsivo(detalhe.querySelector(".grafico-horas"), (largura) =>
      graficoPrecoPorHora({
        horas,
        seuPreco,
        horaAtual: hora,
        descricao: "Mediana de preço dos concorrentes rápidos por hora e o seu preço",
        largura
      })
    );
    const minha = ++geracao;
    const el = detalhe.querySelector("#mapa");
    desenharMapa(el, selecionada)
      .then((m) => {
        if (minha === geracao) mapa = m;
        else removerMapa(m);
      })
      .catch((erro) => {
        console.error(erro);
        el.innerHTML = '<p class="estado">Não foi possível carregar o mapa.</p>';
      });
  }

  function aoClicar(ev) {
    if (ev.target.closest('[data-acao="exportar-analise"]')) {
      baixarPlanilha(planilhaAnaliseConcorrencia(analises, hora), nomeArquivo("analise-concorrencia", hoje));
      return;
    }
    const cartao = ev.target.closest("[data-estacao]");
    if (cartao) {
      selecionada = analises.find((a) => a.estacao.id === cartao.dataset.estacao);
      for (const b of alvo.querySelectorAll("[data-estacao]")) b.setAttribute("aria-pressed", String(b === cartao));
      history.replaceState(null, "", montarHash(caminho, { estacao: selecionada.estacao.id }));
      filtro = "todos";
      desenharDetalhe();
      // No celular o detalhe fica abaixo da lista: leva o foco (e a rolagem) até ele.
      if (window.matchMedia && !matchMedia("(min-width: 1024px)").matches) detalhe.focus();
      return;
    }
    const f = ev.target.closest("[data-filtro]");
    if (f) {
      filtro = f.dataset.filtro;
      detalhe.querySelector("[data-lista-concorrentes]").innerHTML = listaConcorrentes(selecionada, filtro);
      detalhe.querySelector('[data-filtro="' + filtro + '"]').focus();
    }
  }

  desenharDetalhe();
  alvo.addEventListener("click", aoClicar);
  return () => {
    geracao++;
    pararGrafico();
    removerMapa(mapa);
    alvo.removeEventListener("click", aoClicar);
  };
}
