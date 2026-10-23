import { sfx } from '../audio'
import { SHOP_URL, SUPPORTER_NAMES, TIERS } from '../data/support'
import { L } from '../i18n'
import { appEsc as esc } from './app'

/**
 * "Support the game": what supporting is for, the one-time packs, a button to the
 * Patreon shop and the thanks list. Opened from home (the heart), the options and, now
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
      <p class="sup-intro">${L('Stormbreak Royale is made by one person and stays free, without ads in your face. A one-time pack pays for servers, art and the next dungeon, and its rewards are yours forever. All cosmetic: they never make you stronger.', 'Stormbreak Royale wordt door één persoon gemaakt en blijft gratis, zonder ads in je gezicht. Een eenmalig pakket betaalt servers, art en de volgende dungeon, en de beloningen zijn voor altijd van jou. Alles cosmetisch: je wordt er nooit sterker van.')}</p>
      <div class="sup-tiers">${TIERS.map((t) => `
        <div class="sup-tier sup-${t.id}"><img class="px" src="${t.badge}" alt=""><span><b>${t.name()} <em>${t.price} ${L('one-time', 'eenmalig')}</em></b><small>${t.perks()}</small></span></div>`).join('')}
      </div>
      <a class="btn sup-go" href="${SHOP_URL}" target="_blank" rel="noopener">${L('Go to the shop', 'Naar de shop')} ↗</a>
      <p class="sup-free">${L('After buying, log in with Discord and send me your friend code (Friends tab) on Patreon. Following for free helps too.', 'Log na het kopen in met Discord en stuur me je vriendcode (tabblad Vrienden) op Patreon. Gratis volgen helpt ook.')}</p>
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
