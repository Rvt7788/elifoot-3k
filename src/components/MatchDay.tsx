import { useEffect, useRef, useState } from "react";
import { useStore, nextPlayableWeek, weekFixtures } from "../store";
import type { Club, Fixture, LiveMatch, MatchEvent } from "../types";
import TacticsModal from "./TacticsModal";
import { playGoal, playGoalConceded, playRed } from "../game/sound";
import { distinctPair } from "../game/color";
import { weekInfo, tiesForLeg, groupFixturesForMatchday, CUP_STAGE_NAMES, CONT_STAGE_NAMES, TOTAL_WEEKS } from "../game/cup";
import { formatMatchDateLong } from "../game/calendar";
import { cupName, continentalName } from "../data/leagues";
import ClubModal from "./ClubModal";

const ORDINAL_ROUNDS = [
  "",
  "Primeira Rodada",
  "Segunda Rodada",
  "Terceira Rodada",
  "Quarta Rodada",
  "Quinta Rodada",
  "Sexta Rodada",
  "Sétima Rodada",
  "Oitava Rodada",
  "Nona Rodada",
  "Décima Rodada",
  "Décima Primeira Rodada",
  "Décima Segunda Rodada",
  "Décima Terceira Rodada",
  "Décima Quarta Rodada",
  "Décima Quinta Rodada",
  "Décima Sexta Rodada",
  "Décima Sétima Rodada",
  "Décima Oitava Rodada",
  "Décima Nona Rodada",
  "Vigésima Rodada",
  "Vigésima Primeira Rodada",
  "Vigésima Segunda Rodada",
  "Vigésima Terceira Rodada",
  "Vigésima Quarta Rodada",
  "Vigésima Quinta Rodada",
  "Vigésima Sexta Rodada",
  "Vigésima Sétima Rodada",
  "Vigésima Oitava Rodada",
  "Vigésima Nona Rodada",
  "Trigésima Rodada",
  "Trigésima Primeira Rodada",
  "Trigésima Segunda Rodada",
  "Trigésima Terceira Rodada",
  "Trigésima Quarta Rodada",
  "Trigésima Quinta Rodada",
  "Trigésima Sexta Rodada",
  "Trigésima Sétima Rodada",
  "Trigésima Oitava Rodada",
];

// Título da rodada: liga, fase da copa ou da continental (ida/volta) em duas
// partes (título/data), usando o nome real da competição do país do usuário.
function weekLabelHeader(week: number, season: number, country: string): { title: string; subtitle: string } {
  const info = weekInfo(week);
  const dateStr = formatMatchDateLong(season, week);
  if (info.type === "cup") {
    return {
      title: `🏆 ${cupName(country)} — ${CUP_STAGE_NAMES[info.stage]} (${info.leg === 1 ? "Ida" : "Volta"})`,
      subtitle: dateStr,
    };
  }
  if (info.type === "contgroup") {
    return {
      title: `🌎 ${continentalName(country)} — Grupos · Rodada ${info.matchday + 1}`,
      subtitle: dateStr,
    };
  }
  if (info.type === "continental") {
    return {
      title: `🌎 ${continentalName(country)} — ${CONT_STAGE_NAMES[info.stage]} (${info.leg === 1 ? "Ida" : "Volta"})`,
      subtitle: dateStr,
    };
  }
  
  const roundName = ORDINAL_ROUNDS[info.round] || `${info.round}ª Rodada`;
  return {
    title: roundName,
    subtitle: dateStr,
  };
}

const BASE_TICK_MS = 350; // 1 minuto de jogo por tick em 1×

const DIVISION_COLOR: Record<string, string> = {
  "Série A": "text-emerald-400",
  "Série B": "text-sky-400",
};

const EVENT_ICON = { goal: "⚽", yellow: "🟨", red: "🟥", sub: "🔄" } as const;

// Nome completo do clube quando cabe ("São Paulo", "Real Madrid"); nomes muito
// longos caem para os primeiros 15 caracteres, e o truncate do CSS cuida do resto.
function getClubDisplayName(name: string): string {
  return name.slice(0, 15);
}

// Máximo de eventos exibidos na linha: os mais antigos saem para os novos entrarem,
// evitando que o card colapse em jogos com muitos lances.
const MAX_STRIP_EVENTS = 5;
const LINEUP_POS_ORDER: Record<string, number> = { GOL: 0, DEF: 1, MEI: 2, ATA: 3 };

