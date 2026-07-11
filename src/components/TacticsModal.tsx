import { useRef, useState } from "react";
import { useStore } from "../store";
import { makeSub } from "../game/engine";
import { appConfirm, appAlert } from "./AppDialog";
import Toggle from "./Toggle";
import EnergyBar from "./EnergyBar";
import type { Marking, Mentality, Player, Position, LivePlayer, Formation } from "../types";
import { shapeOf } from "../types";
import { pitchLayout, PlayerPin, EmptySlot, PitchBackground } from "./PitchField";
import { useLockBodyScroll } from "./useLockBodyScroll";

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
  useLockBodyScroll(!!game && !!live);
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
    if (!hasKeeperOnField) {
      await appAlert("Você está sem goleiro!");
      return;
    }
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
  const currentSlotOrder = slotOrder || (side === "home" ? match.homeSlotOrder : match.awaySlotOrder) || [];
  const byPos = (a: { playerId: string }, b: { playerId: string }) => {
    const lpA = lineup.find(l => l.playerId === a.playerId);
    const lpB = lineup.find(l => l.playerId === b.playerId);
    const posA = lpA?.posOverride ?? pById[a.playerId].pos;
    const posB = lpB?.posOverride ?? pById[b.playerId].pos;
    const posDiff = POS_ORDER[posA] - POS_ORDER[posB];
    if (posDiff !== 0) return posDiff;

    const idxA = currentSlotOrder.indexOf(a.playerId);
    const idxB = currentSlotOrder.indexOf(b.playerId);
    if (idxA !== -1 && idxB !== -1) {
      return idxA - idxB;
    }
    return 0;
  };
  const onField = lineup.filter((l) => l.onField && !l.sentOff).sort(byPos);
  const bench = lineup.filter((l) => !l.onField && !l.subbedOut && !l.sentOff).sort(byPos);
  const hasKeeperOnField = onField.some((l) => (l.posOverride ?? pById[l.playerId].pos) === "GOL");

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

  const reallocateLineup = (lineup2: LivePlayer[], f: Formation) => {
    const shape = shapeOf(f, game?.customFormation);
    const maxD = shape.DEF;
    const maxM = shape.MEI;
    const maxA = shape.ATA;

    const players = useStore.getState().game?.players ?? [];
    const pMap = new Map(players.map((p) => [p.id, p]));

    const activeLine = lineup2.filter((l) => l.onField && !l.sentOff && pMap.get(l.playerId)?.pos !== "GOL");

    const defs = activeLine.filter((l) => pMap.get(l.playerId)?.pos === "DEF");
    const meis = activeLine.filter((l) => pMap.get(l.playerId)?.pos === "MEI");
    const atas = activeLine.filter((l) => pMap.get(l.playerId)?.pos === "ATA");

    const targetD: LivePlayer[] = [];
    const targetM: LivePlayer[] = [];
    const targetA: LivePlayer[] = [];
    const unassigned: LivePlayer[] = [];

    defs.forEach((l, idx) => {
      if (idx < maxD) targetD.push(l);
      else unassigned.push(l);
    });

    meis.forEach((l, idx) => {
      if (idx < maxM) targetM.push(l);
      else unassigned.push(l);
    });

    atas.forEach((l, idx) => {
      if (idx < maxA) targetA.push(l);
      else unassigned.push(l);
    });

    while (targetD.length < maxD && unassigned.length > 0) {
      targetD.push(unassigned.shift()!);
    }
    while (targetM.length < maxM && unassigned.length > 0) {
      targetM.push(unassigned.shift()!);
    }
    while (targetA.length < maxA && unassigned.length > 0) {
      targetA.push(unassigned.shift()!);
    }

    targetD.forEach((l, idx) => {
      l.posOverride = "DEF";
      l.slotIdx = idx;
    });
    targetM.forEach((l, idx) => {
      l.posOverride = "MEI";
      l.slotIdx = idx;
    });
    targetA.forEach((l, idx) => {
      l.posOverride = "ATA";
      l.slotIdx = idx;
    });
  };

  const changeFormation = (f: Formation) => {
    setSuggestion(null);
    useStore.setState((state) => {
      if (!state.game) return state;
      return { game: { ...state.game, formation: f } };
    });
    updateLive((ms) => {
      const m2 = ms[mi];
      const lineup2 = side === "home" ? m2.homeLineup : m2.awayLineup;
      reallocateLineup(lineup2, f);
    });
  };

  const movePlayerToSlot = (playerId: string, targetPos: Position, targetSlotIdx: number) => {
    updateLive((ms) => {
      const m2 = ms[mi];
      const lp = (side === "home" ? m2.homeLineup : m2.awayLineup).find((l) => l.playerId === playerId);
      if (lp) {
        lp.posOverride = targetPos;
        lp.slotIdx = targetSlotIdx;
      }
    });
    setSelectedOutId(null);
  };

  const canMovePlayerToSlot = (player: Player, slotPos: Position, hasKeeper: boolean): boolean => {
    if (player.pos === "GOL") {
      return slotPos === "GOL";
    }
    if (slotPos === "GOL") {
      return !hasKeeper;
    }
    return true;
  };

  const pickOut = (id: string) => {
    setSuggestion(null);
    if (selectedInId) {
      const outP = pById[id];
      const inP = pById[selectedInId];
      const outLp = lineup.find((l) => l.playerId === id);
      const isOutInGoal = (outLp?.posOverride ?? outP.pos) === "GOL";
      if (isOutInGoal === (inP.pos === "GOL")) {
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
      const lpA = lineup.find((l) => l.playerId === selectedOutId);
      const lpB = lineup.find((l) => l.playerId === id);
      const effPosA = lpA?.posOverride ?? a.pos;
      const effPosB = lpB?.posOverride ?? b.pos;

      if (effPosA === effPosB) {
        // Mesma posição efetiva (mesmo setor): troca os slots visuais no campo
        const sa = slots.find((s) => s.player?.id === selectedOutId);
        const sb = slots.find((s) => s.player?.id === id);
        if (sa && sb) {
          updateLive((ms) => {
            const lu = side === "home" ? ms[mi].homeLineup : ms[mi].awayLineup;
            const l1 = lu.find((l) => l.playerId === selectedOutId);
            const l2 = lu.find((l) => l.playerId === id);
            if (!l1 || !l2) return;
            const tempIdx = l1.slotIdx ?? sa.slotIdx;
            l1.slotIdx = l2.slotIdx ?? sb.slotIdx;
            l2.slotIdx = tempIdx;
          });
        }

        // Também troca no slotOrder para manter coerência do bônus de pé e simulação
        const order = onField.map((l) => l.playerId);
        const ia = order.indexOf(selectedOutId);
        const ib = order.indexOf(id);
        if (ia !== -1 && ib !== -1) {
          [order[ia], order[ib]] = [order[ib], order[ia]];
          setSlotOrder(order);
          updateLive((ms) => {
            if (side === "home") ms[mi].homeSlotOrder = order;
            else ms[mi].awaySlotOrder = order;
          });
          setStoreSlotOrder(order);
        }

        setSelectedOutId(null);
        return;
      }

      // posições diferentes: os dois trocam de setor/slot no desenho do campo.
      // Só o gol fica de fora — goleiro não vira jogador de linha e vice-versa.
      const sa = slots.find((s) => s.player?.id === selectedOutId);
      const sb = slots.find((s) => s.player?.id === id);
      if (sa && sb && sa.pos !== "GOL" && sb.pos !== "GOL" && a.pos !== "GOL" && b.pos !== "GOL") {
        updateLive((ms) => {
          const lu = side === "home" ? ms[mi].homeLineup : ms[mi].awayLineup;
          const l1 = lu.find((l) => l.playerId === selectedOutId);
          const l2 = lu.find((l) => l.playerId === id);
          if (!l1 || !l2) return;
          l1.posOverride = sb.pos;
          l1.slotIdx = sb.slotIdx;
          l2.posOverride = sa.pos;
          l2.slotIdx = sa.slotIdx;
        });
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

    let currentRejected = [...rejectedSubs];
    if (suggestion) {
      currentRejected.push(`${suggestion.out}-${suggestion.in}`);
    }

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
      // 1º: corrige quem está fora de sua posição natural.
      // Se um jogador em campo está atuando em uma posição diferente (l.posOverride) de sua posição natural,
      // sugerimos substituí-lo por um reserva que naturalmente jogue nessa posição efetiva.
      const outOfPos = onField.filter((l) => {
        const p = pById[l.playerId];
        const effPos = l.posOverride ?? p.pos;
        return effPos !== p.pos && p.pos !== "GOL"; // Goleiro não entra nessa lógica
      });

      for (const l of outOfPos) {
        const p = pById[l.playerId];
        const effPos = l.posOverride!;
        const candidates = bench
          .filter((inL) => pById[inL.playerId].pos === effPos)
          .sort((a, b) => pById[b.playerId].strength - pById[a.playerId].strength || b.energy - a.energy);
        for (const cand of candidates) {
          pairs.push({ out: l.playerId, in: cand.playerId });
        }
      }

      // 2º: sem desajuste de posição (ou além deles), sugere upgrade de força no mesmo setor
      // (baseando-se no setor efetivo em que o jogador está jogando)
      const upgrades = bench
        .filter((inL) => pById[inL.playerId].pos !== "GOL")
        .flatMap((inL) => {
          const inP = pById[inL.playerId];
          const matchableOuts = onField
            .filter((l) => {
              const p = pById[l.playerId];
              const effPos = l.posOverride ?? p.pos;
              return effPos === inP.pos;
            });
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

    // Ordena as sugestões para sempre priorizar o reserva com maior força
    pairs.sort((a, b) => {
      const strengthA = pById[a.in].strength;
      const strengthB = pById[b.in].strength;
      if (strengthB !== strengthA) {
        return strengthB - strengthA; // maior força primeiro
      }
      const outA = onField.find((l) => l.playerId === a.out);
      const outB = onField.find((l) => l.playerId === b.out);
      const energyA = outA ? outA.energy : 100;
      const energyB = outB ? outB.energy : 100;
      return energyA - energyB; // menor energia (mais cansado) primeiro
    });

    // Filtra as sugestões que já foram descartadas anteriormente
    let allowed = pairs.filter((p) => !currentRejected.includes(`${p.out}-${p.in}`));
    if (allowed.length === 0 && pairs.length > 0) {
      // Se todas as opções possíveis foram descartadas, reseta o histórico e volta para a primeira
      setRejectedSubs([]);
      currentRejected = [];
      allowed = pairs;
    } else {
      setRejectedSubs(currentRejected);
    }

    if (allowed.length > 0) {
      setSuggestion({ out: allowed[0].out, in: allowed[0].in });
    } else {
      setSuggestion(null);
    }
  };

  const pickIn = (id: string) => {
    setSuggestion(null);
    if (selectedOutId) {
      const outP = pById[selectedOutId];
      const inP = pById[id];
      const outLp = lineup.find((l) => l.playerId === selectedOutId);
      const isOutInGoal = (outLp?.posOverride ?? outP.pos) === "GOL";
      if (isOutInGoal === (inP.pos === "GOL")) {
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
  const slots: { pos: Position; slotIdx: number; x: number; y: number; player?: Player; energy?: number }[] = [];

  const activePlayers = onField.map((l) => ({
    player: {
      ...pById[l.playerId],
      pos: l.posOverride ?? pById[l.playerId].pos,
    },
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

  // Match players to layout slots
  (["GOL", "DEF", "MEI", "ATA"] as const).forEach((posKey) => {
    const coords = slotsByPos[posKey];
    const N = coords.length;
    const assigned = new Array<{ player: Player; energy: number } | undefined>(N).fill(undefined);
    const list = playersByPos[posKey];
    const listWithLp = list.map(ap => {
      const lp = lineup.find(l => l.playerId === ap.player.id);
      return { ...ap, slotIdx: lp?.slotIdx };
    });

    // 1st pass: place players who have a preferred slotIdx
    const unplaced: typeof listWithLp = [];
    listWithLp.forEach(ap => {
      if (ap.slotIdx !== undefined && ap.slotIdx >= 0 && ap.slotIdx < N && !assigned[ap.slotIdx]) {
        assigned[ap.slotIdx] = { player: ap.player, energy: ap.energy };
      } else {
        unplaced.push(ap);
      }
    });

    // 2nd pass: place remaining players in empty spots
    let emptyIdx = 0;
    unplaced.forEach(ap => {
      while (emptyIdx < N && assigned[emptyIdx]) {
        emptyIdx++;
      }
      if (emptyIdx < N) {
        assigned[emptyIdx] = { player: ap.player, energy: ap.energy };
      }
    });

    coords.forEach((coord, i) => {
      slots.push({
        pos: posKey,
        slotIdx: i,
        x: coord.x,
        y: coord.y,
        player: assigned[i]?.player,
        energy: assigned[i]?.energy,
      });
    });
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
      .filter((l) => l.yellowsMatch > 0 || l.sentOff)
      .map((l) => ({ p: pById[l.playerId], lp: l }))
      .sort((a, b) => (b.lp.sentOff ? 2 : b.lp.yellowsMatch) - (a.lp.sentOff ? 2 : a.lp.yellowsMatch));
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
          <h2 className="text-lg font-bold">Parada tática — {match.minute}&#39;</h2>
          <div className="flex items-center gap-3">
            {/* confirmar e retoma o jogo */}
            <button
              onClick={closeAndResume}
              disabled={!hasKeeperOnField}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={hasKeeperOnField ? "Voltar ao jogo" : "Você precisa escalar um goleiro ou jogador de linha no gol!"}
            >
              <span className="text-[12px]">▶</span> Jogar
            </button>
            
            {/* Coluna para controle de fechar (✕) e desfazer (↺) */}
            <div className="flex flex-col items-center gap-2">
              {/* ✕: mesmo fluxo — sem alteração sai direto; com alteração pede confirmação */}
              <button
                onClick={closeAndResume}
                disabled={!hasKeeperOnField}
                className="text-zinc-400 hover:text-white text-lg font-bold px-1 disabled:opacity-45 disabled:cursor-not-allowed leading-none"
                title={hasKeeperOnField ? "Voltar ao jogo" : "Você precisa escalar um goleiro ou jogador de linha no gol!"}
              >
                ✕
              </button>
              {/* ↺: desfaz todas as alterações */}
              <button
                onClick={revertToSnapshot}
                disabled={!hasChanges()}
                className="text-zinc-450 hover:text-white text-lg font-bold px-1 disabled:opacity-25 disabled:cursor-not-allowed leading-none"
                title="Desfaz todas as alterações feitas nesta parada"
              >
                ↺
              </button>
            </div>
          </div>
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
            label="🐢 Catimba"
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
        {suggestion && (() => {
          const outP = pById[suggestion.out];
          const inP = pById[suggestion.in];
          const outLp = lineup.find((l) => l.playerId === suggestion.out);
          const inLp = lineup.find((l) => l.playerId === suggestion.in);
          const outEnergy = outLp ? Math.round(outLp.energy) : outP.energy;
          const inEnergy = inLp ? Math.round(inLp.energy) : inP.energy;
          // só o primeiro nome: a posição é informação obrigatória e nunca pode
          // ser cortada pelo truncate quando o nome é comprido
          const firstName = (n: string) => n.split(" ")[0];
          return (
            <div className="mb-3 flex flex-col gap-2.5 rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                {/* Quem sai */}
                <div className="flex flex-1 flex-col text-left min-w-0">
                  <span className="flex min-w-0 items-baseline gap-1 font-semibold text-zinc-200">
                    <span className="truncate">{firstName(outP.name)}</span>
                    <span className="shrink-0 text-[10px] text-zinc-500 font-normal">({outP.pos})</span>
                  </span>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
                    <span className="text-red-400 font-bold">▼</span>
                    <span className="font-mono">F-{outP.strength}</span>
                    <EnergyBar value={outEnergy} className="scale-75 origin-left" />
                  </div>
                </div>

                {/* Seta de transição */}
                <span className="text-zinc-500 font-bold text-lg shrink-0">→</span>

                {/* Quem entra */}
                <div className="flex flex-1 flex-col text-right items-end min-w-0">
                  <span className="flex min-w-0 items-baseline justify-end gap-1 font-semibold text-zinc-200">
                    <span className="shrink-0 text-[10px] text-zinc-500 font-normal">({inP.pos})</span>
                    <span className="truncate">{firstName(inP.name)}</span>
                  </span>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
                    <EnergyBar value={inEnergy} className="scale-75 origin-right" />
                    <span className="font-mono">F-{inP.strength}</span>
                    <span className="text-emerald-400 font-bold">▲</span>
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-2 border-t border-zinc-800/40 pt-1.5">
                <button
                  onClick={() => {
                    if (suggestion) {
                      setRejectedSubs((prev) => [...prev, `${suggestion.out}-${suggestion.in}`]);
                    }
                    setSuggestion(null);
                  }}
                  className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  Descartar
                </button>
                <button
                  onClick={() => executeSub(suggestion.out, suggestion.in)}
                  className="rounded bg-emerald-600 px-4 py-1 text-xs font-bold text-white hover:bg-emerald-500 transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </div>
          );
        })()}

        {/* INFORMAÇÕES card moved up here to sit directly below quick sub suggestions */}
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
                      <span>{"🟨".repeat(Math.min(lp.yellowsMatch, 2))}{lp.sentOff ? "🟥" : ""}</span>
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

        <div className="mb-4">
          <p className="mb-1 text-sm text-zinc-400">Formação</p>
          <div className="flex gap-2 flex-wrap">
            {(["4-4-2", "4-3-3", "3-5-2", "4-5-1", "5-3-2", "3-4-3"] as const).map((f) => (
              <button
                key={f}
                onClick={() => changeFormation(f)}
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



        {!hasKeeperOnField && (
          <p className="mb-3 rounded-lg bg-red-950 px-3 py-2 text-xs text-red-400 font-semibold border border-red-800/80 animate-pulse text-center">
            🚨 Você está sem goleiro!
          </p>
        )}


        <div className="flex flex-col gap-4 sm:flex-row">
          {/* Prancheta: campo com quem está em campo agora */}
          <PitchBackground className="relative mx-auto w-full shrink-0 overflow-hidden rounded-lg border border-emerald-900 sm:mx-0 sm:w-56">
            {slots.map((s, i) => {
              const isSelected = selectedOutId === s.player?.id || suggestion?.out === s.player?.id;
              const isCompatible = !selectedInId || !s.player || (pById[selectedInId].pos === "GOL") === (s.player.pos === "GOL") || (!hasKeeperOnField && pById[selectedInId].pos === "GOL");
              const shouldDim = s.player ? (s.player.reds > 0 || !isCompatible) : false;
              
              // Buscar informações do LivePlayer para cartões e gols
              const lp = s.player ? lineup.find(l => l.playerId === s.player!.id) : null;
              const yellowsMatch = lp?.yellowsMatch ?? 0;
              const goalsMatch = s.player 
                ? match.events.filter(e => e.type === "goal" && e.playerName === s.player!.name).length 
                : 0;

              return s.player ? (
                <PlayerPin
                  key={s.player.id}
                  p={s.player}
                  x={s.x}
                  y={s.y}
                  colors={kit}
                  selected={isSelected}
                  energyOverride={s.energy}
                  yellowsMatch={yellowsMatch}
                  goalsMatch={goalsMatch}
                  onClick={() => pickOut(s.player!.id)}
                />
              ) : (
                <EmptySlot
                  key={i}
                  x={s.x}
                  y={s.y}
                  label={s.pos}
                  pulse={(!hasKeeperOnField && s.pos === "GOL") || (!!selectedOutId && canMovePlayerToSlot(pById[selectedOutId], s.pos, hasKeeperOnField))}
                  onClick={() => {
                    if (selectedOutId) {
                      const outP = pById[selectedOutId];
                      if (canMovePlayerToSlot(outP, s.pos, hasKeeperOnField)) {
                        movePlayerToSlot(selectedOutId, s.pos, s.slotIdx);
                      }
                    }
                  }}
                />
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
                  const isPlayerInGoal = (l.posOverride ?? p.pos) === "GOL";
                  const isCompatible = !selectedInId || (pById[selectedInId].pos === "GOL") === isPlayerInGoal;
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
                  const outLp = selectedOutId ? lineup.find((x) => x.playerId === selectedOutId) : null;
                  const isOutInGoal = outLp ? (outLp.posOverride ?? pById[selectedOutId!].pos) === "GOL" : false;
                  const isCompatible = !selectedOutId || isOutInGoal === (p.pos === "GOL");
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
