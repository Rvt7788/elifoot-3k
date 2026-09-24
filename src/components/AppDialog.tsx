import { useRef } from "react";
import { create } from "zustand";
import { ScrollLock } from "./useLockBodyScroll";

// Modal padrão de alerta/confirmação do app, no lugar de alert()/confirm() do
// navegador. Uso: `await appAlert("msg")`, `if (await appConfirm("msg?")) ...`
// ou `await appChoice("msg", [...opções])` quando há mais de dois caminhos —
// o <AppDialogHost /> (montado uma vez no App) renderiza o diálogo pendente.

interface DialogLabels {
  ok?: string; // padrão "OK"
  cancel?: string; // padrão "Cancelar"
}

export interface DialogOption {
  key: string;
  label: string;
  primary?: boolean; // botão de destaque (ação principal)
}

interface DialogState {
  message: string | null;
  kind: "alert" | "confirm" | "choice";
  labels: DialogLabels;
  options: DialogOption[];
  // alert/confirm devolvem "ok" ou null; choice devolve a key clicada (null = fechou)
  resolve: ((key: string | null) => void) | null;
  open: (
    message: string, kind: DialogState["kind"], labels?: DialogLabels, options?: DialogOption[],
  ) => Promise<string | null>;
  close: (key: string | null) => void;
}

const useDialog = create<DialogState>((set, get) => ({
  message: null,
  kind: "alert",
  labels: {},
  options: [],
  resolve: null,
  open: (message, kind, labels = {}, options = []) =>
    new Promise<string | null>((resolve) => set({ message, kind, labels, options, resolve })),
  close: (key) => {
    get().resolve?.(key);
    set({ message: null, resolve: null, labels: {}, options: [] });
  },
}));

export const appAlert = async (message: string): Promise<boolean> =>
  (await useDialog.getState().open(message, "alert")) === "ok";

export const appConfirm = async (message: string, labels?: DialogLabels): Promise<boolean> =>
  (await useDialog.getState().open(message, "confirm", labels)) === "ok";

// Mais de dois caminhos: devolve a key da opção clicada, ou null se fechou pelo fundo
export const appChoice = (message: string, options: DialogOption[]): Promise<string | null> =>
  useDialog.getState().open(message, "choice", {}, options);

export function AppDialogHost() {
  const { message, kind, labels, options, close } = useDialog();
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
        close(null);
      }}
    >
      <ScrollLock />
      <div
        className="w-full max-w-[260px] rounded-xl border border-zinc-700 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4 text-center text-sm leading-relaxed text-zinc-200">{message}</p>
        {kind === "choice" ? (
          <div className="flex flex-col items-center gap-2">
            {options.map((o) => (
              <button
                key={o.key}
                onClick={() => close(o.key)}
                className={o.primary
                  ? "btn-live btn-live--finish w-fit px-5 py-1.5 text-sm"
                  : "w-fit rounded px-4 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"}
                autoFocus={o.primary}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex justify-center gap-2">
            {kind === "confirm" && (
              <button
                onClick={() => close(null)}
                className="rounded px-4 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
              >
                {labels.cancel ?? "Cancelar"}
              </button>
            )}
            <button
              onClick={() => close("ok")}
              className="btn-live btn-live--finish px-5 py-1.5 text-sm"
              autoFocus
            >
              {labels.ok ?? "OK"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
