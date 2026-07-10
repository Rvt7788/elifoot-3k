import { create } from "zustand";

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
  if (!message) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
      onClick={() => close(false)}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4 text-sm leading-relaxed text-zinc-200">{message}</p>
        <div className="flex justify-end gap-2">
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
            className="btn-play px-5 py-1.5 text-sm"
            autoFocus
          >
            {labels.ok ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
