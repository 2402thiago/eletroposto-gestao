// Fonte de dados das telas. Contrato:
//   carregar(): Promise<{ demo, origem, hubs, estacoes, recargas, custos, concorrentes }>
//   salvar(colecao, lista): Promise<void>   colecao: "hubs" | "estacoes" | "custos" | "concorrentes"
// Recargas, tarifa, bicos e sessões vêm do app (só leitura); os cadastros da análise têm chaves próprias.

import { CONFIG_PADRAO_POSTO, ID_POSTO, PREFIXO_POSTO, estacaoDoPosto, lerPosto, recargaDoPosto } from "./posto.js";

export const COLECOES = ["hubs", "estacoes", "custos", "concorrentes"];
const PREFIXO_CADASTROS = "analise_";

function erroDeEspaco(erro) {
  return new Error("Não foi possível salvar no navegador. Libere espaço e tente de novo.", { cause: erro });
}

function criarArmazem(storage, prefixo) {
  const chave = (c) => prefixo + c;
  return {
    chave,
    ler(colecao) {
      const bruto = storage.getItem(chave(colecao));
      if (bruto == null) return null;
      try {
        const lista = JSON.parse(bruto);
        return Array.isArray(lista) ? lista : null;
      } catch {
        return null;
      }
    },
    gravar(colecao, lista) {
      if (!COLECOES.includes(colecao)) throw new Error("Coleção desconhecida: " + colecao);
      try {
        storage.setItem(chave(colecao), JSON.stringify(lista));
      } catch (erro) {
        throw erroDeEspaco(erro);
      }
    }
  };
}

// Campos da estação do posto que vêm do app e não são gravados pela análise.
function extrasDoPosto(e) {
  const { precoKwh: _p, origem: _o, conectores, ...resto } = e;
  return { ...resto, conectores: (conectores || []).map((c) => ({ id: c.id, tipo: c.tipo })) };
}

// Dados do app na mesma origem. Recargas, preço, bicos e sessões são lidos a cada carga e nunca
// gravados. Os cadastros da análise (concorrentes, custos, redes e extras do posto) ficam em analise_*.
// Opções: prefixoOrigem (chaves do app) e prefixoCadastros (chaves da análise; "eletroposto_analise_" entra no backup),
//   padrao: configuração padrão do app, ondeConfigura: onde o usuário muda preço e bicos (texto da tela).
export function criarFontePosto(
  storage = localStorage,
  {
    prefixoOrigem = PREFIXO_POSTO,
    prefixoCadastros = PREFIXO_CADASTROS,
    padrao = CONFIG_PADRAO_POSTO,
    ondeConfigura = "em Configurações"
  } = {}
) {
  const armazem = criarArmazem(storage, prefixoCadastros);
  return {
    nome: "Posto",
    async carregar() {
      const u = lerPosto(storage, prefixoOrigem, padrao);
      if (!u) throw new Error("Os dados do posto não estão disponíveis neste navegador.");
      const salvas = armazem.ler("estacoes") || [];
      const extras = salvas.find((e) => e.id === ID_POSTO) || {};
      const posto = estacaoDoPosto(u.config, u.sessoes, extras);
      return {
        demo: false,
        origem: "posto",
        ondeConfigura,
        hubs: armazem.ler("hubs") || [],
        estacoes: [posto, ...salvas.filter((e) => e.id !== ID_POSTO)],
        recargas: u.registros.map(recargaDoPosto).filter(Boolean),
        custos: armazem.ler("custos") || [],
        concorrentes: armazem.ler("concorrentes") || []
      };
    },
    async salvar(colecao, lista) {
      const gravar = colecao === "estacoes" ? lista.map((e) => (e.id === ID_POSTO ? extrasDoPosto(e) : e)) : lista;
      armazem.gravar(colecao, gravar);
    },
    invalidar() {}
  };
}

export function estacoesAtivas(estacoes) {
  return estacoes.filter((e) => e.ativa !== false);
}

// Interface para preços coletados automaticamente. Nenhum coletor está ligado:
// ativar só com uma fonte cujos termos permitam o uso.
export const coletorDePrecos = {
  disponivel: false,
  async coletar() {
    throw new Error("Nenhum coletor de preços configurado. Cadastre os concorrentes manualmente.");
  }
};
