// Cadastros que alimentam o Painel e a Concorrência. No app, ficam só para o admin.

import {
  atualizar,
  definirCusto,
  inserir,
  novoId,
  podeExcluirEstacao,
  podeExcluirRede,
  remover,
  temErros,
  validarConcorrente,
  validarCusto,
  validarEstacao,
  validarRede
} from "../data/cadastros.js";
import { fmtMoeda, fmtPrecoKwh } from "../core/formato.js";
import { nomeDoMes } from "../core/periodo.js";
import { nomeArquivo, planilhaConcorrentes } from "../core/exportar.js";
import { baixarPlanilha } from "../ui/baixar.js";
import { esc, juntar } from "../ui/html.js";
import { removerMapa } from "../ui/mapa.js";
import { montarHash } from "../ui/rotas.js";

const ABAS = [
  { valor: "concorrentes", rotulo: "Concorrentes" },
  { valor: "estacoes", rotulo: "Estações" },
  { valor: "redes", rotulo: "Redes" },
  { valor: "custos", rotulo: "Custos fixos" }
];

// Mensagem exibida depois que a tela é redesenhada (ex.: "Concorrente salvo.").
let avisoPendente = null;

function numCampo(n) {
  return n == null ? "" : String(n).replace(".", ",");
}

function mesAtual(hoje) {
  return hoje.getFullYear() + "-" + String(hoje.getMonth() + 1).padStart(2, "0");
}

function rotuloMes(mes) {
  const [a, m] = mes.split("-").map(Number);
  return nomeDoMes(m - 1) + " de " + a;
}

function campo({ nome, rotulo, valor = "", tipo = "text", ajuda = "", attrs = "" }) {
  const id = "f-" + nome.replace(/\./g, "-");
  return (
    '<div class="field" data-campo="' +
    esc(nome) +
    '">' +
    '<label for="' +
    id +
    '">' +
    esc(rotulo) +
    "</label>" +
    '<input id="' +
    id +
    '" name="' +
    esc(nome) +
    '" type="' +
    tipo +
    '" value="' +
    esc(valor) +
    '" ' +
    attrs +
    ' aria-describedby="' +
    id +
    "-erro" +
    (ajuda ? " " + id + "-ajuda" : "") +
    '">' +
    (ajuda ? '<p class="hint" id="' + id + '-ajuda">' + esc(ajuda) + "</p>" : "") +
    '<p class="campo-erro" id="' +
    id +
    '-erro" aria-live="polite"></p>' +
    "</div>"
  );
}

function campoTipo(nome, valor) {
  return (
    '<fieldset class="field" data-campo="' +
    nome +
    '"><legend>Tipo de carga</legend><div class="opcoes">' +
    '<label><input type="radio" name="' +
    nome +
    '" value="DC"' +
    (valor !== "AC" ? " checked" : "") +
    "> Rápida (DC)</label>" +
    '<label><input type="radio" name="' +
    nome +
    '" value="AC"' +
    (valor === "AC" ? " checked" : "") +
    "> Lenta (AC)</label>" +
    '</div><p class="campo-erro" aria-live="polite"></p></fieldset>'
  );
}

function camposLocal(item) {
  return (
    '<fieldset class="campo-local"><legend>Localização</legend>' +
    '<p class="hint">Clique no mapa para marcar o ponto, ou digite as coordenadas.</p>' +
    '<div class="mapa mapa-seletor" aria-label="Mapa para escolher a localização"></div>' +
    '<div class="linha-campos">' +
    campo({
      nome: "lat",
      rotulo: "Latitude",
      valor: numCampo(item.lat),
      attrs: 'inputmode="decimal" autocomplete="off"'
    }) +
    campo({
      nome: "lng",
      rotulo: "Longitude",
      valor: numCampo(item.lng),
      attrs: 'inputmode="decimal" autocomplete="off"'
    }) +
    "</div></fieldset>"
  );
}

