/**
 * Two languages: English (main) and Dutch. Texts sit right where they're used:
 *   L('Ready ▶', 'Klaar ▶')            → a string in the current language
 *   both('Winner!', 'Winnaar!')        → both, for texts the host sends to other
 *                                        players (each shows it in their own language)
 *   tx(text)                           → turn either kind into a string to show
 */

export type Lang = 'en' | 'nl'
/** A text in both languages (or a plain string that needs no translating). */
export type Txt = string | { en: string; nl: string }

const KEY = 'battlemon:lang'
let lang: Lang = (() => {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'en' || v === 'nl') return v
  } catch {
    /* private mode */
  }
  return 'en'
})()
document.documentElement.lang = lang

const listeners: (() => void)[] = []

export const getLang = () => lang
export function setLang(l: Lang) {
  if (l === lang) return
  lang = l
  document.documentElement.lang = l
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* private mode */
  }
  listeners.forEach((f) => f())
}
export function onLangChange(f: () => void) {
  listeners.push(f)
}

/** The current language's version. */
export const L = (en: string, nl: string) => (lang === 'nl' ? nl : en)
/** Both versions (for texts that travel to other players). */
export const both = (en: string, nl: string): Txt => ({ en, nl })
/** Show a text in the current language. */
export const tx = (t: Txt | undefined | null): string => (t == null ? '' : typeof t === 'string' ? t : t[lang])

/** Evaluate a text builder in both languages (for texts the host sends to everyone). */
export function inBoth(fn: () => string): Txt {
  const keep = lang
  lang = 'en'
  const en = fn()
  lang = 'nl'
  const nl = fn()
  lang = keep
  return { en, nl }
}

/** A small EN | NL segmented switch. Bind it with bindLangSwitch. */
export const langSwitch = (cls = '') =>
  `<div class="lang-sw ${cls}" role="radiogroup" aria-label="Language / Taal">${(['en', 'nl'] as Lang[])
    .map((l) => `<button type="button" data-lang="${l}" role="radio" aria-checked="${l === lang}" class="${l === lang ? 'on' : ''}">${l.toUpperCase()}</button>`)
    .join('')}</div>`

export function bindLangSwitch(root: ParentNode, onPick?: (l: Lang) => void) {
  root.querySelectorAll<HTMLButtonElement>('.lang-sw [data-lang]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      const l = b.dataset.lang as Lang
      b.parentElement!.querySelectorAll('button').forEach((o) => {
        o.classList.toggle('on', o === b)
        o.setAttribute('aria-checked', String(o === b))
      })
      setLang(l)
      onPick?.(l)
    }),
  )
}
