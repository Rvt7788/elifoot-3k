import { useRef, useState } from "react";
import { useStore } from "../store";
import { makeSub } from "../game/engine";
import { appConfirm, appAlert } from "./AppDialog";
import Toggle from "./Toggle";
import EnergyBar from "./EnergyBar";
import GameIcon, { type GameIconName } from "./GameIcon";
import type { Marking, Mentality, Player, Position, LivePlayer, Formation } from "../types";
import { shapeOf } from "../types";
import { pitchLayout, PlayerPin, EmptySlot, PitchBackground } from "./PitchField";
import { isDarkColor } from "../game/color";
import { useLockBodyScroll } from "./useLockBodyScroll";
import ClubBoard from "./ClubBoard";
import { RoleBadges } from "./icons";
import { ScrollLock } from "./useLockBodyScroll";
import { useFabDrag } from "./useFabDrag";
import type { Club } from "../types";

// Escala de intensidade tática (4 passos): verde = mais cauteloso/defensivo,
// vermelho = mais agressivo/arriscado. Usada para colorir o botão selecionado de
// mentalidade e de marcação conforme sua posição na escala.
const INTENSITY_COLORS = ["#16a34a", "#84cc16", "#f59e0b", "#dc2626"]; // green → lime → amber → red

export default function TacticsModal({ onClose }: { onClose: () => void }) {
  const { game, live, updateLive } = useStore();
  const setStoreSlotOrder = useStore((s) => s.setSlotOrder);
  // botão flutuante padrão do app, também aqui na parada tática: mesma posição
  // arrastável (compartilhada via store) — é o mesmo botão passeando entre as telas.
  const { fabPos, fabRef, onFabDown, onFabMove, fabTapEnded } = useFabDrag();
  const [selectedOutId, setSelectedOutId] = useState<string | null>(null);
  const [selectedInId, setSelectedInId] = useState<string | null>(null);
  const [slotOrder, setSlotOrder] = useState<string[] | null>(null);
  // informações de clube abertas POR CIMA da parada tática: fechar volta para cá
  const [infoClub, setInfoClub] = useState<Club | null>(null);
  // sugestão da sub. rápida: par sai/entra aguardando confirmação do usuário
  const [suggestion, setSuggestion] = useState<{ out: string; in: string } | null>(null);
  const [rejectedSubs, setRejectedSubs] = useState<string[]>([]);
  // substituições feitas NESTA parada: cada uma pode ser cancelada individualmente
  const [sessionSubs, setSessionSubs] = useState<{ out: string; in: string }[]>([]);
  // a parada abre COLAPSADA: só o cabeçalho e as informações do jogo ficam à
  // vista; o técnico expande para mexer em subs/táticas/formação/prancheta
  const [expanded, setExpanded] = useState(false);
  // titulares começam colapsados: a interação principal é pela prancheta e pelo banco
  const [startersOpen, setStartersOpen] = useState(false);
  // reservas colapsáveis, padrão aberto — é a lista mais usada na parada
  const [benchOpen, setBenchOpen] = useState(true);
  // badge clicado (capitão/cobrador): arma a escolha — o próximo jogador em
  // campo clicado (pino ou lista) assume a função nesta partida
  const [assignRole, setAssignRole] = useState<"penalty" | "captain" | null>(null);
  const setPaused = useStore((s) => s.setPaused);
  // foto do estado ao abrir o modal: permite desfazer tudo (táticas, subs, formação)
  const snapshot = useRef<{
    tactics: unknown; lineup: unknown; subsLeft: number; events: unknown;
    liveSlotOrder?: string[]; formation: unknown; gameSlotOrder?: string[];
    penaltyTakerId?: string; captainId?: string;
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
      penaltyTakerId: side === "home" ? match.homePenaltyTakerId : match.awayPenaltyTakerId,
      captainId: side === "home" ? match.homeCaptainId : match.awayCaptainId,
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
      penaltyTakerId: side === "home" ? match.homePenaltyTakerId : match.awayPenaltyTakerId,
      captainId: side === "home" ? match.homeCaptainId : match.awayCaptainId,
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
        m2.homePenaltyTakerId = snap.penaltyTakerId;
        m2.homeCaptainId = snap.captainId;
      } else {
        m2.awayTactics = JSON.parse(JSON.stringify(snap.tactics)) as typeof tactics;
        m2.awayLineup = JSON.parse(JSON.stringify(snap.lineup)) as typeof lineup;
        m2.awaySubsLeft = snap.subsLeft;
        m2.awaySlotOrder = snap.liveSlotOrder;
        m2.awayPenaltyTakerId = snap.penaltyTakerId;
        m2.awayCaptainId = snap.captainId;
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
    setSessionSubs([]);
  };

  // Sair do modal: sem alteração volta ao jogo direto; com alteração pergunta —
  // Confirmar aplica e volta ao jogo; Desfazer reverte e permanece no modal.
  const closeAndResume = async () => {
    if (!hasKeeperOnField) {
      await appAlert("Você está sem goleiro!");
      return;
    }
    if (hasChanges()) {
      const keep = await appConfirm("Aplicar alterações?", {
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
  // lesionado nunca é opção de substituição (o motor também bloqueia no makeSub)
  const bench = lineup
    .filter((l) => !l.onField && !l.subbedOut && !l.sentOff && !((pById[l.playerId]?.injuryWeeks ?? 0) > 0))
    .sort(byPos);
  // rede de segurança: sem NENHUM jogador em campo (estado anômalo — ex-clube da
  // IA, save corrompido), a exigência de goleiro não pode prender o usuário aqui
  const hasKeeperOnField =
    onField.length === 0 ||
    onField.some((l) => (l.posOverride ?? pById[l.playerId].pos) === "GOL");

  // ── Cobrador de pênalti e capitão EM CAMPO (mesma regra do motor) ──
  const effPosOf = (l: LivePlayer) => l.posOverride ?? pById[l.playerId].pos;
  const livePenaltyTakerId = (() => {
    const chosen = side === "home" ? match.homePenaltyTakerId : match.awayPenaltyTakerId;
    const linha = onField.filter((l) => effPosOf(l) !== "GOL");
    if (chosen && linha.some((l) => l.playerId === chosen)) return chosen;
    const atas = linha.filter((l) => effPosOf(l) === "ATA");
    const pool = atas.length > 0 ? atas : linha;
    return [...pool].sort((a, b) => pById[b.playerId].strength - pById[a.playerId].strength)[0]?.playerId;
  })();
  const liveCaptainId = (() => {
    const chosen = side === "home" ? match.homeCaptainId : match.awayCaptainId;
    if (chosen && onField.some((l) => l.playerId === chosen)) return chosen;
    const leaders = onField.filter((l) => pById[l.playerId].traits.includes("Líder"));
    const pool = leaders.length > 0 ? leaders : onField;
    return [...pool].sort((a, b) => pById[b.playerId].strength - pById[a.playerId].strength)[0]?.playerId;
  })();
  // atribui a função a um jogador em campo (vale para esta partida)
  const assignLiveRole = (role: "penalty" | "captain", playerId: string) => {
    setAssignRole(null);
    const lp = onField.find((l) => l.playerId === playerId);
    if (!lp) return;
    if (role === "penalty" && effPosOf(lp) === "GOL") return; // goleiro não cobra
    updateLive((ms) => {
      const m2 = ms[mi];
      if (role === "penalty") {
        if (side === "home") m2.homePenaltyTakerId = playerId;
        else m2.awayPenaltyTakerId = playerId;
      } else {
        if (side === "home") m2.homeCaptainId = playerId;
        else m2.awayCaptainId = playerId;
      }
    });
  };
  const armRole = (role: "penalty" | "captain") => setAssignRole(assignRole === role ? null : role);

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
    setSessionSubs((prev) => [...prev, { out: outPlayerId, in: inPlayerId }]);
    setSelectedOutId(null);
    setSelectedInId(null);
    setSuggestion(null);
    setRejectedSubs([]);
  };

  // Cancela uma substituição feita nesta parada: quem saiu volta ao campo no
  // mesmo slot, quem entrou volta ao banco, a sub é devolvida e o evento apagado.
  const cancelSub = (sub: { out: string; in: string }) => {
    updateLive((ms) => {
      const m2 = ms[mi];
      const lu = side === "home" ? m2.homeLineup : m2.awayLineup;
      const outLp = lu.find((l) => l.playerId === sub.out);
      const inLp = lu.find((l) => l.playerId === sub.in);
      if (!outLp || !inLp || !inLp.onField) return;
      outLp.onField = true;
      outLp.subbedOut = false;
      outLp.slotIdx = inLp.slotIdx;
      outLp.posOverride = inLp.posOverride;
      inLp.onField = false;
      inLp.subbedIn = false;
      inLp.slotIdx = undefined;
      inLp.posOverride = undefined;
      if (side === "home") m2.homeSubsLeft += 1;
      else m2.awaySubsLeft += 1;
      // apaga o evento de substituição lançado pelo makeSub
      const inName = pById[sub.in]?.name;
      for (let i = m2.events.length - 1; i >= 0; i--) {
        const e = m2.events[i];
        if (e.type === "sub" && e.side === side && e.playerName === inName) {
          m2.events.splice(i, 1);
          break;
        }
      }
      // desfaz a troca de id na ordem dos slots
      const order = side === "home" ? m2.homeSlotOrder : m2.awaySlotOrder;
      if (order) {
        const i = order.indexOf(sub.in);
        if (i >= 0) order[i] = sub.out;
        setSlotOrder([...order]);
        setStoreSlotOrder([...order]);
      }
    });
    setSessionSubs((prev) => prev.filter((s) => !(s.out === sub.out && s.in === sub.in)));
    setSelectedOutId(null);
    setSelectedInId(null);
    setSuggestion(null);
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
    // badge armado: o clique escolhe o novo capitão/cobrador e nada mais
    if (assignRole) {
      assignLiveRole(assignRole, id);
      return;
    }
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
  // Jogador que não coube no próprio setor (formação com menos vagas que
  // jogadores da posição) vai para qualquer vaga vazia de outra linha —
  // o campo nunca esconde quem está jogando.
  const overflow: { player: Player; energy: number }[] = [];
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
      } else {
        overflow.push({ player: ap.player, energy: ap.energy });
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
  // excedentes ocupam vagas vazias de outras linhas (nunca a do goleiro)
  for (const s of slots) {
    if (overflow.length === 0) break;
    if (s.player || s.pos === "GOL") continue;
    const ap = overflow.shift()!;
    s.player = ap.player;
    s.energy = ap.energy;
  }

  const MENT: { key: Mentality; label: string; icon: GameIconName | null; glyph?: string }[] = [
    { key: "defensivo", label: "Defensivo", icon: "shield" },
    { key: "equilibrado", label: "Equilibrado", icon: "balance" },
    { key: "ofensivo", label: "Ofensivo", icon: "offense" },
    { key: "tudo_ou_nada", label: "Tudo ou nada", icon: "allout" },
  ];

  const MARK: { key: Marking; label: string; icon: GameIconName | null; glyph?: string }[] = [
    { key: "leve", label: "Leve", icon: "light" },
    { key: "frouxa", label: "Frouxa", icon: null, glyph: "〰" },
    { key: "apertada", label: "Apertada", icon: "tight" },
    { key: "extrema", label: "Extrema", icon: "extreme" },
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
    // ancorado no topo (items-start): ao expandir "Ajustes", o conteúdo cresce
    // para baixo dentro do próprio scroll, sem reposicionar/pular o modal. O
    // pb-28 reserva espaço para o botão Jogar flutuante não ser coberto.
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-16 pb-28" onClick={closeAndResume}>
      <div
        className="max-h-[calc(100vh-11rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* cabeçalho AMPLIADO: minuto no topo e o CONFRONTO em destaque — nomes
            dos times grandes, na cor de cada clube, com o placar no centro. As
            ações (fechar, desfazer) ficam no canto superior direito. */}
        <div className="relative mb-4">
          <div className="mx-auto text-center">
            <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500">⏸ Parada tática — {match.minute}&#39;</h2>
            {/* confronto: cada nome grande na cor do time; o adversário
                sublinhado para destacar que é clicável (abre sua prancheta) */}
            <div className="mt-1.5 flex items-center justify-center gap-3">
              {([homeClub, awayClub] as const).map((c, idx) => {
                const isOpp = c.id !== game.userClubId;
                return (
                  <span key={c.id} className="contents">
                    <span
                      onClick={() => setInfoClub(c)}
                      className={`max-w-[38%] cursor-pointer truncate font-display text-xl font-black sm:text-2xl ${isOpp ? "underline decoration-2 underline-offset-4" : ""} hover:opacity-80${
                        isDarkColor(c.primaryColor) ? " rounded bg-zinc-200 px-1.5" : ""
                      }`}
                      style={{ color: c.primaryColor, textDecorationColor: c.primaryColor, textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                    >
                      {c.shortName}
                    </span>
                    {idx === 0 && (
                      <span className="shrink-0 rounded-md bg-zinc-800 px-2.5 py-1 font-mono text-lg font-black text-zinc-100 sm:text-xl">
                        {match.homeScore}-{match.awayScore}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="absolute right-0 top-0 flex shrink-0 items-center">
            {/* coluna: fechar (✕) em cima, desfazer (↺) abaixo */}
            <div className="flex flex-col items-center gap-2">
              {/* ✕: mesmo fluxo — sem alteração sai direto; com alteração pede confirmação */}
              <button
                onClick={closeAndResume}
                disabled={!hasKeeperOnField}
                className="px-1 text-lg font-bold leading-none text-zinc-400 hover:text-white disabled:opacity-45 disabled:cursor-not-allowed"
                title={hasKeeperOnField ? "Voltar ao jogo" : "Você precisa escalar um goleiro ou jogador de linha no gol!"}
              >
                ✕
              </button>
              {/* ↺: desfaz todas as alterações */}
              <button
                onClick={revertToSnapshot}
                disabled={!hasChanges()}
                className="px-1 text-lg font-bold leading-none text-zinc-400 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed"
                title="Desfaz todas as alterações feitas nesta parada"
              >
                ↺
              </button>
            </div>
          </div>
        </div>

        {/* ── 1. INFORMAÇÕES DO JOGO ── */}
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
                      <span className="inline-flex items-center gap-0.5">
                        {Array.from({ length: g.minutes.length }).map((_, k) => <GameIcon key={k} name="goal" size={11} />)}
                        <span className="ml-1 text-zinc-500">{g.minutes.map((m) => `${m}'`).join(" ")}</span>
                      </span>
                    </div>
                  ))}
                  {carded.map(({ p, lp }) => (
                    <div key={p.id} className="flex items-center justify-between">
                      <span className={lp.sentOff ? "text-zinc-500 line-through" : ""}>{p.name}</span>
                      <span className="inline-flex items-center gap-0.5">
                        {Array.from({ length: Math.min(lp.yellowsMatch, 2) }).map((_, k) => <GameIcon key={k} name="yellow" size={11} />)}
                        {lp.sentOff && <GameIcon name="red" size={11} />}
                      </span>
                    </div>
                  ))}
                  {subs.map((e, i) => (
                    <div key={i} className="flex items-center justify-between text-zinc-400">
                      <span className="inline-flex items-center gap-1"><GameIcon name="sub" size={11} /> {e.playerName}</span>
                      <span className="text-zinc-500">{e.minute}'</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

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
              {/* abreviações com a mesma largura/alinhamento das colunas de números */}
              <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
                <span className="w-10 text-right font-semibold">{homeClub.shortName}</span>
                <span className="inline-flex items-center gap-1 font-bold"><GameIcon name="stats" size={13} /> VOLUME DE JOGO</span>
                <span className="w-10 text-left font-semibold">{awayClub.shortName}</span>
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

        {/* botão para expandir/recolher a parte editável (subs/táticas/formação/
            prancheta): colapsada, a parada mostra só as informações do jogo */}
        <div className="mb-3 flex justify-center">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-200 shadow-sm hover:bg-zinc-700"
          >
            Ajustes
            <span className="text-[10px]">{expanded ? "▲" : "▼"}</span>
          </button>
        </div>

        {(expanded || !hasKeeperOnField) && (<>
        {/* ── 2. SUBSTITUIÇÕES: rápida e automática, mesma hierarquia ── */}
        <div className="mb-3 rounded-lg bg-zinc-800/60 px-3 py-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-400"><GameIcon name="sub" size={13} /> SUBSTITUIÇÕES</p>
            <span className="text-[11px] text-zinc-600">{subsLeft}/5 subs</span>
          </div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="w-20 shrink-0 text-[11px] font-semibold text-zinc-500">RÁPIDA</span>
            <button
              onClick={() => quickSub("energia")}
              disabled={subsLeft <= 0}
              className="rounded bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
              title="Troca o titular mais cansado pelo reserva mais descansado da mesma posição"
            >
              Energia
            </button>
            <button
              onClick={() => quickSub("posicao")}
              disabled={subsLeft <= 0}
              className="rounded bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
              title="Melhora o setor: entra o reserva mais forte que um titular da mesma posição"
            >
              Posição
            </button>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={tactics.autoSub ?? false}
            onClick={() => setTactic((t) => (t.autoSub = !t.autoSub))}
            title="No segundo tempo, troca sozinho jogadores esgotados por reservas descansados da mesma posição"
            className="flex w-full items-center gap-2 text-left"
          >
            <span className="w-20 shrink-0 text-[11px] font-semibold text-zinc-500">AUTOMÁTICA</span>
            <span
              className="relative inline-block h-3.5 w-7 shrink-0 rounded-full transition-colors"
              style={{ backgroundColor: (tactics.autoSub ?? false) ? "#0891b2" : "#3f3f46" }}
            >
              <span
                className="absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-transform"
                style={{ transform: (tactics.autoSub ?? false) ? "translateX(16px)" : "translateX(2px)" }}
              />
            </span>
          </button>

        {/* substituições feitas nesta parada: canceláveis uma a uma antes de retomar */}
        {sessionSubs.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            {sessionSubs.map((s) => (
              <div
                key={`${s.out}-${s.in}`}
                className="flex items-center justify-between rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300"
              >
                <span className="min-w-0 truncate">
                  <span className="text-red-400">▼</span> {pById[s.out]?.name}{" "}
                  <span className="text-zinc-500">→</span>{" "}
                  <span className="text-emerald-400">▲</span> {pById[s.in]?.name}
                </span>
                <button
                  onClick={() => cancelSub(s)}
                  className="ml-2 shrink-0 rounded bg-zinc-700 px-2 py-0.5 text-[10px] font-semibold text-zinc-200 hover:bg-red-800"
                  title="Cancela esta substituição: devolve a troca e o jogador volta ao campo"
                >
                  Cancelar
                </button>
              </div>
            ))}
          </div>
        )}

        {/* sugestão pendente: mostra a troca e espera confirmação */}
        {suggestion && (() => {
          const outP = pById[suggestion.out];
          const inP = pById[suggestion.in];
          const outLp = lineup.find((l) => l.playerId === suggestion.out);
          const inLp = lineup.find((l) => l.playerId === suggestion.in);
          const outEnergy = outLp ? Math.round(outLp.energy) : outP.energy;
          const inEnergy = inLp ? Math.round(inLp.energy) : inP.energy;
          // nome comprido abrevia priorizando o sobrenome ("R. Nascimento"); a
          // posição é informação obrigatória e nunca pode ser cortada pelo truncate
          const firstName = (n: string) => {
            const parts = n.trim().split(/\s+/);
            if (parts.length < 2 || n.length <= 14) return n;
            return `${parts[0][0]}. ${parts[parts.length - 1]}`;
          };
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
        </div>

        {/* atalho: mentalidade e marcação em badges compactos — o estado completo
            (com rótulos) segue na seção MENTALIDADE/MARCAÇÃO no fim do modal.
            Cor do selecionado é gradual pela intensidade: verde (mais cauteloso)
            → vermelho (mais agressivo/arriscado), 4 passos. */}
        <div className="mb-3 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1" title="Mentalidade">
            {MENT.map((m, i) => (
              <button
                key={m.key}
                onClick={() => setTactic((t) => (t.mentality = m.key))}
                title={m.label}
                style={tactics.mentality === m.key ? { background: INTENSITY_COLORS[i] } : undefined}
                className={`flex flex-1 items-center justify-center rounded px-1 py-1.5 text-center text-sm leading-none ${
                  tactics.mentality === m.key ? "" : "bg-zinc-800/60 hover:bg-zinc-700"
                }`}
              >
                {m.icon ? <GameIcon name={m.icon} size={18} className="[filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.7))]" /> : m.glyph}
              </button>
            ))}
          </div>
          <span className="h-6 w-px shrink-0 bg-zinc-700" />
          <div className="flex flex-1 items-center gap-1" title="Marcação">
            {MARK.map((m, i) => (
              <button
                key={m.key}
                onClick={() => setTactic((t) => (t.marking = m.key))}
                title={m.label}
                style={tactics.marking === m.key ? { background: INTENSITY_COLORS[i] } : undefined}
                className={`flex flex-1 items-center justify-center rounded px-1 py-1.5 text-center text-sm leading-none ${
                  tactics.marking === m.key ? "" : "bg-zinc-800/60 hover:bg-zinc-700"
                }`}
              >
                {m.icon ? <GameIcon name={m.icon} size={18} className="[filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.7))]" /> : m.glyph}
              </button>
            ))}
          </div>
        </div>

        {/* truculência e catimba lado a lado, logo abaixo dos badges */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Toggle
            checked={tactics.truculencia}
            onChange={() => setTactic((t) => (t.truculencia = !t.truculencia))}
            label={<span className="inline-flex items-center gap-1"><GameIcon name="aggression" size={15} /> Truculência</span>}
            color="#b91c1c"
            hint="Bônus pesado de desarme, mas 3× mais cartões"
          />
          <Toggle
            checked={tactics.cera}
            onChange={() => setTactic((t) => (t.cera = !t.cera))}
            label={<span className="inline-flex items-center gap-1"><GameIcon name="wasting" size={15} /> Catimba</span>}
            color="#b45309"
            hint="Trava o ritmo do jogo; cede um pouco de volume e arrisca cartões"
          />
        </div>

        {/* ── 3. FORMAÇÃO ── */}
        <div className="mb-4">
          <div className="flex gap-2 flex-wrap">
            {(["4-4-2", "4-3-3", "3-5-2", "4-5-1", "5-3-2", "3-4-3", "3-3-4"] as const).map((f) => (
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

        {!hasKeeperOnField && (
          <p className="mb-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-950 px-3 py-2 text-xs text-red-400 font-semibold border border-red-800/80 animate-pulse text-center">
            <GameIcon name="siren" size={14} /> Você está sem goleiro!
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
                  penaltyTaker={s.player.id === livePenaltyTakerId}
                  captain={s.player.id === liveCaptainId}
                  armedRole={assignRole}
                  onRoleClick={armRole}
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
              <button
                onClick={() => setStartersOpen((v) => !v)}
                className="mb-1 flex w-full items-center gap-1 text-xs font-bold text-zinc-500 hover:text-zinc-300"
              >
                <span className="text-[9px]">{startersOpen ? "▼" : "▶"}</span>
                TITULARES EM CAMPO <span className="font-normal text-zinc-600">({onField.length})</span>
              </button>
              {startersOpen && (
              <div className="pr-1">
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
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <span className="truncate">
                          <span className="tabular-nums text-zinc-500">{p.number}</span> {p.pos} {p.name} ({p.strength}){" "}
                          <span className={p.foot === "canhoto" ? "text-red-500" : "text-sky-400"}>{p.foot === "canhoto" ? "◀" : "▶"}</span>
                          {l.subbedIn && <span className="ml-1 font-bold text-emerald-400" title="Entrou na substituição">▲</span>}
                        </span>
                        <RoleBadges
                          penalty={l.playerId === livePenaltyTakerId}
                          captain={l.playerId === liveCaptainId}
                          armed={assignRole}
                          onPick={armRole}
                        />
                      </span>
                      <EnergyBar value={l.energy} />
                    </button>
                  );
                })}
              </div>
              )}
            </div>

            <div>
              <button
                onClick={() => setBenchOpen((v) => !v)}
                className="mb-1 flex w-full items-center gap-1 text-xs font-bold text-zinc-500 hover:text-zinc-300"
              >
                <span className="text-[9px]">{benchOpen ? "▼" : "▶"}</span>
                BANCO (RESERVAS) <span className="font-normal text-zinc-600">· {subsLeft}/5 subs</span>
              </button>
              {benchOpen && (
              <div className="pr-1">
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
                        <span className="ml-1 inline-flex align-middle" title="Substituído: já saiu de campo"><GameIcon name="sub" size={11} /></span>
                      </span>
                      <EnergyBar value={l.energy} />
                    </div>
                  );
                })}
                {bench.length === 0 && lineup.every((l) => !l.subbedOut) && (
                  <p className="text-xs text-zinc-500">Banco vazio.</p>
                )}
              </div>
              )}
            </div>
          </div>
        </div>
        </>)}

        {/* prancheta do clube por cima da parada tática: mostra os titulares na
            forma que está jogando e o banco; fechar volta para cá com o jogo pausado */}
        {infoClub && (() => {
          const boardSide = infoClub.id === match.homeId ? "home" : "away";
          const boardLineup = boardSide === "home" ? match.homeLineup : match.awayLineup;
          const boardTactics = boardSide === "home" ? match.homeTactics : match.awayTactics;
          const boardSquad = game.players.filter((p) => p.clubId === infoClub.id);
          return (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
              onClick={() => setInfoClub(null)}
            >
              <ScrollLock />
              <div
                className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-zinc-300">Prancheta</h3>
                  <button onClick={() => setInfoClub(null)} className="text-zinc-400 hover:text-white text-lg font-bold leading-none">✕</button>
                </div>
                <ClubBoard club={infoClub} squad={boardSquad} lineup={boardLineup} mentality={boardTactics.mentality} />
              </div>
            </div>
          );
        })()}
      </div>

      {/* Botão flutuante padrão (canto inferior direito, arrastável): aqui na parada
          tática ele retoma o jogo. É o MESMO botão do ao vivo/home, na mesma posição.
          Escondido enquanto a prancheta de um clube está aberta por cima. */}
      {!infoClub && (
        <div
          ref={(el) => (fabRef.current = el)}
          className="fixed bottom-6 right-5 z-[55]"
          style={{ transform: `translate(${fabPos.dx}px, ${fabPos.dy}px)` }}
        >
          <button
            onPointerDown={onFabDown}
            onPointerMove={onFabMove}
            onPointerUp={(e) => { e.stopPropagation(); if (fabTapEnded()) closeAndResume(); }}
            onPointerCancel={() => fabTapEnded()}
            disabled={!hasKeeperOnField}
            style={{ touchAction: "none" }}
            className="btn-live btn-live--play flex h-16 w-16 touch-none items-center justify-center !rounded-full text-2xl shadow-lg shadow-black/50 disabled:cursor-not-allowed disabled:opacity-40"
            title={hasKeeperOnField ? "Voltar ao jogo (segure para mover)" : "Você precisa escalar um goleiro ou jogador de linha no gol!"}
          >
            ▶
          </button>
        </div>
      )}
    </div>
  );
}