// fixo: bico vindo do app. Potência é dele e o bico não pode ser removido aqui; só o tipo é ajustável.
function linhaConector(c, i, fixo = false) {
  return (
    '<li class="conector" data-indice="' +
    i +
    '">' +
    (c.id ? '<input type="hidden" name="conectores.' + i + '.id" value="' + esc(c.id) + '">' : "") +
    '<div class="field" data-campo="conectores.' +
    i +
    '.tipo"><label for="f-con-' +
    i +
    '-tipo">Tipo</label>' +
    '<select id="f-con-' +
    i +
    '-tipo" name="conectores.' +
    i +
    '.tipo">' +
    '<option value="DC"' +
    (c.tipo !== "AC" ? " selected" : "") +
    ">Rápido (DC)</option>" +
    '<option value="AC"' +
    (c.tipo === "AC" ? " selected" : "") +
    ">Lento (AC)</option></select>" +
    '<p class="campo-erro" aria-live="polite"></p></div>' +
    campo({
      nome: "conectores." + i + ".potenciaKw",
      rotulo: "Potência (kW)",
      valor: numCampo(c.potenciaKw),
      attrs: 'inputmode="decimal"' + (fixo ? " readonly" : "")
    }) +
    (fixo
      ? ""
      : '<button type="button" class="btn btn-icon" data-acao="remover-conector" aria-label="Remover conector ' +
        (i + 1) +
        '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>') +
    "</li>"
  );
}

function formConcorrente(c) {
  return (
    campo({ nome: "nome", rotulo: "Nome", valor: c.nome, attrs: 'autocomplete="off" maxlength="80"' }) +
    campoTipo("tipo", c.tipo) +
    '<div class="linha-campos">' +
    campo({
      nome: "potenciaKw",
      rotulo: "Potência (kW)",
      valor: numCampo(c.potenciaKw),
      attrs: 'inputmode="decimal"'
    }) +
    campo({
      nome: "preco",
      rotulo: "Preço (R$/kWh)",
      valor: numCampo(c.preco),
      ajuda: "Deixe vazio se não souber.",
      attrs: 'inputmode="decimal"'
    }) +
    "</div>" +
    camposLocal(c)
  );
}

// ondeConfigura: onde o usuário muda preço e bicos do posto (ex.: "em Configurações").
function formEstacao(e, redes, ondeConfigura = "em Configurações") {
  const doPosto = e.origem === "posto";
  const opcoes =
    '<option value="">Sem rede</option>' +
    redes
      .map(
        (r) =>
          '<option value="' + esc(r.id) + '"' + (r.id === e.hubId ? " selected" : "") + ">" + esc(r.nome) + "</option>"
      )
      .join("");
  const conectores = e.conectores && e.conectores.length ? e.conectores : [{ tipo: "DC", potenciaKw: null }];
  return (
    campo({ nome: "nome", rotulo: "Nome", valor: e.nome, attrs: 'autocomplete="off" maxlength="80"' }) +
    '<div class="linha-campos linha-cidade">' +
    campo({ nome: "cidade", rotulo: "Cidade", valor: e.cidade }) +
    campo({ nome: "uf", rotulo: "UF", valor: e.uf, attrs: 'maxlength="2" autocapitalize="characters"' }) +
    "</div>" +
    '<div class="field" data-campo="hubId"><label for="f-hubId">Rede</label><select id="f-hubId" name="hubId">' +
    opcoes +
    '</select><p class="campo-erro" aria-live="polite"></p></div>' +
    '<label class="campo-check"><input type="checkbox" name="noPlano"' +
    (e.noPlano ? " checked" : "") +
    "> Coberta pelo plano</label>" +
    '<div class="linha-campos">' +
    campo({
      nome: "precoKwh",
      rotulo: "Seu preço (R$/kWh)",
      valor: numCampo(e.precoKwh),
      ajuda: doPosto ? "Definido " + ondeConfigura + " (tarifa por kWh)." : "Deixe vazio se ainda não definiu.",
      attrs: 'inputmode="decimal"' + (doPosto ? " readonly" : "")
    }) +
    campo({
      nome: "custoKwh",
      rotulo: "Custo da energia (R$/kWh)",
      valor: numCampo(e.custoKwh),
      ajuda: 'Entra no "Saiu" do Painel.',
      attrs: 'inputmode="decimal"'
    }) +
    "</div>" +
    '<fieldset class="field" data-campo="conectores"><legend>Conectores</legend>' +
    (doPosto
      ? '<p class="hint">Bicos e potências são definidos ' +
        esc(ondeConfigura) +
        ". Ajuste aqui só o tipo de carga.</p>"
      : "") +
    '<ul class="conectores">' +
    conectores.map((c, i) => linhaConector(c, i, doPosto)).join("") +
    "</ul>" +
    '<p class="campo-erro" aria-live="polite"></p>' +
    (doPosto
      ? ""
      : '<button type="button" class="btn btn-secondary" data-acao="add-conector">Adicionar conector</button>') +
    "</fieldset>" +
    camposLocal(e)
  );
}

