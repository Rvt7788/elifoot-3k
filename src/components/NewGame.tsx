import { useState } from "react";
import clubsData from "../data/clubs.json";
import type { Club } from "../types";
import { useStore } from "../store";
import { ScrollLock } from "./useLockBodyScroll";

// bandeiras em mini PNG (public/flags): emoji de bandeira não renderiza em
// todo sistema (Windows/Chrome mostra só as letras do código do país)
const COUNTRIES: Record<string, { name: string }> = {
  BR: { name: "Brasil" },
  AR: { name: "Argentina" },
  EN: { name: "Inglaterra" },
  ES: { name: "Espanha" },
  DE: { name: "Alemanha" },
  FR: { name: "França" },
  IT: { name: "Itália" },
  PT: { name: "Portugal" },
};

function Flag({ code }: { code: string }) {
  return (
    <img
      src={`/flags/${code.toLowerCase()}.png`}
      alt=""
      className="mr-1.5 inline-block h-3 w-auto rounded-[1px] align-middle"
      loading="lazy"
    />
  );
}

// Todo técnico começa de baixo: o sorteio considera os 10 clubes mais pobres da
// Série B do país — com uma chance remota (5%) de sair um dos 10 melhores da
// Série B, o "bilhete premiado" da carreira. A sorte é rolada uma única vez por
// visita à tela (não por clique), para não dar para re-sortear até vir time bom.
// Subir para um clube grande de verdade continua sendo conquista (convite após
// temporada de sucesso).
function serieBPool(clubs: Club[], lucky: boolean, country?: string): Club[] {
  const b = clubs
    .filter((c) => c.division === "Série B" && (!country || c.country === country))
    .sort((a, b2) => a.baseBudget - b2.baseBudget);
  return lucky ? b.slice(-Math.min(10, b.length)) : b.slice(0, Math.min(10, b.length));
}

// Boas-vindas do presidente: 5 variações no mesmo tom, sorteadas a cada abertura
// do modal para a recepção nunca ser igual. {name} vira o nome do técnico.
const WELCOME_MESSAGES: { p1: string; p2: string }[] = [
  {
    p1: "Professor {name}, as luzes do estádio já estão se apagando e a diretoria acaba de assinar a sua papelada. Sabemos que o orçamento é curto, o elenco é limitado e as arquibancadas andam meio vazias ultimamente. Mas o futebol é feito de superação, e todo gigante começou exatamente onde estamos hoje.",
    p2: "O vestiário é todo seu, técnico. Nós acreditamos na sua mentalidade. Mostre a eles do que você é capaz.",
  },
  {
    p1: "Técnico {name}, não vamos te vender ilusões: aqui você não vai encontrar estruturas de ponta nem salários astronômicos. Mas há um grupo sedento por vencer, uma cidade inteira de olho em cada rodada e uma diretoria que escolheu você a dedo para liderar esse projeto.",
    p2: "Faça esses garotos jogarem com o coração. O resto a gente constrói no dia a dia, lado a lado.",
  },
  {
    p1: "Professor {name}, para ser sincero, outros recusaram este cargo antes de você chegar. Acharam o desafio pesado demais e o elenco muito curto. Mas nós sabíamos exatamente quem queríamos no comando. Acreditamos que este desafio tem o tamanho exato da sua capacidade.",
    p2: "A prancheta está nas suas mãos. Vá lá fora e transforme toda essa desconfiança em orgulho para a torcida.",
  },
  {
    p1: "Técnico {name}, a nossa torcida não esquece as glórias do passado e sente falta de ver o time brigando no topo. O que eles pedem é simples: um time com alma, que divida cada bola e um comandante que acredite no projeto tanto quanto eles.",
    p2: "Devolva o brilho nos olhos e o orgulho a essa gente. Seja muito bem-vindo ao desafio da sua carreira.",
  },
  {
    p1: "Professor {name}, os cofres do clube estão quase vazios e nosso banco de reservas é enxuto — não há mistério nisso. No entanto, o futebol nos ensina toda semana que ideias grandes e corajosas valem muito mais do que folhas salariais astronômicas.",
    p2: "Coloque a sua identidade em campo. A prancheta agora é sua, e nós daremos todo o suporte.",
  },
];

