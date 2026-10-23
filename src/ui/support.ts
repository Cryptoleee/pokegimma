import { sfx } from '../audio'
import { PATREON_URL, SUPPORTER_NAMES, TIERS } from '../data/support'
import { L } from '../i18n'
import { appEsc as esc } from './app'

/**
 * "Support the game": what supporting is for, the Patreon tiers, a button to the
 * page and the thanks list. Opened from home (the heart), the options and, now
 * and then, after a win. Never pops up by itself.
 */
export function showSupport(onClose?: () => void) {
  const modal = document.getElementById('modal')!
  const names = [...SUPPORTER_NAMES].sort((a, b) => TIERS.findIndex((t) => t.id === b.tier) - TIERS.findIndex((t) => t.id === a.tier))
  modal.classList.remove('hidden')
  modal.innerHTML = `
    <div class="panel sup">
      <button class="sheet-x sup-x" aria-label="${L('Close', 'Sluiten')}">✕</button>
      <div class="sup-head"><span class="sup-heart">♥</span><b>${L('Support the game', 'Steun de game')}</b></div>
      <p class="sup-intro">${L('Stormbreak Royale is made by one person and stays free, without ads in your face. Supporting it on Patreon pays for servers, art and the next dungeon.', 'Stormbreak Royale wordt door één persoon gemaakt en blijft gratis, zonder ads in je gezicht. Steun op Patreon betaalt servers, art en de volgende dungeon.')}</p>
      <div class="sup-tiers">${TIERS.map((t) => `
        <div class="sup-tier sup-${t.id}"><img class="px" src="${t.badge}" alt=""><span><b>${t.name()} <em>${t.price} ${L('/ month', '/ maand')}</em></b><small>${t.perks()}</small></span></div>`).join('')}
      </div>
      <a class="btn sup-go" href="${PATREON_URL}" target="_blank" rel="noopener">${L('Go to Patreon', 'Naar Patreon')} ↗</a>
      <p class="sup-free">${L('Following for free helps too: you get every devlog.', 'Gratis volgen helpt ook: dan krijg je elke devlog.')}</p>
      ${names.length ? `<div class="sup-thanks"><span class="n-label">${L('Thank you', 'Bedankt')}</span><p>${names.map((n) => `<span class="sup-name sup-${n.tier}">${esc(n.name)}</span>`).join('')}</p></div>` : ''}
    </div>`
  const close = () => {
    modal.classList.add('hidden')
    modal.innerHTML = ''
    modal.onclick = null
    onClose?.()
  }
  modal.querySelector('.sup-x')!.addEventListener('click', () => {
    sfx.select()
    close()
  })
  modal.querySelector('.sup-go')!.addEventListener('click', () => sfx.select())
  modal.onclick = (e) => e.target === modal && close()
}

const ASK_KEY = 'sb:supportAsk'
/** After a win, at most once a day: a quiet line under the results. */
export function askAfterWin() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem(ASK_KEY) === today) return false
    localStorage.setItem(ASK_KEY, today)
    return true
  } catch {
    return false
  }
}
