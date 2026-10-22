import { SPECIES, spriteUrl } from '../data/pokemon'
import { TRAINERS, trainerSpriteUrl, type TrainerDef } from '../data/trainers'
import { questText, trainerName } from '../data/rewards'
import { ROYALE_THEMES, THEMES } from '../data/themes'
import { STADIUM_LIST, STADIUMS } from '../data/stadiums'
import { BOSS_LIST, BOSSES } from '../data/bosses'
import { finalForm } from '../game/boss'
import { SEATS } from '../game/game'
import { sfx } from '../audio'
import { L } from '../i18n'
import { profile, setName, NAME_MAX } from '../profile'
import { cleanCode, MAX_PLAYERS } from '../net/room'
import { DIFFICULTIES, diffName, diffNote, saveDiff, savedDiff, type Difficulty } from '../data/difficulty'
import type { MatchChoice } from '../net/protocol'
import { progress, onProgress, today } from '../progress'
import { dailyOf, levelCost, levelOf, nextUnlock } from '../../api/_progress'
import { showOptions } from './screens'
import { hasUnseen, maybeShowNews, newsPreview, showNews } from './news'
import { appEsc as esc, appShell, bar, bindShell, BOLT, DISCORD, discordMe, IC, icon, masteryLine, monChips, monImg, strike, teamCard, teamStage, type AppTab } from './app'
import { openTeamSheet } from './team'
import { storm, STORM_TINT } from './storm'
import { shinyPartner } from './menu'

/**
 * Play: the home screen (your team on a stage, the three modes) and a screen
 * per mode where you choose how to play it, with your team card right above
 * the big button.
 */

export type MenuView = 'home' | MatchChoice['kind']

export interface MenuActions {
  solo(c: MatchChoice): void
  /** Quick play: a public lobby with random players. */
  quick(): void
  /** 1 vs 1 online: a public duel lobby (or the CPU if nobody shows up). */
  quickDuel(): void
  /** Make a private match of this mode. */
  host(c?: MatchChoice): void
  join(code: string): void
  /** Back into the friends' lobby you just left. */
  rejoin(code: string): void
  /** Join a friend's lobby (`q` ≥ 0: a quick play slot). */
  joinFriend(code: string, q: number): void
  /** Another tab (Team, Friends, Profile). */
  tab(t: AppTab): void
  /** The full Team screen from a mode screen's switch sheet, with a way back to that mode. */
  teamAll(kind: MatchChoice['kind']): void
  /** New team from the switch sheet; the menu repaints on the same screen. */
  setTeam(t: TrainerDef, mon: number, view: MenuView): void
  back(): void
}

export interface MenuState {
  trainer: TrainerDef
  team: number[]
  /** Last solo choice (mode + world/boss). */
  choice: MatchChoice
  /** Open this screen (default: home). */
  view?: MenuView
  /** A lobby you left a moment ago (shown as "Rejoin"). */
  rejoin?: string
  /** Pre-filled join code (from a shared link). */
  code?: string
  error?: string
  busy?: string
}

type Opt = 'quick' | 'solo' | 'friends' | 'online' | 'cpu'

const screen = () => document.getElementById('screen')!

function greeting() {
  const h = new Date().getHours()
  return h < 6 ? L('Good night', 'Goedenacht') : h < 12 ? L('Good morning', 'Goedemorgen') : h < 18 ? L('Good afternoon', 'Goedemiddag') : L('Good evening', 'Goedenavond')
}

/** Last "how to play" per mode, so the screen opens where you left it. */
const lastOpt: Partial<Record<MatchChoice['kind'], Opt>> = {}

