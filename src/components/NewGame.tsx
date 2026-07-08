import { useMemo, useState } from "react";
import clubsData from "../data/clubs.json";
import type { Club } from "../types";
import { useStore } from "../store";

const COUNTRIES: Record<string, string> = {
  BR: "Brasil", AR: "Argentina", EN: "Inglaterra",
  ES: "Espanha", DE: "Alemanha", FR: "França", PT: "Portugal",
};

export default function NewGame() {
  const startGame = useStore((s) => s.startGame);
  const clubs = clubsData as Club[];
  const [country, setCountry] = useState("BR");
  const [clubId, setClubId] = useState<string | null>(null);

  const list = useMemo(
    () =>
      clubs
        .filter((c) => c.country === country)
        .sort((a, b) =>
          a.division === b.division
            ? b.baseBudget - a.baseBudget
            : a.division.localeCompare(b.division),
        ),
    [country, clubs],
  );

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-8 sm:px-6">
      <img
        src="/elifoot3k.png"
        alt="Elifoot 3K — Manager de futebol do futuro"
        className="mx-auto mb-8 w-full max-w-md"
      />

      <div className="circuit-line mb-6">
        <span className="ui-label" style={{ color: "var(--accent)" }}>
          Nova carreira
        </span>
      </div>

      <nav className="mb-6 flex flex-wrap gap-x-5 gap-y-1">
        {Object.entries(COUNTRIES).map(([code, label]) => (
          <button
            key={code}
            onClick={() => { setCountry(code); setClubId(null); }}
            className={`country-tab ${country === code ? "active" : ""}`}
          >
            {label}
          </button>
        ))}
      </nav>

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

      <button
        disabled={!clubId}
        onClick={() => clubId && startGame(Date.now() >>> 0, clubId)}
        className="btn-cta mt-8 w-full py-3.5"
      >
        Começar carreira
      </button>
    </div>
  );
}
