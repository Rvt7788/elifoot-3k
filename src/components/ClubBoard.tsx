import { useEffect, useRef, useState } from "react";
import type { Club, Formation, LivePlayer, Mentality, Player, Position } from "../types";
import { FORMATIONS } from "../types";
import { bestXIByPosition } from "../game/engine";
import { pitchLayout, PlayerPin, EmptySlot, PitchBackground } from "./PitchField";

const POS_ORDER = { GOL: 0, DEF: 1, MEI: 2, ATA: 3 } as const;
const POS_KEYS = ["GOL", "DEF", "MEI", "ATA"] as const;

const MENTALITY_LABEL: Record<Mentality, string> = {
  defensivo: "Defensivo",
  equilibrado: "Equilibrado",
  ofensivo: "Ofensivo",
  tudo_ou_nada: "Tudo ou nada",
};

// Deduz a formação a partir do número de DEF/MEI/ATA em campo — a formação real
// que o time está usando, sem depender de um campo persistido.
function formationFromCounts(def: number, mei: number, ata: number): Formation {
  const key = `${def}-${mei}-${ata}`;
  return (Object.keys(FORMATIONS).includes(key) ? key : "4-4-2") as Formation;
}

/*
 Prancheta somente-leitura de um clube: mostra os titulares na formação em que
 o time está jogando (ou vai jogar) e a lista de reservas no banco. O nome do
 clube aparece com a cor do time e sublinhado, para destaque.

 Dois modos de origem dos titulares:
 - live: recebe o lineup ao vivo (parada tática) — mostra exatamente quem está
   em campo agora, com a energia da partida.
 - probable: sem lineup, deriva o XI provável (bestXIByPosition) — usado na
   análise pré-jogo do adversário, refletindo a última/próxima formação.
*/
export default function ClubBoard({
  club, squad, formation, lineup, energyById, mentality,
}: {
  club: Club;
  squad: Player[];
  formation?: Formation;
  lineup?: LivePlayer[];
  energyById?: Record<string, number>;
  mentality?: Mentality;
}) {
  const kit = { bg: club.primaryColor, border: club.secondaryColor };
  const byId = (id: string) => squad.find((p) => p.id === id);

  // A prancheta termina exatamente na última linha da lista de titulares:
  // medimos a posição real das duas e aplicamos a altura ao campo.
  const pitchRef = useRef<HTMLDivElement | null>(null);
  const titularesRef = useRef<HTMLDivElement | null>(null);
  const [pitchHeight, setPitchHeight] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => {
      const pitch = pitchRef.current;
      const listEl = titularesRef.current;
      if (!pitch || !listEl) return;
      const h = Math.round(listEl.getBoundingClientRect().bottom - pitch.getBoundingClientRect().top);
      if (h > 80) setPitchHeight(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (titularesRef.current) ro.observe(titularesRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  });

  // formação efetiva: a real em campo (deduzida do lineup) ou a passada/probable
  const effFormation: Formation = lineup
    ? (() => {
        const onField = lineup.filter((l) => l.onField && !l.sentOff);
        const count = (pos: Position) =>
          onField.filter((l) => (l.posOverride ?? byId(l.playerId)?.pos) === pos).length;
        return formationFromCounts(count("DEF"), count("MEI"), count("ATA"));
      })()
    : formation ?? "4-4-2";

  // titulares e sua disposição por setor
  const posPlayers: Record<Position, Player[]> = { GOL: [], DEF: [], MEI: [], ATA: [] };
  let benchPlayers: Player[];
  let energyOf: (p: Player) => number | undefined;

  if (lineup) {
    // ao vivo: respeita posOverride/slotIdx e a energia da partida
    const onField = lineup.filter((l) => l.onField && !l.sentOff);
    onField.forEach((l) => {
      const p = byId(l.playerId);
      if (!p) return;
      posPlayers[l.posOverride ?? p.pos].push(p);
    });
    POS_KEYS.forEach((k) => {
      posPlayers[k].sort((a, b) => {
        const la = lineup.find((l) => l.playerId === a.id);
        const lb = lineup.find((l) => l.playerId === b.id);
        return (la?.slotIdx ?? 99) - (lb?.slotIdx ?? 99) || b.strength - a.strength;
      });
    });
    benchPlayers = lineup
      .filter((l) => !l.onField && !l.subbedOut && !l.sentOff)
      .map((l) => byId(l.playerId))
      .filter((p): p is Player => !!p)
      .sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.strength - a.strength);
    const eById = Object.fromEntries(lineup.map((l) => [l.playerId, l.energy]));
    energyOf = (p) => eById[p.id];
  } else {
    // provável: melhor XI na formação, encaixando lado/pé
    const { starters } = bestXIByPosition(squad, effFormation);
    const starterSet = new Set(starters);
    starters.forEach((id) => {
      const p = byId(id);
      if (p) posPlayers[p.pos].push(p);
    });
    benchPlayers = squad
      .filter((p) => !starterSet.has(p.id))
      .sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.strength - a.strength);
    energyOf = (p) => energyById?.[p.id] ?? p.energy;
  }

  const titulares = POS_KEYS.flatMap((k) => posPlayers[k]);

  // encaixe dos titulares nos slots da formação
  const layout = pitchLayout(effFormation, undefined);
  const slots: { pos: Position; slotIdx: number; x: number; y: number; player?: Player }[] = [];
  POS_KEYS.forEach((posKey) => {
    layout[posKey].forEach((coord, i) => {
      slots.push({ pos: posKey, slotIdx: i, ...coord, player: posPlayers[posKey][i] });
    });
  });
  const placed = new Set(slots.filter((s) => s.player).map((s) => s.player!.id));
  const unplaced = titulares.filter((p) => !placed.has(p.id));
  for (const s of slots) {
    if (s.player || unplaced.length === 0) continue;
    s.player = unplaced.shift();
  }

  const list = (label: string, players: Player[]) => (
    <div>
      <p className="mb-1 text-xs font-bold text-zinc-500">{label}</p>
      <div>
        {players.map((p) => (
          <div key={p.id} className="mb-0.5 flex items-center justify-between rounded bg-zinc-800 px-2 py-0.5 text-[11px] leading-tight">
            <span className="flex min-w-0 items-center gap-1">
              <span className="w-4 shrink-0 text-right tabular-nums text-zinc-500">{p.number}</span>
              <b className="shrink-0 text-zinc-400">{p.pos}</b>
              <span className="overflow-hidden whitespace-nowrap [text-overflow:clip]">{p.name}</span>
              <span className={`shrink-0 ${p.foot === "canhoto" ? "text-red-500" : "text-sky-400"}`}>
                {p.foot === "canhoto" ? "◀" : "▶"}
              </span>
            </span>
            <b className="w-5 shrink-0 text-right tabular-nums text-amber-400">{p.strength}</b>
          </div>
        ))}
        {players.length === 0 && <p className="text-[11px] text-zinc-600">—</p>}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex flex-row items-start gap-3">
        {/* Coluna esquerda: nome do clube + formação e, abaixo, a prancheta —
            que se estica até a altura da última linha dos titulares. */}
        <div className="flex w-[42%] shrink-0 flex-col sm:w-44">
          <p className="text-sm leading-tight">
            <span
              className="font-bold underline decoration-2 underline-offset-2"
              style={{ color: club.primaryColor, textDecorationColor: club.primaryColor }}
            >
              {club.name}
            </span>
          </p>
          <p className="mb-2 text-xs text-zinc-500">
            {effFormation}
            {mentality && <span className="text-zinc-600"> · {MENTALITY_LABEL[mentality]}</span>}
          </p>
          <div ref={pitchRef} style={pitchHeight ? { height: pitchHeight } : undefined}>
            <PitchBackground
              fill
              className={`relative w-full overflow-hidden rounded ${pitchHeight ? "h-full" : "aspect-[3/4]"}`}
            >
              {slots.map((s, i) =>
                s.player ? (
                  <PlayerPin
                    key={s.player.id}
                    p={s.player}
                    x={s.x}
                    y={s.y}
                    colors={kit}
                    compact
                    selected={false}
                    energyOverride={energyOf(s.player)}
                    onClick={() => {}}
                  />
                ) : (
                  <EmptySlot key={i} x={s.x} y={s.y} label={s.pos} compact />
                ),
              )}
            </PitchBackground>
          </div>
        </div>

        {/* Coluna direita: titulares, alinhados ao topo (mesma linha do nome do clube) */}
        <div ref={titularesRef} className="min-w-0 flex-1">
          {list(`TITULARES (${titulares.length})`, titulares)}
        </div>
      </div>
      <div className="mt-3">
        {list(`BANCO (${benchPlayers.length})`, benchPlayers)}
      </div>
    </div>
  );
}
