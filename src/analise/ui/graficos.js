// Gráficos em SVG puro. Cores vêm de variáveis CSS (var(--serie-N)), então seguem o tema.

import { esc } from "./html.js";

// Passo redondo (1, 2 ou 5 × 10^n) para cerca de quatro divisões do eixo.
function escalaBonita(max) {
  if (max <= 0) return { topo: 1, passo: 0.25 };
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map((m) => m * pot).find((p) => p >= bruto);
  return { topo: Math.ceil(max / passo) * passo, passo };
}

function pontos(lista) {
  return lista.map((p) => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
}

// Linhas mensais por série. Cada série: { nome, cor, valores: (number|null)[12], projecao, oculta }.
// O mês corrente é desenhado como linha tracejada do mês anterior até a projeção, terminando em ponto vazado.
export function graficoLinhasMensais({ series, mesAtual, rotulosX, formatarY, descricao, largura = 640 }) {
  const L = largura;
  const A = 240;
  const m = { t: 12, r: 12, b: 28, l: 60 };
  const w = L - m.l - m.r;
  const h = A - m.t - m.b;
  const visiveis = series.filter((s) => !s.oculta);
  const maximo = Math.max(
    0,
    ...visiveis.flatMap((s) => [...s.valores.slice(0, mesAtual), s.projecao || 0].filter((v) => v != null))
  );
  const { topo, passo } = escalaBonita(maximo * 1.05);
  const x = (i) => m.l + (w * i) / 11;
  const y = (v) => m.t + h - (h * v) / topo;

  let svg = "";
  for (let v = 0; v <= topo + passo / 2; v += passo) {
    svg += '<line class="grade" x1="' + m.l + '" x2="' + (L - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
    svg +=
      '<text class="eixo" x="' +
      (m.l - 8) +
      '" y="' +
      (y(v) + 4) +
      '" text-anchor="end">' +
      esc(formatarY(v)) +
      "</text>";
  }
  rotulosX.forEach((r, i) => {
    svg +=
      '<text class="eixo' +
      (i === mesAtual ? " eixo-atual" : "") +
      '" x="' +
      x(i) +
      '" y="' +
      (A - 8) +
      '" text-anchor="middle">' +
      esc(r) +
      "</text>";
  });
  for (const s of visiveis) {
    const fechados = s.valores.slice(0, mesAtual).map((v, i) => ({ x: x(i), y: y(v) }));
    if (fechados.length > 1)
      svg += '<polyline class="linha" style="stroke:' + s.cor + '" points="' + pontos(fechados) + '"/>';
    for (const p of fechados)
      svg += '<circle class="ponto" style="fill:' + s.cor + '" cx="' + p.x + '" cy="' + p.y + '" r="3"/>';
    if (s.projecao != null) {
      const proj = { x: x(mesAtual), y: y(s.projecao) };
      if (fechados.length)
        svg +=
          '<polyline class="linha linha-projecao" style="stroke:' +
          s.cor +
          '" points="' +
          pontos([fechados[fechados.length - 1], proj]) +
          '"/>';
      svg +=
        '<circle class="ponto-projecao" style="stroke:' + s.cor + '" cx="' + proj.x + '" cy="' + proj.y + '" r="4.5"/>';
    }
  }
  return (
    '<svg class="grafico" viewBox="0 0 ' +
    L +
    " " +
    A +
    '" role="img" aria-label="' +
    esc(descricao) +
    '">' +
    svg +
    "</svg>"
  );
}

// Barras por hora (mediana do mercado) com o seu preço como linha horizontal e a hora atual destacada.
export function graficoPrecoPorHora({ horas, seuPreco, horaAtual, descricao, largura = 640 }) {
  const L = largura;
  const A = 180;
  const m = { t: 14, r: 8, b: 24, l: 8 };
  const w = L - m.l - m.r;
  const h = A - m.t - m.b;
  const valores = horas.map((x) => x.mediana).filter((v) => v != null);
  const topo = Math.max(seuPreco || 0, ...valores, 0.01) * 1.12;
  const passo = w / 24;
  const y = (v) => m.t + h - (h * v) / topo;

  let svg = "";
  horas.forEach(({ hora, mediana }) => {
    const x0 = m.l + passo * hora + 2;
    if (mediana != null) {
      svg +=
        '<rect class="barra' +
        (hora === horaAtual ? " barra-agora" : "") +
        '" x="' +
        x0 +
        '" y="' +
        y(mediana) +
        '" width="' +
        (passo - 4) +
        '" height="' +
        (m.t + h - y(mediana)) +
        '" rx="3"><title>' +
        hora +
        "h: mediana R$ " +
        mediana.toFixed(2).replace(".", ",") +
        "</title></rect>";
    }
    if (hora % 3 === 0)
      svg +=
        '<text class="eixo" x="' +
        (x0 + (passo - 4) / 2) +
        '" y="' +
        (A - 6) +
        '" text-anchor="middle">' +
        hora +
        "h</text>";
  });
  if (seuPreco != null) {
    svg +=
      '<line class="linha-seu-preco" x1="' +
      m.l +
      '" x2="' +
      (L - m.r) +
      '" y1="' +
      y(seuPreco) +
      '" y2="' +
      y(seuPreco) +
      '"/>';
  }
  return (
    '<svg class="grafico" viewBox="0 0 ' +
    L +
    " " +
    A +
    '" role="img" aria-label="' +
    esc(descricao) +
    '">' +
    svg +
    "</svg>"
  );
}

// Desenha o gráfico na largura real do container, para o texto ficar sempre em 12px,
// e redesenha quando a largura muda. Devolve a função que para de observar.
export function montarResponsivo(el, desenhar) {
  let largura = 0;
  const atualizar = () => {
    const nova = Math.round(el.clientWidth) || 640;
    if (nova === largura) return;
    largura = nova;
    el.innerHTML = desenhar(largura);
  };
  atualizar();
  if (typeof ResizeObserver === "undefined") return () => {};
  const obs = new ResizeObserver(atualizar);
  obs.observe(el);
  return () => obs.disconnect();
}
