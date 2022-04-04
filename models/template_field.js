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

// Creates a draft from the persisted version.
function createDraftFromPersisted(persisted) {
  let draft = persisted;

  delete draft._id;
  draft.updated_at = draft.persist_date;
  delete draft.persist_date;

  return draft;
}

// Fetches the latest persisted field with the given uuid. 
async function latestPersistedBeforeDate(uuid, date, session) {
  let cursor = await TemplateField.find(
    {"uuid": uuid, 'persist_date': {'$lte': date}},
    {session}
  ).sort({'persist_date': -1})
  .limit(1);
  if (!(await cursor.hasNext())) {
    return null;
  }
  return await cursor.next();
}

// Fetches the latest persisted field with the given uuid. 
async function latestPersisted(uuid, session) {
  return await latestPersistedBeforeDate(uuid, new Date(), session);
}

async function latestPersistedBeforeDateWithPermissions(uuid, date, user) {
  let field = await latestPersistedBeforeDate(uuid, date);
  if(!field) {
    return null;
  }

  // Ensure user has permission to view
  if (!(await SharedFunctions.userHasAccessToPersistedResource(TemplateField, uuid, user, PermissionGroupModel))) {
    throw new Util.PermissionDeniedError(`Do not have permission to view template field with uuid ${uuid}`);
  }

  return field;
}

async function fetchPersistedAndConvertToDraft(uuid, session) {
  let persisted_field = await latestPersisted(uuid, session);
  if(!persisted_field) {
    return null;
  }

  return (await createDraftFromPersisted(persisted_field));
}

async function draftDelete(uuid) {

  let response = await TemplateField.deleteMany({ uuid, persist_date: {'$exists': false} });
  if (!response.deletedCount) {
    throw new Util.NotFoundError();
  }
  if (response.deletedCount > 1) {
    console.error(`templateDraftDelete: Template with uuid '${uuid}' had more than one draft to delete.`);
  }
}

function optionsEqual(options1, options2) {
  if(!options1 && !options2) {
    return true;
  }
  if(!(Array.isArray(options1) && Array.isArray(options2))) {
    return false;
  }
  if(options1.length != options2.length) {
    return false;
  }
  let options_2_map = {};
  for(let option of options2) {
    options_2_map[option.name] = option;
  }
  for(let option1 of options1) {
    if(!(option1.name in options_2_map)) {
      return false;
    }
    option2 = options_2_map[option1.name];
    if(option1.uuid != option2.uuid) {
      return false;
    }
    if(!optionsEqual(option1.options, option2.options)) {
      return false;
    }
  }
  return true;
}

