import { useEffect, useRef, useState } from "react";
import { useStore, bichoCost, BICHO_LEVELS, nextPlayableWeek } from "../store";
import { bestXI, bestXIByPosition, DEFAULT_TACTICS } from "../game/engine";
import { groupFixturesForMatchday, tiesForLeg, weekInfo } from "../game/cup";
import type { Formation, Marking, Mentality, Player, Position } from "../types";
import { FORMATIONS } from "../types";
import { pitchLayout, PlayerPin, EmptySlot, PitchBackground } from "./PitchField";
import { readableOn } from "../game/color";
import EnergyBar from "./EnergyBar";
import { appAlert } from "./AppDialog";
import FormationEditorModal from "./FormationEditorModal";

const TIER_BADGE: Record<string, string> = {
  bagre: "", bom: "★", craque: "★★", extra: "★★★",
};
const POS_ORDER = { GOL: 0, DEF: 1, MEI: 2, ATA: 3 } as const;

const sectorAvg = (squad: Player[], pos: Position) => {
  const ps = squad.filter((p) => p.pos === pos);
  return ps.length
    ? (ps.reduce((s, p) => s + p.strength, 0) / ps.length).toFixed(1)
    : "-";
};
const POS_KEYS = ["GOL", "DEF", "MEI", "ATA"] as const;

function PlayerDetails({ p }: { p: Player }) {
  return (
    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 rounded bg-black/30 px-2 py-1.5 text-[11px] text-zinc-300">
      <span>Idade: <b>{p.age}</b></span>
      <span>Pé: <b className="capitalize">{p.foot}</b></span>
      <span>Energia: <b className={p.energy < 60 ? "text-red-400" : "text-emerald-400"}>{p.energy}%</b></span>
      <span>Gols: <b>{p.goals}</b></span>
      <span>Assist.: <b>{p.assists}</b></span>
      <span>Amarelos: <b>{p.yellows}</b></span>
      <span>Vermelhos: <b>{p.reds}</b></span>
      {(p.injuryWeeks ?? 0) > 0 && (
        <span className="col-span-2 text-orange-400">
          🚑 Lesionado: volta em {p.injuryWeeks} rodada{(p.injuryWeeks ?? 0) > 1 ? "s" : ""}
        </span>
      )}
      <span className="col-span-2">
        Características: {p.traits.length ? p.traits.join(", ") : "—"}
      </span>
      <span className="col-span-2">Valor: ${(p.value / 1e6).toFixed(2)}M</span>
    </div>
  );
}

