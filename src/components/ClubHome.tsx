import { useStore, nextPlayableWeek } from "../store";
import { weekInfo, tiesForLeg, CUP_STAGE_NAMES } from "../game/cup";
import { sortTable } from "../game/schedule";
import TacticsBoard from "./TacticsBoard";

export default function ClubHome() {
  const game = useStore((s) => s.game);
  if (!game) return null;

  const club = game.clubs.find((c) => c.id === game.userClubId)!;
  const squad = game.players.filter((p) => p.clubId === club.id);
  const table = sortTable(game.tables[club.division] ?? []);
  const pos = table.findIndex((r) => r.clubId === club.id) + 1;
  const row = table[pos - 1];

  const avg = (poss: string[]) => {
    const ps = squad.filter((p) => poss.includes(p.pos));
    return ps.length
      ? (ps.reduce((s, p) => s + p.strength, 0) / ps.length).toFixed(1)
      : "-";
  };

  // próximo compromisso do clube: rodada da liga ou jogo de copa, o que vier antes
  const week = nextPlayableWeek(game);
  const info = week !== null ? weekInfo(week) : null;
  const isCupNext = info?.type === "cup";
  const next =
    isCupNext && game.cup
      ? (() => {
          const t = tiesForLeg(game.cup, (info as any).stage, (info as any).leg).find(
            (x) => x.homeId === club.id || x.awayId === club.id,
          );
          return t ? { homeId: t.homeId, awayId: t.awayId, round: 0 } : undefined;
        })()
      : game.fixtures.find(
          (f) =>
            f.week === week &&
            !f.played &&
            (f.homeId === club.id || f.awayId === club.id),
        );
  const nextOpp = next
    ? game.clubs.find(
        (c) => c.id === (next.homeId === club.id ? next.awayId : next.homeId),
      )
    : null;

  const lastResults = game.fixtures
    .filter((f) => f.played && (f.homeId === club.id || f.awayId === club.id))
    .slice(-5);

  const topScorers = [...squad].sort((a, b) => b.goals - a.goals).slice(0, 3);
  const squadValue = squad.reduce((s, p) => s + p.value, 0);

  return (
    <div className="mx-auto max-w-4xl p-4">
      {/* Cartão do clube */}
      <div
        className="mb-4 rounded-xl p-5"
        style={{
          background: `linear-gradient(120deg, ${club.primaryColor}33, transparent 60%)`,
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="inline-block h-10 w-10 rounded-full border-2"
            style={{ background: club.primaryColor, borderColor: club.secondaryColor }}
          />
          <div>
            <h1 className="ui-title text-zinc-50">{club.name}</h1>
            <p className="text-[var(--fs-body)] text-zinc-400">
              {club.division} · {club.country} · {club.region}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-zinc-900 p-4">
          <p className="ui-label mb-1">Posição na liga</p>
          <p className="ui-stat">{pos}º</p>
          <p className="text-[var(--fs-micro)] text-zinc-500">
            {row ? `${row.pts} pts · ${row.p} jogos · SG ${row.gf - row.ga}` : "—"}
          </p>
        </div>
        <div className="rounded-lg bg-zinc-900 p-4">
          <p className="ui-label mb-1">Orçamento</p>
          <p className="ui-stat">€{(game.budget / 1e6).toFixed(1)}M</p>
          <p className="text-[var(--fs-micro)] text-zinc-500">
            Elenco avaliado em €{(squadValue / 1e6).toFixed(1)}M
          </p>
        </div>
        <div className="rounded-lg bg-zinc-900 p-4">
          <p className="ui-label mb-1">Força por setor</p>
          <p className="text-[var(--fs-value)] font-display font-semibold text-zinc-100">
            GOL <span className="text-cyan-400">{avg(["GOL"])}</span> · DEF <span className="text-cyan-400">{avg(["DEF"])}</span>
          </p>
          <p className="text-[var(--fs-value)] font-display font-semibold text-zinc-100">
            MEI <span className="text-cyan-400">{avg(["MEI"])}</span> · ATA <span className="text-cyan-400">{avg(["ATA"])}</span>
          </p>
        </div>
        <div className="rounded-lg bg-zinc-900 p-4">
          <p className="ui-label mb-1">Próximo jogo</p>
          {nextOpp && next ? (
            <>
              <p className="text-[var(--fs-value)] font-display font-semibold text-zinc-100">{nextOpp.name}</p>
              <p className="text-[var(--fs-micro)] text-zinc-500">
                {isCupNext && info?.type === "cup"
                  ? `🏆 Copa — ${CUP_STAGE_NAMES[info.stage]} (${info.leg === 1 ? "ida" : "volta"})`
                  : `Rodada ${next.round}`}{" "}
                · {next.homeId === club.id ? "em casa" : "fora"}
              </p>
            </>
          ) : (
            <p className="text-[var(--fs-body)] text-zinc-400">Temporada encerrada</p>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-zinc-900 p-4">
          <p className="ui-label mb-2">Últimos resultados</p>
          {lastResults.length === 0 && (
            <p className="text-[var(--fs-body)] text-zinc-400">Nenhum jogo disputado.</p>
          )}
          {lastResults.map((f, i) => {
            const home = game.clubs.find((c) => c.id === f.homeId)!;
            const away = game.clubs.find((c) => c.id === f.awayId)!;
            const isHome = f.homeId === club.id;
            const gf = isHome ? f.homeScore! : f.awayScore!;
            const ga = isHome ? f.awayScore! : f.homeScore!;
            const badge = gf > ga ? "bg-emerald-500" : gf < ga ? "bg-red-500" : "bg-zinc-500";
            return (
              <div key={i} className="mb-1 flex items-center gap-2 text-[var(--fs-body)] text-zinc-200">
                <span className={`inline-block h-2 w-2 rounded-full ${badge}`} />
                <span className="text-zinc-500">R{f.round}</span>
                <span>
                  {home.shortName} {f.homeScore} - {f.awayScore} {away.shortName}
                </span>
              </div>
            );
          })}
        </div>
        <div className="rounded-lg bg-zinc-900 p-4">
          <p className="ui-label mb-2">Artilheiros do clube</p>
          {topScorers.every((p) => p.goals === 0) ? (
            <p className="text-[var(--fs-body)] text-zinc-400">Nenhum gol na temporada.</p>
          ) : (
            topScorers
              .filter((p) => p.goals > 0)
              .map((p) => (
                <div key={p.id} className="mb-1 flex justify-between text-[var(--fs-body)] text-zinc-200">
                  <span>{p.name}</span>
                  <span className="font-display font-semibold text-cyan-400">{p.goals}</span>
                </div>
              ))
          )}
        </div>
      </div>

      <div className="mt-3">
        <TacticsBoard />
      </div>
    </div>
  );
}