// Lê o formulário num objeto simples. Campos "a.0.b" viram listas.
function lerForm(form) {
  const dados = {};
  for (const [k, v] of new FormData(form)) {
    const partes = k.split(".");
    if (partes.length === 3) {
      const lista = (dados[partes[0]] = dados[partes[0]] || []);
      const i = Number(partes[1]);
      lista[i] = lista[i] || {};
      lista[i][partes[2]] = v;
    } else dados[k] = v;
  }
  if (dados.conectores) dados.conectores = dados.conectores.filter(Boolean);
  dados.noPlano = form.elements.noPlano ? form.elements.noPlano.checked : undefined;
  return dados;
}

function mostrarErros(form, erros) {
  for (const el of form.querySelectorAll("[data-campo]")) {
    const msg = erros[el.dataset.campo] || "";
    el.querySelector(".campo-erro").textContent = msg;
    el.classList.toggle("com-erro", !!msg);
    const input = el.querySelector("input:not([type=radio]), select");
    if (input) input.setAttribute("aria-invalid", String(!!msg));
  }
  const primeiro = form.querySelector(".com-erro input, .com-erro select");
  if (primeiro) primeiro.focus();
}

function abrir(dialogo) {
  if (typeof dialogo.showModal === "function") dialogo.showModal();
  else dialogo.setAttribute("open", "");
}

function fechar(dialogo) {
  if (typeof dialogo.close === "function") dialogo.close();
  else dialogo.removeAttribute("open");
}

