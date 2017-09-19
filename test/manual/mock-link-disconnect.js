const PgLink = require('../../src')

const db = new PgLink('pg:///test', __dirname, '..', 'sql')

db
  .connect(sql => sql.selectInteger(7))
  .then(value => console.log('select', value), err => console.error(err))
  .catch(e => console.error('caught', e))
  .finally(() => db.disconnect())
