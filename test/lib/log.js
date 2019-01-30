class StubLog {
  constructor (context, dimensions) {
    this.context = context
    this.dimensions = dimensions
    this._debug = []
    this._info = []
    this._warning = []
    this._error = []
    this.metrics = []
  }

  formatPath (filePath) {
    return filePath
  }

  fail (msg, cause, ...rest) {
    const e = new Error(msg)
    e.context = Object.assign({}, this.context, ...rest)
    if ('stack' in e.context) {
      e.stack = e.context.stack.replace(/(\[object Object\])/, `Error: ${e.msg}`)
      delete e.context.stack
    }

    if (cause) cause.effect = e
    return cause
  }

  debug (msg, ...rest) {
    const context = Object.assign({}, this.context, ...rest)
    this._debug.push({ msg, context })
  }

  info (message, ...rest) {
    const context = Object.assign({}, this.context, ...rest)
    this._info.push({ message, context })
  }

  warning (message, ...rest) {
    const context = Object.assign({}, this.context, ...rest)
    this._warning.push({ message, context })
  }

  error (error) {
    this._error.push(error)
  }

  magnitude (name, value, ...rest) {
    const dimensions = Object.assign({}, this.dimensions, ...rest)
    this.metrics.push({ name, value, kind: 'magnitude', dimensions: dimensions })
  }

  count (name, value, ...rest) {
    const dimensions = Object.assign({}, this.dimensions, ...rest)
    this.metrics.push({ name, value, kind: 'count', dimensions: dimensions })
  }

  begin (name) {
    const begin = process.hrtime()
    return (...rest) => {
      const dimensions = Object.assign({}, this.dimensions, ...rest)
      const elapsed = process.hrtime(begin)
      const microseconds = elapsed[0] * 1e6 + elapsed[1] * 1e-3
      this.magnitude(name, microseconds, dimensions)
      return microseconds
    }
  }
}

module.exports = StubLog
