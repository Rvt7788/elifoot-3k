import { useRef } from "react";
import type React from "react";
import { useStore } from "../store";

// Arrasto do botão flutuante compartilhado entre as telas. Durante o movimento a
// posição é aplicada direto no DOM (via fabRef), sem passar pelo React nem pelo
// store — gravar no store a cada pointermove re-renderizava a tela inteira e o
// persist serializava o jogo todo no localStorage, causando lag visível. O store
// (e portanto o localStorage) só é atualizado uma vez, ao soltar o botão.
export function useFabDrag() {
  const fabPos = useStore((s) => s.fabPos);
  const setFabPos = useStore((s) => s.setFabPos);
  const fabRef = useRef<HTMLElement | null>(null);
  const pointer = useRef<{
    startX: number;
    startY: number;
    baseDx: number;
    baseDy: number;
    curDx: number;
    curDy: number;
    moved: boolean;
  } | null>(null);

  const onFabDown = (e: React.PointerEvent<HTMLElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const base = useStore.getState().fabPos;
    pointer.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseDx: base.dx,
      baseDy: base.dy,
      curDx: base.dx,
      curDy: base.dy,
      moved: false,
    };
  };

  const onFabMove = (e: React.PointerEvent<HTMLElement>) => {
    const p = pointer.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (!p.moved && Math.hypot(dx, dy) < 6) return; // limiar toque vs. arrasto
    p.moved = true;
    p.curDx = p.baseDx + dx;
    p.curDy = p.baseDy + dy;
    if (fabRef.current) fabRef.current.style.transform = `translate(${p.curDx}px, ${p.curDy}px)`;
  };

  // encerra o gesto: se foi arrasto, grava a posição final no store (uma única
  // escrita, com persist); devolve true se foi um toque simples (a ação do botão
  // deve disparar).
  const fabTapEnded = (): boolean => {
    const p = pointer.current;
    pointer.current = null;
    if (!p) return false;
    if (p.moved) {
      setFabPos({ dx: p.curDx, dy: p.curDy });
      return false;
    }
    return true;
  };

  return { fabPos, fabRef, onFabDown, onFabMove, fabTapEnded };
}
