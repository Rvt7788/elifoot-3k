import { useState } from "react";
import { useStore, needsUserShootout } from "./store";
import PenaltyShootout from "./components/PenaltyShootout";
import SettingsModal from "./components/SettingsModal";
import { AppDialogHost } from "./components/AppDialog";
import NewGame from "./components/NewGame";
import ClubHome from "./components/ClubHome";
import MatchDay from "./components/MatchDay";
import Standings from "./components/Standings";
import Squad from "./components/Squad";
import Market from "./components/Market";
import Training from "./components/Training";
import { IconClub, IconBall, IconTable, IconSquad, IconMarket, IconTraining, IconGear, IconPlay, IconLive } from "./components/icons";

type Tab = "clube" | "rodada" | "tabela" | "elenco" | "treino" | "mercado";

// Convite de clube maior após temporada de sucesso: aceitar assume o novo time.
function JobOfferModal() {
  const game = useStore((s) => s.game);
  const acceptJobOffer = useStore((s) => s.acceptJobOffer);
  const declineJobOffer = useStore((s) => s.declineJobOffer);
  if (!game?.jobOffer) return null;
  const club = game.clubs.find((c) => c.id === game.jobOffer);
  if (!club) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-amber-600/60 bg-zinc-900 p-5">
        <h2 className="mb-2 font-display text-lg font-bold text-amber-400">📞 Convite recebido</h2>
        <p className="mb-2 text-pretty text-sm leading-relaxed text-zinc-300">
          Técnico, o futebol inteiro viu o que você construiu nesta temporada — com
          elenco limitado, contra prognósticos, jogo após jogo. Feitos assim não
          passam despercebidos. O <b className="text-zinc-100">{club.name}</b> quer
          essa mentalidade no comando do projeto.
        </p>
        <p className="mb-2 text-pretty text-sm leading-relaxed text-zinc-300">
          Aqui você terá liberdade total: monte o elenco, escolha o estilo, conduza
          o clube do seu jeito. Orçamento de €{(club.baseBudget / 1e6).toFixed(1)}M
          à sua disposição. Queremos o seu futebol, não um manual.
        </p>
        <p className="mb-4 text-right text-xs italic text-zinc-500">
          Presidente do {club.name}
        </p>
        <p className="mb-4 text-xs text-zinc-500">
          Aceitar troca de clube imediatamente — a decisão é definitiva.
        </p>
        <div className="flex gap-2">
          <button onClick={acceptJobOffer} className="btn-cta flex-1 py-2">
            Aceitar convite
          </button>
          <button
            onClick={declineJobOffer}
            className="flex-1 rounded bg-zinc-800 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
          >
            Ficar onde estou
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { game, live, startMatchday, finishMatchday } = useStore();
  const [tab, setTab] = useState<Tab>("clube");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shootoutOpen, setShootoutOpen] = useState(false);

  if (!game)
    return (
      <>
        <AppDialogHost />
        <NewGame />
        {/* engrenagem discreta no rodapé da tela inicial */}
        <div className="flex justify-center pb-6">
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-800"
            title="Configurações"
          >
            <IconGear className="h-5 w-5" />
          </button>
        </div>
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      </>
    );
  const liveRunning = live !== null;
  const liveFinished = liveRunning && live.every((m) => m.finished);

  const TABS: { key: Tab; label: string; Icon: typeof IconClub }[] = [
    { key: "clube", label: "Clube", Icon: IconClub },
    { key: "rodada", label: "Rodada", Icon: IconBall },
    { key: "tabela", label: "Tabela", Icon: IconTable },
    { key: "elenco", label: "Elenco", Icon: IconSquad },
    { key: "treino", label: "Treino", Icon: IconTraining },
    { key: "mercado", label: "Mercado", Icon: IconMarket },
  ];

  let headerBtnLabel = "Jogar";
  let headerBtnClass = "btn-play";
  let headerBtnIcon = <IconPlay className="h-4 w-4" />;
  let headerBtnOnClick = () => {
    startMatchday();
    setTab("rodada");
  };
  // "Ao vivo" só aparece fora da aba Rodada — lá dentro já se vê o jogo rolando
  let showHeaderBtn = true;

  if (liveRunning) {
    if (liveFinished) {
      headerBtnLabel = "Encerrar rodada";
      headerBtnClass = "btn-ghost-amber";
      headerBtnIcon = <span className="text-xs">✔</span>;
      headerBtnOnClick = () => {
        // empate no agregado da copa: decide nos pênaltis antes de encerrar
        if (needsUserShootout(game, live)) {
          setShootoutOpen(true);
          return;
        }
        finishMatchday();
        setTab("clube");
      };
    } else {
      headerBtnLabel = "Ao vivo";
      headerBtnClass = "btn-ghost-red";
      headerBtnIcon = <IconLive className="h-4 w-4" />;
      headerBtnOnClick = () => {
        setTab("rodada");
      };
      showHeaderBtn = tab !== "rodada";
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        {/* mobile: 3 linhas empilhadas (logo, abas, iniciar rodada); md+: 1 linha centralizada */}
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-1.5 px-3 py-2 md:flex-row md:flex-wrap md:justify-center md:gap-4">
          <img
            src="/elifoot3k.png"
            alt="Elifoot 3k"
            className="h-16 w-auto"
            style={{
              // feather: bordas da logo se dissolvem no fundo em todas as direções
              WebkitMaskImage: "radial-gradient(ellipse 75% 75% at 50% 50%, black 60%, transparent 100%)",
              maskImage: "radial-gradient(ellipse 75% 75% at 50% 50%, black 60%, transparent 100%)",
            }}
          />
          <div className="flex w-full items-center gap-0.5 md:w-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 rounded px-2 py-2.5 text-sm md:flex-none ${
                  tab === t.key ? "btn-metal-tab" : "tab-button"
                }`}
                title={t.label}
              >
                <t.Icon className="h-5 w-5" />
                <span className="hidden lg:inline">{t.label}</span>
              </button>
            ))}
            <button
              onClick={() => setSettingsOpen(true)}
              className="ml-1 flex-1 tab-button rounded px-2 py-2.5 text-sm text-zinc-400 md:flex-none"
              title="Configurações"
            >
              <IconGear className="h-5 w-5" />
            </button>
          </div>
          {/* Botão só aparece no cabeçalho durante a rodada ao vivo (Ao vivo / Encerrar).
              O "Iniciar jogo" fica dentro da seção Próximo jogo, na tela do clube. */}
          {liveRunning && showHeaderBtn && (
            <button
              onClick={headerBtnOnClick}
              className={`flex items-center justify-center gap-2 px-4 py-2 text-base font-semibold md:w-full ${headerBtnClass}`}
            >
              {headerBtnIcon}
              {headerBtnLabel}
            </button>
          )}
        </div>
      </header>

      <AppDialogHost />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {!liveRunning && <JobOfferModal />}
      {shootoutOpen && (
        <PenaltyShootout
          onDone={(winnerId) => {
            setShootoutOpen(false);
            finishMatchday(winnerId);
            setTab("clube");
          }}
        />
      )}

      {tab === "clube" && (
        <ClubHome
          onStartMatchday={() => {
            startMatchday();
            setTab("rodada");
          }}
        />
      )}
      {tab === "rodada" && <MatchDay onFinishRound={() => setTab("clube")} />}
      {tab === "tabela" && <Standings />}
      {tab === "elenco" && <Squad />}
      {tab === "treino" && <Training />}
      {tab === "mercado" && <Market />}
    </div>
  );
}
