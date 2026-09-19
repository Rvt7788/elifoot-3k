/**
 * Eventos de marco enviados ao Google Analytics.
 *
 * O jogo é um SPA: a pessoa joga uma temporada inteira sem trocar de página,
 * e o GA4 encerra a sessão após 30 minutos sem nenhum evento. Sem estes
 * marcos, uma partida longa vira duas sessões e o tempo médio despenca.
 *
 * Offline os envios falham em silêncio, de propósito: o jogo funciona sem
 * internet e nada aqui pode atrapalhar isso.
 */

type GtagFn = (command: string, ...args: unknown[]) => void;

function gtag(): GtagFn | null {
  const fn = (window as unknown as { gtag?: GtagFn }).gtag;
  return typeof fn === "function" ? fn : null;
}

/** true quando aberto pelo ícone da tela de início, não pelo navegador. */
function standalone(): boolean {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export type GameEvent =
  | "game_start"
  | "matchday_start"
  | "matchday_finish"
  | "season_finish"
  | "app_installed"
  | "install_prompt_shown"
  | "install_prompt_dismissed";

/**
 * Registra um marco do jogo. Todo evento carrega o modo de exibição, para
 * separar nos relatórios quem instalou o app de quem joga pelo navegador.
 */
export function track(event: GameEvent, params: Record<string, unknown> = {}): void {
  const g = gtag();
  if (!g) return; // bloqueador de anúncios ou script ainda não carregado
  try {
    g("event", event, { display_mode: standalone() ? "pwa" : "browser", ...params });
  } catch {
    // analytics nunca pode quebrar o jogo
  }
}
