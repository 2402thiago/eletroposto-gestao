// Monta a aba Análise com os módulos de src/analise/.
// Lê recargas, configuração e sessões do Eletroposto (chaves eletroposto_*) sem gravar nelas.
// Os dados próprios da análise ficam em eletroposto_analise_*, então entram no backup e saem em "Apagar tudo".
import { criarFontePosto } from "./analise/data/fonte.js";
import { CONFIG_PADRAO_POSTO } from "./analise/data/posto.js";
import { montarAnalise } from "./analise/aba.js";

const painel = document.getElementById("tab-analise");

if (painel) {
  const fonte = criarFontePosto(localStorage, {
    prefixoOrigem: "eletroposto_",
    prefixoCadastros: "eletroposto_analise_",
    // Mesmo padrão do Eletroposto (src/app.js, CONFIG_PADRAO) enquanto a configuração não foi salva.
    padrao: { ...CONFIG_PADRAO_POSTO, nomeSistema: "Eletroposto" },
    ondeConfigura: "em Configurações"
  });
  const analise = montarAnalise(painel, {
    fonte,
    base: "analise",
    rotulos: {
      "/": { rotulo: "Visão geral" },
      "/cadastros": { rotulo: "Dados da análise", titulo: "Dados da análise" }
    }
  });
  window.eletropostoAnalise = analise;
  // Se o app abriu direto na aba Análise, o app.js passou por ela antes de este módulo carregar.
  if (painel.classList.contains("active")) analise.mostrar();
}
