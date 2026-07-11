import { useState } from "react";
import { useStore, nextPlayableWeek, clubAggression, isCupEliminated, squadWageBill, BANKRUPTCY_WEEKS } from "../store";
import { weekInfo, tiesForLeg, groupFixturesForMatchday, CUP_STAGE_NAMES, CONT_STAGE_NAMES } from "../game/cup";
import { sortTable } from "../game/schedule";
import { aiPregameTactics } from "../game/engine";
import type { Club, GameState, Player } from "../types";
import TacticsBoard from "./TacticsBoard";
import { leagueName, cupName, continentalName } from "../data/leagues";
import { IconPlay } from "./icons";
import ClubModal from "./ClubModal";
import FinanceModal from "./FinanceModal";
import { readableOn } from "../game/color";
import { formatMatchDate } from "../game/calendar";
import { ScrollLock } from "./useLockBodyScroll";

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
      <ScrollLock />
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

export default function ClubHome({ onStartMatchday, onOpenTable }: { onStartMatchday?: () => void; onOpenTable?: () => void }) {
  const game = useStore((s) => s.game);
  const skipMatchday = useStore((s) => s.skipMatchday);
  const startMatchday = useStore((s) => s.startMatchday);
  const [analyzing, setAnalyzing] = useState(false);
  const [viewClub, setViewClub] = useState<Club | null>(null);
  const [financeOpen, setFinanceOpen] = useState(false);
  // feedback do "Pular rodada": a simulação trava a UI por um instante — marca o
  // clique na hora (botão desabilitado + rótulo) e roda a simulação no frame seguinte
  const [skipping, setSkipping] = useState(false);
  const handleSkip = () => {
    if (skipping) return;
    setSkipping(true);
    setTimeout(() => {
      skipMatchday();
      setSkipping(false);
    }, 50);
  };
  if (!game) return null;

  const club = game.clubs.find((c) => c.id === game.userClubId)!;
  const squad = game.players.filter((p) => p.clubId === club.id);
  const table = sortTable(game.tables[club.division] ?? []);
  const pos = table.findIndex((r) => r.clubId === club.id) + 1;
  const row = table[pos - 1];

  // próximo compromisso do clube: rodada da liga, copa ou continental, o que vier antes
  const morale = game.morale ?? 60;
  const week = nextPlayableWeek(game);
  const info = week !== null ? weekInfo(week) : null;
  const isCupNext = info?.type === "cup" || info?.type === "continental" || info?.type === "contgroup";
  const knockout =
    info?.type === "cup" ? game.cup : info?.type === "continental" ? game.continental : undefined;
  const groupGame =
    info?.type === "contgroup" && game.continental
      ? groupFixturesForMatchday(game.continental, info.matchday).find(
          (f) => f.homeId === club.id || f.awayId === club.id,
        )
      : undefined;
  const cupTie =
    isCupNext && knockout
      ? tiesForLeg(knockout, (info as any).stage, (info as any).leg).find(
          (x) => x.homeId === club.id || x.awayId === club.id,
        )
      : undefined;
  const next = groupGame
    ? { homeId: groupGame.homeId, awayId: groupGame.awayId, round: 0 }
    : cupTie
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
    info && (info.type === "cup" || info.type === "continental") && info.leg === 2 && knockout && cupTie
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
  const wageBill = squadWageBill(game);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-6">
      {/* Falência: técnico demitido só observa — nenhum comando sobre o clube */}
      {game.fired && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/60 px-4 py-3">
          <p className="text-sm font-bold uppercase tracking-wide text-red-400">
            💸 Falência — você foi demitido
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            O caixa ficou no vermelho por {BANKRUPTCY_WEEKS} rodadas seguidas e a
            diretoria decretou falência. A IA assumiu o {club.name}: agora você só
            observa os jogos acontecerem.
          </p>
        </div>
      )}
      {/* Notícias da virada de temporada: prêmio de Melhor Técnico e contratos expirados */}
      {game.seasonNews && game.seasonNews.season === game.season && game.week <= 2 && (
        <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900/70 px-4 py-3">
          <p className="text-sm font-bold uppercase tracking-wide text-amber-400">
            🎖 Melhor Técnico da temporada passada
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {game.seasonNews.userWonAward ? (
              <>
                <span className="font-semibold text-emerald-400">Você venceu o prêmio!</span>{" "}
                A diretoria depositou um bônus extra no caixa como reconhecimento.
              </>
            ) : (
              <>
                {game.seasonNews.bestManager} ({game.seasonNews.bestManagerClub}) levou o
                prêmio. Veja o ranking completo na aba Tabela.
              </>
            )}
          </p>
          {game.seasonNews.contractLosses.length > 0 && (
            <p className="mt-2 text-xs text-red-400">
              📝 Saíram de graça com contrato expirado:{" "}
              {game.seasonNews.contractLosses.join(", ")}. Renove contratos na aba Elenco
              para não perder mais ninguém.
            </p>
          )}
        </div>
      )}
      {/* Alerta de dívida: contagem regressiva até a diretoria perder a paciência */}
      {!game.fired && (game.debtWeeks ?? 0) > 0 && (
        <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/50 px-4 py-3">
          <p className="text-sm font-bold uppercase tracking-wide text-amber-400">
            ⚠️ Caixa no vermelho
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {game.debtWeeks} de {BANKRUPTCY_WEEKS} rodadas em dívida. Se o caixa não
            voltar ao azul em {BANKRUPTCY_WEEKS - (game.debtWeeks ?? 0)} rodada
            {BANKRUPTCY_WEEKS - (game.debtWeeks ?? 0) > 1 ? "s" : ""}, o clube fale e
            você será demitido. Venda jogadores para aliviar a folha.
          </p>
        </div>
      )}
      {/* Cabeçalho do clube: bandeira com as cores do time (nome, liga e técnico) à esquerda,
          posição e orçamento à direita */}
      <div className="mb-2 flex flex-col items-stretch gap-4 border-b border-[rgba(30,42,56,0.8)] pb-4 sm:flex-row sm:items-stretch sm:justify-start sm:gap-6">
        {/* Bandeira do clube - preenche toda a linha no mobile */}
        <div className="w-full sm:flex-1">
          <div
            className="relative overflow-hidden rounded-md border border-black/40 shadow-inner h-[88px] sm:h-28"
            style={{ background: club.primaryColor }}
          >
            {/* faixa vertical na cor secundária, como o mastro de uma bandeira */}
            <div
              className="absolute inset-y-0 left-0 w-2"
              style={{ background: club.secondaryColor }}
            />
            <div className="relative px-4 py-2.5 pl-6 sm:h-full sm:flex sm:flex-col sm:justify-center sm:pl-10 sm:py-4 sm:gap-1.5">
              <h1
                className="ui-title leading-tight drop-shadow"
                // nome cresce com a tela, mas com teto no desktop
                style={{ color: readableOn(club.primaryColor), fontSize: "clamp(1.6rem, 6vw, 2.4rem)" }}
              >
                {club.name}
              </h1>
              <p
                className="text-sm opacity-90"
                style={{ color: readableOn(club.primaryColor) }}
              >
                {leagueName(club.country)}
                <img
                  src={`/flags/${club.country.toLowerCase()}.png`}
                  alt={club.country}
                  className="ml-1.5 inline-block h-3 w-auto rounded-[1px] align-baseline"
                />
              </p>
              {game.managerName && (
                <p
                  className="text-sm opacity-90"
                  style={{ color: readableOn(club.primaryColor) }}
                >
                  Técnico {game.managerName}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Estatísticas (Posição, Orçamento) + Botão Jogar ao lado */}
        <div className="flex flex-row items-stretch justify-between gap-3 text-left w-full sm:w-auto sm:justify-start sm:gap-6">
          <div className="flex-1 rounded-lg border-2 border-[#cfa717] bg-[#e5be30] px-4 shadow-lg shadow-yellow-950/15 flex flex-row items-center justify-start gap-4 h-[88px] sm:h-28 sm:mx-0 sm:flex-initial sm:w-auto sm:max-w-none sm:gap-10 sm:px-8">
            {/* três blocos com a mesma grade de linhas (rótulo / valor / duas
                sublinhas), para rótulos e números ficarem sempre alinhados */}
            <button onClick={onOpenTable} className="text-left hover:opacity-70" title="Ver a tabela">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#3c320d] mb-1">Posição</p>
              <p className="flex h-8 items-end sm:h-9 text-3xl sm:text-4xl font-black leading-none text-white mb-0.5">{pos}º</p>
              <div className="h-7 sm:h-8" />
            </button>
            <button onClick={() => setFinanceOpen(true)} className="text-left hover:opacity-70" title="Ver as finanças">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#3c320d] mb-1">Orçamento</p>
              <p className={`flex h-8 items-end sm:h-9 text-lg sm:text-xl font-black leading-none mb-0.5 ${game.budget < 0 ? "text-red-950" : "text-white"}`}>
                ${(game.budget / 1e6).toFixed(1)}M
              </p>
              <div className="h-7 sm:h-8" />
            </button>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#3c320d] mb-1">Moral</p>
              <p className="flex h-8 items-end gap-1 sm:h-9 text-lg sm:text-xl font-black leading-none text-white mb-0.5">
                {morale}%
                {morale > (game.prevMorale ?? morale) && <span className="text-sm text-[#00e676]">▲</span>}
                {morale < (game.prevMorale ?? morale) && <span className="text-sm text-[#e50914]">▼</span>}
              </p>
              <div className="h-7 sm:h-8">
                <p className="text-[10px] font-semibold leading-snug text-[#3c320d]">
                  {morale >= 75 ? "Empolgado" : morale >= 55 ? "Confiante" : morale >= 40 ? "Instável" : "Em crise"}
                </p>
              </div>
            </div>
          </div>

          {onStartMatchday && (
            week === null ? (
              <button
                onClick={() => startMatchday()}
                className="btn-play flex flex-col justify-center items-center gap-1 px-4 sm:px-5 text-xs w-24 sm:w-28 self-stretch shrink-0 bg-amber-600 border-2 border-amber-500 hover:bg-amber-500"
                title="Começar nova temporada"
              >
                <IconPlay className="h-6 w-6 sm:h-8 sm:w-8" />
                <span className="text-center font-bold">Nova Temp.</span>
              </button>
            ) : nextOpp && next && !game.fired ? (
              <button
                onClick={onStartMatchday}
                className="btn-play flex flex-col justify-center items-center gap-1 px-4 sm:px-5 text-sm sm:text-xs w-24 sm:w-28 self-stretch shrink-0"
              >
                <IconPlay className="h-6 w-6 sm:h-8 sm:w-8" />
                <span>Jogar</span>
              </button>
            ) : (
              // rodada sem o time do usuário (copa etc.): assiste ao vivo ou resolve na hora
              // mobile: os dois botões ocupam a faixa horizontal inteira
              <div className="flex flex-col gap-1.5 w-24 sm:w-28 shrink-0 self-stretch justify-center">
                <button
                  onClick={onStartMatchday}
                  disabled={skipping}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-zinc-800 border-2 border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                  title="Acompanha os jogos da rodada ao vivo"
                >
                  <IconPlay className="h-5 w-5" />
                  Assistir
                </button>
                <button
                  onClick={handleSkip}
                  disabled={skipping}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-zinc-800 border-2 border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 disabled:cursor-wait disabled:opacity-60"
                  title="Simula todos os jogos da rodada instantaneamente"
                >
                  {skipping ? "Simulando…" : "Pular »"}
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Próximo jogo · Iniciar jogo · Últimos resultados · Artilheiros —
          colunas flex: as vazias somem por completo (sem reservar espaço) */}
      <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-stretch">
        {/* No mobile, Próximo jogo + Iniciar jogo ficam lado a lado nesta linha;
            no md+ o wrapper some (contents) e cada um vira coluna do flex normal. */}
        <div className="flex flex-row items-start justify-between gap-4 md:contents">
        {/* Coluna 1: Próximo jogo — largura do conteúdo, para o Iniciar jogo ficar colado ao lado */}
        <div className="md:shrink-0">
        <SectionLabel>Próximo jogo</SectionLabel>
        {nextOpp && next ? (
          <div className="text-left">
            <p className="font-display text-xl font-semibold text-zinc-50">
              {(() => {
                const dot = (c: Club) => (
                  <span
                    className="mr-1.5 inline-block h-3 w-3 rounded-full border border-white/30 align-baseline"
                    style={{ background: c.primaryColor }}
                  />
                );
                return next.homeId === club.id ? (
                  <>{dot(club)}{club.name} <span className="text-zinc-600">vs</span><br className="sm:hidden" />{" "}
                    {dot(nextOpp)}
                    <span
                      onClick={() => setViewClub(nextOpp)}
                      className="cursor-pointer hover:underline text-zinc-50"
                    >
                      {nextOpp.name}
                    </span></>
                ) : (
                  <>{dot(nextOpp)}
                    <span
                      onClick={() => setViewClub(nextOpp)}
                      className="cursor-pointer hover:underline text-zinc-50"
                    >
                      {nextOpp.name}
                    </span>{" "}
                    <span className="text-zinc-600">vs</span><br className="sm:hidden" />{" "}{dot(club)}{club.name}</>
                );
              })()}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              <span className="font-semibold uppercase tracking-wide text-zinc-300">
                {next.homeId === club.id ? "Em casa" : "Fora"}
              </span>{" "}
              ·{" "}
              {info?.type === "cup"
                ? `🏆 ${cupName(club.country)} — ${CUP_STAGE_NAMES[info.stage]} (${info.leg === 1 ? "ida" : "volta"})`
                : info?.type === "contgroup"
                  ? `🌎 ${continentalName(club.country)} — Grupos (rodada ${info.matchday + 1})`
                : info?.type === "continental"
                  ? `🌎 ${continentalName(club.country)} — ${CONT_STAGE_NAMES[info.stage]} (${info.leg === 1 ? "ida" : "volta"})`
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
              className="country-tab active mt-1.5 !text-[10px]"
            >
              Analisar
            </button>
          </div>
        ) : isCupNext && week !== null ? (
          // semana de mata-mata sem jogo do clube (fora ou eliminado): rodada corre sem você
          <div className="text-left">
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
              {info?.type === "continental" || info?.type === "contgroup"
                ? `🌎 ${continentalName(club.country)}`
                : `🏆 ${cupName(club.country)}`}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Seu clube não disputa.
            </p>
          </div>
        ) : eliminated && nextPlayableWeek(game) !== null ? (
          <div className="text-left">
            <p className="text-sm font-semibold uppercase tracking-wide text-red-400">
              {cupName(club.country)}: Eliminado
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Sua próxima partida é pela liga — acompanhe a copa na aba Tabela.
            </p>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Temporada encerrada</p>
        )}
        </div>

        {/* Caixa da última rodada: bilheteria e prêmios arrecadados, bicho gasto.
            Clicar no título abre o detalhamento financeiro completo. */}
        {game.lastFinance && (
          <div className="md:shrink-0 pr-4 md:pr-0">
            <button
              onClick={() => setFinanceOpen(true)}
              className="hover:opacity-70"
              title="Ver o detalhamento financeiro completo"
            >
              <SectionLabel>Caixa ›</SectionLabel>
            </button>
            {/* whitespace-nowrap: valor e rótulo nunca quebram de linha no mobile */}
            <div className="flex flex-col gap-0.5 text-sm">
              <p className="whitespace-nowrap text-emerald-400">
                + ${((game.lastFinance.revenue + game.lastFinance.prize) / 1e6).toFixed(2)}M
                <span className="ml-1 text-xs text-zinc-500">
                  {game.lastFinance.prize > 0 ? "bilheteria + prêmio" : "bilheteria"}
                </span>
              </p>
              {(game.lastFinance.attendance ?? 0) > 0 && (
                <p className="whitespace-nowrap text-xs text-zinc-400">
                  🏟 {(game.lastFinance.attendance ?? 0).toLocaleString("pt-BR")}
                  <span className="ml-1 text-zinc-500">torcedores</span>
                </p>
              )}
              <p className={`whitespace-nowrap ${(game.lastFinance.tv ?? 0) > 0 ? "text-emerald-400" : "text-zinc-500"}`}>
                + ${((game.lastFinance.tv ?? 0) / 1e6).toFixed(2)}M
                <span className="ml-1 text-xs text-zinc-500">TV e patrocínio</span>
              </p>
              <p className={`whitespace-nowrap ${(game.lastFinance.wages ?? 0) > 0 ? "text-red-400" : "text-zinc-500"}`}>
                − ${((game.lastFinance.wages ?? 0) / 1e6).toFixed(2)}M
                <span className="ml-1 text-xs text-zinc-500">salários</span>
              </p>
              <p className={`whitespace-nowrap ${game.lastFinance.bicho > 0 ? "text-red-400" : "text-zinc-500"}`}>
                − ${(game.lastFinance.bicho / 1e6).toFixed(2)}M
                <span className="ml-1 text-xs text-zinc-500">bicho</span>
              </p>
            </div>
          </div>
        )}
        </div>

        {/* Seção inferior de Resultados e Artilheiros: lado a lado no mobile */}
        <div className="flex flex-row gap-6 md:contents md:flex-1">
          {/* Coluna 3: Últimos resultados — some por completo quando não há jogos */}
          <div className={`flex-1 min-w-0 ${lastResults.length === 0 ? "hidden" : ""}`}>
            <SectionLabel>Últimos resultados</SectionLabel>
            {lastResults.map((f, i) => {
              const home = game.clubs.find((c) => c.id === f.homeId)!;
              const away = game.clubs.find((c) => c.id === f.awayId)!;
              const isHome = f.homeId === club.id;
              const gf = isHome ? f.homeScore! : f.awayScore!;
              const ga = isHome ? f.awayScore! : f.homeScore!;
              const badge = gf > ga ? "bg-emerald-500" : gf < ga ? "bg-red-500" : "bg-zinc-500";
              return (
                <div key={i} className="flex w-fit max-w-full items-center gap-1.5 py-1 md:py-1.5 pr-6 text-xs md:text-sm text-zinc-200">
                  <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${badge}`} />
                  <span className="truncate">
                    {home.name}{" "}
                    <span className="font-display font-semibold text-zinc-50">
                      {f.homeScore}-{f.awayScore}
                    </span>{" "}
                    {away.name}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Coluna 4: Artilheiros — some por completo quando não há gols */}
          <div className={`flex-1 min-w-0 ${topScorers.every((p) => p.goals === 0) ? "hidden" : ""}`}>
            <SectionLabel>Artilheiros</SectionLabel>
            {topScorers.every((p) => p.goals === 0) ? null : (
              topScorers
                .filter((p) => p.goals > 0)
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 py-1 md:py-1.5 text-xs md:text-sm text-zinc-200">
                    <span className="truncate">{p.name}</span>
                    <span className="font-display font-semibold text-amber-400 shrink-0">{p.goals}</span>
                  </div>
                ))
            )}
          </div>
        </div>

      </div>

      {/* Divisor entre a área de informações e a prancheta/formação */}
      <hr className="mt-8 border-t border-[rgba(30,42,56,0.8)]" />

      {/* Formação e titulares logo abaixo */}
      {/* Caderno de notícias: destaques da rodada na divisão do usuário */}
      {(game.lastNews?.length ?? 0) > 0 && (
        <div className="mt-6">
          <SectionLabel>📰 Notícias da rodada</SectionLabel>
          <div className="flex flex-col gap-1 text-sm text-zinc-300">
            {game.lastNews!.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <TacticsBoard />
      </div>

      {analyzing && nextOpp && (
        <OpponentModal game={game} opp={nextOpp} onClose={() => setAnalyzing(false)} />
      )}
      {viewClub && (
        <ClubModal game={game} club={viewClub} onClose={() => setViewClub(null)} />
      )}
      {financeOpen && <FinanceModal onClose={() => setFinanceOpen(false)} />}
    </div>
  );
}