export default function NewGame() {
  const startGame = useStore((s) => s.startGame);
  const clubs = clubsData as Club[];
  const [managerName, setManagerName] = useState("");
  // null = nenhum país selecionado: o sorteio é geral (qualquer país)
  const [country, setCountry] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  // bilhete premiado: rolado uma vez ao abrir a tela — clicar de novo no dado
  // não rola a sorte de novo, só sorteia outro clube dentro do mesmo pool
  const [lucky] = useState(() => Math.random() < 0.05);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState(WELCOME_MESSAGES[0]);

  function drawRandom(pool: Club[]) {
    // evita repetir o mesmo clube em sorteios seguidos, quando há opção
    const options = club && pool.length > 1 ? pool.filter((c) => c.id !== club.id) : pool;
    const drawn = options[Math.floor(Math.random() * options.length)];
    setClub(drawn);
  }

  return (
    // min-h + justify-center: o bloco inteiro fica verticalmente centrado na tela,
    // tanto no desktop quanto no mobile (o rodapé com a engrenagem fica abaixo)
    <div className="mx-auto flex min-h-[88vh] w-full max-w-2xl flex-col justify-center px-8 pb-6 pt-12 sm:px-6">
      <img
        src="/elifoot3k.png"
        alt="Elifoot 3K — Manager de futebol do futuro"
        className="mx-auto mb-8 w-full max-w-md px-10 sm:px-0"
        style={{
          // feather: as bordas da logo se dissolvem no fundo em todas as direções
          WebkitMaskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, black 55%, transparent 100%)",
          maskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, black 55%, transparent 100%)",
        }}
      />

      <div className="mx-auto mb-6 max-w-md text-center">
        <p className="ui-label mb-3" style={{ color: "#fbbf24" }}>
          Toda carreira começa de baixo
        </p>
        <p className="text-pretty text-sm leading-relaxed text-zinc-400">
          Toda lenda do futebol tem um primeiro capítulo, e ele nunca começa na
          elite. Um clube pequeno espera por você. Escreva seu nome e comece sua
          história.
        </p>
      </div>

      {/* não-controlado de propósito: a digitação nunca depende de re-render;
          o estado só guarda o valor para habilitar o "Começar carreira" */}
      <input
        type="text"
        name="managerName"
        defaultValue={managerName}
        onInput={(e) => setManagerName((e.target as HTMLInputElement).value)}
        placeholder="Seu Nome"
        maxLength={30}
        autoComplete="off"
        spellCheck={false}
        className="mx-auto mb-6 block w-full max-w-xs border-b border-zinc-700 bg-transparent px-2 py-2 text-center font-semibold tracking-wide text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-emerald-500"
      />

      {/* seleção de país em grade 3×3 simétrica: 8 países + a opção vazia (sorteio
          geral), que ocupa a primeira célula com um ícone de bandeira em branco */}
      <nav className="mx-auto mb-6 grid w-fit grid-cols-3 gap-x-4 gap-y-1 sm:gap-x-6">
        {Object.entries(COUNTRIES).map(([code, { name }]) => (
          <button
            key={code}
            onClick={() => { setCountry(country === code ? null : code); setClub(null); }}
            className={`country-tab text-left ${country === code ? "active" : ""}`}
          >
            <Flag code={code} />
            {name}
          </button>
        ))}
        <button
          onClick={() => { setCountry(null); setClub(null); }}
          className={`country-tab text-left ${country === null ? "active" : ""}`}
          title="Nenhum país: sorteio geral"
        >
          <span className="mr-1.5 inline-flex h-3 w-[18px] items-center justify-center rounded-[1px] border border-zinc-600 align-middle text-[9px] leading-none text-zinc-400">?</span>
          Qualquer
        </button>
      </nav>

      <div className="mb-6 flex justify-center">
        <button
          onClick={() => drawRandom(serieBPool(clubs, lucky, country ?? undefined))}
          className="country-tab"
          title={country ? "Sorteia um clube pequeno da Série B do país selecionado" : "Sorteia um clube pequeno da Série B de qualquer país"}
        >
          <span className="mr-1.5">🎲</span>
          Sortear clube
        </button>
      </div>

      {club && (
        <>
          <div className="mx-auto mb-6 flex w-fit items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-3">
            <span
              className="inline-block h-3 w-3 rotate-45 border border-zinc-700"
              style={{ background: club.primaryColor }}
            />
            <span className="text-base font-semibold text-zinc-100">{club.name}</span>
            <span className="ui-label">{club.division}</span>
            <span className="font-mono text-xs text-zinc-500">
              ${(club.baseBudget / 1e6).toFixed(1)}M
            </span>
          </div>
          <button
            onClick={() => {
              if (!managerName.trim()) return;
              setWelcomeMsg(WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]);
              setWelcomeOpen(true);
            }}
            disabled={!managerName.trim()}
            className="btn-cta btn-cta--plain mx-auto mb-6 block px-6 py-2"
          >
            Começar carreira
          </button>
        </>
      )}

      {/* boas-vindas do presidente: o jogo só começa de fato ao assumir o comando */}
      {welcomeOpen && club && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <ScrollLock />
          {/* o modal veste as cores do clube: fundo primário, texto secundário;
              só o botão de ação mantém o visual do app */}
          <div
            className="relative w-full max-w-md rounded-xl p-5"
            style={{ background: club.primaryColor, color: club.secondaryColor }}
          >
            <button
              onClick={() => setWelcomeOpen(false)}
              className="absolute right-3 top-3 opacity-70 hover:opacity-100"
              title="Fechar"
            >
              ✕
            </button>
            <h2 className="mb-3 text-center font-display text-lg font-bold">
              Bem-vindo ao {club.name}
            </h2>
            <p className="mb-2 text-pretty text-sm leading-relaxed">
              {welcomeMsg.p1.replace("{name}", managerName.trim())}
            </p>
            <p className="mb-4 text-pretty text-sm leading-relaxed">
              {welcomeMsg.p2}
            </p>
            <p className="mb-4 text-right text-xs italic opacity-80">
              Presidente do {club.name}
            </p>
            <div className="flex justify-center">
              <button
                onClick={() => startGame(Date.now() >>> 0, club.id, managerName.trim())}
                className="btn-cta btn-cta--plain px-8 py-2"
                title="Assumir comando"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-emerald-400">
                  <path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
