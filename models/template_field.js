const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');

var TemplateField;

function templateCollection() {
  if (TemplateField === undefined) {
    let db = MongoDB.db();
    TemplateField = db.collection('template_fields');
  }
  return TemplateField;
}

async function validateAndCreateOrUpdateField(field, uuid) {

  // Field must be an object
  if (!Util.isObject(field)) {
    throw new TypeError("each field must be an object");
  }

  // Input uuid and field uuid must match
  if (uuid) {
    if (field.uuid != uuid) {
      throw new TypeError(`uuid provided (${uuid}) and field uuid (${field.uuid}) do not match`);
    }
  }

  // If a field uuid is provided, this is an update
  if (field.uuid) {
    // Field uuid must be a valid uuid
    if (typeof(field.uuid) !== 'string' || !uuidValidate(field.uuid)) {
      throw new TypeError("each field must have a valid uuid property");
    }

    // Field uuid must exist
    let cursor = await TemplateField.find({"uuid": field.uuid});
    if (!(await cursor.hasNext())) {
      throw new TypeError(`No field exists with uuid ${field.uuid}`);
    }
  } 
  // Otherwise, this is a create, so generate a new uuid
  else {
    field.uuid = uuidv4();
  }

  // Populate field properties
  let name = "";
  let description = "";
  if (field.name) {
    if (typeof(field.name) !== 'string'){
      throw new TypeError('field name property must be of type string');
    }
    name = field.name
  }
  if (field.description) {
    if (typeof(field.description) !== 'string'){
      throw new TypeError('field description property must be of type string');
    }
    description = field.description
  }

  // Ensure there is only one draft of this field. If there are multiple drafts, that is a critical error.
  cursor = await TemplateField.find({"uuid": uuid, 'publish_date': {'$exists': false}});
  if ((await cursor.count()) > 1) {
    throw new Exception(`Multiple drafts found of field with uuid ${field.uuid}`);
  } 

  // Update the template field in the database
  let new_field = {
    uuid: field.uuid,
    name: name,
    description: description,
    updated_at: new Date()
  }

  // If a draft of this field already exists: overwrite it, using it's same uuid
  // If a draft of this field doesn't exist: create a new draft
  // Fortunately both cases can be handled with a single MongoDB UpdateOne query using 'upsert: true'
  let response = await TemplateField.updateOne(
    {"uuid": field.uuid, 'publish_date': {'$exists': false}}, 
    {$set: new_field}, 
    {'upsert': true}
  );
  if (response.modifiedCount != 1 && response.upsertedCount != 1) {
    throw `TemplateField.validateAndCreateOrUpdateTemplateField: Modified: ${response.modifiedCount}. Upserted: ${response.upsertedCount}`;
  } 
}

exports.templateCollection = templateCollection;
exports.validateAndCreateOrUpdateField = validateAndCreateOrUpdateField;
