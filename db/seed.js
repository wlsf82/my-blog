// Seeds the database with a few categories, tags, and posts.
// Run it with `npm run db:seed` (or `npm run db:reset` to recreate the schema
// first). It is idempotent: it wipes the three tables before inserting.

const fs = require('fs')
const path = require('path')
const { pool } = require('../src/db')
const { slugify } = require('../src/slug')

const categories = ['Testing', 'Databases', 'Automation']

const tags = [
  'sql',
  'postgres',
  'cypress',
  'beginners',
  'api',
  'best-practices',
  'docker',
  'ci',
  'performance',
  'data-quality',
]

// Bodies are written as paragraphs and joined, so the seeded posts have a
// realistic length. The home page only shows the first words of each of them,
// which is exactly what makes them useful for testing that excerpt.
const paragraphs = (...parts) => parts.join('\n\n')

const posts = [
  {
    title: 'Why testers should learn SQL',
    body: paragraphs(
      'Knowing SQL lets you check what the application really stored, instead of trusting what the screen shows you. A green test that only asserts on the user interface proves that the interface said the right thing, not that the right thing happened.',
      'Think of the last bug you reported where the form said "saved" and the record was nowhere to be found. A single SELECT would have caught it before it reached production, and it would have told you exactly which column was wrong.',
      'You do not need to become a database administrator. Four clauses take you a long way: SELECT to pick columns, FROM to pick tables, WHERE to filter rows, and ORDER BY to sort what comes back. Everything else you learn later, when a real question pushes you into it.',
      'The habit worth building is simple: after every test that writes something, ask yourself what the database now looks like, and then go and confirm it.'
    ),
    category: 'Testing',
    tags: ['sql', 'beginners', 'best-practices'],
  },
  {
    title: 'Running Postgres locally with Docker',
    body: paragraphs(
      'A single docker compose up -d gives you a throwaway database that behaves like the real thing. No installer, no service running in the background forever, and no version conflict with whatever another project on your machine needs.',
      'The container in this project publishes port 5432 and keeps its data in a named volume, which means you can stop it and start it again without losing anything. When you do want a clean slate, docker compose down -v removes the volume and the next start rebuilds the database from scratch.',
      'That combination is what makes a database pleasant to test against. You can be careless on purpose: delete every row, break a constraint, see what happens, then reset in a couple of seconds and try the next thing.',
      'The same image runs on every machine in the room, so when a query behaves differently for one person, the difference is in the query and not in the setup.'
    ),
    category: 'Databases',
    tags: ['postgres', 'sql'],
  },
  {
    title: 'SELECT, WHERE, and ORDER BY in practice',
    body: paragraphs(
      'These three clauses already answer most of the questions a tester has about the data. SELECT decides which columns you get, WHERE decides which rows, and ORDER BY decides in what order they come back.',
      'Start by selecting everything from a small table and reading the result carefully. Column names tell you what the application considers important, and NULLs tell you which fields are optional. That is documentation you can trust, because it is the schema itself.',
      'Then add a filter. WHERE created_at > now() - interval \'1 day\' shows what your test run just produced. WHERE category_id IS NULL finds the records nobody classified. Each filter you write is a question you would otherwise have asked a developer.',
      'Finally, sort. ORDER BY created_at DESC puts the newest first, which is almost always what you want while a test is still running and rows keep appearing.'
    ),
    category: 'Databases',
    tags: ['sql', 'beginners'],
  },
  {
    title: 'Joining posts, categories, and tags',
    body: paragraphs(
      'One-to-many and many-to-many relationships are easier to understand with a schema you can see, so this blog uses its own. A post points at one category through category_id, which is the one-to-many side: many posts, one category each.',
      'Tags are different. A post can have many tags and a tag can belong to many posts, and no single column can express that. The answer is a third table, post_tags, holding nothing but a pair of foreign keys. Every many-to-many relationship you meet in the wild looks like this.',
      'The moment you join those tables, a surprise shows up: a post with three tags appears three times in the result. That is not a bug, it is what a join does, and learning to expect it is half the lesson. GROUP BY collapses the duplicates when you want one row per post, and EXISTS avoids creating them when you only need to filter.',
      'Try both against the seeded data and compare the row counts. The difference will stay with you longer than any explanation.'
    ),
    category: 'Databases',
    tags: ['sql', 'postgres'],
  },
  {
    title: 'Checking API responses against the database',
    body: paragraphs(
      'Query the database in your test to confirm that the API did what its response claims it did. A 201 Created with a nice JSON body is a promise, not proof, and the two are not always the same thing.',
      'The pattern is short. Call the endpoint, keep the identifier it returns, then run a SELECT for that identifier and assert on the columns you care about. If the endpoint associates tags, count the rows in the join table too, because that is where partial writes hide.',
      'This is also how you catch the errors nobody notices for months: a field saved with the wrong precision, a timestamp stored in the wrong timezone, a status written as text where the rest of the system expects a number. The response looked fine every single time.',
      'Keep the assertions narrow. Checking the two or three columns the endpoint is responsible for gives you a test that fails for one clear reason.'
    ),
    category: 'Automation',
    tags: ['api', 'cypress', 'best-practices'],
  },
  {
    title: 'Seeding test data the boring way',
    body: 'Deterministic seed scripts beat random fixtures when you need a suite you can trust.',
    category: 'Automation',
    tags: ['cypress', 'best-practices', 'sql'],
  },
  {
    title: 'Reading an execution plan without fear',
    body: paragraphs(
      'EXPLAIN in front of any query prints the plan Postgres intends to follow, and EXPLAIN ANALYZE runs it and reports what actually happened. You do not have to understand every line to get value out of it.',
      'Look for two things first. A sequential scan on a large table means Postgres is reading every row, which is fine for our seeded tables and alarming for a table with millions of rows. And the difference between the estimated and the actual row counts tells you whether the planner understands your data at all.',
      'When a page in the application feels slow, this is where the conversation with a developer starts. Bringing the plan along makes the report much harder to dismiss.'
    ),
    category: 'Databases',
    tags: ['sql', 'postgres', 'performance'],
  },
  {
    title: 'NULL is not zero, and not an empty string',
    body: paragraphs(
      'NULL means "no value here", and it behaves differently from everything else in SQL. It is not zero, it is not an empty string, and it is not equal to another NULL.',
      'That last part causes the bug people run into first. WHERE category_id = NULL returns nothing at all, ever, because comparing anything to NULL gives you NULL rather than true. The right form is WHERE category_id IS NULL.',
      'It shows up in aggregates too: COUNT(*) counts rows, while COUNT(category_id) skips the ones where that column is NULL. Two numbers, both correct, answering different questions. Whenever a count surprises you, this is the first thing to check.'
    ),
    category: 'Databases',
    tags: ['sql', 'beginners', 'data-quality'],
  },
  {
    title: 'Transactions: what "all or nothing" really means',
    body: paragraphs(
      'A transaction groups several statements so that either all of them take effect or none of them do. BEGIN opens it, COMMIT makes the changes permanent, ROLLBACK throws them away.',
      'This application uses one every time a post is saved, because a post and its tags belong together. If inserting the tags fails halfway, the post itself must not survive on its own, and a rollback guarantees exactly that.',
      'It is worth breaking on purpose. Open psql, run BEGIN, delete every row from posts, then run ROLLBACK and look again. Nothing is gone. Doing that once teaches more about transactions than any diagram.'
    ),
    category: 'Databases',
    tags: ['sql', 'postgres', 'best-practices'],
  },
  {
    title: 'Foreign keys are your first regression test',
    body: paragraphs(
      'A foreign key says that a value in one table must exist in another. post_tags.post_id has to point at a real post, and the database refuses anything else.',
      'That refusal is a test running on every single write, forever, without anyone maintaining it. No application bug, no rushed migration, and no hand-written script can leave a tag attached to a post that does not exist.',
      'The clauses next to it matter just as much. ON DELETE CASCADE removes the join rows with the post, while ON DELETE SET NULL keeps posts alive when their category disappears. Read those in the schema before you assume what a delete will do.'
    ),
    category: 'Databases',
    tags: ['sql', 'best-practices', 'data-quality'],
  },
  {
    title: 'Cleaning up test data between runs',
    body: paragraphs(
      'A suite that leaves data behind passes on Monday and fails on Friday for no visible reason. The fix is to decide, once, where the cleanup happens.',
      'TRUNCATE posts, tags, categories RESTART IDENTITY CASCADE empties the tables and resets the id sequences, so the first post of every run is post 1 again. That predictability is what lets a test assert on an id at all.',
      'Cleaning up before the run beats cleaning up after it. A failed test that aborts halfway never reaches its cleanup step, but the next run still starts from a known state.'
    ),
    category: 'Automation',
    tags: ['sql', 'cypress', 'best-practices'],
  },
  {
    title: 'Talking to Postgres from Cypress',
    body: paragraphs(
      'Cypress runs in the browser, but its tasks run in Node, and that is where a database client belongs. Register a task that takes a query, runs it, and returns the rows.',
      'From there a test can seed exactly the state it needs and assert on what the application wrote, without clicking through five screens to set up a scenario. Setup through the database is also dramatically faster than setup through the interface.',
      'Keep it to setup and verification. Testing the database instead of the application is a trap: if a test never opens the page, it cannot tell you the page works.'
    ),
    category: 'Automation',
    tags: ['cypress', 'sql', 'api'],
  },
  {
    title: 'What to ask before writing a DELETE',
    body: 'Run it as a SELECT first. If the rows that come back are not exactly the ones you meant, you just avoided an incident.',
    category: 'Testing',
    tags: ['sql', 'best-practices'],
  },
  {
    title: 'Indexes, briefly',
    body: 'An index is a shortcut the database keeps up to date for you: faster reads, slightly slower writes, and no effect whatsoever on your results.',
    category: 'Databases',
    tags: ['postgres', 'performance'],
  },
  {
    title: 'Counting rows is harder than it looks',
    body: paragraphs(
      'COUNT(*) counts rows. COUNT(column) counts rows where that column is not NULL. COUNT(DISTINCT column) counts different values. Three functions that look alike and answer three different questions.',
      'Joins complicate it further. Count posts after joining their tags and a post with three tags is counted three times, which is why the listing in this application counts posts in a separate query instead of trying to do everything at once.',
      'When a number on a screen looks wrong, write the count yourself before reporting it. Half the time the application is right and the question was ambiguous.'
    ),
    category: 'Databases',
    tags: ['sql', 'data-quality'],
  },
  {
    title: 'Timezones will get you',
    body: paragraphs(
      'This schema stores timestamps as TIMESTAMPTZ, which keeps the instant unambiguous no matter where the server or the reader sits. A column typed as plain TIMESTAMP does not, and that difference eventually produces a bug nobody can reproduce.',
      'The symptom is familiar: a record created late in the evening shows up under the wrong date, but only for colleagues in another country. The data is fine, the display is not, or the other way around.',
      'In psql, SHOW timezone tells you what the session assumes, and SELECT created_at AT TIME ZONE \'UTC\' lets you compare like with like. Do that before arguing about which date is correct.'
    ),
    category: 'Databases',
    tags: ['sql', 'data-quality', 'postgres'],
  },
  {
    title: 'Using psql from Docker Desktop',
    body: paragraphs(
      'You do not need to install a database client to look at the data. Docker Desktop opens a shell inside the running container, and psql is already there.',
      'Containers, then the my-blog-db container, then the Exec tab, then psql -U blog -d blog. No password is asked for, because a connection from inside the container is trusted.',
      'From that prompt, backslash-d-t lists the tables and backslash-d posts describes one. It is the fastest way to answer "what does this table actually contain" in the middle of a lesson.'
    ),
    category: 'Databases',
    tags: ['docker', 'postgres', 'beginners'],
  },
  {
    title: 'Test data that tells a story',
    body: paragraphs(
      'Random fixtures produce tests that fail once a month and pass on the rerun. Named, deliberate data produces failures you can read.',
      'A post with no category, a tag nobody uses, a post with six tags, a body long enough to be truncated in a listing: each of those exists because some part of the application behaves differently for it. Seed data is where you write the edge cases down.',
      'It is also documentation. A newcomer reading the seed script learns what the application considers normal much faster than by reading the code.'
    ),
    category: 'Testing',
    tags: ['best-practices', 'data-quality'],
  },
  {
    title: 'LIKE, ILIKE, and the trouble with %',
    body: paragraphs(
      'LIKE compares text with two wildcards: % stands for any run of characters and _ for exactly one. ILIKE is the same thing, ignoring case, which is what the tag suggestions in this application use.',
      'The trap is that those wildcards live in the user input too. Someone searching for 50% gets very different results than they expected unless the percent sign is escaped, and a search box that pastes input straight into SQL is an injection waiting to happen.',
      'Parameters solve the second problem and escaping solves the first. Both are two lines of code, and both are worth testing deliberately.'
    ),
    category: 'Databases',
    tags: ['sql', 'beginners'],
  },
  {
    title: 'Why your test passes locally and fails in CI',
    body: paragraphs(
      'Nine times out of ten the answer is data. Your machine has months of accumulated records, and the pipeline starts with an empty database.',
      'A test that quietly relies on a category existing, or on being the only post in the list, works beautifully on a laptop and collapses in a fresh container. The test was never wrong about the application; it was wrong about the world.',
      'Run your suite against a freshly seeded database once in a while. It is the cheapest way to find the assumptions you did not know you had.'
    ),
    category: 'Automation',
    tags: ['ci', 'best-practices', 'docker'],
  },
  {
    title: 'Reset the database, not your patience',
    body: paragraphs(
      'Two commands are enough to get back to a known state here: one recreates the schema, the other fills it with the seed data. Together they take a couple of seconds.',
      'That speed changes how you work. When resetting is cheap, you stop protecting the database, and you start experimenting with it: delete everything, break a constraint on purpose, watch what the application does, reset, move on.',
      'Any project where restoring a clean database takes twenty minutes will teach its team to avoid touching the database at all. That is a much more expensive problem than it looks.'
    ),
    category: 'Automation',
    tags: ['docker', 'cypress', 'ci'],
  },
  {
    title: 'Reading a schema you did not write',
    body: paragraphs(
      'Start with the list of tables, then describe the two or three that carry the nouns of the product. Column names, types, and NOT NULL constraints tell you what the team considers mandatory.',
      'Then follow the foreign keys, because they are the map. A table made of nothing but two foreign keys is a many-to-many relationship, and knowing that before you test the feature saves you an afternoon of guessing.',
      'Do this on the first day of a new project. You will ask better questions in your first week than most people ask in their first month.'
    ),
    category: 'Testing',
    tags: ['sql', 'beginners', 'data-quality'],
  },
  {
    title: 'Aggregate functions for testers',
    body: paragraphs(
      'COUNT, SUM, MIN, MAX, and AVG collapse many rows into one number, and GROUP BY decides how the rows are bundled before that happens.',
      'For testing, the useful pattern is comparing a number the application shows against the same number computed directly. Posts per category, tags per post, records created during the last run: each is one short query and one honest answer.',
      'MIN and MAX on a timestamp are underrated. They tell you at a glance whether the data you are looking at came from today or from a seed script three months old.'
    ),
    category: 'Databases',
    tags: ['sql'],
  },
  {
    title: 'Pagination bugs live in ORDER BY',
    body: paragraphs(
      'Splitting a list into pages is LIMIT and OFFSET, and that part rarely breaks. The bugs come from the sort.',
      'If the ordering is not deterministic, the database is free to return equal rows in any order it likes, and the same record can appear on page one and again on page two while another never shows up at all. Sorting by a date alone is enough to trigger it as soon as two records share a timestamp.',
      'Adding the primary key as a tiebreaker fixes it, which is why the listing here sorts by created_at descending and then by id descending. To test it, seed several records with identical timestamps and walk every page.'
    ),
    category: 'Testing',
    tags: ['sql', 'best-practices', 'performance'],
  },
  {
    title: 'One query per bug report',
    body: 'Paste the query and its result into the report. It turns "the tags are wrong" into something a developer can act on immediately.',
    category: 'Testing',
    tags: ['sql', 'best-practices'],
  },
]
const seed = async () => {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    await client.query('TRUNCATE post_tags, posts, tags, categories RESTART IDENTITY CASCADE')

    const categoryIds = {}
    for (const name of categories) {
      const { rows } = await client.query(
        'INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id',
        [name, slugify(name)]
      )
      categoryIds[name] = rows[0].id
    }

    const tagIds = {}
    for (const name of tags) {
      const { rows } = await client.query(
        'INSERT INTO tags (name, slug) VALUES ($1, $2) RETURNING id',
        [name, slugify(name)]
      )
      tagIds[name] = rows[0].id
    }

    for (const [index, post] of posts.entries()) {
      // Posts are dated two per day, oldest first, so the listing has a
      // realistic order and a few pairs share a timestamp -- which is exactly
      // what a paginated ORDER BY has to survive.
      const daysAgo = Math.floor((posts.length - 1 - index) / 2)

      const { rows } = await client.query(
        `INSERT INTO posts (title, body, category_id, created_at)
         VALUES ($1, $2, $3, now() - make_interval(days => $4))
         RETURNING id`,
        [post.title, post.body, categoryIds[post.category], daysAgo]
      )

      for (const tag of post.tags) {
        await client.query(
          'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)',
          [rows[0].id, tagIds[tag]]
        )
      }
    }

    await client.query('COMMIT')

    console.log(
      `Seeded ${categories.length} categories, ${tags.length} tags, and ${posts.length} posts.`
    )
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const reset = async () => {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  await pool.query(schema)
  console.log('Schema recreated.')
}

const main = async () => {
  if (process.argv.includes('--reset')) await reset()
  await seed()
  await pool.end()
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
