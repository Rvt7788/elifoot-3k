import { useState } from "react";
import { useStore } from "../store";
import MatchDay from "./MatchDay";
import GameIcon from "./GameIcon";
import { sortTable } from "../game/schedule";
import {
  CONT_STAGES, CONT_STAGE_NAMES, CUP_STAGE_NAMES, CUP_STAGES,
  cupChampion, groupStandings, type CupState, type CupTie,
} from "../game/cup";
import { cupName, continentalName } from "../data/leagues";
import type { Club, Manager, Player, TableRow } from "../types";
import ClubModal from "./ClubModal";
import { readableOn } from "../game/color";

function CupBracket({
  cup, clubs, userClubId, stageNames, totalStages, championLabel, onSelect,
}: {
  cup: CupState; clubs: Club[]; userClubId: string;
  stageNames: string[];
  totalStages: number; championLabel: string;
  onSelect?: (club: Club) => void;
}) {
  const name = (id: string) => clubs.find((c) => c.id === id)?.name ?? "?";
  const select = (id: string) => {
    const club = clubs.find((c) => c.id === id);
    if (club && onSelect) onSelect(club);
  };
  const champion = cupChampion(cup, totalStages);
  const TieRow = ({ t }: { t: CupTie }) => {
    const isUser = t.homeId === userClubId || t.awayId === userClubId;
    const cls = (id: string) =>
      `cursor-pointer hover:underline ${t.winnerId === id ? "font-bold text-emerald-400" : t.winnerId ? "text-zinc-500" : ""}`;
    return (
      <div className={`flex items-center justify-between border-b border-zinc-800 py-1.5 text-xs sm:text-sm ${isUser ? "bg-emerald-950/40" : ""}`}>
        <span onClick={() => select(t.homeId)} className={`flex-1 truncate text-right pr-2 ${cls(t.homeId)}`}>{name(t.homeId)}</span>
        <span className="w-24 shrink-0 text-center font-mono text-[10px] sm:text-xs text-zinc-300 bg-zinc-800/20 py-0.5 rounded border border-zinc-800/60">
          {t.g1h != null ? `${t.g1h}-${t.g1a}` : "—"}
          <span className="mx-1 text-zinc-600">·</span>
          {t.g2h != null ? `${t.g2a}-${t.g2h}` : "—"}
          {t.pens && <span className="ml-1 text-[9px] text-amber-400 block sm:inline" title="Decidido nos pênaltis">pên.</span>}
        </span>
        <span onClick={() => select(t.awayId)} className={`flex-1 truncate text-left pl-2 ${cls(t.awayId)}`}>{name(t.awayId)}</span>
      </div>
    );
  };
  return (
    <div className="mb-6">
      {champion && (
        <p className="mb-3 flex items-center justify-center gap-1.5 rounded bg-amber-950/40 px-3 py-2 text-center text-sm font-bold text-amber-400">
          <GameIcon name="trophy" size={15} /> {championLabel}: {name(champion)}
        </p>
      )}
      {cup.rounds.map((ties, s) => (
        <div key={s} className="mb-4">
          <h4 className="mb-1 text-sm font-bold text-amber-400">
            {stageNames[s]}{" "}
            <span className="text-xs font-normal text-zinc-500">(ida e volta)</span>
          </h4>
          {ties.map((t, i) => (
            <TieRow key={i} t={t} />
          ))}
        </div>
      ))}
      <p className="text-xs text-zinc-500">
        Placares: ida · volta (na perspectiva do mandante da ida). Agregado empatado vai para os pênaltis.
        As próximas fases são sorteadas quando a anterior termina.
      </p>
    </div>
  );
}

