const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');
const TemplateModel = require('./template');

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

// Fetches the recprd draft with the given uuid. 
// Does not look up related_records
async function draft(uuid, session) {
  let cursor = await Record.find(
    {"uuid": uuid, 'publish_date': {'$exists': false}}, 
    {session}
  );

  if(!(await cursor.hasNext())) {
    return null;
  } 
  let draft = await cursor.next();
  if (await cursor.hasNext()) {
    throw `Record.draft: Multiple drafts found for record with uuid ${uuid}`;
  }
  return draft;
}

// Fetches the latest published draft with the given uuid. 
// Does not look up related_records
async function latestPublished(uuid, session) {
  let cursor = await Record.find(
    {"uuid": uuid, 'publish_date': {'$exists': true}}, 
    {session}
  ).sort({'publish_date': -1})
  .limit(1);
  if (!(await cursor.hasNext())) {
    return null;
  }
  return await cursor.next();
}

// Returns true if the record exists
async function exists(uuid, session) {
  let cursor = await Record.find(
    {"uuid": uuid},
    {session}
    );
  return (await cursor.hasNext());
}

async function uuidFor_id(_id, session) {
  let cursor = await Record.find(
    {"_id": _id}, 
    {session}
  );
  if (!(await cursor.hasNext())) {
    return null;
  }
  let document = await cursor.next();
  return document.uuid;
}

