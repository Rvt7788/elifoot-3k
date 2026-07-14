import { useEffect, useRef, useState } from "react";
import { useStore, nextPlayableWeek, weekFixtures } from "../store";
import type { Club, Fixture, LiveMatch, MatchEvent } from "../types";
import TacticsModal from "./TacticsModal";
import GameIcon, { type GameIconName } from "./GameIcon";
import { playGoal, playGoalConceded, playRed, playWhistle } from "../game/sound";
import { distinctPair, readableOn } from "../game/color";
import { weekInfo, tiesForLeg, groupFixturesForMatchday, CUP_STAGE_NAMES, CONT_STAGE_NAMES, TOTAL_WEEKS } from "../game/cup";
import { cupName, continentalName } from "../data/leagues";
import ClubModal from "./ClubModal";
import { ScrollLock } from "./useLockBodyScroll";
import { useFabDrag } from "./useFabDrag";

// Título da rodada: liga, fase da copa ou da continental (ida/volta) em duas
// partes (título/data), usando o nome real da competição do país do usuário.
function weekLabelHeader(week: number, season: number, country: string): { title: string; subtitle: string; icon?: GameIconName; stage?: string } {
  const info = weekInfo(week);
  // data removida do cabeçalho (liga e copas); será exibida em outro lugar
  if (info.type === "cup") {
    return {
      icon: "trophy" as GameIconName,
      title: cupName(country),
      stage: `${CUP_STAGE_NAMES[info.stage]} (${info.leg === 1 ? "Ida" : "Volta"})`,
      subtitle: "",
    };
  }
  if (info.type === "contgroup") {
    return {
      icon: "globe" as GameIconName,
      title: continentalName(country),
      stage: `Grupos · Rodada ${info.matchday + 1}`,
      subtitle: "",
    };
  }
  if (info.type === "continental") {
    return {
      icon: "globe" as GameIconName,
      title: continentalName(country),
      stage: `${CONT_STAGE_NAMES[info.stage]} (${info.leg === 1 ? "Ida" : "Volta"})`,
      subtitle: "",
    };
  }

  // liga: "Liga Nacional" em cima, rodada abaixo. Numeral: "10ª Rodada".
  return {
    title: "Liga Nacional",
    stage: `${info.round}ª Rodada`,
    subtitle: "",
  };
}

const BASE_TICK_MS = 350; // 1 minuto de jogo por tick em 1×

const DIVISION_COLOR: Record<string, string> = {
  "Série A": "text-emerald-400",
  "Série B": "text-sky-400",
};

