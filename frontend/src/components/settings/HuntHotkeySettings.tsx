import { useCallback, useId, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Toggle } from "../shared/Toggle";
import { EntryHotkeyAction, EntryHotkeys, Group, Pokemon } from "../../types";
import { useI18n } from "../../contexts/I18nContext";
import { ENTRY_HOTKEY_ACTIONS } from "../../utils/hotkeyCombo";
import { useHotkeyRecorder } from "../../hooks/useHotkeyRecorder";
import { sidebarSpriteUrl } from "../dashboard/presentation";
import {
  HOTKEY_ACTION_ICONS,
  huntIdentity,
  isRunningHunt,
  readRejection,
  Translate,
  writeHotkey,
} from "./hotkeyActions";
import { HotkeyRecordingStatus, HotkeyRowMessage, KeyCell } from "./KeyCell";

// --- Entry model ---

/** Which backend collection an entry writes to. */
type EntryKind = "pokemon" | "group";

/** One bindable entry: a running hunt or a group. */
interface HotkeyEntry {
  kind: EntryKind;
  id: string;
  /** Primary name: the nickname, else the species or group name. */
  name: string;
  /** Secondary line that tells two same-species hunts apart. */
  meta: string;
  /** The hunt itself for its sprite, or null for a group. */
  pokemon: Pokemon | null;
  /** Group colour, shown as a dot in place of a sprite. */
  color: string | null;
  hotkeys: EntryHotkeys | undefined;
}

/** Builds the row of a hunt, named the way the sidebar names it. */
function huntEntry(p: Pokemon): HotkeyEntry {
  const { name, meta } = huntIdentity(p);
  return { kind: "pokemon", id: p.id, name, meta, pokemon: p, color: null, hotkeys: p.hotkeys };
}

function groupEntry(g: Group, memberCount: number, t: Translate): HotkeyEntry {
  return {
    kind: "group",
    id: g.id,
    name: g.name,
    meta: t("group.count", { count: memberCount }),
    pokemon: null,
    color: g.color || "#6b7280",
    hotkeys: g.hotkeys,
  };
}

/** Stable slot id, "<kind>:<id>:<action>". Also keys the overrides. */
function slotIdOf(entry: HotkeyEntry, action: EntryHotkeyAction): string {
  return `${entry.kind}:${entry.id}:${action}`;
}

/** Maps a slot id back onto the endpoint that owns that binding. */
function endpointFor(slotId: string): string {
  // The id in the middle is opaque, so the kind is read from the front and the
  // action from the back instead of splitting on every separator.
  const kindEnd = slotId.indexOf(":");
  const actionStart = slotId.lastIndexOf(":");
  const kind = slotId.slice(0, kindEnd);
  const id = slotId.slice(kindEnd + 1, actionStart);
  return `/api/hotkeys/${kind}/${id}/${slotId.slice(actionStart + 1)}`;
}

/** A refused write, pinned to the slot that caused it. */
interface SlotFeedback {
  slotId: string;
  text: string;
}

/**
 * Column template shared by the header and every row, so the three key
 * columns line up. The cells are w-36, which is exactly 9rem. It switches on
 * the section's own width, not the viewport, because the app's navigation
 * takes a varying share of the window.
 */
const MATRIX_COLUMNS = "@xl:grid @xl:grid-cols-[minmax(0,1fr)_repeat(3,9rem)] @xl:gap-x-3";

// --- Entry row ---

interface HotkeyEntryRowProps {
  entry: HotkeyEntry;
  /** Optimistic combos, keyed by slot id. They outrank the snapshot. */
  overrides: Record<string, string>;
  /** Slot currently capturing, page-wide. */
  recording: string | null;
  liveModifiers: string;
  feedback: SlotFeedback | null;
  onStart: (slotId: string) => void;
  onCancel: () => void;
  onClear: (slotId: string) => void;
}

