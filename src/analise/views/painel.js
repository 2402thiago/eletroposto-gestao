// Painel: visão geral da operação no mês corrente.

import { fmtKwh, fmtMoeda, fmtMoedaCurta, fmtPct, fmtPontos, fmtVariacao } from "../core/formato.js";
import {
  faturamentoPorHub,
  filtrarEstacoes,
  operacao,
  receitaMensal,
  saudeFinanceira,
  statusEstacoes,
  STATUS_CONECTOR,
  topClientes
} from "../core/metricas.js";
import { potenciaDaEstacao } from "../core/concorrencia.js";
import { MESES_CURTOS, nomeDoMes, rotuloMesAte } from "../core/periodo.js";
import { graficoLinhasMensais, montarResponsivo } from "../ui/graficos.js";
import { estacoesAtivas } from "../data/fonte.js";
import { esc, horaMinuto, juntar, variacaoHtml } from "../ui/html.js";
import { montarHash } from "../ui/rotas.js";

const PLANOS = [
  { valor: "dentro", rotulo: "No plano" },
  { valor: "fora", rotulo: "Fora do plano" }
];
const ESTACOES_A_VISTA = 5;

function corDaSerie(i) {
  return "var(--serie-" + ((i % 6) + 1) + ")";
}

function plural(n, um, varios) {
  return n.toLocaleString("pt-BR") + " " + (n === 1 ? um : varios);
}

function cabecalho({ plano, carregadoEm, caminho }) {
  const opcoes = PLANOS.map(
    (p) =>
      '<a class="segmento' +
      (p.valor === plano ? " ativo" : "") +
      '" href="' +
      montarHash(caminho, { plano: p.valor }) +
      '"' +
      (p.valor === plano ? ' aria-current="true"' : "") +
      ">" +
      p.rotulo +
      "</a>"
  ).join("");
  return (
    '<div class="page-head painel-head">' +
    "<h1>Visão geral da operação</h1>" +
    '<nav class="segmentos" aria-label="Estações exibidas">' +
    opcoes +
    "</nav>" +
    '<p class="atualizado muted">Atualizado às ' +
    horaMinuto(carregadoEm) +
    ' <button type="button" class="link-btn" data-acao="atualizar">Atualizar</button></p>' +
    "</div>"
  );
}

// Custos que faltam cadastrar: sem eles o "Saiu" fica menor do que é.
function avisoCustos(ativas, custos, hoje) {
  const mes = hoje.getFullYear() + "-" + String(hoje.getMonth() + 1).padStart(2, "0");
  const semEnergia = ativas.filter((e) => e.custoKwh == null);
  const semFixo = ativas.filter((e) => !custos.some((c) => c.estacaoId === e.id && c.mes === mes && c.tipo === "fixo"));
  const partes = [];
  if (semEnergia.length)
    partes.push(
      "custo da energia de " +
        plural(semEnergia.length, "estação", "estações") +
        " (" +
        semEnergia.map((e) => e.nome).join(", ") +
        ")"
    );
  if (semFixo.length)
    partes.push("custo fixo de " + nomeDoMes(hoje.getMonth()) + " de " + plural(semFixo.length, "estação", "estações"));
  if (!partes.length) return "";
  return (
    '<p class="aviso aviso-atencao">O Saiu está incompleto: falta ' +
    esc(partes.join(" e ")) +
    '. <a href="' +
    montarHash("/cadastros", { aba: semEnergia.length ? "estacoes" : "custos" }) +
    '">Completar cadastro</a></p>'
  );
}

