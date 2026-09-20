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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <ScrollLock />
      <div
        className="max-h-[78vh] w-full max-w-[19rem] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative mb-3 flex items-center justify-center">
          {/* o título é que fica centralizado: o ícone sai do fluxo e se
              pendura à esquerda dele, sem empurrar o texto para o lado */}
          <h2 className="relative text-lg font-bold">
            <span className="absolute right-full top-1/2 mr-2 -translate-y-1/2">
              <GameIcon name={icon} size={19} />
            </span>
            {title}
          </h2>
          <button onClick={onClose} className="absolute -right-1 -top-0.5 px-1 text-zinc-400 hover:text-white">✕</button>
        </div>
        {children}
        {footer && <div className="mt-4 flex justify-center">{footer}</div>}
      </div>
    </div>
  );
}