function fieldEquals(field1, field2) {
  return field1.name == field2.name && 
          field1.description == field2.description && 
          field1.type == field2.type && 
          Util.datesEqual(field1.public_date, field2.public_date) &&
          optionsEqual(field1.options, field2.options);
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

function buildOptionMap(options, map) {
  for(let option of options) {
    if(option.uuid) {
      map[option.uuid] = option.name
    }
    if(option.options) {
      buildOptionMap(option.options, map);
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

function optionUuidsToValues(options, uuids) {
  // First build a map of uuid -> value
  // Then, for each uuid, attach an object with the uuids + values
  let uuid_to_value_map = {};
  buildOptionMap(options, uuid_to_value_map);

  let values = [];
  for(uuid of uuids) {
    if(!(uuid in uuid_to_value_map)) {
      throw new Util.InputError(`Option uuid ${uuid} is not an option uuid provided by the template`);
    }
    values.push({uuid, name: uuid_to_value_map[uuid]});
  }

  return values;
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
        throw new Util.InputError(`All radio options must include a radio option uuid unless it recurses to further radio options`);
      }
      // Map old radio option to new. If old has been seen before, that's an error
      let uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(radio_option.template_radio_option_uuid, session);
      if(!uuid) {
        uuid = await LegacyUuidToNewUuidMapperModel.create_new_uuid_for_old(radio_option.template_radio_option_uuid, session);
      }
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
  if (input_field.name) {
    if (typeof(input_field.name) !== 'string'){
      throw new Util.InputError('name property must be of type string');
    }
    output_field.name = input_field.name
  }
  if (input_field.description) {
    if (typeof(input_field.description) !== 'string'){
      throw new Util.InputError(`field description property (${input_field.description}) must be of type string.`);
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
  if(input_field.type && input_field.type == "file") {
    if(input_field.options) {
      throw new Util.InputError('Options are not supported for field type file');
    }
    output_field.type = "file";
  }
  if(input_field.options) {
    let latest_field = await SharedFunctions.latestDocument(TemplateField, uuid);
    let previous_options_uuids = new Set();
    if(latest_field && latest_field.options) {
      buildOptionSet(latest_field.options, previous_options_uuids);
    }
    output_field.options = parseOptions(input_field.options, previous_options_uuids, new Set());
  }
  let old_system_uuid = await LegacyUuidToNewUuidMapperModel.get_old_uuid_from_new(uuid);
  if(old_system_uuid) {
    output_field.old_system_uuid = old_system_uuid;
  }
  return output_field;
}

async function initializeNewImportedDraftWithProperties(input_field, uuid, updated_at, session) {
  let output_field = initializeNewDraftWithPropertiesSharedWithImport(input_field, uuid, updated_at);
  if (input_field._field_metadata && Util.isObject(input_field._field_metadata) && input_field._field_metadata._public_date) {
    if (Date.parse(input_field._field_metadata._public_date)){
      output_field.public_date = new Date(input_field.public_date);
    }
  }
  if(input_field.radio_options) {
    output_field.options = await importRadioOptions(input_field.radio_options, session);
  }
  output_field.old_system_uuid = input_field.template_field_uuid;
  return output_field;
}

// Updates the field with the given uuid if provided in the field object. 
// If no uuid is included in the field object., create a new field.
// Also validate input. 
// Return:
// 1. A boolean: true if there were changes from the last persisted.
// 2. The uuid of the template field created / updated
async function validateAndCreateOrUpdate(session, input_field, user, updated_at) {

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

  // If this draft is identical to the latest persisted, delete it.
  let old_field = await fetchPersistedAndConvertToDraft(uuid);
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
    {uuid, 'persist_date': {'$exists': false}}, 
    {$set: new_field}, 
    {'upsert': true, session}
  );
  if (response.upsertedCount != 1 && response.matchedCount != 1) {
    throw new Error(`TemplateField.validateAndCreateOrUpdateTemplateField: Modified: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
  } 
  return [true, uuid];
}

async function draftFetchOrCreate(session, uuid, user) {
  
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

  // If a draft of this template field does not exist, create a new template_field_draft from the last persisted
  template_field_draft = await latestPersisted(uuid, session);
  // If not even a persisted version of this template field was found, return null
  if(!template_field_draft) {
    return null;
  } else {
    // Make sure this user has a permission to be working with drafts
    if (!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT))) {
      throw new Util.PermissionDeniedError();
    }
  }

  // Remove the internal_id and persist_date
  delete template_field_draft._id;
  template_field_draft.updated_at = template_field_draft.persist_date;
  delete template_field_draft.persist_date;

  return template_field_draft;

}

// Persistes the field with the provided uuid
//   If a draft exists of the field, then:
//     if a last_update is provided, verify that it matches the last update in the db
//     if that draft has changes from the latest persisted:
//       persist it, and return the new internal_id
//     else: 
//       return the internal_id of the latest persisted
//   else:
//     return the internal_id of the latest_persisted
// Input: 
//   uuid: the uuid of a field to be persisted
//   session: the mongo session that must be used to make transactions atomic
//   last_update: the timestamp of the last known update by the user. Cannot persist if the actual last update and that expected by the user differ.
//   user: username of the user performing this operation
// Returns:
//   internal_id: the internal id of the persisted field
async function persistField(session, uuid, last_update, user) {
  var return_id;

  let field_draft = await SharedFunctions.draft(TemplateField, uuid, session);
  let last_persisted = await latestPersisted(uuid, session);

  // Check if a draft with this uuid exists
  if(!field_draft) {
    if(last_persisted) {
      throw new Util.InputError('No changes to persist');
    } else {
      throw new Util.NotFoundError(`Field with uuid ${uuid} does not exist`);
    }
  }

  // if the user doesn't have edit permissions, throw a permission denied error
  let has_permission = await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT, session);
  if(!has_permission) {
    throw new Util.PermissionDeniedError();
  }

  if (last_update) {
    // If the last update provided doesn't match to the last update found in the db, fail.
    let db_last_update = new Date(field_draft.updated_at);
    if(last_update.getTime() != db_last_update.getTime()) {
      throw new Util.InputError(`The last update submitted ${last_update.toISOString()} does not match that found in the db ${db_last_update.toISOString()}. 
      Fetch the draft again to get the latest update before attempting to persist again.`);
    }
  }

  // If there are changes, persist the current draft
  let persist_time = new Date();
  let response = await TemplateField.updateOne(
    {"_id": field_draft._id},
    {'$set': {'updated_at': persist_time, 'persist_date': persist_time}},
    {session}
  )
  if (response.modifiedCount != 1) {
    throw new Error(`TemplateField.persistField: should be 1 updated document. Instead: ${response.modifiedCount}`);
  }
  return_id = field_draft._id;
  return return_id;
}

async function lastupdateFor(uuid, session) {
  let draft = await draftFetchOrCreate(session, uuid);
  if(!draft) {
    throw new Util.NotFoundError();
  }
  return draft.updated_at;
}

exports.collection = collection;
exports.validateAndCreateOrUpdate = validateAndCreateOrUpdate;
exports.persistField = persistField;
exports.draft = draftFetchOrCreate;
exports.lastupdateFor = lastupdateFor;
exports.latestPersistedWithoutPermissions = latestPersisted;

// Wraps the request to create with a transaction
exports.create = async function(field, user) {
  let inserted_uuid;
  [_, inserted_uuid] = await SharedFunctions.executeWithTransaction(validateAndCreateOrUpdate, field, user, new Date());
  return inserted_uuid;
}

// Wraps the request to get with a transaction. Since fetching a draft creates one if it doesn't already exist
exports.draftGet = async function(uuid, user) {
  let field = await SharedFunctions.executeWithTransaction(draftFetchOrCreate, uuid, user);
  return field;
}

// Wraps the request to update with a transaction
exports.update = async function(field, user) {
  await SharedFunctions.executeWithTransaction(validateAndCreateOrUpdate, field, user, new Date());
}

// Wraps the request to persist with a transaction
exports.persist = async function(uuid, last_update, user) {
  await SharedFunctions.executeWithTransaction(persistField, uuid, last_update, user);
}

exports.latestPersisted = async function(uuid, user) {
  return await latestPersistedBeforeDateWithPermissions(uuid, new Date(), user)
}

exports.latestPersistedBeforeDate = latestPersistedBeforeDateWithPermissions;

exports.draftDelete = async function(uuid, user) {

  let field = await SharedFunctions.draft(TemplateField, uuid);
  if(!field) {
    throw new Util.NotFoundError();
  }

  // user must have edit access to see this endpoint
  if (!await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT)) {
    throw new Util.PermissionDeniedError();
  }

  let response = await TemplateField.deleteMany({ uuid, persist_date: {'$exists': false} });
  if (response.deletedCount > 1) {
    console.error(`template field draftDelete: Template Field with uuid '${uuid}' had more than one draft to delete.`);
  }
}

exports.lastUpdate = async function(uuid, user, session) {

  let field_draft = await SharedFunctions.draft(TemplateField, uuid, session);
  let field_persisted = await latestPersisted(uuid, session);
  let edit_permission = await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT, session);
  let view_permission = await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_VIEW, session);

  // Get the lat update for the draft if the user has permission to the draft. Otherwise, the last persisted.
  if(!field_draft) {
    if(!field_persisted) {
      throw new Util.NotFoundError(`No template field exists with uuid ${uuid}`);
    }
    if(!view_permission) {
      throw new Util.PermissionDeniedError(`field ${uuid}: no draft exists and do not have view permissions for persisted`);
    }
    return field_persisted.updated_at;
  }

  if(!edit_permission) {
    if(!field_persisted) {
      throw new Util.PermissionDeniedError(`field ${uuid}: do not permissions for draft, and no persisted version exists`);
    }
    if(!view_permission) {
      throw new Util.PermissionDeniedError(`field ${uuid}: do not have view or edit permissions`);
    }
    return field_persisted.updated_at;
  }

  return field_draft.updated_at;
}

exports.draftExisting = async function(uuid) {
  return (await SharedFunctions.draft(TemplateField, uuid)) ? true : false;
}

exports.duplicate = async function(field, user, session) {
  // 1. Error checking
  if(!field) {
    throw new Util.NotFoundError();
  }
  if(!(await SharedFunctions.userHasAccessToPersistedResource(TemplateField, field.uuid, user, PermissionGroupModel))) {
    throw new Util.PermissionDeniedError();
  }

  // 2. Create new everything copying the original field, but make it a draft and create a new uuid
  field.duplicated_from = field.uuid;
  field.uuid = uuidv4();
  delete field._id;
  delete field.updated_at;
  delete field.persist_date;
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

exports.optionUuidsToValues = optionUuidsToValues;

exports.importField = async function(field, user, updated_at, session) {
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

  let new_field = await initializeNewImportedDraftWithProperties(field, uuid, updated_at, session);

  // If this draft is identical to the latest persisted, delete it.
  let old_field = await fetchPersistedAndConvertToDraft(uuid);
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
    {"uuid": new_field.uuid, 'persist_date': {'$exists': false}}, 
    {$set: new_field}, 
    {'upsert': true, session}
  );
  if (response.upsertedCount != 1 && response.matchedCount != 1) {
    throw new Error(`TemplateField.importField: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
  } 
  return [true, uuid];
}