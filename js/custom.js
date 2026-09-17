(() => {
  const setup = () => {
    const root = document.documentElement

    // Keyboard shortcut: / focuses Butterfly's local search input.
    document.addEventListener('keydown', (event) => {
      const target = event.target
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) {
        event.preventDefault()
        const search = document.querySelector('#local-search-input, #search-input')
        if (search) search.focus()
      }
      if (event.key === 'Escape' && document.activeElement?.matches?.('input, textarea')) {
        document.activeElement.blur()
      }
    }, { passive: false })

    // Make external links safer even for Markdown-generated content.
    document.querySelectorAll('a[href^="http"]').forEach((link) => {
      if (link.host !== location.host) {
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
      }
    })

    // Keep focus-visible usable without changing Butterfly's normal focus styling.
    root.classList.add('emo-enhanced')
  }

  document.addEventListener('DOMContentLoaded', setup, { once: true })
  document.addEventListener('pjax:complete', setup)
})()
