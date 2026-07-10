import type { GameState } from "../types";

const SLOT_PREFIX = "retro-manager-slot-";
const MAX_SLOTS = 10;

/** Metadata shown in the UI without loading the full GameState. */
export interface SlotMeta {
  clubName: string;
  season: number;
  week: number;
  savedAt: string; // ISO date
}

interface SaveSlotData {
  game: GameState;
  meta: SlotMeta;
}

/** Read the meta for every slot (null = empty). */
export function listSlots(): (SlotMeta | null)[] {
  const result: (SlotMeta | null)[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    try {
      const raw = localStorage.getItem(`${SLOT_PREFIX}${i}`);
      if (!raw) { result.push(null); continue; }
      const data = JSON.parse(raw) as SaveSlotData;
      result.push(data.meta);
    } catch {
      result.push(null);
    }
  }
  return result;
}

/** Save the current game into a numbered slot. */
export function saveToSlot(index: number, game: GameState): void {
  const club = game.clubs.find((c) => c.id === game.userClubId);
  const meta: SlotMeta = {
    clubName: club?.name ?? "???",
    season: game.season,
    week: game.week,
    savedAt: new Date().toISOString(),
  };
  const data: SaveSlotData = { game, meta };
  localStorage.setItem(`${SLOT_PREFIX}${index}`, JSON.stringify(data));
}

/** Load the GameState from a numbered slot (null if empty / corrupt). */
export function loadFromSlot(index: number): GameState | null {
  try {
    const raw = localStorage.getItem(`${SLOT_PREFIX}${index}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveSlotData;
    if (!data.game?.userClubId || !data.game?.players || !data.game?.clubs) return null;
    return data.game;
  } catch {
    return null;
  }
}

/** Delete a save slot. */
export function deleteSlot(index: number): void {
  localStorage.removeItem(`${SLOT_PREFIX}${index}`);
}
