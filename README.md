# My Blog

A small blog platform used as the sample application for a **SQL for testers** course.

A visitor can create a post, associate it with a category (creating new categories as
needed), add as many tags as they want, edit or delete the post later, and filter the
list of posts by category and/or tag.
The home page shows only the first few words of each post. There is no login: every
visitor can do everything.

## Stack

| Piece    | Choice                                     |
| -------- | ------------------------------------------ |
| Server   | Node.js + Express 5                        |
| Views    | EJS (server-rendered HTML, no build step)  |
| Database | PostgreSQL 17, in Docker                   |
| Access   | `pg` (node-postgres) with **hand-written SQL** |

The SQL is written by hand on purpose — there is no ORM hiding it. Every query the
app runs is readable in [src/posts.js](src/posts.js) and can be pasted straight into
`psql` during a lesson.

## Requirements

- Node.js 20+
- Docker (with the `docker compose` plugin)

## Getting started

```sh
npm install
cp .env.example .env    # only needed once
npm run db:up           # starts PostgreSQL in Docker
npm run db:reset        # creates the tables and seeds them
npm start               # http://localhost:3000
```

## npm scripts

| Script             | What it does                                                  |
| ------------------ | ------------------------------------------------------------- |
| `npm start`        | Starts the web server on `PORT` (default `3000`)               |
| `npm run db:up`    | Starts the PostgreSQL container in the background              |
| `npm run db:down`  | Stops the container (the data volume is kept)                  |
| `npm run db:reset` | Drops and recreates the tables, then seeds them                |
| `npm run db:seed`  | Re-seeds the existing tables (truncates them first)            |
| `npm run db:psql`  | Opens a `psql` session inside the container                    |

`db:reset` and `db:seed` are idempotent — run them as often as you like to get back
to a known state, which is exactly what you want before a demo or a test run.

## Database

The container is defined in [docker-compose.yml](docker-compose.yml):

- image `postgres:17-alpine`, published on `localhost:5432`
- user `blog`, password `blog`, database `blog`
- data lives in the named volume `db-data`, so it survives `db:down`;
  `docker compose down -v` wipes it

Connection string (also in `.env.example`):

```
postgresql://blog:blog@localhost:5432/blog
```

Any GUI client (DBeaver, TablePlus, pgAdmin) can connect with those credentials,
which is handy for students who prefer not to live in the terminal.

### Running queries from Docker Desktop

You do not need a terminal or a database client at all — Docker Desktop can open a
shell inside the container, and `psql` is already installed there:

1. Open Docker Desktop and go to **Containers**.
2. Expand the **my-blog** stack and click the **my-blog-db** container.
3. Open the **Exec** tab (older versions label it **Terminal**). You land in a shell
   inside the container.
4. Run:

   ```sh
   psql -U blog -d blog
   ```

That is the whole setup. No password is asked for: inside the container you connect
over a local socket, which the Postgres image trusts. The password is only needed by
clients connecting from your machine.

You are now at the `blog=#` prompt, where every query from this README works. A few
things worth knowing:

| Type this  | What you get                                          |
| ---------- | ----------------------------------------------------- |
| `\dt`      | The list of tables                                     |
| `\d posts` | The columns, indexes, and foreign keys of `posts`      |
| `\x`       | Toggles expanded output — one column per line, easier to read for wide rows |
| `\q`       | Quits back to the container shell                       |

Statements must end with a semicolon; until you type one, `psql` just keeps reading
your query across lines.

To run a single query without entering the prompt, put it right in the Exec tab:

```sh
psql -U blog -d blog -c "SELECT title FROM posts ORDER BY created_at DESC LIMIT 5"
```

The other tabs of the container are useful too: **Logs** shows what Postgres printed
while starting (the first place to look when the app cannot connect), **Files** lets
you browse the data directory, and **Stats** shows CPU and memory.

