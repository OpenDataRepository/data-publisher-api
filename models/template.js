const MongoDB = require('../lib/mongoDB');
const TemplateFieldModel = require('./template_field');
const { v4: uuidv4 } = require('uuid');

var Template;
var TemplateField;

function templateCollection() {
  if (Template === undefined) {
    let db = MongoDB.db();
    Template = db.collection('templates');
  }
  return Template;
}

exports.init = function() {
  Template = templateCollection()
  TemplateField = TemplateFieldModel.templateCollection();
}

exports.templateCollection = templateCollection

exports.newTemplate = async function(input_template) {
  
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
    for (field of input_template.fields) {
      if (typeof(field) !== 'string') {
        throw new TypeError("each field in fields must be of type string");
      }
      let response = await TemplateField.find({"uuid": field});
      if (!(await response.hasNext())) {
        throw new TypeError("field '" + field + "' in fields does not exist");
      }
    }
    fields = input_template.fields
  }
  if (input_template.related_templates) {
    if (!Array.isArray(input_template.related_templates)){
      throw new TypeError('related_templates property must be of type array');
    }
    for (related_template of input_template.related_templates) {
      if (typeof(related_template) !== 'string') {
        throw new TypeError("each related_template in related_templates must be of type string");
      }
      let response = await Template.find({"uuid": related_template});
      if (!(await response.hasNext())) {
        throw new TypeError("related_template '" + related_template + "' in related_templates does not exist");
      }
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
