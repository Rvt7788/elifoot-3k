import { useEffect, useState } from "react";

/** Evento do Chrome para instalação da PWA (não existe nos tipos do DOM). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const SESSION_KEY = "retro-manager-sessions";
const SESSION_COUNTED = "retro-manager-session-counted";
const INVITE_KEY = "retro-manager-install-invited";

/** Já rodando como app instalado: nada de convite nem de botão. */
export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS não implementa display-mode: standalone
      (navigator as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ se identifica como Mac: o toque é o que o distingue
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** No iPhone só o Safari tem "Adicionar à Tela de Início". */
export function isIOSSafari(): boolean {
  if (!isIOS()) return false;
  const ua = navigator.userAgent;
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

/**
 * Conta a abertura atual e devolve quantas sessões já houve (1 = primeira).
 * O sessionStorage garante uma contagem por aba aberta: recarregar a página
 * durante a mesma sessão não infla o número.
 */
function countSession(): number {
  try {
    const stored = Number(localStorage.getItem(SESSION_KEY)) || 0;
    if (sessionStorage.getItem(SESSION_COUNTED) === "1") return stored || 1;
    sessionStorage.setItem(SESSION_COUNTED, "1");
    const total = stored + 1;
    localStorage.setItem(SESSION_KEY, String(total));
    return total;
  } catch {
    return 1;
  }
}

function alreadyInvited(): boolean {
  try {
    return localStorage.getItem(INVITE_KEY) === "1";
  } catch {
    return true; // sem storage: não insiste
  }
}

export function markInvited(): void {
  try {
    localStorage.setItem(INVITE_KEY, "1");
  } catch {
    /* noop */
  }
}

/*
 * Estado compartilhado entre todos os componentes que usam o hook. O evento
 * beforeinstallprompt dispara uma única vez na página: guardá-lo no módulo faz
 * com que o guia funcione mesmo quando montado depois do disparo, e mantém
 * o convite e o rodapé em sincronia quando um deles é dispensado.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let invited = alreadyInvited();
let listenersReady = false;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const fn of subscribers) fn();
}

function setupListeners(): void {
  if (listenersReady || isStandalone()) return;
  listenersReady = true;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // sem isso o Chrome mostra o banner dele por cima
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    invited = true;
    markInvited();
    notify();
  });
}

/**
 * Estado de instalação do app. O convite automático só aparece a partir da
 * segunda sessão — quem fechou e voltou já mostrou que pretende jogar de novo.
 */
export function useInstall() {
  const [, forceUpdate] = useState(0);
  const [installed, setInstalled] = useState(isStandalone);
  const [sessions] = useState(countSession);

  useEffect(() => {
    setupListeners();
    const rerender = () => forceUpdate((n) => n + 1);
    subscribers.add(rerender);
    return () => {
      subscribers.delete(rerender);
    };
  }, []);

  /** Abre o instalador nativo (Android/Chrome). Devolve false se não houver. */
  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === "accepted") setInstalled(true);
    notify();
    return outcome === "accepted";
  };

  const dismissInvite = () => {
    invited = true;
    markInvited();
    notify();
  };

  return {
    /** true quando o Chrome já ofereceu o instalador nativo. */
    canPrompt: deferredPrompt !== null,
    installed,
    // iOS nunca dispara beforeinstallprompt: lá o convite depende só da sessão
    shouldInvite: sessions >= 2 && !invited && !installed && !isStandalone(),
    install,
    dismissInvite,
  };
}
