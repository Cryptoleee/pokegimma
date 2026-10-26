import { L } from './i18n'

/**
 * Keyboard controls, changeable in Options. Escape always pauses and the arrow
 * keys always walk too; everything else can go on any key. Attack 1 is the
 * left mouse button, plus a key if you like (none by default).
 */
export type Action = 'up' | 'down' | 'left' | 'right' | 'move1' | 'move2' | 'move3' | 'move4' | 'catch' | 'switch' | 'master' | 'potion' | 'revive' | 'board' | 'chat'

export const DEFAULT_KEYS: Record<Action, string> = {
  up: 'w', down: 's', left: 'a', right: 'd',
  move1: '', move2: 'q', move3: 'e', move4: 'r',
  catch: ' ', switch: 'f', master: '1', potion: '2', revive: '3',
  board: 'tab', chat: 'enter',
}

/** In the order Options lists them. */
export const ACTIONS: Action[] = ['up', 'left', 'down', 'right', 'move1', 'move2', 'move3', 'move4', 'catch', 'switch', 'master', 'potion', 'revive', 'board', 'chat']

export const actionName = (a: Action) =>
  ({
    up: L('Walk up', 'Omhoog lopen'),
    down: L('Walk down', 'Omlaag lopen'),
    left: L('Walk left', 'Naar links'),
    right: L('Walk right', 'Naar rechts'),
    move1: L('Move 1 (also left mouse)', 'Aanval 1 (ook linkermuis)'),
    move2: L('Move 2', 'Aanval 2'),
    move3: L('Move 3', 'Aanval 3'),
    move4: L('Ultimate', 'Ultimate'),
    catch: L('Catch (raid: role ability)', 'Vangen (raid: rol-ability)'),
    switch: L('Switch Pokémon', 'Wissel Pokémon'),
    master: 'Master Ball',
    potion: 'Potion',
    revive: 'Revive',
    board: L('Scoreboard', 'Scorebord'),
    chat: 'Chat',
  })[a]

/** Keys that can't be taken: pausing, and the ones the browser keeps for itself. */
export const RESERVED = new Set(['escape', 'f5', 'f11', 'f12', 'meta', 'os', 'contextmenu'])

const KEY = 'sb:keys'
let binds: Record<Action, string> = load()
let reverse = index()
const listeners = new Set<() => void>()

function load(): Record<Action, string> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<Action, string>>
    const out = { ...DEFAULT_KEYS }
    for (const a of ACTIONS) if (typeof saved[a] === 'string' && !RESERVED.has(saved[a]!)) out[a] = saved[a]!
    return out
  } catch {
    return { ...DEFAULT_KEYS }
  }
}
function index() {
  const m = new Map<string, Action>()
  for (const a of ACTIONS) if (binds[a]) m.set(binds[a], a)
  return m
}
function save() {
  reverse = index()
  try {
    localStorage.setItem(KEY, JSON.stringify(binds))
  } catch {
    /* private mode */
  }
  listeners.forEach((f) => f())
}

export const keyOf = (a: Action) => binds[a]
/** The action on a key (from KeyboardEvent.key, lower case), if any. */
export const actionOf = (key: string) => reverse.get(key)

/** Put an action on a key; whatever had that key gets this action's old key (a swap). */
export function bind(a: Action, key: string) {
  if (RESERVED.has(key)) return
  const other = reverse.get(key)
  if (other && other !== a) binds[other] = binds[a]
  binds[a] = key
  save()
}
export function unbind(a: Action) {
  binds[a] = ''
  save()
}
export function resetKeys() {
  binds = { ...DEFAULT_KEYS }
  save()
}
export function onKeysChange(f: () => void) {
  listeners.add(f)
  return () => listeners.delete(f)
}

/** How a key reads on screen. */
export function keyName(key: string) {
  if (!key) return '—'
  const named: Record<string, () => string> = {
    ' ': () => L('Space', 'Spatie'),
    enter: () => 'Enter',
    tab: () => 'Tab',
    shift: () => 'Shift',
    control: () => 'Ctrl',
    alt: () => 'Alt',
    backspace: () => '⌫',
    capslock: () => 'Caps',
    arrowup: () => '↑',
    arrowdown: () => '↓',
    arrowleft: () => '←',
    arrowright: () => '→',
  }
  return named[key]?.() ?? (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1))
}