`npm run db:psql` opens exactly the same `psql` session from your terminal, so use
whichever you prefer. Verified with Docker Desktop 4.85.

### Schema

Defined in [db/schema.sql](db/schema.sql):

```
categories                posts                         tags
----------                -----                         ----
id         PK   <-------- category_id  FK               id         PK
name       UNIQUE         id           PK               name       UNIQUE
slug       UNIQUE         title                         slug       UNIQUE
created_at                body                          created_at
                          created_at
                                  \                    /
                                   \   post_tags      /
                                    -- post_id  FK --
                                       tag_id   FK
```

- **posts → categories** is one-to-many: a post has at most one category, a
  category has many posts. `ON DELETE SET NULL` keeps posts alive if a category goes.
- **posts ↔ tags** is many-to-many, which needs a fourth table, `post_tags`, on top
  of the other three — that is unavoidable in a relational schema, and it is
  the table that makes `JOIN` worth teaching. Its primary key is the pair
  `(post_id, tag_id)`, so the same tag cannot be attached twice, and both foreign
  keys cascade on delete.

### Queries worth showing in class

The post list in [src/posts.js](src/posts.js) is the centrepiece: it joins all four
tables, aggregates the tags of each post with `JSON_AGG ... FILTER`, and filters by
category with a plain `WHERE` and by tag with an `EXISTS` subquery — a good moment to
discuss why `EXISTS` avoids the duplicate rows a second `JOIN` would produce.

Some queries to run in `npm run db:psql`:

```sql
-- Posts with their category and tags
SELECT p.title, c.name AS category, STRING_AGG(t.name, ', ' ORDER BY t.name) AS tags
FROM posts p
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN post_tags pt ON pt.post_id = p.id
LEFT JOIN tags t ON t.id = pt.tag_id
GROUP BY p.id, c.name
ORDER BY p.created_at DESC;

-- How many posts per category
SELECT c.name, COUNT(p.id) AS posts
FROM categories c
LEFT JOIN posts p ON p.category_id = c.id
GROUP BY c.name
ORDER BY posts DESC;

-- Posts tagged 'sql'
SELECT p.title
FROM posts p
JOIN post_tags pt ON pt.post_id = p.id
JOIN tags t ON t.id = pt.tag_id
WHERE t.slug = 'sql';

-- Tags nobody uses
SELECT t.name
FROM tags t
LEFT JOIN post_tags pt ON pt.tag_id = t.id
WHERE pt.tag_id IS NULL;
```

### Seed data

[db/seed.js](db/seed.js) truncates the three tables (and `post_tags`), resets the
identity sequences, and inserts 3 categories, 10 tags, and 25 posts inside a single
transaction. The data is fixed, not random, so every student sees the same rows and
assertions in a test suite stay stable.

The posts are shaped to exercise the listing rather than just to fill it:

- **Most have a realistic body** — three or four paragraphs, 800 to 1000 characters —
  so the home page has something to actually cut down to its 20-word excerpt.
- **Four are deliberately short**, under 20 words, so they come through untruncated.
  Both branches of the excerpt are covered before anyone writes a post.
- **25 posts** means every page size produces several pages: 5 pages at 5 per page,
  3 at 10, 2 at 20.
- **Two posts share each publication date** (they are dated two per day, oldest
  first). Ties in the sort column are what break naive pagination, so the seed data
  makes sure the `created_at DESC, id DESC` ordering is actually put to the test.

## Routes

