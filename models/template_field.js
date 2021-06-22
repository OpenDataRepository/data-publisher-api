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

async function latestPublishedTemplateField(uuid, session) {
  console.log('calling latestPublishedTemplateField');
  let cursor = await TemplateField.find(
    {"uuid": uuid, 'publish_date': {'$exists': true}},
    {session}
  ).sort({'publish_date': -1}).limit(1);
  if (!(await cursor.hasNext())) {
    return null;
  }
  console.log('returning from latestPublishedTemplateField');
  return await cursor.next();
}

async function templateFieldDraft(uuid, session) {
  console.log('calling templateFieldDraft');
  let cursor = await TemplateField.find(
    {"uuid": uuid, 'publish_date': {'$exists': false}},
    {session}
  );
  if(!(await cursor.hasNext())) {
    return null;
  } 
  let draft = await cursor.next();
  if (await cursor.hasNext()) {
    throw `TemplateField.templateFieldDraft: Multiple drafts found for field with uuid ${uuid}`;
  }
  console.log('returning from templateFieldDraft');
  return draft;
}

// Publishes the field with the provided uuid
//   If a draft exists of the field, then:
//     if that draft has changes from the latest published:
//       publish it, and return the new internal_id
//     else: 
//       return the internal_id of the latest published
//   else:
//     return the internal_id of the latest_published
// Input: 
//   uuid: the uuid of a field to be published
//   session: the mongo session that must be used to make transactions atomic
// Returns:
//   internal_id: the internal id of the published field
//   published: true if a new published version is created. false otherwise
// Note: This does not delete the current draft. It only creates a published version of it. 
async function publishField(uuid, session) {
  console.log('start publishField...');
  var return_id;

  // Check if a draft with this uuid exists
  let field_draft = await templateFieldDraft(uuid, session);
  if(!field_draft) {
    // There is no draft of this uuid. Get the latest published field instead.
    let published_field = await latestPublishedTemplateField(uuid, session);
    if (!published_field) {
      throw `TemplateField.publishField: Field with uuid ${uuid} does not exist`
    }
    return [published_field.internal_id, false];
  }

  let changes = false;

  // We're trying to figure out if there is anything worth publishing. See if there are any changes to the field draft from the previous published version
  let published_field = await latestPublishedTemplateField(uuid, session);
  // If there was a previously published field, see if anything was changed between this one and that one. 
  if (published_field) {
    return_id = published_field._id;
    if (field_draft.name != published_field.name || 
      field_draft.description != published_field.description) {
      changes = true;
    } 
  } else {
    changes = true;
  }

  // If there are changes, publish the current draft
  let new_field = field_draft;
  if(changes) {
    let publish_time = new Date();
    new_field.updated_at = publish_time;
    new_field.publish_date = publish_time;
    delete new_field._id;
    console.log('inserting new field...');
    let response = await TemplateField.insertOne(new_field, {session});
    if (response.insertedCount != 1) {
      throw `TemplateField.publishField: should be 1 inserted document. Instead: ${response.insertedCount}`;
    }
    return_id = response.insertedId;
    console.log('updating field draft...');
    response = await TemplateField.updateOne(
      {"uuid": uuid, 'publish_date': {'$exists': false}},
      {'$set': {'updated_at': publish_time}},
      {session}
    )
    if (response.modifiedCount != 1) {
      throw `TemplateField.publishField: should be 1 inserted document. Instead: ${response.modifiedCount}`;
    }
  }
  console.log('returning from publishField');
  return [return_id, changes];
}

exports.templateCollection = templateCollection;
exports.validateAndCreateOrUpdateField = validateAndCreateOrUpdateField;
exports.publishField = publishField;
