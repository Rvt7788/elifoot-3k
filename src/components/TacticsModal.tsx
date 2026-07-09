import { useState } from "react";
import { useStore } from "../store";
import { makeSub } from "../game/engine";
import Toggle from "./Toggle";
import EnergyBar from "./EnergyBar";
import type { Marking, Mentality, Player, Position } from "../types";
import { pitchLayout, PlayerPin, EmptySlot, PitchBackground } from "./PitchField";

export default function TacticsModal({ onClose }: { onClose: () => void }) {
  const { game, live, updateLive } = useStore();
  const setStoreSlotOrder = useStore((s) => s.setSlotOrder);
  const [selectedOutId, setSelectedOutId] = useState<string | null>(null);
  const [selectedInId, setSelectedInId] = useState<string | null>(null);
  const [slotOrder, setSlotOrder] = useState<string[] | null>(null);
  if (!game || !live) return null;

  const mi = live.findIndex(
    (m) => m.homeId === game.userClubId || m.awayId === game.userClubId,
  );
  if (mi < 0) return null;
  const match = live[mi];
  const side: "home" | "away" = match.homeId === game.userClubId ? "home" : "away";
  const tactics = side === "home" ? match.homeTactics : match.awayTactics;
  const lineup = side === "home" ? match.homeLineup : match.awayLineup;
  const subsLeft = side === "home" ? match.homeSubsLeft : match.awaySubsLeft;
  const pById = Object.fromEntries(game.players.map((p) => [p.id, p]));

  const setTactic = (fn: (t: typeof tactics) => void) =>
    updateLive((ms) => fn(side === "home" ? ms[mi].homeTactics : ms[mi].awayTactics));

  const POS_ORDER: Record<Position, number> = { GOL: 0, DEF: 1, MEI: 2, ATA: 3 };
  const byPos = (a: { playerId: string }, b: { playerId: string }) =>
    POS_ORDER[pById[a.playerId].pos] - POS_ORDER[pById[b.playerId].pos];
  const onField = lineup.filter((l) => l.onField && !l.sentOff).sort(byPos);
  const bench = lineup.filter((l) => !l.onField && !l.subbedOut && !l.sentOff).sort(byPos);
  const hasKeeperOnField = onField.some((l) => pById[l.playerId].pos === "GOL");

  const executeSub = (outPlayerId: string, inPlayerId: string) => {
    if (subsLeft <= 0) return;
    updateLive((ms) => {
      makeSub(ms[mi], pById, side, outPlayerId, inPlayerId);
    });
    setSelectedOutId(null);
    setSelectedInId(null);
  };

  const pickOut = (id: string) => {
    if (selectedInId) {
      const outP = pById[id];
      const inP = pById[selectedInId];
      if ((outP.pos === "GOL") === (inP.pos === "GOL")) {
        executeSub(id, selectedInId);
      } else {
        setSelectedInId(null);
        setSelectedOutId(id);
      }
      return;
    }

    if (selectedOutId && selectedOutId !== id) {
      const a = pById[selectedOutId];
      const b = pById[id];
      if (a.pos === b.pos) {
        const order = onField.map((l) => l.playerId);
        const ia = order.indexOf(selectedOutId);
        const ib = order.indexOf(id);
        [order[ia], order[ib]] = [order[ib], order[ia]];
        setSlotOrder(order);
        // persiste a troca de lado no jogo em andamento (afeta o bônus de pé) e no save
        updateLive((ms) => {
          if (side === "home") ms[mi].homeSlotOrder = order;
          else ms[mi].awaySlotOrder = order;
        });
        setStoreSlotOrder(order);
        setSelectedOutId(null);
        return;
      }
    }
    setSelectedOutId(selectedOutId === id ? null : id);
  };

  const pickIn = (id: string) => {
    if (selectedOutId) {
      const outP = pById[selectedOutId];
      const inP = pById[id];
      if ((outP.pos === "GOL") === (inP.pos === "GOL")) {
        executeSub(selectedOutId, id);
      } else {
        setSelectedOutId(null);
        setSelectedInId(id);
      }
      return;
    }
    setSelectedInId(selectedInId === id ? null : id);
  };

  const formation = game.formation ?? "4-4-2";
  const pos = pitchLayout(formation, game.customFormation);
  const slots: { pos: Position; x: number; y: number; player?: Player; energy?: number }[] = [];

  const activePlayers = onField.map((l) => ({
    player: pById[l.playerId],
    energy: l.energy,
  }));

  const slotsByPos: Record<Position, { pos: Position; x: number; y: number }[]> = {
    GOL: pos.GOL.map((c) => ({ pos: "GOL" as const, ...c })),
    DEF: pos.DEF.map((c) => ({ pos: "DEF" as const, ...c })),
    MEI: pos.MEI.map((c) => ({ pos: "MEI" as const, ...c })),
    ATA: pos.ATA.map((c) => ({ pos: "ATA" as const, ...c })),
  };

  const playersByPos: Record<Position, typeof activePlayers> = {
    GOL: [],
    DEF: [],
    MEI: [],
    ATA: [],
  };
  activePlayers.forEach((ap) => {
    playersByPos[ap.player.pos].push(ap);
  });

  // Sort and apply slotOrder if applicable, otherwise sort by strength
  (["GOL", "DEF", "MEI", "ATA"] as const).forEach((posKey) => {
    const list = playersByPos[posKey];
    const manual = (slotOrder ?? [])
      .map((id) => list.find((ap) => ap.player.id === id))
      .filter((ap): ap is typeof activePlayers[number] => !!ap);

    if (manual.length === list.length && manual.every((ap) => list.some((b) => b.player.id === ap.player.id))) {
      playersByPos[posKey] = manual;
    } else {
      playersByPos[posKey].sort((a, b) => b.player.strength - a.player.strength);
    }
  });

  const unmatchedSlots: typeof slotsByPos[Position] = [];
  const unmatchedPlayers: typeof activePlayers = [];

  // 1. Natural matching (match players to their matching positions first)
  (["GOL", "DEF", "MEI", "ATA"] as const).forEach((posKey) => {
    const sList = slotsByPos[posKey];
    const pList = playersByPos[posKey];
    const min = Math.min(sList.length, pList.length);

    for (let i = 0; i < min; i++) {
      slots.push({
        pos: sList[i].pos,
        x: sList[i].x,
        y: sList[i].y,
        player: pList[i].player,
        energy: pList[i].energy,
      });
    }

    if (sList.length > min) {
      unmatchedSlots.push(...sList.slice(min));
    }
    if (pList.length > min) {
      unmatchedPlayers.push(...pList.slice(min));
    }
  });

  // 2. Greedy matching (place unassigned players into empty slots of other positions)
  unmatchedSlots.forEach((slot, i) => {
    if (unmatchedPlayers[i]) {
      slots.push({
        pos: slot.pos,
        x: slot.x,
        y: slot.y,
        player: unmatchedPlayers[i].player,
        energy: unmatchedPlayers[i].energy,
      });
    }
  });

  const MENT: { key: Mentality; label: string }[] = [
    { key: "defensivo", label: "🛡 Defensivo" },
    { key: "equilibrado", label: "⚖ Equilibrado" },
    { key: "ofensivo", label: "⚔ Ofensivo" },
    { key: "tudo_ou_nada", label: "🔥 Tudo ou nada" },
  ];

  const MARK: { key: Marking; label: string }[] = [
    { key: "leve", label: "🪶 Leve" },
    { key: "frouxa", label: "〰 Frouxa" },
    { key: "apertada", label: "🔒 Apertada" },
  ];

  const cardedPlayers = (side2: "home" | "away") =>
    (side2 === "home" ? match.homeLineup : match.awayLineup)
      .filter((l) => l.yellowsMatch > 0)
      .map((l) => ({ p: pById[l.playerId], lp: l }))
      .sort((a, b) => b.lp.yellowsMatch - a.lp.yellowsMatch);
  const homeCarded = cardedPlayers("home");
  const awayCarded = cardedPlayers("away");
  // gols por lado, agregados por jogador com os minutos
  const sideGoals = (side2: "home" | "away") => {
    const byPlayer = new Map<string, number[]>();
    for (const e of match.events)
      if (e.type === "goal" && e.side === side2)
        byPlayer.set(e.playerName, [...(byPlayer.get(e.playerName) ?? []), e.minute]);
    return [...byPlayer.entries()].map(([name, minutes]) => ({ name, minutes }));
  };
  const homeGoals = sideGoals("home");
  const awayGoals = sideGoals("away");
  // substituições por lado (quem entrou e em que minuto)
  const sideSubs = (side2: "home" | "away") =>
    match.events.filter((e) => e.type === "sub" && e.side === side2);
  const homeSubs = sideSubs("home");
  const awaySubs = sideSubs("away");
  const homeClub = game.clubs.find((c) => c.id === match.homeId)!;
  const awayClub = game.clubs.find((c) => c.id === match.awayId)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Intervenção tática — {match.minute}&#39;</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">✕</button>
        </div>

        <div className="mb-3">
          <p className="mb-1 text-sm text-zinc-400">Mentalidade</p>
          <div className="flex gap-2">
            {MENT.map((m) => (
              <button
                key={m.key}
                onClick={() => setTactic((t) => (t.mentality = m.key))}
                className={`flex-1 rounded px-2 py-1.5 text-sm ${
                  tactics.mentality === m.key ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <p className="mb-1 text-sm text-zinc-400">Marcação</p>
          <div className="flex gap-2">
            {MARK.map((m) => (
              <button
                key={m.key}
                onClick={() => setTactic((t) => (t.marking = m.key))}
                className={`flex-1 rounded px-2 py-1.5 text-sm ${
                  tactics.marking === m.key ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Toggle
            checked={tactics.truculencia}
            onChange={() => setTactic((t) => (t.truculencia = !t.truculencia))}
            label="🦵 Truculência"
            color="#b91c1c"
            hint="Bônus pesado de desarme, mas 3× mais cartões"
          />
          <Toggle
            checked={tactics.cera}
            onChange={() => setTactic((t) => (t.cera = !t.cera))}
            label="🐢 Cera"
            color="#b45309"
            hint="Trava o ritmo do jogo; cede um pouco de volume e arrisca cartões"
          />
          <Toggle
            checked={tactics.autoSub ?? false}
            onChange={() => setTactic((t) => (t.autoSub = !t.autoSub))}
            label="🔁 Substituição automática"
            color="#0891b2"
            hint="No segundo tempo, troca sozinho jogadores esgotados por reservas descansados da mesma posição"
          />
        </div>

        <div className="mb-4">
          <p className="mb-1 text-sm text-zinc-400">Esquema Tático (Formação)</p>
          <div className="flex gap-2 flex-wrap">
            {(["4-4-2", "4-3-3", "3-5-2", "4-5-1", "5-3-2", "3-4-3"] as const).map((f) => (
              <button
                key={f}
                onClick={() => {
                  useStore.setState((state) => {
                    if (!state.game) return state;
                    return { game: { ...state.game, formation: f } };
                  });
                }}
                className={`flex-1 rounded px-2.5 py-1.5 text-xs transition-all ${
                  formation === f
                    ? "bg-cyan-600 font-bold border border-cyan-400"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {(homeCarded.length > 0 || awayCarded.length > 0 || homeGoals.length > 0 || awayGoals.length > 0 || homeSubs.length > 0 || awaySubs.length > 0) && (
          <div className="mb-3 rounded-lg bg-zinc-800/60 px-3 py-2">
            <p className="mb-1 text-xs font-bold text-zinc-400">ℹ INFORMAÇÕES</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {([
                { club: homeClub, goals: homeGoals, carded: homeCarded, subs: homeSubs },
                { club: awayClub, goals: awayGoals, carded: awayCarded, subs: awaySubs },
              ] as const).map(({ club, goals, carded, subs }) => (
                <div key={club.id}>
                  <p className="mb-0.5 text-[10px] text-zinc-500">{club.shortName}</p>
                  {goals.length === 0 && carded.length === 0 && subs.length === 0 && <p className="text-zinc-600">—</p>}
                  {goals.map((g) => (
                    <div key={g.name} className="flex items-center justify-between">
                      <span>{g.name}</span>
                      <span>
                        {"⚽".repeat(g.minutes.length)}
                        <span className="ml-1 text-zinc-500">{g.minutes.map((m) => `${m}'`).join(" ")}</span>
                      </span>
                    </div>
                  ))}
                  {carded.map(({ p, lp }) => (
                    <div key={p.id} className="flex items-center justify-between">
                      <span className={lp.sentOff ? "text-zinc-500 line-through" : ""}>{p.name}</span>
                      <span>{"🟨".repeat(Math.min(lp.yellowsMatch, 2))}{lp.sentOff && lp.yellowsMatch < 2 ? "🟥" : ""}</span>
                    </div>
                  ))}
                  {subs.map((e, i) => (
                    <div key={i} className="flex items-center justify-between text-zinc-400">
                      <span>🔄 {e.playerName}</span>
                      <span className="text-zinc-500">{e.minute}'</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasKeeperOnField && (
          <p className="mb-2 rounded bg-red-950 px-2 py-1 text-xs text-red-400">
            ⚠ Seu goleiro foi expulso! Escolha um goleiro do banco para entrar.
          </p>
        )}


        <div className="flex flex-col gap-4 sm:flex-row">
          {/* Prancheta: campo com quem está em campo agora */}
          <PitchBackground className="relative mx-auto w-full shrink-0 overflow-hidden rounded-lg border border-emerald-900 sm:mx-0 sm:w-56">
            {slots.map((s, i) => {
              const isSelected = selectedOutId === s.player?.id;
              const isCompatible = !selectedInId || !s.player || (pById[selectedInId].pos === "GOL") === (s.player.pos === "GOL");
              const shouldDim = s.player ? (s.player.reds > 0 || !isCompatible) : false;
              return s.player ? (
                <PlayerPin
                  key={s.player.id}
                  p={s.player}
                  x={s.x}
                  y={s.y}
                  selected={isSelected}
                  dim={shouldDim}
                  energyOverride={s.energy}
                  onClick={() => isCompatible && pickOut(s.player!.id)}
                />
              ) : (
                <EmptySlot key={i} x={s.x} y={s.y} label={s.pos} pulse={!hasKeeperOnField && s.pos === "GOL"} />
              );
            })}
          </PitchBackground>

          {/* Listas: Titulares e Banco em duas colunas empilhadas */}
          <div className="flex flex-1 flex-col gap-3">
            <div>
              <p className="mb-1 text-xs font-bold text-zinc-500">TITULARES EM CAMPO</p>
              <div className="max-h-40 overflow-y-auto pr-1">
                {onField.map((l) => {
                  const p = pById[l.playerId];
                  const isSelected = selectedOutId === l.playerId;
                  const isCompatible = !selectedInId || (pById[selectedInId].pos === "GOL") === (p.pos === "GOL");
                  const shouldDim = !isCompatible;
                  return (
                    <button
                      key={l.playerId}
                      disabled={shouldDim}
                      onClick={() => pickOut(l.playerId)}
                      className={`mb-1 flex w-full justify-between rounded px-2 py-1 text-left text-xs transition-all ${
                        isSelected
                          ? "bg-cyan-600 border border-cyan-400 font-bold"
                          : "bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40"
                      }`}
                    >
                      <span><span className="tabular-nums text-zinc-500">{p.number}</span> {p.pos} {p.name} ({p.strength}) <span className="text-sky-400">{p.foot === "canhoto" ? "C" : "D"}</span></span>
                      <EnergyBar value={l.energy} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-zinc-500">
                BANCO (RESERVAS) <span className="font-normal text-zinc-600">· {subsLeft}/5 subs</span>
              </p>
              <div className="max-h-40 overflow-y-auto pr-1">
                {bench.map((l) => {
                  const p = pById[l.playerId];
                  const isSelected = selectedInId === l.playerId;
                  const isCompatible = !selectedOutId || (pById[selectedOutId].pos === "GOL") === (p.pos === "GOL");
                  const isDisabled = subsLeft <= 0 || !isCompatible;
                  return (
                    <button
                      key={l.playerId}
                      disabled={isDisabled}
                      onClick={() => pickIn(l.playerId)}
                      className={`mb-1 flex w-full justify-between rounded px-2 py-1 text-left text-xs transition-all ${
                        isSelected
                          ? "bg-cyan-600 border border-cyan-400 font-bold"
                          : "bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40"
                      }`}
                      title={!isCompatible ? "Só é possível repor um goleiro por outro goleiro" : undefined}
                    >
                      <span><span className="tabular-nums text-zinc-500">{p.number}</span> {p.pos} {p.name} ({p.strength}) <span className="text-sky-400">{p.foot === "canhoto" ? "C" : "D"}</span></span>
                      <EnergyBar value={l.energy} />
                    </button>
                  );
                })}
                {bench.length === 0 && (
                  <p className="text-xs text-zinc-500">Banco vazio.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-emerald-600 py-2 font-bold hover:bg-emerald-500"
        >
          ▶ Voltar ao jogo
        </button>
      </div>
    </div>
  );
}
