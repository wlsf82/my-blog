const { pool, query } = require('./db')
const { slugify } = require('./slug')

// Builds the WHERE clause shared by the listing and its count, so the two can
// never disagree about which posts a filter selects.
// The tag filter uses EXISTS so a post is counted once, no matter how many of
// its tags match, while the aggregated list of tags stays complete.
const filterPosts = ({ category, tag } = {}) => {
  const conditions = []
  const params = []

  if (category) {
    params.push(category)
    conditions.push(`c.slug = $${params.length}`)
  }

  if (tag) {
    params.push(tag)
    conditions.push(`EXISTS (
      SELECT 1
      FROM post_tags pt
      JOIN tags t ON t.id = pt.tag_id
      WHERE pt.post_id = p.id AND t.slug = $${params.length}
    )`)
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}

// How many posts the filters select, which is what the page count is based on.
const countPosts = async filters => {
  const { where, params } = filterPosts(filters)

  const { rows } = await query(
    `SELECT COUNT(*)::int AS total
     FROM posts p
     LEFT JOIN categories c ON c.id = p.category_id
     ${where}`,
    params
  )

  return rows[0].total
}

// One page of posts, newest first. LIMIT and OFFSET are the last two
// parameters, after however many the filters used.
const listPosts = async ({ category, tag, limit = 10, offset = 0 } = {}) => {
  const { where, params } = filterPosts({ category, tag })

  const { rows } = await query(
    `SELECT
       p.id,
       p.title,
       p.body,
       p.created_at,
       c.name AS category_name,
       c.slug AS category_slug,
       COALESCE(
         JSON_AGG(
           JSON_BUILD_OBJECT('name', t.name, 'slug', t.slug)
           ORDER BY t.name
         ) FILTER (WHERE t.id IS NOT NULL),
         '[]'
       ) AS tags
     FROM posts p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN post_tags pt ON pt.post_id = p.id
     LEFT JOIN tags t ON t.id = pt.tag_id
     ${where}
     GROUP BY p.id, c.name, c.slug
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )

  return rows
}

const getPost = async id => {
  const { rows } = await query(
    `SELECT
       p.id,
       p.title,
       p.category_id,
       p.body,
       p.created_at,
       c.name AS category_name,
       c.slug AS category_slug,
       COALESCE(
         JSON_AGG(
           JSON_BUILD_OBJECT('name', t.name, 'slug', t.slug)
           ORDER BY t.name
         ) FILTER (WHERE t.id IS NOT NULL),
         '[]'
       ) AS tags
     FROM posts p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN post_tags pt ON pt.post_id = p.id
     LEFT JOIN tags t ON t.id = pt.tag_id
     WHERE p.id = $1
     GROUP BY p.id, c.name, c.slug`,
    [id]
  )

  return rows[0]
}

// Attaches the given tag names to a post: unknown tags are created, known ones
// are reused, and any tag no longer listed is detached.
const syncTags = async (client, postId, tagNames) => {
  const tagIds = []

  for (const name of tagNames) {
    const slug = slugify(name)
    if (!slug) continue

    const tag = await client.query(
      `INSERT INTO tags (name, slug)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = tags.name
       RETURNING id`,
      [name.trim(), slug]
    )

    tagIds.push(tag.rows[0].id)
  }

  await client.query(
    `DELETE FROM post_tags
     WHERE post_id = $1 AND NOT (tag_id = ANY ($2::int[]))`,
    [postId, tagIds]
  )

  for (const tagId of tagIds) {
    await client.query(
      `INSERT INTO post_tags (post_id, tag_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [postId, tagId]
    )
  }
}

// Every write below runs in a transaction, so a post and its tags are always
// saved together or not at all.
const createPost = async ({ title, body, categoryId, tagNames = [] }) => {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `INSERT INTO posts (title, body, category_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [title, body, categoryId || null]
    )
    const postId = rows[0].id

    await syncTags(client, postId, tagNames)
    await client.query('COMMIT')

    return postId
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const updatePost = async (id, { title, body, categoryId, tagNames = [] }) => {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const { rowCount } = await client.query(
      `UPDATE posts
       SET title = $1, body = $2, category_id = $3
       WHERE id = $4`,
      [title, body, categoryId || null, id]
    )

    if (!rowCount) {
      await client.query('ROLLBACK')
      return false
    }

    await syncTags(client, id, tagNames)
    await client.query('COMMIT')

    return true
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// The rows in post_tags go away on their own: the foreign key cascades.
const deletePost = async id => {
  const { rowCount } = await query('DELETE FROM posts WHERE id = $1', [id])

  return rowCount > 0
}

const listCategories = async () => {
  const { rows } = await query(
    `SELECT c.id, c.name, c.slug, COUNT(p.id)::int AS posts_count
     FROM categories c
     LEFT JOIN posts p ON p.category_id = c.id
     GROUP BY c.id
     ORDER BY c.name`
  )

  return rows
}

// Returns the new category, or undefined when the name is already taken:
// ON CONFLICT DO NOTHING makes the insert a no-op instead of an error, so the
// route can tell the two cases apart without inspecting error codes.
const createCategory = async name => {
  const { rows } = await query(
    `INSERT INTO categories (name, slug)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING
     RETURNING id, name, slug`,
    [name, slugify(name)]
  )

  return rows[0]
}

const listTags = async () => {
  const { rows } = await query(
    `SELECT t.id, t.name, t.slug, COUNT(pt.post_id)::int AS posts_count
     FROM tags t
     LEFT JOIN post_tags pt ON pt.tag_id = t.id
     GROUP BY t.id
     ORDER BY t.name`
  )

  return rows
}

// Tags whose name contains `term`, most used first, for the autocomplete.
// % and _ are escaped so a user typing them searches for the character itself
// instead of turning it into a wildcard.
const searchTags = async (term, limit = 8) => {
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`

  const { rows } = await query(
    `SELECT t.name, t.slug, COUNT(pt.post_id)::int AS posts_count
     FROM tags t
     LEFT JOIN post_tags pt ON pt.tag_id = t.id
     WHERE t.name ILIKE $1 ESCAPE '\\'
     GROUP BY t.id
     ORDER BY posts_count DESC, t.name
     LIMIT $2`,
    [pattern, limit]
  )

  return rows
}

module.exports = {
  listPosts,
  countPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  listCategories,
  createCategory,
  listTags,
  searchTags,
}
