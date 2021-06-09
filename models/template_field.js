const MongoDB = require('../lib/mongoDB');

var TemplateField;

function templateCollection() {
  if (TemplateField === undefined) {
    let db = MongoDB.db();
    TemplateField = db.collection('template_fields');
  }
  return TemplateField;
}

exports.templateCollection = templateCollection
