try {
  module.exports = require('../dist/services/killDetectionService');
} catch (e) {
  module.exports = require('../src/services/killDetectionService');
}
