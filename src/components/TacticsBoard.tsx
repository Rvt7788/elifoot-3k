import { useState } from "react";
import { useStore, bichoCost } from "../store";
import { bestXI, DEFAULT_TACTICS } from "../game/engine";
import type { Formation, Marking, Mentality, Player, Position } from "../types";
import { FORMATIONS } from "../types";
import { pitchLayout, PlayerPin, EmptySlot, PitchBackground } from "./PitchField";
import { readableOn } from "../game/color";
import Toggle from "./Toggle";
import EnergyBar from "./EnergyBar";

const TIER_BADGE: Record<string, string> = {
  bagre: "", bom: "★", craque: "★★", extra: "★★★",
};
const POS_ORDER = { GOL: 0, DEF: 1, MEI: 2, ATA: 3 } as const;
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
      <span className="col-span-2">
        Características: {p.traits.length ? p.traits.join(", ") : "—"}
      </span>
      <span className="col-span-2">Valor: €{(p.value / 1e6).toFixed(2)}M</span>
    </div>
  );
}

function PlayerRow({
  p, selected, selColor, onClick, expanded, onToggleExpand,
}: {
  p: Player; selected: boolean; selColor: string; onClick: () => void;
  expanded: boolean; onToggleExpand: () => void;
}) {
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
          <b className={`shrink-0 ${selected ? "opacity-70" : "text-zinc-400"}`}>{p.pos}</b>
          <span className={`truncate ${p.suspended ? "text-zinc-500 line-through" : ""}`}>{p.name}</span>
          <span className="shrink-0 text-amber-400">{TIER_BADGE[p.tier]}</span>
          {p.suspended && <span className="shrink-0 text-[9px] font-bold text-red-400">SUSP</span>}
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

const MENT: { key: Mentality; label: string }[] = [
  { key: "defensivo", label: "Defensivo" },
  { key: "equilibrado", label: "Equilibrado" },
  { key: "ofensivo", label: "Ofensivo" },
];

const MARK: { key: Marking; label: string }[] = [
  { key: "leve", label: "Leve" },
  { key: "frouxa", label: "Frouxa" },
  { key: "apertada", label: "Apertada" },
];

export default function TacticsBoard() {
  const game = useStore((s) => s.game);
  const setStarters = useStore((s) => s.setStarters);
  const setSlotOrder = useStore((s) => s.setSlotOrder);
  const setFormation = useStore((s) => s.setFormation);
  const setDefaultTactics = useStore((s) => s.setDefaultTactics);
  const payBicho = useStore((s) => s.payBicho);
  const [sel, setSel] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [byEnergy, setByEnergy] = useState(false);
  // Resetar zera starters para montagem manual: enquanto o time tiver menos de
  // 11, mostramos o campo vazio em vez de cair automaticamente no melhor time.
  const [manualMode, setManualMode] = useState(false);
  if (!game) return null;

  const tactics = game.defaultTactics ?? DEFAULT_TACTICS;

  const squad = game.players.filter((p) => p.clubId === game.userClubId);
  const userClub = game.clubs.find((c) => c.id === game.userClubId)!;
  const kit = { bg: userClub.primaryColor, border: userClub.secondaryColor };
  const formation = game.formation ?? "4-4-2";
  const hasFullXI = (game.starters?.length ?? 0) >= 11;
  const starters = hasFullXI ? game.starters : manualMode ? game.starters ?? [] : bestXI(squad, formation);
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

  const layout = pitchLayout(formation);
  const slots: { pos: Position; slotIdx: number; x: number; y: number; player?: Player }[] = [];
  POS_KEYS.forEach((posKey) => {
    layout[posKey].forEach((coord, i) => {
      slots.push({ pos: posKey, slotIdx: i, ...coord, player: posPlayers[posKey][i] });
    });
  });

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

  const ideal = bestXI(squad, formation, byEnergy);
  const isBestActive =
    starters.length === ideal.length && ideal.every((id) => starters.includes(id));

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Campo à esquerda, com as formações clicáveis em cima */}
      <div className="mx-auto w-full shrink-0 sm:mx-0 sm:w-64">
        <div className="mb-2 flex justify-between">
          {(Object.keys(FORMATIONS) as Formation[]).map((f) => (
            <button
              key={f}
              onClick={() => setFormation(f)}
              className={`country-tab !px-1 !text-[11px] ${formation === f ? "active" : ""}`}
            >
              {f}
            </button>
          ))}
        </div>
        <PitchBackground className="relative w-full overflow-hidden rounded-lg">
          {slots.map((s, i) =>
            s.player ? (
              <PlayerPin
                key={s.player.id}
                p={s.player}
                x={s.x}
                y={s.y}
                colors={kit}
                selected={sel === s.player.id}
                onClick={() => clickPlayer(s.player!.id)}
              />
            ) : (
              <EmptySlot
                key={i}
                x={s.x}
                y={s.y}
                label={s.pos}
                pulse={!!sel && !starters.includes(sel) && squad.find((p) => p.id === sel)?.pos === s.pos}
                onClick={() => clickEmptySlot(s.pos, s.slotIdx)}
              />
            ),
          )}
        </PitchBackground>
      </div>

      {/* Coluna de comando tático: melhor time → mentalidade → marcação → disposição */}
      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-40">
        <div>
          <p className="ui-label mb-1">Escalar por</p>
          <div className="flex gap-1">
            <button
              onClick={() => setByEnergy(false)}
              className={`flex-1 rounded px-1.5 py-1 text-[11px] ${
                !byEnergy ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
              }`}
              title="Escala sempre o jogador de maior força nominal, ignorando cansaço"
            >
              Força
            </button>
            <button
              onClick={() => setByEnergy(true)}
              className={`flex-1 rounded px-1.5 py-1 text-[11px] ${
                byEnergy ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
              }`}
              title="Considera o cansaço: energia abaixo de 70% já reduz a força em campo, chegando a 50% com energia muito baixa"
            >
              Energia
            </button>
          </div>
          <p className="mb-1 mt-2 text-[10px] text-zinc-600">Por posição, sempre respeitando a formação escolhida.</p>
          <button
            onClick={() => { setStarters(ideal); setManualMode(false); }}
            className={`w-full rounded px-2 py-1 text-xs font-semibold ${
              isBestActive ? "bg-emerald-600 text-white" : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          >
            Aplicar melhor time
          </button>
          <button
            onClick={() => { setStarters([]); setSel(null); setManualMode(true); }}
            className="mt-1 w-full rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            title="Limpa a escalação para montar o time manualmente, clicando nos jogadores"
          >
            Resetar escalação
          </button>
        </div>

        <div>
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
        </div>

        <div>
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
        </div>

        <div>
          <p className="ui-label mb-1">Disposição</p>
          <Toggle
            checked={tactics.truculencia}
            onChange={() => setDefaultTactics({ truculencia: !tactics.truculencia })}
            label="Truculência"
            color="#b91c1c"
            hint="Bônus pesado de desarme, mas 3× mais cartões"
          />
          <div className="mt-1">
            <Toggle
              checked={tactics.autoSub ?? false}
              onChange={() => setDefaultTactics({ autoSub: !tactics.autoSub })}
              label="Sub. automática"
              color="#0891b2"
              hint="No segundo tempo, troca sozinho jogadores esgotados por reservas descansados da mesma posição"
            />
          </div>
          <div className="mt-1">
            <Toggle
              checked={tactics.bicho ?? false}
              onChange={() => {
                if (tactics.bicho) return; // dinheiro pago não volta
                if (!payBicho()) alert("Orçamento insuficiente para pagar o bicho.");
              }}
              disabled={!tactics.bicho && game.budget < bichoCost(userClub.baseBudget)}
              label={
                <>
                  Bicho{" "}
                  <span className="text-[10px] text-zinc-400">
                    €{(bichoCost(userClub.baseBudget) / 1e6).toFixed(2)}M
                  </span>
                </>
              }
              color="#10b981"
              hint="Prêmio pago na hora: o time entra motivado (+10% de volume) na próxima partida. Irreversível."
            />
          </div>
        </div>
      </div>

      {/* Titulares e reservas, à direita, mesmo espaço */}
      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-bold" style={{ color: userClub.primaryColor }}>
            TITULARES ({titulares.length})
          </p>
          {titulares.map((p) => (
            <PlayerRow
              key={p.id}
              p={p}
              selected={sel === p.id}
              selColor={userClub.primaryColor}
              onClick={() => clickPlayer(p.id)}
              expanded={expanded === p.id}
              onToggleExpand={() => toggleExpand(p.id)}
            />
          ))}
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-bold text-zinc-500">
            RESERVAS ({reservas.length})
          </p>
          {reservas.map((p) => (
            <PlayerRow
              key={p.id}
              p={p}
              selected={sel === p.id}
              selColor={userClub.primaryColor}
              onClick={() => clickPlayer(p.id)}
              expanded={expanded === p.id}
              onToggleExpand={() => toggleExpand(p.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
