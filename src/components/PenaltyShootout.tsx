import { useState } from "react";
import { useStore } from "../store";
import type { Player } from "../types";

// Disputa de pênaltis interativa: uma cobrança por clique, alternando os times
// (usuário bate primeiro). Melhor de 5 com morte súbita. A chance de gol depende
// da força do batedor contra a do goleiro adversário — Goleador ajuda a bater,
// Paredão ajuda a defender — mais o fator sorte de cada cobrança.

interface Kick {
  side: 0 | 1; // 0 = usuário, 1 = adversário
  scored: boolean;
  shooter: string;
}

function kickChance(shooter: Player, keeper: Player | undefined): number {
  const atk = shooter.strength * (shooter.traits.includes("Goleador") ? 1.15 : 1);
  const gk = (keeper?.strength ?? 10) * (keeper?.traits.includes("Paredão") ? 1.25 : 1);
  return Math.max(0.35, Math.min(0.92, 0.76 + (atk - gk) / 80));
}

// Vencedor (0/1) ou null se a disputa continua.
function shootoutWinner(kicks: Kick[]): 0 | 1 | null {
  const taken = [0, 0];
  const score = [0, 0];
  for (const k of kicks) {
    taken[k.side]++;
    if (k.scored) score[k.side]++;
  }
  // melhor de 5: acaba quando a desvantagem não pode mais ser revertida
  if (taken[0] <= 5 && taken[1] <= 5) {
    if (score[0] > score[1] + (5 - taken[1])) return 0;
    if (score[1] > score[0] + (5 - taken[0])) return 1;
    if (taken[0] === 5 && taken[1] === 5 && score[0] !== score[1])
      return score[0] > score[1] ? 0 : 1;
  }
  // morte súbita: pares completos além dos 5
  if (taken[0] >= 5 && taken[1] >= 5 && taken[0] === taken[1] && score[0] !== score[1])
    return score[0] > score[1] ? 0 : 1;
  return null;
}

export default function PenaltyShootout({
  onDone,
}: {
  onDone: (winnerId: string) => void;
}) {
  const game = useStore((s) => s.game);
  const live = useStore((s) => s.live);
  const [kicks, setKicks] = useState<Kick[]>([]);
  const [last, setLast] = useState<Kick | null>(null);
  if (!game || !live) return null;

  const m = live.find((x) => x.homeId === game.userClubId || x.awayId === game.userClubId);
  if (!m) return null;
  const oppId = m.homeId === game.userClubId ? m.awayId : m.homeId;
  const clubIds: [string, string] = [game.userClubId, oppId];
  const clubName = (id: string) => game.clubs.find((c) => c.id === id)?.shortName ?? "?";

  // batedores em ordem de força (linha primeiro); goleiro = melhor GOL do elenco
  const shooters = (clubId: string) =>
    game.players
      .filter((p) => p.clubId === clubId)
      .sort((a, b) => (a.pos === "GOL" ? 1 : 0) - (b.pos === "GOL" ? 1 : 0) || b.strength - a.strength);
  const keeper = (clubId: string) =>
    game.players
      .filter((p) => p.clubId === clubId && p.pos === "GOL")
      .sort((a, b) => b.strength - a.strength)[0];

  const taken = [kicks.filter((k) => k.side === 0).length, kicks.filter((k) => k.side === 1).length];
  const score = [
    kicks.filter((k) => k.side === 0 && k.scored).length,
    kicks.filter((k) => k.side === 1 && k.scored).length,
  ];
  const winner = shootoutWinner(kicks);
  const nextSide: 0 | 1 = taken[0] <= taken[1] ? 0 : 1;

  const kick = () => {
    if (winner !== null) return;
    const clubId = clubIds[nextSide];
    const list = shooters(clubId);
    const shooter = list[taken[nextSide] % list.length];
    const gk = keeper(clubIds[nextSide === 0 ? 1 : 0]);
    const scored = Math.random() < kickChance(shooter, gk);
    const k: Kick = { side: nextSide, scored, shooter: shooter.name };
    setKicks([...kicks, k]);
    setLast(k);
  };

  // linha de bolinhas por time (mínimo 5 espaços)
  const dots = (side: 0 | 1) => {
    const mine = kicks.filter((k) => k.side === side);
    const total = Math.max(5, mine.length + (winner === null ? 1 : 0));
    return Array.from({ length: total }, (_, i) =>
      i < mine.length ? (mine[i].scored ? "⚽" : "❌") : "·",
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <h2 className="mb-1 text-center text-lg font-bold text-amber-400">🥅 Disputa de pênaltis</h2>
        <p className="mb-4 text-center text-xs text-zinc-500">
          Agregado empatado — quem vencer avança na Copa Nacional
        </p>

        <div className="mb-4 flex items-center justify-center gap-4 font-mono text-2xl font-bold">
          <span className="text-emerald-400">{clubName(clubIds[0])} {score[0]}</span>
          <span className="text-zinc-600">×</span>
          <span>{score[1]} {clubName(clubIds[1])}</span>
        </div>

        {([0, 1] as const).map((side) => (
          <div key={side} className="mb-1 flex items-center gap-2 text-sm">
            <span className={`w-12 shrink-0 font-bold ${side === 0 ? "text-emerald-400" : "text-zinc-300"}`}>
              {clubName(clubIds[side])}
            </span>
            <span className="tracking-widest">{dots(side).join(" ")}</span>
          </div>
        ))}

        <div className="mt-3 min-h-10 text-center text-sm">
          {last && (
            <p className={last.scored ? "text-emerald-400" : "text-red-400"}>
              {last.scored ? "⚽ GOL!" : "🧤 Defendeu!"} {last.shooter}
            </p>
          )}
          {winner === null ? (
            <p className="mt-1 text-xs text-zinc-500">
              Vez de <b className={nextSide === 0 ? "text-emerald-400" : "text-zinc-300"}>{clubName(clubIds[nextSide])}</b>
            </p>
          ) : (
            <p className="mt-1 font-bold text-amber-400">
              🏆 {clubName(clubIds[winner])} venceu nos pênaltis!
            </p>
          )}
        </div>

        {winner === null ? (
          <button
            onClick={kick}
            className="mt-3 w-full rounded-lg bg-emerald-600 py-2 font-bold hover:bg-emerald-500"
          >
            ⚽ Cobrar pênalti
          </button>
        ) : (
          <button
            onClick={() => onDone(clubIds[winner])}
            className="mt-3 w-full rounded-lg bg-amber-600 py-2 font-bold text-black hover:bg-amber-500"
          >
            Continuar
          </button>
        )}
      </div>
    </div>
  );
}
