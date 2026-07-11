import { useEffect } from "react";

// Trava o scroll da página enquanto um modal está aberto. Contador global:
// modais aninhados (ex.: confirmação sobre a intervenção tática) só liberam o
// scroll quando o último fechar.
let locks = 0;

// Versão componente: <ScrollLock /> dentro do JSX do modal trava o scroll
// enquanto o modal estiver montado — funciona mesmo em componentes com early
// return, sem se preocupar com a ordem dos hooks.
export function ScrollLock() {
  useLockBodyScroll();
  return null;
}

// `active` cobre modais que decidem por conta própria se renderizam (early
// return null): só travam o scroll quando estão de fato visíveis.
export function useLockBodyScroll(active = true) {
  useEffect(() => {
    if (!active) return;
    locks++;
    document.body.style.overflow = "hidden";
    return () => {
      locks--;
      if (locks <= 0) {
        locks = 0;
        document.body.style.overflow = "";
      }
    };
  }, [active]);
}
