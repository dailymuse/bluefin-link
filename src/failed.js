'use strict'

function fail (message, cause, context, name = 'Error') {
  const e = new Error(message)
  e.name = name
  if (cause) e.cause = () => cause
  if (context) {
    e.context = context
    if ('stack' in context) {
      e.stack = context.stack.replace(
        /(Error)|(\[object Object\])/,
        `${name}: ${e.message}`
      )
      delete e.context.stack
    }
  }
  return e
}

module.exports.query = (pgError, context) => {
  const cause = new Error(pgError.message)
  cause.stack = pgError.stack
  cause.context = {}
  Object.keys(pgError).forEach(k => {
    if (pgError[k]) cause.context[k] = pgError[k]
  })
  delete cause.context.name
  return fail(pgError.message, cause, context, 'QueryFailed')
}

module.exports.mock = (name, mockError, context) => {
  return fail(
    `Mock ${name}() threw error`,
    mockError,
    context,
    'QueryFailed'
  )
}

module.exports.result = (message, result, context) => {
  const cause = new Error(message)
  cause.context = {result}
  return fail(
    'incorrect result from mock',
    cause,
    context,
    'QueryFailed'
  )
}