/** Ask for a name before anything online (others need to know who you are); `edit` changes it. */
export function askName(then: () => void, edit = false) {
  if (profile().name && !edit) return then()
  const s = document.createElement('div')
  s.className = 'n-sheet'
  s.innerHTML = `
    <form class="n-sheet-card n-namecard">
      <div class="n-sheet-head"><h2>${edit ? L('Your name', 'Jouw naam') : L('What’s your name?', 'Hoe heet je?')}</h2><button type="button" class="n-x" aria-label="${L('Close', 'Sluiten')}">${icon(IC.close, 16)}</button></div>
      <p class="n-note">${L('Other players see this name in lobbies and matches.', 'Andere spelers zien deze naam in lobby’s en potjes.')}</p>
      <div class="n-field"><input id="n-name" maxlength="${NAME_MAX}" autocomplete="nickname" spellcheck="false" placeholder="${L('Your name', 'Jouw naam')}" value="${esc(profile().name)}"><button class="n-btn2" type="submit">${edit ? L('Save', 'Opslaan') : L('Go', 'Verder')}</button></div>
    </form>`
  document.body.append(s)
  const input = s.querySelector('input') as HTMLInputElement
  const close = () => {
    s.classList.remove('open')
    setTimeout(() => s.remove(), 300)
  }
  s.querySelector('.n-x')!.addEventListener('click', () => {
    sfx.select()
    close()
  })
  s.addEventListener('click', (e) => e.target === s && close())
  s.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault()
    setName(input.value)
    if (!profile().name) {
      sfx.error()
      input.focus()
      return
    }
    sfx.select()
    close()
    then()
  })
  requestAnimationFrame(() => {
    s.classList.add('open')
    input.focus()
  })
}

/** Bumped on every showMenu: listeners of an older menu stand down. */
let gen = 0

