const debug = require('debug')('bluefin:link')

class DebugLog {
  info (message, context) {
    if (context) debug('%s %o', message, context)
    else debug('%s', message)
  }

  error (error) {
    for (let e = error; e; e = e.cause()) {
      if (e.context) debug('%s %o', e.name, e.context)
      debug('%s', e.stack)
    }
  }
}

module.exports = DebugLog
