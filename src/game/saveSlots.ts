import type { GameState } from "../types";
import { sortTable } from "./schedule";

// Slots de save em IndexedDB: o GameState serializado passa de 3MB (320 clubes,
// ~6400 jogadores) e o localStorage tem cota de ~5MB no total — que o autosave
// do zustand já ocupa quase inteira. O IndexedDB tem cota na casa das centenas
// de MB, então os 10 slots cabem com folga. Meta e game ficam em chaves
// separadas para listar os slots sem carregar os saves inteiros.
const SLOT_PREFIX = "retro-manager-slot-"; // chave legada no localStorage
const MAX_SLOTS = 10;
const DB_NAME = "retro-manager";
const STORE = "slots";

/** Metadata shown in the UI without loading the full GameState. */
export interface SlotMeta {
  clubName: string;
  season: number;
  week: number;
  savedAt: string; // ISO date
  managerName?: string; // nome do técnico
  division?: string; // divisão do clube (Série A/B)
  position?: number; // posição na tabela da divisão
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(key: string): Promise<T | null> {
  return openDB().then(
    (db) =>
      new Promise<T | null>((resolve, reject) => {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function idbDelete(keys: string[]): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        for (const k of keys) tx.objectStore(STORE).delete(k);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

// Slots gravados antes no localStorage: move cada um para o IndexedDB e apaga
// do localStorage — além de preservar os saves, libera a cota para o autosave.
async function migrateLegacySlots(): Promise<void> {
  for (let i = 0; i < MAX_SLOTS; i++) {
    const key = `${SLOT_PREFIX}${i}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw) as { game?: GameState; meta?: SlotMeta };
      if (data.game) {
        await idbSet(`game-${i}`, data.game);
        await idbSet(`meta-${i}`, data.meta ?? null);
      }
      localStorage.removeItem(key);
    } catch {
      // save legado corrompido: descarta para liberar espaço
      try { localStorage.removeItem(key); } catch { /* noop */ }
    }
  }
}

/** Read the meta for every slot (null = empty). */
export async function listSlots(): Promise<(SlotMeta | null)[]> {
  try {
    await migrateLegacySlots();
    const result: (SlotMeta | null)[] = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
      result.push(await idbGet<SlotMeta>(`meta-${i}`).catch(() => null));
    }
    return result;
  } catch {
    return new Array(MAX_SLOTS).fill(null);
  }
}

/** Save the current game into a numbered slot. Returns false when the write fails. */
export async function saveToSlot(index: number, game: GameState): Promise<boolean> {
  const club = game.clubs.find((c) => c.id === game.userClubId);
  const division = club?.division;
  const table = division ? game.tables[division] : undefined;
  const position = table
    ? sortTable(table).findIndex((r) => r.clubId === game.userClubId) + 1 || undefined
    : undefined;
  const meta: SlotMeta = {
    clubName: club?.name ?? "???",
    season: game.season,
    week: game.week,
    savedAt: new Date().toISOString(),
    managerName: game.managerName,
    division,
    position,
  };
  try {
    // IndexedDB clona estruturas, mas o game vem do zustand com possíveis
    // proxies — o round-trip por JSON garante um objeto puro e serializável
    await idbSet(`game-${index}`, JSON.parse(JSON.stringify(game)));
    await idbSet(`meta-${index}`, meta);
    return true;
  } catch {
    return false;
  }
}

/** Load the GameState from a numbered slot (null if empty / corrupt). */
export async function loadFromSlot(index: number): Promise<GameState | null> {
  try {
    const game = await idbGet<GameState>(`game-${index}`);
    if (!game?.userClubId || !game?.players || !game?.clubs) return null;
    return game;
  } catch {
    return null;
  }
}

/** Delete a save slot. */
export async function deleteSlot(index: number): Promise<void> {
  try {
    await idbDelete([`game-${index}`, `meta-${index}`]);
  } catch {
    // sem acesso ao IndexedDB: nada a apagar
  }
}
