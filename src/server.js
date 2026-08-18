// override: true so this project's .env wins over any DATABASE_URL exported by the shell.
require('dotenv').config({ override: true })

const app = require('./app')

const port = process.env.PORT || 3000

app.listen(port, () => console.log(`Blog running at http://localhost:${port}`))
