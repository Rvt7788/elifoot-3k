import { useEffect, useState } from "react";

/**
 * Estado da atualização do service worker. O registro acontece uma única vez
 * no main.tsx, antes de qualquer componente montar, então o sinal fica no
 * módulo — um componente que monte depois ainda encontra o aviso pendente.
 */
let needRefresh = false;
let applyUpdate: (() => void) | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const fn of subscribers) fn();
}

/** Chamado pelo registro do SW quando há uma versão nova esperando. */
export function setUpdateReady(apply: () => void): void {
  needRefresh = true;
  applyUpdate = apply;
  notify();
}

export function useSwUpdate() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const rerender = () => forceUpdate((n) => n + 1);
    subscribers.add(rerender);
    return () => {
      subscribers.delete(rerender);
    };
  }, []);

  return {
    needRefresh,
    /** Ativa o SW novo e recarrega a página já na versão atualizada. */
    update: () => applyUpdate?.(),
  };
}
