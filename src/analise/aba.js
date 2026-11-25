// Aba Análise. O app cuida do menu principal, do tema e das permissões; aqui ficam só as subabas e as telas.
//
//   const analise = montarAnalise(elemento, { fonte, base: "analise", rotulos: { "/": { rotulo: "Visão geral" } } });
//   analise.mostrar();   // a cada vez que a aba abre ou o hash muda

import { criarNavegador } from "./ui/navegador.js";
import { ROTAS, configurarRotas, montarHash } from "./ui/rotas.js";
import { esc } from "./ui/html.js";

export function montarAnalise(raiz, { fonte, base, rotulos = {}, agora = () => new Date() }) {
  configurarRotas({ base, rotulos });
  raiz.classList.add("analise");
  raiz.innerHTML =
    '<nav class="segmentos subabas" aria-label="Telas da análise">' +
    ROTAS.map(
      (r) =>
        '<a class="segmento" data-rota="' +
        esc(r.caminho) +
        '" href="' +
        montarHash(r.caminho, {}) +
        '">' +
        esc(r.rotulo) +
        "</a>"
    ).join("") +
    "</nav>" +
    '<div class="analise-conteudo"></div>';
  const conteudo = raiz.querySelector(".analise-conteudo");

  function marcar(caminho) {
    for (const a of raiz.querySelectorAll(".subabas [data-rota]")) {
      const ativa = a.dataset.rota === caminho;
      a.classList.toggle("ativo", ativa);
      if (ativa) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
  }

  const navegador = criarNavegador({ conteudo, fonte, agora, aoNavegar: marcar });

  return {
    // Relê os dados do app a cada abertura: recargas e configuração podem ter mudado nas outras abas.
    async mostrar() {
      try {
        await navegador.carregar();
      } catch (erro) {
        console.error(erro);
        conteudo.innerHTML =
          '<div class="estado estado-erro" role="alert">Não foi possível ler os dados do posto. Recarregue a página.</div>';
        return;
      }
      await navegador.navegar();
    }
  };
}
