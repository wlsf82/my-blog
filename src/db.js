// override: true so this project's .env wins over any DATABASE_URL exported by the shell.
require('dotenv').config({ override: true })

const { Pool } = require('pg')

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://blog:blog@localhost:5432/blog',
})

const query = (text, params) => pool.query(text, params)

module.exports = { pool, query }
