// Cadastros: validação e operações puras sobre listas. Quem persiste é a fonte (fonte.js).
// Cada validar* devolve { valor, erros }: valor normalizado e erros por campo, em português.

function texto(v) {
  return String(v == null ? "" : v).trim();
}

// Aceita "1,96" e "1.96". Vazio vira null.
export function numero(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : NaN;
  const s = String(v).trim().replace(/\s/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return isFinite(n) ? n : NaN;
}

function exigirNome(erros, nome, campo = "nome") {
  if (!nome) erros[campo] = "Informe o nome.";
  else if (nome.length > 80) erros[campo] = "Use no máximo 80 caracteres.";
}

function validarCoordenadas(erros, lat, lng) {
  if (lat == null || isNaN(lat) || lat < -90 || lat > 90)
    erros.lat = "Latitude entre -90 e 90. Clique no mapa para preencher.";
  if (lng == null || isNaN(lng) || lng < -180 || lng > 180)
    erros.lng = "Longitude entre -180 e 180. Clique no mapa para preencher.";
}

function validarPreco(erros, campo, v, { obrigatorio = false } = {}) {
  if (v == null) {
    if (obrigatorio) erros[campo] = "Informe o valor.";
    return;
  }
  if (isNaN(v) || v < 0 || v > 20) erros[campo] = "Use um valor em R$/kWh entre 0 e 20.";
}

function validarPotencia(erros, campo, v) {
  if (v == null || isNaN(v) || v <= 0 || v > 1000) erros[campo] = "Potência em kW entre 1 e 1000.";
}

export const TIPOS = ["DC", "AC"];

export function validarConcorrente(dados) {
  const erros = {};
  const valor = {
    nome: texto(dados.nome),
    lat: numero(dados.lat),
    lng: numero(dados.lng),
    tipo: dados.tipo,
    potenciaKw: numero(dados.potenciaKw),
    preco: numero(dados.preco)
  };
  exigirNome(erros, valor.nome);
  validarCoordenadas(erros, valor.lat, valor.lng);
  if (!TIPOS.includes(valor.tipo)) erros.tipo = "Escolha rápido (DC) ou lento (AC).";
  validarPotencia(erros, "potenciaKw", valor.potenciaKw);
  validarPreco(erros, "preco", valor.preco);
  return { valor, erros };
}

export function validarEstacao(dados, { redes = [] } = {}) {
  const erros = {};
  const conectores = (dados.conectores || []).map((c) => ({ ...c, potenciaKw: numero(c.potenciaKw) }));
  const valor = {
    nome: texto(dados.nome),
    cidade: texto(dados.cidade),
    uf: texto(dados.uf).toUpperCase(),
    lat: numero(dados.lat),
    lng: numero(dados.lng),
    hubId: dados.hubId || null,
    noPlano: !!dados.noPlano,
    precoKwh: numero(dados.precoKwh),
    custoKwh: numero(dados.custoKwh),
    conectores
  };
  exigirNome(erros, valor.nome);
  if (!valor.cidade) erros.cidade = "Informe a cidade.";
  if (!/^[A-Z]{2}$/.test(valor.uf)) erros.uf = "Use a sigla do estado, com 2 letras.";
  validarCoordenadas(erros, valor.lat, valor.lng);
  if (valor.hubId && !redes.some((r) => r.id === valor.hubId)) erros.hubId = "Rede não encontrada.";
  validarPreco(erros, "precoKwh", valor.precoKwh);
  validarPreco(erros, "custoKwh", valor.custoKwh, { obrigatorio: true });
  if (!conectores.length) erros.conectores = "Adicione pelo menos um conector.";
  conectores.forEach((c, i) => {
    if (!TIPOS.includes(c.tipo)) erros["conectores." + i + ".tipo"] = "Escolha DC ou AC.";
    validarPotencia(erros, "conectores." + i + ".potenciaKw", c.potenciaKw);
  });
  return { valor, erros };
}

export function validarRede(dados, { redes = [], id = null } = {}) {
  const erros = {};
  const valor = { nome: texto(dados.nome) };
  exigirNome(erros, valor.nome);
  const repetida = redes.some((r) => r.id !== id && r.nome.toLowerCase() === valor.nome.toLowerCase());
  if (valor.nome && repetida) erros.nome = "Já existe uma rede com esse nome.";
  return { valor, erros };
}

export function validarCusto(dados) {
  const erros = {};
  const valor = { estacaoId: dados.estacaoId, mes: dados.mes, valor: numero(dados.valor) };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(valor.mes || "")) erros.mes = "Mês inválido.";
  if (valor.valor == null || isNaN(valor.valor) || valor.valor < 0 || valor.valor > 10000000) {
    erros.valor = "Informe um valor em R$ a partir de 0.";
  }
  return { valor, erros };
}

export function temErros(erros) {
  return Object.keys(erros).length > 0;
}

export function novoId(prefixo) {
  return prefixo + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Operações sobre listas: não alteram a lista recebida.

export function inserir(lista, item) {
  return [...lista, item];
}

export function atualizar(lista, id, mudancas) {
  if (!lista.some((x) => x.id === id)) throw new Error("Registro não encontrado: " + id);
  return lista.map((x) => (x.id === id ? { ...x, ...mudancas, id } : x));
}

export function remover(lista, id) {
  return lista.filter((x) => x.id !== id);
}

// Estação com recargas não é excluída: só desativada, para não perder o histórico.
export function podeExcluirEstacao(estacaoId, recargas) {
  return !recargas.some((r) => r.estacaoId === estacaoId);
}

export function podeExcluirRede(redeId, estacoes) {
  return !estacoes.some((e) => e.hubId === redeId);
}

// Custo fixo do mês: um registro por estação e mês. Grava ou substitui.
export function definirCusto(custos, { estacaoId, mes, valor }) {
  const id = "custo-" + estacaoId + "-" + mes;
  const resto = custos.filter((c) => !(c.estacaoId === estacaoId && c.mes === mes && c.tipo === "fixo"));
  return [...resto, { id, estacaoId, tipo: "fixo", mes, valor }];
}
