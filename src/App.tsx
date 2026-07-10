import { useState } from "react";
import { useStore, needsUserShootout, renewalCost } from "./store";
import { appAlert } from "./components/AppDialog";
import PenaltyShootout from "./components/PenaltyShootout";
import SettingsModal from "./components/SettingsModal";
import { AppDialogHost } from "./components/AppDialog";
import NewGame from "./components/NewGame";
import ClubHome from "./components/ClubHome";
import Standings, { HallOfFame, type TableView } from "./components/Standings";
import Squad from "./components/Squad";
import Market from "./components/Market";
import Training from "./components/Training";
import { IconClub, IconTable, IconSquad, IconMarket, IconTraining, IconTrophy, IconGear, IconPlay, IconLive } from "./components/icons";

type Tab = "clube" | "tabela" | "elenco" | "treino" | "mercado" | "ranking";

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
          o clube do seu jeito. Orçamento de ${(club.baseBudget / 1e6).toFixed(1)}M
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

// Proposta de um clube da IA por um jogador do usuário: aceitar vende na hora;
// recusar descarta (a proposta expira sozinha na próxima rodada).
function IncomingOfferModal() {
  const game = useStore((s) => s.game);
  const acceptIncomingOffer = useStore((s) => s.acceptIncomingOffer);
  const declineIncomingOffer = useStore((s) => s.declineIncomingOffer);
  if (!game?.incomingOffer) return null;
  const offer = game.incomingOffer;
  const buyer = game.clubs.find((c) => c.id === offer.clubId);
  const player = game.players.find((p) => p.id === offer.playerId);
  if (!buyer || !player || player.clubId !== game.userClubId) return null;
  const isStarter = game.starters.includes(player.id);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-sky-700/60 bg-zinc-900 p-5">
        <h2 className="mb-2 font-display text-lg font-bold text-sky-400">📠 Proposta recebida</h2>
        <p className="mb-2 text-pretty text-sm leading-relaxed text-zinc-300">
          O <b className="text-zinc-100">{buyer.name}</b> enviou uma proposta oficial por{" "}
          <b className="text-zinc-100">{player.name}</b> ({player.pos}, {player.age} anos,
          força {player.strength}{isStarter ? ", titular" : ""}).
        </p>
        <p className="mb-4 text-center font-display text-2xl font-black text-emerald-400">
          ${(offer.amount / 1e6).toFixed(2)}M
        </p>
        <p className="mb-4 text-xs text-zinc-500">
          Valor de mercado: ${(player.value / 1e6).toFixed(2)}M · Contrato: {player.contract ?? 1}{" "}
          temporada{(player.contract ?? 1) > 1 ? "s" : ""}. Se não responder, a proposta expira na
          próxima rodada.
        </p>
        <div className="flex gap-2">
          <button onClick={acceptIncomingOffer} className="btn-cta flex-1 py-2">
            Aceitar e vender
          </button>
          <button
            onClick={declineIncomingOffer}
            className="flex-1 rounded bg-zinc-800 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
          >
            Recusar
          </button>
        </div>
      </div>
    </div>
  );
}

