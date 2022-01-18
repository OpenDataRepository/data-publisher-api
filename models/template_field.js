const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');
const PermissionGroupModel = require('./permission_group');
const SharedFunctions = require('./shared_functions');
const LegacyUuidToNewUuidMapperModel = require('./legacy_uuid_to_new_uuid_mapper');

var TemplateField;

async function collection() {
  if (TemplateField === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('template_fields');
    } catch(e) {}
    TemplateField = db.collection('template_fields');
  }
  return TemplateField;
}

// Creates a draft from the published version.
function createDraftFromPublished(published) {
  let draft = published;

  delete draft._id;
  draft.updated_at = draft.publish_date;
  delete draft.publish_date;

  return draft;
}

// Fetches the latest published field with the given uuid. 
async function latestPublishedBeforeDate(uuid, date, session) {
  let cursor = await TemplateField.find(
    {"uuid": uuid, 'publish_date': {'$lte': date}},
    {session}
  ).sort({'publish_date': -1})
  .limit(1);
  if (!(await cursor.hasNext())) {
    return null;
  }
  return await cursor.next();
}

// Fetches the latest published field with the given uuid. 
async function latestPublished(uuid, session) {
  return await latestPublishedBeforeDate(uuid, new Date(), session);
}

async function latestPublishedBeforeDateWithPermissions(uuid, date, user) {
  let field = await latestPublishedBeforeDate(uuid, date);
  if(!field) {
    return null;
  }

  // Ensure user has permission to view
  if (!(await SharedFunctions.userHasAccessToPublishedResource(field, user, PermissionGroupModel))) {
    throw new Util.PermissionDeniedError(`Do not have permission to view template field with uuid ${uuid}`);
  }

  return field;
}

async function fetchPublishedAndConvertToDraft(uuid, session) {
  let published_field = await latestPublished(uuid, session);
  if(!published_field) {
    return null;
  }

  return (await createDraftFromPublished(published_field));
}

async function draftDelete(uuid) {

  let response = await TemplateField.deleteMany({ uuid, publish_date: {'$exists': false} });
  if (!response.deletedCount) {
    throw new Util.NotFoundError();
  }
  if (response.deletedCount > 1) {
    console.error(`templateDraftDelete: Template with uuid '${uuid}' had more than one draft to delete.`);
  }
}

function fieldEquals(field1, field2) {
  return field1.name == field2.name && field1.description == field2.description && field1.public_date == field2.public_date;
}

function parseOptions(options, previous_options_uuids, current_options_uuids) {
  if(!Array.isArray(options)) {
    throw new Util.InputError(`options must be an array.`);
  }
  let return_options = [];
  for(option of options) {
    if(!Util.isObject(option)) {
      throw new Util.InputError(`Each option in the field must be a json object`);
    }
    let cleansed_option = {};
    if (!option.name) {
      throw new Util.InputError('each option must have a name');
    }
    if (typeof(option.name) !== 'string'){
      throw new Util.InputError('each option name must be of type string');
    }
    cleansed_option.name = option.name;
    
    if(option.options) {
      cleansed_option.options = parseOptions(option.options, previous_options_uuids, current_options_uuids);
    } else {
      if (option.uuid) {
        if(!previous_options_uuids.has(option.uuid)) {
          throw new Util.InputError(`Cannot provide option uuid ${option.uuid}. May only specify uuids that already exist.`);
        }
        if(current_options_uuids.has(option.uuid)) {
          throw new Util.InputError(`Option uuid ${option.uuid} duplicated. Each option may only be supplied once`);
        }
        current_options_uuids.add(option.uuid);
        cleansed_option.uuid = option.uuid;
      } else {
        cleansed_option.uuid = uuidv4();
      }
    }
    return_options.push(cleansed_option)
  }
  return return_options;
}

function buildOptionSet(options, set) {
  for(let option of options) {
    if(option.uuid) {
      set.add(option.uuid);
    }
    if(option.options) {
      buildOptionSet(option.options, set);
    }
  }
}

function findOptionValue(options, uuid) {
  for(let option of options) {
    if(option.uuid == uuid) {
      return option.name;
    }
    if(option.options) {
      let value = findOptionValue(option.options, uuid);
      if(value) {
        return value;
      }
    }
  }
  return undefined;
}

