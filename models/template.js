const MongoDB = require('../lib/mongoDB');

var Template;

module.exports = function() {
  if (Template === undefined) {
    let db = MongoDB.db();
    Template = db.collection('template');
  }
  return Template;
}