class StubLog {
  constructor () {
    this._info = []
    this._warning = []
    this._error = []
  }

  info (message, context) {
    this._info.push({message, context})
  }

  warning (message, context) {
    this._warning.push({message, context})
  }

  error (error) {
    this._error.push(error)
  }
}

module.exports = StubLog
