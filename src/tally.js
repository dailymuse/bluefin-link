const debug = require('debug')('bluefin:link')

class DebugTally {
  constructor (dimensions) {
    this.dimensions = dimensions ? this._dim(dimensions) : undefined
  }

  _dim (dimensions) {
    if (dimensions) {
      const d = {}
      for (let p in dimensions) {
        d[p] = '' + dimensions[p]
      }
      return d
    }
  }

  magnitude (name, value, dimensions) {
    debug('magnitude %s %d %o', name, value, this._dim(dimensions))
  }

  count (name, value, dimensions) {
    debug('count %s %d %o', name, value, this._dim(dimensions))
  }

  begin (name) {
    const begin = process.hrtime()
    return dimensions => {
      const elapsed = process.hrtime(begin)
      const microseconds = elapsed[0] * 1e6 + elapsed[1] * 1e-3
      this.magnitude(name, microseconds, dimensions)
      return microseconds
    }
  }
}

module.exports = DebugTally
