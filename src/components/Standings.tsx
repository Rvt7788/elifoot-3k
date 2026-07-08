import { useState } from "react";
import { useStore } from "../store";
import { sortTable } from "../game/schedule";
import { CUP_STAGE_NAMES, cupChampion, cupStageWeeks, type CupState, type CupTie } from "../game/cup";
import type { Club, TableRow } from "../types";

function CupBracket({ cup, clubs, userClubId }: { cup: CupState; clubs: Club[]; userClubId: string }) {
  const name = (id: string) => clubs.find((c) => c.id === id)?.name ?? "?";
  const champion = cupChampion(cup);
  const TieRow = ({ t }: { t: CupTie }) => {
    const isUser = t.homeId === userClubId || t.awayId === userClubId;
    const cls = (id: string) =>
      `${t.winnerId === id ? "font-bold text-emerald-400" : t.winnerId ? "text-zinc-500" : ""}`;
    return (
      <div className={`flex items-center justify-between border-b border-zinc-800 py-1 text-sm ${isUser ? "bg-emerald-950/40" : ""}`}>
        <span className={`flex-1 truncate text-right ${cls(t.homeId)}`}>{name(t.homeId)}</span>
        <span className="mx-2 shrink-0 font-mono text-xs text-zinc-300">
          {t.g1h != null ? `${t.g1h}-${t.g1a}` : "—"}
          <span className="mx-1 text-zinc-600">·</span>
          {t.g2h != null ? `${t.g2a}-${t.g2h}` : "—"}
          {t.pens && <span className="ml-1 text-amber-400" title="Decidido nos pênaltis">pên.</span>}
        </span>
        <span className={`flex-1 truncate ${cls(t.awayId)}`}>{name(t.awayId)}</span>
      </div>
    );
  };
  return (
    <div className="mb-6">
      {champion && (
        <p className="mb-3 rounded bg-amber-950/40 px-3 py-2 text-center text-sm font-bold text-amber-400">
          🏆 Campeão da Copa: {name(champion)}
        </p>
      )}
      {cup.rounds.map((ties, s) => {
        const [ida, volta] = cupStageWeeks(s);
        return (
          <div key={s} className="mb-4">
            <h4 className="mb-1 text-sm font-bold text-amber-400">
              {CUP_STAGE_NAMES[s]}{" "}
              <span className="text-xs font-normal text-zinc-500">
                (semanas {ida} e {volta} · ida e volta)
              </span>
            </h4>
            {ties.map((t, i) => (
              <TieRow key={i} t={t} />
            ))}
          </div>
        );
      })}
      <p className="text-xs text-zinc-500">
        Placares: ida · volta (na perspectiva do mandante da ida). Agregado empatado vai para os pênaltis.
        As próximas fases são sorteadas quando a anterior termina.
      </p>
    </div>
  );
}

function DivisionTable({
  division,
  clubs,
  tableData,
  userClubId,
}: {
  division: string;
  clubs: Club[];
  tableData: TableRow[];
  userClubId: string;
}) {
  const sortedTable = sortTable(tableData);
  return (
    <div className="mb-6">
      <h3 className={`mb-2 text-base font-bold ${division === "Série A" ? "text-emerald-400" : "text-sky-400"}`}>
        {division}
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-700 text-left text-zinc-400">
            <th className="py-1 pr-2">#</th>
            <th>Clube</th>
            <th className="text-center">P</th>
            <th className="text-center">J</th>
            <th className="text-center">V</th>
            <th className="text-center">E</th>
            <th className="text-center">D</th>
            <th className="text-center">SG</th>
          </tr>
        </thead>
        <tbody>
          {sortedTable.map((r, i) => {
            const c = clubs.find((x) => x.id === r.clubId)!;
            const zone =
              i < 2 ? "border-l-2 border-emerald-500"
              : i >= sortedTable.length - 2 ? "border-l-2 border-red-500"
              : "";
            return (
              <tr
                key={r.clubId}
                className={`border-b border-zinc-800 ${zone} ${
                  r.clubId === userClubId ? "bg-emerald-950/50 font-bold" : ""
                }`}
              >
                <td className="py-1 pl-2 pr-2 text-zinc-500">{i + 1}</td>
                <td>{c?.name}</td>
                <td className="text-center font-bold">{r.pts}</td>
                <td className="text-center">{r.p}</td>
                <td className="text-center">{r.w}</td>
                <td className="text-center">{r.d}</td>
                <td className="text-center">{r.l}</td>
                <td className="text-center">{r.gf - r.ga}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Standings() {
  const game = useStore((s) => s.game);
  const [view, setView] = useState<"liga" | "copa">("liga");
  if (!game) return null;
  const userClub = game.clubs.find((c) => c.id === game.userClubId)!;

  // Render all active divisions in the save
  const divisions = Object.keys(game.tables).sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h2 className="mb-3 text-center text-lg font-bold uppercase tracking-wider text-zinc-200">
        {view === "liga" ? "Classificação Geral" : "Copa Nacional"} — {userClub.country}
      </h2>

      <div className="mb-4 flex justify-center gap-1">
        <button
          onClick={() => setView("liga")}
          className={`rounded px-3 py-1 text-sm ${view === "liga" ? "btn-metal-tab" : "tab-button"}`}
        >
          Liga
        </button>
        <button
          onClick={() => setView("copa")}
          className={`rounded px-3 py-1 text-sm ${view === "copa" ? "btn-metal-tab" : "tab-button"}`}
        >
          🏆 Copa
        </button>
      </div>

      {view === "liga" ? (
        <>
          {divisions.map((div) => (
            <DivisionTable
              key={div}
              division={div}
              clubs={game.clubs}
              tableData={game.tables[div] ?? []}
              userClubId={game.userClubId}
            />
          ))}
          <p className="mt-2 text-xs text-zinc-500 text-center">
            🟩 Acesso / título (2 primeiros) · 🟥 Rebaixamento (2 últimos)
          </p>
        </>
      ) : game.cup ? (
        <CupBracket cup={game.cup} clubs={game.clubs} userClubId={game.userClubId} />
      ) : (
        <p className="text-center text-sm text-zinc-500">A copa começa após a 5ª rodada.</p>
      )}
    </div>
  );
}
