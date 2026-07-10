import { useRef, useState } from "react";
import { useStore } from "../store";
import { makeSub } from "../game/engine";
import { appConfirm } from "./AppDialog";
import Toggle from "./Toggle";
import EnergyBar from "./EnergyBar";
import type { Marking, Mentality, Player, Position } from "../types";
import { shapeOf } from "../types";
import { pitchLayout, PlayerPin, EmptySlot, PitchBackground } from "./PitchField";

export default function TacticsModal({ onClose }: { onClose: () => void }) {
  const { game, live, updateLive } = useStore();
  const setStoreSlotOrder = useStore((s) => s.setSlotOrder);
  const [selectedOutId, setSelectedOutId] = useState<string | null>(null);
  const [selectedInId, setSelectedInId] = useState<string | null>(null);
  const [slotOrder, setSlotOrder] = useState<string[] | null>(null);
  // sugestão da sub. rápida: par sai/entra aguardando confirmação do usuário
  const [suggestion, setSuggestion] = useState<{ out: string; in: string } | null>(null);
  const [rejectedSubs, setRejectedSubs] = useState<string[]>([]);
  const setPaused = useStore((s) => s.setPaused);
  // foto do estado ao abrir o modal: permite desfazer tudo (táticas, subs, formação)
  const snapshot = useRef<{
    tactics: unknown; lineup: unknown; subsLeft: number; events: unknown;
    liveSlotOrder?: string[]; formation: unknown; gameSlotOrder?: string[];
  } | null>(null);
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
  // camisa do clube nos pinos do campo: a cor do pino identifica o time;
  // energia é papel exclusivo da barrinha abaixo de cada pino/linha
  const userClub = game.clubs.find((c) => c.id === game.userClubId)!;
  const kit = { bg: userClub.primaryColor, border: userClub.secondaryColor };

  if (!snapshot.current) {
    snapshot.current = JSON.parse(JSON.stringify({
      tactics,
      lineup,
      subsLeft,
      // eventos entram na foto: desfazer também apaga o evento de substituição
      // lançado pelo makeSub (o jogo está pausado, nada mais muda enquanto isso)
      events: match.events,
      liveSlotOrder: side === "home" ? match.homeSlotOrder : match.awaySlotOrder,
      formation: game.formation ?? "4-4-2",
      gameSlotOrder: game.slotOrder,
    }));
  }

  // estado atual no mesmo formato da foto, para detectar se algo mudou
  const currentShape = () =>
    JSON.stringify({
      tactics,
      lineup,
      subsLeft,
      events: match.events,
      liveSlotOrder: side === "home" ? match.homeSlotOrder : match.awaySlotOrder,
      formation: game.formation ?? "4-4-2",
      gameSlotOrder: game.slotOrder,
    });
  const hasChanges = () => currentShape() !== JSON.stringify(snapshot.current);

  const revertToSnapshot = () => {
    const snap = snapshot.current;
    if (!snap) return;
    updateLive((ms) => {
      const m2 = ms[mi];
      m2.events = JSON.parse(JSON.stringify(snap.events)) as typeof match.events;
      if (side === "home") {
        m2.homeTactics = JSON.parse(JSON.stringify(snap.tactics)) as typeof tactics;
        m2.homeLineup = JSON.parse(JSON.stringify(snap.lineup)) as typeof lineup;
        m2.homeSubsLeft = snap.subsLeft;
        m2.homeSlotOrder = snap.liveSlotOrder;
      } else {
        m2.awayTactics = JSON.parse(JSON.stringify(snap.tactics)) as typeof tactics;
        m2.awayLineup = JSON.parse(JSON.stringify(snap.lineup)) as typeof lineup;
        m2.awaySubsLeft = snap.subsLeft;
        m2.awaySlotOrder = snap.liveSlotOrder;
      }
    });
    useStore.setState((state) =>
      state.game
        ? { game: { ...state.game, formation: snap.formation as typeof game.formation, slotOrder: snap.gameSlotOrder } }
        : state,
    );
    setSelectedOutId(null);
    setSelectedInId(null);
    setSuggestion(null);
    setSlotOrder(null);
  };

  // Sair do modal: sem alteração volta ao jogo direto; com alteração pergunta —
  // Confirmar aplica e volta ao jogo; Desfazer reverte e permanece no modal.
  const closeAndResume = async () => {
    if (hasChanges()) {
      const keep = await appConfirm("Aplicar as alterações da intervenção tática?", {
        ok: "Confirmar",
        cancel: "Desfazer",
      });
      if (!keep) {
        revertToSnapshot();
        return; // continua no modal, com tudo restaurado
      }
    }
    onClose();
    setPaused(false);
  };

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
    // quem entra herda exatamente o slot de quem saiu no desenho do campo:
    // congela a ordem exibida agora e troca o id do substituído pelo do reserva
    const displayOrder = (["GOL", "DEF", "MEI", "ATA"] as const).flatMap((k) =>
      playersByPos[k].map((ap) => ap.player.id),
    );
    const newOrder = displayOrder.map((id) => (id === outPlayerId ? inPlayerId : id));
    updateLive((ms) => {
      if (!makeSub(ms[mi], pById, side, outPlayerId, inPlayerId)) return;
      if (side === "home") ms[mi].homeSlotOrder = newOrder;
      else ms[mi].awaySlotOrder = newOrder;
    });
    setSlotOrder(newOrder);
    setStoreSlotOrder(newOrder);
    setSelectedOutId(null);
    setSelectedInId(null);
    setSuggestion(null);
    setRejectedSubs([]);
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

  // Substituição rápida: sugere a troca mais óbvia — o usuário confirma ou descarta.
  // "energia" tira o mais cansado e põe o reserva mais descansado da mesma posição;
  // "posicao" faz upgrade de força: entra o reserva mais forte que um titular do setor.
  const quickSub = (mode: "energia" | "posicao") => {
    if (subsLeft <= 0) return;
    const samePos = (a: Player, b: Player) => a.pos === b.pos;
    const pairs: { out: string; in: string }[] = [];

    if (mode === "energia") {
      // goleiro nunca entra na sugestão: só jogadores de linha
      const tired = [...onField]
        .filter((l) => pById[l.playerId].pos !== "GOL")
        .sort((a, b) => a.energy - b.energy);
      for (const out of tired) {
        const outP = pById[out.playerId];
        // Encontra reservas da mesma posição ordenados por força decrescente e energia
        const candidates = bench
          .filter((l) => samePos(pById[l.playerId], outP) && l.energy > out.energy + 10)
          .sort((a, b) => pById[b.playerId].strength - pById[a.playerId].strength || b.energy - a.energy);
        for (const cand of candidates) {
          pairs.push({ out: out.playerId, in: cand.playerId });
        }
      }
    } else {
      // 1º: corrige quem está fora de posição. Compara o que a formação pede com
      // quem está em campo: setor com gente sobrando cede o mais fraco do excesso,
      // e entra um reserva do setor em falta.
      const shape = shapeOf(formation, game.customFormation);
      const need: Record<Position, number> = { GOL: 1, DEF: shape.DEF, MEI: shape.MEI, ATA: shape.ATA };
      const have: Record<Position, number> = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
      onField.forEach((l) => have[pById[l.playerId].pos]++);
      // goleiro fora da análise: sugestões só mexem em jogadores de linha
      const lacking = (Object.keys(need) as Position[]).filter((k) => k !== "GOL" && have[k] < need[k]);
      const surplus = (Object.keys(need) as Position[]).filter((k) => have[k] > need[k]);
      
      for (const lackPos of lacking) {
        const inCandidates = bench
          .filter((l) => pById[l.playerId].pos === lackPos)
          .sort((a, b) => pById[b.playerId].strength - pById[a.playerId].strength || b.energy - a.energy);
        const outCandidates = onField
          .filter((l) => surplus.includes(pById[l.playerId].pos) && pById[l.playerId].pos !== "GOL")
          .sort((a, b) => pById[a.playerId].strength - pById[b.playerId].strength);
        
        for (const inC of inCandidates) {
          for (const outC of outCandidates) {
            pairs.push({ out: outC.playerId, in: inC.playerId });
          }
        }
      }

      // 2º: sem desajuste de posição, sugere upgrade de força no mesmo setor
      const upgrades = bench
        .filter((inL) => pById[inL.playerId].pos !== "GOL")
        .flatMap((inL) => {
          const inP = pById[inL.playerId];
          const matchableOuts = onField
            .filter((l) => samePos(pById[l.playerId], inP));
          return matchableOuts.flatMap((outL) => {
            const gain = inP.strength - pById[outL.playerId].strength;
            return gain > 0 ? [{ out: outL.playerId, in: inL.playerId, gain }] : [];
          });
        })
        .sort((a, b) => b.gain - a.gain);
      for (const upg of upgrades) {
        pairs.push({ out: upg.out, in: upg.in });
      }
    }

    // Filtra as sugestões que já foram descartadas anteriormente
    let allowed = pairs.filter((p) => !rejectedSubs.includes(`${p.out}-${p.in}`));
    if (allowed.length === 0 && pairs.length > 0) {
      // Se todas as opções possíveis foram descartadas, reseta o histórico e volta para a primeira
      setRejectedSubs([]);
      allowed = pairs;
    }

    if (allowed.length > 0) {
      setSuggestion({ out: allowed[0].out, in: allowed[0].in });
    } else {
      setSuggestion(null);
    }
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
    { key: "extrema", label: "⛓ Extrema" },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeAndResume}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">Intervenção tática — {match.minute}&#39;</h2>
            {/* play: confirma/desfaz e retoma o jogo, igual ao botão de baixo */}
            <button
              onClick={closeAndResume}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs hover:bg-emerald-500"
              title="Voltar ao jogo"
            >
              ▶
            </button>
          </div>
          {/* ✕: mesmo fluxo — sem alteração sai direto; com alteração pede confirmação */}
          <button onClick={closeAndResume} className="text-zinc-400 hover:text-white" title="Voltar ao jogo">
            ✕
          </button>
        </div>

        {/* Mentalidade e Marcação em linhas empilhadas (uma opção por linha, no
            padrão dos extras), lado a lado em duas colunas — nada quebra no mobile */}
        <div className="mb-3 grid grid-cols-2 gap-x-3">
          <div className="min-w-0">
            <p className="mb-1 text-sm text-zinc-400">Mentalidade</p>
            <div className="flex flex-col gap-1">
              {MENT.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setTactic((t) => (t.mentality = m.key))}
                  className={`w-full truncate rounded px-2 py-1.5 text-left text-sm ${
                    tactics.mentality === m.key ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-sm text-zinc-400">Marcação</p>
            <div className="flex flex-col gap-1">
              {MARK.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setTactic((t) => (t.marking = m.key))}
                  className={`w-full truncate rounded px-2 py-1.5 text-left text-sm ${
                    tactics.marking === m.key ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
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

        {/* Sub. rápida: um clique resolve a troca mais óbvia (energia ou força) */}
        <div className="mb-3 flex items-center gap-2">
          <p className="text-sm text-zinc-400">Sub. rápida</p>
          <button
            onClick={() => quickSub("energia")}
            disabled={subsLeft <= 0}
            className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
            title="Troca o titular mais cansado pelo reserva mais descansado da mesma posição"
          >
            Energia
          </button>
          <button
            onClick={() => quickSub("posicao")}
            disabled={subsLeft <= 0}
            className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
            title="Melhora o setor: entra o reserva mais forte que um titular da mesma posição"
          >
            Posição
          </button>
          <span className="text-xs text-zinc-600">{subsLeft}/5 subs</span>
        </div>

        {/* sugestão pendente: mostra a troca e espera confirmação */}
        {suggestion && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm">
            <span className="text-zinc-200">
              <span className="text-red-400">▼ {pById[suggestion.out].name}</span>
              {" → "}
              <span className="text-emerald-400">▲ {pById[suggestion.in].name}</span>
            </span>
            <span className="flex gap-2">
              <button
                onClick={() => executeSub(suggestion.out, suggestion.in)}
                className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold hover:bg-emerald-500"
              >
                Confirmar
              </button>
              <button
                onClick={() => {
                  if (suggestion) {
                    setRejectedSubs((prev) => [...prev, `${suggestion.out}-${suggestion.in}`]);
                  }
                  setSuggestion(null);
                }}
                className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                Descartar
              </button>
            </span>
          </div>
        )}

        <div className="mb-4">
          <p className="mb-1 text-sm text-zinc-400">Formação</p>
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
                className={`flex-1 whitespace-nowrap rounded px-1 py-1.5 text-[10px] transition-all sm:px-2.5 sm:text-xs ${
                  formation === f
                    ? "bg-emerald-600 font-bold border border-emerald-400"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Volume de jogo: o técnico vê se está perto ou longe do gol */}
        {match.stats && (() => {
          const st = match.stats;
          const total = st.home.poss + st.away.poss;
          const homePoss = total > 0 ? Math.round((100 * st.home.poss) / total) : 50;
          const row = (label: string, h: number | string, a: number | string) => (
            <div className="flex items-center justify-between py-0.5 text-xs">
              <span className="w-10 text-right font-mono font-bold text-zinc-200">{h}</span>
              <span className="flex-1 text-center text-zinc-500">{label}</span>
              <span className="w-10 text-left font-mono font-bold text-zinc-200">{a}</span>
            </div>
          );
          return (
            <div className="mb-3 rounded-lg bg-zinc-800/60 px-3 py-2">
              <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
                <span>{homeClub.shortName}</span>
                <span className="font-bold">📊 VOLUME DE JOGO</span>
                <span>{awayClub.shortName}</span>
              </div>
              {row("Posse (%)", homePoss, 100 - homePoss)}
              {row("Finalizações", st.home.shots, st.away.shots)}
              {row("Chutes no gol", st.home.onTarget, st.away.onTarget)}
              {row("Defesas", st.home.saves, st.away.saves)}
              {row("Desarmes", st.home.tackles, st.away.tackles)}
              {row("Interceptações", st.home.interceptions, st.away.interceptions)}
            </div>
          );
        })()}

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
              const isSelected = selectedOutId === s.player?.id || suggestion?.out === s.player?.id;
              const isCompatible = !selectedInId || !s.player || (pById[selectedInId].pos === "GOL") === (s.player.pos === "GOL");
              const shouldDim = s.player ? (s.player.reds > 0 || !isCompatible) : false;
              return s.player ? (
                <PlayerPin
                  key={s.player.id}
                  p={s.player}
                  x={s.x}
                  y={s.y}
                  colors={kit}
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
                  const isSelected = selectedOutId === l.playerId || suggestion?.out === l.playerId;
                  const isCompatible = !selectedInId || (pById[selectedInId].pos === "GOL") === (p.pos === "GOL");
                  const shouldDim = !isCompatible;
                  return (
                    <button
                      key={l.playerId}
                      disabled={shouldDim}
                      onClick={() => pickOut(l.playerId)}
                      className={`mb-1 flex w-full justify-between rounded px-2 py-1 text-left text-xs transition-all ${
                        isSelected
                          ? "bg-emerald-600 border border-emerald-400 font-bold"
                          : "bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40"
                      }`}
                    >
                      <span>
                        <span className="tabular-nums text-zinc-500">{p.number}</span> {p.pos} {p.name} ({p.strength}){" "}
                        <span className={p.foot === "canhoto" ? "text-red-500" : "text-sky-400"}>{p.foot === "canhoto" ? "◀" : "▶"}</span>
                        {l.subbedIn && <span className="ml-1" title="Entrou durante o jogo">🔄</span>}
                      </span>
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
                  const isSelected = selectedInId === l.playerId || suggestion?.in === l.playerId;
                  const isCompatible = !selectedOutId || (pById[selectedOutId].pos === "GOL") === (p.pos === "GOL");
                  const isDisabled = subsLeft <= 0 || !isCompatible;
                  return (
                    <button
                      key={l.playerId}
                      disabled={isDisabled}
                      onClick={() => pickIn(l.playerId)}
                      className={`mb-1 flex w-full justify-between rounded px-2 py-1 text-left text-xs transition-all ${
                        isSelected
                          ? "bg-emerald-600 border border-emerald-400 font-bold"
                          : "bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40"
                      }`}
                      title={!isCompatible ? "Só é possível repor um goleiro por outro goleiro" : undefined}
                    >
                      <span><span className="tabular-nums text-zinc-500">{p.number}</span> {p.pos} {p.name} ({p.strength}) <span className={p.foot === "canhoto" ? "text-red-500" : "text-sky-400"}>{p.foot === "canhoto" ? "◀" : "▶"}</span></span>
                      <EnergyBar value={l.energy} />
                    </button>
                  );
                })}
                {/* quem já saiu de campo fica listado, apagado e com o ícone de substituição */}
                {lineup.filter((l) => l.subbedOut).sort(byPos).map((l) => {
                  const p = pById[l.playerId];
                  return (
                    <div
                      key={l.playerId}
                      className="mb-1 flex w-full justify-between rounded bg-zinc-800/50 px-2 py-1 text-left text-xs text-zinc-500"
                    >
                      <span>
                        <span className="tabular-nums">{p.number}</span> {p.pos} {p.name} ({p.strength})
                        <span className="ml-1" title="Substituído: já saiu de campo">🔄</span>
                      </span>
                      <EnergyBar value={l.energy} />
                    </div>
                  );
                })}
                {bench.length === 0 && lineup.every((l) => !l.subbedOut) && (
                  <p className="text-xs text-zinc-500">Banco vazio.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={closeAndResume}
          className="mt-4 w-full rounded-lg bg-emerald-600 py-2 font-bold hover:bg-emerald-500"
        >
          ▶ Voltar ao jogo
        </button>
      </div>
    </div>
  );
}
