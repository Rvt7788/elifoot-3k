import { useState } from "react";
import { useStore, needsUserShootout } from "./store";
import PenaltyShootout from "./components/PenaltyShootout";
import SettingsModal from "./components/SettingsModal";
import NewGame from "./components/NewGame";
import ClubHome from "./components/ClubHome";
import MatchDay from "./components/MatchDay";
import Standings from "./components/Standings";
import Squad from "./components/Squad";
import Market from "./components/Market";
import Training from "./components/Training";
import { IconClub, IconBall, IconTable, IconSquad, IconMarket, IconTraining, IconGear, IconPlay, IconLive } from "./components/icons";

type Tab = "clube" | "rodada" | "tabela" | "elenco" | "treino" | "mercado";

export default function App() {
  const { game, live, startMatchday, finishMatchday } = useStore();
  const [tab, setTab] = useState<Tab>("clube");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shootoutOpen, setShootoutOpen] = useState(false);

  if (!game)
    return (
      <>
        <div className="flex justify-end p-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-800"
            title="Configurações"
          >
            <IconGear className="h-5 w-5" />
          </button>
        </div>
        <NewGame />
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

  let headerBtnLabel = "Iniciar jogo";
  let headerBtnClass = "btn-metal-green";
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
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-1.5 px-3 py-2 md:flex-row md:justify-center md:gap-4">
          <img src="/elifoot3k.png" alt="Elifoot 3k" className="h-8 w-auto" />
          <div className="flex items-center gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded px-2 py-1.5 text-sm ${
                  tab === t.key ? "btn-metal-tab" : "tab-button"
                }`}
                title={t.label}
              >
                <t.Icon className="h-4 w-4" />
                <span className="hidden lg:inline">{t.label}</span>
              </button>
            ))}
            <button
              onClick={() => setSettingsOpen(true)}
              className="ml-1 tab-button rounded px-2 py-1.5 text-sm text-zinc-400"
              title="Configurações"
            >
              <IconGear className="h-5 w-5" />
            </button>
          </div>
          {showHeaderBtn && (
            <button
              onClick={headerBtnOnClick}
              className={`flex items-center gap-2 rounded px-4 py-2 text-base font-semibold ${headerBtnClass}`}
            >
              {headerBtnIcon}
              {headerBtnLabel}
            </button>
          )}
        </div>
      </header>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {shootoutOpen && (
        <PenaltyShootout
          onDone={(winnerId) => {
            setShootoutOpen(false);
            finishMatchday(winnerId);
            setTab("clube");
          }}
        />
      )}

      {tab === "clube" && <ClubHome />}
      {tab === "rodada" && <MatchDay onFinishRound={() => setTab("clube")} />}
      {tab === "tabela" && <Standings />}
      {tab === "elenco" && <Squad />}
      {tab === "treino" && <Training />}
      {tab === "mercado" && <Market />}
    </div>
  );
}