// Creates a draft from the published version.
async function createDraftFromPublished(published) {

  // Create a copy of published
  let draft = Object.assign({}, published);

  delete draft._id;
  draft.updated_at = draft.publish_date;
  delete draft.publish_date;

  // Replace each of the related_template _ids with uuids. 
  let related_records = [];
  for(_id of published.related_records) {
    let uuid = await uuidFor_id(_id);
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
async function fetchDraftOrCreateFromPublished(uuid, session) {
  let record_draft = await draft(uuid, session);
  if(record_draft) {
    return record_draft;
  }

  let published_record = await latestPublished(uuid, session);
  if(!published_record) {
    return null;
  }
  record_draft = await createDraftFromPublished(published_record);

  return record_draft;
}

// Returns true if the draft has any changes from it's previous published version
async function draftDifferentFromLastPublished(draft) {
  // If there is no published version, obviously there are changes
  let latest_published = await latestPublished(draft.uuid);
  if(!latest_published) {
    return true;
  }

  // If the properties have changed since the last publishing
  let latest_publish_as_draft = await createDraftFromPublished(latest_published);
  if (!equals(draft, latest_publish_as_draft)) {
    return true;
  }

  // Finally, if any of the dependencies have been published more recently than this draft, then there are changes
  for(let related_record of draft.related_records) {
    let related_record_last_published = (await latestPublished(related_record)).publish_date;
    if (Util.compareTimeStamp(related_record_last_published, last_publish_date) > 0) {
      return true;
    }
  }

  return false;
}

// A recursive helper for validateAndCreateOrUpdate.
async function validateAndCreateOrUpdateRecurser(record, session, template) {

  // Record must be an object or valid uuid
  if (!Util.isObject(record)) {
    if (uuidValidate(record) && (await exists(record, session))) {
      return [false, record]
    }
    throw new Util.InputError(`record provided is not an object or a valid uuid: ${record}`);
  }

  // If a record uuid is provided, this is an update
  if (record.uuid) {
    // Record must have a valid uuid. 
    if (!uuidValidate(record.uuid)) {
      throw new Util.InputError("each record must have a valid uuid property");
    }
    
    // Record uuid must exist
    if (!(await exists(record.uuid, session))) {
      throw new Util.NotFoundError(`No record exists with uuid ${record.uuid}`);
    }
  }
  // Otherwise, this is a create, so generate a new uuid
  else {
    record.uuid = uuidv4();
  }

  // 1. Recursively create / update each of the related records
  // 2. Check if this record conforms to the latest published template
  // 3. Check if this record has changed at all from the previous one

  // Verify that the template uuid provided by the user is the correct template uuid expected by the latest published template
  if(record.template_uuid != template.uuid) {
    throw new Util.InputError(`The template uuid provided by the record: ${record.template_uuid} does not correspond to the template uuid expected by the template: ${template.uuid}`);
  }

  // Now process the record data provided
  let record_to_save = {
    uuid: record.uuid,
    template_uuid: record.template_uuid,
    fields: [],
    related_records: []
  };

  // Get the data for each field
  if (record.fields !== undefined) {
    if (!Array.isArray(record.fields)){
      throw new Util.InputError('fields property must be of type array');
    }

    let fields_map = {};
    for (record_field of record.fields) {
      fields_map[record_field.name] = record_field.value;
    }

    for (template_field of template.fields) {
      record_to_save.fields.push({
        name: template_field.name,
        description: template_field.description,
        value: fields_map[template_field.name]
      });
    }
  }

  // Need to determine if this draft is any different from the published one.
  let changes = false;

  // Recurse into related_records
  if (record.related_records !== undefined) {
    if (!Array.isArray(record.related_records)){
      throw new Util.InputError('related_records property must be of type array');
    }
    // For each related record, first check that it is valid according to the template scheme. Then recurse.
    let related_template_map = {};
    for (related_template of template.related_templates) {
      related_template_map[related_template.uuid] = related_template;
    }

    for (related_record of record.related_records) {
      // Make sure this related record adheres to the template
      let related_record_template_uuid;
      if (Util.isObject(related_record)) {
        related_record_template_uuid = related_record.template_uuid;
      } else if (uuidValidate(related_record)) {
        related_record_template_uuid = (await draft(related_record, session)).template_uuid;
      } else {
        throw new Util.InputError(`record provided is neither an object nor a valid uuid: ${related_record}`);
      }
      // Make sure this related record adheres to the template
      if(!(related_record_template_uuid in related_template_map)) {
        throw new Util.InputError(`Record provided ${record} links to a record with template uuid ${related_record_template_uuid}, which does not conform to the template.`);
      }
      try {
        let new_changes;
        [new_changes, related_record] = await validateAndCreateOrUpdateRecurser(related_record, session, related_template_map[related_record_template_uuid]);
        changes = changes ? changes : new_changes;
      } catch(err) {
        if (err instanceof Util.NotFoundError) {
          throw new Util.InputError(err.message);
        } else {
          throw err;
        }
      }
      // After validating and updating the related_record, replace the  related_record with a uuid reference
      record_to_save.related_records.push(related_record);
    }
  }

  // Ensure there is only one draft of this record. If there are multiple drafts, that is a critical error.
  let cursor = await Record.find({"uuid": record.uuid, 'publish_date': {'$exists': false}});
  if ((await cursor.count()) > 1) {
    throw new Exception(`Template.validateAndCreateOrUpdate: Multiple drafts found of template with uuid ${template.uuid}`);
  } 

  // If this draft is identical to the latest published, delete it.
  // The reason to do so is so when a change is submitted, we won't create drafts of sub-records.
  // We notify the user when a draft is created so they can publish it. So we don't want to create sub-template drafts
  // every time a parent draft is updated.
  if (!changes) {
    changes = await draftDifferentFromLastPublished(record_to_save);
    if (!changes) {
      // Delete the current draft
      try {
        await draftDelete(record.uuid);
      } catch (err) {
        if (!(err instanceof Util.NotFoundError)) {
          throw err;
        }
      }
      return [false, null];
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
async function validateAndCreateOrUpdate(record, session) {

  // Record must be an object
  if (!Util.isObject(record)) {
    throw new Util.InputError(`record provided is not an object: ${record}`);
  }

  let template;
  try {
    template = await TemplateModel.latestPublished(record.template_uuid, session);
  } catch(error) {
    if(error instanceof Util.NotFoundError || error instanceof Util.InputError) {
      throw new Util.InputError(`a valid template_uuid was not provided for record with uuid ${record.uuid}`);
    }
  }

  return await validateAndCreateOrUpdateRecurser(record, session, template);

}

// Fetches the record draft with the given uuid, recursively looking up related_records.
// If a draft of a given template doesn't exist, a new one will be generated using the last published record.
async function draftFetchOrCreate(uuid, session) {

  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  // For each record in the tree:
  //   a. If a draft of this record exists:
  //        1. fetch it.
  //        2. Follow steps in b
  //        3. Update the current draft with this one.
  //        4. Return this draft
  //      Else if a published version of this template exists:
  //        1. Create a draft from the published
  //          a. For each of the published _id references, replace those _ids with uuids
  //        2. follow steps in b
  //        3. Insert the draft
  //        4. Return the draft
  //      Else, neither a draft nor a published template with this uuid exists:
  //        1. Return a NotFound error
  //   b. For each of the uuid references:
  //        1. Recurse, and follow the above steps. 
  //        2. If any of the references return nothing, remove the reference to them
  //        3. Update the current draft with this draft

  // See if a draft of this template exists. 
  let record_draft = await fetchDraftOrCreateFromPublished(uuid, session);
  if (!record_draft) {
    return null;
  }

  // Now recurse into each related_record, replacing each uuid with an imbedded object
  let related_records = [];
  let related_record_uuids = [];
  for(let i = 0; i < record_draft.related_records.length; i++) {
    let related_record = await draftFetchOrCreate(record_draft.related_records[i], session);
    if (related_record) {
      related_records.push(related_record);
      related_record_uuids.push(related_record.uuid);
    } else {
      console.log(`Failed to find a record with uuid ${uuid}. Therefore, removing the reference to it from record with uuid ${record_draft.uuid}`);
    }
  }

  // Any existing references that are bad pointers need to be removed
  let update = {};
  if (record_draft.related_records.length != related_record_uuids.length) {
    update.related_records = related_record_uuids;
  }
  if(update.related_records) {
    record_draft.updated_at = new Date()
    update.updated_at = record_draft.updated_at;
    let response = await Record.updateOne(
      {'_id': record_draft._id},
      {
        '$set': update
      },
      {session}
    );
    if (response.modifiedCount != 1) {
      throw `Record.draftFetchOrCreate: should be 1 modified document. Instead: ${response.modifiedCount}`;
    }
  }

  record_draft.related_records = related_records;
  delete record_draft._id;

  return record_draft;

}

async function draftDelete(uuid) {

  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  let response = await Record.deleteMany({ uuid, publish_date: {'$exists': false} });
  if (!response.deletedCount) {
    throw new Util.NotFoundError();
  }
  if (response.deletedCount > 1) {
    console.error(`draftDelete: Record with uuid '${uuid}' had more than one draft to delete.`);
  }
}

// Wraps the actual request to create with a transaction
exports.create = async function(record) {
  const session = MongoDB.newSession();
  let inserted_uuid;
  try {
    await session.withTransaction(async () => {
      try {
        [_, inserted_uuid] = await validateAndCreateOrUpdate(record, session);
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

// Wraps the actual request to get with a transaction
exports.draftGet = async function(uuid) {
  const session = MongoDB.newSession();
  try {
    var record;
    await session.withTransaction(async () => {
      try {
        record = await draftFetchOrCreate(uuid, session);
      } catch(err) {
        await session.abortTransaction();
        throw err;
      }
    });
    session.endSession();
    return record;
  } catch(err) {
    session.endSession();
    throw err;
  }
}