/**
 * One hunt or group as a matrix row: identity on the left, then one key cell
 * per action. In a narrow section, such as at phone width, the row becomes a stacked card where every cell
 * carries its own visible action label, since the column header is hidden.
 */
function HotkeyEntryRow({
  entry,
  overrides,
  recording,
  liveModifiers,
  feedback,
  onStart,
  onCancel,
  onClear,
}: Readonly<HotkeyEntryRowProps>) {
  const { t } = useI18n();
  const slotIds = ENTRY_HOTKEY_ACTIONS.map((action) => slotIdOf(entry, action));
  const isRecordingHere = recording !== null && slotIds.includes(recording);
  const refusedIndex = feedback ? slotIds.indexOf(feedback.slotId) : -1;
  const refusal = refusedIndex === -1 ? null : feedback;
  const messageId = refusal ? `hotkey-msg-${refusal.slotId}` : undefined;

  return (
    <li
      className={`flex flex-col gap-2 @xl:items-center bg-bg-secondary rounded-lg px-3 py-2 border transition-colors ${MATRIX_COLUMNS} ${
        isRecordingHere ? "border-accent-blue/50" : "border-transparent"
      }`}
    >
      <EntryIdentity entry={entry} />

      {ENTRY_HOTKEY_ACTIONS.map((action, i) => {
        const slotId = slotIds[i];
        const actionLabel = t(`hotkeys.${action}`);
        const Icon = HOTKEY_ACTION_ICONS[action];
        const isRecording = recording === slotId;
        const hasError = refusal?.slotId === slotId;
        return (
          // Wrapping instead of shrinking keeps the phone-width card readable:
          // the cell drops under its label rather than squeezing it away.
          <div
            key={action}
            className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 @xl:block"
          >
            {/* The cell's accessible name already carries the action. */}
            <span
              aria-hidden="true"
              className="flex items-center gap-1.5 text-xs text-text-secondary @xl:hidden"
            >
              <Icon className="w-3.5 h-3.5 shrink-0 text-text-muted" />
              {actionLabel}
            </span>
            <KeyCell
              combo={overrides[slotId] ?? entry.hotkeys?.[action] ?? ""}
              isRecording={isRecording}
              liveModifiers={isRecording ? liveModifiers : ""}
              name={t("hotkeys.cellTarget", { action: actionLabel, name: entry.name })}
              onStart={() => onStart(slotId)}
              onCancel={onCancel}
              onClear={() => onClear(slotId)}
              messageId={hasError ? messageId : undefined}
              hasError={hasError}
            />
          </div>
        );
      })}

      {refusal && (
        <div className="@xl:col-span-4">
          <HotkeyRowMessage
            id={messageId}
            tone="error"
            text={`${t(`hotkeys.${ENTRY_HOTKEY_ACTIONS[refusedIndex]}`)}: ${refusal.text}`}
          />
        </div>
      )}
    </li>
  );
}

/** Sprite or group colour, name and the distinguishing secondary line. */
function EntryIdentity({ entry }: Readonly<{ entry: HotkeyEntry }>) {
  // A broken sprite falls back once, the same way the sidebar handles it.
  const [imgError, setImgError] = useState<Record<string, string>>({});
  const src = entry.pokemon ? sidebarSpriteUrl(entry.pokemon, imgError) : "";

  return (
    <div className="flex items-center gap-2 min-w-0">
      {entry.pokemon ? (
        // Decorative: the name next to it identifies the hunt.
        <img
          src={src}
          alt=""
          onError={() => setImgError({ [entry.id]: src })}
          className="pokemon-sprite w-8 h-8 object-contain shrink-0"
        />
      ) : (
        <span className="w-8 h-8 flex items-center justify-center shrink-0" aria-hidden="true">
          <span
            className="w-2.5 h-2.5 rounded-sm border border-black/20"
            style={{ backgroundColor: entry.color ?? undefined }}
          />
        </span>
      )}
      <div className="min-w-0">
        {/* No truncation: a cut-off nickname would hide which hunt a key binds. */}
        <p className="text-sm 2xl:text-base font-medium text-text-primary break-words capitalize">
          {entry.name}
        </p>
        {entry.meta && (
          <p className="text-[11px] 2xl:text-xs text-text-muted break-words capitalize">
            {entry.meta}
          </p>
        )}
      </div>
    </div>
  );
}

