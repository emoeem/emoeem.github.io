(() => {
  const focusSearch = () => {
    const search = document.querySelector('#local-search-input, #search-input')
    if (!search) return false
    search.focus()
    return true
  }

  const enhanceExternalLinks = () => {
    document.querySelectorAll('a[href^="http"]').forEach((link) => {
      if (link.host !== location.host) {
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
      }
    })
  }

  // Register keyboard handling once. PJAX must not duplicate this listener.
  document.addEventListener('keydown', (event) => {
    const target = event.target
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable

    if ((event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) && !typing) {
      if (focusSearch()) event.preventDefault()
    }

    if (event.key === 'Escape' && document.activeElement?.matches?.('input, textarea')) {
      document.activeElement.blur()
    }
  })

  const setup = () => {
    enhanceExternalLinks()
    document.documentElement.classList.add('emo-enhanced')
  }

  document.addEventListener('DOMContentLoaded', setup, { once: true })
  document.addEventListener('pjax:complete', setup)
})()
