class StubTally {
  constructor (dimensions) {
    const d = dimensions ? this._dim(dimensions) : undefined
    this.metrics = []
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
    this.metrics.push({name, value, kind: 'magnitude', dimensions: this._dim(dimensions)})
  }

  count (name, value, dimensions) {
    this.metrics.push({name, value, kind: 'count', dimensions: this._dim(dimensions)})
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

module.exports = StubTally