// --- Matrix ---

interface EntryMatrixProps extends Omit<HotkeyEntryRowProps, "entry"> {
  headingId: string;
  heading: string;
  entries: HotkeyEntry[];
}

/**
 * One subsection of the editor: the column header once, then a row per entry.
 * The header row doubles as the subsection heading, so the action labels over
 * the key columns are hidden from assistive technology, where every cell
 * already names its action.
 */
function EntryMatrix({ headingId, heading, entries, ...rowProps }: Readonly<EntryMatrixProps>) {
  const { t } = useI18n();
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div
        className={`flex items-end px-3 border border-transparent text-xs font-semibold text-text-muted uppercase ${MATRIX_COLUMNS}`}
      >
        <h3 id={headingId}>{heading}</h3>
        {ENTRY_HOTKEY_ACTIONS.map((action) => {
          const Icon = HOTKEY_ACTION_ICONS[action];
          return (
            <span key={action} aria-hidden="true" className="hidden @xl:flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {t(`hotkeys.${action}`)}
            </span>
          );
        })}
      </div>
      <ul aria-labelledby={headingId} className="space-y-2">
        {entries.map((entry) => (
          <HotkeyEntryRow key={`${entry.kind}:${entry.id}`} entry={entry} {...rowProps} />
        ))}
      </ul>
    </section>
  );
}

// --- Filter ---

/** Entry count from which the search and the "only bound" switch appear. */
const FILTER_THRESHOLD = 6;

/**
 * Whether an entry passes the search and the "only bound" switch. The search
 * matches the name and the secondary line, so a game or form finds a hunt too.
 */
function matchesFilter(
  entry: HotkeyEntry,
  query: string,
  onlyBound: boolean,
  overrides: Record<string, string>,
): boolean {
  const q = query.trim().toLowerCase();
  if (q && !`${entry.name} ${entry.meta}`.toLowerCase().includes(q)) return false;
  if (!onlyBound) return true;
  return ENTRY_HOTKEY_ACTIONS.some(
    (action) => (overrides[slotIdOf(entry, action)] ?? entry.hotkeys?.[action] ?? "") !== "",
  );
}

interface EntryFilterProps {
  query: string;
  onlyBound: boolean;
  onQuery: (q: string) => void;
  onOnlyBound: (v: boolean) => void;
}

/** Search field and "only bound" switch above a long hunt and group list. */
function EntryFilter({ query, onlyBound, onQuery, onOnlyBound }: Readonly<EntryFilterProps>) {
  const { t } = useI18n();
  const toggleId = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="relative flex-1 min-w-48">
        <Search
          aria-hidden="true"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("dash.search")}
          aria-label={t("hotkeys.searchLabel")}
          className="w-full h-9 bg-bg-primary border border-border-input rounded-md pl-8 pr-2 text-sm text-text-primary placeholder-text-faint hover:border-border-default transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
        />
      </div>
      <div className="inline-flex items-center gap-2">
        <Toggle id={toggleId} enabled={onlyBound} onChange={() => onOnlyBound(!onlyBound)} />
        <label htmlFor={toggleId} className="text-sm text-text-secondary cursor-pointer">
          {t("hotkeys.onlyBound")}
        </label>
      </div>
    </div>
  );
}

// --- Section ---

interface HuntHotkeySettingsProps {
  /** Every Pokémon in the snapshot; the running hunts are picked out here. */
  pokemon: Pokemon[];
  groups: Group[];
}

/**
 * HuntHotkeySettings binds the increment, decrement and reset hotkeys of every
 * running hunt and every group as a matrix: one row per entry, one column per
 * action. Unlike the global hotkeys these act on their own entry, whatever the
 * current hotkey target happens to be.
 */
