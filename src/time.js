"use strict";

module.exports.start = () => {
  const start = process.hrtime();
  return () => {
    const diff = process.hrtime(start);
    return diff[0] * 1e3 + diff[1] * 1e-6;
  };
};