// Aviso de fim de temporada: jogadores no último ano de contrato saem de graça
// na virada — o modal aparece uma vez por temporada, nas 5 rodadas finais da
// liga, com renovação direta dali mesmo.
function ContractWarningModal() {
  const game = useStore((s) => s.game);
  const renewContract = useStore((s) => s.renewContract);
  const dismissContractWarning = useStore((s) => s.dismissContractWarning);
  if (!game || game.fired) return null;
  if (game.contractWarningSeason === game.season) return null;
  const roundsLeft = new Set(game.fixtures.filter((f) => !f.played).map((f) => f.round)).size;
  if (roundsLeft === 0 || roundsLeft > 5) return null;
  const expiring = game.players
    .filter((p) => p.clubId === game.userClubId && (p.contract ?? 1) <= 1)
    .sort((a, b) => b.strength - a.strength);
  if (expiring.length === 0) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-amber-700/60 bg-zinc-900 p-5">
        <h2 className="mb-2 font-display text-lg font-bold text-amber-400">📝 Contratos a vencer</h2>
        <p className="mb-3 text-pretty text-sm leading-relaxed text-zinc-300">
          A temporada está acabando ({roundsLeft} rodada{roundsLeft > 1 ? "s" : ""} restante
          {roundsLeft > 1 ? "s" : ""} na liga) e estes jogadores estão no último ano de
          contrato. Quem não renovar <b className="text-red-400">sai de graça</b> na virada.
        </p>
        <div className="mb-4">
          {expiring.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 border-b border-zinc-800 py-1.5 text-sm"
            >
              <span className="min-w-0 truncate text-zinc-200">
                <span className="mr-1 text-xs text-zinc-500">{p.pos}</span>
                {p.name}
                <span className="ml-1 text-xs text-amber-400">{p.strength}</span>
              </span>
              <button
                onClick={async () => {
                  const r = renewContract(p.id);
                  if (!r.ok) await appAlert(r.message);
                }}
                className="shrink-0 rounded bg-emerald-800 px-2 py-0.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-700"
              >
                Renovar +2 (${(renewalCost(p) / 1e3).toFixed(0)}k)
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={dismissContractWarning}
          className="w-full rounded bg-zinc-800 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          Fechar (não avisar de novo nesta temporada)
        </button>
      </div>
    </div>
  );
}