export function HuntHotkeySettings({ pokemon, groups }: Readonly<HuntHotkeySettingsProps>) {
  const { t } = useI18n();
  // Written through optimistically: the backend owns the binding, but the
  // snapshot prop only catches up on the next state broadcast.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<SlotFeedback | null>(null);
  const [query, setQuery] = useState("");
  const [onlyBound, setOnlyBound] = useState(false);

  const runningHunts = useMemo(() => pokemon.filter(isRunningHunt), [pokemon]);
  const huntEntries = useMemo(() => runningHunts.map(huntEntry), [runningHunts]);
  const groupEntries = useMemo(
    () =>
      [...groups]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((g) => groupEntry(g, runningHunts.filter((p) => p.group_id === g.id).length, t)),
    [groups, runningHunts, t],
  );

  /** Writes one binding, clearing it for an empty combo. */
  const write = useCallback(
    async (slotId: string, combo: string) => {
      setFeedback(null);
      const res = await writeHotkey(endpointFor(slotId), combo);
      if (!res.ok) {
        setFeedback({ slotId, text: await readRejection(res, t) });
        return;
      }
      setOverrides((prev) => ({ ...prev, [slotId]: combo }));
      globalThis.electronAPI?.syncHotkeys?.();
    },
    [t],
  );

  const { recording, liveModifiers, start, cancel } = useHotkeyRecorder<string>(write);

  const startRecording = useCallback(
    (slotId: string) => {
      setFeedback(null);
      start(slotId);
    },
    [start],
  );

  const clearBinding = useCallback((slotId: string) => void write(slotId, ""), [write]);

  const totalEntries = huntEntries.length + groupEntries.length;
  if (totalEntries === 0) {
    return <p className="text-xs 2xl:text-sm text-text-muted">{t("hotkeys.huntEmpty")}</p>;
  }

  const showFilter = totalEntries >= FILTER_THRESHOLD;
  const keep = (entry: HotkeyEntry) => matchesFilter(entry, query, onlyBound, overrides);
  const shownHunts = showFilter ? huntEntries.filter(keep) : huntEntries;
  const shownGroups = showFilter ? groupEntries.filter(keep) : groupEntries;

  const rowProps = {
    overrides,
    recording,
    liveModifiers,
    feedback,
    onStart: startRecording,
    onCancel: cancel,
    onClear: clearBinding,
  };

  return (
    <div className="@container space-y-5">
      {showFilter && (
        <EntryFilter
          query={query}
          onlyBound={onlyBound}
          onQuery={setQuery}
          onOnlyBound={setOnlyBound}
        />
      )}

      {shownHunts.length > 0 && (
        <EntryMatrix
          headingId="hunt-hotkeys-hunts"
          heading={t("hotkeys.huntsLabel")}
          entries={shownHunts}
          {...rowProps}
        />
      )}

      {shownGroups.length > 0 && (
        <EntryMatrix
          headingId="hunt-hotkeys-groups"
          heading={t("hotkeys.groupsLabel")}
          entries={shownGroups}
          {...rowProps}
        />
      )}

      {shownHunts.length + shownGroups.length === 0 && (
        <p role="status" className="text-xs 2xl:text-sm text-text-muted">
          {t("detector.noSearchResults")}
        </p>
      )}

      <HotkeyRecordingStatus
        name={recordingName(recording, [...huntEntries, ...groupEntries], t)}
      />
    </div>
  );
}

/** Accessible name of the capturing slot, for the live region. */
function recordingName(
  recording: string | null,
  entries: HotkeyEntry[],
  t: Translate,
): string | null {
  if (recording === null) return null;
  for (const entry of entries) {
    const action = ENTRY_HOTKEY_ACTIONS.find((a) => slotIdOf(entry, a) === recording);
    if (action)
      return t("hotkeys.cellTarget", { action: t(`hotkeys.${action}`), name: entry.name });
  }
  return null;
}
