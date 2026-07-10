import { newGame, processSeasonTransitions } from "../src/game/seeder.ts";
import { mulberry32 } from "../src/game/rng.ts";

function test() {
  console.log("Iniciando simulação de teste de aposentadoria...");

  // 1. Criar novo jogo
  const gameState = newGame(12345, "bot_br");
  console.log(`Jogo iniciado. Temporada: ${gameState.season}. Total de jogadores: ${gameState.players.length}`);

  // Vamos forçar a idade de alguns jogadores do Botafogo para serem veteranos para testar a aposentadoria
  const botafogoPlayers = gameState.players.filter(p => p.clubId === "bot_br");
  console.log("\nModificando idades do Botafogo para induzir aposentadorias:");
  
  // Marçal terá 38 anos
  const marcal = botafogoPlayers.find(p => p.name.includes("Marçal"));
  if (marcal) {
    marcal.age = 37; // Vai envelhecer para 38
    console.log(`- ${marcal.name} definido para 37 anos (envelhecerá para 38)`);
  }
  
  // Bastos / Quissanga terá 36 anos
  const quissanga = botafogoPlayers.find(p => p.name.includes("Quissanga"));
  if (quissanga) {
    quissanga.age = 35; // Vai envelhecer para 36
    console.log(`- ${quissanga.name} definido para 35 anos (envelhecerá para 36)`);
  }

  // 2. Simular transição de temporada
  const seasonRng = mulberry32(88888);
  console.log("\nProcessando transição de temporada...");
  
  const { updatedPlayers, pendingPromotions, retiredLastSeason } = processSeasonTransitions(
    seasonRng,
    gameState.players,
    gameState.clubs,
    gameState.userClubId
  );

  console.log(`\nFim da temporada processado!`);
  console.log(`Total de jogadores ativos após aposentadorias (antes das promoções do usuário): ${updatedPlayers.length}`);
  console.log(`Total de aposentados no save: ${retiredLastSeason.length}`);
  
  console.log("\nLista de aposentados (amostra):");
  retiredLastSeason.slice(0, 10).forEach(r => {
    console.log(`- ${r.name} (${r.age} anos) - Clube: ${r.clubName}`);
  });

  console.log(`\nPromoções pendentes para o clube do usuário (Botafogo): ${pendingPromotions.length}`);
  
  pendingPromotions.forEach((promo, i) => {
    console.log(`\nPromoção #${i + 1} - Posição: ${promo.position}`);
    console.log("Candidatos disponíveis:");
    promo.options.forEach((opt, j) => {
      console.log(`  [Opção ${j + 1}] ID: ${opt.id} - ${opt.name} (${opt.age} anos, Pé: ${opt.foot}, Força: ${opt.strength}, Potencial/Cap: ${opt.cap}, Nível: ${opt.tier}, Atributos: ${opt.traits.join(", ") || 'Nenhum'}`);
    });
  });
}

test();
