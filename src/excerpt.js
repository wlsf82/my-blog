// First few words of a post's body, for the home page listing.
const excerpt = (text, words = 20) => {
  const parts = text.trim().split(/\s+/)

  if (parts.length <= words) return text.trim()

  return `${parts.slice(0, words).join(' ')}…`
}

module.exports = { excerpt }