// Sobrenome do jogador para o badge do gol (curto, cabe no card)
function shortPlayerName(name: string): string {
  return name.split(" ").slice(-1)[0];
}

// Linha de eventos com altura sempre reservada (mesmo vazia), centralizada abaixo
// da barra de momento. Gols mostram o nome de quem marcou.
function EventStrip({ events }: { events: MatchEvent[] }) {
  const shown = events.slice(-MAX_STRIP_EVENTS);
  return (
    <div className="mt-1 flex h-4 items-center justify-center gap-2 overflow-hidden text-xs">
      {events.length > shown.length && <span className="text-[10px] text-zinc-600">…</span>}
      {shown.map((e, i) => (
        <span key={i} title={e.playerName} className="flex items-center gap-0.5 whitespace-nowrap">
          <span className="text-[10px] text-zinc-500">{e.minute}&#39;</span>
          <span>{EVENT_ICON[e.type]}</span>
          {e.type === "goal" && (
            <span className="max-w-[72px] truncate text-[10px] text-zinc-300">
              {shortPlayerName(e.playerName)}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function MomentumBar({ m, homeColor, awayColor }: { m: LiveMatch; homeColor: string; awayColor: string }) {
  // -100..+100 → percentual da casa (esquerda)
  const homePct = 50 + m.momentum / 2;
  const danger = Math.abs(m.momentum) >= 70;
  return (
    <div className={`h-3 w-full overflow-hidden rounded-full border ${danger ? "border-amber-400" : "border-zinc-700"} flex`}>
      <div style={{ width: `${homePct}%`, background: homeColor, transition: "width .3s" }} />
      <div style={{ width: `${100 - homePct}%`, background: awayColor, transition: "width .3s" }} />
    </div>
  );
}

function MatchRow({
  m, home, away, isUser, highlight, onClick, onSelectClub,
}: {
  m: LiveMatch; home: Club; away: Club; isUser: boolean; highlight?: boolean;
  onClick: () => void;
  onSelectClub?: (c: Club) => void;
}) {
  const [homeColor, awayColor] = distinctPair(home.primaryColor, away.primaryColor);
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
        isUser
          ? "border-emerald-600 bg-emerald-950/30 hover:bg-emerald-950/50"
          : "border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80"
      } ${m.aiFlash ? "ai-flash" : ""} ${highlight ? "shadow-lg shadow-emerald-900/40" : ""}`}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        {/* público no estádio — oculto no mobile para dar espaço ao momentum */}
        <span
          className="hidden sm:inline-block w-16 shrink-0 text-left font-mono text-sm tabular-nums text-zinc-500"
          title="Público no estádio"
        >
          {m.attendance ? m.attendance.toLocaleString("pt-BR") : ""}
        </span>
        {/* Times + placar: no mobile usa flex-1 + min-w-0; no desktop w-64 fixo */}
        <div className="flex min-w-0 flex-1 sm:w-64 sm:flex-initial sm:shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="flex flex-1 items-center justify-end gap-1 sm:gap-1.5 overflow-hidden min-w-0">
            <span
              onClick={(e) => { if (onSelectClub) { e.stopPropagation(); onSelectClub(home); } }}
              className="truncate text-xs sm:text-sm font-semibold match-team-name cursor-pointer hover:underline"
            >
              {getClubDisplayName(home.name)}
            </span>
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/30"
              style={{ background: homeColor }}
            />
          </div>
          <span className="shrink-0 rounded bg-zinc-800 px-1.5 sm:px-2 py-0.5 font-mono text-xs sm:text-sm font-bold">
            {m.homeScore}-{m.awayScore}
          </span>
          <div className="flex flex-1 items-center gap-1 sm:gap-1.5 overflow-hidden min-w-0">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/30"
              style={{ background: awayColor }}
            />
            <span
              onClick={(e) => { if (onSelectClub) { e.stopPropagation(); onSelectClub(away); } }}
              className="truncate text-xs sm:text-sm font-semibold match-team-name cursor-pointer hover:underline"
            >
              {getClubDisplayName(away.name)}
            </span>
          </div>
        </div>
        {/* Momentum: tamanho fixo no mobile no canto do container */}
        <div className="w-16 shrink-0 sm:w-auto sm:flex-1">
          <MomentumBar m={m} homeColor={homeColor} awayColor={awayColor} />
        </div>
      </div>
      <EventStrip events={m.events} />
    </div>
  );
}

function MatchClock({
  minute, paused, halftime, onToggle, showPlay = true,
}: { minute: number; paused: boolean; halftime: boolean; onToggle: () => void; showPlay?: boolean }) {
  // Relógio de 0 a 90. O círculo preenche continuamente.
  const displayMin = Math.min(minute, 90);
  const pct = Math.min(1, displayMin / 90);
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center justify-center gap-3">
      <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="#3f3f46" strokeWidth="3" />
        <circle
          cx="18" cy="18" r={r} fill="none"
          stroke={minute >= 90 ? "#10b981" : "#f59e0b"}
          strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset .3s linear" }}
        />
        <text x="18" y="19" textAnchor="middle" dominantBaseline="middle" fill="#e4e4e7" fontSize="10" fontWeight="bold" transform="rotate(90 18 18)">
          {displayMin}&#39;
        </text>
      </svg>
      {halftime && (
        <span className="text-sm font-bold uppercase tracking-wide text-amber-400">Intervalo</span>
      )}
      {showPlay ? (
        <button
          onClick={onToggle}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            paused ? "bg-emerald-600 hover:bg-emerald-500" : "bg-zinc-800 hover:bg-zinc-700"
          }`}
          title={paused ? "Retomar jogos" : "Pausar jogos"}
        >
          {paused ? "▶" : "⏸"}
        </button>
      ) : (
        <span className="text-sm font-bold uppercase tracking-wide text-emerald-400">Fim de jogo</span>
      )}
    </div>
  );
}

function FixtureRow({ f, home, away, isUser, onSelectClub }: {
  f: Fixture; home: Club; away: Club; isUser: boolean; onSelectClub?: (c: Club) => void;
}) {
  const [homeColor, awayColor] = distinctPair(home.primaryColor, away.primaryColor);
  return (
    <div className={`flex items-center gap-2 py-1 ${isUser ? "text-emerald-400" : ""}`}>
      <div className="flex flex-1 items-center justify-end gap-2 overflow-hidden">
        <span
          onClick={() => onSelectClub?.(home)}
          className="cursor-pointer truncate text-sm font-semibold hover:underline"
        >
          {getClubDisplayName(home.name)}
        </span>
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/30" style={{ background: homeColor }} />
      </div>
      <span className="shrink-0 text-xs text-zinc-500">vs</span>
      <div className="flex flex-1 items-center gap-2 overflow-hidden">
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/30" style={{ background: awayColor }} />
        <span
          onClick={() => onSelectClub?.(away)}
          className="cursor-pointer truncate text-sm font-semibold hover:underline"
        >
          {getClubDisplayName(away.name)}
        </span>
      </div>
    </div>
  );
}

// =========================================================================
// Modal de detalhes da partida (acessível em qualquer momento, inclusive
// após encerrar a rodada) — exibe estatísticas, gols, cartões e lineup.
// =========================================================================
function MatchDetailModal({
  m, home, away, players, onClose,
}: {
  m: LiveMatch;
  home: Club;
  away: Club;
  players: Record<string, { name: string; pos: string; strength: number; number: number }>;
  onClose: () => void;
}) {
  const goals = m.events.filter((e) => e.type === "goal");
  const yellows = m.events.filter((e) => e.type === "yellow");
  const reds = m.events.filter((e) => e.type === "red");
  const subs = m.events.filter((e) => e.type === "sub");

  const homeGoals = goals.filter((e) => e.side === "home");
  const awayGoals = goals.filter((e) => e.side === "away");

  const statRow = (label: string, hVal: number | string, aVal: number | string) => (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="w-12 text-right font-mono font-bold text-zinc-200">{hVal}</span>
      <span className="flex-1 text-center text-zinc-500">{label}</span>
      <span className="w-12 text-left font-mono font-bold text-zinc-200">{aVal}</span>
    </div>
  );

  // posse real acumulada minuto a minuto; jogos antigos (sem stats) caem no momentum
  const st = m.stats;
  const possTotal = st ? st.home.poss + st.away.poss : 0;
  const homeMom = st && possTotal > 0 ? (100 * st.home.poss) / possTotal : 50 + m.momentum / 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold font-display">
            {m.finished ? "Fim de jogo" : `${Math.min(m.minute, 90)}'`}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">✕</button>
        </div>

        {/* Placar */}
        <div className="mb-4 flex items-center justify-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-4 w-4 rounded-full border border-white/30"
              style={{ background: home.primaryColor }}
            />
            <span className="font-display text-lg font-bold">{home.shortName}</span>
          </div>
          <span className="rounded bg-zinc-800 px-4 py-1 font-mono text-xl font-bold">
            {m.homeScore} - {m.awayScore}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-display text-lg font-bold">{away.shortName}</span>
            <span
              className="inline-block h-4 w-4 rounded-full border border-white/30"
              style={{ background: away.primaryColor }}
            />
          </div>
        </div>

        {/* Gols */}
        <div className="mb-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            {homeGoals.length === 0 && <p className="text-zinc-600">—</p>}
            {homeGoals.map((e, i) => (
              <p key={i} className="text-zinc-300">⚽ {e.playerName} <span className="text-zinc-500">{e.minute}'</span></p>
            ))}
          </div>
          <div className="text-right">
            {awayGoals.length === 0 && <p className="text-zinc-600">—</p>}
            {awayGoals.map((e, i) => (
              <p key={i} className="text-zinc-300"><span className="text-zinc-500">{e.minute}'</span> {e.playerName} ⚽</p>
            ))}
          </div>
        </div>

        {/* Estatísticas */}
        <div className="mb-3 rounded-lg bg-zinc-800/60 px-3 py-2">
          <p className="mb-1 text-xs font-bold text-zinc-500 text-center">ESTATÍSTICAS</p>
          {statRow("Posse (%)", `${Math.round(homeMom)}`, `${Math.round(100 - homeMom)}`)}
          {st && statRow("Finalizações", st.home.shots, st.away.shots)}
          {st && statRow("Chutes no gol", st.home.onTarget, st.away.onTarget)}
          {st && statRow("Defesas", st.home.saves, st.away.saves)}
          {st && statRow("Desarmes", st.home.tackles, st.away.tackles)}
          {st && statRow("Interceptações", st.home.interceptions, st.away.interceptions)}
          {statRow("Gols", m.homeScore, m.awayScore)}
          {statRow("Amarelos", yellows.filter((e) => e.side === "home").length, yellows.filter((e) => e.side === "away").length)}
          {statRow("Vermelhos", reds.filter((e) => e.side === "home").length, reds.filter((e) => e.side === "away").length)}
          {statRow("Substituições", subs.filter((e) => e.side === "home").length, subs.filter((e) => e.side === "away").length)}
        </div>

        {/* Cartões */}
        {(yellows.length > 0 || reds.length > 0) && (
          <div className="mb-3 rounded-lg bg-zinc-800/60 px-3 py-2">
            <p className="mb-1 text-xs font-bold text-zinc-500 text-center">CARTÕES</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                {[...yellows.filter((e) => e.side === "home"), ...reds.filter((e) => e.side === "home")].map((e, i) => (
                  <p key={i} className="text-zinc-300">
                    {e.type === "yellow" ? "🟨" : "🟥"} {e.playerName} <span className="text-zinc-500">{e.minute}'</span>
                  </p>
                ))}
              </div>
              <div className="text-right">
                {[...yellows.filter((e) => e.side === "away"), ...reds.filter((e) => e.side === "away")].map((e, i) => (
                  <p key={i} className="text-zinc-300">
                    <span className="text-zinc-500">{e.minute}'</span> {e.playerName} {e.type === "yellow" ? "🟨" : "🟥"}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Escalações */}
        <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
          <p className="mb-1 text-xs font-bold text-zinc-500 text-center">ESCALAÇÕES</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="mb-0.5 text-[10px] text-zinc-500">{home.shortName}</p>
              {m.homeLineup
                .filter((l) => l.onField || l.subbedOut)
                .sort((a, b) => LINEUP_POS_ORDER[players[a.playerId]?.pos ?? "ATA"] - LINEUP_POS_ORDER[players[b.playerId]?.pos ?? "ATA"])
                .map((l) => {
                const p = players[l.playerId];
                return (
                  <div key={l.playerId} className={`flex items-center justify-between ${l.sentOff ? "text-zinc-600 line-through" : l.subbedOut ? "text-zinc-500" : "text-zinc-300"}`}>
                    <span><span className="tabular-nums text-zinc-500">{p?.number}</span> {p?.pos} {p?.name}</span>
                    <span className="text-amber-400 text-[10px]">{p?.strength}</span>
                  </div>
                );
              })}
            </div>
            <div>
              <p className="mb-0.5 text-[10px] text-zinc-500">{away.shortName}</p>
              {m.awayLineup
                .filter((l) => l.onField || l.subbedOut)
                .sort((a, b) => LINEUP_POS_ORDER[players[a.playerId]?.pos ?? "ATA"] - LINEUP_POS_ORDER[players[b.playerId]?.pos ?? "ATA"])
                .map((l) => {
                const p = players[l.playerId];
                return (
                  <div key={l.playerId} className={`flex items-center justify-between ${l.sentOff ? "text-zinc-600 line-through" : l.subbedOut ? "text-zinc-500" : "text-zinc-300"}`}>
                    <span><span className="tabular-nums text-zinc-500">{p?.number}</span> {p?.pos} {p?.name}</span>
                    <span className="text-amber-400 text-[10px]">{p?.strength}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg btn-retro-amber py-2 font-bold"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

export default function MatchDay({ onFinishRound }: { onFinishRound?: () => void }) {
  const { game, live, lastResults, paused, settings, setPaused, finishMatchday } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [detailMatch, setDetailMatch] = useState<LiveMatch | null>(null);
  const [halftimeNotice, setHalftimeNotice] = useState(false);
  // navegação pelas rodadas do calendário (setas no título); null = semana atual
  const [browseWeek, setBrowseWeek] = useState<number | null>(null);
  // clique no nome de um time abre a ficha do clube
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();
  const prevCounts = useRef<{ userGoals: number; oppGoals: number; userReds: number } | null>(null);
  const halftimePaused = useRef(false);

  const allDone = live?.every((m) => m.finished) ?? false;
  const userMatchMinute = live?.find(
    (m) => m.homeId === game?.userClubId || m.awayId === game?.userClubId,
  )?.minute ?? 0;

  // Pausa automática no intervalo (minuto 45), para dar chance de mexer na equipe.
  useEffect(() => {
    if (live) setBrowseWeek(null); // rodada nova ao vivo: volta o foco para a semana atual
    if (!live) { halftimePaused.current = false; return; }
    if (userMatchMinute >= 45 && !halftimePaused.current) {
      halftimePaused.current = true;
      setPaused(true);
      setHalftimeNotice(true);
    }
  }, [userMatchMinute, live !== null]);

  useEffect(() => {
    if (!live || allDone) return;
    timer.current = setInterval(
      () => useStore.getState().tick(),
      BASE_TICK_MS / settings.speed,
    );
    return () => clearInterval(timer.current);
  }, [live !== null, allDone, settings.speed]);

  // Alertas: só para eventos do jogo do usuário; vermelho abre o modal tático
  useEffect(() => {
    if (!live || !game) {
      prevCounts.current = null;
      return;
    }
    const userMatch = live.find(
      (m) => m.homeId === game.userClubId || m.awayId === game.userClubId,
    );
    const userSide = userMatch?.homeId === game.userClubId ? "home" : "away";
    const oppSide = userSide === "home" ? "away" : "home";
    const userGoals = userMatch
      ? userMatch.events.filter((e) => e.type === "goal" && e.side === userSide).length
      : 0;
    const oppGoals = userMatch
      ? userMatch.events.filter((e) => e.type === "goal" && e.side === oppSide).length
      : 0;
    const userReds = userMatch
      ? userMatch.events.filter((e) => e.type === "red" && e.side === userSide).length
      : 0;
    const prev = prevCounts.current;
    prevCounts.current = { userGoals, oppGoals, userReds };
    if (!prev) return;
    if (userGoals > prev.userGoals && settings.soundGoal) playGoal();
    if (oppGoals > prev.oppGoals && settings.soundGoal) playGoalConceded();
    if (userReds > prev.userReds) {
      if (settings.soundRed) playRed();
      if (!userMatch?.finished) {
        setPaused(true);
        setModalOpen(true);
      }
    }
  }, [live]);

  if (!game) return null;
  const clubById = (id: string) => game.clubs.find((c) => c.id === id)!;
  const userCountry = game.clubs.find((c) => c.id === game.userClubId)!.country;
  const playerLookup = Object.fromEntries(
    game.players.map((p) => [p.id, { name: p.name, pos: p.pos, strength: p.strength, number: p.number }]),
  );

  // Abre modal de detalhe de qualquer partida (live ou lastResults)
  const openDetail = (m: LiveMatch) => {
    setDetailMatch(m);
  };

  // ── navegação pelas rodadas: setas ao lado do título percorrem o calendário ──
  const weekNav = (w: number) => {
    const { title, subtitle } = weekLabelHeader(w, game.season, userCountry);
    const isCupW = weekInfo(w).type !== "league";
    return (
      <div className="mb-4 flex items-center justify-center gap-1 sm:gap-3">
        <button
          onClick={() => setBrowseWeek(Math.max(1, w - 1))}
          disabled={w <= 1}
          className="shrink-0 rounded px-2 py-1 text-xl leading-none text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-20"
          title="Rodada anterior"
        >
          ‹
        </button>
        <div className="min-w-0 text-center">
          <p className={`text-lg font-bold tracking-wide ${isCupW ? "text-amber-400" : "text-zinc-200"}`}>
            {title}
          </p>
          <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
        </div>
        <button
          onClick={() => setBrowseWeek(Math.min(TOTAL_WEEKS, w + 1))}
          disabled={w >= TOTAL_WEEKS}
          className="shrink-0 rounded px-2 py-1 text-xl leading-none text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-20"
          title="Próxima rodada"
        >
          ›
        </button>
      </div>
    );
  };

  // linha de confronto genérica para a navegação: placar quando já jogado, "vs" quando não
  const BrowseRow = ({ homeId, awayId, hs, as: aScore }: {
    homeId: string; awayId: string; hs?: number; as?: number;
  }) => {
    const home = clubById(homeId);
    const away = clubById(awayId);
    const isUser = homeId === game.userClubId || awayId === game.userClubId;
    const [hc, ac] = distinctPair(home.primaryColor, away.primaryColor);
    return (
      <div className={`flex items-center gap-2 py-1 ${isUser ? "text-emerald-400" : ""}`}>
        <div className="flex flex-1 items-center justify-end gap-2 overflow-hidden">
          <span
            onClick={() => setSelectedClub(home)}
            className="cursor-pointer truncate text-sm font-semibold hover:underline"
          >
            {getClubDisplayName(home.name)}
          </span>
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/30" style={{ background: hc }} />
        </div>
        {hs != null ? (
          <span className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs font-bold text-zinc-100">
            {hs}-{aScore}
          </span>
        ) : (
          <span className="shrink-0 text-xs text-zinc-500">vs</span>
        )}
        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/30" style={{ background: ac }} />
          <span
            onClick={() => setSelectedClub(away)}
            className="cursor-pointer truncate text-sm font-semibold hover:underline"
          >
            {getClubDisplayName(away.name)}
          </span>
        </div>
      </div>
    );
  };

  // conteúdo de qualquer semana do calendário (liga, copa, grupos ou mata-mata continental)
  const renderWeek = (w: number) => {
    const info = weekInfo(w);
    if (info.type === "league") {
      const fx = game.fixtures.filter((f) => f.week === w);
      if (fx.length === 0)
        return <p className="text-center text-sm text-zinc-500">Sem jogos nesta semana.</p>;
      return ["Série A", "Série B"].map((div) => {
        const matches = fx.filter((f) => clubById(f.homeId).division === div);
        if (matches.length === 0) return null;
        return (
          <div key={div} className="mb-6">
            <p className={`mb-2 text-center text-base font-bold ${DIVISION_COLOR[div]}`}>{div}</p>
            <div className="flex flex-col">
              {matches.map((f, i) => (
                <BrowseRow
                  key={i}
                  homeId={f.homeId}
                  awayId={f.awayId}
                  hs={f.played ? f.homeScore : undefined}
                  as={f.played ? f.awayScore : undefined}
                />
              ))}
            </div>
          </div>
        );
      });
    }
    if (info.type === "contgroup") {
      const fx = game.continental ? groupFixturesForMatchday(game.continental, info.matchday) : [];
      if (fx.length === 0)
        return <p className="text-center text-sm text-zinc-500">Grupos ainda não sorteados.</p>;
      return (
        <div className="mb-6 flex flex-col">
          {fx.map((f, i) => (
            <BrowseRow
              key={i}
              homeId={f.homeId}
              awayId={f.awayId}
              hs={f.played ? f.homeScore : undefined}
              as={f.played ? f.awayScore : undefined}
            />
          ))}
        </div>
      );
    }
    const knockout = info.type === "cup" ? game.cup : game.continental;
    const ties = knockout?.rounds[info.stage];
    if (!knockout || !ties || ties.length === 0)
      return <p className="text-center text-sm text-zinc-500">Confrontos ainda não sorteados.</p>;
    return (
      <div className="mb-6 flex flex-col">
        {tiesForLeg(knockout, info.stage, info.leg).map((t, i) => {
          const tie = ties[t.tieIndex];
          const hs = info.leg === 1 ? tie.g1h : tie.g2h;
          const as2 = info.leg === 1 ? tie.g1a : tie.g2a;
          return (
            <BrowseRow key={i} homeId={t.homeId} awayId={t.awayId} hs={hs ?? undefined} as={as2 ?? undefined} />
          );
        })}
      </div>
    );
  };

  if (!live) {
    const defaultWeek = lastResults ? game.week - 1 : nextPlayableWeek(game);
    // navegando fora da semana "atual": renderiza a semana escolhida do calendário
    if (browseWeek !== null && browseWeek !== defaultWeek) {
      return (
        <div className="mx-auto max-w-4xl p-4">
          {weekNav(browseWeek)}
          {renderWeek(browseWeek)}
          {selectedClub && (
            <ClubModal game={game} club={selectedClub} onClose={() => setSelectedClub(null)} />
          )}
        </div>
      );
    }
    if (!lastResults) {
      const week = nextPlayableWeek(game);
      const info = week !== null ? weekInfo(week) : null;
      const isCup = info?.type === "cup" || info?.type === "continental" || info?.type === "contgroup";
      const knockout = info?.type === "cup" ? game.cup : info?.type === "continental" ? game.continental : undefined;
      const upcoming: { homeId: string; awayId: string }[] =
        week === null ? []
        : info?.type === "contgroup" && game.continental
          ? groupFixturesForMatchday(game.continental, info.matchday)
        : isCup && knockout ? tiesForLeg(knockout, (info as any).stage, (info as any).leg)
        : weekFixtures(game, week);
      return (
        <div className="mx-auto max-w-4xl p-4">
          {upcoming.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">
              Nenhum confronto agendado — a temporada será reiniciada na próxima rodada.
            </p>
          ) : (
            <>
              {weekNav(week!)}
              {(isCup ? [null] : ["Série A", "Série B"]).map((div) => {
                const matches = div === null
                  ? upcoming
                  : upcoming.filter((f) => clubById(f.homeId).division === div);
                if (matches.length === 0) return null;
                return (
                  <div key={div ?? "copa"} className="mb-6">
                    {div && (
                      <p className={`mb-2 text-center text-base font-bold ${DIVISION_COLOR[div]}`}>
                        {div}
                      </p>
                    )}
                    <div className="flex flex-col">
                      {matches.map((f, i) => (
                        <FixtureRow
                          onSelectClub={setSelectedClub}
                          key={i}
                          f={f as Fixture}
                          home={clubById(f.homeId)}
                          away={clubById(f.awayId)}
                          isUser={f.homeId === game.userClubId || f.awayId === game.userClubId}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
          {selectedClub && (
            <ClubModal game={game} club={selectedClub} onClose={() => setSelectedClub(null)} />
          )}
        </div>
      );
    }
    // =============================================
    // Resultados da última rodada (permite clicar para ver stats)
    // =============================================
    const userMatch = lastResults.find(
      (m) => m.homeId === game.userClubId || m.awayId === game.userClubId,
    );
    // game.week já foi incrementado ao encerrar a rodada: a semana disputada é a anterior
    const lastInfo = weekInfo(game.week - 1);
    const lastIsCup = lastInfo.type !== "league";
    return (
      <div className="mx-auto max-w-4xl p-4">
        {weekNav(game.week - 1)}

        {/* na copa a lista é única e o jogo do usuário já vem primeiro e destacado:
            o bloco "SEU JOGO" separado só é necessário na liga */}
        {userMatch && !lastIsCup && (
          <div className="mb-4">
            <p className="mb-1 text-xs font-bold text-emerald-500 text-center">⭐ SEU JOGO</p>
            <MatchRow
              onSelectClub={setSelectedClub}
              m={userMatch}
              home={clubById(userMatch.homeId)}
              away={clubById(userMatch.awayId)}
              isUser
              highlight
              onClick={() => openDetail(userMatch)}
            />
          </div>
        )}

        {(lastIsCup ? [null] : ["Série A", "Série B"]).map((div) => {
          const matches = div === null
            ? lastResults
            : lastResults.filter((m) => clubById(m.homeId).division === div);
          if (matches.length === 0) return null;
          return (
            <div key={div ?? "copa"} className="mb-4">
              {div && <p className={`mb-2 text-center text-base font-bold ${DIVISION_COLOR[div]}`}>{div}</p>}
              <div className="flex flex-col gap-1">
                {matches.map((m, i) => (
                  <MatchRow
              onSelectClub={setSelectedClub}
                    key={i}
                    m={m}
                    home={clubById(m.homeId)}
                    away={clubById(m.awayId)}
                    isUser={m.homeId === game.userClubId || m.awayId === game.userClubId}
                    onClick={() => openDetail(m)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {detailMatch && (
          <MatchDetailModal
            m={detailMatch}
            home={clubById(detailMatch.homeId)}
            away={clubById(detailMatch.awayId)}
            players={playerLookup}
            onClose={() => setDetailMatch(null)}
          />
        )}
        {selectedClub && (
          <ClubModal game={game} club={selectedClub} onClose={() => setSelectedClub(null)} />
        )}
      </div>
    );
  }

  const userMatch = live.find(
    (m) => m.homeId === game.userClubId || m.awayId === game.userClubId,
  );

  const liveIsCup = weekInfo(game.week).type !== "league";

  const openTactics = () => {
    setPaused(true);
    setModalOpen(true);
    setHalftimeNotice(false);
  };

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-4 text-center">
        <p className={`text-lg font-bold tracking-wide ${liveIsCup ? "text-amber-400" : "text-zinc-200"}`}>
          {weekLabelHeader(game.week, game.season, userCountry).title}
        </p>
        {live && !allDone && (
          <p className="mt-0.5">
            <span className="text-red-500 text-xs animate-pulse font-bold uppercase">● Ao vivo</span>
          </p>
        )}
        <p className="text-sm text-zinc-500 mt-1">
          {weekLabelHeader(game.week, game.season, userCountry).subtitle}
        </p>
      </div>

      <div className="mb-4 flex flex-col items-center justify-center gap-2">
        <MatchClock
          minute={live[0]?.minute ?? 0}
          paused={paused}
          halftime={halftimeNotice}
          onToggle={() => {
            setHalftimeNotice(false);
            setPaused(!paused);
          }}
          showPlay={!allDone}
        />
        {allDone && onFinishRound && (
          <button
            onClick={onFinishRound}
            className="btn-ghost-amber !border !border-amber-600/50 rounded-lg px-5 py-2.5 text-base font-semibold"
          >
            ✔ Encerrar rodada
          </button>
        )}
      </div>

      {/* Destaque: confronto do jogador, sempre no topo (na copa a lista única já o traz primeiro) */}
      {userMatch && !liveIsCup && (
        <div className="mb-4">
          <p className="mb-1 text-xs font-bold text-emerald-500 text-center">⭐ SEU JOGO</p>
          <MatchRow
              onSelectClub={setSelectedClub}
            m={userMatch}
            home={clubById(userMatch.homeId)}
            away={clubById(userMatch.awayId)}
            isUser
            highlight
            onClick={() => {
              if (!userMatch.finished && !game.fired) {
                openTactics();
              } else {
                openDetail(userMatch);
              }
            }}
          />
        </div>
      )}

      {(liveIsCup ? [null] : ["Série A", "Série B"]).map((div) => {
        const matches = div === null
          ? live
          : live.filter((m) => clubById(m.homeId).division === div);
        if (matches.length === 0) return null;
        return (
          <div key={div ?? "copa"} className="mb-4">
            {div && <p className={`mb-2 text-center text-base font-bold ${DIVISION_COLOR[div]}`}>{div}</p>}
            <div className="flex flex-col gap-1">
              {matches.map((m, i) => {
                const home = clubById(m.homeId);
                const away = clubById(m.awayId);
                const isUser =
                  m.homeId === game.userClubId || m.awayId === game.userClubId;
                return (
                  <MatchRow
              onSelectClub={setSelectedClub}
                    key={i}
                    m={m}
                    home={home}
                    away={away}
                    isUser={isUser}
                    highlight={liveIsCup && isUser}
                    onClick={() => {
                      if (isUser && !m.finished && !game.fired) {
                        openTactics();
                      } else {
                        openDetail(m);
                      }
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {modalOpen && (
        <TacticsModal
          onClose={() => {
            setModalOpen(false);
            setHalftimeNotice(false);
          }}
        />
      )}

      {detailMatch && (
        <MatchDetailModal
          m={detailMatch}
          home={clubById(detailMatch.homeId)}
          away={clubById(detailMatch.awayId)}
          players={playerLookup}
          onClose={() => setDetailMatch(null)}
        />
      )}
      {selectedClub && (
        <ClubModal game={game} club={selectedClub} onClose={() => setSelectedClub(null)} />
      )}
    </div>
  );
}
