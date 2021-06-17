const MongoDB = require('../lib/mongoDB');
const TemplateFieldModel = require('./template_field');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');

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

async function validateAndCreateOrUpdateTemplate(template, uuid) {

  // Template must be an object
  if (!Util.isObject(template)) {
    throw new TypeError("each template must be an object");
  }

  // Input uuid and template uuid must match
  if (uuid) {
    if (template.uuid != uuid) {
      throw new TypeError(`uuid provided (${uuid}) and template uuid (${template.uuid}) do not match`);
    }
  }

  // If a template uuid is provided, this is an update
  if (template.uuid) {
    // Template must have a valid uuid. 
    if (typeof(template.uuid) !== 'string'|| !uuidValidate(template.uuid)) {
      throw new TypeError("each template must have a valid uuid property");
    }
    
    // Template uuid must exist
    let cursor = await Template.find({"uuid": template.uuid});
    if (!(await cursor.hasNext())) {
      throw new TypeError(`No template exists with uuid ${template.uuid}`);
    }
  }
  // Otherwise, this is a create, so generate a new uuid
  else {
    template.uuid = uuidv4();
  }

  // Populate template properties
  let name = "";
  let description = "";
  let fields = [];
  let related_templates = [];
  if (template.name) {
    if (typeof(template.name) !== 'string'){
      throw new TypeError('name property must be of type string');
    }
    name = template.name
  }
  if (template.description) {
    if (typeof(template.description) !== 'string'){
      throw new TypeError('description property must be of type string');
    }
    description = template.description
  }
  // Reursively handle each of the fields
  if (template.fields) {
    if (!Array.isArray(template.fields)){
      throw new TypeError('fields property must be of type array');
    }
    for (let i = 0; i < template.fields.length; i++) {
      await TemplateFieldModel.validateAndCreateOrUpdateField(template.fields[i]);
      // After validating and updating the field, replace the imbedded field with a uuid reference
      template.fields[i] = template.fields[i].uuid
    }
    fields = template.fields
  }
  // Reursively handle each of the related_templates
  if (template.related_templates) {
    if (!Array.isArray(template.related_templates)){
      throw new TypeError('related_templates property must be of type array');
    }
    for (let i = 0; i < template.fields.length; i++) {
      await validateAndCreateOrUpdateTemplate(template.related_templates[i]);
      // After validating and updating the related_template, replace the imbedded related_template with a uuid reference
      template.related_templates[i] = template.related_templates[i].uuid
    }
    related_templates = template.related_templates
  }

  // Ensure there is only one draft of this template. If there are multiple drafts, that is a critical error.
  cursor = await Template.find({"uuid": uuid, 'publish_date': {'$exists': false}});
  if ((await cursor.count()) > 1) {
    throw new Exception(`Template.validateAndCreateOrUpdateTemplate: Multiple drafts found of template with uuid ${template.uuid}`);
  } 

  // Update/create the template in the database
  let new_template = {
    name: name,
    description: description,
    fields: fields,
    related_templates: related_templates,
    updated_at: new Date(),
    uuid: template.uuid
  }

  // If a draft of this template already exists: overwrite it, using it's same uuid
  // If a draft of this template doesn't exist: create a new draft
  // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
  let response = await Template.updateOne(
    {"uuid": template.uuid, 'publish_date': {'$exists': false}}, 
    {$set: new_template}, 
    {'upsert': true}
  );
  if (response.modifiedCount != 1 && response.upsertedCount != 1) {
    throw `Template.validateAndCreateOrUpdateTemplate: Modified: ${response.modifiedCount}. Upserted: ${response.upsertedCount}`;
  } 
}

exports.validateAndCreateOrUpdateTemplate = validateAndCreateOrUpdateTemplate;