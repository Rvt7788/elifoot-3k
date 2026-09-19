import { useState, type ReactNode } from "react";
import InstallModal from "./InstallModal";
import FaqModal from "./FaqModal";
import SupportModal from "./SupportModal";
import { isStandalone } from "../game/install";

type FooterModal = "instalar" | "faq" | "apoie";

/** Rodapé discreto: instalação, FAQ e apoio ao projeto. */
export default function AppFooter({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState<FooterModal | null>(null);
  // já rodando como app instalado: o link de instalar não tem serventia
  const showInstall = !isStandalone();

  const Link = ({ to, label }: { to: FooterModal; label: string }) => (
    <button onClick={() => setOpen(to)} className="px-1 text-zinc-500 hover:text-zinc-300">
      {label}
    </button>
  );

  return (
    <>
      <footer className="flex flex-col items-center gap-5 px-4 pb-6 pt-4 text-xs">
        {children}
        <div className="flex flex-wrap items-center justify-center gap-1">
          {showInstall && (
            <>
              <Link to="instalar" label="Instalar" />
              <span className="text-zinc-700">·</span>
            </>
          )}
          <Link to="faq" label="FAQ" />
          <span className="text-zinc-700">·</span>
          <Link to="apoie" label="Apoie o projeto" />
        </div>
      </footer>

      {open === "instalar" && <InstallModal onClose={() => setOpen(null)} />}
      {open === "faq" && <FaqModal onClose={() => setOpen(null)} />}
      {open === "apoie" && <SupportModal onClose={() => setOpen(null)} />}
    </>
  );
}
