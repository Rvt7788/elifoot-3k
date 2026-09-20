import { useState } from "react";
import GameIcon, { type GameIconName } from "./GameIcon";
import InfoModal from "./InfoModal";

/** Chave Pix aleatória (EVP): não expõe CPF, telefone nem e-mail do titular. */
const PIX_KEY = "c90f6d77-5ee1-4b32-91bf-981faefe0a6b";
/** Formulário público de sugestões e parceria. */
const FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSeUeD9cWaAFUv_EFvfxprxCWZ1rPMc0A3_oaI9K157X4Q6Ufg/viewform";

/** Cabeçalho de seção: mesmo peso visual para Pix e para sugestões. */
function SectionTitle({ icon, label }: { icon: GameIconName; label: string }) {
  return (
    <h3 className="mb-2 flex items-center justify-center text-base font-semibold text-zinc-100">
      {/* o rótulo é que fica centralizado; o ícone se pendura fora do fluxo */}
      <span className="relative">
        <span className="absolute right-full top-1/2 mr-1.5 -translate-y-1/2">
          <GameIcon name={icon} size={17} />
        </span>
        {label}
      </span>
    </h3>
  );
}

export default function SupportModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copyPix = async () => {
    try {
      await navigator.clipboard.writeText(PIX_KEY);
    } catch {
      return; // sem clipboard: a chave continua selecionável à mão
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <InfoModal icon="medal" title="Apoie o projeto" onClose={onClose}>
      {/* ── Contribuir com Pix ── */}
      <SectionTitle icon="finance" label="Contribuir com Pix" />
      <div className="mb-5 flex flex-col items-center gap-2">
        <p className="text-center text-xs leading-relaxed text-zinc-400">
          Quem quiser ajudar a manter o projeto de pé pode contribuir com o valor que quiser.
        </p>
        <code className="w-full select-all break-all rounded border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-center font-mono text-[12px] tracking-tight text-zinc-200">
          {PIX_KEY}
        </code>
        <button onClick={copyPix} className="btn-cta inline-flex w-fit items-center gap-2 px-5 py-2 text-[13px]">
          <GameIcon name="finance" size={15} /> {copied ? "Copiado" : "Copiar"}
        </button>
      </div>

      {/* ── Sugestões e parceria ── */}
      <SectionTitle icon="proposal" label="Sugestões e parceria" />
      <div className="flex flex-col items-center gap-2">
        <p className="text-center text-xs leading-relaxed text-zinc-400">
          Ajudar não é só com dinheiro: ideia, crítica e relato de bug valem tanto quanto.
        </p>
        <a
          href={FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-cta inline-flex w-fit items-center gap-2 px-5 py-2 text-[13px]"
        >
          <GameIcon name="proposal" size={15} /> Sugestão
        </a>
        <a
          href={FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-cta inline-flex w-fit items-center gap-2 px-5 py-2 text-[13px]"
        >
          <GameIcon name="deal" size={15} /> Parceria
        </a>
      </div>
    </InfoModal>
  );
}
