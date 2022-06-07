const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');
const TemplateFieldModel = require('./template_field');
const TemplateModel = require('./template');
const DatasetModel = require('./dataset');
const UserPermissionsModel = require('./user_permissions');
const PermissionGroupModel = require('./permission_group');
const SharedFunctions = require('./shared_functions');
const LegacyUuidToNewUuidMapperModel = require('./legacy_uuid_to_new_uuid_mapper');
const FileModel = require('./file');
const FieldTypes = TemplateFieldModel.FieldTypes;

const Schema = Object.freeze({
  bsonType: "object",
  required: [ "_id", "uuid", "updated_at", "related_records" ],
  properties: {
    _id: {
      bsonType: "objectId",
      description: "identifies a specific version of the record with this uuid"
    },
    uuid: {
      bsonType: "string",
      description: "identifies the record, but the uuid is common between all versions of said record"
      // uuid should be in a valid uuid format as well
    },
    dataset_uuid: {
      bsonType: "string",
      description: "identifies the dataset this record belongs to. Only used for the record draft"
    },
    dataset_id: {
      bsonType: "objectId",
      description: "identifies the dataset this record belongs to. Only used for a persisted record"
    },
    updated_at: {
      bsonType: "date",
      description: "identifies the last update for this version of this record"
    },
    persist_date: {
      bsonType: "date",
      description: "if persisted, identifies the time of persistance for this version of this record"
    },
    old_system_uuid: {
      bsonType: "string",
      description: "the uuid of this record as imported from the legacy system"
    },
    related_records: {
      bsonType: "array",
      description: "records this record links to",
      uniqueItems: true
    },
    fields: {
      bsonType: "array",
      description: "fields this record includes",
      items: {
        bsonType: "object",
        required: [ "uuid" ],
        properties: {
          uuid: {
            bsonType: "string"
          },
          name: {
            bsonType: "string"
          },
          description: {
            bsonType: "string"
          },
          type: {
            enum: Object.values(TemplateFieldModel.FieldTypes)
          },
          file: {
            bsonType: "object",
            required: [ "uuid" ],
            properties: {
              uuid: {
                bsonType: "string"
              },
              name: {
                bsonType: "string"
              },
              import_url: {
                bsonType: "string"
              }
            },
            additionalProperties: false
          },
          images: {
            bsonType: "array",
            uniqueItems: true,
            items: {
              bsonType: "object",
              required: [ "uuid", "name" ],
              properties: {
                uuid: {
                  bsonType: "string"
                },
                name: {
                  bsonType: "string"
                },
                import_url: {
                  bsonType: "string"
                }
              },
              additionalProperties: false
            }
          },
          values: {
            bsonType: "array"
          },
          value: {
            description: "the value provided by the user for this field"
          }
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
});

var Record;

// Returns a reference to the record Mongo Collection
async function collection() {
  if (Record === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('records', {validator: { $jsonSchema: Schema} });
    } catch(e) {}
    Record = db.collection('records');
  }
  return Record;
}

exports.init = async function() {
  Record = await collection();
}

function fieldsEqual(fields1, fields2) {
  if(!Array.isArray(fields1) || !Array.isArray(fields2)) {
    throw new Error(`fieldsEqual: did not provide 2 valid arrays`);
  }
  if(fields1.length != fields2.length) {
    return false;
  }

  // Don't need to check fields changing order because the record always preserves the field order of the template fields
  for(let i = 0; i < fields1.length; i++) {
    let field1 = fields1[i];
    let field2 = fields2[i];
    if (field1.name != field2.name || field1.description != field2.description || field1.type != field2.type) {
      return false;
    }
    const sortArrayByUuidProperty = (o1, o2) => {
      let n1 = o1.uuid;
      let n2 = o2.uuid;
      if(n1 < n2) {
        return -1;
      }
      if(n1 > n2) {
        return 1;
      }
      return 0;
    }
    if(field1.type == FieldTypes.File) {
      let file1 = field1.file;
      let file2 = field2.file;
      if(file1.uuid != file2.uuid || file1.name != file2.name) {
        return false;
      } 
    } else if(field1.type == FieldTypes.Image) {
      if(!Array.isArray(field1.images) || !Array.isArray(field2.images)) {
        throw new Error(`fieldsEqual: did not provide 2 valid image arrays`);
      }
      if(field1.images.length != field2.images.length) {
        return false;
      }
      field1.images.sort(sortArrayByUuidProperty);
      field2.images.sort(sortArrayByUuidProperty);
      for(let j = 0; j < field1.images.length; j++) {
        let image1 = field1.images[i];
        let image2 = field2.images[i];
        if(image1.uuid != image2.uuid || image1.name != image2.name) {
          return false;
        } 
      }
    } else if (field1.values) {
      if(field1.values.length != field2.values.length) {
        return false;
      }
      field1.values.sort(sortArrayByUuidProperty);
      field2.values.sort(sortArrayByUuidProperty);
      for(let j = 0; j < field1.values.length; j++) {
        if(field1.values[j].uuid != field2.values[j].uuid) {
          return false;
        } 
      }
    } else {
      if(field1.value != field2.value) {
        return false;
      }
    }

  }
  return true;
}

// Creates a draft from the persisted version.
async function createDraftFromPersisted(persisted, session) {

  // Create a copy of persisted
  let draft = Object.assign({}, persisted);

  delete draft._id;
  draft.updated_at = draft.persist_date;
  delete draft.persist_date;
  draft.dataset_uuid = await SharedFunctions.uuidFor_id(DatasetModel.collection(), draft.dataset_id, session);
  delete draft.dataset_id;

  // Replace each of the related_record _ids with uuids. 
  let related_records = [];
  for(_id of persisted.related_records) {
    let uuid = await SharedFunctions.uuidFor_id(Record, _id, session);
    if(uuid) {
      related_records.push(uuid);
    } else {
      console.log(`Failed to find a record with internal id ${_id}. Therefore, removing the reference to it from record with uuid ${draft.uuid}`);
    }
  }
  draft.related_records = related_records;

  return draft;

}

// Fetches a record draft 
// If it does not exist, it creates a draft from the latest persisted.
// Does not lookup related_records
async function fetchDraftOrCreateFromPersisted(uuid, session) {
  let record_draft = await SharedFunctions.draft(Record, uuid, session);
  if(record_draft) {
    return record_draft;
  }

  let persisted_record = await SharedFunctions.latestPersisted(Record, uuid, session);
  if(!persisted_record) {
    return null;
  }
  record_draft = await createDraftFromPersisted(persisted_record, session);

  return record_draft;
}

function draftsEqual(draft1, draft2) {
  return draft1.uuid == draft2.uuid &&
         draft1.dataset_uuid == draft2.dataset_uuid &&
         Util.datesEqual(draft1.public_date, draft2.public_date) &&
         fieldsEqual(draft1.fields, draft2.fields) &&
         Util.arrayEqual(draft1.related_records, draft2.related_records);
}

// Returns true if the draft has any changes from it's previous persisted version
async function draftDifferentFromLastPersisted(draft) {
  // If there is no persisted version, obviously there are changes
  let latest_persisted = await SharedFunctions.latestPersisted(Record, draft.uuid);
  if(!latest_persisted) {
    return true;
  }

  // If the properties have changed since the last persisting
  let latest_persisted_as_draft = await createDraftFromPersisted(latest_persisted);
  if (!draftsEqual(draft, latest_persisted_as_draft)) {
    return true;
  }

  // if the dataset version has changed since this record was last persisted
  let latest_dataset_id = await SharedFunctions.latest_persisted_id_for_uuid(DatasetModel.collection(), latest_persisted_as_draft.dataset_uuid);
  if(!latest_persisted.dataset_id.equals(latest_dataset_id)) {
    return true;
  }

  // Finally, if any of the dependencies have been persisted more recently than this record, then there are changes
  for(let related_record of draft.related_records) {
    let related_record_last_persisted = (await SharedFunctions.latestPersisted(Record, related_record)).persist_date;
    if (Util.compareTimeStamp(related_record_last_persisted, latest_persisted.persist_date) > 0) {
      return true;
    }
  }

  return false;
}

async function createOutputFileFromInputFile(input_file, record_uuid, field_uuid, session) {
  let output_file = {};
  if(!Util.isObject(input_file)) {
    throw new Util.InputError(`Each file/image supplied in record field must be an object`);
  }
  if(input_file.uuid == 'new') {
    // newFile should only ever be called right here, and with the transaction session
    // Therefore, if record changes fail, file changes should be deleted
    // This works for import as well, since import also needs to upload the files separately (since they can be huge)
    output_file.uuid = await FileModel.newFile(record_uuid, field_uuid, session);
    // Next 2 if cases refer to import
    if(input_file.import_url) {
      output_file.import_url = input_file.import_url;
    }
    if(input_file.import_uuid) {
      await LegacyUuidToNewUuidMapperModel.create_document_with_old_and_new(input_file.import_uuid, output_file.uuid, session);
    }
  } else {
    let file_uuid = input_file.uuid;
    if(!await FileModel.existsWithParams(file_uuid, record_uuid, field_uuid, session)) {
      throw new Util.InputError(`Record ${record_uuid} cannot attach file/image ${file_uuid} for field ${field_uuid}. 
      Either this file/image does not exist or it belongs to a different record+field.`);
    }
    output_file.uuid = file_uuid;
  }
  if(input_file.name) {
    output_file.name = input_file.name;
  }
  return output_file;
}

async function createRecordFieldsFromTemplateFieldsAndMap(template_fields, record_field_map, record_uuid, session) {
  let result_fields = [];

  for (let field of template_fields) {
    let field_uuid = field.uuid;
    let field_object = {
      uuid: field_uuid,
      name: field.name,
      description: field.description,
    };
    let record_field_data = record_field_map[field_uuid];
    if(field.type && field.type == TemplateFieldModel.FieldTypes.File) {
      field_object.type = TemplateFieldModel.FieldTypes.File;
      if(record_field_data) {
        // Convert import format to standard format
        if(!record_field_data.file && record_field_data.files && record_field_data.files.length > 0) {
          record_field_data.file = record_field_data.files[0];
        }
        if(record_field_data.file) {
          field_object.file = await createOutputFileFromInputFile(record_field_data.file, record_uuid, field_uuid, session);
        }
      } 
    } else if(field.type && field.type == TemplateFieldModel.FieldTypes.Image) {
      field_object.type = TemplateFieldModel.FieldTypes.Image;
      if(record_field_data) {
        // Convert import format to standard format
        if(!record_field_data.images && record_field_data.files) {
          record_field_data.images = record_field_data.files;
        }
        if(record_field_data.images) {
          let input_images = record_field_data.images;
          if(!Array.isArray(input_images)) {
            throw new Util.InputError(`images property in record field must be an array`);
          }
          let output_images = [];
          field_object.images = output_images;
          for(let input_image of input_images) {
            output_images.push(await createOutputFileFromInputFile(input_image, record_uuid, field_uuid, session));
          }
        }
      } 
    } else if(field.options) {
      if(record_field_data && record_field_data.option_uuids) {
        field_object.values = TemplateFieldModel.optionUuidsToValues(field.options, record_field_data.option_uuids);
      } else {
        field_object.values = [];
      }
    } else {
      if(record_field_data) {
        field_object.value = record_field_data.value;
      }
    }

    result_fields.push(field_object);
  }

  // Any file uuids that were in the old record fields but aren't anymore need to be deleted
  let previous_record_draft = await SharedFunctions.draft(Record, record_uuid, session);
  if(previous_record_draft) {
    await deleteLostFiles(previous_record_draft.fields, result_fields, session);
  }

  return result_fields;
}

async function deleteDraftFiles(draft) {
  let file_uuids = [];
  for(let field of draft.fields) {
    if(field.file) {
      file_uuids.push(field.file.uuid);
    }
    if(field.images) {
      for(let image of field.images) {
        file_uuids.push(image.uuid);
      }
    }
  }
  try {
    await deleteFilesWithUUids(file_uuids);
  } catch(err) {
    console.log(`deleteDraftFiles: failed with err: ${err}`);
  }
}

// For each lost file, try to delete it. Of course, if it hasn't been persisted, it won't work
async function deleteFilesWithUUids(file_uuids, session) {
  for(let file_uuid of file_uuids) {
    try{
      await FileModel.delete(file_uuid, session);
    } catch(err) {
      if(err instanceof Util.InputError || err instanceof Util.NotFoundError) {
        ;
      } else {
        throw err;
      }
    }
  }
}

async function deleteLostFiles(old_fields, new_fields, session) {
  // First find the file uuids that have been lost
  let old_file_uuids = new Set();
  for(let field of old_fields) {
    if(field.type && field.type == FieldTypes.File && field.file) {
      old_file_uuids.add(field.file.uuid);
    }
    if(field.type && field.type == FieldTypes.Image && field.images) {
      for(let image of field.images) {
        old_file_uuids.add(image.uuid);
      }
    }
  }
  let new_file_uuids = new Set();
  for(let field of new_fields) {
    if(field.type && field.type == FieldTypes.File && field.file) {
      new_file_uuids.add(field.file.uuid);
    }
    if(field.type && field.type == FieldTypes.Image && field.images) {
      for(let image of field.images) {
        old_file_uuids.add(image.uuid);
      }
    }
  }

  // set difference
  let lost_file_uuids = [...old_file_uuids].filter(x => !new_file_uuids.has(x));
  
  // then delete them
  await deleteFilesWithUUids(lost_file_uuids, session);

}

async function createRecordFieldsFromInputRecordAndTemplate(record_fields, template_fields, record_uuid, session) {
  if(!record_fields) {
    record_fields = [];
  }
  if (!Array.isArray(record_fields)){
    throw new Util.InputError('fields property must be of type array');
  }
  // Create a map of records to fields
  let record_field_map = {};
  for (let field of record_fields) {
    if(!Util.isObject(field)) {
      throw new Util.InputError(`Each field in the record must be a json object`);
    }
    if(!field.uuid) {
      throw new Util.InputError(`Each field in the record must supply a template_field uuid`);
    }
    if (record_field_map[field.uuid]) {
      throw new Util.InputError(`A record can only supply a single value for each field`);
    }
    let record_field_data = {};
    if(field.value) {
      record_field_data.value = field.value;
    }
    if(field.file) {
      record_field_data.file = field.file;
    }
    if(field.images) {
      record_field_data.images = field.images;
    }
    if(field.values) {
      record_field_data.option_uuids = field.values.map(obj => obj.uuid);
    }
    record_field_map[field.uuid] = record_field_data;
  }

  let result_fields = await createRecordFieldsFromTemplateFieldsAndMap(template_fields, record_field_map, record_uuid, session);

  return result_fields;
}

// For each field, converts import record to the format of a normal input record, 
// then calls a function which creates a new record from field + record
async function createRecordFieldsFromImportRecordAndTemplate(record_fields, template_fields, record_uuid, session) {
  // Fields are a bit more complicated
  if(!record_fields) {
    record_fields = [];
  }
  if (!Array.isArray(record_fields)){
    throw new Util.InputError('fields property must be of type array');
  }
  // Create a map of records to fields
  let record_field_map = {};
  for (let field of record_fields) {
    if(!Util.isObject(field)) {
      throw new Util.InputError(`Each field in the record must be a json object`);
    }
    let old_field_uuid = field.field_uuid;
    if(!old_field_uuid) {
      old_field_uuid = field.template_field_uuid;
    }
    if(!old_field_uuid) {
      throw new Util.InputError(`Each field in the record must supply a field_uuid/template_field_uuid`);
    }
    let field_uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(old_field_uuid, session);
    if (record_field_map[field_uuid]) {
      throw new Util.InputError(`A record can only supply a single value for each field`);
    }
    let record_field_data = {value: field.value};
    if(field.files) {
      record_field_data.files = [];
      for(let input_file of field.files) {
        let output_file = {};
        let old_file_uuid = input_file.file_uuid;
        let new_file_uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(old_file_uuid, session);
        if(new_file_uuid) {
          output_file.uuid = new_file_uuid;
        } else {
          output_file.uuid = "new";
          output_file.import_uuid = old_file_uuid;
        }
        output_file.import_url = input_file.href;
        output_file.name = input_file.original_name;
        record_field_data.files.push(output_file);
      }
    } 
    if(field.value && Array.isArray(field.value)) {
      record_field_data.option_uuids = 
        await Promise.all(
          field.value.map(obj => 
            LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(obj.template_radio_option_uuid)
          )
        );
    }
    record_field_map[field_uuid] = record_field_data;
  }

  return await createRecordFieldsFromTemplateFieldsAndMap(template_fields, record_field_map, record_uuid, session);
}

// TODO: the number of parameters is getting out of hand. Can I make something object-oriented, so I don't hve to pass the session and user all the way through?
async function extractRelatedRecordsFromCreateOrUpdate(input_related_records, related_datasets, template, user, session, updated_at, seen_uuids) {
  let return_records = [];
  let changes = false;
  // Recurse into related_records
  if(!input_related_records) {
    input_related_records = [];
  }
  if (!Array.isArray(input_related_records)){
    throw new Util.InputError('related_records property must be of type array');
  }
  // Requirements:
  // - related_records is a set, so there can't be any duplicates
  // - Every related_record must point to a related_dataset supported by the dataset
  // Plan: Create a dataset_uuid to dataset map. At the end, check related_records for duplicates
  let related_dataset_map = {};
  for (let related_dataset of related_datasets) {
    related_dataset_map[related_dataset.uuid] = related_dataset;
  }
  let related_template_map = {};
  for (let related_template of template.related_templates) {
    related_template_map[related_template._id.toString()] = related_template;
  }
  for(let subscribed_template of template.subscribed_templates) {
    related_template_map[subscribed_template._id.toString()] = subscribed_template;
  }
  for (let related_record of input_related_records) {
    if(!Util.isObject(related_record)) {
      throw new Util.InputError(`Each related_record in the record must be a json object`);
    }
    if(!related_record.dataset_uuid) {
      throw new Util.InputError(`Each related_record in the record must supply a dataset_uuid`);
    }
    if(!(related_record.dataset_uuid in related_dataset_map)) {
      throw new Util.InputError(`Each related_record in the record must link to a related_dataset supported by the dataset`);
    } 
    let related_dataset = related_dataset_map[related_record.dataset_uuid];
    let related_template = related_template_map[related_dataset.template_id];
    try {
      let new_changes;
      [new_changes, related_record] = await validateAndCreateOrUpdateRecurser(related_record, related_dataset, related_template, user, session, updated_at, seen_uuids);
      changes = changes || new_changes;
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError(err.message);
      } else if (err instanceof Util.PermissionDeniedError) {
        // If we don't have admin permissions to the related_record, don't try to update/create it. Just link it
        related_record = related_record.uuid;
      } else {
        throw err;
      }
    }
    // After validating and updating the related_record, replace the related_record with a uuid reference
    return_records.push(related_record);
  }
  // Related_records is really a set, not a list. But Mongo doesn't store sets well, so have to manage it ourselves.
  if(Util.anyDuplicateInArray(return_records)) {
    throw new Util.InputError(`Each record may only have one instance of every related_record.`);
  }
  return [return_records, changes];
}

// A recursive helper for validateAndCreateOrUpdate.
async function validateAndCreateOrUpdateRecurser(input_record, dataset, template, user, session, updated_at, seen_uuids) {

  // Record must be an object or valid uuid
  if (!Util.isObject(input_record)) {
    throw new Util.InputError(`record provided is not an object: ${input_record}`);
  }

  let uuid;
  // If a record uuid is provided, this is an update
  if (input_record.uuid) {
    // Record must have a valid uuid. 
    if (!uuidValidate(input_record.uuid)) {
      throw new Util.InputError("each record must have a valid uuid property");
    }
    
    // Record uuid must exist
    if (!(await SharedFunctions.exists(Record, input_record.uuid, session))) {
      throw new Util.NotFoundError(`No record exists with uuid ${input_record.uuid}`);
    }

    uuid = input_record.uuid;
  }
  // Otherwise, this is a create, so generate a new uuid
  else {
    uuid = uuidv4();
  }

  // verify that this user is in the 'edit' permission group
  if (!(await UserPermissionsModel.has_permission(user, dataset.uuid, PermissionGroupModel.PermissionTypes.edit))) {
    throw new Util.PermissionDeniedError(`Do not have edit permissions required to create/update records in dataset ${dataset.uuid}`);
  }

  // each record only updates once per update, even if it shows up multiple times in the json input
  if(seen_uuids.has(uuid)) {
    return [false, uuid];
  } else {
    seen_uuids.add(uuid);
  }
  
  // Make sure no record switches datasets
  let latest_persisted_record = await SharedFunctions.latestPersisted(Record, uuid, session);
  if (latest_persisted_record) {
    if(input_record.dataset_uuid != latest_persisted_record.dataset_uuid) {
      throw new Util.InputError(`Record ${uuid} expected dataset ${latest_persisted_record.dataset_uuid}, but received ${input_record.dataset_uuid}. Once a record is persisted, it's dataset may never be changed.`);
    }
  }

  // Verify that the dataset uuid specified by the record matches the dataset uuid of the dataset
  if(input_record.dataset_uuid != dataset.uuid) {
    throw new Util.InputError(`The dataset uuid provided by the record: ${input_record.dataset_uuid} does not correspond to the dataset uuid expected by the dataset: ${dataset.uuid}`);
  }

  // Now process the record data provided
  let new_record = {
    uuid,
    dataset_uuid: input_record.dataset_uuid,
    updated_at,
    related_records: []
  };

  if (input_record.public_date) {
    if (!Date.parse(input_record.public_date)){
      throw new Util.InputError('record public_date property must be in valid date format');
    }
    new_record.public_date = new Date(input_record.public_date);
  }

  let old_system_uuid = await LegacyUuidToNewUuidMapperModel.get_old_uuid_from_new(uuid);
  if(old_system_uuid) {
    new_record.old_system_uuid = old_system_uuid;
  }

  new_record.fields = await createRecordFieldsFromInputRecordAndTemplate(input_record.fields, template.fields, uuid, session);

  // Need to determine if this draft is any different from the persisted one.
  let changes;

  [new_record.related_records, changes] = await extractRelatedRecordsFromCreateOrUpdate(input_record.related_records, dataset.related_datasets, template, user, session, updated_at, seen_uuids);

  // If this draft is identical to the latest persisted, delete it.
  // The reason to do so is so when a change is submitted, we won't create drafts of sub-records.
  if (!changes) {
    changes = await draftDifferentFromLastPersisted(new_record);
    if (!changes) {
      // Delete the current draft
      try {
        await SharedFunctions.draftDelete(Record, uuid);
      } catch (err) {
        if (!(err instanceof Util.NotFoundError)) {
          throw err;
        }
      }
      return [false, uuid];
    }
  }

  // If a draft of this record already exists: overwrite it, using it's same uuid
  // If a draft of this record doesn't exist: create a new draft
  // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
  let response = await Record.updateOne(
    {uuid, 'persist_date': {'$exists': false}}, 
    {$set: new_record}, 
    {'upsert': true, session}
  );
  if (response.upsertedCount != 1 && response.matchedCount != 1) {
    throw new Error(`Record.validateAndCreateOrUpdate: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
  } 

  // If successfull, return the uuid of the created / updated record
  return [true, uuid];

}

// If a uuid is provided, update the record with the provided uuid.
// Otherwise, create a new record.
// If the updated record is the same as the last persisted, delete the draft instead of updating. 
// In both cases, validate the given record as well, making sure it adheres to the latest public template
// Return:
// 1. A boolean indicating true if there were changes from the last persisted.
// 2. The uuid of the record created / updated
async function validateAndCreateOrUpdate(session, record, user) {

  // Record must be an object
  if (!Util.isObject(record)) {
    throw new Util.InputError(`record provided is not an object: ${record}`);
  }

  let dataset;
  try {
    dataset = await DatasetModel.latestPersistedWithoutPermissions(record.dataset_uuid);
  } catch(error) {
    if(error instanceof Util.NotFoundError || error instanceof Util.InputError) {
      throw new Util.InputError(`a valid dataset_uuid was not provided for record ${record.uuid}`);
    } else {
      throw error;
    }
  }
  let template = await TemplateModel.persistedByIdWithoutPermissions(SharedFunctions.convertToMongoId(dataset.template_id));

  let updated_at = new Date();

  return await validateAndCreateOrUpdateRecurser(record, dataset, template, user, session, updated_at, new Set());

}

// Fetches the record draft with the given uuid, recursively looking up related_records.
// If a draft of a given template doesn't exist, a new one will be generated using the last persisted record.
async function draftFetchOrCreate(uuid, user, session) {

  // See if a draft of this template exists. 
  let record_draft = await fetchDraftOrCreateFromPersisted(uuid, session);
  if (!record_draft) {
    return null;
  }

  // Make sure this user has a permission to be working with drafts
  if (!(await UserPermissionsModel.has_permission(user, record_draft.dataset_uuid, PermissionGroupModel.PermissionTypes.edit, session))) {
    throw new Util.PermissionDeniedError(`You do not have the edit permissions required to view draft ${uuid}`);
  }

  // Now recurse into each related_record, replacing each uuid with an imbedded object
  let related_records = [];
  for(let i = 0; i < record_draft.related_records.length; i++) {
    let related_record;
    try{
      related_record = await draftFetchOrCreate(record_draft.related_records[i], user, session);
    } catch (err) {
      if (err instanceof Util.PermissionDeniedError) {
        // If we don't have permission for the draft, get the latest persisted instead
        try {
          related_record = await latestPersistedWithJoinsAndPermissions(record_draft.related_records[i], user, session)
        } catch (err) {
          if (err instanceof Util.PermissionDeniedError || err instanceof Util.NotFoundError) {
            // If we don't have permission for the persisted version, or a persisted version doesn't exist, just attach a uuid and a flag marking no_permissions
            related_record = await fetchDraftOrCreateFromPersisted(record_draft.related_records[i], session);
            related_record = {uuid: related_record.uuid, dataset_uuid: related_record.dataset_uuid, no_permissions: true};
          } 
          else {
            throw err;
          }
        }
      } else {
        throw err;
      }
    }
    if (!related_record) {
      related_record = {uuid: record_draft.related_records[i], deleted: true};
    } 
    related_records.push(related_record);
  }

  record_draft.related_records = related_records;
  delete record_draft._id;
  delete record_draft.dataset_id;

  return record_draft;

}

async function persistRelatedRecords(related_record_uuids, related_datasets, template, user, session, last_persisted_time) {
  let return_record_ids = [];
  // For each records's related_records, persist that related_record, then replace the uuid with the internal_id.
  // It is possible there weren't any changes to persist, so keep track of whether we actually persisted anything.
  // Requirements: 
  // - Each related_record must point to a related_dataset supported by the dataset
  let related_dataset_map = {};
  for (let related_dataset of related_datasets) {
    related_dataset_map[related_dataset.uuid] = related_dataset;
  }
  let related_template_map = {};
  for (let related_template of template.related_templates) {
    related_template_map[related_template._id.toString()] = related_template;
  }
  for(let subscribed_template of template.subscribed_templates) {
    related_template_map[subscribed_template._id.toString()] = subscribed_template;
  }
  for(let related_record_uuid of related_record_uuids) {
    let related_record_document = await SharedFunctions.latestDocument(Record, related_record_uuid);
    if(!related_record_document) {
      throw new Util.InputError(`Cannut persist record. One of it's related_references does not exist and was probably deleted after creation.`);
    }
    let related_dataset = related_dataset_map[related_record_document.dataset_uuid];
    if(!related_dataset) {
      throw new Util.InputError(`Cannot persist related_record pointing to related_dataset not supported by the dataset. 
      Dataset may have been persisted since last record update.`);
    }
    let related_template = related_template_map[related_dataset.template_id.toString()];
    try {
      let related_record_id = await persistRecurser(related_record_uuid, related_dataset, related_template, user, session);
      return_record_ids.push(related_record_id);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError(`Internal reference within this draft is invalid. Fetch/update draft to cleanse it.`);
      } else if (err instanceof Util.PermissionDeniedError) {
        // If the user doesn't have permissions, assume they want to link the persisted version of the record
        // But before we can link the persisted version of the record, we must make sure it exists
        let related_record_persisted = await SharedFunctions.latestPersisted(Record, related_record_uuid);
        if(!related_record_persisted) {
          throw new Util.InputError(`invalid link to record ${related_record_uuid}, which has no persisted version to link`);
        }
        return_record_ids.push(related_record_persisted._id);
      } else {
        throw err;
      }
    }
  } 
  return return_record_ids;
}

async function persistRecurser(uuid, dataset, template, user, session) {

  let persisted_record = await SharedFunctions.latestPersisted(Record, uuid, session);

  // Check if a draft with this uuid exists
  let record_draft = await SharedFunctions.draft(Record, uuid, session);
  if(!record_draft) {
    // There is no draft of this uuid. Return the latest persisted record instead.
    if (!persisted_record) {
      throw new Util.NotFoundError(`Record ${uuid} does not exist`);
    }
    return persisted_record._id;
  }

  // verify that this user is in the 'edit' permission group
  if (!(await UserPermissionsModel.has_permission(user, dataset.uuid, PermissionGroupModel.PermissionTypes.edit))) {
    throw new Util.PermissionDeniedError(`Do not have edit permissions required to persist records in dataset ${dataset.uuid}`);
  }

  // check that the draft update is more recent than the last dataset persist
  if ((await SharedFunctions.latest_persisted_time_for_uuid(DatasetModel.collection(), record_draft.dataset_uuid)) > record_draft.updated_at) {
    throw new Util.InputError(`Record ${record_draft.uuid}'s dataset has been persisted more recently than when the record was last updated. 
    Update the record again before persisting.`);
  }

  // verify that the dataset uuid on the record draft and the expected dataset uuid match
  // This check should never fail, unless there is a bug in my code. Still, it doesn't hurt to be safe.
  if (record_draft.dataset_uuid != dataset.uuid) {
    throw new Error(`The record draft ${record_draft} does not reference the dataset required ${dataset.uuid}. Cannot persist.`);
  }

  for(let field of record_draft.fields) {
    if(field.type == TemplateFieldModel.FieldTypes.File && field.file && field.file.uuid) {
      delete field.file.import_url;  // Import_url is only for the initial import. It shouldn't be persisted
      await FileModel.markPersisted(field.file.uuid);
    }
    if(field.type == TemplateFieldModel.FieldTypes.Image && field.images) {
      for(let image of field.images) {
        if(image.uuid) {
          delete image.import_url;
          await FileModel.markPersisted(image.uuid);
        }
      }
    }
  }

  var last_persisted_time = 0;
  if(persisted_record) {
    last_persisted_time = persisted_record.persist_date;
  }  

  let related_records = await persistRelatedRecords(record_draft.related_records, dataset.related_datasets, template, user, session, last_persisted_time);


  let persist_time = new Date();
  let response = await Record.updateOne(
    {"_id": record_draft._id},
    {'$set': {'updated_at': persist_time, 'persist_date': persist_time, fields: record_draft.fields, related_records, 'dataset_id': dataset._id}},
    {session}
  )
  if (response.modifiedCount != 1) {
    throw new Error(`Record.persist: should be 1 modified document. Instead: ${response.modifiedCount}`);
  }
  return record_draft._id;
}

// Persistes the record with the provided uuid
// Input: 
//   uuid: the uuid of a record to be persisted
//   session: the mongo session that must be used to make transactions atomic
//   last_update: the timestamp of the last known update by the user. Cannot persist if the actual last update and that expected by the user differ.
async function persist(session, record_uuid, user, last_update) {

  let record = await SharedFunctions.draft(Record, record_uuid, session);
  if (!record) {
    record = await SharedFunctions.latestPersisted(Record, record_uuid, session);
    if (!record) {
      throw new Util.NotFoundError(`Record ${record_uuid} does not exist`);
    } 
    throw new Util.InputError('No changes to persist');
  }

  // If the last update provided doesn't match to the last update found in the db, fail.
  let db_last_update = new Date(await lastUpdate(record_uuid, user));
  if(last_update.getTime() != db_last_update.getTime()) {
    throw new Util.InputError(`The last update submitted ${last_update.toISOString()} does not match that found in the db ${db_last_update.toISOString()}. 
    Fetch the draft again to get the latest update before attempting to persist again.`);
  }
  
  let dataset;
  try {
    dataset = await DatasetModel.latestPersistedWithoutPermissions(record.dataset_uuid);
  } catch(error) {
    if(error instanceof Util.NotFoundError || error instanceof Util.InputError) {
      throw new Util.InputError(`a valid dataset_uuid was not provided for record ${record.uuid}`);
    } else {
      throw error;
    }
  }
  let template = await TemplateModel.persistedByIdWithoutPermissions(dataset.template_id);

  await persistRecurser(record_uuid, dataset, template, user, session);

}

async function latestPersistedBeforeDateWithJoins(uuid, date, session) {
  // Construct a mongodb aggregation pipeline that will recurse into related records up to 5 levels deep.
  // Thus, the tree will have a depth of 6 nodes
  let pipeline = [
    {
      '$match': { 
        'uuid': uuid,
        'persist_date': {'$lte': date}
      }
    },
    {
      '$sort' : { 'persist_date' : -1 }
    },
    {
      '$limit' : 1
    }
  ]

  let current_pipeline = pipeline;

  let pipeline_addons = [
    {
      '$lookup': {
        'from': "records",
        'let': { 'ids': "$related_records"},
        'pipeline': [
          { 
            '$match': { 
              '$expr': { 
                '$and': [
                  { '$in': [ "$_id",  "$$ids" ] },
                ]
              }
            }
          }
        ],
        'as': "related_records_objects"
      }
    },
    {
      "$addFields": {
        "related_records_objects_ids": { 
          "$map": {
            "input": "$related_records_objects",
            "in": "$$this._id"
          }
        }
      }
    },
    {
      "$addFields": {
        "related_records": { 
          "$map": {
            "input": "$related_records",
            "in": {"$arrayElemAt":[
              "$related_records_objects",
              {"$indexOfArray":["$related_records_objects_ids","$$this"]}
            ]}
          }
        }
      }
    },
    {"$project":{"related_records_objects":0,"related_records_objects_ids":0}}
  ];

  for(let i = 0; i < 5; i++) {
    // go one level deeper into related_records
    current_pipeline.push(...pipeline_addons);
    current_pipeline = pipeline_addons[0]['$lookup']['pipeline'];
    // create a copy
    pipeline_addons = JSON.parse(JSON.stringify(pipeline_addons));
  }
  let response = await Record.aggregate(pipeline, {session});
  if (await response.hasNext()){
    return await response.next();
  } else {
    throw new Util.NotFoundError('No record exists with the uuid provided which was persisted before the provided date.');
  }
}

// This function will provide the timestamp of the last update made to this record and all of it's related_records
async function lastUpdate(uuid, user) {

  let draft = await fetchDraftOrCreateFromPersisted(uuid);
  if(!draft) {
    throw new Util.NotFoundError();
  }

  let edit_permission = await UserPermissionsModel.has_permission(user, draft.dataset_uuid, PermissionGroupModel.PermissionTypes.edit);
  let view_permission = await UserPermissionsModel.has_permission(user, draft.dataset_uuid, PermissionGroupModel.PermissionTypes.view);
  let persisted = await SharedFunctions.latestPersisted(Record, uuid);

  if(!edit_permission) {
    if(!persisted) {
      throw new Util.PermissionDeniedError(`record ${uuid}: do not have edit permissions for draft, and no persisted version exists`);
    }
    if(!view_permission) {
      throw new Util.PermissionDeniedError(`record ${uuid}: do not have view or admin permissions`);
    }
    return persisted.updated_at;
  }

  let last_update = draft.updated_at;
  for(uuid of draft.related_records) {
    try {
      let update = await lastUpdate(uuid, user);
      if (update > last_update){
        last_update = update;
      }
    } catch (err) {
      if (err instanceof Util.NotFoundError || err instanceof Util.PermissionDeniedError) {
        //
      } else {
        throw err;
      }
    }
  }

  return last_update;

}

async function userHasAccessToPersistedRecord(record, user, session) {
  let dataset = await SharedFunctions.latestPersisted(DatasetModel.collection(), record.dataset_uuid);
  // If both the dataset and the record are public, then everyone has view access
  if (dataset.public_date && Util.compareTimeStamp((new Date).getTime(), dataset.public_date) 
      //&& record.public_date && Util.compareTimeStamp((new Date).getTime(), record.public_date)
  ){
    return true;
  }

  // Otherwise, check if we have view permissions
  return await UserPermissionsModel.has_permission(user, dataset.uuid, PermissionGroupModel.PermissionTypes.view, session);
}

async function filterPersistedForPermissionsRecursor(record, user, session) {
  for(let i = 0; i < record.related_records.length; i++) {
    if(!(await userHasAccessToPersistedRecord(record.related_records[i], user, session))) {
      record.related_records[i] = {uuid: record.related_records[i].uuid};
    } else {
      await filterPersistedForPermissionsRecursor(record.related_records[i], user, session);
    }
  }
}

// Ignore record specific permissions until I remember how they work
async function filterPersistedForPermissions(record, user, session) {
  if(!(await userHasAccessToPersistedRecord(record, user, session))) {
    throw new Util.PermissionDeniedError(`Do not have view access to records in dataset ${record.dataset_uuid}`);
  }
  await filterPersistedForPermissionsRecursor(record, user, session);
}

async function latestPersistedBeforeDateWithJoinsAndPermissions(uuid, date, user, session) {
  let record = await latestPersistedBeforeDateWithJoins(uuid, date, session);
  await filterPersistedForPermissions(record, user, session);
  return record;
} 

// Fetches the last persisted record with the given uuid. 
// Also recursively looks up related_datasets.
async function latestPersistedWithJoinsAndPermissions(uuid, user, session) {
  return await latestPersistedBeforeDateWithJoinsAndPermissions(uuid, new Date(), user, session);
}

async function importRecordFromCombinedRecursor(input_record, dataset, template, user, updated_at, session) {
  if(!Util.isObject(input_record)) {
    throw new Util.InputError('Record to import must be a json object.');
  }
  if(!input_record.record_uuid || typeof(input_record.record_uuid) !== 'string') {
    throw new Util.InputError(`Each record to be imported must have a record uuid, which is a string.`);
  }

  // Now get the matching database uuid for the imported database uuid
  let old_dataset_uuid = input_record.database_uuid;
  let new_dataset_uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(old_dataset_uuid, session);
  let old_record_uuid = input_record.record_uuid;
  let new_record_uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(old_record_uuid, session);
  // If the uuid is found, then this has already been imported. Import again if we have edit permissions
  if(new_record_uuid) {
    if(!(await UserPermissionsModel.has_permission(user, new_dataset_uuid, PermissionGroupModel.PermissionTypes.admin, session))) {
      throw new Util.PermissionDeniedError(`You do not have edit permissions required to import record ${old_record_uuid}. It has already been imported.`);
    }
  } else {
    new_record_uuid = await LegacyUuidToNewUuidMapperModel.create_new_uuid_for_old(old_record_uuid, session);
  }

  // Build object to create/update
  let new_record = {
    uuid: new_record_uuid,
    dataset_uuid: new_dataset_uuid,
    updated_at,
    related_records: []
  };

  if (input_record._record_metadata && Util.isObject(input_record._record_metadata) && 
  input_record._record_metadata._public_date && Date.parse(input_record._record_metadata._public_date)) {
    new_record.public_date = new Date(input_record._record_metadata._public_date);
  }

  // Need to determine if this draft is any different from the persisted one.
  let changes = false;

  new_record.fields = await createRecordFieldsFromImportRecordAndTemplate(input_record.fields, template.fields);

  // Requirements:
  // - related_records is a set, so there can't be any duplicates
  // - Every related_record must point to a related_dataset supported by the dataset
  // Plan: Create a dataset_uuid to dataset map. At the end, check related_records for duplicates
  let related_dataset_map = {};
  for (let related_dataset of dataset.related_datasets) {
    related_dataset_map[related_dataset.uuid] = related_dataset;
  }
  let related_template_map = {};
  for (let related_template of template.related_templates) {
    related_template_map[related_template.uuid] = related_template;
  }
  for (let related_record of input_record.records) {
    // Special import case. If template_uuid is not provided, just skip this part
    if(!related_record.template_uuid ||  related_record.template_uuid == "") {
      continue;
    } 
    let related_dataset_uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(related_record.database_uuid, session);
    let related_dataset = related_dataset_map[related_dataset_uuid];
    if(!related_dataset) {
      console.log(`related_dataset_uuid: ${related_dataset_uuid}, related_dataset: ${related_dataset}`);
    }
    let related_template = related_template_map[related_dataset.template_uuid];
    try {
      let new_changes;
      [new_changes, related_record] = await importRecordFromCombinedRecursor(related_record, related_dataset, related_template, user, updated_at, session);
      changes = changes || new_changes;
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError(err.message);
      } else if (err instanceof Util.PermissionDeniedError) {
        // If we don't have admin permissions to the related_dataset, don't try to update/create it. Just link it
        related_record = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(related_record.record_uuid, session);
      } else {
        throw err;
      }
    }
    // After validating and updating the related_record, replace the related_record with a uuid reference
    new_record.related_records.push(related_record);
  }
  // Related_records is really a set, not a list. But Mongo doesn't store sets well, so have to manage it ourselves.
  if(Util.anyDuplicateInArray(new_record.related_records)) {
    throw new Util.InputError(`Each record may only have one instance of every related_record.`);
  }

  // If this draft is identical to the latest persisted, delete it.
  // The reason to do so is so when an update to a dataset is submitted, we won't create drafts of sub-datasets that haven't changed.
  if (!changes) {
    changes = await draftDifferentFromLastPersisted(new_record);
    if (!changes) {
      // Delete the current draft
      try {
        await SharedFunctions.draftDelete(Record, new_record_uuid);
      } catch (err) {
        if (!(err instanceof Util.NotFoundError)) {
          throw err;
        }
      }
      return [false, new_record_uuid];
    }
  }  
  
  // If a draft of this record already exists: overwrite it, using it's same uuid
  // If a draft of this record doesn't exist: create a new draft
  // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
  let response = await Record.updateOne(
    {"uuid": new_record_uuid, 'persist_date': {'$exists': false}}, 
    {$set: new_record}, 
    {'upsert': true, session}
  );
  if (response.upsertedCount != 1 && response.matchedCount != 1) {
    throw new Error(`Record.importRecordFromCombinedRecursor: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
  } 

  // If successfull, return the uuid of the created / updated dataset
  return [true, new_record_uuid];

}

async function importDatasetAndRecord(record, user, session) {
  // If importing dataset and record together, import dataset and persist it before importing the record draft

  // A couple options here:
  // 1. Do dataset and records at the same time
  // 2. Do dataset first, persist it, then record. 
  // Second one makes more sense, so we only need to persist once
  // I guess first one might be a bit easier to code, but I think the second makes the most sense abstractly. Let's try the second first

  if(!Util.isObject(record)) {
    throw new Util.InputError('Record to import must be a json object.');
  }

  // Template must have already been imported
  if(!record.template_uuid || typeof(record.template_uuid) !== 'string') {
    throw new Util.InputError('Record provided to import must have a template_uuid, which is a string.');
  }
  let new_template_uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(record.template_uuid, session);
  if(!new_template_uuid) {
    throw new Util.InputError('the template_uuid linked in the record you wish to import has not yet been imported.');
  }
  // template must be persisted and user must have read access
  let template = await TemplateModel.latestPersisted(new_template_uuid, user);
  if(!template) {
    throw new Util.InputError(`Template ${new_template_uuid} must be persisted before it's dataset/record can be imported`);
  }

  // Import dataset
  let [changes, dataset_uuid] = await DatasetModel.importDatasetFromCombinedRecursor(record, template, user, new Date(), session);
  // Persist dataset
  if(changes) {
    await DatasetModel.persistWithoutChecks(dataset_uuid, user, session, template);
  }
  let dataset = await DatasetModel.latestPersisted(dataset_uuid, user, session);
  // Import record
  let new_record_uuid = (await importRecordFromCombinedRecursor(record, dataset, template, user, new Date(), session))[1];
  return new_record_uuid;
}

async function importDatasetsAndRecords(session, records, user) {
  if(!Array.isArray(records)) {
    throw new Util.InputError(`'records' must be a valid array`);
  }

  let result_uuids = [];
  for(let record of records) {
    result_uuids.push(await importDatasetAndRecord(record, user, session));
  }
  return result_uuids;
}

async function importRelatedRecordsFromRecord(input_record, dataset, template, user, updated_at, session, seen_uuids) {
  if(!input_record.records) {
    return [];
  }
  if(!Array.isArray(input_record.records)) {
    throw new Util.InputError(`Records object in record to import must be an array`);
  }
  let result_records = [];
  // Requirements:
  // - related_records is a set, so there can't be any duplicates
  // - Every related_record must point to a related_dataset supported by the dataset
  // Plan: Create a dataset_uuid to dataset map. At the end, check related_records for duplicates
  let related_dataset_map = {};
  for (let related_dataset of dataset.related_datasets) {
    related_dataset_map[related_dataset.uuid] = related_dataset;
  }
  let related_template_map = {};
  for (let related_template of template.related_templates) {
    related_template_map[related_template._id] = related_template;
  }
  for (let subscribed_template of template.subscribed_templates) {
    related_template_map[subscribed_template._id] = subscribed_template;
  }
  for (let related_record of input_record.records) {
    let related_dataset_uuid = await LegacyUuidToNewUuidMapperModel.get_secondary_uuid_from_old(related_record.database_uuid, session);
    let related_dataset = related_dataset_map[related_dataset_uuid];
    if(!related_dataset) {
      throw new Util.InputError(`Record linking unexpected dataset/database: ${related_record.database_uuid}`);
    }
    let related_template = related_template_map[related_dataset.template_id];
    try {
      related_record = await importRecordRecursor(related_record, related_dataset, related_template, user, updated_at, session, seen_uuids);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError(err.message);
      } else if (err instanceof Util.PermissionDeniedError) {
        // If we don't have admin permissions to the related_dataset, don't try to update/create it. Just link it
        related_record = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(related_record.record_uuid, session);
      } else {
        throw err;
      }
    }
    // After validating and updating the related_record, replace the related_record with a uuid reference
    result_records.push(related_record);
  }
  // Related_records is really a set, not a list. But Mongo doesn't store sets well, so have to manage it ourselves.
  if(Util.anyDuplicateInArray(result_records)) {
    throw new Util.InputError(`Each record may only have one instance of every related_record.`);
  }
  return result_records;
}

