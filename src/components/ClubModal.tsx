import { sortTable } from "../game/schedule";
import type { Club, GameState, Player } from "../types";

const TIER_BADGE: Record<string, string> = {
  bagre: "", bom: "★", craque: "★★", extra: "💎",
};

const sectorAvg = (squad: Player[], pos: string) => {
  const ps = squad.filter((p) => p.pos === pos);
  return ps.length
    ? (ps.reduce((s, p) => s + p.strength, 0) / ps.length).toFixed(1)
    : "-";
};

/* Detalhes de um clube: elenco, orçamento, técnico e situação na tabela. */
export default function ClubModal({ game, club, onClose }: { game: GameState; club: Club; onClose: () => void }) {
  const squad = game.players.filter((p) => p.clubId === club.id);
  const table = sortTable(game.tables[club.division] ?? []);
  const posIdx = table.findIndex((r) => r.clubId === club.id);
  const row = table[posIdx];
  const isUser = club.id === game.userClubId;
  const budget = isUser ? game.budget : club.baseBudget;
  const squadValue = squad.reduce((s, p) => s + p.value, 0);
  const sorted = [...squad].sort((a, b) =>
    a.pos === b.pos
      ? b.strength - a.strength
      : ["GOL", "DEF", "MEI", "ATA"].indexOf(a.pos) - ["GOL", "DEF", "MEI", "ATA"].indexOf(b.pos),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto border border-zinc-700 bg-[#0a0f16] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span
              className="inline-block h-8 w-8 rotate-45 border-2"
              style={{ background: club.primaryColor, borderColor: club.secondaryColor }}
            />
            <div>
              <h2 className="text-lg font-bold text-zinc-50">{club.name}</h2>
              <p className="text-sm text-zinc-400">
                {club.division}
                {row ? ` · ${posIdx + 1}º · ${row.pts} pts` : ""}
                {" · Téc. "}
                {isUser ? (game.managerName ?? "Você") : "IA"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-amber-400">✕</button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 text-center">
          <div className="rounded bg-zinc-900 py-2">
            <p className="ui-label mb-1">Orçamento</p>
            <p className="font-display text-lg font-semibold text-zinc-100">€{(budget / 1e6).toFixed(1)}M</p>
          </div>
          <div className="rounded bg-zinc-900 py-2">
            <p className="ui-label mb-1">Valor do elenco</p>
            <p className="font-display text-lg font-semibold text-zinc-100">€{(squadValue / 1e6).toFixed(1)}M</p>
          </div>
        </div>

        <div className="mb-4 flex justify-around rounded bg-zinc-900 py-2 font-display text-sm font-semibold text-zinc-100">
          {(["GOL", "DEF", "MEI", "ATA"] as const).map((s) => (
            <span key={s}>
              <span className="ui-label mr-1">{s}</span>
              <span className="text-amber-400">{sectorAvg(squad, s)}</span>
            </span>
          ))}
        </div>

        <p className="ui-label mb-1">Elenco ({squad.length})</p>
        <div>
          {sorted.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border-b border-[rgba(30,42,56,0.6)] py-1 text-sm">
              <span className="w-8 text-zinc-500">{p.pos}</span>
              <span className="flex-1 truncate text-zinc-200">
                {p.name} <span className="text-amber-400">{TIER_BADGE[p.tier]}</span>
              </span>
              <span className="text-xs text-zinc-500">{p.age} anos</span>
              <span className="w-8 text-right font-display font-semibold text-amber-400">{p.strength}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
