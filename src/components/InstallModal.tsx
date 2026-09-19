import { useState, type ReactNode } from "react";
import GameIcon from "./GameIcon";
import InfoModal from "./InfoModal";
import { isIOS, isIOSSafari, useInstall } from "../game/install";

/* ── glifos do iOS: a instrução só é seguível se a pessoa reconhece o ícone ── */

/** Ícone Compartilhar do Safari: quadrado com seta para cima. */
function ShareGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M7 11H5v9h14v-9h-2" />
    </svg>
  );
}

/** Ícone Adicionar à Tela de Início: quadrado com um mais dentro. */
function AddBoxGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

/** Vantagens de instalar, iguais nas duas plataformas. */
function Benefits() {
  const items = [
    { icon: "globe", text: "Joga offline, sem depender de internet" },
    { icon: "home", text: "Abre em tela cheia, sem a barra do navegador" },
    { icon: "save", text: "Seus saves continuam onde estão" },
  ] as const;
  return (
    <ul className="mb-4 flex flex-col gap-2">
      {items.map((it) => (
        <li key={it.text} className="flex items-center gap-2.5 text-[13px] leading-snug text-zinc-300">
          <span className="shrink-0 opacity-80">
            <GameIcon name={it.icon} size={16} />
          </span>
          {it.text}
        </li>
      ))}
    </ul>
  );
}

/** Um passo numerado do roteiro do iOS. */
function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-600 text-[12px] font-bold text-zinc-300">
        {n}
      </span>
      <span className="pt-0.5 text-[13px] leading-relaxed text-zinc-300">{children}</span>
    </li>
  );
}

export default function InstallModal({
  onClose,
  footer,
}: {
  onClose: () => void;
  footer?: ReactNode;
}) {
  const { canPrompt, installed, install } = useInstall();
  const [failed, setFailed] = useState(false);

  const body = () => {
    if (installed) {
      return (
        <p className="text-center text-[13px] leading-relaxed text-zinc-400">
          O jogo já está instalado neste aparelho. É só abrir pelo ícone na sua tela de início.
        </p>
      );
    }

    /* ── iOS: a Apple não expõe API de instalação, só o caminho manual ── */
    if (isIOS()) {
      return (
        <>
          <Benefits />
          {!isIOSSafari() && (
            <p className="mb-3 rounded border border-amber-700/50 bg-amber-900/20 px-3 py-2.5 text-[13px] leading-relaxed text-amber-200">
              No iPhone e no iPad, só o Safari instala o jogo — nos outros navegadores o menu não
              tem essa opção. Abra esta página no Safari e siga os passos abaixo.
            </p>
          )}
          <ol className="flex flex-col gap-3">
            <Step n={1}>
              Toque em{" "}
              <ShareGlyph className="mx-0.5 inline-block h-[1.15em] w-[1.15em] -translate-y-px align-middle text-sky-300" />{" "}
              <b className="font-semibold text-zinc-100">Compartilhar</b>, na barra do Safari.
            </Step>
            <Step n={2}>
              Role a lista e escolha{" "}
              <AddBoxGlyph className="mx-0.5 inline-block h-[1.15em] w-[1.15em] -translate-y-px align-middle text-sky-300" />{" "}
              <b className="font-semibold text-zinc-100">Adicionar à Tela de Início</b>.
            </Step>
            <Step n={3}>
              Confirme em <b className="font-semibold text-zinc-100">Adicionar</b>, no canto
              superior direito.
            </Step>
          </ol>
        </>
      );
    }

    /* ── Android e desktop: instalador nativo em um toque ── */
    return (
      <>
        <Benefits />
        {canPrompt ? (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={async () => {
                const ok = await install();
                if (ok) onClose();
                else setFailed(true);
              }}
              className="btn-cta inline-flex w-fit items-center gap-2 px-5 py-2.5 text-sm"
            >
              <GameIcon name="home" size={16} /> Instalar o jogo
            </button>
            {failed && (
              <p className="text-center text-[12px] leading-relaxed text-zinc-500">
                Instalação cancelada. Você pode tentar de novo quando quiser.
              </p>
            )}
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            <Step n={1}>
              Abra o menu do navegador, no{" "}
              <b className="font-semibold text-zinc-100">⋮</b> do canto superior direito.
            </Step>
            <Step n={2}>
              Escolha <b className="font-semibold text-zinc-100">Instalar aplicativo</b> ou{" "}
              <b className="font-semibold text-zinc-100">Adicionar à tela inicial</b>.
            </Step>
            <Step n={3}>
              Confirme em <b className="font-semibold text-zinc-100">Instalar</b>.
            </Step>
          </ol>
        )}
      </>
    );
  };

  return (
    <InfoModal icon="home" title="Instalar o jogo" onClose={onClose} footer={footer}>
      {body()}
    </InfoModal>
  );
}
