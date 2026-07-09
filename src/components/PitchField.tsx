import type { CustomFormation, Formation, Player, Position } from "../types";
import { FORMATIONS } from "../types";
import EnergyBar, { energyStepColors } from "./EnergyBar";

const row = (n: number, y: number) =>
  Array.from({ length: n }, (_, i) => ({ x: ((i + 1) / (n + 1)) * 100, y }));

// Coordenadas (%) por posição na formação, campo vertical (baixo = defesa, topo = ataque).
// 4-5-1 tem meio-campo em duas linhas (2 volantes + 3 armadores); as demais formações
// usam uma linha só de MEI. "custom" usa os slots desenhados pelo usuário no editor.
export function pitchLayout(
  formation: Formation, custom?: CustomFormation,
): Record<Position, { x: number; y: number }[]> {
  if (formation === "custom" && custom) {
    const out: Record<Position, { x: number; y: number }[]> = { GOL: row(1, 92), DEF: [], MEI: [], ATA: [] };
    for (const s of custom.slots) out[s.pos].push({ x: s.x, y: s.y });
    return out;
  }
  const shape = FORMATIONS[formation as Exclude<Formation, "custom">] ?? FORMATIONS["4-4-2"];
  if (formation === "4-5-1") {
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
  p, x, y, selected, dim, energyOverride, colors, compact, onClick,
}: {
  p: Player; x: number; y: number; selected: boolean; dim?: boolean;
  energyOverride?: number; // energia ao vivo (LivePlayer), quando diferente da persistida
  colors?: { bg: string; border: string }; // camisa do clube (prancheta de tática)
  compact?: boolean; // prancheta pré-jogo: só a bolinha com a força, sem nome/energia (visual, não informativo)
  onClick: () => void;
}) {
  const energy = energyOverride ?? p.energy;
  return (
    <button
      onClick={onClick}
      style={{ left: `${x}%`, top: `${y}%` }}
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      title={`${p.name} · Energia: ${Math.round(energy)}% · Pé ${p.foot}`}
    >
      <span
        style={
          dim
            ? undefined
            : colors
              ? { background: colors.bg, borderColor: colors.border }
              : { background: energyStepColors(energy).bg, borderColor: energyStepColors(energy).border }
        }
        className={`flex items-center justify-center rounded-full border font-bold shadow ${
          compact ? "h-4 w-4 text-[8px]" : "h-5 w-5 text-[9px]"
        } ${
          selected ? "ring-2 ring-sky-400 ring-offset-1 ring-offset-emerald-950" : ""
        } ${
          dim ? "border-red-400/70 bg-red-900/60 text-red-200" : "text-white"
        }`}
      >
        {compact ? p.number : p.strength}
      </span>
      {!compact && (
        <>
          <span className="mt-0.5 max-w-[44px] truncate rounded bg-black/60 px-1 text-[8px] leading-tight text-white">
            {p.foot === "canhoto" && <span className="text-sky-300">◂</span>}
            {p.name.split(" ").slice(-1)[0]}
            {p.foot === "destro" && <span className="text-sky-300">▸</span>}
          </span>
          <EnergyBar value={energy} className="mt-0.5 scale-75" />
        </>
      )}
    </button>
  );
}

export function EmptySlot({
  x, y, label, pulse, compact, onClick,
}: { x: number; y: number; label: string; pulse?: boolean; compact?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ left: `${x}%`, top: `${y}%` }}
      className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border border-dashed ${
        compact ? "h-4 w-4 text-[7px]" : "h-5 w-5 text-[8px]"
      } ${
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