function blocoSaude(s, hoje, aviso = "") {
  const coberto = s.saiu > 0 ? Math.min(1, s.entrou / s.saiu) : 1;
  const positivo = s.resultado >= 0;
  const mes = nomeDoMes(hoje.getMonth());
  const mensagem = positivo
    ? "O faturamento já cobre os custos estimados de " + mes + "."
    : "Faltam " + fmtMoeda(s.faltam) + " de faturamento para cobrir os custos estimados de " + mes + ".";
  return (
    '<section class="card saude" aria-labelledby="t-saude">' +
    '<h2 id="t-saude">Saúde financeira</h2>' +
    "<p>" +
    esc(rotuloMesAte(hoje)) +
    " · " +
    plural(s.estacoes, "estação", "estações") +
    "</p>" +
    '<div class="saude-resultado ' +
    (positivo ? "positivo" : "negativo") +
    '">' +
    '<span class="saude-rotulo">Resultado parcial</span>' +
    '<strong class="saude-valor">' +
    fmtMoedaCurta(s.resultado) +
    "</strong>" +
    "</div>" +
    '<div class="cobertura" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
    Math.round(coberto * 100) +
    '" aria-label="Custos cobertos pelo faturamento">' +
    '<div class="cobertura-barra" style="width:' +
    (coberto * 100).toFixed(1) +
    '%"></div>' +
    "</div>" +
    '<p class="cobertura-texto">' +
    esc(mensagem) +
    "</p>" +
    aviso +
    '<dl class="saude-linhas">' +
    '<div><dt>Entrou</dt><dd class="entrou">' +
    fmtMoeda(s.entrou) +
    '</dd><dd class="muted">faturado até hoje</dd></div>' +
    '<div><dt>Saiu</dt><dd class="saiu">-' +
    fmtMoeda(s.saiu) +
    '</dd><dd class="muted">energia até hoje + custo fixo do mês (estimativa)</dd></div>' +
    "</dl>" +
    '<details class="explica"><summary>De onde vem esse número</summary>' +
    "<p><strong>Entrou</strong> soma o valor das recargas do mês, sem as cortesias. Recargas pendentes entram: já foram cobradas, só não foram recebidas.</p>" +
    "<p><strong>Saiu</strong> soma o custo da energia vendida até hoje (" +
    fmtMoeda(s.variavel) +
    ") e o custo fixo do mês inteiro (" +
    fmtMoeda(s.fixo) +
    ").</p>" +
    "<p><strong>Resultado parcial</strong> é Entrou menos Saiu. Como o custo fixo já conta o mês todo, o resultado tende a melhorar até o fim do mês.</p>" +
    "</details>" +
    "</section>"
  );
}

function blocoHubs(f, hoje) {
  if (!f.linhas.length) return "";
  const linhas = f.linhas
    .map(
      (l, i) =>
        '<li class="hub-linha">' +
        '<div class="hub-nome"><span class="marca" style="background:' +
        corDaSerie(i) +
        '"></span><strong>' +
        esc(l.hub.nome) +
        "</strong>" +
        '<span class="muted">' +
        plural(l.ativas, "estação ativa", "estações ativas") +
        "</span></div>" +
        '<div class="hub-valor"><strong>' +
        fmtMoeda(l.valor) +
        "</strong>" +
        variacaoHtml(fmtVariacao(l.variacao), l.variacao) +
        "</div>" +
        '<div class="hub-barra"><div style="width:' +
        (l.participacao * 100).toFixed(1) +
        "%;background:" +
        corDaSerie(i) +
        '"></div></div>' +
        '<span class="hub-pct muted">' +
        fmtPct(l.participacao) +
        "</span>" +
        "</li>"
    )
    .join("");
  const somaHubs = f.linhas.reduce((s, l) => s + l.valor, 0);
  const rodape =
    plural(f.linhas.length, "rede soma", "redes somam") +
    " " +
    fmtMoeda(somaHubs) +
    " (" +
    fmtPct(f.total ? somaHubs / f.total : 0) +
    " do faturamento). " +
    (f.semHub.estacoes
      ? plural(f.semHub.estacoes, "estação fora de rede", "estações fora de rede") +
        ": " +
        fmtMoeda(f.semHub.valor) +
        "."
      : "Nenhuma estação fora de rede.");
  return (
    '<section class="card" aria-labelledby="t-hubs">' +
    '<h2 id="t-hubs">Faturamento por rede</h2>' +
    "<p>" +
    esc(rotuloMesAte(hoje)) +
    " · comparado ao mesmo período de " +
    nomeDoMes((hoje.getMonth() + 11) % 12) +
    "</p>" +
    '<ul class="hubs">' +
    linhas +
    "</ul>" +
    '<p class="rodape muted">' +
    esc(rodape) +
    "</p>" +
    "</section>"
  );
}