function PendingPromotionsModal() {
  const game = useStore((s) => s.game);
  const promotePlayer = useStore((s) => s.promotePlayer);

  if (!game?.pendingPromotions || game.pendingPromotions.length === 0) return null;

  const currentPromotion = game.pendingPromotions[0];
  const { position, options } = currentPromotion;

  const userClub = game.clubs.find((c) => c.id === game.userClubId);
  const userRetirements = game.retiredLastSeason?.filter((r) => r.clubName === userClub?.name) || [];

  const posLabels: Record<string, string> = {
    GOL: "Goleiro",
    DEF: "Defensor",
    MEI: "Meio-campista",
    ATA: "Atacante",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl shadow-black/80 md:p-8 animate-in fade-in zoom-in duration-205">
        <div className="mb-4 flex items-center justify-between border-b border-zinc-900 pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
              Categoria de Base ({game.pendingPromotions.length} pendente{game.pendingPromotions.length > 1 ? "s" : ""})
            </span>
            <h2 className="font-display text-2xl font-black text-zinc-100">
              Promover Novo {posLabels[position]}
            </h2>
          </div>
          <span className="rounded-full bg-zinc-900 px-3 py-1 text-sm font-bold text-zinc-400 border border-zinc-800">
            {position}
          </span>
        </div>

        {userRetirements.length > 0 && (
          <div className="mb-4 rounded-lg bg-red-950/20 border border-red-900/30 px-3 py-2 text-xs text-red-400">
            ⚠️ <b>Aposentado(s) do clube:</b> {userRetirements.map((r) => `${r.name} (${r.age} anos)`).join(", ")}
          </div>
        )}

        <p className="mb-6 text-sm text-zinc-400 leading-relaxed">
          Com a saída de atletas veteranos do elenco, a comissão da base selecionou estas 4 promessas para subir ao time profissional. Avalie as características e assine com um deles:
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {options.map((opt) => {
            const isCraque = opt.tier === "craque";
            const isBom = opt.tier === "bom";
            const tierBadge = isCraque ? "★★ Craque" : isBom ? "★ Bom" : "Mediano";
            const tierColor = isCraque
              ? "text-amber-400 border-amber-400/30 bg-amber-400/5"
              : isBom
              ? "text-zinc-300 border-zinc-700/20 bg-zinc-800/10"
              : "text-zinc-500 border-zinc-800 bg-transparent";

            return (
              <div
                key={opt.id}
                className="flex flex-col justify-between rounded-xl border border-zinc-850 bg-zinc-900/40 p-4 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900/80"
              >
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-zinc-100">{opt.name}</span>
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${tierColor}`}>
                      {tierBadge}
                    </span>
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-y-1.5 text-xs text-zinc-400">
                    <div>
                      Idade: <span className="font-semibold text-zinc-200">{opt.age} anos</span>
                    </div>
                    <div>
                      Pé: <span className="font-semibold text-zinc-200 capitalize">{opt.foot}</span>
                    </div>
                    <div>
                      Força: <span className="font-bold text-amber-500">{opt.strength}</span>
                    </div>
                    <div>
                      Potencial: <span className="font-semibold text-zinc-200">{opt.cap}</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">Atributos</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {opt.traits && opt.traits.length > 0 ? (
                        opt.traits.map((t: any) => (
                          <span
                            key={t}
                            className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20"
                          >
                            {t}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] italic text-zinc-600">Nenhuma característica</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => promotePlayer(opt.id)}
                  className="btn-cta w-full py-2 text-xs font-bold"
                >
                  Contratar jogador
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { game, live, startMatchday, finishMatchday } = useStore();
  const [tab, setTab] = useState<Tab>("clube");
  // sub-aba ativa dentro de Tabela: "Jogar"/"Ao vivo" abrem direto na Rodada
  const [tableView, setTableView] = useState<TableView>("rodada");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shootoutOpen, setShootoutOpen] = useState(false);
  const goToRound = () => {
    setTableView("rodada");
    setTab("tabela");
  };
  const onRoundTab = tab === "tabela" && tableView === "rodada";

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
    { key: "tabela", label: "Tabela", Icon: IconTable },
    { key: "elenco", label: "Elenco", Icon: IconSquad },
    { key: "treino", label: "Treino", Icon: IconTraining },
    { key: "mercado", label: "Mercado", Icon: IconMarket },
    { key: "ranking", label: "Ranking", Icon: IconTrophy },
  ];

  let headerBtnLabel = "Jogar";
  let headerBtnClass = "btn-play";
  let headerBtnIcon = <IconPlay className="h-4 w-4" />;
  let headerBtnOnClick = () => {
    startMatchday();
    goToRound();
  };
  // "Ao vivo" só aparece fora da Rodada — lá dentro já se vê o jogo rolando
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
      // dentro da Rodada o botão de encerrar fica junto do "Fim de jogo"
      showHeaderBtn = !onRoundTab;
    } else {
      headerBtnLabel = "Ao vivo";
      headerBtnClass = "btn-ghost-red";
      headerBtnIcon = <IconLive className="h-4 w-4" />;
      headerBtnOnClick = goToRound;
      showHeaderBtn = !onRoundTab;
    }
  }

  const liveHappening = liveRunning;

  return (
    <div className="min-h-screen">
      {!liveHappening && (
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
      )}

      <AppDialogHost />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {!liveRunning && <JobOfferModal />}
      {!liveRunning && <PendingPromotionsModal />}
      {!liveRunning && <IncomingOfferModal />}
      {!liveRunning && <ContractWarningModal />}
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
            goToRound();
          }}
        />
      )}
      {tab === "tabela" && (
        <Standings
          view={tableView}
          setView={setTableView}
          onFinishRound={() => {
            if (live && needsUserShootout(game, live)) {
              setShootoutOpen(true);
              return;
            }
            finishMatchday();
            setTab("clube");
          }}
        />
      )}
      {tab === "elenco" && <Squad />}
      {tab === "treino" && <Training />}
      {tab === "mercado" && <Market />}
      {tab === "ranking" && (
        <div className="mx-auto max-w-2xl p-4">
          <HallOfFame />
        </div>
      )}
    </div>
  );
}
