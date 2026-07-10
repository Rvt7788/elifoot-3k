import { useState } from "react";
import { useStore } from "../store";
import { sortTable } from "../game/schedule";
import {
  CONT_STAGES, CONT_STAGE_NAMES, contStageWeeks, CUP_STAGE_NAMES, CUP_STAGES,
  cupChampion, cupStageWeeks, groupStandings, type CupState, type CupTie,
} from "../game/cup";
import type { Club, TableRow } from "../types";
import ClubModal from "./ClubModal";
import { readableOn } from "../game/color";

function CupBracket({
  cup, clubs, userClubId, stageNames, stageWeeks, totalStages, championLabel,
}: {
  cup: CupState; clubs: Club[]; userClubId: string;
  stageNames: string[]; stageWeeks: (s: number) => [number, number];
  totalStages: number; championLabel: string;
}) {
  const name = (id: string) => clubs.find((c) => c.id === id)?.name ?? "?";
  const champion = cupChampion(cup, totalStages);
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
          🏆 {championLabel}: {name(champion)}
        </p>
      )}
      {cup.rounds.map((ties, s) => {
        const [ida, volta] = stageWeeks(s);
        return (
          <div key={s} className="mb-4">
            <h4 className="mb-1 text-sm font-bold text-amber-400">
              {stageNames[s]}{" "}
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
  onSelect,
}: {
  division: string;
  clubs: Club[];
  tableData: TableRow[];
  userClubId: string;
  onSelect: (club: Club) => void;
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
                onClick={() => c && onSelect(c)}
                style={{ background: c.primaryColor, color: readableOn(c.primaryColor) }}
                className={`cursor-pointer border-b border-black/40 hover:brightness-110 ${zone} ${
                  r.clubId === userClubId ? "font-bold" : ""
                }`}
              >
                <td className="py-1 pl-2 pr-2 opacity-70">{i + 1}</td>
                <td className="hover:underline">{c?.name}</td>
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
  const [view, setView] = useState<"liga" | "copa" | "continental">("liga");
  const [selected, setSelected] = useState<Club | null>(null);
  if (!game) return null;
  const userClub = game.clubs.find((c) => c.id === game.userClubId)!;
  const contName = ["BR", "AR"].includes(userClub.country) ? "Libertadores" : "Champions";

  // Render all active divisions in the save
  const divisions = Object.keys(game.tables).sort((a, b) => a.localeCompare(b));

  const tabCls = (v: typeof view) =>
    `rounded px-3 py-1 text-sm ${view === v ? "bg-emerald-600 font-semibold text-white" : "text-zinc-400 hover:text-zinc-200"}`;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex justify-center gap-1">
        <button onClick={() => setView("liga")} className={tabCls("liga")}>
          Liga
        </button>
        <button onClick={() => setView("copa")} className={tabCls("copa")}>
          🏆 Copa Nacional
        </button>
        <button onClick={() => setView("continental")} className={tabCls("continental")}>
          🌎 Copa Continental
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
              onSelect={setSelected}
            />
          ))}
          <p className="mt-2 text-xs text-zinc-500 text-center">
            🟩 Acesso / título (2 primeiros) · 🟥 Rebaixamento (2 últimos)
          </p>
        </>
      ) : view === "copa" ? (
        game.cup ? (
          <CupBracket
            cup={game.cup}
            clubs={game.clubs}
            userClubId={game.userClubId}
            stageNames={CUP_STAGE_NAMES}
            stageWeeks={cupStageWeeks}
            totalStages={CUP_STAGES}
            championLabel="Campeão da Copa"
          />
        ) : (
          <p className="text-center text-sm text-zinc-500">A copa começa após a 5ª rodada.</p>
        )
      ) : game.continental ? (
        <>
          {/* fase de grupos: 8 grupos de 4, os 2 primeiros avançam às oitavas */}
          {game.continental.groups && (
            <div className="mb-6">
              <h4 className="mb-2 text-sm font-bold text-amber-400">Fase de grupos</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {game.continental.groups.map((_, g) => (
                  <div key={g} className="rounded-lg bg-zinc-900/60 px-3 py-2">
                    <p className="mb-1 text-xs font-bold text-zinc-500">GRUPO {String.fromCharCode(65 + g)}</p>
                    {groupStandings(game.continental!, g).map((r, i) => {
                      const c = game.clubs.find((x) => x.id === r.clubId);
                      const isUser = r.clubId === game.userClubId;
                      return (
                        <div
                          key={r.clubId}
                          className={`flex items-center justify-between border-b border-zinc-800 py-0.5 text-xs last:border-0 ${
                            isUser ? "text-emerald-400 font-semibold" : i < 2 ? "text-zinc-200" : "text-zinc-500"
                          }`}
                        >
                          <span className="truncate">
                            <span className="mr-1 inline-block w-3 text-zinc-600">{i + 1}</span>
                            {c?.name ?? "?"}
                          </span>
                          <span className="ml-2 shrink-0 font-mono">
                            {r.pts} <span className="text-zinc-600">pts</span>{" "}
                            <span className="text-zinc-600">({r.p}j {r.gf - r.ga >= 0 ? "+" : ""}{r.gf - r.ga})</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
          <CupBracket
            cup={game.continental}
            clubs={game.clubs}
            userClubId={game.userClubId}
            stageNames={CONT_STAGE_NAMES}
            stageWeeks={contStageWeeks}
            totalStages={CONT_STAGES}
            championLabel={`Campeão da ${contName}`}
          />
        </>
      ) : (
        <p className="text-center text-sm text-zinc-500">
          A continental será sorteada na próxima temporada.
        </p>
      )}

      {selected && (
        <ClubModal game={game} club={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
