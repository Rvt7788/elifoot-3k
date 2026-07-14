import { useRef } from "react";
import { create } from "zustand";
import { ScrollLock } from "./useLockBodyScroll";

// Modal padrão de alerta/confirmação do app, no lugar de alert()/confirm() do
// navegador. Uso: `await appAlert("msg")` ou `if (await appConfirm("msg?")) ...`
// — o <AppDialogHost /> (montado uma vez no App) renderiza o diálogo pendente.

interface DialogLabels {
  ok?: string; // padrão "OK"
  cancel?: string; // padrão "Cancelar"
}

interface DialogState {
  message: string | null;
  kind: "alert" | "confirm";
  labels: DialogLabels;
  resolve: ((ok: boolean) => void) | null;
  open: (message: string, kind: "alert" | "confirm", labels?: DialogLabels) => Promise<boolean>;
  close: (ok: boolean) => void;
}

const useDialog = create<DialogState>((set, get) => ({
  message: null,
  kind: "alert",
  labels: {},
  resolve: null,
  open: (message, kind, labels = {}) =>
    new Promise<boolean>((resolve) => set({ message, kind, labels, resolve })),
  close: (ok) => {
    get().resolve?.(ok);
    set({ message: null, resolve: null, labels: {} });
  },
}));

export const appAlert = (message: string): Promise<boolean> =>
  useDialog.getState().open(message, "alert");

export const appConfirm = (message: string, labels?: DialogLabels): Promise<boolean> =>
  useDialog.getState().open(message, "confirm", labels);

export function AppDialogHost() {
  const { message, kind, labels, close } = useDialog();
  // O click sintético do gesto que ABRIU o diálogo não pode fechá-lo: quando o
  // confirm é disparado num pointerup (ex.: botão flutuante da parada tática),
  // o diálogo já está renderizado por cima quando o navegador despacha o click
  // do mesmo toque — ele cairia aqui no backdrop e cancelaria sozinho. Então o
  // backdrop ignora cliques nos primeiros instantes após abrir.
  // o timestamp é gravado no PRÓPRIO render (não em useEffect): o render do
  // diálogo acontece síncrono no flush do pointerup, antes do click chegar
  const openedAt = useRef(0);
  const prevMessage = useRef<string | null>(null);
  if (message !== prevMessage.current) {
    prevMessage.current = message;
    if (message) openedAt.current = Date.now();
  }
  if (!message) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
      onClick={() => {
        if (Date.now() - openedAt.current < 400) return;
        close(false);
      }}
    >
      <ScrollLock />
      <div
        className="w-full max-w-[260px] rounded-xl border border-zinc-700 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4 text-center text-sm leading-relaxed text-zinc-200">{message}</p>
        <div className="flex justify-center gap-2">
          {kind === "confirm" && (
            <button
              onClick={() => close(false)}
              className="rounded px-4 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              {labels.cancel ?? "Cancelar"}
            </button>
          )}
          <button
            onClick={() => close(true)}
            className="btn-live btn-live--finish px-5 py-1.5 text-sm"
            autoFocus
          >
            {labels.ok ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
