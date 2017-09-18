const PgLink = require('../src')

const Mock = PgLink.mock()
Mock.fn.selectInteger = int => int

const pdb = new PgLink('pg:///test', __dirname, '..', 'test', 'sql')
const mdb = new Mock('pg:///test', __dirname, '..', 'test', 'sql')

mdb
  .connect(sql => sql.selectInteger(7))
  .then(value => console.log('mock', value), err => console.error(err))
  .then(() => pdb.connect(sql => sql.selectInteger(9)))
  .then(int => console.log('pg', int))
  .catch(e => console.error('caught', e))
  .finally(() => PgLink.disconnect())
