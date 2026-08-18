// Turns "Getting Started with SQL" into "getting-started-with-sql".
const slugify = text =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

module.exports = { slugify }
