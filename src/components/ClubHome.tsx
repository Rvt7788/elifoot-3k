import { useState } from "react";
import { useStore, nextPlayableWeek, clubAggression, isCupEliminated } from "../store";
import { weekInfo, tiesForLeg, CUP_STAGE_NAMES } from "../game/cup";
import { sortTable } from "../game/schedule";
import { aiPregameTactics } from "../game/engine";
import type { Club, GameState, Player } from "../types";
import TacticsBoard from "./TacticsBoard";

const sectorAvg = (squad: Player[], poss: string[]) => {
  const ps = squad.filter((p) => poss.includes(p.pos));
  return ps.length
    ? (ps.reduce((s, p) => s + p.strength, 0) / ps.length).toFixed(1)
    : "-";
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="circuit-line mb-3">
      <span className="ui-label" style={{ color: "var(--accent)" }}>
        {children}
      </span>
    </div>
  );
}

/* Análise do adversário: elenco, campanha e a estratégia que a IA deve usar */
function OpponentModal({
  game, opp, onClose,
}: { game: GameState; opp: Club; onClose: () => void }) {
  const squad = game.players.filter((p) => p.clubId === opp.id);
  const userSquad = game.players.filter((p) => p.clubId === game.userClubId);
  const table = sortTable(game.tables[opp.division] ?? []);
  const pos = table.findIndex((r) => r.clubId === opp.id) + 1;
  const row = table[pos - 1];

  const last5 = game.fixtures
    .filter((f) => f.played && (f.homeId === opp.id || f.awayId === opp.id))
    .slice(-5);

  // mesma lógica que a IA usa ao entrar em campo contra o time do usuário
  const tactics = aiPregameTactics(squad, userSquad, clubAggression(game, opp.id));
  const topScorers = [...squad].sort((a, b) => b.goals - a.goals).slice(0, 3);
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
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto border border-[var(--accent-dim)] bg-[#0a0f16] p-5 shadow-[0_0_30px_rgba(34,211,238,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span
              className="inline-block h-8 w-8 rotate-45 border-2"
              style={{ background: opp.primaryColor, borderColor: opp.secondaryColor }}
            />
            <div>
              <h2 className="ui-title text-zinc-50">{opp.name}</h2>
              <p className="text-sm text-zinc-400">
                {opp.division} · {row ? `${pos}º · ${row.pts} pts` : "sem jogos"}
                {row && ` · ${row.w}V ${row.d}E ${row.l}D`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-cyan-400">✕</button>
        </div>

        <SectionLabel>Estratégia provável</SectionLabel>
        <p className="mb-1 text-sm text-zinc-200">
          Postura <span className="font-semibold text-cyan-400">{tactics.mentality}</span>
          {" · "}marcação <span className="font-semibold text-cyan-400">{tactics.marking}</span>
          {tactics.truculencia && (
            <> · <span className="font-semibold text-red-400">truculência</span></>
          )}
        </p>
        <p className="mb-4 text-xs text-zinc-500">
          Baseado na comparação de força entre os elencos e na situação do clube na tabela.
        </p>

        <SectionLabel>Força por setor</SectionLabel>
        <div className="mb-4 flex gap-6 font-display text-lg font-semibold text-zinc-100">
          {(["GOL", "DEF", "MEI", "ATA"] as const).map((s) => (
            <span key={s}>
              <span className="ui-label mr-1">{s}</span>
              <span className="text-cyan-400">{sectorAvg(squad, [s])}</span>
            </span>
          ))}
        </div>

        {last5.length > 0 && (
          <>
            <SectionLabel>Últimos jogos</SectionLabel>
            <div className="mb-4">
              {last5.map((f, i) => {
                const home = game.clubs.find((c) => c.id === f.homeId)!;
                const away = game.clubs.find((c) => c.id === f.awayId)!;
                const isHome = f.homeId === opp.id;
                const gf = isHome ? f.homeScore! : f.awayScore!;
                const ga = isHome ? f.awayScore! : f.homeScore!;
                const badge = gf > ga ? "bg-emerald-500" : gf < ga ? "bg-red-500" : "bg-zinc-500";
                return (
                  <div key={i} className="flex items-center gap-2 border-b border-[rgba(30,42,56,0.6)] py-1.5 text-sm text-zinc-200">
                    <span className={`inline-block h-2 w-2 rounded-full ${badge}`} />
                    <span>{home.name} {f.homeScore} - {f.awayScore} {away.name}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {topScorers.some((p) => p.goals > 0) && (
          <>
            <SectionLabel>Artilheiros</SectionLabel>
            <div className="mb-4">
              {topScorers.filter((p) => p.goals > 0).map((p) => (
                <div key={p.id} className="flex justify-between border-b border-[rgba(30,42,56,0.6)] py-1.5 text-sm text-zinc-200">
                  <span>{p.name}</span>
                  <span className="font-display font-semibold text-cyan-400">{p.goals}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <SectionLabel>Elenco</SectionLabel>
        <div>
          {sorted.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border-b border-[rgba(30,42,56,0.6)] py-1 text-sm">
              <span className="w-5 text-right tabular-nums text-xs text-zinc-500">{p.number}</span>
              <span className="ui-label w-8">{p.pos}</span>
              <span className="flex-1 text-zinc-200">{p.name}</span>
              <span className="text-xs text-zinc-500">{p.age} anos</span>
              <span className="w-8 text-right font-display font-semibold text-cyan-400">
                {p.strength}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ClubHome() {
  const game = useStore((s) => s.game);
  const [analyzing, setAnalyzing] = useState(false);
  if (!game) return null;

  const club = game.clubs.find((c) => c.id === game.userClubId)!;
  const squad = game.players.filter((p) => p.clubId === club.id);
  const table = sortTable(game.tables[club.division] ?? []);
  const pos = table.findIndex((r) => r.clubId === club.id) + 1;
  const row = table[pos - 1];

  // próximo compromisso do clube: rodada da liga ou jogo de copa, o que vier antes
  const week = nextPlayableWeek(game);
  const info = week !== null ? weekInfo(week) : null;
  const isCupNext = info?.type === "cup";
  const cupTie =
    isCupNext && game.cup
      ? tiesForLeg(game.cup, (info as any).stage, (info as any).leg).find(
          (x) => x.homeId === club.id || x.awayId === club.id,
        )
      : undefined;
  const next = cupTie
    ? { homeId: cupTie.homeId, awayId: cupTie.awayId, round: 0 }
    : game.fixtures.find(
        (f) =>
          f.week === week &&
          !f.played &&
          (f.homeId === club.id || f.awayId === club.id),
      );
  // placar da ida, para mostrar em "próximo jogo" quando for a volta
  const firstLeg =
    isCupNext && info?.type === "cup" && info.leg === 2 && game.cup && cupTie
      ? game.cup.rounds[info.stage]?.[cupTie.tieIndex]
      : undefined;
  const nextOpp = next
    ? game.clubs.find(
        (c) => c.id === (next.homeId === club.id ? next.awayId : next.homeId),
      )
    : null;
  const eliminated = isCupEliminated(game);

  const lastResults = game.fixtures
    .filter((f) => f.played && (f.homeId === club.id || f.awayId === club.id))
    .slice(-5);

  const topScorers = [...squad].sort((a, b) => b.goals - a.goals).slice(0, 3);
  const squadValue = squad.reduce((s, p) => s + p.value, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-6">
      {/* Cabeçalho do clube */}
      <div className="mb-2 flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        <span
          className="inline-block h-9 w-9 shrink-0 rotate-45 border-2"
          style={{ background: club.primaryColor, borderColor: club.secondaryColor }}
        />
        <div>
          <h1 className="ui-title text-zinc-50">{club.name}</h1>
          <p className="text-sm text-zinc-400">
            {club.division} · {club.country}
            {game.managerName && <> · Téc. {game.managerName}</>}
          </p>
        </div>
      </div>

      {/* Próximo jogo: o destaque da tela */}
      <div className="mt-8">
        <SectionLabel>Próximo jogo</SectionLabel>
        {nextOpp && next ? (
          <div className="text-center">
            <p className="font-display text-2xl font-semibold text-zinc-50">
              {next.homeId === club.id ? (
                <>{club.name} <span className="text-zinc-600">vs</span>{" "}
                  <span className="text-zinc-300">{nextOpp.name}</span></>
              ) : (
                <><span className="text-zinc-300">{nextOpp.name}</span>{" "}
                  <span className="text-zinc-600">vs</span> {club.name}</>
              )}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              <span className="font-semibold uppercase tracking-wide text-zinc-300">
                {next.homeId === club.id ? "Em casa" : "Fora"}
              </span>{" "}
              ·{" "}
              {isCupNext && info?.type === "cup"
                ? `🏆 Copa — ${CUP_STAGE_NAMES[info.stage]} (${info.leg === 1 ? "ida" : "volta"})`
                : `Rodada ${next.round}`}
            </p>
            {firstLeg && (
              <p className="mt-0.5 text-xs text-zinc-600">
                Jogo de ida:{" "}
                {game.clubs.find((c) => c.id === firstLeg.homeId)?.shortName} {firstLeg.g1h} - {firstLeg.g1a}{" "}
                {game.clubs.find((c) => c.id === firstLeg.awayId)?.shortName}
              </p>
            )}
            <button
              onClick={() => setAnalyzing(true)}
              className="country-tab active mt-2"
            >
              Analisar adversário
            </button>
          </div>
        ) : eliminated && nextPlayableWeek(game) !== null ? (
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-red-400">
              Copa Nacional: Eliminado
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Sua próxima partida é pela liga — acompanhe a copa na aba Tabela.
            </p>
          </div>
        ) : (
          <p className="text-center text-sm text-zinc-400">Temporada encerrada</p>
        )}
      </div>

      {/* Situação do clube: números lado a lado, sem caixas */}
      <div className="mt-8 grid grid-cols-3 divide-x divide-[rgba(30,42,56,0.8)] border-y border-[rgba(30,42,56,0.8)] py-4 text-center">
        <div>
          <p className="ui-label mb-1">Posição</p>
          <p className="ui-stat">{pos}º</p>
          <p className="text-xs text-zinc-500">
            {row ? `${row.pts} pts · ${row.p} jogos · SG ${row.gf - row.ga}` : "—"}
          </p>
        </div>
        <div>
          <p className="ui-label mb-1">Orçamento</p>
          <p className="ui-stat">€{(game.budget / 1e6).toFixed(1)}M</p>
          <p className="text-xs text-zinc-500">
            Elenco €{(squadValue / 1e6).toFixed(1)}M
          </p>
        </div>
        <div>
          <p className="ui-label mb-1">Força por setor</p>
          <p className="font-display text-sm font-semibold leading-6 text-zinc-100">
            GOL <span className="text-cyan-400">{sectorAvg(squad, ["GOL"])}</span>{" "}
            DEF <span className="text-cyan-400">{sectorAvg(squad, ["DEF"])}</span>
            <br />
            MEI <span className="text-cyan-400">{sectorAvg(squad, ["MEI"])}</span>{" "}
            ATA <span className="text-cyan-400">{sectorAvg(squad, ["ATA"])}</span>
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
        <div>
          <SectionLabel>Últimos resultados</SectionLabel>
          {lastResults.length === 0 && (
            <p className="text-sm text-zinc-400">Nenhum jogo disputado.</p>
          )}
          {lastResults.map((f, i) => {
            const home = game.clubs.find((c) => c.id === f.homeId)!;
            const away = game.clubs.find((c) => c.id === f.awayId)!;
            const isHome = f.homeId === club.id;
            const gf = isHome ? f.homeScore! : f.awayScore!;
            const ga = isHome ? f.awayScore! : f.homeScore!;
            const badge = gf > ga ? "bg-emerald-500" : gf < ga ? "bg-red-500" : "bg-zinc-500";
            return (
              <div key={i} className="flex items-center gap-2 border-b border-[rgba(30,42,56,0.6)] py-2 text-sm text-zinc-200">
                <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${badge}`} />
                <span className="text-xs text-zinc-600">R{f.round}</span>
                <span>
                  {home.name}{" "}
                  <span className="font-display font-semibold text-zinc-50">
                    {f.homeScore} - {f.awayScore}
                  </span>{" "}
                  {away.name}
                </span>
              </div>
            );
          })}
        </div>
        <div>
          <SectionLabel>Artilheiros do clube</SectionLabel>
          {topScorers.every((p) => p.goals === 0) ? (
            <p className="text-sm text-zinc-400">Nenhum gol na temporada.</p>
          ) : (
            topScorers
              .filter((p) => p.goals > 0)
              .map((p) => (
                <div key={p.id} className="flex justify-between border-b border-[rgba(30,42,56,0.6)] py-2 text-sm text-zinc-200">
                  <span>{p.name}</span>
                  <span className="font-display font-semibold text-cyan-400">{p.goals}</span>
                </div>
              ))
          )}
        </div>
      </div>

      <div className="mt-8">
        <TacticsBoard />
      </div>

      {analyzing && nextOpp && (
        <OpponentModal game={game} opp={nextOpp} onClose={() => setAnalyzing(false)} />
      )}
    </div>
  );
}
