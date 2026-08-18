// Autocomplete for the comma-separated Tags field.
// The field holds a whole list, so everything below works on one segment: the
// text between the comma before the caret and the comma after it.
;(() => {
  const input = document.querySelector('[data-test="tags"]')
  const list = document.querySelector('[data-test="tag-suggestions"]')
  if (!input || !list) return

  let items = []
  let active = -1
  let timer
  let controller

  const segments = () => {
    const parts = input.value.split(',')
    let start = 0
    return parts.map(part => {
      const range = { text: part, start, end: start + part.length }
      start += part.length + 1
      return range
    })
  }

  // The segment the caret currently sits in.
  const currentSegment = () => {
    const caret = input.selectionStart ?? input.value.length
    return segments().find(part => caret >= part.start && caret <= part.end)
  }

  const alreadyChosen = () =>
    input.value
      .split(',')
      .map(tag => tag.trim().toLowerCase())
      .filter(Boolean)

  // Tag names come from whatever anyone typed into a post, so they are escaped
  // before going back into the DOM.
  const escape = text =>
    text.replace(/[&<>"']/g, character =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])
    )

  const close = () => {
    list.hidden = true
    list.innerHTML = ''
    input.setAttribute('aria-expanded', 'false')
    items = []
    active = -1
  }

  const highlight = () => {
    Array.from(list.children).forEach((child, index) => {
      child.classList.toggle('active', index === active)
      child.setAttribute('aria-selected', String(index === active))
    })
  }

  const render = suggestions => {
    items = suggestions
    active = -1

    if (!items.length) return close()

    list.innerHTML = items
      .map(
        tag =>
          `<li role="option" aria-selected="false" data-name="${escape(tag.name)}">` +
          `<span>${escape(tag.name)}</span>` +
          `<span class="muted">${tag.posts_count}</span></li>`
      )
      .join('')
    list.hidden = false
    input.setAttribute('aria-expanded', 'true')
  }

  // Replaces the segment under the caret with the chosen tag and leaves the
  // caret ready for the next one.
  const choose = name => {
    const segment = currentSegment()
    if (!segment) return

    const before = input.value.slice(0, segment.start)
    const after = input.value.slice(segment.end)
    const spacer = before && !before.endsWith(' ') ? ' ' : ''
    const value = `${before}${spacer}${name}${after || ', '}`

    input.value = value
    const caret = before.length + spacer.length + name.length + (after ? 0 : 2)
    input.setSelectionRange(caret, caret)
    input.focus()
    close()
  }

  const search = async () => {
    const segment = currentSegment()
    const term = segment ? segment.text.trim() : ''

    if (!term) return close()

    controller?.abort()
    controller = new AbortController()

    try {
      const response = await fetch(`/api/tags?q=${encodeURIComponent(term)}`, {
        signal: controller.signal,
      })
      if (!response.ok) return close()

      const chosen = alreadyChosen()
      render(
        (await response.json()).filter(
          tag =>
            tag.name.toLowerCase() === term.toLowerCase() ||
            !chosen.includes(tag.name.toLowerCase())
        )
      )
    } catch (error) {
      if (error.name !== 'AbortError') close()
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(search, 150)
  })

  input.addEventListener('keydown', event => {
    if (list.hidden) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      active = (active + step + items.length) % items.length
      highlight()
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault()
      choose(items[active].name)
    } else if (event.key === 'Escape') {
      close()
    }
  })

  list.addEventListener('mousedown', event => {
    const item = event.target.closest('li')
    if (!item) return

    event.preventDefault()
    choose(item.dataset.name)
  })

  input.addEventListener('blur', () => setTimeout(close, 120))
})()
