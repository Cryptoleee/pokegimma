import { sfx } from '../audio'

/**
 * Black/White style screen transition: a black and a white shutter slam
 * shut along a diagonal, a Poké Ball seal flashes, then they slide open.
 * `swap` runs while the screen is covered.
 */
export function wipe(swap: () => void, opts: { flash?: boolean } = {}): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div')
    el.className = 'wipe'
    el.innerHTML = `
      <div class="half black"></div>
      <div class="half white"></div>
      <div class="seal"><i></i></div>
      ${opts.flash ? '<div class="wflash"></div>' : ''}`
    document.getElementById('app')!.append(el)
    sfx.whoosh()
    requestAnimationFrame(() => el.classList.add('closed'))
    setTimeout(() => {
      swap()
      el.classList.add('sealed')
      setTimeout(() => {
        el.classList.add('open')
        setTimeout(() => {
          el.remove()
          resolve()
        }, 480)
      }, 260)
    }, 420)
  })
}
