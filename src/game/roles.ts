import type { GameState, Player, Position } from "../types";

// Funções efetivas do time do usuário — cobrador de pênalti e capitão: vale o
// designado enquanto for titular; senão o automático (ATA mais forte cobra,
// titular mais forte é o capitão). Mesmo padrão da prancheta e do motor.
export function userSquadRoles(game: GameState): { penaltyTakerId?: string; captainId?: string } {
  const starters = game.starters ?? [];
  const squad = game.players.filter((p) => p.clubId === game.userClubId);
  const titulares = squad.filter((p) => starters.includes(p.id));
  const effPos = (p: Player): Position =>
    starters.includes(p.id) ? (game.posOverrides?.[p.id] ?? p.pos) : p.pos;

  const penaltyTakerId = (() => {
    const chosen = game.penaltyTakerId;
    if (chosen && starters.includes(chosen)) {
      const p = squad.find((pl) => pl.id === chosen);
      if (p && effPos(p) !== "GOL") return chosen;
    }
    const atas = titulares.filter((p) => effPos(p) === "ATA").sort((a, b) => b.strength - a.strength);
    if (atas.length > 0) return atas[0].id;
    const linha = titulares.filter((p) => effPos(p) !== "GOL").sort((a, b) => b.strength - a.strength);
    return linha[0]?.id;
  })();

  const captainId = (() => {
    const chosen = game.captainId;
    if (chosen && starters.includes(chosen)) return chosen;
    // automático: o Líder mais forte entre os titulares; sem Líder, o mais forte
    const leaders = titulares.filter((p) => p.traits.includes("Líder"));
    const pool = leaders.length > 0 ? leaders : titulares;
    return [...pool].sort((a, b) => b.strength - a.strength)[0]?.id;
  })();

  return { penaltyTakerId, captainId };
}
