// Remover um mapa Leaflet no meio de uma animação de movimento faz a animação seguinte falhar
// ("Cannot read properties of undefined (reading '_leaflet_pos')"). Parar antes de remover evita isso.
export function removerMapa(mapa) {
  if (!mapa) return;
  mapa.stop();
  mapa.remove();
}
