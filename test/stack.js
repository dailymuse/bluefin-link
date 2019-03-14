const test = require("ava");
const PgLink = require("../src");
const path = require("path");

const dbUrl = "postgres://postgres:postgres@pg:5432/test";
const sourceDir = path.join(__dirname, "sql");

/*
These tests depend on asserting that stack traces include particular line
numbers. By isolating them, we reduce their exposure to changes in other areas
of the test suite.
*/

test("pg error", t => {
  const db = new PgLink(dbUrl, sourceDir);
  return db
    .connect(c => c.semanticError())
    .catch(e => {
      t.true(e.effect.stack.includes(`${__filename}:16:28`));
    });
});

test("mock error", t => {
  const MockLink = PgLink.mock();
  MockLink.fn.semanticError = () => {
    throw new Error("whiffle");
  };
  const db = new MockLink(dbUrl, sourceDir);
  return db
    .connect(c => c.semanticError())
    .catch(e => {
      t.is(e.message, "whiffle");
      t.true(e.effect.stack.includes(`${__filename}:27:28`));
    });
});