function seriesDaReceita(r, ocultas) {
  return r.series.map((s, i) => ({
    nome: s.hub.nome,
    cor: corDaSerie(i),
    valores: s.meses,
    projecao: s.projecao,
    oculta: ocultas.has(s.hub.id),
    id: s.hub.id
  }));
}

function graficoReceita(r, ocultas, largura) {
  return graficoLinhasMensais({
    series: seriesDaReceita(r, ocultas),
    mesAtual: r.mesAtual,
    rotulosX: MESES_CURTOS,
    formatarY: (v) => (v >= 1000 ? (v / 1000).toLocaleString("pt-BR") + " mil" : String(v)),
    descricao: "Receita mensal por rede em " + r.ano + "; o mês corrente é projeção.",
    largura
  });
}

function blocoReceita(r, ocultas) {
  if (!r.series.length) return "";
  const series = seriesDaReceita(r, ocultas);
  const legenda = series
    .map(
      (s) =>
        '<button type="button" class="legenda-item" data-hub="' +
        esc(s.id) +
        '" aria-pressed="' +
        String(!s.oculta) +
        '">' +
        '<span class="marca" style="background:' +
        s.cor +
        '"></span>' +
        esc(s.nome) +
        "</button>"
    )
    .join("");
  const ritmo =
    r.diasCompletos > 0
      ? "projeção no ritmo dos " + plural(r.diasCompletos, "dia completo", "dias completos")
      : "sem dia completo para projetar";
  return (
    '<section class="card" aria-labelledby="t-receita">' +
    '<h2 id="t-receita">Receita por mês em ' +
    r.ano +
    "</h2>" +
    "<p>Por rede · " +
    MESES_CURTOS[r.mesAtual] +
    "/" +
    String(r.ano).slice(2) +
    " é projeção, " +
    esc(ritmo) +
    "</p>" +
    '<div class="grafico-receita"></div>' +
    '<div class="legenda" role="group" aria-label="Mostrar ou ocultar redes no gráfico">' +
    legenda +
    "</div>" +
    "</section>"
  );
}

function blocoOperacao(o, hoje) {
  const item = (rotulo, valor, unidade, v, texto) =>
    '<div class="metrica"><dt>' +
    rotulo +
    "</dt><dd><strong>" +
    valor +
    "</strong>" +
    (unidade ? ' <span class="unidade">' + unidade + "</span>" : "") +
    "</dd><dd>" +
    (texto || variacaoHtml(fmtVariacao(v), v)) +
    "</dd></div>";
  const occ = o.ocupacao;
  return (
    '<section class="card" aria-labelledby="t-operacao">' +
    '<h2 id="t-operacao">Operação</h2>' +
    "<p>" +
    esc(rotuloMesAte(hoje)) +
    " · comparado ao mesmo período de " +
    nomeDoMes((hoje.getMonth() + 11) % 12) +
    "</p>" +
    '<dl class="metricas">' +
    item("Cargas", o.cargas.atual.toLocaleString("pt-BR"), "", o.cargas.variacao) +
    item("Energia entregue", fmtKwh(o.energia.atual), "kWh", o.energia.variacao) +
    item("Clientes únicos", o.clientesUnicos.atual.toLocaleString("pt-BR"), "", o.clientesUnicos.variacao) +
    item("Consumo médio", fmtKwh(o.consumoMedio.atual), "kWh por carga", o.consumoMedio.variacao) +
    item("Ticket médio", fmtMoeda(o.ticketMedio.atual), "", o.ticketMedio.variacao) +
    item(
      "Ocupação",
      fmtPct(occ.atual, 1),
      '<span class="faixa-ocupacao faixa-' + occ.faixa.replace("é", "e") + '">' + occ.faixa + "</span>",
      null,
      variacaoHtml(fmtPontos(occ.diferenca), occ.diferenca)
    ) +
    "</dl>" +
    "</section>"
  );
}

