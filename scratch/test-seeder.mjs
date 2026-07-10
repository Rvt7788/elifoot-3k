import { newGame } from "../src/game/seeder.ts";

function test() {
  console.log("Simulando criação de um novo jogo...");
  const gameState = newGame(987654, "bot_br");
  const botafogoPlayers = gameState.players.filter(p => p.clubId === "bot_br");

  console.log(`Botafogo tem ${botafogoPlayers.length} jogadores no save.`);
  const counts = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
  for (const p of botafogoPlayers) {
    counts[p.pos]++;
  }
  console.log("Distribuição por posição:", counts);

  console.log("\nLista de jogadores do Botafogo no save:");
  for (const p of botafogoPlayers) {
    console.log(`- ${p.name} (${p.pos}, ${p.age} anos, força: ${p.strength})`);
  }

  // Check another club, like Flamengo
  const flamengoPlayers = gameState.players.filter(p => p.clubId === "fla_br");
  console.log(`\nFlamengo tem ${flamengoPlayers.length} jogadores no save.`);
  const flaCounts = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
  for (const p of flamengoPlayers) {
    flaCounts[p.pos]++;
  }
  console.log("Distribuição por posição (Flamengo):", flaCounts);
}

test();
