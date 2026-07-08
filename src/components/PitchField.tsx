import type { Formation, Player, Position } from "../types";
import { FORMATIONS } from "../types";
import EnergyBar from "./EnergyBar";

// Cor do pin por energia: 100% verde-esmeralda → 0% vermelho, passando por âmbar no meio.
// Usa HSL diretamente (verde ~152° até vermelho ~0°) para uma transição contínua e legível.
function energyColor(energy: number): string {
  const pct = Math.max(0, Math.min(100, energy));
  const hue = (pct / 100) * 142; // 0 = vermelho, 142 = verde
  return `hsl(${hue}, 70%, 38%)`;
}
function energyBorderColor(energy: number): string {
  const pct = Math.max(0, Math.min(100, energy));
  const hue = (pct / 100) * 142;
  return `hsl(${hue}, 85%, 65%)`;
}

const row = (n: number, y: number) =>
  Array.from({ length: n }, (_, i) => ({ x: ((i + 1) / (n + 1)) * 100, y }));

// Coordenadas (%) por posição na formação, campo vertical (baixo = defesa, topo = ataque).
// 4-2-3-1 tem meio-campo em duas linhas (2 volantes + 3 armadores); as demais formações
// usam uma linha só de MEI.
export function pitchLayout(formation: Formation): Record<Position, { x: number; y: number }[]> {
  const shape = FORMATIONS[formation];
  if (formation === "4-2-3-1") {
    return {
      GOL: row(1, 92),
      DEF: row(shape.DEF, 74),
      MEI: [...row(2, 54), ...row(3, 34)],
      ATA: row(shape.ATA, 14),
    };
  }
  return {
    GOL: row(1, 92),
    DEF: row(shape.DEF, 72),
    MEI: row(shape.MEI, 46),
    ATA: row(shape.ATA, 18),
  };
}

export function PlayerPin({
  p, x, y, selected, dim, energyOverride, onClick,
}: {
  p: Player; x: number; y: number; selected: boolean; dim?: boolean;
  energyOverride?: number; // energia ao vivo (LivePlayer), quando diferente da persistida
  onClick: () => void;
}) {
  const energy = energyOverride ?? p.energy;
  return (
    <button
      onClick={onClick}
      style={{ left: `${x}%`, top: `${y}%` }}
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      title={`Energia: ${Math.round(energy)}% · Pé ${p.foot}`}
    >
      <span
        style={dim ? undefined : { background: energyColor(energy), borderColor: energyBorderColor(energy) }}
        className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold shadow ${
          selected ? "ring-2 ring-sky-400 ring-offset-1 ring-offset-emerald-950" : ""
        } ${
          dim ? "border-red-400/70 bg-red-900/60 text-red-200" : "text-white"
        }`}
      >
        {p.strength}
      </span>
      <span className="mt-0.5 max-w-[44px] truncate rounded bg-black/60 px-1 text-[8px] leading-tight text-white">
        {p.foot === "canhoto" && <span className="text-sky-300">◂</span>}
        {p.name.split(" ").slice(-1)[0]}
        {p.foot === "destro" && <span className="text-sky-300">▸</span>}
      </span>
      <EnergyBar value={energy} className="mt-0.5 scale-75" />
    </button>
  );
}

export function EmptySlot({
  x, y, label, pulse, onClick,
}: { x: number; y: number; label: string; pulse?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ left: `${x}%`, top: `${y}%` }}
      className={`absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-dashed text-[8px] ${
        pulse ? "animate-pulse border-amber-400 text-amber-300" : "border-white/40 text-white/50"
      }`}
    >
      {label}
    </button>
  );
}

export function PitchBackground({
  className, children,
}: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={className}
      style={{
        aspectRatio: "3 / 4",
        background:
          "repeating-linear-gradient(0deg, #14532d, #14532d 10%, #166534 10%, #166534 20%)",
      }}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
      <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
      <div className="absolute inset-x-[20%] top-0 h-[12%] rounded-b border border-t-0 border-white/20" />
      <div className="absolute inset-x-[20%] bottom-0 h-[12%] rounded-t border border-b-0 border-white/20" />
      {children}
    </div>
  );
}