async function importRadioOptions(radio_options, session) {
  if(!Array.isArray(radio_options)) {
    throw new Util.InputError(`Radio options must be an array.`);
  }
  let return_options = [];
  for(radio_option of radio_options) {
    if(!Util.isObject(radio_option)) {
      throw new Util.InputError(`Each radio_option in the field must be a json object`);
    }
    let cleansed_option = {};
    if (!radio_option.name || typeof(radio_option.name) !== 'string') {
      throw new Util.InputError('each radio option must have a name of type string ');
    }
    cleansed_option.name = radio_option.name;
    
    if(radio_option.radio_options) {
      cleansed_option.options = await importRadioOptions(radio_option.radio_options, session);
    } else {
      if (!radio_option.template_radio_option_uuid) {
        throw new Util.InputError(`All radio options provided imported must include a radio option uuid`);
      }
      // Map old radio option to new. If old has been seen before, that's an error
      let uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(radio_option.template_radio_option_uuid, session);
      if(uuid) {
        throw new Util.InputError(`Uuid ${radio_option.template_radio_option_uuid} has already been imported once and cannot be imported again.`);
      }
      uuid = await LegacyUuidToNewUuidMapperModel.create_new_uuid_for_old(radio_option.template_radio_option_uuid, session);
      cleansed_option.uuid = uuid;
    }
    return_options.push(cleansed_option);
  }
  return return_options;
}

function initializeNewDraftWithPropertiesSharedWithImport(input_field, uuid, updated_at) {
  let output_field = {
    uuid, 
    name: "",
    description: "",
    updated_at
  };
  if (input_field.name !== undefined) {
    if (typeof(input_field.name) !== 'string'){
      throw new Util.InputError('name property must be of type string');
    }
    output_field.name = input_field.name
  }
  if (input_field.description !== undefined) {
    if (typeof(input_field.description) !== 'string'){
      throw new Util.InputError('description property must be of type string');
    }
    output_field.description = input_field.description
  }
  return output_field;
}

async function initializeNewDraftWithProperties(input_field, uuid, updated_at) {
  let output_field = initializeNewDraftWithPropertiesSharedWithImport(input_field, uuid, updated_at);
  if (input_field.public_date) {
    if (!Date.parse(input_field.public_date)){
      throw new Util.InputError('template public_date property must be in valid date format');
    }
    output_field.public_date = new Date(input_field.public_date);
  }
  if(input_field.options) {
    let latest_field = await SharedFunctions.latestDocument(TemplateField, uuid);
    let previous_options_uuids = new Set();
    if(latest_field && latest_field.options) {
      buildOptionSet(latest_field.options, previous_options_uuids);
    }
    output_field.options = parseOptions(input_field.options, previous_options_uuids, new Set());
  }
  return output_field;
}

async function initializeNewImportedDraftWithProperties(input_field, uuid, session) {
  if (input_field.updated_at && Date.parse(input_field.updated_at)) {
    input_field.updated_at = new Date(input_field.updated_at);
  } else {
    input_field.updated_at = undefined;
  }
  let output_field = initializeNewDraftWithPropertiesSharedWithImport(input_field, uuid, input_field.updated_at);
  if (input_field._field_metadata && Util.isObject(input_field._field_metadata) && input_field._field_metadata._public_date) {
    if (Date.parse(input_field._field_metadata._public_date)){
      output_field.public_date = new Date(input_field.public_date);
    }
  }
  if(input_field.radio_options) {
    output_field.options = await importRadioOptions(input_field.radio_options, session);
  }
  return output_field;
}

