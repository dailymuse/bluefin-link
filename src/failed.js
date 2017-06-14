'use strict'

function instantiate (message, cause, context, name = 'Error') {
  const e = new Error(message)
  e.name = name
  if (cause) e.cause = () => cause
  if (context) {
    e.context = context
    if ('stack' in context) {
      e.stack = context.stack.replace('Error', `${name}: ${e.message}`)
      delete e.context.stack
    }
  }
  return e
}

function wrap (message) {
  return (cause, context) => instantiate(message, cause, context)
}

function rename (name) {
  return (message, cause, context) => instantiate(message, cause, context, name)
}

module.exports.listen = wrap('Listen failed')
module.exports.notify = wrap('Notify failed')
module.exports.query = rename('QueryFailed')
module.exports.unlisten = wrap('Unlisten failed')