async function importRecordRecursor(input_record, dataset, template, user, updated_at, session, seen_uuids) {

  if(!Util.isObject(input_record)) {
    throw new Util.InputError('Record to import must be a json object.');
  }
  
  // Now get the matching database uuid for the imported database uuid
  let old_template_uuid = input_record.database_uuid;
  if(!old_template_uuid || typeof(old_template_uuid) !== 'string') {
    throw new Util.InputError(`Each record to be imported must have a database_uuid, which is a string.`);
  }
  let new_dataset_uuid = await LegacyUuidToNewUuidMapperModel.get_secondary_uuid_from_old(old_template_uuid, session);
  if(!new_dataset_uuid) {
    throw new Util.InputError(`Template/dataset with uuid ${old_template_uuid} has not been imported, so no record linking it may be imported.`);
  }
  if(new_dataset_uuid != dataset.uuid) {
    throw new Util.InputError(`Dataset expects related dataset with uuid ${dataset.uuid}, but record has ${new_dataset_uuid}`);
  }
  
  let old_record_uuid = input_record.record_uuid;
  if(!old_record_uuid || typeof(old_record_uuid) !== 'string') {
    throw new Util.InputError(`Each record to be imported must have a record uuid, which is a string.`);
  }
  let new_record_uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(old_record_uuid, session);
  // If the uuid is found, then this has already been imported. Import again if we have edit permissions
  if(new_record_uuid) {
    if(!(await UserPermissionsModel.has_permission(user, new_dataset_uuid, PermissionGroupModel.PermissionTypes.edit, session))) {
      throw new Util.PermissionDeniedError(`You do not have edit permissions required to import record ${old_record_uuid}. It has already been imported.`);
    }
  } else {
    new_record_uuid = await LegacyUuidToNewUuidMapperModel.create_new_uuid_for_old(old_record_uuid, session);
  }

  // each record only updates once per update, even if it shows up multiple times in the json input
  if(seen_uuids.has(new_record_uuid)) {
    return new_record_uuid;
  } else {
    seen_uuids.add(new_record_uuid);
  }

  // Build object to create/update
  let new_record = {
    uuid: new_record_uuid,
    old_system_uuid: old_record_uuid,
    dataset_uuid: new_dataset_uuid,
    updated_at,
    related_records: []
  };

  new_record.fields = await createRecordFieldsFromImportRecordAndTemplate(input_record.fields, template.fields, new_record_uuid, session);

  new_record.related_records = await importRelatedRecordsFromRecord(input_record, dataset, template, user, updated_at, session, seen_uuids)

  // If a draft of this record already exists: overwrite it, using it's same uuid
  // If a draft of this record doesn't exist: create a new draft
  // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
  let response = await Record.updateOne(
    {"uuid": new_record_uuid, 'persist_date': {'$exists': false}}, 
    {$set: new_record}, 
    {'upsert': true, session}
  );
  if (response.upsertedCount != 1 && response.matchedCount != 1) {
    throw new Error(`Record.importRecordFromCombinedRecursor: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
  } 

  // If successfull, return the uuid of the created / updated dataset
  return new_record_uuid;
}

async function importRecord(record, user, session, updated_at, seen_uuids) {
  if(!Util.isObject(record)) {
    throw new Util.InputError('Record to import must be a json object.');
  }

  // Template must have already been imported
  if(!record.database_uuid || typeof(record.database_uuid) !== 'string') {
    throw new Util.InputError('Record provided to import must have a database_uuid, which is a string.');
  }
  let dataset_uuid = await LegacyUuidToNewUuidMapperModel.get_secondary_uuid_from_old(record.database_uuid, session);
  if(!dataset_uuid) {
    throw new Util.InputError(`the dataset/template uuid (${record.database_uuid}) linked in the record you wish to import has not yet been imported.`);
  }

  // dataset must be persisted and user must have read access
  dataset = await DatasetModel.latestPersisted(dataset_uuid, user, session);
  if(!dataset) {
    throw new Util.InputError(`Dataset ${dataset_uuid} must be persisted before any record using it can be imported`);
  }

  let template = await TemplateModel.persistedByIdWithoutPermissions(dataset.template_id);

  return importRecordRecursor(record, dataset, template, user, updated_at, session, seen_uuids);
}

async function importRecords(session, records, user) {
  if(!Array.isArray(records)) {
    throw new Util.InputError(`'records' must be a valid array`);
  }

  let updated_at = new Date();

  let seen_uuids = new Set();

  let result_uuids = [];
  for(let record of records) {
    result_uuids.push(await importRecord(record, user, session, updated_at, seen_uuids));
  }
  return result_uuids;
}

// Wraps the actual request to create with a transaction
exports.create = async function(record, user) {
  let inserted_uuid;
  [_, inserted_uuid] = await SharedFunctions.executeWithTransaction(validateAndCreateOrUpdate, record, user);
  return inserted_uuid;
}

exports.draftGet = draftFetchOrCreate;

// Wraps the actual request to update with a transaction
exports.update = async function(record, user) {
  await SharedFunctions.executeWithTransaction(validateAndCreateOrUpdate, record, user);
}

// Wraps the actual request to persist with a transaction
exports.persist = async function(uuid, last_update, user) {
  await SharedFunctions.executeWithTransaction(persist, uuid, user, last_update);
}

// Fetches the last persisted record with the given uuid. 
// Also recursively looks up related_templates.
exports.latestPersisted = latestPersistedWithJoinsAndPermissions;

// Fetches the last record with the given uuid persisted before the provided timestamp. 
// Also recursively looks up related_templates.
exports.persistedBeforeDate = latestPersistedBeforeDateWithJoinsAndPermissions;

exports.lastUpdate = lastUpdate;

exports.draftDelete = async function(uuid, user) {
  // if draft doesn't exist, return not found
  let draft = await SharedFunctions.draft(Record, uuid);
  if(!draft) {
    throw new Util.NotFoundError(`No draft exists with uuid ${uuid}`);
  }
  // if don't have admin permissions, return no permissions
  if(!(await UserPermissionsModel.has_permission(user, draft.dataset_uuid, PermissionGroupModel.PermissionTypes.edit))) {
    throw new Util.PermissionDeniedError(`You do not have edit permissions for dataset ${draft.dataset_uuid}.`);
  }

  await SharedFunctions.draftDelete(Record, uuid);

  await deleteDraftFiles(draft);
}

exports.draftExisting = async function(uuid) {
  return (await SharedFunctions.draft(Record, uuid)) ? true : false;
}

exports.userHasPermissionsTo = async function(record_uuid, permissionLevel, user) {
  let record = await SharedFunctions.latestDocument(Record, record_uuid);
  return await UserPermissionsModel.has_permission(user, record.dataset_uuid, permissionLevel);
}

// Just ignore this for now
exports.updateFileName = async function(record_uuid, field_uuid, file_uuid, file_name) {
  // I can update the whole record. Just fetch the record, find the given field_uuid, update only change the file_name
  // and voila
  // The catch with this method is that if the user has different permissions, they will alter other parts of the record

  // Another method is just to fetch the fields and update those only. In fact, that is probably better. But the updated_at also needs to be updated

  // But that won't work if there is no current draft. So it really does need to be a full update
  // Ugh, but a full update is so ugly if we only want to change the file name. 



}

// Wraps the actual request to importDatasetsAndRecords with a transaction
exports.importDatasetsAndRecords = async function(records, user) {
  let new_uuids = await SharedFunctions.executeWithTransaction(importDatasetsAndRecords, records, user);
  return new_uuids;
}

// Wraps the actual request to importRecords with a transaction
exports.importRecords = async function(records, user) {
  let new_uuids = await SharedFunctions.executeWithTransaction(importRecords, records, user);
  return new_uuids;
}