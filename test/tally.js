const test = require("ava");
const PgLink = require("../src");
const StubLog = require("./lib/log");

const dbUrl = "postgres://postgres:postgres@pg:5432/test";

test("mock sends query metrics to a custom log", t => {
  const log = new StubLog();
  const Link = PgLink.mock();
  Link.fn.selectInteger = 42;
  Link.log = log;
  const db = new Link(dbUrl, __dirname, "sql");
  return db
    .connect(sql => sql.selectInteger(1))
    .then(() => {
      t.is(log.metrics.length, 4);
      for (let o of log.metrics) {
        t.is(o.dimensions.host, "pg");
      }

      t.is(log.metrics[0].name, "mock.connect.duration");
      t.is(log.metrics[0].kind, "magnitude");

      t.is(log.metrics[1].name, "mock.connect.retries");
      t.is(log.metrics[1].kind, "count");

      t.is(log.metrics[2].name, "mock.query.duration");
      t.is(log.metrics[2].kind, "magnitude");
      t.is(log.metrics[2].dimensions.query, "selectInteger");

      t.is(log.metrics[3].name, "mock.connection.duration");
      t.is(log.metrics[2].kind, "magnitude");
    });
});

test("pg sends query metrics to a custom log", t => {
  const log = new StubLog();
  PgLink.log = log;
  const db = new PgLink(dbUrl, __dirname, "sql");
  return db
    .connect(sql => sql.selectInteger(1))
    .then(() => {
      t.is(log.metrics.length, 4);
      for (let o of log.metrics) {
        t.is(o.dimensions.host, "pg");
      }

      t.is(log.metrics[0].name, "pg.connect.duration");
      t.is(log.metrics[0].kind, "magnitude");

      t.is(log.metrics[1].name, "pg.connect.retries");
      t.is(log.metrics[1].kind, "count");

      t.is(log.metrics[2].name, "pg.query.duration");
      t.is(log.metrics[2].kind, "magnitude");
      t.is(log.metrics[2].dimensions.query, "selectInteger");

      t.is(log.metrics[3].name, "pg.connection.duration");
      t.is(log.metrics[2].kind, "magnitude");
    });
});
