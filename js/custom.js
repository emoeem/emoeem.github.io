(() => {
  'use strict'

  // Butterfly's subtitle PJAX cleanup references the global typed symbol
  // before Typed.js is necessarily loaded. Keep the symbol defined so a
  // navigation during that window cannot raise ReferenceError.
  if (typeof window.typed === 'undefined') window.typed = null

  const ready = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true })
    else fn()
  }

  const isTyping = (event) => {
    const el = event.target
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) || el?.isContentEditable
  }

  const focusSearch = () => {
    const input = document.querySelector('#local-search-input, #search-input')
    if (!input) return false
    input.focus()
    return true
  }

  const setupProgress = () => {
    if (!document.querySelector('#reading-progress')) {
      const bar = document.createElement('div')
      bar.id = 'reading-progress'
      bar.innerHTML = '<span></span>'
      document.body.appendChild(bar)
    }
    const update = () => {
      const root = document.documentElement
      const max = root.scrollHeight - root.clientHeight
      const percent = max > 0 ? (root.scrollTop / max) * 100 : 0
      const bar = document.querySelector('#reading-progress span')
      if (bar) bar.style.width = percent + '%'
    }
    window.removeEventListener('scroll', update)
    window.addEventListener('scroll', update, { passive: true })
    update()
  }

  const setupCodeCopy = () => {
    document.querySelectorAll('#article-container pre').forEach((pre) => {
      if (pre.querySelector('.emo-code-copy')) return
      const button = document.createElement('button')
      button.className = 'emo-code-copy'
      button.type = 'button'
      button.textContent = '复制'
      button.addEventListener('click', async () => {
        const code = pre.querySelector('code')?.innerText || pre.innerText
        try {
          await navigator.clipboard.writeText(code)
          button.textContent = '已复制'
          setTimeout(() => { button.textContent = '复制' }, 1200)
        } catch {
          button.textContent = '复制失败'
          setTimeout(() => { button.textContent = '复制' }, 1200)
        }
      })
      pre.appendChild(button)
    })
  }
  const commands = [
    ['回到首页', 'g h', () => { location.href = '/' }],
    ['打开文章归档', 'g a', () => { location.href = '/archives/' }],
    ['打开标签', 'g t', () => { location.href = '/tags/' }],
    ['打开分类', 'g c', () => { location.href = '/categories/' }],
    ['打开搜索', '/', () => { focusSearch() }],
    ['上一篇文章', 'k', () => document.querySelector('#pagination .pagination-related:first-child')?.click()],
    ['下一篇文章', 'j', () => document.querySelector('#pagination .pagination-related:last-child')?.click()]
  ]

  const setupCommandPalette = () => {
    if (document.querySelector('.emo-command-palette')) return
    const wrap = document.createElement('div')
    wrap.className = 'emo-command-palette'
    wrap.innerHTML = '<div class="emo-command-palette__backdrop"></div><div class="emo-command-palette__dialog" role="dialog" aria-modal="true" aria-label="命令面板"><input class="emo-command-palette__input" autocomplete="off" placeholder="输入命令或搜索操作…"><div class="emo-command-palette__items"></div><div class="emo-command-palette__hint">Ctrl/⌘ K 打开 · ↑↓ 选择 · Enter 执行 · Esc 关闭</div></div>'
    document.body.appendChild(wrap)
    const input = wrap.querySelector('input')
    const items = wrap.querySelector('.emo-command-palette__items')
    let selected = 0

    const render = () => {
      const query = input.value.trim().toLowerCase()
      const filtered = commands.filter(([name, key]) => (name + key).toLowerCase().includes(query))
      selected = Math.min(selected, Math.max(0, filtered.length - 1))
      items.replaceChildren(...filtered.map(([name, key], index) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'emo-command-palette__item' + (index === selected ? ' is-selected' : '')
        button.innerHTML = '<strong></strong><span></span>'
        button.children[0].textContent = name
        button.children[1].textContent = key
        button.addEventListener('click', () => { wrap.classList.remove('is-open'); filtered[index][2]() })
        return button
      }))
    }

    const open = () => {
      wrap.classList.add('is-open')
      input.value = ''
      selected = 0
      render()
      requestAnimationFrame(() => input.focus())
    }
    const close = () => wrap.classList.remove('is-open')

    wrap.querySelector('.emo-command-palette__backdrop').addEventListener('click', close)
    input.addEventListener('input', render)
    input.addEventListener('keydown', (event) => {
      const buttons = [...items.querySelectorAll('button')]
      if (event.key === 'ArrowDown') { event.preventDefault(); selected = Math.min(selected + 1, buttons.length - 1); render() }
      if (event.key === 'ArrowUp') { event.preventDefault(); selected = Math.max(selected - 1, 0); render() }
      if (event.key === 'Enter' && buttons[selected]) { event.preventDefault(); buttons[selected].click() }
      if (event.key === 'Escape') close()
    })
    window.emoCommandPalette = { open, close }
  }
  const setupKeyboard = () => {
    let sequence = ''
    let timer = 0
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !isTyping(event)) {
        event.preventDefault()
        window.emoCommandPalette?.open()
        return
      }
      if (event.key === '/' && !isTyping(event)) {
        if (focusSearch()) event.preventDefault()
        return
      }
      if (event.key === 'Escape') {
        window.emoCommandPalette?.close()
        if (document.activeElement?.matches?.('input, textarea')) document.activeElement.blur()
        return
      }
      if (isTyping(event)) return

      if (event.key === 'g') {
        sequence = 'g'
        clearTimeout(timer)
        timer = setTimeout(() => { sequence = '' }, 800)
        return
      }
      if (sequence === 'g') {
        sequence = ''
        if (event.key === 'h') location.href = '/'
        else if (event.key === 'a') location.href = '/archives/'
        else if (event.key === 't') location.href = '/tags/'
        else if (event.key === 'c') location.href = '/categories/'
        return
      }
      if (event.key === 'j') document.querySelector('#pagination .pagination-related:last-child')?.click()
      if (event.key === 'k') document.querySelector('#pagination .pagination-related:first-child')?.click()
    })
  }

  const setupHomepageExperience = () => {
    if (location.pathname !== '/') return

    const content = document.querySelector('#content-inner')
    const recent = document.querySelector('#recent-posts')
    if (!content || !recent || document.querySelector('#emo-home-experience')) return

    const panel = document.createElement('section')
    panel.id = 'emo-home-experience'
    panel.className = 'emo-home-experience'
    panel.innerHTML = `
      <div class="emo-home-intro emo-reveal">
        <div>
          <span class="emo-kicker">PERSONAL WORKSPACE</span>
          <h2>代码、开源项目与正在发生的事情。</h2>
          <p>这里是 emoeem 的个人技术空间：记录 Linux、Rust、AI Coding、音视频，以及正在持续打磨的开源项目。</p>
          <div class="emo-home-links">
            <a href="/projects/">查看项目 →</a>
            <a href="/now/">现在在做什么 →</a>
            <a href="/about/">了解我 →</a>
          </div>
        </div>
        <div class="emo-home-intro__side">
          <span class="emo-home-label">CURRENT FOCUS</span>
          <strong>Build · Audit · Iterate</strong>
          <span>把工具做出来，也把过程留下来。</span>
        </div>
      </div>

      <div class="emo-home-section-head emo-reveal">
        <div>
          <span class="emo-kicker">SELECTED WORK</span>
          <h2>正在持续构建</h2>
        </div>
        <a href="/projects/">全部项目 →</a>
      </div>

      <div class="emo-project-grid emo-home-projects">
        <a class="emo-card emo-project-card emo-home-project emo-reveal" href="/projects/voicefox/">
          <span class="emo-kicker">MUSIC · RUST · TUI</span>
          <h3>VoiceFox</h3>
          <p>围绕 libmpv、音频分析与歌单互通持续开发的终端音乐播放器。</p>
          <div class="emo-meta"><span class="emo-chip">Rust</span><span class="emo-chip">Ratatui</span><span class="emo-chip">libmpv</span></div>
          <span class="emo-status">持续开发 →</span>
        </a>
        <a class="emo-card emo-project-card emo-home-project emo-reveal" href="/projects/toolbox-hub/">
          <span class="emo-kicker">TOOLS · RUST · TUI</span>
          <h3>Toolbox Hub</h3>
          <p>把本地工具、脚本与配置组织成统一入口，持续推进原生 TUI 体验。</p>
          <div class="emo-meta"><span class="emo-chip">Rust</span><span class="emo-chip">Ratatui</span><span class="emo-chip">Tooling</span></div>
          <span class="emo-status">持续开发 →</span>
        </a>
        <a class="emo-card emo-project-card emo-home-project emo-reveal" href="/projects/pkgbuild/">
          <span class="emo-kicker">LINUX · PACKAGING</span>
          <h3>Arch / PKGBUILD</h3>
          <p>维护面向 CachyOS 与 Zen3 / RTX 环境的个人软件仓库与构建体系。</p>
          <div class="emo-meta"><span class="emo-chip">Arch Linux</span><span class="emo-chip">PKGBUILD</span><span class="emo-chip">CI</span></div>
          <span class="emo-status">查看项目 →</span>
        </a>
      </div>
    `
    const recentItems = recent.querySelector('.recent-post-items')
    if (recentItems) recent.insertBefore(panel, recentItems)
    else recent.insertBefore(panel, recent.firstChild)

    const reveal = () => {
      const items = panel.querySelectorAll('.emo-reveal')
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        items.forEach(el => el.classList.add('is-visible'))
        return
      }
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-visible')
          obs.unobserve(entry.target)
        })
      }, { threshold: 0.08, rootMargin: '0px 0px -30px' })
      items.forEach((el, index) => {
        el.style.setProperty('--emo-reveal-delay', Math.min(index * 30, 90) + 'ms')
        observer.observe(el)
      })
    }
    reveal()
  }

  const setupPwa = () => {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }

  const setup = () => {
    setupProgress()
    setupCodeCopy()
    setupCommandPalette()
    setupHomepageExperience()
  }
  ready(() => {
    setup()
    setupKeyboard()
    setupPwa()
  })

  document.addEventListener('pjax:complete', setup)
})()
