// Rotas por hash, sem configuração de servidor. As rotas da aba ganham o prefixo #analise/ (configurarRotas).

const ICONE_PAINEL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>';
const ICONE_CONCORRENCIA =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';

const ICONE_CADASTROS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>';

export const ROTAS = [
  {
    caminho: "/",
    rotulo: "Painel",
    titulo: "Visão geral da operação",
    icone: ICONE_PAINEL,
    tela: () => import("../views/painel.js")
  },
  {
    caminho: "/concorrencia",
    rotulo: "Concorrência",
    titulo: "Concorrência na região",
    icone: ICONE_CONCORRENCIA,
    tela: () => import("../views/concorrencia.js")
  },
  {
    caminho: "/cadastros",
    rotulo: "Cadastros",
    titulo: "Cadastros",
    icone: ICONE_CADASTROS,
    tela: () => import("../views/cadastros.js")
  }
];

let BASE = "";

// base: prefixo das rotas no hash. rotulos: { "/caminho": { rotulo, titulo } } para trocar os nomes das telas.
export function configurarRotas({ base = "", rotulos = {} } = {}) {
  BASE = base;
  for (const r of ROTAS) Object.assign(r, rotulos[r.caminho] || {});
}

export function caminhoAtual(hash) {
  let c = (hash || "").replace(/^#/, "");
  if (BASE && c.startsWith(BASE)) c = c.slice(BASE.length);
  return c.split("?")[0] || "/";
}

export function parametrosAtuais(hash) {
  const i = (hash || "").indexOf("?");
  return new URLSearchParams(i >= 0 ? hash.slice(i + 1) : "");
}

// Hash da rota com os parâmetros dados; valores vazios saem da URL.
export function montarHash(caminho, params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") p.set(k, v);
  const q = p.toString();
  return "#" + BASE + caminho + (q ? "?" + q : "");
}

export function resolverRota(caminho) {
  return ROTAS.find((r) => r.caminho === caminho) || null;
}
