// Carrega os dados da fonte e desenha a tela da rota atual em "conteudo" (usado por aba.js). Cada tela exporta renderizar(alvo, contexto) e pode
// devolver uma função de limpeza (ex.: remover o mapa).

import { caminhoAtual, montarHash, parametrosAtuais, resolverRota } from "./rotas.js";

// dadosIniciais: dados já carregados (evita ler a fonte duas vezes).
export function criarNavegador({
  conteudo,
  fonte,
  agora = () => new Date(),
  aoNavegar = () => {},
  sufixoTitulo = null,
  dadosIniciais = null
}) {
  let dados = dadosIniciais;
  let carregadoEm = dadosIniciais ? agora() : null;
  let limpar = null;

  async function carregar() {
    dados = await fonte.carregar();
    carregadoEm = agora();
    return dados;
  }

  async function recarregar() {
    if (fonte.invalidar) fonte.invalidar();
    await carregar();
    await navegar();
  }

  async function navegar() {
    if (limpar) limpar();
    limpar = null;
    const caminho = caminhoAtual(location.hash);
    const rota = resolverRota(caminho);
    aoNavegar(caminho);
    if (!rota) {
      conteudo.innerHTML =
        '<div class="estado">Esta página não existe. <a href="' + montarHash("/", {}) + '">Ir para o início</a></div>';
      return;
    }
    if (sufixoTitulo) document.title = rota.titulo + " · " + sufixoTitulo;
    try {
      if (!dados) await carregar();
      const tela = await rota.tela();
      const params = parametrosAtuais(location.hash);
      limpar =
        tela.renderizar(conteudo, {
          dados,
          fonte,
          hoje: agora(),
          carregadoEm,
          params,
          recarregar,
          caminho,
          titulo: rota.titulo
        }) || null;
    } catch (erro) {
      console.error(erro);
      conteudo.innerHTML =
        '<div class="estado estado-erro" role="alert">Não foi possível abrir esta tela. Recarregue a página.</div>';
    }
  }

  return { carregar, navegar, recarregar };
}
