import { useEffect, useRef } from "react";
import type React from "react";
import { useStore } from "../store";

// Folga mínima entre o botão e as bordas da viewport ao clampar.
const MARGIN = 8;

// Clampa um deslocamento proposto (dx, dy) para o elemento não sair da viewport.
// `refDx/refDy` é o deslocamento em que o rect foi medido (transform atual do DOM).
function clampToViewport(
  el: HTMLElement, dx: number, dy: number, refDx: number, refDy: number,
): { dx: number; dy: number } {
  const r = el.getBoundingClientRect();
  const left = r.left + (dx - refDx);
  const top = r.top + (dy - refDy);
  const maxLeft = window.innerWidth - r.width - MARGIN;
  const maxTop = window.innerHeight - r.height - MARGIN;
  const cl = Math.min(Math.max(left, MARGIN), Math.max(maxLeft, MARGIN));
  const ct = Math.min(Math.max(top, MARGIN), Math.max(maxTop, MARGIN));
  return { dx: dx + (cl - left), dy: dy + (ct - top) };
}

// Arrasto do botão flutuante compartilhado entre as telas. Durante o movimento a
// posição é aplicada direto no DOM (via fabRef), sem passar pelo React nem pelo
// store — gravar no store a cada pointermove re-renderizava a tela inteira e o
// persist serializava o jogo todo no localStorage, causando lag visível. O store
// (e portanto o localStorage) só é atualizado uma vez, ao soltar o botão.
// O botão nunca sai da viewport: o arrasto é clampado nas bordas e, ao montar ou
// redimensionar/girar a tela, uma posição persistida fora da área visível é
// trazida de volta automaticamente (reset de segurança).
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

  // reset de segurança: posição salva fora da tela (arrasto antigo, rotação do
  // celular, janela menor) volta para dentro da área visível
  useEffect(() => {
    const fix = () => {
      const el = fabRef.current;
      if (!el || pointer.current) return;
      const cur = useStore.getState().fabPos;
      const c = clampToViewport(el, cur.dx, cur.dy, cur.dx, cur.dy);
      if (c.dx !== cur.dx || c.dy !== cur.dy) setFabPos(c);
    };
    fix();
    window.addEventListener("resize", fix);
    return () => window.removeEventListener("resize", fix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFabDown = (e: React.PointerEvent<HTMLElement>) => {
    // impede que segurar o botão inicie uma seleção de texto no conteúdo atrás
    e.preventDefault();
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
    const el = fabRef.current;
    if (!el) return;
    // trava nas bordas: o rect atual do DOM está em (curDx, curDy)
    const c = clampToViewport(el, p.baseDx + dx, p.baseDy + dy, p.curDx, p.curDy);
    p.curDx = c.dx;
    p.curDy = c.dy;
    el.style.transform = `translate(${p.curDx}px, ${p.curDy}px)`;
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
