import { useState } from "react";
import { useStore, nextPlayableWeek, seasonRevenue } from "../store";
import { weekInfo, cupChampion, CONT_STAGES } from "../game/cup";
import { sortTable } from "../game/schedule";
import { ScrollLock } from "./useLockBodyScroll";
import type { Club, Player, Position } from "../types";

export default function SeasonHighlightsModal() {
  const game = useStore((s) => s.game);
  const startMatchday = useStore((s) => s.startMatchday);
  const [step, setStep] = useState<1 | 2>(1);

  if (!game) return null;

  // The season is over when nextPlayableWeek returns null
  const isSeasonOver = nextPlayableWeek(game) === null;
  if (!isSeasonOver) return null;

  const userClub = game.clubs.find((c) => c.id === game.userClubId)!;
  const isSerieA = userClub.division === "Série A";

  // Calculate Serie A and B tables
  const finalA = sortTable(game.tables["Série A"] ?? []);
  const finalB = sortTable(game.tables["Série B"] ?? []);

  const championA = finalA[0] ? game.clubs.find((c) => c.id === finalA[0].clubId) : null;
  const championB = finalB[0] ? game.clubs.find((c) => c.id === finalB[0].clubId) : null;

  // Calculate Cup champion
  const cupChampId = cupChampion(game.cup);
  const championCup = cupChampId ? game.clubs.find((c) => c.id === cupChampId) : null;

  // Calculate Continental champion
  const contChampId = game.continental ? cupChampion(game.continental, CONT_STAGES) : null;
  const championCont = contChampId ? game.clubs.find((c) => c.id === contChampId) : null;

  // Get user's position in the division
  const userTable = userClub.division === "Série A" ? finalA : finalB;
  const userPos = userTable.findIndex((r) => r.clubId === userClub.id) + 1;

  // Check achievements
  const wonSerieA = championA?.id === game.userClubId;
  const wonSerieB = championB?.id === game.userClubId;
  const wonCup = championCup?.id === game.userClubId;
  const wonCont = championCont?.id === game.userClubId;
  const wonAnyTitle = wonSerieA || wonSerieB || wonCup || wonCont;

  const promoted = !isSerieA && userPos <= 2;
  const relegated = isSerieA && userPos >= 15;
  const survived = isSerieA && userPos <= 14;

  // Manager evaluation message and title
  let evalTitle = "⏳ Trabalho de Reconstrução";
  let evalMsg = `A temporada na Série B terminou sem o sonhado acesso à Série A para o **${userClub.name}**. O elenco batalhou, mas a irregularidade cobrou o seu preço. Vamos usar esse aprendizado para ajustar as peças corretas e garantir que, no próximo ano, a vaga seja nossa!`;
  let evalEmoji = "📋";
  let evalBg = "border-zinc-700/60 bg-zinc-950";

  if (wonAnyTitle) {
    evalTitle = "👑 Glória Eterna!";
    evalEmoji = "🏆";
    evalBg = "border-amber-500/60 bg-zinc-950 shadow-amber-950/20";
    const titlesWon: string[] = [];
    if (wonSerieA) titlesWon.push("Campeonato Brasileiro (Série A)");
    if (wonSerieB) titlesWon.push("Campeonato Brasileiro (Série B)");
    if (wonCup) titlesWon.push("Copa Nacional");
    if (wonCont) titlesWon.push("Liga Continental");

    evalMsg = `Uma temporada simplesmente monumental, Professor! Sob o seu comando estratégico, o **${userClub.name}** ergueu a taça e conquistou o título da: **${titlesWon.join(", ")}**. A torcida está em êxtase e a diretoria sabe que tem um técnico brilhante no comando. Parabéns pela conquista histórica!`;
  } else if (promoted) {
    evalTitle = "🚀 Acesso Garantido!";
    evalEmoji = "📈";
    evalBg = "border-emerald-600/60 bg-zinc-950 shadow-emerald-950/20";
    evalMsg = `Objetivo cumprido com maestria, Técnico! O **${userClub.name}** carimbou o passaporte de volta para a Série A. Você organizou a equipe nos momentos difíceis e garantiu o acesso na ${userPos}ª colocação. Prepare-se, pois o desafio na elite do futebol nacional exige ainda mais!`;
  } else if (relegated) {
    evalTitle = "💔 Queda Dolorosa";
    evalEmoji = "📉";
    evalBg = "border-red-600/60 bg-zinc-950 shadow-red-950/20";
    evalMsg = `Um ano doloroso para a torcida e para o clube, Professor. O rebaixamento do **${userClub.name}** para a Série B é um golpe duro, mas o futebol sempre oferece espaço para a redenção. A diretoria mantém o voto de confiança para que você lidere a reconstrução imediata rumo à Série A!`;
  } else if (survived) {
    evalTitle = "🛡️ Permanência na Elite!";
    evalEmoji = "✅";
    evalBg = "border-sky-600/60 bg-zinc-950 shadow-sky-950/20";
    evalMsg = `Missão cumprida na elite, Professor! Manter o **${userClub.name}** na Série A era de suma importância para a estabilidade do clube. Enfrentamos gigantes de igual para igual e garantimos nossa permanência na ${userPos}ª colocação. Agora, a diretoria confia em você para montar um elenco capaz de brigar mais acima no próximo ano!`;
  }

  // Calculate dynamic prizes (for display)
  const getPrizeText = (club: Club | null | undefined, multiplier: number): string => {
    if (!club) return "-";
    const amount = seasonRevenue(club.baseBudget) * multiplier;
    return `$${(amount / 1e6).toFixed(1)}M`;
  };

  const prizeA = getPrizeText(championA, 2.5);
  const prizeB = getPrizeText(championB, 1.0);
  const prizeCup = getPrizeText(championCup, 2.0);
  const prizeCont = getPrizeText(championCont, 3.0);

  // Top Scorers & Top Assists in the user's country
  const userCountry = userClub.country;
  const countryClubIds = new Set(game.clubs.filter((c) => c.country === userCountry).map((c) => c.id));

  const topScorers = game.players
    .filter((p) => countryClubIds.has(p.clubId) && p.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.strength - a.strength)
    .slice(0, 3);

  const topAssists = game.players
    .filter((p) => countryClubIds.has(p.clubId) && p.assists > 0)
    .sort((a, b) => b.assists - a.assists || b.strength - a.strength)
    .slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto">
      <ScrollLock />
      {step === 1 ? (
        // STAGE 1: MANAGER EVALUATION
        <div className={`my-auto w-full max-w-lg rounded-2xl border p-6 shadow-2xl transition-all duration-300 md:p-8 animate-in fade-in zoom-in-95 duration-200 ${evalBg}`}>
          <div className="mb-4 text-center">
            <span className="text-5xl" role="img" aria-label="emoji">
              {evalEmoji}
            </span>
            <h2 className="mt-3 font-display text-2xl font-black text-zinc-100 uppercase tracking-wide">
              {evalTitle}
            </h2>
            <p className="mt-1 text-xs text-zinc-500 font-semibold tracking-wider uppercase">
              Relatório da Diretoria · {userClub.name}
            </p>
          </div>

          <div className="my-6 border-y border-zinc-900 py-5">
            <p className="text-center text-sm leading-relaxed text-zinc-300 antialiased">
              {evalMsg.split("**").map((text, i) =>
                i % 2 === 1 ? <b key={i} className="text-zinc-100 font-bold">{text}</b> : text
              )}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex justify-between items-center rounded-lg bg-zinc-900/40 border border-zinc-900 px-4 py-2.5 text-xs text-zinc-400">
              <span>Posição na Liga:</span>
              <span className="font-bold text-zinc-200">{userPos}º lugar ({userClub.division})</span>
            </div>
            {wonAnyTitle && (
              <div className="flex justify-between items-center rounded-lg bg-amber-500/5 border border-amber-500/10 px-4 py-2.5 text-xs text-amber-400">
                <span>Título conquistado:</span>
                <span className="font-bold">Sim 🏆</span>
              </div>
            )}
          </div>

          <button
            onClick={() => setStep(2)}
            className="btn-cta mt-6 w-full py-3 text-sm font-bold uppercase tracking-wider transition-all hover:scale-[1.01]"
          >
            Ver Destaques da Temporada →
          </button>
        </div>
      ) : (
        // STAGE 2: SEASON HIGHLIGHTS
        <div className="my-auto w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl transition-all duration-300 md:p-8 animate-in fade-in zoom-in-95 duration-200">
          <div className="mb-5 border-b border-zinc-900 pb-3 text-center">
            <span className="text-3xl" role="img" aria-label="trophy">🏆</span>
            <h2 className="mt-1 font-display text-2xl font-black text-zinc-100 uppercase tracking-wide">
              Destaques da Temporada
            </h2>
            <p className="text-xs text-zinc-500 font-semibold tracking-wider uppercase">
              Premiações e Estatísticas · Temporada {game.season}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Column 1: Winners & Prizes */}
            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-500">
                🥇 Campeões & Prêmios
              </h3>
              <div className="flex flex-col gap-2.5">
                {/* Serie A */}
                <div className="flex items-center justify-between rounded-lg border border-zinc-900 bg-zinc-900/30 p-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-400">Série A</p>
                    <p className="truncate font-bold text-zinc-200">{championA?.name ?? "Sem jogos"}</p>
                  </div>
                  <span className="font-bold text-emerald-400">{prizeA}</span>
                </div>
                {/* Serie B */}
                <div className="flex items-center justify-between rounded-lg border border-zinc-900 bg-zinc-900/30 p-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-400">Série B</p>
                    <p className="truncate font-bold text-zinc-200">{championB?.name ?? "Sem jogos"}</p>
                  </div>
                  <span className="font-bold text-emerald-400">{prizeB}</span>
                </div>
                {/* Copa Nacional */}
                <div className="flex items-center justify-between rounded-lg border border-zinc-900 bg-zinc-900/30 p-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-400">Copa Nacional</p>
                    <p className="truncate font-bold text-zinc-200">{championCup?.name ?? "Não disputada"}</p>
                  </div>
                  <span className="font-bold text-emerald-400">{prizeCup}</span>
                </div>
                {/* Continental */}
                {game.continental && (
                  <div className="flex items-center justify-between rounded-lg border border-zinc-900 bg-zinc-900/30 p-2.5 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-400">Continental</p>
                      <p className="truncate font-bold text-zinc-200">{championCont?.name ?? "Não disputada"}</p>
                    </div>
                    <span className="font-bold text-emerald-400">{prizeCont}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Column 2: Individual Leaders */}
            <div className="flex flex-col gap-5">
              {/* Scorers */}
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-500">
                  🥅 Maiores Artilheiros
                </h3>
                {topScorers.length > 0 ? (
                  <div className="flex flex-col border border-zinc-900 bg-zinc-900/10 rounded-lg overflow-hidden">
                    {topScorers.map((p, i) => {
                      const pClub = game.clubs.find(c => c.id === p.clubId);
                      return (
                        <div key={p.id} className="flex items-center justify-between border-b border-zinc-900/40 p-2 text-xs last:border-b-0">
                          <div className="min-w-0 flex-1 pr-2">
                            <p className="truncate font-bold text-zinc-200">
                              <span className="mr-1 text-zinc-500">{i + 1}.</span> {p.name}
                            </p>
                            <p className="truncate text-[10px] text-zinc-500">{pClub?.shortName} · {p.pos}</p>
                          </div>
                          <span className="font-bold font-mono text-amber-400">{p.goals} gols</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs italic text-zinc-600">Nenhum gol registrado.</p>
                )}
              </div>

              {/* Assists */}
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-500">
                  👟 Líderes de Assistências
                </h3>
                {topAssists.length > 0 ? (
                  <div className="flex flex-col border border-zinc-900 bg-zinc-900/10 rounded-lg overflow-hidden">
                    {topAssists.map((p, i) => {
                      const pClub = game.clubs.find(c => c.id === p.clubId);
                      return (
                        <div key={p.id} className="flex items-center justify-between border-b border-zinc-900/40 p-2 text-xs last:border-b-0">
                          <div className="min-w-0 flex-1 pr-2">
                            <p className="truncate font-bold text-zinc-200">
                              <span className="mr-1 text-zinc-500">{i + 1}.</span> {p.name}
                            </p>
                            <p className="truncate text-[10px] text-zinc-500">{pClub?.shortName} · {p.pos}</p>
                          </div>
                          <span className="font-bold font-mono text-emerald-400">{p.assists} assists</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs italic text-zinc-600">Nenhuma assistência registrada.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3 border-t border-zinc-900 pt-5">
            <button
              onClick={() => startMatchday()}
              className="btn-play flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold uppercase tracking-wider w-full md:w-auto"
            >
              Iniciar Nova Temporada ⚽
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
