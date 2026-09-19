import { useState } from "react";
import InfoModal from "./InfoModal";

const FAQ: { q: string; a: string }[] = [
  {
    q: "Preciso de internet para jogar?",
    a: "Só na primeira vez, para carregar o jogo. Depois disso tudo roda no seu aparelho: as partidas, o mercado, os treinos e os saves. Instalando o jogo na tela de início, dá para jogar no avião, no metrô ou com o celular em modo avião, sem perder nada.",
  },
  {
    q: "Onde fica o meu save?",
    a: "No próprio navegador, em até dez slots. Nada sobe para servidor. Limpar os dados do navegador apaga os saves, por isso vale baixar o arquivo de save de vez em quando em Configurações › Arquivo externo.",
  },
  {
    q: "O jogo salva sozinho?",
    a: "Salva. A partida em andamento fica guardada a cada passo, e ao reabrir o app você volta de onde parou. Os dez slots servem para guardar pontos da carreira que você queira retomar depois.",
  },
  {
    q: "Posso continuar o jogo em outro aparelho?",
    a: "Sim, pelo arquivo de save. Baixe o save em um aparelho e carregue no outro, também em Configurações › Arquivo externo.",
  },
  {
    q: "Por que meu time começa na Série B?",
    a: "A carreira começa de baixo, de propósito. O clube é sorteado na Série B, com uma chance pequena de cair um dos dez melhores da divisão. A subida vem do mérito em campo ou de convite de um clube maior.",
  },
  {
    q: "Os nomes de clubes e jogadores são reais?",
    a: "Não. Os elencos são fictícios, gerados pelo jogo. Qualquer semelhança é coincidência.",
  },
  {
    q: "Achei um bug. O que faço?",
    a: "Mande pelo formulário, em Apoie o projeto. Descreva o que aconteceu e, se der, em que ponto da temporada o problema apareceu.",
  },
];

function Accordion({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-zinc-700 bg-zinc-800/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[15px] font-medium text-zinc-100"
      >
        <span>{q}</span>
        <span className="shrink-0 text-zinc-500">{open ? "−" : "+"}</span>
      </button>
      {open && <p className="px-3 pb-3 text-[13px] leading-relaxed text-zinc-400">{a}</p>}
    </div>
  );
}

export default function FaqModal({ onClose }: { onClose: () => void }) {
  return (
    <InfoModal icon="light" title="Perguntas frequentes" onClose={onClose}>
      <div className="flex flex-col gap-1">
        {FAQ.map((f) => (
          <Accordion key={f.q} q={f.q} a={f.a} />
        ))}
      </div>
    </InfoModal>
  );
}