function DivisionTable({
  division,
  clubs,
  tableData,
  userClubId,
  onSelect,
}: {
  division: string;
  clubs: Club[];
  tableData: TableRow[];
  userClubId: string;
  onSelect: (club: Club) => void;
}) {
  const sortedTable = sortTable(tableData);
  return (
    <div className="mb-6">
      <h3 className={`mb-2 text-base font-bold ${division === "Série A" ? "text-emerald-400" : "text-sky-400"}`}>
        {division}
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-700 text-left text-zinc-400 text-xs sm:text-sm">
            <th className="py-1 pl-2 pr-1 w-6 text-center">#</th>
            <th>Clube</th>
            <th className="w-8 text-center">P</th>
            <th className="w-8 text-center">J</th>
            <th className="w-8 text-center">V</th>
            <th className="w-8 text-center">E</th>
            <th className="w-8 text-center">D</th>
            <th className="w-8 text-center">SG</th>
          </tr>
        </thead>
        <tbody>
          {sortedTable.map((r, i) => {
            const c = clubs.find((x) => x.id === r.clubId)!;
            const zone =
              i < 2 ? "border-l-2 border-emerald-500"
              : i >= sortedTable.length - 2 ? "border-l-2 border-red-500"
              : "";
            return (
              <tr
                key={r.clubId}
                onClick={() => c && onSelect(c)}
                style={{ background: c.primaryColor, color: readableOn(c.primaryColor) }}
                className={`cursor-pointer border-b border-black/40 hover:brightness-110 text-xs sm:text-sm ${zone} ${
                  r.clubId === userClubId ? "font-bold" : ""
                }`}
              >
                <td className="py-1 text-center opacity-70 w-6 font-mono tabular-nums">{i + 1}</td>
                <td className="hover:underline py-1 truncate max-w-[120px] sm:max-w-none">{c?.name}</td>
                <td className="text-center font-bold font-mono tabular-nums w-8">{r.pts}</td>
                <td className="text-center font-mono tabular-nums w-8">{r.p}</td>
                <td className="text-center font-mono tabular-nums w-8">{r.w}</td>
                <td className="text-center font-mono tabular-nums w-8">{r.d}</td>
                <td className="text-center font-mono tabular-nums w-8">{r.l}</td>
                <td className="text-center font-mono tabular-nums w-8">{r.gf - r.ga}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Seção de ranking com limite expansível: mostra 5 por padrão, com opção de
// abrir para 10 ou 20.
const RANK_LIMITS = [5, 10, 20] as const;

// Escopo dos rankings de gols/assistências: temporada atual ou o save inteiro.
type RankScope = "temporada" | "geral";

function ScopeToggle({ scope, setScope }: { scope: RankScope; setScope: (s: RankScope) => void }) {
  return (
    <div className="flex gap-1">
      {(["temporada", "geral"] as const).map((s) => (
        <button
          key={s}
          onClick={() => setScope(s)}
          className={`rounded px-2 py-0.5 text-[10px] font-semibold capitalize ${
            scope === s ? "bg-emerald-600 text-white" : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function RankSection({
  title, count, children, limit, setLimit, headerExtra,
}: {
  title: React.ReactNode;
  count: number;
  children: React.ReactNode;
  limit: number;
  setLimit: (n: number) => void;
  headerExtra?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-base font-bold text-amber-400">{title}</h3>
        {headerExtra}
        {count > RANK_LIMITS[0] && (
          <div className="flex gap-1">
            {RANK_LIMITS.map((n) => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                  limit === n ? "bg-emerald-600 text-white" : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* seção vazia mostra só o título — os dados aparecem conforme o save avança */}
      {count === 0 ? null : children}
    </div>
  );
}

// Ranking geral do save: clubes, jogadores e técnicos mais vitoriosos (títulos
// de liga, copa e continental), mais o histórico do prêmio de Melhor Técnico.
// Exportado para a aba própria "Ranking" no cabeçalho do app.
export function HallOfFame() {
  const game = useStore((s) => s.game)!;
  const [clubLimit, setClubLimit] = useState<number>(RANK_LIMITS[0]);
  const [scorerLimit, setScorerLimit] = useState<number>(RANK_LIMITS[0]);
  const [assisterLimit, setAssisterLimit] = useState<number>(RANK_LIMITS[0]);
  const [scorerScope, setScorerScope] = useState<RankScope>("temporada");
  const [assisterScope, setAssisterScope] = useState<RankScope>("temporada");
  const [mgrScope, setMgrScope] = useState<RankScope>("temporada");
  const [managerLimit, setManagerLimit] = useState<number>(RANK_LIMITS[0]);
  const [selected, setSelected] = useState<Club | null>(null);
  const selectClub = (id: string | null) => {
    const club = id ? game.clubs.find((c) => c.id === id) : undefined;
    if (club) setSelected(club);
  };
  const clubName = (id: string | null) =>
    id ? game.clubs.find((c) => c.id === id)?.name ?? "?" : "sem clube";

  // O ranking é do ecossistema do país do save: clubes estrangeiros (e seus
  // técnicos/jogadores) existem só para a copa continental e ficam de fora.
  const userCountry = game.clubs.find((c) => c.id === game.userClubId)!.country;
  const countryClubIds = new Set(
    game.clubs.filter((c) => c.country === userCountry).map((c) => c.id),
  );

  const clubs = game.clubs
    .filter((c) => countryClubIds.has(c.id) && (c.titles ?? 0) > 0)
    .sort((a, b) => (b.titles ?? 0) - (a.titles ?? 0) || b.baseBudget - a.baseBudget);
  // gols/assistências: "temporada" usa o contador corrente; "geral" soma o
  // acumulado de temporadas anteriores (careerGoals) com a temporada atual
  const goalsOf = (p: Player) =>
    scorerScope === "geral" ? (p.careerGoals ?? 0) + p.goals : p.goals;
  const assistsOf = (p: Player) =>
    assisterScope === "geral" ? (p.careerAssists ?? 0) + p.assists : p.assists;
  const scorers = game.players
    .filter((p) => countryClubIds.has(p.clubId) && goalsOf(p) > 0)
    .sort((a, b) => goalsOf(b) - goalsOf(a) || b.strength - a.strength);
  const assisters = game.players
    .filter((p) => countryClubIds.has(p.clubId) && assistsOf(p) > 0)
    .sort((a, b) => assistsOf(b) - assistsOf(a) || b.strength - a.strength);
  // técnicos: "geral" ranqueia por títulos (só entra quem tem taça), desempatando
  // pelas vitórias da carreira; "temporada" ranqueia pelas vitórias do ano.
  // Nos dois casos a vitória pela Série A pesa 3× mais que pela Série B.
  const mgrWins = (m: Manager) =>
    mgrScope === "geral" ? (m.winsA ?? 0) + (m.winsB ?? 0) : (m.seasonWinsA ?? 0) + (m.seasonWinsB ?? 0);
  const mgrWinScore = (m: Manager) =>
    mgrScope === "geral"
      ? (m.winsA ?? 0) * 3 + (m.winsB ?? 0)
      : (m.seasonWinsA ?? 0) * 3 + (m.seasonWinsB ?? 0);
  const managers = (game.managers ?? [])
    // desempregados (clubId null) só existem no carrossel do país do usuário
    .filter((m) =>
      (m.clubId === null || countryClubIds.has(m.clubId)) &&
      (mgrScope === "geral" ? m.titles > 0 : mgrWins(m) > 0),
    )
    .sort((a, b) =>
      mgrScope === "geral"
        ? b.titles - a.titles || mgrWinScore(b) - mgrWinScore(a) || b.reputation - a.reputation
        : mgrWinScore(b) - mgrWinScore(a) || b.titles - a.titles || b.reputation - a.reputation,
    );
  const awards = [...(game.managerAwards ?? [])].sort((a, b) => b.season - a.season);

  const thCls = "border-b border-zinc-700 text-left text-[10px] uppercase tracking-wide text-zinc-400";

  // Seções sem dados vão para o fim da tela até começarem a ter conteúdo.
  const sections: { key: string; count: number; node: React.ReactNode }[] = [
    { key: "clubes", count: clubs.length, node: (
      <RankSection
        title={<><GameIcon name="trophy" size={16} /> Clubes vitoriosos</>}
        count={clubs.length}
        limit={clubLimit}
        setLimit={setClubLimit}
      >
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className={thCls}>
              <th className="py-1 pl-2 pr-1 w-6 text-center">#</th>
              <th>Clube</th>
              <th>Divisão</th>
              <th className="w-14 text-center">Títulos</th>
            </tr>
          </thead>
          <tbody>
            {clubs.slice(0, clubLimit).map((c, i) => (
              <tr
                key={c.id}
                onClick={() => setSelected(c)}
                className={`cursor-pointer border-b border-zinc-800 hover:bg-zinc-900/60 ${c.id === game.userClubId ? "font-bold text-emerald-400" : "text-zinc-200"}`}
              >
                <td className="py-1 text-center font-mono tabular-nums opacity-70">{i + 1}</td>
                <td className="truncate max-w-[140px] hover:underline sm:max-w-none">
                  <span
                    className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border border-white/30 align-baseline"
                    style={{ background: c.primaryColor }}
                  />
                  {c.name}
                </td>
                <td className="text-zinc-400">{c.division}</td>
                <td className="text-center font-mono tabular-nums">{c.titles ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </RankSection>
    ) },
    { key: "artilheiros", count: scorers.length, node: (
      <RankSection
        title={<><GameIcon name="scorers" size={16} /> Maiores artilheiros</>}
        count={scorers.length}
        headerExtra={<ScopeToggle scope={scorerScope} setScope={setScorerScope} />}
        limit={scorerLimit}
        setLimit={setScorerLimit}
      >
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className={thCls}>
              <th className="py-1 pl-2 pr-1 w-6 text-center">#</th>
              <th>Jogador</th>
              <th>Clube</th>
              <th className="w-10 text-center">Pos</th>
              <th className="w-14 text-center">Gols</th>
            </tr>
          </thead>
          <tbody>
            {scorers.slice(0, scorerLimit).map((p, i) => (
              <tr
                key={p.id}
                className={`border-b border-zinc-800 ${p.clubId === game.userClubId ? "font-bold text-emerald-400" : "text-zinc-200"}`}
              >
                <td className="py-1 text-center font-mono tabular-nums opacity-70">{i + 1}</td>
                <td className="truncate max-w-[120px] sm:max-w-none">{p.name}</td>
                <td
                  onClick={() => selectClub(p.clubId)}
                  className="cursor-pointer truncate max-w-[100px] text-zinc-400 hover:underline sm:max-w-none"
                >
                  {clubName(p.clubId)}
                </td>
                <td className="text-center text-zinc-400">{p.pos}</td>
                <td className="text-center font-mono tabular-nums text-amber-400 font-semibold">{goalsOf(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </RankSection>
    ) },
    { key: "garcons", count: assisters.length, node: (
      <RankSection
        title={<><GameIcon name="assists" size={16} /> Maiores garçons</>}
        count={assisters.length}
        headerExtra={<ScopeToggle scope={assisterScope} setScope={setAssisterScope} />}
        limit={assisterLimit}
        setLimit={setAssisterLimit}
      >
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className={thCls}>
              <th className="py-1 pl-2 pr-1 w-6 text-center">#</th>
              <th>Jogador</th>
              <th>Clube</th>
              <th className="w-10 text-center">Pos</th>
              <th className="w-14 text-center">Assist.</th>
            </tr>
          </thead>
          <tbody>
            {assisters.slice(0, assisterLimit).map((p, i) => (
              <tr
                key={p.id}
                className={`border-b border-zinc-800 ${p.clubId === game.userClubId ? "font-bold text-emerald-400" : "text-zinc-200"}`}
              >
                <td className="py-1 text-center font-mono tabular-nums opacity-70">{i + 1}</td>
                <td className="truncate max-w-[120px] sm:max-w-none">{p.name}</td>
                <td
                  onClick={() => selectClub(p.clubId)}
                  className="cursor-pointer truncate max-w-[100px] text-zinc-400 hover:underline sm:max-w-none"
                >
                  {clubName(p.clubId)}
                </td>
                <td className="text-center text-zinc-400">{p.pos}</td>
                <td className="text-center font-mono tabular-nums text-emerald-400 font-semibold">{assistsOf(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </RankSection>
    ) },
    { key: "tecnicos", count: managers.length, node: (
      <RankSection
        title={<><GameIcon name="medal" size={16} /> Melhores técnicos</>}
        count={managers.length}
        headerExtra={<ScopeToggle scope={mgrScope} setScope={setMgrScope} />}
        limit={managerLimit}
        setLimit={setManagerLimit}
      >
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className={thCls}>
              <th className="py-1 pl-2 pr-1 w-6 text-center">#</th>
              <th>Técnico</th>
              <th>Clube</th>
              <th className="w-14 text-center">Títulos</th>
              <th className="w-14 text-center" title="Vitórias na carreira — as da Série A pesam mais no desempate">Vit.</th>
              <th className="w-16 text-center" title="Reputação (5-99): sobe com campanhas acima do esperado e títulos">Reput.</th>
            </tr>
          </thead>
          <tbody>
            {managers.slice(0, managerLimit).map((m, i) => (
              <tr
                key={m.id}
                className={`border-b border-zinc-800 ${m.isUser ? "font-bold text-emerald-400" : "text-zinc-200"}`}
              >
                <td className="py-1 text-center font-mono tabular-nums opacity-70">{i + 1}</td>
                <td className="truncate max-w-[120px] sm:max-w-none">{m.name}{m.isUser ? " (você)" : ""}</td>
                <td
                  onClick={() => selectClub(m.clubId)}
                  className="cursor-pointer truncate max-w-[100px] text-zinc-400 hover:underline sm:max-w-none"
                >
                  {clubName(m.clubId)}
                </td>
                <td className="text-center font-mono tabular-nums">{m.titles}</td>
                <td className="text-center font-mono tabular-nums text-amber-400">{mgrWins(m)}</td>
                <td className="text-center font-mono tabular-nums text-zinc-400">{m.reputation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </RankSection>
    ) },
    { key: "premio", count: awards.length, node: (
      <div className="mb-6">
        <h3 className="mb-2 flex items-center gap-1.5 text-base font-bold text-amber-400"><GameIcon name="medal" size={16} /> Melhor Técnico da temporada</h3>
        {awards.length === 0 ? null : (
          <div className="mb-4">
            {awards.map((a) => (
              <div
                key={a.season}
                className="flex items-center justify-between border-b border-zinc-800 py-1.5 text-xs sm:text-sm text-zinc-200"
              >
                <span className="text-zinc-500">Temporada {a.season}</span>
                <span className="font-semibold">{a.managerName}</span>
                <span className="text-zinc-400">{a.clubName}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    ) },
  ];
  // com dados primeiro, vazias no fim — a ordem relativa original é preservada
  const ordered = [...sections].sort((a, b) => Number(a.count === 0) - Number(b.count === 0));

  return (
    <div>
      {ordered.map((s) => (
        <div key={s.key}>{s.node}</div>
      ))}
      {selected && (
        <ClubModal game={game} club={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// Sub-abas da Tabela, incluindo a Rodada (jogos ao vivo/resultados). A aba ativa
// é controlada pelo App para o botão "Jogar"/"Ao vivo" abrir direto na Rodada.
export type TableView = "rodada" | "liga" | "copa" | "continental";

export default function Standings({
  view, setView, onFinishRound, onOpenSettings,
}: {
  view: TableView;
  setView: (v: TableView) => void;
  onFinishRound?: () => void;
  onOpenSettings?: () => void;
}) {
  const game = useStore((s) => s.game);
  const live = useStore((s) => s.live);
  const [selected, setSelected] = useState<Club | null>(null);
  if (!game) return null;
  const userClub = game.clubs.find((c) => c.id === game.userClubId)!;
  const contName = continentalName(userClub.country);
  const nationalCupName = cupName(userClub.country);
  const liveRunning = live !== null;

  // Render all active divisions in the save
  const divisions = Object.keys(game.tables).sort((a, b) => a.localeCompare(b));

  const tabCls = (v: typeof view) =>
    `rounded py-1.5 text-xs sm:text-sm flex-1 text-center font-semibold whitespace-nowrap transition-all ${
      view === v ? "bg-emerald-600 text-white" : "bg-zinc-800/40 text-zinc-400 hover:text-zinc-200"
    }`;

  // A Rodada usa o layout largo do MatchDay; as demais sub-abas ficam no
  // container estreito de tabelas.
  const tabs = (
    <div className="mb-4 flex w-full flex-col gap-1.5">
      {/* linha de cima: as três competições */}
      <div className="flex w-full gap-1.5">
        <button onClick={() => setView("liga")} className={`${tabCls("liga")} inline-flex items-center justify-center gap-1`}>
          <GameIcon name="board" size={14} /> Liga
        </button>
        <button onClick={() => setView("copa")} className={`${tabCls("copa")} inline-flex min-w-0 items-center justify-center gap-1`}>
          <GameIcon name="trophy" size={14} className="shrink-0" /> <span className="truncate">{nationalCupName}</span>
        </button>
        <button onClick={() => setView("continental")} className={`${tabCls("continental")} inline-flex min-w-0 items-center justify-center gap-1`}>
          <GameIcon name="globe" size={14} className="shrink-0" /> <span className="truncate">{contName}</span>
        </button>
      </div>
      {/* linha de baixo: a rodada, ocupando a largura toda */}
      <button onClick={() => setView("rodada")} className={`${tabCls("rodada")} inline-flex w-full items-center justify-center gap-1`}>
        <GameIcon name="goal" size={14} /> Rodada
      </button>
    </div>
  );

  if (view === "rodada") {
    return (
      <>
        {!liveRunning && <div className="mx-auto max-w-2xl px-4 pt-4">{tabs}</div>}
        <MatchDay onFinishRound={onFinishRound} onOpenSettings={onOpenSettings} />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      {!liveRunning && tabs}

      {view === "liga" ? (
        <>
          {divisions.map((div) => (
            <DivisionTable
              key={div}
              division={div}
              clubs={game.clubs}
              tableData={game.tables[div] ?? []}
              userClubId={game.userClubId}
              onSelect={setSelected}
            />
          ))}
          <p className="mt-2 text-xs text-zinc-500 text-center">
            🟩 Acesso / título (2 primeiros) · 🟥 Rebaixamento (2 últimos)
          </p>
        </>
      ) : view === "copa" ? (
        game.cup ? (
          <CupBracket
            cup={game.cup}
            clubs={game.clubs}
            userClubId={game.userClubId}
            stageNames={CUP_STAGE_NAMES}
            totalStages={CUP_STAGES}
            championLabel={`Campeão da ${nationalCupName}`}
            onSelect={setSelected}
          />
        ) : (
          <p className="text-center text-sm text-zinc-500">A copa começa após a 5ª rodada.</p>
        )
      ) : game.continental ? (
        <>
          {/* fase de grupos: 8 grupos de 4, os 2 primeiros avançam às oitavas */}
          {game.continental.groups && (
            <div className="mb-6">
              <h4 className="mb-2 text-sm font-bold text-amber-400">Fase de grupos</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {game.continental.groups.map((_, g) => (
                  <div key={g} className="rounded-lg bg-zinc-900/60 px-3 py-2">
                    <p className="mb-1 text-xs font-bold text-zinc-500">GRUPO {String.fromCharCode(65 + g)}</p>
                    {groupStandings(game.continental!, g).map((r, i) => {
                      const c = game.clubs.find((x) => x.id === r.clubId);
                      const isUser = r.clubId === game.userClubId;
                      return (
                        <div
                          key={r.clubId}
                          className={`flex items-center justify-between border-b border-zinc-800 py-0.5 text-xs last:border-0 ${
                            isUser ? "text-emerald-400 font-semibold" : i < 2 ? "text-zinc-200" : "text-zinc-500"
                          }`}
                        >
                          <span
                            className="cursor-pointer truncate hover:underline"
                            onClick={() => c && setSelected(c)}
                          >
                            <span className="mr-1 inline-block w-3 text-zinc-600">{i + 1}</span>
                            {c?.name ?? "?"}
                          </span>
                          <span className="ml-2 shrink-0 font-mono">
                            {r.pts} <span className="text-zinc-600">pts</span>{" "}
                            <span className="text-zinc-600">({r.p}j {r.gf - r.ga >= 0 ? "+" : ""}{r.gf - r.ga})</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
          <CupBracket
            cup={game.continental}
            clubs={game.clubs}
            userClubId={game.userClubId}
            stageNames={CONT_STAGE_NAMES}
            totalStages={CONT_STAGES}
            championLabel={`Campeão da ${contName}`}
            onSelect={setSelected}
          />
        </>
      ) : (
        <p className="text-center text-sm text-zinc-500">
          A continental será sorteada na próxima temporada.
        </p>
      )}

      {selected && (
        <ClubModal game={game} club={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
