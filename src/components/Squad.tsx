import { useStore, MIN_SQUAD, MAX_SQUAD } from "../store";

const TIER_BADGE: Record<string, string> = {
  bagre: "", bom: "★", craque: "★★", extra: "💎",
};

export default function Squad() {
  const game = useStore((s) => s.game);
  const releasePlayer = useStore((s) => s.releasePlayer);
  const setPlayerNumber = useStore((s) => s.setPlayerNumber);
  if (!game) return null;
  const order = { GOL: 0, DEF: 1, MEI: 2, ATA: 3 };
  const squad = game.players
    .filter((p) => p.clubId === game.userClubId)
    .sort((a, b) => order[a.pos] - order[b.pos] || b.strength - a.strength);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h2 className="mb-1 text-lg font-bold">
        Elenco · Orçamento: €{(game.budget / 1e6).toFixed(1)}M
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        {squad.length} jogadores (mínimo {MIN_SQUAD}, máximo {MAX_SQUAD})
      </p>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-700 text-left text-zinc-400">
            <th className="py-1 pr-2 text-center">Nº</th>
            <th className="pr-3">Pos</th>
            <th>Nome</th>
            <th className="text-center">Idade</th>
            <th className="text-center">Força</th>
            <th className="text-center">Energia</th>
            <th className="hidden sm:table-cell">Características</th>
            <th className="text-right">Valor</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {squad.map((p) => (
            <tr key={p.id} className="border-b border-zinc-800">
              <td className="py-1 pr-2 text-center">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={p.number}
                  onChange={(e) => {
                    const n = e.target.valueAsNumber;
                    if (!Number.isNaN(n) && n >= 1 && n <= 99) setPlayerNumber(p.id, n);
                  }}
                  className="w-10 rounded bg-zinc-800 px-1 py-0.5 text-center text-xs"
                />
              </td>
              <td className="pr-3 text-zinc-400">{p.pos}</td>
              <td>
                {p.name} <span className="text-amber-400">{TIER_BADGE[p.tier]}</span>
                {p.suspendedLeague && (
                  <span className="ml-1 rounded bg-red-950 px-1 text-[10px] text-red-400" title="Suspenso na liga: cumpre 1 rodada fora">
                    🟥 susp. liga
                  </span>
                )}
                {p.suspendedCup && (
                  <span className="ml-1 rounded bg-red-950 px-1 text-[10px] text-red-400" title="Suspenso na copa: cumpre 1 partida fora">
                    🟥 susp. copa
                  </span>
                )}
              </td>
              <td className="text-center">{p.age}</td>
              <td className="text-center font-bold">{p.strength}</td>
              <td className={`text-center ${p.energy < 60 ? "text-red-400" : "text-emerald-400"}`}>
                {p.energy}%
              </td>
              <td className="hidden text-xs text-zinc-400 sm:table-cell">{p.traits.join(", ")}</td>
              <td className="text-right text-xs">€{(p.value / 1e6).toFixed(2)}M</td>
              <td className="pl-2 text-right">
                <button
                  disabled={squad.length <= MIN_SQUAD}
                  onClick={() => {
                    if (confirm(`Dispensar ${p.name}? O jogador sai de graça.`))
                      releasePlayer(p.id);
                  }}
                  className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-red-400 hover:bg-red-950 disabled:opacity-30"
                  title={
                    squad.length <= MIN_SQUAD
                      ? `Elenco no mínimo de ${MIN_SQUAD}`
                      : "Dispensar jogador"
                  }
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
