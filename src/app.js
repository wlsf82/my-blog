const path = require('path')
const express = require('express')

const {
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
} = require('./posts')
const { excerpt } = require('./excerpt')
const { slugify } = require('./slug')

const app = express()

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.use(express.urlencoded({ extended: false }))
app.use(express.static(path.join(__dirname, '..', 'public')))

// Reads the fields of the post form, the same way for create and update.
const readPostForm = body => ({
  title: (body.title || '').trim(),
  body: (body.body || '').trim(),
  categoryId: body.categoryId || '',
  tags: body.tags || '',
})

const validate = ({ title, body }) => {
  const errors = []
  if (!title) errors.push('Title is required.')
  if (!body) errors.push('Body is required.')

  return errors
}

const toTagNames = tags =>
  tags
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)

const findPost = async param => {
  const id = Number(param)

  return Number.isInteger(id) ? await getPost(id) : undefined
}

// How many posts a page may show. Anything else in the URL falls back to 10.
const PER_PAGE_OPTIONS = [5, 10, 20]
const DEFAULT_PER_PAGE = 10

const readPerPage = value => {
  const perPage = Number(value)

  return PER_PAGE_OPTIONS.includes(perPage) ? perPage : DEFAULT_PER_PAGE
}

const readPage = value => {
  const page = Number(value)

  return Number.isInteger(page) && page > 0 ? page : 1
}

// Home: one page of posts, optionally filtered by ?category= and/or ?tag=.
app.get('/', async (req, res, next) => {
  try {
    const { category = '', tag = '' } = req.query
    const perPage = readPerPage(req.query.perPage)
    const total = await countPosts({ category, tag })
    const pages = Math.max(1, Math.ceil(total / perPage))
    // A page number past the end (or a filter that just got narrower) lands on
    // the last page instead of on an empty list.
    const page = Math.min(readPage(req.query.page), pages)

    const [posts, categories, tags] = await Promise.all([
      listPosts({ category, tag, limit: perPage, offset: (page - 1) * perPage }),
      listCategories(),
      listTags(),
    ])

    // Keeps the filters and the page size while only the page number changes.
    const hrefFor = target => {
      const params = new URLSearchParams()
      if (category) params.set('category', category)
      if (tag) params.set('tag', tag)
      if (perPage !== DEFAULT_PER_PAGE) params.set('perPage', perPage)
      if (target > 1) params.set('page', target)
      const query = params.toString()

      return query ? `/?${query}` : '/'
    }

    res.render('index', {
      posts,
      categories,
      tags,
      category,
      tag,
      excerpt,
      pagination: {
        page,
        pages,
        perPage,
        perPageOptions: PER_PAGE_OPTIONS,
        total,
        from: total ? (page - 1) * perPage + 1 : 0,
        to: Math.min(page * perPage, total),
        hrefFor,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Feeds the tag autocomplete on the post form.
app.get('/api/tags', async (req, res, next) => {
  try {
    res.json(await searchTags((req.query.q || '').trim()))
  } catch (error) {
    next(error)
  }
})

// Renders the categories page, which doubles as the result of a failed create.
const renderCategories = async (res, status, { errors = [], name = '' } = {}) =>
  res.status(status).render('categories', {
    categories: await listCategories(),
    errors,
    values: { name },
  })

app.get('/categories', async (req, res, next) => {
  try {
    await renderCategories(res, 200)
  } catch (error) {
    next(error)
  }
})

app.post('/categories', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim()

    if (!name) return renderCategories(res, 422, { errors: ['Name is required.'], name })

    if (!slugify(name)) {
      return renderCategories(res, 422, {
        errors: ['Name must contain at least one letter or number.'],
        name,
      })
    }

    const category = await createCategory(name)

    if (!category) {
      return renderCategories(res, 422, {
        errors: [`There is already a category named "${name}".`],
        name,
      })
    }

    res.redirect('/categories')
  } catch (error) {
    next(error)
  }
})

app.get('/posts/new', async (req, res, next) => {
  try {
    res.render('form', {
      heading: 'New post',
      action: '/posts',
      categories: await listCategories(),
      errors: [],
      values: {},
    })
  } catch (error) {
    next(error)
  }
})

app.post('/posts', async (req, res, next) => {
  try {
    const values = readPostForm(req.body)
    const errors = validate(values)

    if (errors.length) {
      return res.status(422).render('form', {
        heading: 'New post',
        action: '/posts',
        categories: await listCategories(),
        errors,
        values,
      })
    }

    const id = await createPost({ ...values, tagNames: toTagNames(values.tags) })

    res.redirect(`/posts/${id}`)
  } catch (error) {
    next(error)
  }
})

app.get('/posts/:id/edit', async (req, res, next) => {
  try {
    const post = await findPost(req.params.id)
    if (!post) return res.status(404).render('not-found')

    res.render('form', {
      heading: 'Edit post',
      action: `/posts/${post.id}`,
      categories: await listCategories(),
      errors: [],
      values: {
        title: post.title,
        body: post.body,
        categoryId: post.category_id,
        tags: post.tags.map(tag => tag.name).join(', '),
      },
    })
  } catch (error) {
    next(error)
  }
})

// HTML forms only speak GET and POST, so the update and the delete are POSTs.
app.post('/posts/:id', async (req, res, next) => {
  try {
    const post = await findPost(req.params.id)
    if (!post) return res.status(404).render('not-found')

    const values = readPostForm(req.body)
    const errors = validate(values)

    if (errors.length) {
      return res.status(422).render('form', {
        heading: 'Edit post',
        action: `/posts/${post.id}`,
        categories: await listCategories(),
        errors,
        values,
      })
    }

    await updatePost(post.id, { ...values, tagNames: toTagNames(values.tags) })

    res.redirect(`/posts/${post.id}`)
  } catch (error) {
    next(error)
  }
})

app.post('/posts/:id/delete', async (req, res, next) => {
  try {
    const post = await findPost(req.params.id)
    if (!post) return res.status(404).render('not-found')

    await deletePost(post.id)

    res.redirect('/')
  } catch (error) {
    next(error)
  }
})

app.get('/posts/:id', async (req, res, next) => {
  try {
    const post = await findPost(req.params.id)
    if (!post) return res.status(404).render('not-found')

    res.render('show', { post })
  } catch (error) {
    next(error)
  }
})

app.use((error, req, res, next) => {
  console.error(error)
  res.status(500).render('error', { message: error.message })
})

module.exports = app
