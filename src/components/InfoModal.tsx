import type { ReactNode } from "react";
import GameIcon, { type GameIconName } from "./GameIcon";
import { ScrollLock } from "./useLockBodyScroll";

/** Casca compartilhada pelos modais do rodapé: Instalar, FAQ e Apoie. */
export default function InfoModal({
  icon,
  title,
  onClose,
  children,
  footer,
}: {
  icon: GameIconName;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Ação opcional abaixo do conteúdo, como o "Agora não" do convite. */
  footer?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <ScrollLock />
      <div
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative mb-4 flex items-center justify-center">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <GameIcon name={icon} size={18} /> {title}
          </h2>
          <button onClick={onClose} className="absolute right-0 text-zinc-400 hover:text-white">✕</button>
        </div>
        {children}
        {footer && <div className="mt-4 flex justify-center">{footer}</div>}
      </div>
    </div>
  );
}
