import { useRef, useState } from "react";
import type { CustomFormation, Position } from "../types";
import { PitchBackground } from "./PitchField";

const POS_CYCLE: Position[] = ["DEF", "MEI", "ATA"];

// Formação inicial do editor: parte do 4-4-2 clássico, o usuário arrasta a partir daí.
function defaultSlots(): CustomFormation["slots"] {
  const row = (n: number, y: number, pos: Position) =>
    Array.from({ length: n }, (_, i) => ({ pos, x: ((i + 1) / (n + 1)) * 100, y }));
  return [...row(4, 72, "DEF"), ...row(4, 46, "MEI"), ...row(2, 18, "ATA")];
}

export default function FormationEditorModal({
  initial, onSave, onClose,
}: {
  initial?: CustomFormation;
  onSave: (f: CustomFormation) => void;
  onClose: () => void;
}) {
  const [slots, setSlots] = useState<CustomFormation["slots"]>(
    initial?.slots?.length ? initial.slots.map((s) => ({ ...s })) : defaultSlots(),
  );
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  // distingue arrasto de clique: só troca a posição (DEF→MEI→ATA) num clique
  // parado — se o ponteiro se moveu além do limiar, o click pós-arrasto é ignorado
  const dragInfo = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  const count = (pos: Position) => slots.filter((s) => s.pos === pos).length;
  const total = slots.length;

  const posAt = (clientX: number, clientY: number) => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.min(96, Math.max(4, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(96, Math.max(4, ((clientY - rect.top) / rect.height) * 100));
    return { x, y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragIdx === null || !dragInfo.current) return;
    if (!dragInfo.current.moved) {
      const dist = Math.hypot(e.clientX - dragInfo.current.startX, e.clientY - dragInfo.current.startY);
      if (dist < 6) return; // jitter de toque não conta como arrasto
      dragInfo.current.moved = true;
    }
    const p = posAt(e.clientX, e.clientY);
    if (!p) return;
    setSlots((prev) => prev.map((s, i) => (i === dragIdx ? { ...s, ...p } : s)));
  };

  const cyclePos = (idx: number) => {
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const next = POS_CYCLE[(POS_CYCLE.indexOf(s.pos) + 1) % POS_CYCLE.length];
        return { ...s, pos: next };
      }),
    );
  };

  const removeSlot = (idx: number) => {
    if (slots.length <= 1) return;
    setSlots((prev) => prev.filter((_, i) => i !== idx));
  };

  const addSlot = () => {
    if (slots.length >= 10) return;
    setSlots((prev) => [...prev, { pos: "MEI", x: 50, y: 46 }]);
  };

  const valid = total === 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-200">Editor de formação</h3>
          <button onClick={onClose} className="rounded px-2 text-zinc-400 hover:bg-zinc-800">✕</button>
        </div>

        <div ref={fieldRef} onPointerMove={onPointerMove} onPointerUp={() => setDragIdx(null)}>
          <PitchBackground className="relative w-full max-w-[16rem] mx-auto overflow-visible rounded-lg touch-none">
            {/* goleiro fixo, só ilustrativo — não faz parte dos slots editáveis */}
            <span
              className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 bg-zinc-700 text-center text-[8px] leading-5 text-white/70"
              style={{ left: "50%", top: "92%" }}
            >
              GOL
            </span>
            {slots.map((s, i) => (
              <button
                key={i}
                onPointerDown={(e) => {
                  e.preventDefault();
                  dragInfo.current = { startX: e.clientX, startY: e.clientY, moved: false };
                  setDragIdx(i);
                }}
                onClick={() => {
                  // click dispara após o pointerup mesmo em arrasto: só cicla se não moveu
                  if (dragInfo.current?.moved) return;
                  cyclePos(i);
                }}
                onDoubleClick={() => removeSlot(i)}
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
                className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border text-[9px] font-bold text-white shadow active:cursor-grabbing ${
                  s.pos === "DEF" ? "bg-sky-600 border-sky-300" : s.pos === "MEI" ? "bg-amber-600 border-amber-300" : "bg-red-600 border-red-300"
                }`}
                title="Arraste para mover · toque para trocar posição · duplo toque para remover"
              >
                {s.pos[0]}
              </button>
            ))}
          </PitchBackground>
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
          <span>DEF {count("DEF")} · MEI {count("MEI")} · ATA {count("ATA")}</span>
          <span className={valid ? "text-emerald-400" : "text-red-400"}>{total}/10</span>
        </div>

        <div className="mt-2 flex gap-2">
          <button
            onClick={addSlot}
            disabled={total >= 10}
            className="flex-1 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
          >
            + Adicionar jogador
          </button>
          <button
            onClick={() => setSlots(defaultSlots())}
            className="flex-1 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700"
          >
            Restaurar 4-4-2
          </button>
        </div>

        <button
          onClick={() => valid && onSave({ name: "custom", slots })}
          disabled={!valid}
          className="mx-auto block mt-3 rounded-lg bg-emerald-600 px-6 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          Criar
        </button>
      </div>
    </div>
  );
}