| Method | Path                  | What it does                                                          |
| ------ | --------------------- | --------------------------------------------------------------------- |
| GET    | `/`                   | Lists posts; `?category=<slug>` and `?tag=<slug>` filter and combine, `?perPage=` and `?page=` paginate |
| GET    | `/api/tags?q=<term>`  | JSON: tags whose name contains the term, most used first (autocomplete) |
| GET    | `/categories`         | Lists categories with their post counts, plus the form to add one      |
| POST   | `/categories`         | Creates a category, then redirects back to the list                    |
| GET    | `/posts/new`          | Form to create a post                                                  |
| POST   | `/posts`              | Creates the post and its tags, then redirects to it                    |
| GET    | `/posts/:id`          | Shows one post, in full, with Edit and Delete                          |
| GET    | `/posts/:id/edit`     | Form to edit a post, pre-filled                                        |
| POST   | `/posts/:id`          | Updates the post and its tags, then redirects to it                    |
| POST   | `/posts/:id/delete`   | Deletes the post, then redirects to the home page                      |

The Tags field on the post form suggests existing tags as you type
([public/tags.js](public/tags.js)). It searches the segment the caret sits in, not the
whole field, so it keeps working in the middle of a comma-separated list; picking a
suggestion replaces just that segment. The query behind it is a plain
`WHERE name ILIKE '%term%'` ordered by how many posts use each tag, with `%` and `_`
escaped so typing them searches for the characters themselves — a nice place to talk
about `LIKE` vs `ILIKE` and about why user input never gets concatenated into SQL.
Without JavaScript the field still accepts anything you type.

Adding a category uses `INSERT ... ON CONFLICT DO NOTHING RETURNING`: a duplicate name
comes back as an empty result instead of an error, so the route reports "already
exists" without having to inspect Postgres error codes. Tags, in contrast, are created
implicitly as you type them into a post — the two styles side by side are worth a
minute in class.

The update and the delete are `POST`s because an HTML form only speaks `GET` and
`POST`. The delete asks for confirmation in the browser first.

Creating and updating both run inside a transaction: unknown tags are inserted
(`ON CONFLICT (slug) DO UPDATE`), known ones are reused, and on update any tag no
longer listed is detached with a single `DELETE ... WHERE NOT (tag_id = ANY (...))`.
The whole thing rolls back if anything fails — another example students can inspect
directly in the data.

Deleting a post relies on the database instead of application code: `post_tags` has
`ON DELETE CASCADE`, so its rows disappear on their own. The tags themselves stay,
since other posts may still use them — a good exercise is to find the ones that no
longer do (the last query above).

The listing is paginated: 10 posts per page by default, with 5, 10, and 20 offered in
the toolbar. `?perPage=` accepts only those three values and `?page=` only positive
integers — anything else falls back to the default, and a page past the end lands on
the last page rather than on an empty list. Filters and page size survive every
pagination link, and changing a filter sends you back to page 1.

In SQL this is `LIMIT` and `OFFSET`, with a separate `COUNT(*)` for the number of
pages. Both queries are built from the same `filterPosts` helper in
[src/posts.js](src/posts.js), so the count can never disagree with the rows shown — a
classic off-by-one source worth pointing out in class, along with the fact that
`ORDER BY` must be deterministic (here `created_at DESC, id DESC`) or rows can repeat
across pages.

With the seeded data you get 5 pages at 5 per page, 3 at 10, and 2 at 20.

The home page shows an excerpt — the first 20 words, see [src/excerpt.js](src/excerpt.js)
— while the post page shows the whole body.

Every interactive element carries a `data-test` attribute, so end-to-end tests can
select elements without depending on CSS classes or copy.

## Project layout

```
db/
  schema.sql      tables, foreign keys, indexes
  seed.js         seed script (`--reset` recreates the schema first)
src/
  app.js          Express routes
  server.js       entry point
  db.js           connection pool
  posts.js        every SQL query the app runs
  slug.js         "Some Title" -> "some-title"
  excerpt.js      first few words of a body, for the listing
  views/          EJS templates
public/
  style.css
  tags.js         tag autocomplete on the post form
```

## Notes

- `src/db.js` loads `.env` with `override: true` on purpose. A `DATABASE_URL`
  exported by your shell (for example from `~/.zprofile`) would otherwise win over
  the project's own `.env` and point the app at the wrong database.
