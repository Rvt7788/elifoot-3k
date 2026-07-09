import { useState } from "react";
import { useStore, nextPlayableWeek, clubAggression, isCupEliminated } from "../store";
import { weekInfo, tiesForLeg, CUP_STAGE_NAMES, CONT_STAGE_NAMES } from "../game/cup";
import { sortTable } from "../game/schedule";
import { aiPregameTactics } from "../game/engine";
import type { Club, GameState, Player } from "../types";
import TacticsBoard from "./TacticsBoard";
import { leagueName } from "../data/leagues";
import { IconPlay } from "./icons";
import ClubModal from "./ClubModal";
import { readableOn } from "../game/color";
import { formatMatchDate } from "../game/calendar";

const sectorAvg = (squad: Player[], poss: string[]) => {
  const ps = squad.filter((p) => poss.includes(p.pos));
  return ps.length
    ? (ps.reduce((s, p) => s + p.strength, 0) / ps.length).toFixed(1)
    : "-";
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <span className="ui-label" style={{ color: "#fbbf24" }}>
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
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto border border-zinc-700 bg-[#0a0f16] p-5"
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
          <button onClick={onClose} className="text-zinc-500 hover:text-amber-400">✕</button>
        </div>

        <SectionLabel>Estratégia provável</SectionLabel>
        <p className="mb-1 text-sm text-zinc-200">
          Postura <span className="font-semibold text-amber-400">{tactics.mentality}</span>
          {" · "}marcação <span className="font-semibold text-amber-400">{tactics.marking}</span>
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
              <span className="text-amber-400">{sectorAvg(squad, [s])}</span>
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
                  <span className="font-display font-semibold text-amber-400">{p.goals}</span>
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
              <span className="w-8 text-right font-display font-semibold text-amber-400">
                {p.strength}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ClubHome({ onStartMatchday }: { onStartMatchday?: () => void }) {
  const game = useStore((s) => s.game);
  const [analyzing, setAnalyzing] = useState(false);
  const [viewClub, setViewClub] = useState<Club | null>(null);
  if (!game) return null;

  const club = game.clubs.find((c) => c.id === game.userClubId)!;
  const squad = game.players.filter((p) => p.clubId === club.id);
  const table = sortTable(game.tables[club.division] ?? []);
  const pos = table.findIndex((r) => r.clubId === club.id) + 1;
  const row = table[pos - 1];

  // próximo compromisso do clube: rodada da liga, copa ou continental, o que vier antes
  const week = nextPlayableWeek(game);
  const info = week !== null ? weekInfo(week) : null;
  const isCupNext = info?.type === "cup" || info?.type === "continental";
  const knockout =
    info?.type === "cup" ? game.cup : info?.type === "continental" ? game.continental : undefined;
  const cupTie =
    isCupNext && knockout
      ? tiesForLeg(knockout, (info as any).stage, (info as any).leg).find(
          (x) => x.homeId === club.id || x.awayId === club.id,
        )
      : undefined;
  const next = cupTie
    ? { homeId: cupTie.homeId, awayId: cupTie.awayId, round: 0 }
    : !isCupNext
      ? game.fixtures.find(
          (f) =>
            f.week === week &&
            !f.played &&
            (f.homeId === club.id || f.awayId === club.id),
        )
      : undefined;
  // placar da ida, para mostrar em "próximo jogo" quando for a volta
  const firstLeg =
    isCupNext && info && (info as any).leg === 2 && knockout && cupTie
      ? knockout.rounds[info.stage]?.[cupTie.tieIndex]
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

  const topScorers = [...squad].sort((a, b) => b.goals - a.goals).slice(0, 10);
  const squadValue = squad.reduce((s, p) => s + p.value, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-6">
      {/* Cabeçalho do clube: bandeira com as cores do time (nome, liga e técnico) à esquerda,
          posição e orçamento à direita */}
      <div className="mb-2 flex flex-col items-stretch gap-4 border-b border-[rgba(30,42,56,0.8)] pb-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Bandeira do clube */}
        <div
          className="relative overflow-hidden rounded-md border border-black/40 shadow-inner"
          style={{ background: club.primaryColor }}
        >
          {/* faixa vertical na cor secundária, como o mastro de uma bandeira */}
          <div
            className="absolute inset-y-0 left-0 w-2"
            style={{ background: club.secondaryColor }}
          />
          <div className="relative px-4 py-2.5 pl-6">
            <h1
              className="ui-title leading-tight drop-shadow"
              style={{ color: readableOn(club.primaryColor) }}
            >
              {club.name}
            </h1>
            <p
              className="text-sm opacity-90"
              style={{ color: readableOn(club.primaryColor) }}
            >
              {leagueName(club.country)}
              {game.managerName && <> · Téc. {game.managerName}</>}
            </p>
          </div>
        </div>
        <div className="flex justify-start gap-8 text-left sm:justify-center sm:text-center">
          <div>
            <p className="ui-label mb-1">Posição</p>
            <p className="ui-stat">{pos}º</p>
            <p className="text-xs text-zinc-500">
              {row ? `${row.pts} pts · ${row.p} jogos` : ""}
            </p>
          </div>
          <div>
            <p className="ui-label mb-1">Orçamento</p>
            <p className="ui-stat">€{(game.budget / 1e6).toFixed(1)}M</p>
            <p className="text-xs text-zinc-500">
              Elenco €{(squadValue / 1e6).toFixed(1)}M
            </p>
          </div>
        </div>
      </div>

      {/* Próximo jogo · Iniciar jogo · Últimos resultados · Artilheiros —
          colunas flex: as vazias somem por completo (sem reservar espaço) */}
      <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-stretch">
        {/* No mobile, Próximo jogo + Iniciar jogo ficam lado a lado nesta linha;
            no md+ o wrapper some (contents) e cada um vira coluna do flex normal. */}
        <div className="flex flex-row items-center justify-between gap-4 md:contents">
        {/* Coluna 1: Próximo jogo — largura do conteúdo, para o Iniciar jogo ficar colado ao lado */}
        <div className="md:shrink-0">
        <SectionLabel>Próximo jogo</SectionLabel>
        {nextOpp && next ? (
          <div className="text-left">
            <p className="font-display text-xl font-semibold text-zinc-50">
              {next.homeId === club.id ? (
                <>{club.name} <span className="text-zinc-600">vs</span>{" "}
                  <span
                    onClick={() => setViewClub(nextOpp)}
                    className="cursor-pointer text-emerald-400 hover:underline"
                  >
                    {nextOpp.name}
                  </span></>
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
              {info?.type === "cup"
                ? `🏆 Copa — ${CUP_STAGE_NAMES[info.stage]} (${info.leg === 1 ? "ida" : "volta"})`
                : info?.type === "continental"
                  ? `🌎 ${["BR", "AR"].includes(club.country) ? "Libertadores" : "Champions"} — ${CONT_STAGE_NAMES[info.stage]} (${info.leg === 1 ? "ida" : "volta"})`
                  : `Rodada ${next.round}`}
            </p>
            {week !== null && (
              <p className="mt-0.5 text-xs text-zinc-500">
                {formatMatchDate(game.season, week)}
              </p>
            )}
            {firstLeg && (
              <p className="mt-0.5 text-xs text-zinc-600">
                Jogo de ida:{" "}
                {game.clubs.find((c) => c.id === firstLeg.homeId)?.shortName} {firstLeg.g1h} - {firstLeg.g1a}{" "}
                {game.clubs.find((c) => c.id === firstLeg.awayId)?.shortName}
              </p>
            )}
            <button
              onClick={() => setAnalyzing(true)}
              className="country-tab active mt-3 !text-[10px]"
            >
              Analisar
            </button>
          </div>
        ) : isCupNext && week !== null ? (
          // semana de mata-mata sem jogo do clube (fora ou eliminado): rodada corre sem você
          <div className="text-left">
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
              {info?.type === "continental"
                ? `🌎 Semana de ${["BR", "AR"].includes(club.country) ? "Libertadores" : "Champions"}`
                : "🏆 Semana de Copa Nacional"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {eliminated && info?.type === "cup"
                ? "Você foi eliminado — a rodada corre sem o seu clube."
                : "Seu clube não disputa esta fase — acompanhe na aba Tabela."}
            </p>
          </div>
        ) : eliminated && nextPlayableWeek(game) !== null ? (
          <div className="text-left">
            <p className="text-sm font-semibold uppercase tracking-wide text-red-400">
              Copa Nacional: Eliminado
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Sua próxima partida é pela liga — acompanhe a copa na aba Tabela.
            </p>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Temporada encerrada</p>
        )}
        </div>

        {/* Coluna 2: Iniciar jogo — ao lado do próximo jogo, centralizado verticalmente */}
        <div className="flex items-center justify-start md:justify-center md:px-4">
          {onStartMatchday && week !== null && (
            <button
              onClick={onStartMatchday}
              className="flex items-center gap-2 px-6 py-4 text-xl font-bold btn-text-green"
            >
              <IconPlay className="h-6 w-6" />
              {nextOpp && next ? "Iniciar jogo" : "Simular rodada"}
            </button>
          )}
        </div>
        </div>

        {/* Coluna 3: Últimos resultados — some por completo quando não há jogos */}
        <div className={lastResults.length === 0 ? "hidden" : "md:flex-1"}>
          <SectionLabel>Últimos resultados</SectionLabel>
          {lastResults.map((f, i) => {
            const home = game.clubs.find((c) => c.id === f.homeId)!;
            const away = game.clubs.find((c) => c.id === f.awayId)!;
            const isHome = f.homeId === club.id;
            const gf = isHome ? f.homeScore! : f.awayScore!;
            const ga = isHome ? f.awayScore! : f.homeScore!;
            const badge = gf > ga ? "bg-emerald-500" : gf < ga ? "bg-red-500" : "bg-zinc-500";
            return (
              <div key={i} className="flex items-center gap-2 border-b border-[rgba(30,42,56,0.6)] py-1.5 text-sm text-zinc-200">
                <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${badge}`} />
                <span className="text-xs text-zinc-600">R{f.round}</span>
                <span className="truncate">
                  {home.shortName}{" "}
                  <span className="font-display font-semibold text-zinc-50">
                    {f.homeScore}-{f.awayScore}
                  </span>{" "}
                  {away.shortName}
                </span>
              </div>
            );
          })}
        </div>

        {/* Coluna 4: Artilheiros — some por completo quando não há gols */}
        <div className={topScorers.every((p) => p.goals === 0) ? "hidden" : "md:flex-1"}>
          <SectionLabel>Artilheiros do clube</SectionLabel>
          {topScorers.every((p) => p.goals === 0) ? null : (
            topScorers
              .filter((p) => p.goals > 0)
              .map((p) => (
                <div key={p.id} className="flex items-center gap-2 border-b border-[rgba(30,42,56,0.6)] py-1.5 text-sm text-zinc-200">
                  <span className="truncate">{p.name}</span>
                  <span className="font-display font-semibold text-amber-400">{p.goals}</span>
                </div>
              ))
          )}
        </div>

      </div>

      {/* Divisor entre a área de informações e a prancheta/formação */}
      <hr className="mt-8 border-t border-[rgba(30,42,56,0.8)]" />

      {/* Formação e titulares logo abaixo */}
      <div className="mt-8">
        <TacticsBoard />
      </div>

      {analyzing && nextOpp && (
        <OpponentModal game={game} opp={nextOpp} onClose={() => setAnalyzing(false)} />
      )}
      {viewClub && (
        <ClubModal game={game} club={viewClub} onClose={() => setViewClub(null)} />
      )}
    </div>
  );
}
