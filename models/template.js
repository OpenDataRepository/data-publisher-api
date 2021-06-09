const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4 } = require('uuid');

var Template;

exports.templateCollection = function() {
  if (Template === undefined) {
    let db = MongoDB.db();
    Template = db.collection('templates');
  }
  return Template;
}

exports.createTemplate = function(input_template) {
  
  let name = "";
  let description = "";
  let fields = [];
  let related_templates = [];

  if (input_template.name) {
    if (typeof(input_template.name) !== 'string'){
      throw new TypeError('name property must be of type string');
    }
    name = input_template.name
  }
  if (input_template.description) {
    if (typeof(input_template.description) !== 'string'){
      throw new TypeError('description property must be of type string');
    }
    description = input_template.description
  }
  if (input_template.fields) {
    if (!Array.isArray(input_template.fields)){
      throw new TypeError('fields property must be of type array');
    }
    fields = input_template.fields
  }
  if (input_template.related_templates) {
    if (!Array.isArray(input_template.related_templates)){
      throw new TypeError('related_templates property must be of type array');
    }
    related_templates = input_template.related_templates
  }

  let insert_template = {
    name: name,
    description: description,
    fields: fields,
    related_templates: related_templates,
    updated_at: new Date(),
    uuid: uuidv4()
  }

  return insert_template;
}