function PlayerRow({
  p, selected, selColor, onClick, expanded, onToggleExpand, suspendedNext,
}: {
  p: Player; selected: boolean; selColor: string; onClick: () => void;
  expanded: boolean; onToggleExpand: () => void; suspendedNext: boolean;
}) {
  const injured = (p.injuryWeeks ?? 0) > 0;
  return (
    <div className="mb-0.5">
      <button
        onClick={onClick}
        style={selected ? { background: selColor, color: readableOn(selColor) } : undefined}
        className={`flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left text-[11px] leading-tight ${
          selected ? "" : "bg-zinc-800 hover:bg-zinc-700"
        }`}
      >
        <span className="flex min-w-0 items-center gap-1">
          <span className={`w-4 shrink-0 text-right tabular-nums ${selected ? "opacity-70" : "text-zinc-500"}`}>{p.number}</span>
          <b className={`shrink-0 ${selected ? "opacity-70" : "text-zinc-400"}`}>{p.pos}</b>
          {/* nome corta seco (sem "…") para a estrelinha ao lado nunca sumir */}
          <span className={`overflow-hidden whitespace-nowrap [text-overflow:clip] ${suspendedNext || injured ? "text-zinc-500 line-through" : ""}`}>{p.name}</span>
          <span className="shrink-0 text-amber-400">{TIER_BADGE[p.tier]}</span>
          {suspendedNext && <span className="shrink-0 text-[9px] font-bold text-red-400">SUSP</span>}
          {injured && <span className="shrink-0 text-[9px] font-bold text-orange-400" title={`Lesionado: volta em ${p.injuryWeeks} rodada${(p.injuryWeeks ?? 0) > 1 ? "s" : ""}`}>LES</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <EnergyBar value={p.energy} />
          <b>{p.strength}</b>
          <span
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
            className={`cursor-pointer ${selected ? "opacity-70" : "text-zinc-500"} hover:text-white`}
          >
            {expanded ? "▲" : "▼"}
          </span>
        </span>
      </button>
      {expanded && <PlayerDetails p={p} />}
    </div>
  );
}

// Botão compacto on/off com ícone de estado, no lugar do Toggle (que ocupa
// muito espaço) — usado nos extras da prancheta (Agressividade, Catimba etc.)
function ToggleBtn({
  checked, onClick, label, disabled,
}: { checked: boolean; onClick: () => void; label: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-1.5 rounded bg-zinc-800 px-2 py-1 text-left text-[11px] hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className={`shrink-0 ${checked ? "text-emerald-400" : "text-zinc-600"}`}>●</span>
    </button>
  );
}

const MENT: { key: Mentality; label: string }[] = [
  { key: "defensivo", label: "Defensivo" },
  { key: "equilibrado", label: "Equilibrado" },
  { key: "ofensivo", label: "Ofensivo" },
  { key: "tudo_ou_nada", label: "Tudo ou nada" },
];

const MARK: { key: Marking; label: string }[] = [
  { key: "leve", label: "Leve" },
  { key: "frouxa", label: "Frouxa" },
  { key: "apertada", label: "Apertada" },
  { key: "extrema", label: "Extrema" },
];

export default function TacticsBoard() {
  const game = useStore((s) => s.game);
  const setStarters = useStore((s) => s.setStarters);
  const setSlotOrder = useStore((s) => s.setSlotOrder);
  const setFormation = useStore((s) => s.setFormation);
  const setCustomFormation = useStore((s) => s.setCustomFormation);
  const setDefaultTactics = useStore((s) => s.setDefaultTactics);
  const payBicho = useStore((s) => s.payBicho);
  const [sel, setSel] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scaleBy, setScaleBy] = useState<"forca" | "posicao" | "energia">("forca");
  const byEnergy = scaleBy === "energia";

  // O campo (prancheta) deve terminar exatamente na última linha dos titulares.
  // Medimos a posição real da lista de titulares e aplicamos a altura ao campo,
  // em vez de chutar proporções CSS — funciona com qualquer fonte/zoom/nº de linhas.
  const pitchRef = useRef<HTMLDivElement | null>(null);
  const titularesListRef = useRef<HTMLDivElement | null>(null);
  const [pitchHeight, setPitchHeight] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => {
      const pitch = pitchRef.current;
      const list = titularesListRef.current;
      if (!pitch || !list) return;
      const h = Math.round(list.getBoundingClientRect().bottom - pitch.getBoundingClientRect().top);
      if (h > 100) setPitchHeight(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (titularesListRef.current) ro.observe(titularesListRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  });
  const [editorOpen, setEditorOpen] = useState(false);
  // Resetar zera starters para montagem manual: enquanto o time tiver menos de
  // 11, mostramos o campo vazio em vez de cair automaticamente no melhor time.
  const [manualMode, setManualMode] = useState(false);
  if (!game) return null;

  const tactics = game.defaultTactics ?? DEFAULT_TACTICS;

  // suspensão é por competição: descobre se o próximo jogo do usuário é copa ou liga
  const nextWeek = nextPlayableWeek(game);
  const nextInfo = nextWeek !== null ? weekInfo(nextWeek) : null;
  const nextCompetition = !nextInfo ? "league"
    : nextInfo.type === "league" ? "league"
    : (nextInfo.type === "continental" || nextInfo.type === "contgroup") ? "continental"
    : "cup";
  const isSuspendedNext = (p: Player) => {
    if (nextCompetition === "league") return p.suspendedLeague;
    if (nextCompetition === "cup") return p.suspendedCup;
    return p.suspendedContinental ?? false;
  };

  const squad = game.players.filter((p) => p.clubId === game.userClubId);
  const userClub = game.clubs.find((c) => c.id === game.userClubId)!;
  const kit = { bg: userClub.primaryColor, border: userClub.secondaryColor };
  const formation = game.formation ?? "4-4-2";
  const custom = game.customFormation;
  const savedStarters = game.starters ?? [];
  const hasFullXI = savedStarters.length >= 11;
  const starters = savedStarters;
  const titulares = squad
    .filter((p) => starters.includes(p.id))
    .sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.strength - a.strength);
  const reservas = squad
    .filter((p) => !starters.includes(p.id))
    .sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.strength - a.strength);

  // Jogadores de cada posição na ordem em que ocupam os slots do desenho.
  // Usa a ordem manual salva (slotOrder) quando ela cobre exatamente os mesmos
  // jogadores da posição; senão cai no ordenamento automático por força.
  const posPlayers: Record<Position, Player[]> = { GOL: [], DEF: [], MEI: [], ATA: [] };
  POS_KEYS.forEach((posKey) => {
    const byForce = titulares
      .filter((p) => p.pos === posKey)
      .sort((a, b) => b.strength - a.strength);
    const manual = (game.slotOrder ?? [])
      .map((id) => titulares.find((p) => p.id === id))
      .filter((p): p is Player => !!p && p.pos === posKey);
    posPlayers[posKey] =
      manual.length === byForce.length &&
      manual.every((p) => byForce.some((b) => b.id === p.id))
        ? manual
        : byForce;
  });

  const layout = pitchLayout(formation, custom);
  const slots: { pos: Position; slotIdx: number; x: number; y: number; player?: Player }[] = [];
  POS_KEYS.forEach((posKey) => {
    layout[posKey].forEach((coord, i) => {
      slots.push({ pos: posKey, slotIdx: i, ...coord, player: posPlayers[posKey][i] });
    });
  });
  // Titular sem slot da própria posição (escalado fora de posição por falta de
  // opção) ocupa uma vaga vazia de outra linha — o campo nunca esconde titular.
  const placedIds = new Set(slots.filter((s) => s.player).map((s) => s.player!.id));
  const unplaced = titulares.filter((p) => !placedIds.has(p.id));
  for (const s of slots) {
    if (s.player || unplaced.length === 0) continue;
    s.player = unplaced.shift();
  }

  // ordem completa dos slots (GOL→DEF→MEI→ATA), base de qualquer troca
  const flatOrder = (pp: Record<Position, Player[]>) =>
    POS_KEYS.flatMap((k) => pp[k].map((p) => p.id));

  // Clique em jogador (pin do campo ou linha da lista). Regra única:
  // troca só entre jogadores da MESMA posição; quem entra assume exatamente
  // o slot de quem sai. Clique em posição diferente apenas move a seleção.
  const clickPlayer = (id: string) => {
    if (!sel) { setSel(id); return; }
    if (sel === id) { setSel(null); return; }
    const a = squad.find((p) => p.id === sel);
    const b = squad.find((p) => p.id === id);
    if (!a || !b || a.pos !== b.pos) { setSel(id); return; }
    const aStarter = starters.includes(a.id);
    const bStarter = starters.includes(b.id);
    if (aStarter && bStarter) {
      // dois titulares: trocam de lugar no desenho
      const arr = posPlayers[a.pos].map((p) => p.id);
      const ia = arr.indexOf(a.id);
      const ib = arr.indexOf(b.id);
      [arr[ia], arr[ib]] = [arr[ib], arr[ia]];
      setSlotOrder(flatOrder({ ...posPlayers, [a.pos]: arr.map((x) => squad.find((p) => p.id === x)!) }));
    } else if (aStarter !== bStarter) {
      // titular ↔ reserva: o reserva entra no slot exato do titular
      const starterId = aStarter ? a.id : b.id;
      const benchId = aStarter ? b.id : a.id;
      const arr = posPlayers[a.pos].map((p) => p.id === starterId ? benchId : p.id);
      setStarters(starters.map((s) => (s === starterId ? benchId : s)));
      setSlotOrder(flatOrder({ ...posPlayers, [a.pos]: arr.map((x) => squad.find((p) => p.id === x)!) }));
    } else {
      // dois reservas: nada a trocar, move a seleção
      setSel(id);
      return;
    }
    setSel(null);
  };

  // Slot vazio: o reserva selecionado (da posição certa) entra exatamente ali.
  const clickEmptySlot = (posKey: Position, slotIdx: number) => {
    if (!sel || starters.includes(sel)) { setSel(null); return; }
    const benchPlayer = squad.find((p) => p.id === sel);
    if (!benchPlayer || benchPlayer.pos !== posKey) return;
    const arr = [...posPlayers[posKey]];
    arr.splice(Math.min(slotIdx, arr.length), 0, benchPlayer);
    setStarters([...starters, sel]);
    setSlotOrder(flatOrder({ ...posPlayers, [posKey]: arr }));
    setSel(null);
  };

  const toggleExpand = (id: string) => setExpanded(expanded === id ? null : id);

  // Próximo confronto DO USUÁRIO: varre as semanas à frente até achar um jogo
  // com o time do técnico — rodada de copa sem o clube não desativa o botão,
  // ele passa a mirar o jogo seguinte que o usuário de fato vai disputar.
  const uid = game.userClubId;
  const nextUserMatch = (() => {
    if (nextWeek === null) return undefined;
    for (let w = nextWeek; w < nextWeek + 50; w++) {
      const info = weekInfo(w);
      const pair =
        info.type === "cup" && game.cup
          ? tiesForLeg(game.cup, info.stage, info.leg).find((t) => t.homeId === uid || t.awayId === uid)
          : info.type === "contgroup" && game.continental
            ? groupFixturesForMatchday(game.continental, info.matchday).find((f) => f.homeId === uid || f.awayId === uid)
            : info.type === "continental" && game.continental
              ? tiesForLeg(game.continental, info.stage, info.leg).find((t) => t.homeId === uid || t.awayId === uid)
              : game.fixtures.find((f) => f.week === w && !f.played && (f.homeId === uid || f.awayId === uid));
      if (pair) {
        const competition: "league" | "cup" | "continental" =
          info.type === "league" ? "league"
          : (info.type === "continental" || info.type === "contgroup") ? "continental"
          : "cup";
        return { pair, competition };
      }
    }
    return undefined;
  })();
  const nextPair = nextUserMatch?.pair;
  const opponent = nextPair
    ? game.clubs.find((c) => c.id === (nextPair.homeId === uid ? nextPair.awayId : nextPair.homeId))
    : undefined;
  const isHome = nextPair?.homeId === uid;

  // Monta tudo (formação, escalação, mentalidade e marcação) a partir das
  // informações públicas do adversário: força do top-11, médias por setor e mando.
  const scaleForOpponent = () => {
    if (!opponent) { appAlert("Sem próximo adversário definido."); return; }
    const oppSquad = game.players.filter((p) => p.clubId === opponent.id);
    const top11Avg = (ps: Player[]) => {
      const top = [...ps].sort((a, b) => b.strength - a.strength).slice(0, 11);
      return top.length ? top.reduce((s, p) => s + p.strength, 0) / top.length : 0;
    };
    const num = (s: string) => (s === "-" ? 0 : Number(s));
    // diferença de força com bônus/pênalti de mando de campo
    const diff = top11Avg(squad) - top11Avg(oppSquad) + (isHome ? 1.5 : -1.5);
    const oppAtk = num(sectorAvg(oppSquad, "ATA"));
    const oppMid = num(sectorAvg(oppSquad, "MEI"));
    const myDef = num(sectorAvg(squad, "DEF"));

    // formação: vantagem clara ataca, desvantagem clara fecha; no equilíbrio,
    // reforça o setor onde o adversário é mais forte
    const prefs: Exclude<Formation, "custom">[] =
      diff >= 3 ? ["4-3-3", "3-4-3", "4-4-2"]
      : diff >= 1 ? ["4-3-3", "4-4-2", "4-5-1"]
      : diff > -1 ? (oppMid > oppAtk ? ["3-5-2", "4-4-2", "4-5-1"] : ["4-4-2", "4-5-1", "5-3-2"])
      : diff > -3 ? ["4-5-1", "5-3-2", "4-4-2"]
      : ["5-3-2", "4-5-1", "4-4-2"];
    // só usa formação que o elenco disponível (sem suspensos) consegue preencher
    const canFill = (f: Exclude<Formation, "custom">) => {
      const shape = FORMATIONS[f];
      const count = (pos: Position) => squad.filter((p) => p.pos === pos && !isSuspendedNext(p) && !((p.injuryWeeks ?? 0) > 0)).length;
      return count("GOL") >= 1 && count("DEF") >= shape.DEF && count("MEI") >= shape.MEI && count("ATA") >= shape.ATA;
    };
    const chosen = prefs.find(canFill) ?? "4-4-2";

    const mentality: Mentality = diff >= 3 ? "ofensivo" : diff > -2 ? "equilibrado" : "defensivo";
    // Marcação pré-jogo nunca é "extrema": ela drena 1,9× de energia e é
    // insustentável por 90 minutos — é arma de reta final, não de escalação.
    // "apertada" (1,3×) só quando o ataque deles ameaça de verdade E o elenco
    // tem perna (energia média alta); dominando o jogo, "leve" poupa o time.
    const avgEnergy = (() => {
      const xi = bestXI(squad, chosen, false, nextCompetition, undefined)
        .map((id) => squad.find((p) => p.id === id)!)
        .filter(Boolean);
      return xi.length ? xi.reduce((s, p) => s + p.energy, 0) / xi.length : 100;
    })();
    const marking: Marking =
      diff >= 2 ? "leve"
      : oppAtk - myDef >= 2 && diff < 0 && avgEnergy >= 70 ? "apertada"
      : "frouxa";

    setFormation(chosen);
    setDefaultTactics({ mentality, marking });
    setStarters(bestXI(squad, chosen, false, nextUserMatch?.competition ?? nextCompetition, undefined));
    setManualMode(false);
    setSel(null);
    appAlert(
      `Contra ${opponent.name} (${isHome ? "em casa" : "fora"}): ${chosen}, ` +
      `${MENT.find((m) => m.key === mentality)!.label.toLowerCase()}, marcação ${MARK.find((m) => m.key === marking)!.label.toLowerCase()}.`,
    );
  };

  const ideal = bestXI(squad, formation, byEnergy, "league", custom);
  const isBestActive =
    starters.length === ideal.length && ideal.every((id) => starters.includes(id));

  const emptySlots = slots.filter((s) => !s.player);
  // Preenche só as vagas vazias com o melhor reserva disponível de cada posição,
  // mantendo quem já está escalado — diferente de "Escalar por", que recalcula o time todo.
  const fillEmptySlots = () => {
    const nextPosPlayers = { ...posPlayers };
    const addedIds: string[] = [];
    POS_KEYS.forEach((posKey) => {
      const need = layout[posKey].length - nextPosPlayers[posKey].length;
      if (need <= 0) return;
      const bench = squad
        .filter((p) => p.pos === posKey && !starters.includes(p.id) && !addedIds.includes(p.id) && !((p.injuryWeeks ?? 0) > 0))
        .sort((a, b) => b.strength - a.strength)
        .slice(0, need);
      nextPosPlayers[posKey] = [...nextPosPlayers[posKey], ...bench];
      addedIds.push(...bench.map((p) => p.id));
    });
    // Ainda faltam vagas (posição sem reserva disponível): completa com os
    // melhores reservas de qualquer posição, para nunca ficar com menos de 11.
    const missing = slots.length - starters.length - addedIds.length;
    if (missing > 0) {
      const extras = squad
        .filter((p) => !starters.includes(p.id) && !addedIds.includes(p.id))
        .sort((a, b) => b.strength - a.strength)
        .slice(0, missing);
      addedIds.push(...extras.map((p) => p.id));
      extras.forEach((p) => nextPosPlayers[p.pos] = [...nextPosPlayers[p.pos], p]);
    }
    if (addedIds.length === 0) return;
    setStarters([...starters, ...addedIds]);
    setSlotOrder(flatOrder(nextPosPlayers));
  };

  // lista de reservas renderizada em dois lugares: coluna direita (desktop) e
  // largura total abaixo da prancheta (mobile)
  const reservasBlock = (
    <>
      <p className="mb-1 text-xs font-bold text-zinc-500">
        RESERVAS ({reservas.length})
      </p>
      <div>
        {reservas.map((p) => (
          <PlayerRow
            key={p.id}
            p={p}
            selected={sel === p.id}
            selColor="#3f3f46"
            onClick={() => clickPlayer(p.id)}
            expanded={expanded === p.id}
            onToggleExpand={() => toggleExpand(p.id)}
            suspendedNext={isSuspendedNext(p)}
          />
        ))}
      </div>
    </>
  );

  return (
    <>
    <div className="flex flex-row items-start gap-3">
      {/* Prancheta à esquerda: campo mais alto para terminar na altura do último titular. */}
      <div className="flex w-[42%] shrink-0 flex-col sm:w-48">
        <p className="ui-label mb-1">Formação</p>
        <div ref={pitchRef} style={pitchHeight ? { height: pitchHeight } : undefined}>
        <PitchBackground fill className={`relative w-full overflow-hidden rounded ${pitchHeight ? "h-full" : "aspect-[3/5]"}`}>
          {slots.map((s, i) =>
            s.player ? (
              <PlayerPin
                key={s.player.id}
                p={s.player}
                x={s.x}
                y={s.y}
                colors={kit}
                compact
                selected={sel === s.player.id}
                onClick={() => clickPlayer(s.player!.id)}
              />
            ) : (
              <EmptySlot
                key={i}
                x={s.x}
                y={s.y}
                label={s.pos}
                compact
                pulse={!!sel && !starters.includes(sel) && squad.find((p) => p.id === sel)?.pos === s.pos}
                onClick={() => clickEmptySlot(s.pos, s.slotIdx)}
              />
            ),
          )}
        </PitchBackground>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-1">
          {(Object.keys(FORMATIONS) as Formation[]).map((f) => (
            <button
              key={f}
              onClick={() => setFormation(f)}
              className={`whitespace-nowrap rounded px-1 py-1 text-[11px] ${
                formation === f ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
              }`}
            >
              {f}
            </button>
          ))}
          <button
            onClick={() => setEditorOpen(true)}
            className={`whitespace-nowrap rounded px-1 py-1 text-[11px] ${
              formation === "custom" ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
            }`}
            title="Criar ou editar sua própria formação"
          >
            {formation === "custom" ? "Editar" : "+ Criar"}
          </button>
          <button
            onClick={() => { setStarters([]); setSel(null); setManualMode(true); }}
            title="Esvazia a escalação para montar o time manualmente"
            className="whitespace-nowrap rounded bg-zinc-800 px-1 py-1 text-[11px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
          >
            Resetar
          </button>
        </div>

        {editorOpen && (
          <FormationEditorModal
            initial={custom}
            onClose={() => setEditorOpen(false)}
            onSave={(f) => {
              setCustomFormation(f);
              setFormation("custom", f);
              setEditorOpen(false);
            }}
          />
        )}

        <div className="mt-4">
          <p className="ui-label mb-1">Escalar por</p>
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                setScaleBy("forca");
                setStarters(bestXI(squad, formation, false, "league", custom));
                setManualMode(false);
              }}
              className={`flex-1 whitespace-nowrap rounded px-1 py-1 text-[11px] ${
                scaleBy === "forca" && isBestActive ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
              }`}
            >
              Força
            </button>
            <button
              onClick={() => {
                setScaleBy("posicao");
                const { starters, slotOrder } = bestXIByPosition(squad, formation, "league", custom);
                setStarters(starters);
                setSlotOrder(slotOrder);
                setManualMode(false);
              }}
              className={`flex-1 whitespace-nowrap rounded px-1 py-1 text-[11px] ${
                scaleBy === "posicao" && isBestActive ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
              }`}
            >
              Posição
            </button>
            <button
              onClick={() => {
                setScaleBy("energia");
                setStarters(bestXI(squad, formation, true, "league", custom));
                setManualMode(false);
              }}
              className={`flex-1 whitespace-nowrap rounded px-1 py-1 text-[11px] ${
                scaleBy === "energia" && isBestActive ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
              }`}
            >
              Energia
            </button>
          </div>
          <button
            onClick={scaleForOpponent}
            disabled={!opponent}
            title="Escolhe formação, escalação, mentalidade e marcação com base na força pública do próximo adversário e no mando de campo"
            className="mt-1 w-full rounded bg-zinc-900 px-2 py-1 text-[11px] text-sky-300 hover:bg-zinc-800 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Por adversário
          </button>
          {emptySlots.length > 0 && (
            <button
              onClick={fillEmptySlots}
              className="mt-1 w-full rounded bg-amber-900/40 px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-900/60"
            >
              Preencher vagas ({emptySlots.length})
            </button>
          )}
        </div>

        <div className="mt-2">
          <p className="ui-label mb-1">Força por setor</p>
          <div className="grid grid-cols-2 gap-1">
            {POS_KEYS.map((s) => (
              <div key={s} className="flex items-center justify-between rounded bg-zinc-800 px-2 py-1 text-[11px]">
                <span className="text-zinc-400">{s}</span>
                <b className="text-amber-400">{sectorAvg(titulares, s)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ao lado: titulares, depois mentalidade + marcação/extras */}
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-bold text-zinc-300">
          TITULARES ({titulares.length})
        </p>
        <div ref={titularesListRef} className="mb-4">
          {titulares.map((p) => (
            <PlayerRow
              key={p.id}
              p={p}
              selected={sel === p.id}
              selColor="#3f3f46"
              onClick={() => clickPlayer(p.id)}
              expanded={expanded === p.id}
              onToggleExpand={() => toggleExpand(p.id)}
              suspendedNext={isSuspendedNext(p)}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <div className="min-w-0">
            <p className="ui-label mb-1">Mentalidade</p>
            <div className="flex flex-col gap-1">
              {MENT.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setDefaultTactics({ mentality: m.key })}
                  className={`rounded px-2 py-1 text-left text-[11px] ${
                    tactics.mentality === m.key ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            
            <p className="ui-label mb-1 mt-5">Extras</p>
            <div className="flex flex-col gap-1">
              <ToggleBtn
                checked={tactics.truculencia}
                onClick={() => setDefaultTactics({ truculencia: !tactics.truculencia })}
                label="Agressividade"
              />
              <ToggleBtn
                checked={tactics.cera}
                onClick={() => setDefaultTactics({ cera: !tactics.cera })}
                label="Catimba"
              />
              <ToggleBtn
                checked={tactics.autoSub ?? false}
                onClick={() => setDefaultTactics({ autoSub: !tactics.autoSub })}
                label="Sub. automática"
              />
            </div>
          </div>

          <div className="min-w-0">
            <p className="ui-label mb-1">Marcação</p>
            <div className="flex flex-col gap-1">
              {MARK.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setDefaultTactics({ marking: m.key })}
                  className={`rounded px-2 py-1 text-left text-[11px] ${
                    tactics.marking === m.key ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <p className="ui-label mb-1 mt-5">Bicho</p>
            <div className="flex flex-col gap-1">
              {BICHO_LEVELS.map((lvl) => {
                const cost = Math.round(bichoCost(userClub.baseBudget) * lvl.costMult);
                const paidThis = tactics.bicho && (tactics.bichoPct ?? 10) === lvl.pct;
                return (
                  <button
                    key={lvl.key}
                    onClick={() => {
                      if (tactics.bicho) return; // dinheiro pago não volta
                      if (!payBicho(lvl)) appAlert("Orçamento insuficiente para pagar o bicho.");
                    }}
                    disabled={tactics.bicho ? !paidThis : game.budget < cost}
                    className={`flex w-full min-w-0 items-center justify-between gap-1 rounded px-2 py-1 text-left text-[11px] disabled:cursor-not-allowed disabled:opacity-40 ${
                      paidThis ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
                    }`}
                    title={`+${lvl.pct}% de motivação no ataque nesta partida`}
                  >
                    <span className="truncate">{lvl.label} <span className={paidThis ? "opacity-80" : "text-zinc-400"}>+{lvl.pct}%</span></span>
                    <span className={`shrink-0 ${paidThis ? "opacity-80" : "text-zinc-400"}`}>
                      ${(cost / 1e6).toFixed(2)}M
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Reservas no desktop: logo abaixo de mentalidade e marcação, na coluna direita */}
        <div className="mt-4 hidden sm:block">{reservasBlock}</div>
      </div>
    </div>
    {/* Reservas no mobile: fora das colunas, ocupando a largura inteira da tela */}
    <div className="mt-4 sm:hidden">{reservasBlock}</div>
    </>
  );
}
