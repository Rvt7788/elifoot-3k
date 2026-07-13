import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { appAlert } from "./AppDialog";

// Tela do técnico demitido: sem clube, sem abas, sem nada para gerenciar — só o
// nome do técnico, o aviso e o pulo temporal até a virada da temporada, quando
// chega o convite de um clube em reconstrução (JobOfferModal por cima).
// `skipSignal` muda quando o usuário NEGA um convite: roda o pulo de novo até
// aparecer o convite de outro clube.
export default function FiredScreen({ skipSignal = 0 }: { skipSignal?: number }) {
  const game = useStore((s) => s.game);
  const skipToSeasonEnd = useStore((s) => s.skipToSeasonEnd);
  // a simulação das rodadas restantes trava a UI por um instante — marca o clique
  // na hora e roda no frame seguinte, como o "Pular rodada" da home
  const [skipping, setSkipping] = useState(false);
  const handleSkip = () => {
    if (skipping) return;
    setSkipping(true);
    setTimeout(() => {
      const ok = skipToSeasonEnd();
      setSkipping(false);
      if (!ok)
        appAlert(
          "O calendário deste save não conseguiu avançar. Salve em outro slot e recarregue a página; se persistir, o save está corrompido.",
        );
    }, 50);
  };
  // só reage a MUDANÇAS do sinal (convite negado agora) — não ao valor herdado
  // de uma demissão anterior quando a tela remonta
  const lastSignal = useRef(skipSignal);
  useEffect(() => {
    if (skipSignal !== lastSignal.current) {
      lastSignal.current = skipSignal;
      handleSkip();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipSignal]);
  if (!game) return null;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <img
        src="/elifoot3klogo.png"
        alt="Elifoot 3k"
        className="mb-10 h-14 w-auto [filter:drop-shadow(0_0_18px_rgba(34,211,238,0.55))]"
      />
      <p className="font-display text-2xl font-bold text-zinc-200">
        {game.managerName ?? "Técnico"}
      </p>
      <p className="mx-auto mt-6 max-w-[17rem] text-balance text-base leading-relaxed text-zinc-400">
        {game.firedReason === "moral"
          ? "A moral da torcida zerou e a diretoria decretou o fim da sua passagem."
          : "O clube faliu e a diretoria decretou o fim da sua passagem."}{" "}
        Obrigado pelo empenho e desejamos boa sorte para o seu futuro.
      </p>
      <button
        onClick={handleSkip}
        disabled={skipping}
        className="btn-live btn-live--dark mt-10 w-fit !rounded-full px-6 py-2.5 text-sm disabled:opacity-50"
      >
        {skipping ? "Avançando temporada..." : "Assumir novo clube"}
      </button>
    </div>
  );
}
