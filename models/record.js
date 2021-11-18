const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');
const TemplateModel = require('./template');
const DatasetModel = require('./dataset');
const PermissionGroupModel = require('./permission_group');
const SharedFunctions = require('./shared_functions');

var Record;

// Returns a reference to the record Mongo Collection
async function collection() {
  if (Record === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('records');
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
  for(let i = 0; i < fields1.length; i++) {
    let field1 = fields1[i];
    let field2 = fields2[i];
    if (field1.name != field2.name || field1.description != field2.description || field1.value != field2.value) {
      return false;
    }
  }
  return true;
}

// Creates a draft from the published version.
async function createDraftFromPublished(published) {

  // Create a copy of published
  let draft = Object.assign({}, published);

  delete draft._id;
  draft.updated_at = draft.publish_date;
  delete draft.publish_date;
  draft.dataset_uuid = await SharedFunctions.uuidFor_id(DatasetModel.collection(), draft.dataset_id);
  delete draft.dataset_id;

  // Replace each of the related_record _ids with uuids. 
  let related_records = [];
  for(_id of published.related_records) {
    let uuid = await SharedFunctions.uuidFor_id(Record, _id);
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
// If it does not exist, it creates a draft from the latest published.
// Does not lookup related_records
async function fetchDraftOrCreateFromPublished(uuid) {
  let record_draft = await SharedFunctions.draft(Record, uuid);
  if(record_draft) {
    return record_draft;
  }

  let published_record = await SharedFunctions.latestPublished(Record, uuid);
  if(!published_record) {
    return null;
  }
  record_draft = await createDraftFromPublished(published_record);

  return record_draft;
}

function draftsEqual(draft1, draft2) {
  return draft1.uuid == draft2.uuid &&
         draft1.dataset_uuid == draft2.dataset_uuid &&
         fieldsEqual(draft1.fields, draft2.fields) &&
         Util.arrayEqual(draft1.related_records, draft2.related_records);
}

// Returns true if the draft has any changes from it's previous published version
async function draftDifferentFromLastPublished(draft) {
  // If there is no published version, obviously there are changes
  let latest_published = await SharedFunctions.latestPublished(Record, draft.uuid);
  if(!latest_published) {
    return true;
  }

  // If the properties have changed since the last publishing
  let latest_published_as_draft = await createDraftFromPublished(latest_published);
  if (!draftsEqual(draft, latest_published_as_draft)) {
    return true;
  }

  // if the template version has changed since this record was last published
  let latest_dataset_id = await SharedFunctions.latest_published_id_for_uuid(DatasetModel.collection(), latest_published_as_draft.dataset_uuid);
  if(!latest_published.dataset_id.equals(latest_dataset_id)) {
    return true;
  }

  // Finally, if any of the dependencies have been published more recently than this record, then there are changes
  for(let related_record of draft.related_records) {
    let related_record_last_published = (await SharedFunctions.latestPublished(Record, related_record)).publish_date;
    if (Util.compareTimeStamp(related_record_last_published, latest_published.publish_date) > 0) {
      return true;
    }
  }

  return false;
}

// A recursive helper for validateAndCreateOrUpdate.
async function validateAndCreateOrUpdateRecurser(record, dataset, template, user, session) {

  // Record must be an object or valid uuid
  if (!Util.isObject(record)) {
    throw new Util.InputError(`record provided is not an object: ${record}`);
  }

  // If a record uuid is provided, this is an update
  if (record.uuid) {
    // Record must have a valid uuid. 
    if (!uuidValidate(record.uuid)) {
      throw new Util.InputError("each record must have a valid uuid property");
    }
    
    // Record uuid must exist
    if (!(await SharedFunctions.exists(Record, record.uuid, session))) {
      throw new Util.NotFoundError(`No record exists with uuid ${record.uuid}`);
    }

  }
  // Otherwise, this is a create, so generate a new uuid
  else {
    record.uuid = uuidv4();
  }

  // verify that this user is in the 'edit' permission group
  if (!(await PermissionGroupModel.has_permission(user, dataset.uuid, PermissionGroupModel.PERMISSION_EDIT))) {
    throw new Util.PermissionDeniedError(`Do not have edit permissions required to create/update records in dataset ${dataset.uuid}`);
  }

  // Make sure no record switches datasets
  let latest_published_record = await SharedFunctions.latestPublished(Record, record.uuid, session);
  if (latest_published_record) {
    if(record.dataset_uuid != latest_published_record.dataset_uuid) {
      throw new Util.InputError(`Record ${record.uuid} expected dataset ${latest_published_record.dataset_uuid}, but received ${record.dataset_uuid}. Once a record is published, it's dataset may never be changed.`);
    }
  }

  // Verify that the dataset uuid specified by the record matches the dataset uuid of the dataset
  if(record.dataset_uuid != dataset.uuid) {
    throw new Util.InputError(`The dataset uuid provided by the record: ${record.dataset_uuid} does not correspond to the dataset uuid expected by the dataset: ${dataset.uuid}`);
  }

  let public_date;
  let fields = [];
  let related_records = [];

  if (record.public_date) {
    if (!Date.parse(record.public_date)){
      throw new Util.InputError('record public_date property must be in valid date format');
    }
    public_date = new Date(record.public_date);
  }

  // Fields are a bit more complicated
  if(!record.fields) {
    record.fields = [];
  }
  if (!Array.isArray(record.fields)){
    throw new Util.InputError('fields property must be of type array');
  }
  // Create a map of records to fields
  let record_field_map = {};
  for (let field of record.fields) {
    if(!field.uuid) {
      throw new Util.InputError(`Each field in the record must supply a template_field uuid`);
    }
    if (record_field_map[field.uuid]) {
      throw new Util.InputError(`A record can only supply a single value for each field`);
    }
    record_field_map[field.uuid] = field.value;
  }
  for (let field of template.fields) {
    fields.push({
      uuid: field.uuid,
      name: field.name,
      description: field.description,
      value: record_field_map[field.uuid]
    });
  }
  // TODO: should I make the same change for related_records?

  // Need to determine if this draft is any different from the published one.
  let changes = false;

  // Recurse into related_records
  if(!record.related_records) {
    record.related_records = [];
  }
  if (!Array.isArray(record.related_records)){
    throw new Util.InputError('related_records property must be of type array');
  }
  if(record.related_records.length != dataset.related_datasets.length) {
    throw new Util.InputError(`related_records of record must correspond to related_datasets of its dataset`);
  }
  for (let i = 0; i < record.related_records.length; i++) {
    let related_record;
    try {
      let new_changes;
      [new_changes, related_record] = await validateAndCreateOrUpdateRecurser(record.related_records[i], dataset.related_datasets[i], template.related_templates[i], user, session);
      changes = changes || new_changes;
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError(err.message);
      } else if (err instanceof Util.PermissionDeniedError) {
        // If we don't have admin permissions to the related_record, don't try to update/create it. Just link it
        related_record = record.related_records[i].uuid;
      } else {
        throw err;
      }
    }
    // After validating and updating the related_record, replace the related_record with a uuid reference
    related_records.push(related_record);
  }

  // Now process the record data provided
  let record_to_save = {
    uuid: record.uuid,
    dataset_uuid: record.dataset_uuid,
    fields: fields,
    related_records: related_records
  };
  if(public_date) {
    record_to_save.public_date = public_date;
  }

  // If this draft is identical to the latest published, delete it.
  // The reason to do so is so when a change is submitted, we won't create drafts of sub-records.
  if (!changes) {
    changes = await draftDifferentFromLastPublished(record_to_save);
    if (!changes) {
      // Delete the current draft
      try {
        await SharedFunctions.draftDelete(Record, record.uuid);
      } catch (err) {
        if (!(err instanceof Util.NotFoundError)) {
          throw err;
        }
      }
      return [false, record.uuid];
    }
  }

  record_to_save.updated_at = new Date();

  // If a draft of this record already exists: overwrite it, using it's same uuid
  // If a draft of this record doesn't exist: create a new draft
  // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
  let response = await Record.updateOne(
    {"uuid": record.uuid, 'publish_date': {'$exists': false}}, 
    {$set: record_to_save}, 
    {'upsert': true, session}
  );
  if (response.modifiedCount != 1 && response.upsertedCount != 1) {
    throw `Record.validateAndCreateOrUpdate: Modified: ${response.modifiedCount}. Upserted: ${response.upsertedCount}`;
  } 

  // If successfull, return the uuid of the created / updated record
  return [true, record.uuid];

}

// If a uuid is provided, update the record with the provided uuid.
// Otherwise, create a new record.
// If the updated record is the same as the last published, delete the draft instead of updating. 
// In both cases, validate the given record as well, making sure it adheres to the latest public template
// Return:
// 1. A boolean indicating true if there were changes from the last published.
// 2. The uuid of the record created / updated
async function validateAndCreateOrUpdate(record, user, session) {

  // Record must be an object
  if (!Util.isObject(record)) {
    throw new Util.InputError(`record provided is not an object: ${record}`);
  }

  let dataset;
  try {
    dataset = await DatasetModel.latestPublishedWithoutPermissions(record.dataset_uuid);
  } catch(error) {
    if(error instanceof Util.NotFoundError || error instanceof Util.InputError) {
      throw new Util.InputError(`a valid dataset_uuid was not provided for record ${record.uuid}`);
    } else {
      throw error;
    }
  }
  let template = await TemplateModel.publishedByIdWithoutPermissions(dataset.template_id);

  return await validateAndCreateOrUpdateRecurser(record, dataset, template, user, session);

}

// Fetches the record draft with the given uuid, recursively looking up related_records.
// If a draft of a given template doesn't exist, a new one will be generated using the last published record.
async function draftFetchOrCreate(uuid, user) {

  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  // See if a draft of this template exists. 
  let record_draft = await fetchDraftOrCreateFromPublished(uuid);
  if (!record_draft) {
    return null;
  }

  // Make sure this user has a permission to be working with drafts
  if (!(await PermissionGroupModel.has_permission(user, record_draft.dataset_uuid, PermissionGroupModel.PERMISSION_EDIT))) {
    throw new Util.PermissionDeniedError(`You do not have the edit permissions required to view draft ${uuid}`);
  }

  // Now recurse into each related_record, replacing each uuid with an imbedded object
  let related_records = [];
  for(let i = 0; i < record_draft.related_records.length; i++) {
    let related_record;
    try{
      related_record = await draftFetchOrCreate(record_draft.related_records[i], user);
    } catch (err) {
      if (err instanceof Util.PermissionDeniedError) {
        // If we don't have permission for the draft, get the latest published instead
        try {
          related_record = await latestPublishedWithJoinsAndPermissions(record_draft.related_records[i], user)
        } catch (err) {
          if (err instanceof Util.PermissionDeniedError || err instanceof Util.NotFoundError) {
            // If we don't have permission for the published version, or a published version doesn't exist, just attach a uuid and a flag marking no_permissions
            related_record = {uuid: record_draft.related_records[i], no_permissions: true};
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

async function publishRecurser(uuid, dataset, template, user, session) {

  let published_record = await SharedFunctions.latestPublished(Record, uuid, session);

  // Check if a draft with this uuid exists
  let record_draft = await SharedFunctions.draft(Record, uuid, session);
  if(!record_draft) {
    // There is no draft of this uuid. Return the latest published record instead.
    if (!published_record) {
      throw new Util.NotFoundError(`Record ${uuid} does not exist`);
    }
    return [published_record._id, false];
  }

  // verify that this user is in the 'edit' permission group
  if (!(await PermissionGroupModel.has_permission(user, dataset.uuid, PermissionGroupModel.PERMISSION_EDIT))) {
    throw new Util.PermissionDeniedError(`Do not have edit permissions required to publish records in dataset ${dataset.uuid}`);
  }

  // check that the draft update is more recent than the last dataset publish
  if ((await SharedFunctions.latest_published_time_for_uuid(DatasetModel.collection(), record_draft.dataset_uuid)) > record_draft.updated_at) {
    throw new Util.InputError(`Record ${record_draft.uuid}'s dataset has been published more recently than when the record was last updated. 
    Update the record again before publishing.`);
  }

  // verify that the dataset uuid on the record draft and the expected dataset uuid match
  // This check should never fail, unless there is a bug in my code. Still, it doesn't hurt to be safe.
  if (record_draft.dataset_uuid != dataset.uuid) {
    throw new Error(`The record draft ${record_draft} does not reference the dataset required ${dataset.uuid}. Cannot publish.`);
  }

  let changes = false;
  let related_records = [];
  var last_published_time = 0;
  if(published_record) {
    last_published_time = published_record.publish_date;
  }  

  // For each records's related_records, publish that related_record, then replace the uuid with the internal_id.
  // It is possible there weren't any changes to publish, so keep track of whether we actually published anything.
  for(let i = 0; i < record_draft.related_records.length; i++) {
    let related_record = record_draft.related_records[i];
    let related_dataset = dataset.related_datasets[i];
    let related_template = template.related_templates[i];
    try {
      [related_record, _] = await publishRecurser(related_record, related_dataset, related_template, user, session);
      related_records.push(related_record);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError(`Internal reference within this draft is invalid. Fetch/update draft to cleanse it.`);
      } else if (err instanceof Util.PermissionDeniedError) {
        // If the user doesn't have permissions, assume they want to link the published version of the record
        // But before we can link the published version of the record, we must make sure it exists
        let related_record_published = await SharedFunctions.latestPublished(Record, related_record);
        if(!related_record_published) {
          throw new Util.InputError(`invalid link to record ${related_record}, which has no published version to link`);
        }
        related_records.push(related_record_published._id);
      } else {
        throw err;
      }
    }
    if (SharedFunctions.publishDateFor_id(Record, related_record) > last_published_time) {
      changes = true;
    }
  }  

  var return_id;

  // We're trying to figure out if there is anything worth publishing. If none of the sub-properties were published, 
  // see if there are any changes to the top-level record from the previous published version
  if(!changes) {
    if (published_record) {
      return_id = published_record._id;
      // Add the check if the current dataset being used is different from the dataset being used by the last published
      if (dataset._id != published_record.dataset_id) {
        changes = true;
      } else if (!fieldsEqual(record_draft.fields, published_record.fields) || 
                !Util.arrayEqual(related_records, published_record.related_records)) {
        changes = true;
      }
    } else {
      changes = true;
    }
  }

  // If there are changes, publish the current draft
  if(changes) {
    let publish_time = new Date();
    let response = await Record.updateOne(
      {"_id": record_draft._id},
      {'$set': {'updated_at': publish_time, 'publish_date': publish_time, related_records, 'dataset_id': dataset._id}},
      {session}
    )
    if (response.modifiedCount != 1) {
      throw new Error(`Record.publish: should be 1 modified document. Instead: ${response.modifiedCount}`);
    }
    return_id = record_draft._id;
  }

  return [return_id, changes];

}

// Publishes the record with the provided uuid
// Input: 
//   uuid: the uuid of a record to be published
//   session: the mongo session that must be used to make transactions atomic
//   last_update: the timestamp of the last known update by the user. Cannot publish if the actual last update and that expected by the user differ.
// Returns:
//   published: true if a new published version is created. false otherwise
async function publish(record_uuid, user, session, last_update) {

  let record = await SharedFunctions.draft(Record, record_uuid, session);
  if (!record) {
    record = await SharedFunctions.latestPublished(Record, record_uuid, session);
    if (!record) {
      throw new Util.NotFoundError(`Record ${record_uuid} does not exist`);
    } 
    return false;
  }

  // If the last update provided doesn't match to the last update found in the db, fail.
  let db_last_update = new Date(await lastUpdate(record_uuid, user));
  if(last_update.getTime() != db_last_update.getTime()) {
    throw new Util.InputError(`The last update submitted ${last_update.toISOString()} does not match that found in the db ${db_last_update.toISOString()}. 
    Fetch the draft again to get the latest update before attempting to publish again.`);
  }
  
  let dataset;
  try {
    dataset = await DatasetModel.latestPublishedWithoutPermissions(record.dataset_uuid);
  } catch(error) {
    if(error instanceof Util.NotFoundError || error instanceof Util.InputError) {
      throw new Util.InputError(`a valid dataset_uuid was not provided for record ${record.uuid}`);
    } else {
      throw error;
    }
  }
  let template = await TemplateModel.publishedByIdWithoutPermissions(dataset.template_id);

  return (await publishRecurser(record_uuid, dataset, template, user, session))[1];

}

async function latestPublishedBeforeDateWithJoins(uuid, date) {
  // Validate uuid and date are valid
  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }
  if (!Util.isValidDate(date)) {
    throw new Util.InputError('The date provided is not a valid date.');
  }

  // Construct a mongodb aggregation pipeline that will recurse into related records up to 5 levels deep.
  // Thus, the tree will have a depth of 6 nodes
  let pipeline = [
    {
      '$match': { 
        'uuid': uuid,
        'publish_date': {'$lte': date}
      }
    },
    {
      '$sort' : { 'publish_date' : -1 }
    },
    {
      '$limit' : 1
    }
  ]

  let current_pipeline = pipeline;

  let pipeline_addon = {
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
      'as': "related_records"
    }
  }

  for(let i = 0; i < 5; i++) {
    // go one level deeper into related_templates
    current_pipeline.push(pipeline_addon);
    current_pipeline = pipeline_addon['$lookup']['pipeline'];
    // create a copy
    pipeline_addon = JSON.parse(JSON.stringify(pipeline_addon));
  }
  let response = await Record.aggregate(pipeline);
  if (await response.hasNext()){
    return await response.next();
  } else {
    throw new Util.NotFoundError('No record exists with the uuid provided which was published before the provided date.');
  }
}

// This function will provide the timestamp of the last update made to this record and all of it's related_records
async function lastUpdate(uuid, user) {

  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  let draft = await fetchDraftOrCreateFromPublished(uuid);
  if(!draft) {
    throw new Util.NotFoundError();
  }

  let edit_permission = await PermissionGroupModel.has_permission(user, draft.dataset_uuid, PermissionGroupModel.PERMISSION_EDIT);
  let view_permission = await PermissionGroupModel.has_permission(user, draft.dataset_uuid, PermissionGroupModel.PERMISSION_VIEW);
  let published = await SharedFunctions.latestPublished(Record, uuid);

  if(!edit_permission) {
    if(!published) {
      throw new Util.PermissionDeniedError(`record ${uuid}: do not have edit permissions for draft, and no published version exists`);
    }
    if(!view_permission) {
      throw new Util.PermissionDeniedError(`record ${uuid}: do not have view or admin permissions`);
    }
    return published.updated_at;
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

async function userHasAccessToPublishedRecord(record, user) {
  let dataset = await SharedFunctions.latestPublished(DatasetModel.collection(), record.dataset_uuid);
  // If both the dataset and the record are public, then everyone has view access
  if (dataset.public_date && Util.compareTimeStamp((new Date).getTime(), dataset.public_date) &&
      record.public_date && Util.compareTimeStamp((new Date).getTime(), record.public_date)){
    return true;
  }

  // Otherwise, check if we have view permissions
  return await PermissionGroupModel.has_permission(user, dataset.uuid, PermissionGroupModel.PERMISSION_VIEW);
}

async function filterPublishedForPermissionsRecursor(record, user) {
  for(let i = 0; i < record.related_records.length; i++) {
    if(!(await userHasAccessToPublishedRecord(record.related_records[i], user, PermissionGroupModel))) {
      record.related_records[i] = {uuid: record.related_records[i].uuid};
    } else {
      await filterPublishedForPermissionsRecursor(record.related_records[i], user);
    }
  }
}

// TODO: use the dataset instead of the record. Also, ignore record specific permissions until I remember how they work
async function filterPublishedForPermissions(record, user) {
  if(!(await userHasAccessToPublishedRecord(record, user, PermissionGroupModel))) {
    throw new Util.PermissionDeniedError(`Do not have view access to records in dataset ${record.dataset_uuid}`);
  }
  await filterPublishedForPermissionsRecursor(record, user);
}

async function latestPublishedBeforeDateWithJoinsAndPermissions(uuid, date, user) {
  let record = await latestPublishedBeforeDateWithJoins(uuid, date);
  await filterPublishedForPermissions(record, user);
  return record;
} 

// Fetches the last published record with the given uuid. 
// Also recursively looks up related_datasets.
async function latestPublishedWithJoinsAndPermissions(uuid, user) {
  return await latestPublishedBeforeDateWithJoinsAndPermissions(uuid, new Date(), user);
}

// Wraps the actual request to create with a transaction
exports.create = async function(record, user) {
  const session = MongoDB.newSession();
  let inserted_uuid;
  try {
    await session.withTransaction(async () => {
      try {
        [_, inserted_uuid] = await validateAndCreateOrUpdate(record, user, session);
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

exports.draftGet = draftFetchOrCreate;

// Wraps the actual request to update with a transaction
exports.update = async function(record, user) {
  const session = MongoDB.newSession();
  try {
    await session.withTransaction(async () => {
      try {
        await validateAndCreateOrUpdate(record, user, session);
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

// Wraps the actual request to publish with a transaction
exports.publish = async function(uuid, last_update, user) {
  const session = MongoDB.newSession();
  try {
    var published;
    await session.withTransaction(async () => {
      try {
        published = await publish(uuid, user, session, last_update);
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

// Fetches the last published record with the given uuid. 
// Also recursively looks up related_templates.
exports.latestPublished = latestPublishedWithJoinsAndPermissions;

// Fetches the last record with the given uuid published before the provided timestamp. 
// Also recursively looks up related_templates.
exports.publishedBeforeDate = latestPublishedBeforeDateWithJoinsAndPermissions;

exports.lastUpdate = lastUpdate;

exports.draftDelete = async function(uuid, user) {
  // valid uuid
  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }
  // if draft doesn't exist, return not found
  let draft = await SharedFunctions.draft(Record, uuid);
  if(!draft) {
    throw new Util.NotFoundError(`No draft exists with uuid ${uuid}`);
  }
  // if don't have admin permissions, return no permissions
  if(!(await PermissionGroupModel.has_permission(user, draft.dataset_uuid, PermissionGroupModel.PERMISSION_EDIT))) {
    throw new Util.PermissionDeniedError(`You do not have edit permissions for dataset ${draft.dataset_uuid}.`);
  }

  await SharedFunctions.draftDelete(Record, uuid);
}

exports.draftExisting = async function(uuid) {
  return (await SharedFunctions.draft(Record, uuid)) ? true : false;
}