const PgLink = require('../src')

const Mock = PgLink.mock()
Mock.fn.selectInteger = int => int
const db = new Mock('pg:///test', __dirname, '..', 'test', 'sql')

db
  .connect(sql => sql.selectInteger(7))
  .then(value => console.log('select', value), err => console.error(err))
  .catch(e => console.error('caught', e))
  .finally(() => db.disconnect())
