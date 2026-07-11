import type { Formation, GameState, Marking, Mentality, Player, Position } from "../types";
import { FORMATIONS } from "../types";
import { bestXI } from "./engine";

// Monta tudo (formação, escalação, mentalidade e marcação) a partir das
// informações públicas do adversário: força do top-11, médias por setor e mando.
// Compartilhado entre a prancheta ("Por adversário") e o atalho do Próximo jogo.

const sectorAvg = (squad: Player[], pos: Position): number => {
  const ps = squad.filter((p) => p.pos === pos);
  return ps.length ? ps.reduce((s, p) => s + p.strength, 0) / ps.length : 0;
};

function isSuspended(p: Player, competition: "league" | "cup" | "continental"): boolean {
  if (competition === "league") return p.suspendedLeague;
  if (competition === "cup") return p.suspendedCup;
  return p.suspendedContinental ?? false;
}

export interface AutoTactics {
  formation: Exclude<Formation, "custom">;
  mentality: Mentality;
  marking: Marking;
  starters: string[];
}

export function autoTacticsForOpponent(
  game: GameState,
  opponentId: string,
  isHome: boolean,
  competition: "league" | "cup" | "continental",
): AutoTactics {
  const squad = game.players.filter((p) => p.clubId === game.userClubId);
  const oppSquad = game.players.filter((p) => p.clubId === opponentId);
  const top11Avg = (ps: Player[]) => {
    const top = [...ps].sort((a, b) => b.strength - a.strength).slice(0, 11);
    return top.length ? top.reduce((s, p) => s + p.strength, 0) / top.length : 0;
  };
  // diferença de força com bônus/pênalti de mando de campo
  const diff = top11Avg(squad) - top11Avg(oppSquad) + (isHome ? 1.5 : -1.5);
  const oppAtk = sectorAvg(oppSquad, "ATA");
  const oppMid = sectorAvg(oppSquad, "MEI");
  const myDef = sectorAvg(squad, "DEF");

  // formação: vantagem clara ataca, desvantagem clara fecha; no equilíbrio,
  // reforça o setor onde o adversário é mais forte
  const prefs: Exclude<Formation, "custom">[] =
    diff >= 3 ? ["4-3-3", "3-4-3", "4-4-2"]
    : diff >= 1 ? ["4-3-3", "4-4-2", "4-5-1"]
    : diff > -1 ? (oppMid > oppAtk ? ["3-5-2", "4-4-2", "4-5-1"] : ["4-4-2", "4-5-1", "5-3-2"])
    : diff > -3 ? ["4-5-1", "5-3-2", "4-4-2"]
    : ["5-3-2", "4-5-1", "4-4-2"];
  // só usa formação que o elenco disponível (sem suspensos/lesionados) preenche
  const canFill = (f: Exclude<Formation, "custom">) => {
    const shape = FORMATIONS[f];
    const count = (pos: Position) =>
      squad.filter((p) => p.pos === pos && !isSuspended(p, competition) && !((p.injuryWeeks ?? 0) > 0)).length;
    return count("GOL") >= 1 && count("DEF") >= shape.DEF && count("MEI") >= shape.MEI && count("ATA") >= shape.ATA;
  };
  const formation = prefs.find(canFill) ?? "4-4-2";

  const mentality: Mentality = diff >= 3 ? "ofensivo" : diff > -2 ? "equilibrado" : "defensivo";
  // Marcação pré-jogo nunca é "extrema": ela drena 1,9× de energia e é
  // insustentável por 90 minutos. "apertada" só quando o ataque deles ameaça de
  // verdade E o elenco tem perna; dominando o jogo, "leve" poupa o time.
  const starters = bestXI(squad, formation, false, competition, undefined);
  const xi = starters.map((id) => squad.find((p) => p.id === id)!).filter(Boolean);
  const avgEnergy = xi.length ? xi.reduce((s, p) => s + p.energy, 0) / xi.length : 100;
  const marking: Marking =
    diff >= 2 ? "leve"
    : oppAtk - myDef >= 2 && diff < 0 && avgEnergy >= 70 ? "apertada"
    : "frouxa";

  return { formation, mentality, marking, starters };
}