function blocoClientes(t, hoje) {
  if (!t.linhas.length) {
    return '<section class="card"><h2>Clientes que mais carregaram</h2><p class="estado">Nenhuma recarga neste período.</p></section>';
  }
  const linhas = t.linhas
    .map(
      (c, i) =>
        '<li><details><summary><span class="posicao">' +
        (i + 1) +
        "</span>" +
        '<span class="cliente-nome">' +
        esc(c.cliente) +
        "</span>" +
        '<span class="num">' +
        fmtKwh(c.kwh) +
        " kWh</span>" +
        '<span class="num muted">' +
        fmtMoeda(c.gasto) +
        "</span></summary>" +
        '<p class="cliente-detalhe muted">' +
        plural(c.cargas, "carga", "cargas") +
        " · ticket médio " +
        fmtMoeda(c.gasto / c.cargas) +
        " · " +
        fmtKwh(c.kwh / c.cargas) +
        " kWh por carga</p>" +
        "</details></li>"
    )
    .join("");
  return (
    '<section class="card" aria-labelledby="t-clientes">' +
    '<h2 id="t-clientes">Clientes que mais carregaram</h2>' +
    "<p>" +
    esc(rotuloMesAte(hoje)) +
    " · " +
    plural(t.totalClientes, "cliente", "clientes") +
    " no período</p>" +
    '<ol class="clientes">' +
    linhas +
    "</ol>" +
    "</section>"
  );
}

const ROTULO_STATUS = { carregando: "carregando", livre: "livre", parado: "parado", "sem dado": "sem dado" };

function blocoStatus(st, verTodas) {
  if (!st.estacoes.length) return "";
  const resumo = STATUS_CONECTOR.map(
    (s) =>
      '<li><span class="st st-' +
      s.replace(" ", "-") +
      '" aria-hidden="true"></span>' +
      st.contagem[s] +
      " " +
      ROTULO_STATUS[s] +
      "</li>"
  ).join("");
  const lista = verTodas ? st.estacoes : st.estacoes.slice(0, ESTACOES_A_VISTA);
  const linhas = lista
    .map((e) => {
      const pontos = e.conectores
        .map(
          (c) =>
            '<span class="st st-' +
            c.status.replace(" ", "-") +
            '" title="' +
            esc(c.tipo + " " + c.potenciaKw + " kW: " + c.status) +
            '"></span>'
        )
        .join("");
      const descricao = e.conectores.map((c) => c.status).join(", ");
      return (
        '<tr><th scope="row">' +
        esc(e.nome) +
        (juntar(e.cidade, e.uf) ? '<span class="muted"> · ' + esc(juntar(e.cidade, e.uf)) + "</span>" : "") +
        "</th>" +
        '<td class="num">' +
        potenciaDaEstacao(e) +
        " kW</td>" +
        '<td><span class="pontos" role="img" aria-label="Conectores: ' +
        esc(descricao) +
        '">' +
        pontos +
        "</span></td></tr>"
      );
    })
    .join("");
  const botao =
    st.estacoes.length > ESTACOES_A_VISTA
      ? '<button type="button" class="link-btn" data-acao="ver-todas" aria-expanded="' +
        String(verTodas) +
        '">' +
        (verTodas ? "Mostrar menos" : "Ver todas (" + st.estacoes.length + ")") +
        "</button>"
      : "";
  return (
    '<section class="card" aria-labelledby="t-status">' +
    '<h2 id="t-status">Status das estações</h2>' +
    "<p>" +
    (st.cargasHoje ? plural(st.cargasHoje, "carga hoje", "cargas hoje") : "Nenhuma carga hoje ainda") +
    "</p>" +
    '<ul class="status-resumo">' +
    resumo +
    "</ul>" +
    '<table class="tabela-status"><thead><tr><th scope="col">Estação</th><th scope="col">Potência</th><th scope="col">Conectores</th></tr></thead><tbody>' +
    linhas +
    "</tbody></table>" +
    '<p class="rodape muted">' +
    lista.length +
    " de " +
    st.estacoes.length +
    " " +
    botao +
    "</p>" +
    "</section>"
  );
}

