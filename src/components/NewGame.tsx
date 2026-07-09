import { useMemo, useState } from "react";
import clubsData from "../data/clubs.json";
import type { Club } from "../types";
import { useStore } from "../store";

const COUNTRIES: Record<string, { flag: string; name: string }> = {
  BR: { flag: "🇧🇷", name: "Brasil" },
  AR: { flag: "🇦🇷", name: "Argentina" },
  EN: { flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", name: "Inglaterra" },
  ES: { flag: "🇪🇸", name: "Espanha" },
  DE: { flag: "🇩🇪", name: "Alemanha" },
  FR: { flag: "🇫🇷", name: "França" },
  IT: { flag: "🇮🇹", name: "Itália" },
  PT: { flag: "🇵🇹", name: "Portugal" },
};

export default function NewGame() {
  const startGame = useStore((s) => s.startGame);
  const clubs = clubsData as Club[];
  const [managerName, setManagerName] = useState("");
  const [country, setCountry] = useState("BR");
  const [clubId, setClubId] = useState<string | null>(null);
  // clube sorteado fica fixado no topo da lista
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  const list = useMemo(() => {
    const sorted = clubs
      .filter((c) => c.country === country)
      .sort((a, b) =>
        a.division === b.division
          ? b.baseBudget - a.baseBudget
          : a.division.localeCompare(b.division),
      );
    const i = pinnedId ? sorted.findIndex((c) => c.id === pinnedId) : -1;
    if (i > 0) sorted.unshift(...sorted.splice(i, 1));
    return sorted;
  }, [country, clubs, pinnedId]);

  function drawRandom(pool: Club[]) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setCountry(pick.country);
    setClubId(pick.id);
    setPinnedId(pick.id);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-8 sm:px-6">
      <img
        src="/elifoot3k.png"
        alt="Elifoot 3K — Manager de futebol do futuro"
        className="mx-auto mb-8 w-full max-w-md"
      />

      <div className="circuit-line mb-6">
        <span className="ui-label" style={{ color: "var(--accent)" }}>
          Técnico, escreva seu nome e escolha seu time
        </span>
      </div>

      <input
        type="text"
        value={managerName}
        onChange={(e) => setManagerName(e.target.value)}
        placeholder="Seu Nome"
        maxLength={30}
        className="mx-auto mb-6 block w-full max-w-xs border-b border-[var(--accent-dim)] bg-transparent px-2 py-2 text-center font-semibold tracking-wide text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-[var(--accent)]"
      />

      <nav className="mb-6 flex flex-wrap justify-center gap-x-5 gap-y-1">
        {Object.entries(COUNTRIES).map(([code, { flag, name }]) => (
          <button
            key={code}
            onClick={() => { setCountry(code); setClubId(null); setPinnedId(null); }}
            className={`country-tab ${country === code ? "active" : ""}`}
          >
            <span className="mr-1.5">{flag}</span>
            {name}
          </button>
        ))}
      </nav>

      <div className="mb-6 flex justify-center gap-x-5">
        <button
          onClick={() => drawRandom(clubs)}
          className="country-tab"
          title="Sorteia um time de qualquer país"
        >
          <span className="mr-1.5">🌍</span>
          Aleatório total
        </button>
        <button
          onClick={() => drawRandom(clubs.filter((c) => c.country === country))}
          className="country-tab"
          title="Sorteia um time do país selecionado"
        >
          <span className="mr-1.5">🎲</span>
          Aleatório no país
        </button>
      </div>

      {clubId && (
        <button
          onClick={() =>
            managerName.trim() &&
            startGame(Date.now() >>> 0, clubId, managerName.trim())
          }
          disabled={!managerName.trim()}
          className="btn-cta mb-6 w-full py-3.5"
        >
          Começar carreira
        </button>
      )}

      <div className="border-t border-[rgba(30,42,56,0.6)]">
        {list.map((c) => (
          <button
            key={c.id}
            onClick={() => setClubId(c.id)}
            className={`club-row ${clubId === c.id ? "selected" : ""}`}
          >
            <span
              className="inline-block h-2.5 w-2.5 rotate-45 border border-zinc-700"
              style={{ background: c.primaryColor }}
            />
            <span className="club-name text-sm font-semibold text-zinc-100">
              {c.name}
            </span>
            <span className="ui-label">{c.division}</span>
            <span className="w-16 text-right font-mono text-xs text-zinc-500">
              €{(c.baseBudget / 1e6).toFixed(1)}M
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
