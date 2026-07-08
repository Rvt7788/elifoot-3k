import { useState } from "react";
import { useStore, bichoCost } from "../store";
import { bestXI, DEFAULT_TACTICS } from "../game/engine";
import type { Formation, Marking, Mentality, Player, Position } from "../types";
import { FORMATIONS } from "../types";
import { pitchLayout, PlayerPin, EmptySlot, PitchBackground } from "./PitchField";
import Toggle from "./Toggle";
import EnergyBar from "./EnergyBar";

const TIER_BADGE: Record<string, string> = {
  bagre: "", bom: "★", craque: "★★", extra: "💎",
};
const POS_ORDER = { GOL: 0, DEF: 1, MEI: 2, ATA: 3 } as const;

function PlayerDetails({ p }: { p: Player }) {
  return (
    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 rounded bg-black/30 px-2 py-1.5 text-[11px] text-zinc-300">
      <span>Idade: <b>{p.age}</b></span>
      <span>Pé: <b className="capitalize">{p.foot}</b></span>
      <span>Energia: <b className={p.energy < 60 ? "text-red-400" : "text-emerald-400"}>{p.energy}%</b></span>
      <span>⚽ Gols: <b>{p.goals}</b></span>
      <span>🎯 Assist.: <b>{p.assists}</b></span>
      <span>🟨 Amarelos: <b>{p.yellows}</b></span>
      <span>🟥 Vermelhos: <b>{p.reds}</b></span>
      <span className="col-span-2">
        Características: {p.traits.length ? p.traits.join(", ") : "—"}
      </span>
      <span className="col-span-2">Valor: €{(p.value / 1e6).toFixed(2)}M</span>
    </div>
  );
}

