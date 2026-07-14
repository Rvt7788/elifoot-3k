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
import { ScrollLock } from "./useLockBodyScroll";

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

// Prévia de cada ranking: só os 5 primeiros. Clicar abre um modal com a lista
// completa (mesma tabela, sem corte).
const RANK_PREVIEW = 5;

// Escopo dos rankings de gols/assistências: temporada atual ou o save inteiro.
type RankScope = "temporada" | "geral";

function ScopeToggle({ scope, setScope }: { scope: RankScope; setScope: (s: RankScope) => void }) {
  return (
    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
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

// Seção de ranking: mostra a prévia (5) e, se houver mais, fica clicável para
// abrir o modal com a lista inteira. `render(limit)` desenha a mesma tabela nos
// dois lugares, garantindo colunas alinhadas entre prévia e modal.
function RankSection({
  title, count, render, headerExtra, onOpen,
}: {
  title: React.ReactNode;
  count: number;
  render: (limit: number) => React.ReactNode;
  headerExtra?: React.ReactNode;
  onOpen?: () => void;
}) {
  const expandable = count > RANK_PREVIEW && !!onOpen;
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-base font-bold text-amber-400">{title}</h3>
        {headerExtra}
      </div>
      {/* seção vazia mostra só o título — os dados aparecem conforme o save avança */}
      {count === 0 ? null : (
        <div
          onClick={expandable ? onOpen : undefined}
          className={expandable ? "cursor-pointer rounded transition-colors hover:bg-zinc-900/40" : undefined}
          title={expandable ? "Ver ranking completo" : undefined}
        >
          {render(RANK_PREVIEW)}
        </div>
      )}
    </div>
  );
}

// Modal com a lista completa de um ranking. Reaproveita o mesmo `render` da
// seção, sem limite, mantendo as colunas idênticas.
function RankModal({
  title, headerExtra, render, onClose,
}: {
  title: React.ReactNode;
  headerExtra?: React.ReactNode;
  render: (limit: number) => React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <ScrollLock />
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto border border-zinc-700 bg-[#0a0f16] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-1.5 text-base font-bold text-amber-400">{title}</h3>
          <div className="flex items-center gap-3">
            {headerExtra}
            <button onClick={onClose} className="text-zinc-500 hover:text-amber-400">✕</button>
          </div>
        </div>
        {render(Infinity)}
      </div>
    </div>
  );
}

// Ranking geral do save: clubes e jogadores mais vitoriosos, mais os técnicos
// ranqueados por reputação. Exportado para a aba própria "Ranking" no app.
export function HallOfFame() {
  const game = useStore((s) => s.game)!;
  const [scorerScope, setScorerScope] = useState<RankScope>("geral");
  const [assisterScope, setAssisterScope] = useState<RankScope>("geral");
  const [openRank, setOpenRank] = useState<string | null>(null);
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
  // técnicos: ranqueados por uma PONTUAÇÃO de carreira que só cresce (sem teto):
  // cada título vale 10 pontos e cada vitória vale 1. Junta prêmios e vitórias ao
  // longo de todas as temporadas.
  const mgrWins = (m: Manager) => (m.winsA ?? 0) + (m.winsB ?? 0);
  const mgrScore = (m: Manager) => m.titles * 10 + mgrWins(m);
  const managers = (game.managers ?? [])
    // desempregados (clubId null) só existem no carrossel do país do usuário;
    // só entra quem já pontuou (tem título ou vitória)
    .filter((m) => (m.clubId === null || countryClubIds.has(m.clubId)) && mgrScore(m) > 0)
    .sort((a, b) => mgrScore(b) - mgrScore(a) || b.titles - a.titles || mgrWins(b) - mgrWins(a));

  const thCls = "border-b border-zinc-700 text-left text-[10px] uppercase tracking-wide text-zinc-400";

  // Todos os rankings compartilham o MESMO gabarito de 4 colunas (posição, nome,
  // clube/divisão e valor), com larguras fixas via colgroup — assim as colunas
  // caem na mesma faixa horizontal em todas as seções, no mobile e no desktop.
  const RankTable = ({
    nameLabel, subLabel, valueLabel, valueTitle, rows,
  }: {
    nameLabel: string;
    subLabel: string;
    valueLabel: string;
    valueTitle?: string;
    rows: {
      key: string;
      rank: number;
      highlight: boolean;
      name: React.ReactNode;
      sub: React.ReactNode;
      onSub?: () => void;
      value: React.ReactNode;
      valueCls: string;
    }[];
  }) => (
    <table className="w-full table-fixed text-xs sm:text-sm">
      <colgroup>
        <col className="w-8" />
        <col />
        <col className="w-[34%]" />
        <col className="w-14" />
      </colgroup>
      <thead>
        <tr className={thCls}>
          <th className="py-1 pr-1 text-center">#</th>
          <th>{nameLabel}</th>
          <th>{subLabel}</th>
          <th className="text-center" title={valueTitle}>{valueLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.key}
            className={`border-b border-zinc-800 ${r.highlight ? "font-bold text-emerald-400" : "text-zinc-200"}`}
          >
            <td className="py-1 text-center font-mono tabular-nums opacity-70">{r.rank}</td>
            <td className="truncate">{r.name}</td>
            <td
              onClick={r.onSub ? (e) => { e.stopPropagation(); r.onSub!(); } : undefined}
              className={`truncate text-zinc-400 ${r.onSub ? "cursor-pointer hover:underline" : ""}`}
            >
              {r.sub}
            </td>
            <td className={`text-center font-mono tabular-nums ${r.valueCls}`}>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const clubsRender = (limit: number) => (
    <RankTable
      nameLabel="Clube"
      subLabel="Divisão"
      valueLabel="Títulos"
      rows={clubs.slice(0, limit).map((c, i) => ({
        key: c.id,
        rank: i + 1,
        highlight: c.id === game.userClubId,
        name: (
          <span className="inline-flex items-center">
            <span
              className="mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/30"
              style={{ background: c.primaryColor }}
            />
            <span className="truncate">{c.name}</span>
          </span>
        ),
        sub: c.division,
        value: c.titles ?? 0,
        valueCls: "",
      }))}
    />
  );

  const scorersRender = (limit: number) => (
    <RankTable
      nameLabel="Jogador"
      subLabel="Clube"
      valueLabel="Gols"
      rows={scorers.slice(0, limit).map((p, i) => ({
        key: p.id,
        rank: i + 1,
        highlight: p.clubId === game.userClubId,
        name: p.name,
        sub: clubName(p.clubId),
        onSub: () => selectClub(p.clubId),
        value: goalsOf(p),
        valueCls: "font-semibold text-amber-400",
      }))}
    />
  );

  const assistersRender = (limit: number) => (
    <RankTable
      nameLabel="Jogador"
      subLabel="Clube"
      valueLabel="Assist."
      rows={assisters.slice(0, limit).map((p, i) => ({
        key: p.id,
        rank: i + 1,
        highlight: p.clubId === game.userClubId,
        name: p.name,
        sub: clubName(p.clubId),
        onSub: () => selectClub(p.clubId),
        value: assistsOf(p),
        valueCls: "font-semibold text-emerald-400",
      }))}
    />
  );

  const managersRender = (limit: number) => (
    <RankTable
      nameLabel="Técnico"
      subLabel="Clube"
      valueLabel="Pontos"
      valueTitle="Pontuação de carreira: cada título vale 10 pontos e cada vitória, 1 — só cresce, sem teto"
      rows={managers.slice(0, limit).map((m, i) => ({
        key: m.id,
        rank: i + 1,
        highlight: !!m.isUser,
        name: `${m.name}${m.isUser ? " (você)" : ""}`,
        sub: clubName(m.clubId),
        onSub: () => selectClub(m.clubId),
        value: mgrScore(m),
        valueCls: "font-semibold text-amber-400",
      }))}
    />
  );

  type RankDef = {
    key: string;
    count: number;
    title: React.ReactNode;
    headerExtra?: React.ReactNode;
    render: (limit: number) => React.ReactNode;
  };
  const rankDefs: RankDef[] = [
    { key: "clubes", count: clubs.length, title: <><GameIcon name="trophy" size={16} /> Clubes vitoriosos</>, render: clubsRender },
    { key: "artilheiros", count: scorers.length, title: <><GameIcon name="scorers" size={16} /> Maiores artilheiros</>, headerExtra: <ScopeToggle scope={scorerScope} setScope={setScorerScope} />, render: scorersRender },
    { key: "garcons", count: assisters.length, title: <><GameIcon name="assists" size={16} /> Maiores garçons</>, headerExtra: <ScopeToggle scope={assisterScope} setScope={setAssisterScope} />, render: assistersRender },
    { key: "tecnicos", count: managers.length, title: <><GameIcon name="medal" size={16} /> Melhores técnicos</>, render: managersRender },
  ];

  // Ordem fixa dos rankings — clicar (para abrir o modal) não reordena a tela.
  const ordered = rankDefs;
  const openDef = rankDefs.find((d) => d.key === openRank);

  return (
    <div>
      {ordered.map((d) => (
        <RankSection
          key={d.key}
          title={d.title}
          count={d.count}
          headerExtra={d.headerExtra}
          render={d.render}
          onOpen={() => setOpenRank(d.key)}
        />
      ))}
      {openDef && (
        <RankModal
          title={openDef.title}
          headerExtra={openDef.headerExtra}
          render={openDef.render}
          onClose={() => setOpenRank(null)}
        />
      )}
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