async function montarSeletorMapa(form, centro) {
  const el = form.querySelector(".mapa-seletor");
  if (!el) return null;
  const L = await import("../vendor/leaflet/leaflet-src.esm.js");
  const lat = form.elements.lat;
  const lng = form.elements.lng;
  const atual = () => {
    const a = Number(String(lat.value).replace(",", "."));
    const b = Number(String(lng.value).replace(",", "."));
    return lat.value && lng.value && isFinite(a) && isFinite(b) ? [a, b] : null;
  };
  const inicio = atual();
  const mapa = L.map(el).setView(inicio || centro, inicio ? 14 : 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapa);
  const icone = L.divIcon({ className: "", html: '<span class="pino pino-voce"></span>', iconSize: null });
  let marcador = inicio ? L.marker(inicio, { icon: icone }).addTo(mapa) : null;
  const marcar = (p) => {
    if (marcador) marcador.setLatLng(p);
    else marcador = L.marker(p, { icon: icone }).addTo(mapa);
  };
  mapa.on("click", (ev) => {
    marcar(ev.latlng);
    lat.value = ev.latlng.lat.toFixed(5).replace(".", ",");
    lng.value = ev.latlng.lng.toFixed(5).replace(".", ",");
    for (const el of [lat, lng]) el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const aoDigitar = () => {
    const p = atual();
    if (p) {
      marcar(p);
      mapa.panTo(p, { animate: false });
    }
  };
  lat.addEventListener("change", aoDigitar);
  lng.addEventListener("change", aoDigitar);
  setTimeout(() => mapa.invalidateSize(), 0);
  return mapa;
}

function abaConcorrentes(dados, busca) {
  const termo = busca.trim().toLowerCase();
  const lista = [...dados.concorrentes]
    .filter((c) => !termo || c.nome.toLowerCase().includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
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
            (c.preco == null ? '<span class="muted">sem preço</span>' : fmtPrecoKwh(c.preco)) +
            "</td>" +
            '<td class="muted">' +
            (c.coletadoEm ? new Date(c.coletadoEm).toLocaleDateString("pt-BR") : "—") +
            "</td>" +
            '<td class="acoes"><button type="button" class="link-btn" data-acao="editar-concorrente" data-id="' +
            esc(c.id) +
            '">Editar</button>' +
            '<button type="button" class="link-btn perigo" data-acao="excluir-concorrente" data-id="' +
            esc(c.id) +
            '">Excluir</button></td></tr>'
        )
        .join("")
    : '<tr><td colspan="5" class="estado">' +
      (termo
        ? "Nenhum concorrente com esse nome."
        : "Nenhum concorrente cadastrado. Cadastre o primeiro para comparar preços.") +
      "</td></tr>";
  return (
    '<div class="barra-acoes">' +
    '<label class="busca"><span class="sr-only">Buscar concorrente</span><input type="search" name="busca" placeholder="Buscar por nome" value="' +
    esc(busca) +
    '" data-busca></label>' +
    '<div class="botoes"><button type="button" class="btn btn-secondary" data-acao="exportar-concorrentes"' +
    (dados.concorrentes.length ? "" : " disabled") +
    ">Exportar XLSX</button>" +
    '<button type="button" class="btn btn-primary" data-acao="novo-concorrente">Novo concorrente</button></div></div>' +
    '<p class="muted contagem">' +
    lista.length +
    " de " +
    dados.concorrentes.length +
    " concorrentes</p>" +
    '<div class="tabela-rolagem" tabindex="0" role="region" aria-label="Tabela de concorrentes"><table class="tabela-cadastro"><thead><tr><th scope="col">Nome</th><th scope="col">Tipo</th><th scope="col">Preço</th><th scope="col">Atualizado em</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>' +
    linhas +
    "</tbody></table></div>"
  );
}

function abaEstacoes(dados) {
  const redes = new Map(dados.hubs.map((r) => [r.id, r.nome]));
  const linhas = dados.estacoes.length
    ? dados.estacoes
        .map((e) => {
          const ativa = e.ativa !== false;
          const excluivel = e.origem !== "posto" && podeExcluirEstacao(e.id, dados.recargas);
          const conectores = e.conectores.map((c) => c.tipo + " " + c.potenciaKw + " kW").join(", ");
          return (
            "<tr" +
            (ativa ? "" : ' class="inativa"') +
            '><th scope="row">' +
            esc(e.nome) +
            (ativa ? "" : ' <span class="etiqueta etiqueta-sem-referencia">Desativada</span>') +
            '<span class="muted sub-linha">' +
            esc(juntar(e.cidade, e.uf) || "Sem cidade") +
            "</span></th>" +
            "<td>" +
            esc(redes.get(e.hubId) || "Sem rede") +
            "</td>" +
            "<td>" +
            esc(conectores) +
            "</td>" +
            '<td class="num">' +
            (e.precoKwh == null ? '<span class="muted">sem preço</span>' : fmtPrecoKwh(e.precoKwh)) +
            "</td>" +
            '<td class="acoes"><button type="button" class="link-btn" data-acao="editar-estacao" data-id="' +
            esc(e.id) +
            '">Editar</button>' +
            '<button type="button" class="link-btn" data-acao="alternar-estacao" data-id="' +
            esc(e.id) +
            '">' +
            (ativa ? "Desativar" : "Reativar") +
            "</button>" +
            (excluivel
              ? '<button type="button" class="link-btn perigo" data-acao="excluir-estacao" data-id="' +
                esc(e.id) +
                '">Excluir</button>'
              : "") +
            "</td></tr>"
          );
        })
        .join("")
    : '<tr><td colspan="5" class="estado">Nenhuma estação cadastrada. Cadastre a primeira para ver o Painel.</td></tr>';
  return (
    '<div class="barra-acoes"><p class="muted">Estações desativadas saem da Concorrência e do status de hoje; o faturamento que já fizeram continua no Painel. Estações com recargas não podem ser excluídas, só desativadas, para manter o histórico.</p>' +
    '<button type="button" class="btn btn-primary" data-acao="nova-estacao">Nova estação</button></div>' +
    '<div class="tabela-rolagem" tabindex="0" role="region" aria-label="Tabela de estações"><table class="tabela-cadastro"><thead><tr><th scope="col">Estação</th><th scope="col">Rede</th><th scope="col">Conectores</th><th scope="col">Seu preço</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>' +
    linhas +
    "</tbody></table></div>"
  );
}

function abaRedes(dados) {
  const linhas = dados.hubs.length
    ? dados.hubs
        .map((r) => {
          const n = dados.estacoes.filter((e) => e.hubId === r.id).length;
          return (
            '<tr><th scope="row">' +
            esc(r.nome) +
            "</th><td>" +
            n +
            (n === 1 ? " estação" : " estações") +
            "</td>" +
            '<td class="acoes"><button type="button" class="link-btn" data-acao="editar-rede" data-id="' +
            esc(r.id) +
            '">Renomear</button>' +
            (n
              ? ""
              : '<button type="button" class="link-btn perigo" data-acao="excluir-rede" data-id="' +
                esc(r.id) +
                '">Excluir</button>') +
            "</td></tr>"
          );
        })
        .join("")
    : '<tr><td colspan="3" class="estado">Nenhuma rede. Redes agrupam estações no faturamento do Painel.</td></tr>';
  return (
    '<div class="barra-acoes"><p class="muted">Redes agrupam estações no Painel. Uma rede com estações não pode ser excluída: mova as estações antes.</p>' +
    '<button type="button" class="btn btn-primary" data-acao="nova-rede">Nova rede</button></div>' +
    '<div class="tabela-rolagem" tabindex="0" role="region" aria-label="Tabela de redes"><table class="tabela-cadastro"><thead><tr><th scope="col">Rede</th><th scope="col">Estações</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>' +
    linhas +
    "</tbody></table></div>"
  );
}

function abaCustos(dados, mes) {
  const ativas = dados.estacoes.filter((e) => e.ativa !== false);
  const valorDe = (id) => {
    const c = dados.custos.find((x) => x.estacaoId === id && x.mes === mes && x.tipo === "fixo");
    return c ? c.valor : null;
  };
  const total = ativas.reduce((s, e) => s + (valorDe(e.id) || 0), 0);
  const linhas = ativas.length
    ? ativas
        .map(
          (e) =>
            '<tr><th scope="row"><label for="custo-' +
            esc(e.id) +
            '">' +
            esc(e.nome) +
            "</label></th>" +
            '<td><div class="field" data-campo="custo.' +
            esc(e.id) +
            '"><input id="custo-' +
            esc(e.id) +
            '" name="custo.' +
            esc(e.id) +
            '" inputmode="decimal" value="' +
            esc(numCampo(valorDe(e.id))) +
            '" placeholder="0,00" aria-describedby="custo-' +
            esc(e.id) +
            '-erro">' +
            '<p class="campo-erro" id="custo-' +
            esc(e.id) +
            '-erro" aria-live="polite"></p></div></td></tr>'
        )
        .join("")
    : '<tr><td colspan="2" class="estado">Nenhuma estação ativa.</td></tr>';
  return (
    '<form class="form-custos" data-form="custos" novalidate>' +
    '<div class="barra-acoes"><div class="field"><label for="f-mes">Mês</label><input id="f-mes" type="month" name="mes" value="' +
    esc(mes) +
    '" data-mes></div>' +
    '<p class="muted">Aluguel, internet, manutenção e demais custos que não dependem da energia vendida. Entram inteiros no "Saiu" do Painel.</p></div>' +
    '<table class="tabela-cadastro tabela-custos"><thead><tr><th scope="col">Estação</th><th scope="col">Custo fixo de ' +
    esc(rotuloMes(mes)) +
    " (R$)</th></tr></thead><tbody>" +
    linhas +
    "</tbody>" +
    '<tfoot><tr><th scope="row">Total atual</th><td class="num">' +
    fmtMoeda(total) +
    "</td></tr></tfoot></table>" +
    (ativas.length ? '<button type="submit" class="btn btn-primary">Salvar custos</button>' : "") +
    "</form>"
  );
}

export function renderizar(alvo, { dados, fonte, hoje, params, recarregar, caminho, titulo = "Cadastros" }) {
  const aba = ABAS.some((a) => a.valor === params.get("aba")) ? params.get("aba") : "concorrentes";
  let busca = "";
  let mes = params.get("mes") || mesAtual(hoje);
  let mapaForm = null;
  // Cada formulário aberto ganha um número; um mapa que termina de carregar depois que o
  // formulário fechou é descartado em vez de ficar órfão.
  let formAberto = 0;
  const centro = (() => {
    const pts = dados.estacoes.length ? dados.estacoes : dados.concorrentes;
    if (!pts.length) return [-15.79, -47.88];
    return [pts.reduce((s, p) => s + p.lat, 0) / pts.length, pts.reduce((s, p) => s + p.lng, 0) / pts.length];
  })();

  const abas = ABAS.map(
    (a) =>
      '<a class="segmento' +
      (a.valor === aba ? " ativo" : "") +
      '" href="' +
      montarHash(caminho, { aba: a.valor }) +
      '"' +
      (a.valor === aba ? ' aria-current="page"' : "") +
      ">" +
      a.rotulo +
      "</a>"
  ).join("");

  alvo.innerHTML =
    '<div class="page-head"><div><h1>' +
    esc(titulo) +
    '</h1><p class="muted subtitulo">Estações, concorrentes, redes e custos usados na visão geral e na concorrência. Ficam gravados neste aparelho.</p></div>' +
    "</div>" +
    '<nav class="segmentos abas-cadastro" aria-label="Tipo de cadastro">' +
    abas +
    "</nav>" +
    (avisoPendente ? '<p class="aviso" role="status" tabindex="-1">' + esc(avisoPendente) + "</p>" : "") +
    '<section class="card" data-conteudo></section>' +
    '<dialog class="dialogo" data-dialogo aria-labelledby="d-titulo"></dialog>';
  avisoPendente = null;
  // Depois de salvar a tela é redesenhada; o foco vai para a confirmação em vez de se perder no body.
  const avisoEl = alvo.querySelector(".aviso[role=status]");
  if (avisoEl) avisoEl.focus();
  const conteudo = alvo.querySelector("[data-conteudo]");
  const dialogo = alvo.querySelector("[data-dialogo]");

  function desenharAba() {
    if (aba === "concorrentes") conteudo.innerHTML = abaConcorrentes(dados, busca);
    else if (aba === "estacoes") conteudo.innerHTML = abaEstacoes(dados);
    else if (aba === "redes") conteudo.innerHTML = abaRedes(dados);
    else conteudo.innerHTML = abaCustos(dados, mes);
  }

  async function salvarEVoltar(colecao, lista, aviso) {
    await fonte.salvar(colecao, lista);
    avisoPendente = aviso;
    fechar(dialogo);
    await recarregar();
  }

  // Remove o mapa do formulário uma única vez (remover duas vezes faz o Leaflet lançar erro).
  function soltarMapa() {
    formAberto++;
    removerMapa(mapaForm);
    mapaForm = null;
  }

  function fecharDialogo() {
    soltarMapa();
    fechar(dialogo);
  }

  function abrirForm({ titulo, corpo, botao, aoSalvar, comMapa = true }) {
    soltarMapa();
    const meu = formAberto;
    dialogo.innerHTML =
      '<form method="dialog" novalidate data-form="dialogo">' +
      '<h2 id="d-titulo">' +
      esc(titulo) +
      "</h2>" +
      '<div class="dialogo-corpo">' +
      corpo +
      "</div>" +
      '<p class="form-erro" role="alert"></p>' +
      '<div class="form-actions"><button type="button" class="btn btn-secondary" data-acao="cancelar">Cancelar</button>' +
      '<button type="submit" class="btn btn-primary">' +
      esc(botao) +
      "</button></div></form>";
    const form = dialogo.querySelector("form");
    // Ao corrigir um campo, a mensagem de erro dele some; as outras ficam até o próximo envio.
    form.addEventListener("input", (ev) => {
      const el = ev.target.closest(".com-erro");
      if (!el) return;
      el.classList.remove("com-erro");
      el.querySelector(".campo-erro").textContent = "";
      const input = el.querySelector("input:not([type=radio]), select");
      if (input) input.setAttribute("aria-invalid", "false");
    });
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const erros = aoSalvar(lerForm(form));
      if (erros && typeof erros.then !== "function") {
        mostrarErros(form, erros);
        return;
      }
      try {
        const res = await erros;
        if (res) mostrarErros(form, res);
      } catch (erro) {
        form.querySelector(".form-erro").textContent = erro.message;
      }
    });
    abrir(dialogo);
    const primeiro = form.querySelector("input, select");
    if (primeiro) primeiro.focus();
    if (comMapa) {
      montarSeletorMapa(form, centro)
        .then((m) => {
          if (meu === formAberto) mapaForm = m;
          else removerMapa(m);
        })
        .catch((erro) => {
          console.error(erro);
          const el = form.querySelector(".mapa-seletor");
          if (el) el.innerHTML = '<p class="estado">Mapa indisponível. Digite as coordenadas.</p>';
        });
    }
  }

  function confirmar({ titulo, texto, botao, aoConfirmar }) {
    soltarMapa();
    dialogo.innerHTML =
      '<form method="dialog" data-form="confirmar"><h2 id="d-titulo">' +
      esc(titulo) +
      "</h2>" +
      '<p class="dialogo-texto">' +
      esc(texto) +
      "</p>" +
      '<p class="form-erro" role="alert"></p>' +
      '<div class="form-actions"><button type="button" class="btn btn-secondary" data-acao="cancelar">Cancelar</button>' +
      '<button type="submit" class="btn btn-danger">' +
      esc(botao) +
      "</button></div></form>";
    const form = dialogo.querySelector("form");
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await aoConfirmar();
      } catch (erro) {
        form.querySelector(".form-erro").textContent = erro.message;
      }
    });
    abrir(dialogo);
    form.querySelector('[data-acao="cancelar"]').focus();
  }

  function formDeConcorrente(c) {
    const novo = !c;
    abrirForm({
      titulo: novo ? "Novo concorrente" : "Editar concorrente",
      corpo: formConcorrente(c || { tipo: "DC" }),
      botao: novo ? "Cadastrar concorrente" : "Salvar alterações",
      aoSalvar: (d) => {
        const { valor, erros } = validarConcorrente(d);
        if (temErros(erros)) return erros;
        const precoMudou = novo || valor.preco !== c.preco;
        const extra = precoMudou
          ? { coletadoEm: new Date().toISOString(), fonte: "manual", precoPorHora: undefined }
          : {};
        const lista = novo
          ? inserir(dados.concorrentes, { id: novoId("conc"), ...valor, ...extra })
          : atualizar(dados.concorrentes, c.id, { ...valor, ...extra });
        return salvarEVoltar("concorrentes", lista, novo ? "Concorrente cadastrado." : "Concorrente salvo.");
      }
    });
  }

  function formDeEstacao(e) {
    const nova = !e;
    abrirForm({
      titulo: nova ? "Nova estação" : "Editar estação",
      corpo: formEstacao(e || { noPlano: true, conectores: [] }, dados.hubs, dados.ondeConfigura),
      botao: nova ? "Cadastrar estação" : "Salvar alterações",
      aoSalvar: (d) => {
        const { valor, erros } = validarEstacao(d, { redes: dados.hubs });
        if (temErros(erros)) return erros;
        const anteriores = new Map(((e && e.conectores) || []).map((c) => [c.id, c]));
        const id = nova ? novoId("est") : e.id;
        valor.conectores = valor.conectores.map((c, i) => ({
          id: c.id || id + "-c" + Date.now().toString(36) + i,
          tipo: c.tipo,
          potenciaKw: c.potenciaKw,
          status: (anteriores.get(c.id) || {}).status || "sem dado"
        }));
        const lista = nova
          ? inserir(dados.estacoes, { id, ativa: true, ...valor })
          : atualizar(dados.estacoes, e.id, valor);
        return salvarEVoltar("estacoes", lista, nova ? "Estação cadastrada." : "Estação salva.");
      }
    });
  }

  function formDeRede(r) {
    const nova = !r;
    abrirForm({
      titulo: nova ? "Nova rede" : "Renomear rede",
      corpo: campo({
        nome: "nome",
        rotulo: "Nome da rede",
        valor: r ? r.nome : "",
        attrs: 'autocomplete="off" maxlength="80"'
      }),
      botao: nova ? "Criar rede" : "Salvar",
      comMapa: false,
      aoSalvar: (d) => {
        const { valor, erros } = validarRede(d, { redes: dados.hubs, id: r && r.id });
        if (temErros(erros)) return erros;
        const lista = nova ? inserir(dados.hubs, { id: novoId("hub"), ...valor }) : atualizar(dados.hubs, r.id, valor);
        return salvarEVoltar("hubs", lista, nova ? "Rede criada." : "Rede renomeada.");
      }
    });
  }

  async function salvarCustos(form) {
    let custos = dados.custos;
    const erros = {};
    for (const e of dados.estacoes.filter((x) => x.ativa !== false)) {
      const bruto = form.elements["custo." + e.id].value;
      if (bruto.trim() === "") continue;
      const r = validarCusto({ estacaoId: e.id, mes, valor: bruto });
      if (temErros(r.erros)) erros["custo." + e.id] = r.erros.valor || r.erros.mes;
      else custos = definirCusto(custos, r.valor);
    }
    if (temErros(erros)) {
      mostrarErros(form, erros);
      return;
    }
    await fonte.salvar("custos", custos);
    avisoPendente = "Custos de " + rotuloMes(mes) + " salvos.";
    history.replaceState(null, "", montarHash(caminho, { aba: "custos", mes }));
    await recarregar();
  }

  const porId = (lista, id) => lista.find((x) => x.id === id);

  async function executarAcao(ev) {
    const btn = ev.target.closest("[data-acao]");
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.acao) {
      case "cancelar":
        fecharDialogo();
        break;
      case "exportar-concorrentes":
        baixarPlanilha(planilhaConcorrentes(dados.concorrentes), nomeArquivo("concorrentes", hoje));
        break;
      case "novo-concorrente":
        formDeConcorrente(null);
        break;
      case "editar-concorrente":
        formDeConcorrente(porId(dados.concorrentes, id));
        break;
      case "excluir-concorrente": {
        const c = porId(dados.concorrentes, id);
        confirmar({
          titulo: "Excluir concorrente?",
          texto: c.nome + " sai da lista e das comparações de preço. Não dá para desfazer.",
          botao: "Excluir concorrente",
          aoConfirmar: () => salvarEVoltar("concorrentes", remover(dados.concorrentes, id), "Concorrente excluído.")
        });
        break;
      }
      case "nova-estacao":
        formDeEstacao(null);
        break;
      case "editar-estacao":
        formDeEstacao(porId(dados.estacoes, id));
        break;
      case "alternar-estacao": {
        const e = porId(dados.estacoes, id);
        const ativa = e.ativa !== false;
        await salvarEVoltar(
          "estacoes",
          atualizar(dados.estacoes, id, { ativa: !ativa }),
          ativa ? "Estação desativada." : "Estação reativada."
        );
        break;
      }
      case "excluir-estacao": {
        const e = porId(dados.estacoes, id);
        confirmar({
          titulo: "Excluir estação?",
          texto: e.nome + " não tem recargas e será removida dos cadastros. Não dá para desfazer.",
          botao: "Excluir estação",
          aoConfirmar: () => {
            if (!podeExcluirEstacao(id, dados.recargas))
              throw new Error("Esta estação tem recargas. Desative em vez de excluir.");
            const custos = dados.custos.filter((c) => c.estacaoId !== id);
            return fonte
              .salvar("custos", custos)
              .then(() => salvarEVoltar("estacoes", remover(dados.estacoes, id), "Estação excluída."));
          }
        });
        break;
      }
      case "nova-rede":
        formDeRede(null);
        break;
      case "editar-rede":
        formDeRede(porId(dados.hubs, id));
        break;
      case "excluir-rede": {
        const r = porId(dados.hubs, id);
        confirmar({
          titulo: "Excluir rede?",
          texto: "A rede " + r.nome + " não tem estações e será removida.",
          botao: "Excluir rede",
          aoConfirmar: () => {
            if (!podeExcluirRede(id, dados.estacoes)) throw new Error("A rede tem estações. Mova as estações antes.");
            return salvarEVoltar("hubs", remover(dados.hubs, id), "Rede excluída.");
          }
        });
        break;
      }
      case "add-conector": {
        const ul = dialogo.querySelector(".conectores");
        ul.insertAdjacentHTML("beforeend", linhaConector({ tipo: "DC" }, ul.children.length));
        ul.lastElementChild.querySelector("select").focus();
        break;
      }
      case "remover-conector": {
        const ul = dialogo.querySelector(".conectores");
        btn.closest("li").remove();
        // Renumera para os nomes "conectores.N.*" continuarem em sequência.
        [...ul.children].forEach((li, i) => {
          for (const el of li.querySelectorAll("[name]"))
            el.name = el.name.replace(/^conectores\.\d+\./, "conectores." + i + ".");
          li.dataset.indice = i;
        });
        const proximo = ul.querySelector("select") || dialogo.querySelector('[data-acao="add-conector"]');
        proximo.focus();
        break;
      }
    }
  }

  function aoDigitar(ev) {
    if (ev.target.matches("[data-busca]")) {
      busca = ev.target.value;
      const pos = ev.target.selectionStart;
      desenharAba();
      const campoBusca = conteudo.querySelector("[data-busca]");
      campoBusca.focus();
      campoBusca.setSelectionRange(pos, pos);
    }
  }

  function aoMudar(ev) {
    if (ev.target.matches("[data-mes]") && ev.target.value) {
      mes = ev.target.value;
      history.replaceState(null, "", montarHash(caminho, { aba: "custos", mes }));
      desenharAba();
      conteudo.querySelector("[data-mes]").focus();
    }
  }

  function aoEnviar(ev) {
    if (ev.target.matches('[data-form="custos"]')) {
      ev.preventDefault();
      salvarCustos(ev.target).catch((erro) => {
        const msg = document.createElement("p");
        msg.className = "form-erro";
        msg.setAttribute("role", "alert");
        msg.textContent = erro.message;
        ev.target.append(msg);
      });
    }
  }

  dialogo.addEventListener("close", soltarMapa);
  desenharAba();
  // Erros de ações sem formulário (ex.: desativar estação sem espaço no navegador) aparecem na tela.
  function aoClicar(ev) {
    executarAcao(ev).catch((erro) => {
      console.error(erro);
      let msg = alvo.querySelector(".aviso-erro");
      if (!msg) {
        msg = document.createElement("p");
        msg.className = "aviso aviso-erro";
        msg.setAttribute("role", "alert");
        conteudo.before(msg);
      }
      msg.textContent = erro.message;
    });
  }

  alvo.addEventListener("click", aoClicar);
  alvo.addEventListener("input", aoDigitar);
  alvo.addEventListener("change", aoMudar);
  conteudo.addEventListener("submit", aoEnviar);
  return () => {
    soltarMapa();
    alvo.removeEventListener("click", aoClicar);
    alvo.removeEventListener("input", aoDigitar);
    alvo.removeEventListener("change", aoMudar);
  };
}
