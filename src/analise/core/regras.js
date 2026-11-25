// Regras de negócio. Os valores abaixo foram definidos e confirmados pelo responsável pelo produto em 2026-11-11.

// Diferença relativa à mediana a partir da qual a estação é "mais cara" ou "mais barata".
export const TOLERANCIA_MEDIANA = 0.05;

// Abaixo deste número de concorrentes com preço, o mercado é "raso".
// Coerente com o observado: 2 e 4 concorrentes aparecem como raso; 8 e 10, não.
export const MINIMO_MERCADO = 5;

// Raio adaptativo: começa no primeiro valor e cresce até achar concorrentes suficientes.
export const RAIOS_KM = [5, 8, 15, 25];
export const MINIMO_CONCORRENTES_RAIO = 3;

// Faixas de ocupação dos conectores no período. Ponto de partida: ajustar se houver meta de ocupação.
export const OCUPACAO_BAIXA = 0.15;
export const OCUPACAO_ALTA = 0.4;
