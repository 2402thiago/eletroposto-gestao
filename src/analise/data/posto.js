// Adaptador app → módulo de análise. Funções puras: recebem o que o app guarda no localStorage e devolvem
// o formato da análise. Nada aqui grava nas chaves do app.
//
// Formato do app (src/app.js):
//   eletroposto_registros    recargas: { id, data (fim), inicio, duracaoSegundos, bico (nº), cliente,
//                            kwhUtilizado | kwh, valorKwh, valorPagar, metodoPagamento, ... }
//   eletroposto_config       { nomeSistema, tarifaKwh, carregadores: [{ potenciaKw }] } (um item por bico)
//   eletroposto_sessoes      sessões abertas: { bico, status: "carregando" | "aguardando", ... }

export const PREFIXO_POSTO = "eletroposto_";

// Chaves que o app grava logo ao abrir, mesmo sem nenhuma recarga: indicam que ele está nesta origem.
const SUFIXOS_PRESENCA = ["config", "registros", "sessoes", "caixa", "presencas", "sheets_device"];

// Mesmo padrão do app (src/app.js, CONFIG_PADRAO): é o que ele mostra enquanto ninguém salvou configuração.
export const CONFIG_PADRAO_POSTO = {
  nomeSistema: "Eletroposto",
  tarifaKwh: 1.5,
  carregadores: [{ potenciaKw: 40 }, { potenciaKw: 60 }, { potenciaKw: 60 }]
};

export const ID_POSTO = "posto";

// Acima disso, o bico é tratado como carga rápida (DC). Pode ser corrigido no cadastro da estação.
export const LIMITE_AC_KW = 22;

export function idDoBico(n) {
  return ID_POSTO + "-b" + n;
}

function iso(v) {
  if (v == null || v === "") return null;
  const d = new Date(typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v);
  return isNaN(d) ? null : d.toISOString();
}

// Converte uma recarga do app. Sem data de fim válida, a recarga é descartada (null).
export function recargaDoPosto(r) {
  const fim = iso(r.data);
  if (!fim) return null;
  let inicio = iso(r.inicio);
  if (!inicio && Number(r.duracaoSegundos) > 0)
    inicio = new Date(new Date(fim).getTime() - r.duracaoSegundos * 1000).toISOString();
  const kwh = Number(r.kwhUtilizado != null ? r.kwhUtilizado : r.kwh) || 0;
  const n = parseInt(r.bico, 10);
  return {
    id: "posto-" + r.id,
    estacaoId: ID_POSTO,
    bico: n > 0 ? idDoBico(n) : null,
    cliente: r.cliente || "",
    inicio: inicio || fim,
    data: fim,
    kwhUtilizado: kwh,
    valorKwh: Number(r.valorKwh) || 0,
    valorPagar: Number(r.valorPagar) || 0,
    metodoPagamento: r.metodoPagamento || ""
  };
}

// Estação única do posto. "extras" é o que a análise guarda sobre ela (localização, custo da energia,
// rede, plano, nome de exibição e tipo dos conectores). Preço e potência vêm sempre do app.
export function estacaoDoPosto(config, sessoes, extras = {}) {
  const carregadores = Array.isArray(config && config.carregadores) ? config.carregadores : [];
  const emUso = new Set(
    (sessoes || []).filter((s) => s && s.status === "carregando" && s.bico != null).map((s) => parseInt(s.bico, 10))
  );
  const tipos = new Map((extras.conectores || []).map((c) => [c.id, c.tipo]));
  const conectores = carregadores.map((c, i) => {
    const id = idDoBico(i + 1);
    const potenciaKw = Number(c && c.potenciaKw) || 0;
    return {
      id,
      tipo: tipos.get(id) || (potenciaKw > LIMITE_AC_KW ? "DC" : "AC"),
      potenciaKw,
      // O app não registra bico parado: sem sessão aberta, o bico está livre.
      status: emUso.has(i + 1) ? "carregando" : "livre"
    };
  });
  const tarifa = Number(config && config.tarifaKwh);
  return {
    hubId: null,
    noPlano: true,
    cidade: "",
    uf: "",
    lat: null,
    lng: null,
    custoKwh: null,
    ...extras,
    id: ID_POSTO,
    origem: "posto",
    nome: extras.nome || (config && config.nomeSistema) || "Posto",
    precoKwh: tarifa > 0 ? tarifa : null,
    conectores,
    ativa: extras.ativa !== false
  };
}

// Lê do localStorage sem nunca escrever. Devolve null quando não há dados do app neste navegador.
// prefixo: chaves do app ("eletroposto_"). padrao: configuração que o app mostra
// enquanto ninguém salvou a dele.
export function lerPosto(storage, prefixo = PREFIXO_POSTO, padrao = CONFIG_PADRAO_POSTO) {
  const ler = (chave) => {
    try {
      return JSON.parse(storage.getItem(chave));
    } catch {
      return null;
    }
  };
  if (!SUFIXOS_PRESENCA.some((s) => storage.getItem(prefixo + s) != null)) return null;
  const config = ler(prefixo + "config");
  const registros = ler(prefixo + "registros");
  const sessoes = ler(prefixo + "sessoes");
  return {
    config: { ...padrao, ...(config && typeof config === "object" ? config : {}) },
    registros: Array.isArray(registros) ? registros : [],
    sessoes: Array.isArray(sessoes) ? sessoes : []
  };
}

export function temLocalizacao(e) {
  return typeof e.lat === "number" && typeof e.lng === "number" && isFinite(e.lat) && isFinite(e.lng);
}