export function renderizar(alvo, { dados, hoje, carregadoEm, params, recarregar, caminho }) {
  const plano = params.get("plano") === "fora" ? "fora" : "dentro";
  // Indicadores do período contam estações desativadas (é histórico: o faturamento aconteceu).
  // Status e ocupação contam só as ativas.
  const estacoes = filtrarEstacoes(dados.estacoes, plano);
  const ativas = estacoesAtivas(estacoes);
  const ocultas = new Set();
  let verTodas = false;
  let pararGrafico = () => {};

  const base = { estacoes, recargas: dados.recargas, hoje };
  const saude = { ...saudeFinanceira({ ...base, custos: dados.custos }), estacoes: ativas.length };
  const hubs = faturamentoPorHub({ ...base, hubs: dados.hubs });
  const receita = receitaMensal({ ...base, hubs: dados.hubs });
  const op = operacao({ ...base, estacoesOcupacao: ativas });
  const top = topClientes(base);
  const status = statusEstacoes({ ...base, estacoes: ativas });

  function desenhar() {
    pararGrafico();
    if (!estacoes.length) {
      alvo.innerHTML =
        cabecalho({ plano, carregadoEm, caminho }) +
        (dados.estacoes.length
          ? '<section class="card estado">Nenhuma estação ' +
            (plano === "fora" ? "fora do plano" : "no plano") +
            ". Troque o filtro acima para ver as outras.</section>"
          : '<section class="card estado">Nenhuma estação cadastrada. <a href="' +
            montarHash("/cadastros", { aba: "estacoes" }) +
            '">Cadastre uma estação</a> para ver o painel.</section>');
      return;
    }
    alvo.innerHTML =
      cabecalho({ plano, carregadoEm, caminho }) +
      '<div class="painel-grade">' +
      '<div class="col">' +
      blocoSaude(saude, hoje, avisoCustos(ativas, dados.custos, hoje)) +
      blocoClientes(top, hoje) +
      "</div>" +
      '<div class="col">' +
      blocoHubs(hubs, hoje) +
      blocoOperacao(op, hoje) +
      "</div>" +
      '<div class="col-larga">' +
      blocoReceita(receita, ocultas) +
      "</div>" +
      '<div class="col-larga">' +
      blocoStatus(status, verTodas) +
      "</div>" +
      "</div>";
    const el = alvo.querySelector(".grafico-receita");
    if (el) pararGrafico = montarResponsivo(el, (largura) => graficoReceita(receita, ocultas, largura));
  }

  function aoClicar(ev) {
    const alvoBtn = ev.target.closest("button");
    if (!alvoBtn) return;
    if (alvoBtn.dataset.acao === "atualizar") {
      alvoBtn.disabled = true;
      alvoBtn.textContent = "Atualizando…";
      Promise.resolve(recarregar()).catch((erro) => {
        console.error(erro);
        alvoBtn.disabled = false;
        alvoBtn.textContent = "Não foi possível atualizar. Tentar de novo";
      });
    } else if (alvoBtn.dataset.acao === "ver-todas") {
      verTodas = !verTodas;
      desenhar();
      alvo.querySelector('[data-acao="ver-todas"]').focus();
    } else if (alvoBtn.dataset.hub) {
      const id = alvoBtn.dataset.hub;
      if (ocultas.has(id)) ocultas.delete(id);
      else ocultas.add(id);
      desenhar();
      [...alvo.querySelectorAll("[data-hub]")].find((b) => b.dataset.hub === id).focus();
    }
  }

  desenhar();
  alvo.addEventListener("click", aoClicar);
  return () => {
    pararGrafico();
    alvo.removeEventListener("click", aoClicar);
  };
}
