import { sfx } from '../audio'
import { getLang, L } from '../i18n'
import { profile } from '../profile'

/**
 * "Send feedback": a short message to the maker (a bug, an idea, anything).
 * Opened from home and from the results after a match; it lands in the inbox
 * of the creator panel (/stats). Where you were comes along, nothing else.
 */
export interface FeedbackCtx {
  mode: 'menu' | 'br' | 'raid' | 'duel'
  result?: 'win' | 'lose' | 'clear' | 'fail'
}

const KINDS = [
  ['bug', () => L('🐞 Bug', '🐞 Bug')],
  ['idea', () => L('💡 Idea', '💡 Idee')],
  ['other', () => L('💬 Other', '💬 Anders')],
] as const

export function showFeedback(ctx: FeedbackCtx, onClose?: () => void) {
  const modal = document.getElementById('modal')!
  let kind: string = ctx.result === 'fail' || ctx.result === 'lose' ? 'other' : 'idea'
  modal.classList.remove('hidden')
  modal.innerHTML = `
    <div class="panel fb">
      <button class="sheet-x fb-x" aria-label="${L('Close', 'Sluiten')}">✕</button>
      <div class="sup-head"><span class="fb-ic">💬</span><b>${L('Send feedback', 'Feedback sturen')}</b></div>
      <p class="fb-intro">${L('Found a bug, got an idea, or something felt off? Tell me: I read every message.', 'Een bug gevonden, een idee, of voelde iets niet goed? Laat het weten: ik lees elk bericht.')}</p>
      <div class="fb-kinds" role="radiogroup">${KINDS.map(([k, name]) => `<button class="fb-kind ${k === kind ? 'on' : ''}" data-k="${k}" role="radio" aria-checked="${k === kind}">${name()}</button>`).join('')}</div>
      <textarea class="fb-text" maxlength="1000" rows="5" placeholder="${L('What happened, or what would make it better?', 'Wat gebeurde er, of wat zou het beter maken?')}"></textarea>
      <div class="fb-foot"><small class="fb-count">0 / 1000</small><span class="fb-err"></span></div>
      <button class="btn fb-send" disabled>${L('Send', 'Versturen')}</button>
    </div>`
  const panel = modal.querySelector('.panel.fb') as HTMLElement
  const text = modal.querySelector('.fb-text') as HTMLTextAreaElement
  const send = modal.querySelector('.fb-send') as HTMLButtonElement
  const err = modal.querySelector('.fb-err') as HTMLElement
  const count = modal.querySelector('.fb-count') as HTMLElement
  const close = () => {
    modal.classList.add('hidden')
    modal.innerHTML = ''
    modal.onclick = null
    onClose?.()
  }
  modal.querySelector('.fb-x')!.addEventListener('click', () => {
    sfx.select()
    close()
  })
  modal.onclick = (e) => e.target === modal && close()
  modal.querySelectorAll<HTMLElement>('.fb-kind').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.select()
      kind = b.dataset.k!
      modal.querySelectorAll<HTMLElement>('.fb-kind').forEach((x) => {
        x.classList.toggle('on', x === b)
        x.setAttribute('aria-checked', String(x === b))
      })
    }),
  )
  // Typing never reaches the game's keys (WASD, 1 2 3, space…)
  text.addEventListener('keydown', (e) => e.stopPropagation())
  text.addEventListener('input', () => {
    count.textContent = `${text.value.length} / 1000`
    send.disabled = text.value.trim().length < 3
    err.textContent = ''
  })
  send.addEventListener('click', async () => {
    send.disabled = true
    send.textContent = L('Sending…', 'Versturen…')
    const dev = matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop'
    let status = 0
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ text: text.value, kind, ctx: { ...ctx, lang: getLang(), dev, name: profile().name } }),
      })
      status = r.status
    } catch {
      status = 0
    }
    if (status === 200) {
      sfx.select()
      panel.innerHTML = `
        <button class="sheet-x fb-x" aria-label="${L('Close', 'Sluiten')}">✕</button>
        <div class="fb-done"><span>💌</span><b>${L('Thank you!', 'Dankjewel!')}</b><p>${L('Your message is in. It really helps.', 'Je bericht is binnen. Het helpt echt.')}</p></div>
        <button class="btn fb-ok">${L('Back to the game', 'Terug naar de game')}</button>`
      panel.querySelector('.fb-x')!.addEventListener('click', close)
      panel.querySelector('.fb-ok')!.addEventListener('click', () => {
        sfx.select()
        close()
      })
      return
    }
    sfx.denied()
    send.disabled = false
    send.textContent = L('Send', 'Versturen')
    err.textContent =
      status === 429
        ? L('That was a lot at once: try again in a while.', 'Dat waren er veel tegelijk: probeer het straks nog eens.')
        : L("Couldn't send it right now. Try again in a moment.", 'Versturen lukte nu niet. Probeer het zo nog eens.')
  })
  setTimeout(() => text.focus(), 50)
}
