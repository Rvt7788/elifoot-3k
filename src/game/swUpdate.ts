/**
 * Aplicação automática da versão nova.
 *
 * O service worker já trocou os arquivos em cache quando este módulo é
 * avisado, mas a aba aberta segue com o código antigo em memória: recarregar
 * é o que aplica a atualização de fato.
 *
 * A recarga acontece sozinha, sem pedir nada a ninguém. A única exceção é a
 * rodada ao vivo, onde recarregar perderia os lances em andamento: ali a
 * atualização fica represada e entra assim que a partida termina — ou, se a
 * pessoa fechar o app antes, na próxima abertura.
 */
let needRefresh = false;
let applyUpdate: (() => void) | null = null;
/** Enquanto true, nenhuma recarga acontece. */
let blocked = false;

function applyIfSafe(): void {
  if (needRefresh && !blocked && applyUpdate) applyUpdate();
}

/** Chamado pelo registro do SW quando há uma versão nova pronta. */
export function setUpdateReady(apply: () => void): void {
  needRefresh = true;
  applyUpdate = apply;
  applyIfSafe();
}

/**
 * Liga ou desliga o bloqueio da recarga. O App mantém isso ligado enquanto a
 * rodada ao vivo estiver rolando; ao desligar, uma atualização represada se
 * aplica na hora.
 */
export function setUpdateBlocked(value: boolean): void {
  if (blocked === value) return;
  blocked = value;
  if (!blocked) applyIfSafe();
}
