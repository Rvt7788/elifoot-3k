import { useState } from "react";
import clubsData from "../data/clubs.json";
import type { Club } from "../types";
import { useStore } from "../store";
import { ScrollLock } from "./useLockBodyScroll";
import GameIcon from "./GameIcon";
import { readableOn } from "../game/color";

// bandeiras em mini PNG (public/flags): emoji de bandeira não renderiza em
// todo sistema (Windows/Chrome mostra só as letras do código do país)
// Países com elencos revisados ficam liberados; os demais seguem bloqueados na
// tela inicial até terem seus elencos atualizados. Jogo em português: Brasil e
// Portugal abrem a grade; bloqueados vão para o fim.
const COUNTRIES: Record<string, { name: string; locked?: boolean }> = {
  BR: { name: "Brasil" },
  PT: { name: "Portugal" },
  AR: { name: "Argentina" },
  EN: { name: "Inglaterra" },
  ES: { name: "Espanha" },
  IT: { name: "Itália" },
  DE: { name: "Alemanha", locked: true },
  FR: { name: "França", locked: true },
};

function isDarkColor(hex: string): boolean {
  const m = hex.replace("#", "");
  const r = parseInt(m.substring(0, 2), 16);
  const g = parseInt(m.substring(2, 4), 16);
  const b = parseInt(m.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.25;
}

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

// Nome do presidente: sorteado de forma determinística a partir do id do clube,
// para que o mesmo clube tenha sempre o mesmo presidente (assinatura estável) sem
// precisar persistir nada — cada save/time ganha o seu.
const PRES_FIRST = [
  "Aldair", "Benedito", "Cláudio", "Douglas", "Edmundo", "Fábio", "Gilberto",
  "Hélio", "Ivan", "Jorge", "Laércio", "Marcelo", "Nélson", "Osvaldo", "Paulo",
  "Ricardo", "Sérgio", "Tarcísio", "Valdir", "Wagner",
];
const PRES_LAST = [
  "Andrade", "Bezerra", "Carvalho", "Dantas", "Esteves", "Furtado", "Gonçalves",
  "Hidalgo", "Ibrahim", "Junqueira", "Klein", "Lacerda", "Meireles", "Nogueira",
  "Ottoni", "Pontes", "Queiroz", "Rangel", "Siqueira", "Teixeira", "Vasconcelos",
];
export function presidentName(clubId: string): string {
  let h = 2166136261;
  for (let i = 0; i < clubId.length; i++) {
    h ^= clubId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const first = PRES_FIRST[(h >>> 0) % PRES_FIRST.length];
  const last = PRES_LAST[((h >>> 8) >>> 0) % PRES_LAST.length];
  return `${first} ${last}`;
}

// Boas-vindas do presidente: 5 variações no mesmo tom, sorteadas a cada abertura
// do modal para a recepção nunca ser igual. {name} vira o nome do técnico.
const WELCOME_MESSAGES: { p1: string; p2: string }[] = [
  {
    p1: "Professor {name}, a papelada está assinada e o clube é seu a partir de agora. O orçamento pede criatividade e o elenco é enxuto, mas o gramado está impecável, o vestiário é unido e a rapaziada treina firme desde janeiro. Todo gigante já esteve exatamente onde estamos hoje.",
    p2: "O vestiário é todo seu, técnico. Apostamos na sua mentalidade. Mostre a eles do que você é capaz.",
  },
  {
    p1: "Técnico {name}, aqui o dinheiro é contado e cada contratação precisa fazer sentido — é assim que trabalhamos. Em compensação, você herda um grupo sedento por vencer, uma cidade que acompanha cada rodada de perto e uma diretoria que escolheu o seu nome a dedo para liderar o projeto.",
    p2: "Faça esses garotos jogarem com o coração. O resto a gente constrói no dia a dia, lado a lado.",
  },
  {
    p1: "Professor {name}, conversamos com bons nomes antes de bater o martelo, e em nenhum deles a ficha caiu como caiu com você. Vimos o seu trabalho, entendemos a sua ideia de jogo e chegamos à mesma conclusão: este projeto tem exatamente o tamanho da sua capacidade.",
    p2: "A prancheta está nas suas mãos. Vá lá fora e transforme essa aposta em orgulho para a torcida.",
  },
  {
    p1: "Técnico {name}, a nossa torcida guarda de cor as glórias do passado e quer ver o time brigando no topo outra vez. O que ela pede é simples: um time com alma, que dispute cada bola até o fim, e um comandante que acredite no projeto tanto quanto ela acredita.",
    p2: "Devolva o brilho nos olhos e o orgulho a essa gente. Seja muito bem-vindo ao desafio da sua carreira.",
  },
  {
    p1: "Professor {name}, nossa folha salarial é modesta e o banco de reservas é curto — números que você já conhece. Mas o futebol nos lembra toda semana que uma ideia corajosa e bem treinada rende mais do que qualquer cifra, e é nesse terreno que pretendemos brigar.",
    p2: "Coloque a sua identidade em campo. A prancheta agora é sua, e nós daremos todo o suporte.",
  },
  {
    p1: "Técnico {name}, esta casa é pequena no orçamento e grande no resto: sócio que paga em dia, base que revela jogador todo ano e um centro de treinamento que é o orgulho da região. Faltava alguém com ideia clara para amarrar tudo isso dentro de campo.",
    p2: "Esse alguém é você. Ponha o time para jogar e deixe o resto com a gente.",
  },
  {
    p1: "Professor {name}, a cidade inteira vive em função deste clube. Na segunda-feira o resultado de domingo está na padaria, na barbearia e na fila do banco. Não é pressão, é combustível — e nenhum clube grande do país tem uma torcida que se importe mais do que a nossa.",
    p2: "Dê a eles um time à altura dessa paixão. A camisa está nas suas mãos.",
  },
  {
    p1: "Técnico {name}, você assume um grupo jovem, e isso é uma escolha nossa, não um acaso. São meninos que correm os noventa minutos, escutam o que se fala no vestiário e ainda têm tudo por aprender. Nas mãos certas, um elenco assim evolui rápido demais.",
    p2: "As mãos certas são as suas. Lapide esse grupo e a temporada vai nos surpreender.",
  },
  {
    p1: "Professor {name}, nosso planejamento não é para daqui a cinco anos: é para esta temporada. As contas estão em ordem, o elenco foi montado com cuidado e o calendário nos favorece no começo. Agora falta a parte que só um técnico entrega — um time com cara, método e coragem.",
    p2: "Comece por aí, e nós seguramos as pontas do lado de fora. Bem-vindo ao clube.",
  },
  {
    p1: "Técnico {name}, ninguém aqui vai cobrar título logo na estreia, mas queremos ver um time reconhecível em campo já nas primeiras rodadas. Se a torcida sair do estádio sabendo como a sua equipe joga, o resto vem com o tempo e com o trabalho de todo dia.",
    p2: "Construa esse time do seu jeito. A paciência é nossa, a prancheta é sua.",
  },
];

export default function NewGame() {
  const startGame = useStore((s) => s.startGame);
  const clubs = clubsData as Club[];
  const [managerName, setManagerName] = useState("");
  // null = "Qualquer": o sorteio escolhe antes um dos países liberados
  const [country, setCountry] = useState<string | null>("BR");
  const [club, setClub] = useState<Club | null>(null);
  // bilhete premiado: rolado uma vez ao abrir a tela — clicar de novo no dado
  // não rola a sorte de novo, só sorteia outro clube dentro do mesmo pool
  const [lucky] = useState(() => Math.random() < 0.05);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  // valor de partida: o modal só abre com um clube sorteado, e o sorteio já
  // define a carta — este inicial existe apenas para o estado nunca ser nulo
  const [welcomeMsg, setWelcomeMsg] = useState(WELCOME_MESSAGES[0]);

  function drawRandom(pool: Club[]) {
    // evita repetir o mesmo clube em sorteios seguidos, quando há opção
    const options = club && pool.length > 1 ? pool.filter((c) => c.id !== club.id) : pool;
    const drawn = options[Math.floor(Math.random() * options.length)];
    setClub(drawn);
    // a carta é sorteada junto com o clube, e não ao abrir o modal: assim ela
    // fica atrelada ao sorteio e não troca a cada "Começar carreira"
    setWelcomeMsg(WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]);
  }

  // time de cor clara pede texto escuro, e aí a sombra clara é que dá relevo
  const bannerTextDark = club ? readableOn(club.primaryColor) !== "#ffffff" : false;

  return (
    // justify-start (e não center): ancorado no topo, o conteúdo cresce para
    // baixo quando o clube é sorteado. Com justify-center a sobra de espaço era
    // dividida em cima e embaixo, então cada elemento novo encolhia a margem
    // superior e empurrava a logo para cima.
    <div className="mx-auto flex min-h-[88vh] w-full max-w-2xl flex-col justify-start px-8 pb-6 pt-[8vh] sm:px-6">
      <img
        src="/elifoot3klogo.png"
        alt="Elifoot 3K — Manager de futebol do futuro"
        className="mx-auto mb-8 w-full max-w-md px-10 sm:px-0 [filter:drop-shadow(0_0_18px_rgba(34,211,238,0.55))]"
      />

      <div className="mx-auto mb-6 max-w-md text-center">
        <p className="text-pretty text-sm leading-relaxed text-zinc-400">
          Toda lenda do futebol tem um primeiro capítulo, e ele nunca começa na
          elite. Um clube pequeno espera por você. Escreva seu nome e comece sua
          história. Toda carreira começa de baixo.
        </p>
      </div>

      {/* não-controlado de propósito: a digitação nunca depende de re-render;
          o estado só guarda o valor para habilitar o "Começar carreira".
          a listra usa o mesmo ciano da sombra da logo: rgb(34,211,238) */}
      <input
        type="text"
        name="managerName"
        defaultValue={managerName}
        onInput={(e) => setManagerName((e.target as HTMLInputElement).value)}
        placeholder="Seu Nome"
        maxLength={16}
        autoComplete="off"
        spellCheck={false}
        className="mx-auto mb-6 block w-full max-w-xs border-b border-[rgba(34,211,238,0.55)] bg-transparent px-2 py-2 text-center font-semibold tracking-wide text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-[rgb(34,211,238)]"
      />

      {/* seleção de país em grade 3×3: países sem elencos atualizados ficam
          bloqueados (cadeado) */}
      <nav className="mx-auto mb-6 grid w-fit grid-cols-3 gap-x-4 gap-y-1 sm:gap-x-6">
        {Object.entries(COUNTRIES).map(([code, { name, locked }]) => (
          <button
            key={code}
            disabled={locked}
            onClick={() => { if (locked) return; setCountry(code); setClub(null); }}
            className={`country-tab text-left ${country === code ? "active" : ""} ${locked ? "cursor-not-allowed opacity-40" : ""}`}
            title={locked ? "Em breve: elencos deste país ainda serão atualizados" : undefined}
          >
            <Flag code={code} />
            {name}
            {locked && <span className="ml-1 text-[9px]">🔒</span>}
          </button>
        ))}
        {/* "Qualquer": sorteio entre os países liberados */}
        <button
          onClick={() => { setCountry(null); setClub(null); }}
          className={`country-tab text-left ${country === null ? "active" : ""}`}
        >
          <span className="mr-1.5 inline-flex h-3 w-[18px] items-center justify-center rounded-[1px] border border-zinc-600 align-middle text-[9px] leading-none text-zinc-400">?</span>
          Qualquer
        </button>
      </nav>

      <div className="mb-6 flex justify-center">
        <button
          onClick={() => {
            // "Qualquer" sorteia primeiro o país: juntar as Séries B de todos e
            // pegar os 10 mais pobres cairia sempre no país de orçamento menor
            const open = Object.keys(COUNTRIES).filter((c) => !COUNTRIES[c].locked);
            const target = country ?? open[Math.floor(Math.random() * open.length)];
            drawRandom(serieBPool(clubs, lucky, target));
          }}
          className="btn-cta inline-flex items-center px-6 py-2"
          title={country ? "Sorteia um clube pequeno da Série B do país selecionado" : "Sorteia um clube pequeno da Série B de um dos países liberados"}
        >
          <span className="mr-2 inline-flex align-middle"><GameIcon name="dice" size={15} /></span>
          {club ? "Sortear outro" : "Sortear clube"}
        </button>
      </div>

      {club && (
        <>
          {/* mesma tarja da página do clube: gradiente na cor primária, mastro
              na secundária e bandeira do país à direita — a identidade visual do
              clube é a mesma desde o sorteio */}
          <div
            className="metal-relief relative mb-6 h-24 overflow-hidden rounded-md"
            style={{
              background: `linear-gradient(180deg, color-mix(in srgb, ${club.primaryColor} 80%, white) 0%, ${club.primaryColor} 45%, color-mix(in srgb, ${club.primaryColor} 82%, black) 100%)`,
              ["--relief-edge" as string]: club.secondaryColor,
              ["--relief-base" as string]: "rgba(0,0,0,0.45)",
            }}
          >
            <div
              className="absolute inset-y-0 left-0 w-2"
              style={{ background: club.secondaryColor }}
            />
            {/* py maior no mobile deixa a bandeira menor e libera largura para o
                nome, que aqui tem menos espaço que na página do clube */}
            <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center py-7 sm:right-6 sm:py-4">
              <img
                src={`/flags/${club.country.toLowerCase()}.png`}
                alt={club.country}
                className="h-full w-auto rounded-sm opacity-95 [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.5))]"
              />
            </div>
            {/* pr reservado para a bandeira, que é absolute e não empurra o texto */}
            <div className="relative flex h-full flex-col justify-center [container-type:inline-size] px-4 py-2.5 pl-6 pr-[74px] sm:pl-10 sm:pr-[150px]">
              <div
                className="ui-title leading-tight"
                style={{
                  color: readableOn(club.primaryColor),
                  fontSize: `clamp(0.8rem, min(9cqi, ${(100 / (club.name.length * 0.7)).toFixed(2)}cqi), 2.4rem)`,
                  textShadow: bannerTextDark
                    ? "0 1px 2px rgba(255,255,255,0.55)"
                    : "0 2px 4px rgba(0,0,0,0.55)",
                }}
              >
                {club.name}
              </div>
              <div
                className="flex items-center gap-3 text-sm leading-tight opacity-90"
                style={{
                  color: readableOn(club.primaryColor),
                  textShadow: bannerTextDark
                    ? "0 1px 1px rgba(255,255,255,0.5)"
                    : "0 1px 2px rgba(0,0,0,0.5)",
                }}
              >
                <span>{club.division}</span>
                <span className="font-mono text-xs">
                  ${(club.baseBudget / 1e6).toFixed(1)}M
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              if (!managerName.trim()) return;
              setWelcomeOpen(true);
            }}
            disabled={!managerName.trim()}
            className="btn-cta mx-auto mb-6 block px-6 py-2"
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
            style={{
              background: club.primaryColor,
              color: club.secondaryColor,
              boxShadow: isDarkColor(club.primaryColor)
                ? `0 24px 60px -12px ${club.secondaryColor}80, 0 8px 24px -8px ${club.secondaryColor}66`
                : `0 24px 60px -12px ${club.primaryColor}80, 0 8px 24px -8px ${club.primaryColor}66`,
            }}
          >
            <button
              onClick={() => setWelcomeOpen(false)}
              className="absolute right-3 top-3 opacity-70 hover:opacity-100"
              title="Fechar"
            >
              ✕
            </button>
            <h2 className="mb-7 text-center font-display text-lg font-bold">
              Bem-vindo ao {club.name}
            </h2>
            <p className="mb-2 text-pretty text-center text-sm leading-relaxed">
              {welcomeMsg.p1.replace("{name}", managerName.trim())}
            </p>
            <p className="mb-8 text-pretty text-center text-sm leading-relaxed">
              {welcomeMsg.p2}
            </p>
            <p className="mb-0.5 text-center font-display text-xl italic opacity-90">
              {presidentName(club.id)}
            </p>
            <p className="mb-12 text-center text-xs italic opacity-80">
              Presidente do {club.name}
            </p>
            <div className="flex justify-center">
              <button
                onClick={() => startGame(Date.now() >>> 0, club.id, managerName.trim())}
                className="btn-cta px-8 py-2"
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