function PlayerRow({
  p, selected, onClick, expanded, onToggleExpand,
}: {
  p: Player; selected: boolean; onClick: () => void;
  expanded: boolean; onToggleExpand: () => void;
}) {
  return (
    <div className="mb-0.5">
      <button
        onClick={onClick}
        className={`flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left text-[11px] leading-tight ${
          selected ? "bg-sky-700" : "bg-zinc-800 hover:bg-zinc-700"
        }`}
      >
        <span className="flex min-w-0 items-center gap-1">
          <b className="shrink-0 text-zinc-400">{p.pos}</b>
          <span className={`truncate ${p.suspended ? "text-zinc-500 line-through" : ""}`}>{p.name}</span>
          <span className="shrink-0 text-amber-400">{TIER_BADGE[p.tier]}</span>
          {p.suspended && <span className="shrink-0 text-[10px] text-red-400">🟥</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <EnergyBar value={p.energy} />
          <b>{p.strength}</b>
          <span
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
            className="cursor-pointer text-zinc-500 hover:text-white"
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
  { key: "defensivo", label: "🛡 Defensivo" },
  { key: "equilibrado", label: "⚖ Equilibrado" },
  { key: "ofensivo", label: "⚔ Ofensivo" },
];

const MARK: { key: Marking; label: string }[] = [
  { key: "leve", label: "🪶 Leve" },
  { key: "frouxa", label: "〰 Frouxa" },
  { key: "apertada", label: "🔒 Apertada" },
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
  if (!game) return null;

  const tactics = game.defaultTactics ?? DEFAULT_TACTICS;

  const squad = game.players.filter((p) => p.clubId === game.userClubId);
  const userClub = game.clubs.find((c) => c.id === game.userClubId)!;
  const formation = game.formation ?? "4-4-2";
  const starters = game.starters?.length >= 11 ? game.starters : bestXI(squad, formation);
  const titulares = squad
    .filter((p) => starters.includes(p.id))
    .sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.strength - a.strength);
  const reservas = squad
    .filter((p) => !starters.includes(p.id))
    .sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.strength - a.strength);

  const pos = pitchLayout(formation);
  const slots: { pos: Position; x: number; y: number; player?: Player }[] = [];
  (["GOL", "DEF", "MEI", "ATA"] as const).forEach((posKey) => {
    const byForce = titulares
      .filter((p) => p.pos === posKey)
      .sort((a, b) => b.strength - a.strength);
    // usa a ordem manual salva (slotOrder) quando ela cobre exatamente os mesmos
    // jogadores dessa posição; senão cai no ordenamento automático por força.
    const manual = (game.slotOrder ?? [])
      .map((id) => titulares.find((p) => p.id === id))
      .filter((p): p is Player => !!p && p.pos === posKey);
    const players =
      manual.length === byForce.length &&
      manual.every((p) => byForce.some((b) => b.id === p.id))
        ? manual
        : byForce;
    pos[posKey].forEach((coord, i) => {
      slots.push({ pos: posKey, ...coord, player: players[i] });
    });
  });

  const clickPlayer = (id: string, isStarter: boolean) => {
    if (!sel) { setSel(id); return; }
    if (sel === id) { setSel(null); return; }
    const selIsStarter = starters.includes(sel);
    if (selIsStarter === isStarter) {
      // dois titulares da mesma posição: troca o lado deles no campo
      if (isStarter) {
        const selPlayer = squad.find((p) => p.id === sel);
        const idPlayer = squad.find((p) => p.id === id);
        if (selPlayer && idPlayer && selPlayer.pos === idPlayer.pos) {
          const order = titulares.map((p) => p.id);
          const ia = order.indexOf(sel);
          const ib = order.indexOf(id);
          [order[ia], order[ib]] = [order[ib], order[ia]];
          setSlotOrder(order);
          setSel(null);
          return;
        }
      }
      setSel(id);
      return;
    }
    const starterId = selIsStarter ? sel : id;
    const benchId = selIsStarter ? id : sel;
    // trava: só GOL troca por GOL (nunca deixa o time sem goleiro ou com 2)
    const starterPos = squad.find((p) => p.id === starterId)?.pos;
    const benchPos = squad.find((p) => p.id === benchId)?.pos;
    if ((starterPos === "GOL") !== (benchPos === "GOL")) { setSel(null); return; }
    setStarters(starters.map((s) => (s === starterId ? benchId : s)));
    setSel(null);
  };

  // Slot vazio (posição sem titular suficiente): clicar preenche com o reserva selecionado.
  const clickEmptySlot = (posKey: Position) => {
    if (!sel) return;
    const selIsStarter = starters.includes(sel);
    if (selIsStarter) { setSel(null); return; } // já é titular, nada a fazer
    const benchPlayer = squad.find((p) => p.id === sel);
    if (!benchPlayer || benchPlayer.pos !== posKey) return; // só entra na posição certa
    setStarters([...starters, sel]);
    setSel(null);
  };

  const toggleExpand = (id: string) => setExpanded(expanded === id ? null : id);

  const ideal = bestXI(squad, formation, byEnergy);
  const isBestActive =
    starters.length === ideal.length && ideal.every((id) => starters.includes(id));

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Campo, à esquerda — sem moldura, só a grama */}
      <PitchBackground className="relative mx-auto w-full shrink-0 overflow-hidden rounded-lg sm:mx-0 sm:w-64">
        {slots.map((s, i) =>
          s.player ? (
            <PlayerPin
              key={s.player.id}
              p={s.player}
              x={s.x}
              y={s.y}
              selected={sel === s.player.id}
              onClick={() => clickPlayer(s.player!.id, true)}
            />
          ) : (
            <EmptySlot
              key={i}
              x={s.x}
              y={s.y}
              label={s.pos}
              pulse={!!sel && !starters.includes(sel) && squad.find((p) => p.id === sel)?.pos === s.pos}
              onClick={() => clickEmptySlot(s.pos)}
            />
          ),
        )}
      </PitchBackground>

      {/* Coluna de comando tático: formação → melhor time → mentalidade → marcação → truculência */}
      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-40">
        <div>
          <p className="mb-1 text-[10px] font-bold text-zinc-500">FORMAÇÃO</p>
          <select
            value={formation}
            onChange={(e) => setFormation(e.target.value as Formation)}
            className="w-full rounded bg-zinc-800 px-2 py-1 text-xs"
          >
            {Object.keys(FORMATIONS).map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div>
          <button
            onClick={() => setStarters(ideal)}
            className={`w-full rounded px-2 py-1 text-xs font-semibold ${
              isBestActive ? "bg-emerald-600 text-white" : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          >
            ⚡ Melhor time
          </button>
          <div className="mt-1 flex gap-1">
            <button
              onClick={() => setByEnergy(false)}
              className={`flex-1 rounded px-1.5 py-0.5 text-[10px] ${
                !byEnergy ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
              }`}
              title="Escala sempre o jogador de maior força nominal, ignorando cansaço"
            >
              Força
            </button>
            <button
              onClick={() => setByEnergy(true)}
              className={`flex-1 rounded px-1.5 py-0.5 text-[10px] ${
                byEnergy ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
              }`}
              title="Considera o cansaço: energia abaixo de 70% já reduz a força em campo, chegando a 50% com energia muito baixa"
            >
              +Energia
            </button>
          </div>
        </div>

        <div>
          <p className="mb-1 text-[10px] font-bold text-zinc-500">MENTALIDADE</p>
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
          <p className="mb-1 text-[10px] font-bold text-zinc-500">MARCAÇÃO</p>
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
          <p className="mb-1 text-[10px] font-bold text-zinc-500">DISPOSIÇÃO</p>
          <Toggle
            checked={tactics.truculencia}
            onChange={() => setDefaultTactics({ truculencia: !tactics.truculencia })}
            label="🦵 Truculência"
            color="#b91c1c"
            hint="Bônus pesado de desarme, mas 3× mais cartões"
          />
          <div className="mt-1">
            <Toggle
              checked={tactics.autoSub ?? false}
              onChange={() => setDefaultTactics({ autoSub: !tactics.autoSub })}
              label="🔁 Sub. automática"
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
                  💰 Bicho{" "}
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
          <p className="mb-1 text-xs font-bold text-emerald-500">
            TITULARES ({titulares.length})
          </p>
          {titulares.map((p) => (
            <PlayerRow
              key={p.id}
              p={p}
              selected={sel === p.id}
              onClick={() => clickPlayer(p.id, true)}
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
              onClick={() => clickPlayer(p.id, false)}
              expanded={expanded === p.id}
              onToggleExpand={() => toggleExpand(p.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
