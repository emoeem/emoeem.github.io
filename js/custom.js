(() => {
  'use strict'

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

  const setupPwa = () => {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }

  const setup = () => {
    setupProgress()
    setupCodeCopy()
    setupCommandPalette()
  }
  ready(() => {
    setup()
    setupKeyboard()
    setupPwa()
  })

  document.addEventListener('pjax:complete', setup)
})()