// Updates the field with the given uuid if provided in the field object. 
// If no uuid is included in the field object., create a new field.
// Also validate input. 
// Return:
// 1. A boolean: true if there were changes from the last published.
// 2. The uuid of the template field created / updated
async function validateAndCreateOrUpdate(input_field, user, session, updated_at) {

  // Field must be an object
  if (!Util.isObject(input_field)) {
    throw new Util.InputError(`field provided is not an object: ${input_field}`);
  }

  let uuid;
  // If a field uuid is provided, this is an update
  if (input_field.uuid) {
    // Field uuid must be a valid uuid
    if (!uuidValidate(input_field.uuid)) {
      throw new Util.InputError("uuid must conform to standard uuid format");
    }

    // Field uuid must exist
    if (!(await SharedFunctions.exists(TemplateField, input_field.uuid))) {
      throw new Util.NotFoundError(`No field exists with uuid ${input_field.uuid}`);
    }

    // verify that this user is in the 'edit' permission group
    if (!(await PermissionGroupModel.has_permission(user, input_field.uuid, PermissionGroupModel.PERMISSION_EDIT))) {
      throw new Util.PermissionDeniedError();
    }

    uuid = input_field.uuid;
  } 
  // Otherwise, this is a create
  else {
    // Generate a uuid for the new template_field
    uuid = uuidv4();
    // create a permissions group for the new template_field
    await PermissionGroupModel.initialize_permissions_for(user, uuid, session);
  }

  // Populate field properties
  let new_field = await initializeNewDraftWithProperties(input_field, uuid, updated_at);

  // If this draft is identical to the latest published, delete it.
  let old_field = await fetchPublishedAndConvertToDraft(uuid);
  if (old_field) {
    let changes = !fieldEquals(new_field, old_field);
    if (!changes) {
      // Delete the current draft
      try {
        await draftDelete(uuid);
      } catch(err) {
        if (!(err instanceof Util.NotFoundError)) {
          throw err;
        }
      }
      return [false, uuid];
    }
  }

  // If a draft of this field already exists: overwrite it, using it's same uuid
  // If a draft of this field doesn't exist: create a new draft
  // Fortunately both cases can be handled with a single MongoDB UpdateOne query using 'upsert: true'
  let response = await TemplateField.updateOne(
    {uuid, 'publish_date': {'$exists': false}}, 
    {$set: new_field}, 
    {'upsert': true, session}
  );
  if (response.upsertedCount != 1 && response.matchedCount != 1) {
    throw new Error(`TemplateField.validateAndCreateOrUpdateTemplateField: Modified: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
  } 
  return [true, uuid];
}

async function draftFetchOrCreate(uuid, user, session) {

  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }
  
  // See if a draft of this template field exists. 
  let template_field_draft = await SharedFunctions.draft(TemplateField, uuid, session);

  // If a draft of this template field already exists, return it.
  if (template_field_draft) {
    // Make sure this user has a permission to be working with drafts
    if (!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT))) {
      throw new Util.PermissionDeniedError();
    }
    delete template_field_draft._id;
    return template_field_draft;
  }

  // If a draft of this template field does not exist, create a new template_field_draft from the last published
  template_field_draft = await latestPublished(uuid, session);
  // If not even a published version of this template field was found, return null
  if(!template_field_draft) {
    return null;
  } else {
    // Make sure this user has a permission to be working with drafts
    if (!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT))) {
      throw new Util.PermissionDeniedError();
    }
  }

  // Remove the internal_id and publish_date from this template, as we plan to insert this as a draft now. 
  delete template_field_draft._id;
  template_field_draft.updated_at = template_field_draft.publish_date;
  delete template_field_draft.publish_date;

  let response = await TemplateField.insertOne(
    template_field_draft,
    {session}
  )
  if (response.insertedCount != 1) {
    throw `TemplateField.draftFetchOrCreate: should be 1 inserted document. Instead: ${response.insertedCount}`;
  }
  
  return template_field_draft;

}

// Publishes the field with the provided uuid
//   If a draft exists of the field, then:
//     if a last_update is provided, verify that it matches the last update in the db
//     if that draft has changes from the latest published:
//       publish it, and return the new internal_id
//     else: 
//       return the internal_id of the latest published
//   else:
//     return the internal_id of the latest_published
// Input: 
//   uuid: the uuid of a field to be published
//   session: the mongo session that must be used to make transactions atomic
//   last_update: the timestamp of the last known update by the user. Cannot publish if the actual last update and that expected by the user differ.
//   user: username of the user performing this operation
// Returns:
//   internal_id: the internal id of the published field
//   published: true if a new published version is created. false otherwise
async function publishField(uuid, session, last_update, user) {
  var return_id;

  let published_field = await latestPublished(uuid, session);

  // Check user credentials
  let has_permission = await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT);

  // Check if a draft with this uuid exists
  let field_draft = await SharedFunctions.draft(TemplateField, uuid, session);
  if(!field_draft) {
    // There is no draft of this uuid. Get the latest published field instead.
    if (!published_field) {
      throw new Util.NotFoundError(`Field with uuid ${uuid} does not exist`);
    }
    // if the user doesn't have edit permissions, throw a permission denied error
    if(!has_permission) {
      throw new Util.PermissionDeniedError();
    }
    
    // There is no draft of this uuid. Return the internal id of the last published version instead
    return [published_field._id, false];
  }
  // if the user doesn't have edit permissions, throw a permission denied error
  if(!has_permission) {
    throw new Util.PermissionDeniedError();
  }

  if (last_update) {
    // If the last update provided doesn't match to the last update found in the db, fail.
    let db_last_update = new Date(field_draft.updated_at);
    if(last_update.getTime() != db_last_update.getTime()) {
      throw new Util.InputError(`The last update submitted ${last_update.toISOString()} does not match that found in the db ${db_last_update.toISOString()}. 
      Fetch the draft again to get the latest update before attempting to publish again.`);
    }
  }

  let changes = false;

  // We're trying to figure out if there is anything worth publishing. See if there are any changes to the field draft from the previous published version
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
  if(changes) {
    let publish_time = new Date();
    let response = await TemplateField.updateOne(
      {"_id": field_draft._id},
      {'$set': {'updated_at': publish_time, 'publish_date': publish_time}},
      {session}
    )
    if (response.modifiedCount != 1) {
      throw new Error(`TemplateField.publishField: should be 1 updated document. Instead: ${response.modifiedCount}`);
    }
    return_id = field_draft._id;
  }
  return [return_id, changes];
}

async function lastupdateFor(uuid, session) {
  let draft = await draftFetchOrCreate(uuid, session);
  if(!draft) {
    throw new Util.NotFoundError();
  }
  return draft.updated_at;
}

exports.collection = collection;
exports.validateAndCreateOrUpdate = validateAndCreateOrUpdate;
exports.publishField = publishField;
exports.draft = draftFetchOrCreate;
exports.lastupdateFor = lastupdateFor;
exports.latestPublishedWithoutPermissions = latestPublished;

// Wraps the request to create with a transaction
exports.create = async function(field, user) {
  const session = MongoDB.newSession();
  let inserted_uuid;
  try {
    await session.withTransaction(async () => {
      try {
        [_, inserted_uuid] = await validateAndCreateOrUpdate(field, user, session, new Date());
      } catch(err) {
        await session.abortTransaction();
        throw err;
      }
    });
    session.endSession();
    return inserted_uuid;
  } catch(err) {
    session.endSession();
    throw err;
  }
}

// Wraps the request to get with a transaction. Since fetching a draft creates one if it doesn't already exist
exports.draftGet = async function(uuid, user) {
  const session = MongoDB.newSession();
  try {
    var field;
    await session.withTransaction(async () => {
      try {
        field = await draftFetchOrCreate(uuid, user, session);
      } catch(err) {
        await session.abortTransaction();
        throw err;
      }
    });
    session.endSession();
    return field;
  } catch(err) {
    session.endSession();
    throw err;
  }
}

// Wraps the request to update with a transaction
exports.update = async function(field, user) {
  const session = MongoDB.newSession();
  try {
    await session.withTransaction(async () => {
      try {
        await validateAndCreateOrUpdate(field, user, session, new Date());
      } catch(err) {
        await session.abortTransaction();
        throw err;
      }
    });
    session.endSession();
  } catch(err) {
    session.endSession();
    throw err;
  }
}

// Wraps the request to publish with a transaction
exports.publish = async function(uuid, last_update, user) {
  const session = MongoDB.newSession();
  try {
    var published;
    await session.withTransaction(async () => {
      try {
        [_, published] = await publishField(uuid, session, last_update, user);
      } catch(err) {
        await session.abortTransaction();
        throw err;
      }
    });
    if (!published) {
      throw new Util.InputError('No changes to publish');
    }
    session.endSession();
  } catch(err) {
    session.endSession();
    throw err;
  }
}

exports.latestPublished = async function(uuid, user) {
  return await latestPublishedBeforeDateWithPermissions(uuid, new Date(), user)
}

exports.latestPublishedBeforeDate = latestPublishedBeforeDateWithPermissions;

exports.draftDelete = async function(uuid, user) {
  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  let field = await SharedFunctions.draft(TemplateField, uuid);
  if(!field) {
    throw new Util.NotFoundError();
  }

  // user must have edit access to see this endpoint
  if (!await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT)) {
    throw new Util.PermissionDeniedError();
  }

  let response = await TemplateField.deleteMany({ uuid, publish_date: {'$exists': false} });
  if (response.deletedCount > 1) {
    console.error(`template field draftDelete: Template Field with uuid '${uuid}' had more than one draft to delete.`);
  }
}

exports.lastUpdate = async function(uuid, user) {
  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  let field_draft = await SharedFunctions.draft(TemplateField, uuid);
  let field_published = await latestPublished(uuid);
  let edit_permission = await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT);
  let view_permission = await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_VIEW);

  // Get the lat update for the draft if the user has permission to the draft. Otherwise, the last published.
  if(!field_draft) {
    if(!field_published) {
      throw new Util.NotFoundError(`No template field exists with uuid ${uuid}`);
    }
    if(!view_permission) {
      throw new Util.PermissionDeniedError(`field ${uuid}: no draft exists and do not have view permissions for published`);
    }
    return field_published.updated_at;
  }

  if(!edit_permission) {
    if(!field_published) {
      throw new Util.PermissionDeniedError(`field ${uuid}: do not permissions for draft, and no published version exists`);
    }
    if(!view_permission) {
      throw new Util.PermissionDeniedError(`field ${uuid}: do not have view or edit permissions`);
    }
    return field_published.updated_at;
  }

  return field_draft.updated_at;
}

exports.duplicate = async function(field, user, session) {
  // 1. Error checking
  if(!field) {
    throw new Util.NotFoundError();
  }
  if(!(await SharedFunctions.userHasAccessToPublishedResource(field, user, PermissionGroupModel))) {
    throw new Util.PermissionDeniedError();
  }

  // 2. Create new everything copying the original field, but make it a draft and create a new uuid
  field.duplicated_from = field.uuid;
  field.uuid = uuidv4();
  delete field._id;
  delete field.updated_at;
  delete field.publish_date;
  delete field.public_date;
  await PermissionGroupModel.initialize_permissions_for(user, field.uuid, session);

  // 3. Actually create everything
  field.updated_at = (new Date()).toISOString();
  let response = await TemplateField.insertOne(
    field, 
    {session}
  );
  if (response.insertedCount != 1) {
    throw new Error(`TemplateField.duplicate: Failed to insert duplicate of ${field.uuid}`);
  } 
  return field.uuid;
}

exports.findOptionValue = findOptionValue;

exports.importField = async function(field, user, session) {
  if(!Util.isObject(field)) {
    throw new Util.InputError('Field to import must be a json object.');
  }
  if(!field.template_field_uuid || typeof(field.template_field_uuid) !== 'string') {
    throw new Util.InputError('Field provided to import must have a template_field_uuid, which is a string.');
  }
  // Now get the matching uuid for the imported uuid
  let uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(field.template_field_uuid, session);
  // If the uuid is found, then this has already been imported. Import again if we have edit permissions
  if(uuid) {
    if(!PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT, session)) {
      throw new Util.PermissionDeniedError(`You do not have edit permissions required to import template field ${field.template_field_uuid}. It has already been imported.`);
    }
  } else {
    uuid = await LegacyUuidToNewUuidMapperModel.create_new_uuid_for_old(field.template_field_uuid, session);
    await PermissionGroupModel.initialize_permissions_for(user, uuid, session);
  }

  let new_field = await initializeNewImportedDraftWithProperties(field, uuid, session);

  // If this draft is identical to the latest published, delete it.
  let old_field = await fetchPublishedAndConvertToDraft(uuid);
  if (old_field) {
    let changes = !fieldEquals(new_field, old_field);
    if (!changes) {
      // Delete the current draft
      try {
        await draftDelete(uuid);
      } catch(err) {
        if (!(err instanceof Util.NotFoundError)) {
          throw err;
        }
      }
      return [false, uuid];
    }
  }

  let response = await TemplateField.updateOne(
    {"uuid": new_field.uuid, 'publish_date': {'$exists': false}}, 
    {$set: new_field}, 
    {'upsert': true, session}
  );
  if (response.upsertedCount != 1 && response.matchedCount != 1) {
    throw new Error(`TemplateField.importField: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
  } 
  return [true, uuid];
}