export function showMenu(st: MenuState, on: MenuActions) {
  const el = screen()
  const my = ++gen
  const live = () => gen === my && !!el.querySelector('.n-app[data-tab="play"]')
  const mon = st.team[0]
  const shiny = !!mon && shinyPartner(mon)
  let view: MenuView = st.view ?? 'home'
  let choice: MatchChoice = { ...st.choice, diff: st.choice.diff ?? savedDiff() }
  let msg = st.error ?? st.busy ?? ''
  let msgCls = st.error ? 'err' : st.busy ? 'busy' : ''
  let code = st.code ?? ''
  // A shared link opens the friends screen of the mode it came from
  if (st.code && view === 'home') {
    view = choice.kind
    lastOpt[choice.kind] = 'friends'
  }

  // ------------------------------------------------------------ home

  const home = () => {
    const p = progress()
    const lv = levelOf(p.xp).lv
    const q = dailyOf(p, today())
    const done = q.filter((x) => x.p >= x.target).length
    const name = profile().name
    const xp = levelOf(p.xp)
    const m = mon ? masteryLine(mon) : null
    return `
      <div class="n-page n-home">
        <header class="n-top">
          <div class="n-hello"><small>${greeting()}</small><b>${esc(name || L('Trainer', 'Trainer'))}${discordMe() ? `<span class="n-hello-dc" title="${L('Signed in with Discord', 'Ingelogd met Discord')}">${DISCORD}</span>` : ''}</b></div>
          <button class="n-pill" data-act="quests" aria-label="${L(`Daily quests: ${done} of ${q.length} done`, `Dagopdrachten: ${done} van ${q.length} klaar`)}">${icon(IC.star, 14)}${done}/${q.length}</button>
          <button class="n-icon home-news" aria-label="${L('What’s new', 'Wat is er nieuw')}">${icon(IC.news)}${hasUnseen() ? '<i class="n-pip"></i>' : ''}</button>
          <button class="n-icon home-opts" aria-label="${L('Options', 'Opties')}">${icon(IC.opts)}</button>
        </header>
        ${st.rejoin ? `<button class="n-card n-rejoin" data-act="rejoin"><span><b>${L('Back to the lobby', 'Terug naar de lobby')} <em>${esc(st.rejoin)}</em></b><small>${L('you left it a moment ago', 'je ging er net uit')}</small></span>${icon(IC.next, 18)}</button>` : ''}
        <div class="n-teamcol">
          <section class="n-stage">
            ${strike({ w: 350, h: 282, x: 268, x2: 214, reach: 0.73, seed: 7, every: 9 })}
            <div class="n-stage-tag"><span class="n-label">${L('Your team', 'Jouw team')}</span><b>${esc(st.trainer.name)}${mon ? ` &amp; ${SPECIES[mon].name}` : ''}</b></div>
            ${teamStage(st.trainer, mon, shiny)}
            <div class="n-stage-chips"><span class="n-chip">Lv ${lv}</span>${mon ? monChips(mon) : ''}</div>
            <button class="n-btn2 n-stage-edit" data-act="team">${L('Change', 'Wijzig')}</button>
          </section>
          <section class="n-teaminfo n-desk">
            ${m ? `<div class="n-ti-row"><span class="n-label">${L('Mastery', 'Meesterschap')}</span><b>★${m.lv}</b>${bar(m.k)}<small>${esc(m.hint)}</small></div>` : ''}
            <div class="n-ti-row"><span class="n-label">${L('Trainer level', 'Trainerlevel')}</span><b>Lv ${xp.lv}</b>${bar(xp.k, 'white')}<small>${xp.need ? L(`${xp.need - xp.into} XP to Lv ${xp.lv + 1}`, `Nog ${xp.need - xp.into} XP tot Lv ${xp.lv + 1}`) : L('Max level', 'Hoogste level')}</small></div>
            <div class="n-ti-acts"><button class="n-btn2" data-act="switch">${icon(IC.swap, 16)}${L('Switch team', 'Wissel team')}</button><button class="n-btn3" data-act="team">${L('All partners', 'Alle partners')}</button></div>
          </section>
        </div>
        <div class="n-playcol">
          <div class="n-sec n-mob"><h2 class="n-h2">${L('Play', 'Spelen')}</h2><span class="n-online"><i class="n-dot"></i><span class="n-online-txt">${L('checking…', 'online zoeken…')}</span></span></div>
          <div class="n-modes">
            <div class="n-mode n-mode-royale" data-mode="royale">
              <div class="n-art n-art-royale" aria-hidden="true">
                <img class="px a1" src="${spriteUrl(6)}" alt=""><img class="px a2" src="${spriteUrl(1)}" alt=""><img class="px a3" src="${spriteUrl(7)}" alt=""><img class="px a4" src="${spriteUrl(25)}" alt="">
              </div>
              <div class="n-mode-txt"><b>Battle Royale</b><small>${L(`${SEATS} trainers · 1 winner`, `${SEATS} trainers · 1 winnaar`)}</small><p class="n-mode-desc n-desk">${esc(MODE.royale.desc)}</p><span class="n-online n-desk"><i class="n-dot"></i><span class="n-online-txt">${L('checking…', 'online zoeken…')}</span></span></div>
              <div class="n-mode-acts">
                <button class="n-btn n-quick" data-act="quick">${BOLT}${L('Quick play', 'Snel spel')}</button>
                <button class="n-btn3 n-desk" data-go="solo">Solo</button>
                <button class="n-btn3 n-desk" data-go="friends">${L('Friends', 'Vrienden')}</button>
                <button class="n-icon n-more" data-act="more" aria-label="${L('More ways to play Battle Royale', 'Meer manieren om Battle Royale te spelen')}">${icon(IC.more, 18)}</button>
              </div>
            </div>
            <div class="n-mode n-mode-duel" data-mode="duel">
              <img class="px n-art n-art-one" src="${spriteUrl(448)}" alt="">
              <span class="n-chip acc n-new">${L('NEW', 'NIEUW')}</span>
              <span class="n-mode-txt"><b>1 vs 1</b><small>${L('Duel · best of 3', 'Duel · best of 3')}</small><span class="n-mode-desc n-desk">${esc(MODE.duel.desc)}</span></span>
              <div class="n-mode-acts n-desk"><button class="n-btn n-quick" data-go="online">${L('Online', 'Online')}</button><button class="n-btn3" data-go="cpu">CPU</button></div>
            </div>
            <div class="n-mode n-mode-raid" data-mode="raid">
              <img class="px n-art n-art-one n-art-boss" src="${spriteUrl(644)}" alt="">
              <span class="n-mode-txt"><b>Raid</b><small>${L('Team up vs. a boss', 'Samen vs. een baas')}</small><span class="n-mode-desc n-desk">${esc(MODE.raid.desc)}</span></span>
              <div class="n-mode-acts n-desk"><button class="n-btn n-quick" data-go="solo">Solo</button><button class="n-btn3" data-go="friends">${L('Friends', 'Vrienden')}</button></div>
            </div>
          </div>
          <form class="n-card n-joincode mm-code">
            <span class="n-jc-txt"><b>${icon(IC.friends, 16)}${L('Join a friend', 'Join een vriend')}</b><small>${L('Got a room code? Fill it in here', 'Heb je een roomcode? Vul hem hier in')}</small></span>
            <span class="n-field"><input id="mm-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" aria-label="${L('Room code', 'Roomcode')}" value="${esc(code)}"><button class="n-btn2" type="submit">${L('Join', 'Meedoen')}</button></span>
          </form>
          <div class="n-msg mm-msg ${msgCls}">${esc(msg)}</div>
        </div>
        ${extras(p, q, done, xp.lv)}
      </div>`
  }

  /** Desktop: a row of real things to do and look forward to under the hero. */
  const extras = (p: ReturnType<typeof progress>, q: ReturnType<typeof dailyOf>, done: number, lv: number) => {
    const next = nextUnlock(p)
    const xp = levelOf(p.xp)
    let toGo = 0
    if (next) for (let l = lv; l < next.lv; l++) toGo += levelCost(l)
    toGo -= xp.into
    const img = next ? (next.kind === 'partner' ? spriteUrl(Number(next.id)) : trainerSpriteUrl(TRAINERS.find((t) => t.key === next.id)?.sprite ?? next.id)) : ''
    const rname = next ? (next.kind === 'partner' ? SPECIES[Number(next.id)]?.name : trainerName(next.id)) : ''
    const k = next ? (lv === next.lv - 1 ? xp.k : (lv - 1 + xp.k) / (next.lv - 1)) : 1
    const nw = newsPreview()
    return `
      <div class="n-extra n-desk">
        <section class="n-xcard" data-act="quests" role="button" tabindex="0">
          <div class="n-sec"><h3 class="n-h3">${L('Daily quests', 'Dagopdrachten')}</h3><small>${done}/${q.length}</small></div>
          <div class="n-qlist">${q.map((x) => `
            <div class="n-q ${x.p >= x.target ? 'done' : ''}">
              <span>${x.p >= x.target ? icon(IC.check, 14) : ''}${esc(questText(x.id, x.target))}</span><em>${Math.min(x.p, x.target)}/${x.target}</em>
              ${bar(x.p / x.target)}<small>+${x.xp} XP</small>
            </div>`).join('')}</div>
        </section>
        <section class="n-xcard n-xreward" data-act="road" role="button" tabindex="0">
          <div class="n-sec"><h3 class="n-h3">${L('Next reward', 'Volgende beloning')}</h3>${next ? `<small>Lv ${next.lv}</small>` : ''}</div>
          ${next ? `
            <div class="n-xr-body">
              <span class="n-xr-pic"><img class="px n-sil" src="${img}" alt=""></span>
              <div class="n-xr-info"><b>${esc(rname ?? '')}</b><small>${next.kind === 'partner' ? L('Partner Pokémon', 'Partner-Pokémon') : 'Trainer'}</small>${bar(k)}<small>${L(`${toGo} XP to go`, `Nog ${toGo} XP`)}</small></div>
            </div>` : `<p class="n-note">${L('You unlocked everything. Respect!', 'Je hebt alles vrijgespeeld. Respect!')}</p>`}
        </section>
        <section class="n-xcard n-xnews" data-act="newscard" role="button" tabindex="0">
          <div class="n-sec"><h3 class="n-h3">${L('News', 'Nieuws')}${nw.unseen ? '<i class="n-pip"></i>' : ''}</h3><small>${esc(nw.date)}</small></div>
          <b class="n-xn-title">${esc(nw.title)}</b>
          <ul class="n-xn-items">${nw.items.map((it) => `<li><i>${it.icon}</i><span>${esc(it.text)}</span></li>`).join('')}</ul>
          <span class="n-link">${L('Read everything', 'Alles lezen')} ›</span>
        </section>
      </div>`
  }

  // ------------------------------------------------------------ mode screens

  const MODE: Record<MatchChoice['kind'], { title: string; desc: string; opts: [Opt, string][] }> = {
    royale: {
      title: 'Battle Royale',
      desc: L(`${SEATS} trainers on one island. The storm closes in; the last one standing wins.`, `${SEATS} trainers op één eiland. De storm trekt samen; wie als laatste overblijft, wint.`),
      opts: [['quick', 'Online'], ['solo', 'Solo'], ['friends', L('Friends', 'Vrienden')]],
    },
    duel: {
      title: '1 vs 1',
      desc: L('One opponent in a stadium. Both partners fully evolved at Lv 50. Best of 3.', 'Eén tegenstander in een stadion. Beide partners volledig geëvolueerd op Lv 50. Best of 3.'),
      opts: [['online', 'Online'], ['cpu', 'CPU'], ['friends', L('Friend', 'Vriend')]],
    },
    raid: {
      title: 'Raid',
      desc: L(`Up to ${MAX_PLAYERS} trainers against a legendary boss with its own arena. Get out of the red shapes on the ground!`, `Tot ${MAX_PLAYERS} trainers tegen een legendarische baas met eigen arena. Loop weg uit de rode vormen op de grond!`),
      opts: [['solo', 'Solo'], ['friends', L('With friends', 'Met vrienden')]],
    },
  }

  const banner = (kind: MatchChoice['kind']) => {
    const sprites = kind === 'royale'
      ? `<div class="n-bn-group">${[1, 7, 6, 25, 133].map((id, i) => monImg(id, `n-bn-mon d${i}`)).join('')}</div>`
      : kind === 'duel'
        ? `<div class="n-bn-group n-bn-vs"><span class="n-flip">${monImg(448, 'n-bn-mon')}</span><b class="n-vs">VS</b>${monImg(445, 'n-bn-mon d1')}</div>`
        : `<div class="n-bn-group n-bn-raid"><span class="n-flip">${monImg(25, 'n-bn-mon d1')}</span><span class="n-flip">${monImg(133, 'n-bn-mon d2')}</span>${monImg(644, 'n-bn-boss')}</div>`
    const right = kind === 'royale'
      ? `<span class="n-online"><i class="n-dot"></i><span class="n-online-txt"></span></span>`
      : kind === 'duel' ? `<span class="n-chip acc">${L('NEW', 'NIEUW')}</span>` : ''
    return `
      <section class="n-banner n-banner-${kind}">
        ${strike({ w: 390, h: 260, x: 300, x2: 262, reach: 0.72, seed: kind.length * 13, every: 7 })}
        ${kind === 'raid' ? '' : strike({ w: 390, h: 260, x: 70, x2: 104, reach: 0.55, seed: kind.length * 29 + 3, every: 12, delay: 4.5, size: 0.85 })}
        <button class="n-icon n-back" data-act="back" aria-label="${L('Back', 'Terug')}">${icon(IC.back)}</button>
        ${sprites}
        <div class="n-bn-foot"><h1 class="n-h1">${MODE[kind].title}</h1>${right}</div>
      </section>`
  }

  /** What sits under the "how do you want to play" switch. */
  const optPanel = (kind: MatchChoice['kind'], opt: Opt) => {
    if (opt === 'friends') return `
      <div class="n-friendsopt">
        <div class="n-card n-hostinfo"><b>${kind === 'duel' ? L('Challenge a friend', 'Daag een vriend uit') : L('Your own lobby', 'Eigen lobby')}</b><small>${L('You’re the host and get a code and link to share', 'Jij bent host en krijgt een code en link om te delen')}</small></div>
        <label class="n-label" for="mm-code">${L('Or join with a code', 'Of doe mee met een code')}</label>
        <form class="n-field mm-code"><input id="mm-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="${esc(code)}"><button class="n-btn2 mm-go" type="submit">${L('Join', 'Meedoen')}</button></form>
      </div>`
    if (kind === 'royale' && opt === 'solo') return `
      <div class="n-sec"><b class="n-h3">${L('World', 'Wereld')}</b></div>
      <div class="n-tiles" role="radiogroup" aria-label="${L('World', 'Wereld')}">${(['random', ...ROYALE_THEMES] as const).map((t) => {
        const th = t === 'random' ? null : THEMES[t]
        return `<button class="n-tile ${choice.theme === t ? 'on' : ''}" role="radio" aria-checked="${choice.theme === t}" data-theme="${t}">${th ? th.name : L('Random', 'Willekeurig')}</button>`
      }).join('')}</div>
      <p class="n-note">${L(`Against ${SEATS - 1} bots. You can pause.`, `Tegen ${SEATS - 1} bots. Je kunt pauzeren.`)}</p>`
    if (kind === 'duel' && opt === 'cpu') return `
      <div class="n-sec"><b class="n-h3">${L('Stadium', 'Stadion')}</b></div>
      <div class="n-tiles" role="radiogroup" aria-label="${L('Stadium', 'Stadion')}">${(['random', ...STADIUM_LIST] as const).map((s) => {
        const sd = s === 'random' ? null : STADIUMS[s]
        const on = (choice.stadium ?? 'random') === s
        return `<button class="n-tile ${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-stadium="${s}">${sd ? sd.name : L('Random', 'Willekeurig')}</button>`
      }).join('')}</div>`
    if (kind === 'raid') return `
      <div class="n-card n-mystery">
        <div class="n-sil">${BOSS_LIST.map((b) => `<img class="px" src="${spriteUrl(BOSSES[b].species)}" alt="">`).join('')}</div>
        <span><b>${L('A random boss', 'Een willekeurige baas')}</b><small>${L('You see who you face while it loads. Every boss has its own arena and attacks.', 'Je ziet pas bij het laden tegen wie je vecht. Elke baas heeft een eigen arena en aanvallen.')}</small></span>
      </div>`
    // Online
    return `
      <div class="n-stats2">
        <div class="n-card"><small>${kind === 'duel' ? L('Looking now', 'Zoeken nu') : L('Online now', 'Nu online')}</small><b><i class="n-dot"></i><span class="n-online-n">–</span></b></div>
        <div class="n-card"><small>${L('Counts for', 'Telt mee voor')}</small><b class="sm">${L('PvP ranking', 'PvP-ranglijst')}</b></div>
      </div>
      <p class="n-note">${kind === 'duel'
        ? L('Nobody shows up? Then you face the CPU.', 'Komt er niemand? Dan speel je tegen de CPU.')
        : L('You land in a public lobby; when the timer runs out, bots fill the empty spots.', 'Je komt in een openbare lobby; als de timer om is, vullen bots de lege plekken.')}</p>`
  }

  /** Against the computer: how hard it plays. */
  const diffPicker = () => {
    const d = choice.diff ?? 'normal'
    return `
      <div class="n-sec"><b class="n-h3">${L('Difficulty', 'Moeilijkheid')}</b></div>
      <div class="n-seg n-diff" role="radiogroup" aria-label="${L('Difficulty', 'Moeilijkheid')}">${DIFFICULTIES.map((x) => `<button role="radio" aria-checked="${x === d}" class="${x === d ? 'on' : ''}" data-diff="${x}">${diffName(x)}</button>`).join('')}</div>
      <p class="n-note">${diffNote(d)}</p>`
  }

  const cta = (kind: MatchChoice['kind'], opt: Opt) =>
    opt === 'friends' ? (kind === 'duel' ? L('Create duel', 'Maak duel') : L('Create lobby', 'Maak lobby'))
      : opt === 'quick' ? L('Find a match', 'Zoek een potje')
      : opt === 'online' ? L('Find an opponent', 'Zoek een tegenstander')
      : opt === 'cpu' ? L('Start vs. CPU', 'Start tegen CPU')
      : kind === 'raid' ? L('Start raid', 'Start raid') : L('Start solo', 'Start solo')

  const modePage = (kind: MatchChoice['kind']) => {
    const m = MODE[kind]
    const opt = lastOpt[kind] ?? m.opts[0][0]
    const note = kind === 'duel' && mon
      ? L(`Fights as ${SPECIES[finalForm(mon)].name} · Lv 50`, `Vecht als ${SPECIES[finalForm(mon)].name} · Lv 50`)
      : undefined
    return `
      <div class="n-page n-modepage" data-view="${kind}">
        ${banner(kind)}
        <div class="n-mbody">
          <div class="n-mopts">
            <p class="n-desc">${m.desc}</p>
            <div class="n-seg" role="tablist" aria-label="${L('How do you want to play?', 'Hoe wil je spelen?')}">${m.opts.map(([o, t]) => `<button role="tab" aria-selected="${o === opt}" class="${o === opt ? 'on' : ''}" data-opt="${o}">${t}</button>`).join('')}</div>
            <div class="n-optpanel">${optPanel(kind, opt)}</div>
            ${opt === 'solo' || opt === 'cpu' ? diffPicker() : ''}
          </div>
          <aside class="n-mside">
            ${teamCard(st.trainer, mon, shiny, note)}
            <button class="n-btn n-go" data-act="go">${BOLT}<span>${cta(kind, opt)}</span></button>
            <div class="n-msg mm-msg ${msgCls}">${esc(msg)}</div>
          </aside>
        </div>
      </div>`
  }

  // ------------------------------------------------------------ paint + events

  const setMsg = (text: string, cls: string) => {
    msg = text
    msgCls = cls
    el.querySelectorAll<HTMLElement>('.mm-msg').forEach((m) => {
      m.className = `n-msg mm-msg ${cls}`
      m.textContent = text
    })
  }
  const busy = (text: string) => {
    setMsg(text, 'busy')
    el.querySelectorAll<HTMLButtonElement>('.n-main button').forEach((b) => (b.disabled = true))
  }

  const paint = () => {
    el.innerHTML = appShell('play', view === 'home' ? home() : modePage(view), { focus: view !== 'home' })
    bindShell(el, on.tab)
    storm(el.querySelector('.n-app'), view === 'home' ? undefined : STORM_TINT[view])
    const act = (sel: string, fn: (b: HTMLElement) => void) => el.querySelectorAll<HTMLElement>(sel).forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation()
      sfx.select()
      fn(b)
    }))
    const open = (v: MenuView) => {
      view = v
      setMsg('', '')
      paint()
      ;(el.querySelector('.n-main') as HTMLElement).scrollTop = 0
    }
    if (view === 'home') {
      act('.home-opts', () => showOptions())
      act('.home-news', () => showNews(() => paint()))
      act('[data-act="quests"]', () => on.tab('profile'))
      act('[data-act="team"]', () => on.tab('team'))
      act('[data-act="rejoin"]', () => askName(() => on.rejoin(st.rejoin!)))
      act('[data-act="quick"]', () => askName(() => quickGo(false)))
      act('[data-act="more"]', () => open('royale'))
      act('.n-mode', (b) => open(b.dataset.mode as MatchChoice['kind']))
      act('[data-go]', (b) => go(b.closest<HTMLElement>('.n-mode')!.dataset.mode as MatchChoice['kind'], b.dataset.go as Opt))
      // From home, Switch is the full Team screen (the quick sheet is for mode screens and lobbies)
      act('[data-act="switch"]', () => on.tab('team'))
      act('[data-act="road"]', () => on.tab('profile'))
      act('[data-act="newscard"]', () => showNews(() => paint()))
      // The cards are divs with buttons inside: give them a keyboard path too
      el.querySelectorAll<HTMLElement>('.n-mode, .n-xcard').forEach((c) => {
        c.tabIndex = 0
        c.setAttribute('role', 'button')
        c.addEventListener('keydown', (e) => e.key === 'Enter' && e.target === c && c.click())
      })
      bindJoin()
      maybeShowNews()
      return
    }
    const kind = view
    const opt = () => lastOpt[kind] ?? MODE[kind].opts[0][0]
    act('[data-act="back"]', () => open('home'))
    act('.n-seg [data-opt]', (b) => {
      lastOpt[kind] = b.dataset.opt as Opt
      code = (el.querySelector('#mm-code') as HTMLInputElement | null)?.value ?? code
      paint()
    })
    act('[data-theme]', (b) => {
      choice = { ...choice, theme: b.dataset.theme as MatchChoice['theme'] }
      paint()
    })
    act('[data-diff]', (b) => {
      const d = b.dataset.diff as Difficulty
      saveDiff(d)
      choice = { ...choice, diff: d }
      paint()
    })
    act('[data-stadium]', (b) => {
      choice = { ...choice, stadium: b.dataset.stadium as MatchChoice['stadium'] }
      paint()
    })
    act('[data-act="switch"]', () => openTeamSheet({
      trainer: st.trainer,
      mon,
      seeAll: () => on.teamAll(kind),
      pick: (t, id) => on.setTeam(t, id, view),
    }))
    act('[data-act="go"]', () => go(kind, opt()))
    bindJoin()
  }

  /** The "join with a code" field (home and the friends option of a mode). */
  const bindJoin = () => {
    const codeIn = el.querySelector('#mm-code') as HTMLInputElement | null
    codeIn?.addEventListener('input', () => (codeIn.value = cleanCode(codeIn.value)))
    el.querySelector('form.mm-code')?.addEventListener('submit', (e) => {
      e.preventDefault()
      const c = cleanCode(codeIn!.value)
      if (c.length !== 4) {
        setMsg(L('A code has 4 characters', 'Een code heeft 4 tekens'), 'err')
        sfx.error()
        codeIn!.focus()
        return
      }
      sfx.select()
      askName(() => {
        busy(L(`Connecting to ${c}…`, `Verbinden met ${c}…`))
        on.join(c)
      })
    })
  }

  const quickGo = (duel: boolean) => {
    busy(duel ? L('Finding an opponent…', 'Tegenstander zoeken…') : L('Finding a public lobby…', 'Openbare lobby zoeken…'))
    if (duel) on.quickDuel()
    else on.quick()
  }

  const go = (kind: MatchChoice['kind'], opt: Opt) => {
    if (opt === 'quick') return askName(() => quickGo(false))
    if (opt === 'online') return askName(() => quickGo(true))
    if (opt === 'friends') return askName(() => {
      busy(L('Creating lobby…', 'Lobby aanmaken…'))
      on.host({ ...choice, kind })
    })
    on.solo({ ...choice, kind })
  }

  paint()
  // Esc: back from a mode screen to home (desktop)
  const onKey = (e: KeyboardEvent) => {
    if (gen !== my) return removeEventListener('keydown', onKey)
    if (!live()) return
    if (e.key === 'Escape' && view !== 'home' && !document.querySelector('.n-sheet, #modal:not(.hidden)')) {
      view = 'home'
      paint()
    }
  }
  addEventListener('keydown', onKey)
  // Level, quests and mastery arrive a moment after start (or change after logging in)
  const off = onProgress(() => (live() ? paint() : gen !== my && off()))
  if (st.busy) busy(st.busy)
}

/** The live "players online" count, wherever the Play tab shows it. */
export function setOnline(all: { players: number; running: boolean; open: boolean }[]) {
  const total = all.reduce((n, s) => n + s.players, 0)
  const waiting = all.filter((s) => !s.running).reduce((n, s) => n + s.players, 0)
  document.querySelectorAll('.n-online-txt').forEach((e) => {
    e.textContent = total === 0
      ? L('nobody yet: start one!', 'nog niemand: start er een!')
      : waiting > 0
        ? L(`${total} online · ${waiting} waiting`, `${total} online · ${waiting} wacht${waiting === 1 ? '' : 'en'}`)
        : L(`${total} online`, `${total} online`)
  })
  document.querySelectorAll('.n-online-n').forEach((e) => (e.textContent = String(total)))
  document.querySelectorAll('.n-online .n-dot').forEach((e) => e.classList.toggle('off', total === 0))
}