// tipo de evento → ícone do jogo (arte metálica própria)
const EVENT_ICON: Record<string, GameIconName> = { goal: "goal", yellow: "yellow", red: "red", sub: "sub", penalty: "net" };

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
          <GameIcon name={EVENT_ICON[e.type]} size={14} />
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
  m, home, away, isUser, highlight, onClick, onSelectClub, note,
}: {
  m: LiveMatch; home: Club; away: Club; isUser: boolean; highlight?: boolean;
  onClick: () => void;
  onSelectClub?: (c: Club) => void;
  note?: string;
}) {
  const [homeColor, awayColor] = distinctPair(home.primaryColor, away.primaryColor);
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
        isUser
          ? "border-emerald-600 bg-emerald-950/30 hover:bg-emerald-950/50"
          : "border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80"
      } ${highlight ? "shadow-lg shadow-emerald-900/40" : ""}`}
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
            {note && (
              <span className="ml-1 font-normal text-[10px] text-zinc-500" title="Resultado do jogo de ida">
                ({note})
              </span>
            )}
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
  minute, halftime, showPlay = true,
}: { minute: number; halftime: boolean; showPlay?: boolean }) {
  // Relógio de 0 a 90. O círculo preenche continuamente. (Os controles de
  // play/pausa e encerrar rodada ficam em botões flutuantes, fora do relógio.)
  const displayMin = Math.min(minute, 90);
  const pct = Math.min(1, displayMin / 90);
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center justify-center gap-3">
      <svg width="44" height="44" viewBox="0 0 36 36" className="shrink-0 -rotate-90">
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
      {!showPlay && (
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
      <ScrollLock />
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
              <p key={i} className="flex items-center gap-1 text-zinc-300"><GameIcon name="goal" size={13} /> {e.playerName} <span className="text-zinc-500">{e.minute}'</span></p>
            ))}
          </div>
          <div className="text-right">
            {awayGoals.length === 0 && <p className="text-zinc-600">—</p>}
            {awayGoals.map((e, i) => (
              <p key={i} className="flex items-center justify-end gap-1 text-zinc-300"><span className="text-zinc-500">{e.minute}'</span> {e.playerName} <GameIcon name="goal" size={13} /></p>
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
                  <p key={i} className="flex items-center gap-1 text-zinc-300">
                    <GameIcon name={e.type === "yellow" ? "yellow" : "red"} size={13} /> {e.playerName} <span className="text-zinc-500">{e.minute}'</span>
                  </p>
                ))}
              </div>
              <div className="text-right">
                {[...yellows.filter((e) => e.side === "away"), ...reds.filter((e) => e.side === "away")].map((e, i) => (
                  <p key={i} className="flex items-center justify-end gap-1 text-zinc-300">
                    <span className="text-zinc-500">{e.minute}'</span> {e.playerName} <GameIcon name={e.type === "yellow" ? "yellow" : "red"} size={13} />
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
                    <span>
                      <span className="tabular-nums text-zinc-500">{p?.number}</span> {p?.pos} {p?.name}
                      {l.subbedIn && <span className="ml-1 font-bold text-emerald-400" title="Entrou na substituição">▲</span>}
                    </span>
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
                    <span>
                      <span className="tabular-nums text-zinc-500">{p?.number}</span> {p?.pos} {p?.name}
                      {l.subbedIn && <span className="ml-1 font-bold text-emerald-400" title="Entrou na substituição">▲</span>}
                    </span>
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

// =========================================================================
// Modal de pênalti: cobrança 100% automática, sem interação. Sequência de
// suspense — "Pênalti marcado, cobrança autorizada" + bola quicando — e só
// depois o veredito (GOL ou DEFENDEU). Fecha sozinho e o jogo retoma.
// =========================================================================
const PENALTY_SUSPENSE_MS = 2600; // corrida + respiro antes da batida
const PENALTY_RESULT_MS = 2200; // tempo do veredito na tela antes de retomar

function PenaltyModal({
  event, forUser, teamName, teamColor, soundOn, onDone,
}: {
  event: MatchEvent;
  forUser: boolean;
  teamName: string;
  teamColor: string;
  soundOn: boolean;
  onDone: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => {
      setRevealed(true);
      // o som do gol toca junto com o veredito, não quando o evento foi gerado
      if (event.scored && soundOn) (forUser ? playGoal : playGoalConceded)();
    }, PENALTY_SUSPENSE_MS);
    const t2 = setTimeout(onDone, PENALTY_SUSPENSE_MS + PENALTY_RESULT_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  const scored = event.scored;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <ScrollLock />
      <div className="w-full max-w-xs rounded-xl border border-zinc-700 bg-zinc-900 p-6 text-center">
        {/* bloco do time isolado: nome do clube no padrão da tabela (fundo na cor
            do time, texto legível) + o minuto do lance */}
        <div className="mb-8 flex flex-col items-center gap-1">
          <span
            className="rounded px-3 py-1 text-base font-bold"
            style={{ background: teamColor, color: readableOn(teamColor) }}
          >
            {teamName}
          </span>
          <span className="text-xs font-mono text-zinc-500">{event.minute}&#39;</span>
        </div>
        {/* bloco da cobrança: "a favor/contra" na linha acima, batedor logo abaixo */}
        <p className="mb-1 text-sm font-bold uppercase tracking-wide text-amber-400">
          Pênalti {forUser ? "a favor" : "contra"}
        </p>
        <p className="mb-3 text-base font-bold text-zinc-100">{event.playerName} na bola</p>
        {!revealed ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <span className="animate-bounce"><GameIcon name="goal" size={40} /></span>
            <p className="text-xs uppercase tracking-widest text-zinc-500 animate-pulse">
              Cobrança autorizada…
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-2">
            <GameIcon name={scored ? "goal" : "glove"} size={40} />
            <p className={`mt-1 text-3xl font-black ${scored ? "text-emerald-400" : "text-red-500"}`}>
              {scored ? "GOL!" : "DEFENDEU!"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MatchDay({ onFinishRound, onOpenSettings }: { onFinishRound?: () => void; onOpenSettings?: () => void }) {
  const { game, live, lastResults, paused, settings, setPaused, finishMatchday } = useStore();
  // botão flutuante padrão: mesma posição arrastável da home (compartilhada via store),
  // para ser o MESMO botão passeando entre as telas. Segurar move; toque simples age.
  const { fabPos, fabRef, onFabDown, onFabMove, fabTapEnded } = useFabDrag();
  const [modalOpen, setModalOpen] = useState(false);
  const [detailMatch, setDetailMatch] = useState<LiveMatch | null>(null);
  const [halftimeNotice, setHalftimeNotice] = useState(false);
  // pênalti do jogo do usuário: abre o modal de cobrança automática e pausa o jogo
  const [pendingPenalty, setPendingPenalty] = useState<{ event: MatchEvent; forUser: boolean } | null>(null);
  // chave do último pênalti já dispensado pelo modal: o placar volta a mostrar o gol
  const [dismissedPenaltyKey, setDismissedPenaltyKey] = useState<string | null>(null);
  // navegação pelas rodadas do calendário (setas no título); null = semana atual
  const [browseWeek, setBrowseWeek] = useState<number | null>(null);
  // clique no nome de um time abre a ficha do clube
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();
  const prevCounts = useRef<{ userGoals: number; oppGoals: number; userReds: number; penalties: number } | null>(null);
  const halftimePaused = useRef(false);

  const allDone = live?.every((m) => m.finished) ?? false;
  const userMatchMinute = live?.find(
    (m) => m.homeId === game?.userClubId || m.awayId === game?.userClubId,
  )?.minute ?? 0;

  // Pausa automática no intervalo (minuto 45), para dar chance de mexer na equipe.
  useEffect(() => {
    if (live) setBrowseWeek(null); // rodada nova ao vivo: volta o foco para a semana atual
    if (!live) { halftimePaused.current = false; return; }
    if (userMatchMinute >= 45 && !halftimePaused.current && !game?.fired) {
      halftimePaused.current = true;
      setPaused(true);
      setHalftimeNotice(true);
      // abre a parada tática automaticamente no intervalo, para o técnico
      // ajustar a equipe antes do segundo tempo (a menos que já esteja aberta)
      setModalOpen(true);
    }
  }, [userMatchMinute, live !== null]);

  // Parada tática aberta = jogo parado, sempre: mesmo que a pausa seja retirada
  // por outro caminho (botão do placar, atalho), o jogo não anda com o modal aberto.
  useEffect(() => {
    if (modalOpen && live && !allDone && !paused) setPaused(true);
  }, [modalOpen, paused, live !== null, allDone]);

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
    const penaltyEvents = userMatch
      ? userMatch.events.filter((e) => e.type === "penalty")
      : [];
    const penalties = penaltyEvents.length;
    const prev = prevCounts.current;
    prevCounts.current = { userGoals, oppGoals, userReds, penalties };
    if (!prev) return;
    // pênalti no jogo do usuário (a favor ou contra): pausa e abre a cobrança automática
    if (penalties > prev.penalties && userMatch && !userMatch.finished && !game.fired) {
      const last = penaltyEvents[penaltyEvents.length - 1];
      playWhistle();
      setPaused(true);
      setPendingPenalty({ event: last, forUser: last.side === userSide });
    }
    // som do gol só quando NÃO veio de pênalti (o pênalti tem apito próprio + modal)
    const lastEvent = userMatch?.events[userMatch.events.length - 1];
    const goalFromPenalty = lastEvent?.type === "goal" &&
      penaltyEvents.some((p) => p.minute === lastEvent.minute && p.side === lastEvent.side && p.scored);
    if (userGoals > prev.userGoals && settings.soundGoal && !goalFromPenalty) playGoal();
    if (oppGoals > prev.oppGoals && settings.soundGoal && !goalFromPenalty) playGoalConceded();
    if (userReds > prev.userReds) {
      if (settings.soundRed) playRed();
      if (!userMatch?.finished && !game.fired) {
        setPaused(true);
        setModalOpen(true);
      }
    }
  }, [live]);

  // Retomada de jogo salvo: se ao montar já existe um jogo do usuário em
  // andamento e pausado (veio do save), abre a parada tática no instante em que
  // o técnico saiu, com o jogo parado.
  const restoreChecked = useRef(false);
  useEffect(() => {
    if (restoreChecked.current) return;
    restoreChecked.current = true;
    if (!live || !game) return;
    const um = live.find((m) => m.homeId === game.userClubId || m.awayId === game.userClubId);
    if (um && !um.finished && um.minute > 0 && paused && !game.fired) {
      setModalOpen(true);
    }
  }, []);

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

  const openTactics = () => {
    setPaused(true);
    setModalOpen(true);
    setHalftimeNotice(false);
  };

  const currentOpponentId = (() => {
    if (!game) return null;
    if (live) {
      const um = live.find((m) => m.homeId === game.userClubId || m.awayId === game.userClubId);
      if (um) return um.homeId === game.userClubId ? um.awayId : um.homeId;
    } else {
      const uf = game.fixtures.find(
        (f) => f.week === game.week && (f.homeId === game.userClubId || f.awayId === game.userClubId)
      );
      if (uf) return uf.homeId === game.userClubId ? uf.awayId : uf.homeId;
    }
    return null;
  })();

  const handleSelectClub = (club: Club) => {
    if (!game) return;
    const isOpponent = club.id === currentOpponentId;
    if (isOpponent) {
      if (live) {
        const um = live.find((m) => m.homeId === game.userClubId || m.awayId === game.userClubId);
        if (um && !um.finished && !game.fired) {
          openTactics();
          return;
        } else if (um) {
          openDetail(um);
          return;
        }
      } else {
        if (!game.fired) {
          openTactics();
          return;
        }
      }
    }
    setSelectedClub(club);
  };

  // ── navegação pelas rodadas: setas ao lado do título percorrem o calendário ──
  const weekNav = (w: number) => {
    const { title, subtitle, stage } = weekLabelHeader(w, game.season, userCountry);
    const isCupW = weekInfo(w).type !== "league";
    return (
      // setas ancoradas por posição absoluta e fixas nas laterais: mudar o texto
      // (copa com mais linhas) não as desloca
      <div className="relative mb-4 px-12 text-center">
        <button
          onClick={() => setBrowseWeek(Math.max(1, w - 1))}
          disabled={w <= 1}
          className="absolute left-0 bottom-0 flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-xl leading-none text-zinc-300 shadow-sm hover:bg-zinc-700 disabled:opacity-25"
          title="Rodada anterior"
        >
          ‹
        </button>
        {/* nome da competição sozinho na linha; fase/rodada vêm abaixo */}
        <p className={`font-display text-xl font-black leading-tight tracking-wide sm:text-2xl ${isCupW ? "text-amber-400" : "text-zinc-100"}`} style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
          {title}
        </p>
        {stage && <p className="mt-0.5 text-sm font-semibold text-zinc-300">{stage}</p>}
        {subtitle && <p className="mt-0.5 text-xs uppercase tracking-widest text-zinc-500">{subtitle}</p>}
        <button
          onClick={() => setBrowseWeek(Math.min(TOTAL_WEEKS, w + 1))}
          disabled={w >= TOTAL_WEEKS}
          className="absolute right-0 bottom-0 flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-xl leading-none text-zinc-300 shadow-sm hover:bg-zinc-700 disabled:opacity-25"
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
            onClick={() => handleSelectClub(home)}
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
            onClick={() => handleSelectClub(away)}
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
                          onSelectClub={handleSelectClub}
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

        {/* Confronto do usuário em destaque no topo */}
        {userMatch && (
          <div className="mb-4">
            <MatchRow
              onSelectClub={handleSelectClub}
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
          const others = lastResults.filter(
            (m) => m.homeId !== game.userClubId && m.awayId !== game.userClubId,
          );
          const matches = div === null
            ? others
            : others.filter((m) => clubById(m.homeId).division === div);
          if (matches.length === 0) return null;
          return (
            <div key={div ?? "copa"} className="mb-4">
              {div && <p className={`mb-2 text-center text-base font-bold ${DIVISION_COLOR[div]}`}>{div}</p>}
              <div className="flex flex-col gap-1">
                {matches.map((m, i) => (
                  <MatchRow
                    onSelectClub={handleSelectClub}
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

  // Spoiler do pênalti: o motor grava o gol no MESMO tick da cobrança, e o efeito
  // que abre o modal só roda depois do commit — haveria um frame em que o placar
  // já mostra o gol antes do modal aparecer ("gol aparece e some"). Para evitar
  // isso, o gating é derivado direto da partida: enquanto houver um pênalti
  // convertido ainda não liberado (não dispensado pelo modal), o placar e os
  // eventos escondem esse gol. Assim a ocultação e o incremento do placar caem no
  // mesmo render.
  const lastScoredPenalty = (() => {
    if (!userMatch) return null;
    for (let i = userMatch.events.length - 1; i >= 0; i--) {
      const ev = userMatch.events[i];
      if (ev.type === "penalty") return ev.scored ? ev : null; // só o último pênalti importa
    }
    return null;
  })();
  const penaltyKey = (e: MatchEvent) => `${e.minute}-${e.side}-${e.playerName}`;
  const penaltyPending =
    !!lastScoredPenalty && penaltyKey(lastScoredPenalty) !== dismissedPenaltyKey;
  const displayUserMatch = (() => {
    if (!userMatch || !lastScoredPenalty || !penaltyPending) return userMatch;
    const pe = lastScoredPenalty;
    const events = [...userMatch.events];
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev.type === "goal" && ev.side === pe.side && ev.minute === pe.minute && ev.playerName === pe.playerName) {
        events.splice(i, 1);
        break;
      }
    }
    return {
      ...userMatch,
      events,
      homeScore: userMatch.homeScore - (pe.side === "home" ? 1 : 0),
      awayScore: userMatch.awayScore - (pe.side === "away" ? 1 : 0),
    };
  })();

  const liveInfo = weekInfo(game.week);
  const liveIsCup = liveInfo.type !== "league";

  // Volta de mata-mata: resultado da ida entre parênteses ao lado do placar.
  // Na volta o mando inverte: o mandante atual é o awayId do confronto sorteado.
  const firstLegNote = (m: LiveMatch): string | undefined => {
    if (liveInfo.type !== "cup" && liveInfo.type !== "continental") return undefined;
    if (liveInfo.leg !== 2) return undefined;
    const knockout = liveInfo.type === "cup" ? game.cup : game.continental;
    const tie = knockout?.rounds[liveInfo.stage]?.find(
      (t) => t.homeId === m.awayId && t.awayId === m.homeId,
    );
    if (!tie || tie.g1h == null || tie.g1a == null) return undefined;
    return `${tie.g1a}-${tie.g1h}`;
  };



  return (
    <div className="mx-auto max-w-4xl p-4 pb-28">
      {/* logo trazida para a tela ao vivo, sem borda/divisória: o cabeçalho se
          funde ao corpo do ao vivo. */}
      <div className="mb-2 flex justify-center">
        <img src="/elifoot3klogo.png" alt="Elifoot 3k" className="h-14 w-auto [filter:drop-shadow(0_0_18px_rgba(34,211,238,0.55))]" />
      </div>
      {(() => {
        const wl = weekLabelHeader(game.week, game.season, userCountry);
        return (
          <div className="mb-4 text-center">
            {wl.icon && (
              <div className="mb-1 flex justify-center">
                <GameIcon name={wl.icon} size={24} />
              </div>
            )}
            <p className={`text-lg font-bold tracking-wide ${liveIsCup ? "text-amber-400" : "text-zinc-200"}`}>
              {wl.title}
            </p>
            {wl.stage && <p className="mt-0.5 text-sm font-semibold text-zinc-300">{wl.stage}</p>}
            {live && !allDone && (
              <p className="mt-0.5">
                <span className="text-red-500 text-xs animate-pulse font-bold uppercase">● Ao vivo</span>
              </p>
            )}
            {wl.subtitle && <p className="text-sm text-zinc-500 mt-1">{wl.subtitle}</p>}
          </div>
        );
      })()}

      {/* engrenagem de configurações no canto superior direito da tela, colada
          na quina mas com um respiro. */}
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="fixed right-3 top-3 z-40 text-zinc-400 hover:text-zinc-200"
          title="Configurações"
        >
          <GameIcon name="settings" size={22} />
        </button>
      )}
      <div className="mb-6 flex items-center justify-center">
        <MatchClock
          minute={live[0]?.minute ?? 0}
          halftime={halftimeNotice}
          showPlay={!allDone}
        />
      </div>

      {/* Botão flutuante único do ao vivo — o mesmo botão padrão do app (canto
          inferior direito, o "Jogar" da home). Aqui ele é play → pausa durante o
          jogo e, ao terminar, vira o ícone "home" que encerra a rodada. Não há
          mais controle central no rodapé. Escondido enquanto a parada tática ou a
          cobrança de pênalti (ação automática) estão na tela. */}
      {!modalOpen && !pendingPenalty && (
        <div
          ref={(el) => (fabRef.current = el)}
          className="fixed bottom-6 right-5 z-40"
          style={{ transform: `translate(${fabPos.dx}px, ${fabPos.dy}px)` }}
        >
          {allDone ? (
            onFinishRound && (
              <button
                onPointerDown={onFabDown}
                onPointerMove={onFabMove}
                onPointerUp={() => { if (fabTapEnded()) onFinishRound(); }}
                onPointerCancel={() => fabTapEnded()}
                style={{ touchAction: "none" }}
                className="btn-live btn-live--finish flex h-16 w-16 touch-none items-center justify-center !rounded-full shadow-lg shadow-black/50"
                title="Encerrar rodada (segure para mover)"
              >
                <GameIcon name="home" size={30} />
              </button>
            )
          ) : (
            <button
              onPointerDown={onFabDown}
              onPointerMove={onFabMove}
              onPointerUp={() => {
                if (!fabTapEnded()) return;
                setHalftimeNotice(false);
                setPaused(!paused);
              }}
              onPointerCancel={() => fabTapEnded()}
              style={{ touchAction: "none" }}
              className={`btn-live flex h-16 w-16 touch-none items-center justify-center !rounded-full shadow-lg shadow-black/50 ${
                paused ? "btn-live--play" : "btn-live--pause"
              }`}
              title={paused ? "Retomar jogos (segure para mover)" : "Pausar jogos (segure para mover)"}
            >
              <img
                src={paused ? "/icons/play.png" : "/icons/pause.png"}
                alt=""
                draggable={false}
                className="pointer-events-none h-8 w-auto max-w-8 select-none"
              />
            </button>
          )}
        </div>
      )}

      {/* Confronto do usuário em destaque no topo */}
      {userMatch && (
        <div className="mb-4">
          {/* jogo do usuário ao vivo: QUALQUER clique (nome de time incluso) abre a
              parada tática — informações de clube ficam dentro dela */}
          <MatchRow
            m={displayUserMatch ?? userMatch}
            home={clubById(userMatch.homeId)}
            away={clubById(userMatch.awayId)}
            isUser
            highlight
            note={firstLegNote(userMatch)}
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
        const others = live.filter(
          (m) => m.homeId !== game.userClubId && m.awayId !== game.userClubId,
        );
        const matches = div === null
          ? others
          : others.filter((m) => clubById(m.homeId).division === div);
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
                    onSelectClub={handleSelectClub}
                    key={i}
                    m={m}
                    home={home}
                    away={away}
                    isUser={isUser}
                    note={firstLegNote(m)}
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

      {pendingPenalty && userMatch && (() => {
        const penSideId = pendingPenalty.event.side === "home" ? userMatch.homeId : userMatch.awayId;
        const penClub = clubById(penSideId);
        return (
          <PenaltyModal
            event={pendingPenalty.event}
            forUser={pendingPenalty.forUser}
            teamName={penClub.name}
            teamColor={penClub.primaryColor}
            soundOn={settings.soundGoal}
            onDone={() => {
              if (pendingPenalty.event.scored) setDismissedPenaltyKey(penaltyKey(pendingPenalty.event));
              setPendingPenalty(null);
              if (!userMatch.finished) setPaused(false);
            }}
          />
        );
      })()}

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
