import { useRef, useState, useEffect } from "react";
import { useStore } from "../store";
import { appAlert, appConfirm } from "./AppDialog";
import { listSlots, saveToSlot, loadFromSlot, deleteSlot, type SlotMeta } from "../game/saveSlots";
import type { GameState } from "../types";
import { ScrollLock } from "./useLockBodyScroll";

const SPEEDS = [
  { v: 0.5, label: "0.5×" },
  { v: 1, label: "1×" },
  { v: 2, label: "2×" },
  { v: 4, label: "4×" },
];

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  } catch {
    return "—";
  }
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { game, settings, setSettings, loadGame, resetGame } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [slots, setSlots] = useState<(SlotMeta | null)[]>([]);

  // Refresh slots when modal opens (IndexedDB é assíncrono)
  useEffect(() => { listSlots().then(setSlots); }, []);

  const refreshSlots = () => listSlots().then(setSlots);

  /* ── file export/import (unchanged) ── */
  const saveToFile = () => {
    if (!game) return;
    const club = game.clubs.find((c) => c.id === game.userClubId)!;
    const blob = new Blob([JSON.stringify(game)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `retromanager-${club.shortName}-T${game.season}-S${game.week}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const loadFromFile = (file: File) => {
    file.text().then((txt) => {
      try {
        const g = JSON.parse(txt) as GameState;
        if (!g.userClubId || !g.players || !g.clubs) throw new Error("inválido");
        loadGame(g);
        onClose();
      } catch {
        appAlert("Arquivo de save inválido.");
      }
    });
  };

  /* ── slot actions ── */
  const handleSaveSlot = async (i: number) => {
    if (!game) return;
    if (slots[i]) {
      const ok = await appConfirm("Sobrescrever save existente?");
      if (!ok) return;
    }
    const ok = await saveToSlot(i, game);
    if (!ok) {
      appAlert(
        "Não foi possível salvar: o armazenamento do navegador está cheio. Apague um slot antigo e tente novamente.",
      );
    }
    refreshSlots();
  };

  const handleLoadSlot = async (i: number) => {
    const ok = await appConfirm("Carregar este save? O progresso atual não salvo será perdido.");
    if (!ok) return;
    const g = await loadFromSlot(i);
    if (!g) { appAlert("Save corrompido ou vazio."); return; }
    loadGame(g);
    onClose();
  };

  const handleDeleteSlot = async (i: number) => {
    const ok = await appConfirm(`Apagar o save do Slot ${i + 1}?`);
    if (!ok) return;
    await deleteSlot(i);
    refreshSlots();
  };

  /* ── Toggle sub-component ── */
  const Toggle = ({
    label, value, onChange,
  }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!value)}
      className={`flex w-full items-center justify-between rounded px-3 py-2 text-sm ${
        value ? "bg-emerald-900/60" : "bg-zinc-800"
      }`}
    >
      <span>{label}</span>
      <span className={value ? "text-emerald-400" : "text-zinc-500"}>
        {value ? "ON" : "OFF"}
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <ScrollLock />
      <div
        className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">⚙ Configurações</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">✕</button>
        </div>

        {/* ── Speed ── */}
        <p className="mb-1 text-xs text-zinc-500">VELOCIDADE DOS JOGOS</p>
        <div className="mb-4 flex gap-2">
          {SPEEDS.map((s) => (
            <button
              key={s.v}
              onClick={() => setSettings({ speed: s.v })}
              className={`flex-1 rounded px-2 py-1.5 text-sm ${
                settings.speed === s.v ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Sound ── */}
        <p className="mb-1 text-xs text-zinc-500">ALERTAS SONOROS</p>
        <div className="mb-4 flex flex-col gap-2">
          <Toggle
            label="⚽ Som de gol"
            value={settings.soundGoal}
            onChange={(v) => setSettings({ soundGoal: v })}
          />
          <Toggle
            label="🟥 Som de cartão vermelho"
            value={settings.soundRed}
            onChange={(v) => setSettings({ soundRed: v })}
          />
        </div>

        {/* ── Save Slots ── */}
        <p className="mb-1 text-xs text-zinc-500">SLOTS DE SAVE</p>
        <div className="mb-4 flex flex-col gap-1">
          {slots.map((meta, i) => {
            if (!meta) {
              const firstEmpty = slots.findIndex((s) => s === null);
              if (i !== firstEmpty) return null;
            }
            return (
            <div
              key={i}
              className="flex items-center gap-2 rounded border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-800"
            >
              <div className="flex-1 min-w-0">
                {meta ? (
                  <p className="truncate">
                    <span className="font-bold text-zinc-600">{i + 1}.</span>{" "}
                    {meta.clubName}{" "}
                    <span className="text-zinc-500">— Ano {meta.season} — {formatDate(meta.savedAt)}</span>
                  </p>
                ) : (
                  <p>
                    <span className="font-bold">{i + 1}.</span> vazio
                  </p>
                )}
              </div>

              <div className="flex gap-1 shrink-0">
                {game && (
                  <button
                    onClick={() => handleSaveSlot(i)}
                    className="rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-600"
                    title="Salvar"
                  >
                    💾
                  </button>
                )}
                {meta && (
                  <>
                    <button
                      onClick={() => handleLoadSlot(i)}
                      className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500"
                      title="Carregar"
                    >
                      📂
                    </button>
                    <button
                      onClick={() => handleDeleteSlot(i)}
                      className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500"
                      title="Apagar"
                    >
                      🗑
                    </button>
                  </>
                )}
              </div>
            </div>
          );
          })}
        </div>

        {/* ── File export/import ── */}
        <p className="mb-1 text-xs text-zinc-500">ARQUIVO EXTERNO</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={saveToFile}
            disabled={!game}
            className="rounded bg-zinc-800 px-3 py-2 text-left text-sm hover:bg-zinc-700 disabled:opacity-40"
          >
            💾 Salvar jogo (baixar arquivo)
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded bg-zinc-800 px-3 py-2 text-left text-sm hover:bg-zinc-700"
          >
            📂 Carregar jogo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFromFile(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={async () => {
              if (await appConfirm("Apagar o save atual e começar um novo jogo?")) {
                resetGame();
                onClose();
              }
            }}
            className="rounded bg-red-900/60 px-3 py-2 text-left text-sm text-red-300 hover:bg-red-900"
          >
            🗑 Novo jogo
          </button>
        </div>
      </div>
    </div>
  );
}
