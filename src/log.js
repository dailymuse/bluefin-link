const debug = require('debug')('bluefin:link')

class DebugLog {
  info (message, context) {
    if (context) debug('%s %o', message, context)
    else debug('%s', message)
  }

  error (error) {
    let e = error
    while (e) {
      if (e.context) debug('%s %o', e.name, e.context)
      debug('%s', e.stack)
      e = typeof e.cause === 'function' ? e.cause() : e.cause
    }
  }
}

module.exports = DebugLog
