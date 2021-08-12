const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');

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
async function latestPublished(uuid, session) {
  let cursor = await TemplateField.find(
    {"uuid": uuid, 'publish_date': {'$exists': true}}, 
    {session}
  ).sort({'publish_date': -1})
  .limit(1);
  if (!(await cursor.hasNext())) {
    return null;
  }
  return await cursor.next();
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
  return field1.name == field2.name && field1.description == field2.description;
}

// Updates the field with the given uuid if provided in the field object. 
// If no uuid is included in the field object., create a new field.
// Also validate input. 
// Return:
// 1. A boolean: true if there were changes from the last published.
// 2. The uuid of the template field created / updated
async function validateAndCreateOrUpdate(field, session) {

  // Field must be an object
  if (!Util.isObject(field)) {
    throw new Util.InputError(`field provided is not an object: ${field}`);
  }

  // If a field uuid is provided, this is an update
  if (field.uuid) {
    // Field uuid must be a valid uuid
    if (!uuidValidate(field.uuid)) {
      throw new Util.InputError("uuid must conform to standard uuid format");
    }

    // Field uuid must exist
    let cursor = await TemplateField.find(
      {"uuid": field.uuid},
      {session}
    );
    if (!(await cursor.hasNext())) {
      throw new Util.NotFoundError(`No field exists with uuid ${field.uuid}`);
    }

    // There should be a maximum of one draft per uuid
    cursor = await TemplateField.find(
      {"uuid": field.uuid, 
      'publish_date': {'$exists': false}});
    if ((await cursor.count()) > 1) {
      throw new Error(`Multiple drafts found of field with uuid ${field.uuid}`);
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
      throw new Util.InputError('field name property must be of type string');
    }
    name = field.name
  }
  if (field.description) {
    if (typeof(field.description) !== 'string'){
      throw new Util.InputError('field description property must be of type string');
    }
    description = field.description
  }

  // Update the template field in the database
  let new_field = {
    uuid: field.uuid,
    name: name,
    description: description,
    updated_at: new Date()
  }

  // If this draft is identical to the latest published, delete it.
  let old_field = await fetchPublishedAndConvertToDraft(field.uuid);
  if (old_field) {
    let changes = !fieldEquals(new_field, old_field);
    if (!changes) {
      // Delete the current draft
      try {
        await draftDelete(field.uuid);
      } catch(err) {
        if (!(err instanceof Util.NotFoundError)) {
          throw err;
        }
      }
      return [false, field.uuid];
    }
  }

  // If a draft of this field already exists: overwrite it, using it's same uuid
  // If a draft of this field doesn't exist: create a new draft
  // Fortunately both cases can be handled with a single MongoDB UpdateOne query using 'upsert: true'
  let response = await TemplateField.updateOne(
    {"uuid": field.uuid, 'publish_date': {'$exists': false}}, 
    {$set: new_field}, 
    {'upsert': true, session}
  );
  if (response.modifiedCount != 1 && response.upsertedCount != 1) {
    throw new Error(`TemplateField.validateAndCreateOrUpdateTemplateField: Modified: ${response.modifiedCount}. Upserted: ${response.upsertedCount}`);
  } 
  return [true, field.uuid];
}

async function draft(uuid, session) {
  let cursor = await TemplateField.find(
    {"uuid": uuid, 'publish_date': {'$exists': false}},
    {session}
  );
  if(!(await cursor.hasNext())) {
    return null;
  } 
  let draft = await cursor.next();
  if (await cursor.hasNext()) {
    throw `TemplateField.draft: Multiple drafts found for field with uuid ${uuid}`;
  }
  return draft;
}

async function draftFetchOrCreate(uuid, session) {

  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }
  
  // See if a draft of this template field exists. 
  let template_field_draft = await draft(uuid, session);

  // If a draft of this template field already exists, return it.
  if (template_field_draft) {
    delete template_field_draft._id;
    return template_field_draft;
  }

  // If a draft of this template field does not exist, create a new template_field_draft from the last published
  template_field_draft = await latestPublished(uuid, session);
  // If not even a published version of this template field was found, return null
  if(!template_field_draft) {
    return null;
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
async function publishField(uuid, session) {
  console.log(`TemplateField.publishField: called for uuid ${uuid}`);
  var return_id;

  let published_field = await latestPublished(uuid, session);

  // Check if a draft with this uuid exists
  let field_draft = await draft(uuid, session);
  if(!field_draft) {
    // There is no draft of this uuid. Get the latest published field instead.
    if (!published_field) {
      throw new Util.NotFoundError(`Field with uuid ${uuid} does not exist`);
    }
    // There is no draft of this uuid. Return the internal id of the last published version instead
    return [published_field._id, false];
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
    console.log(`TemplateField.publishField: updating field with uuid: ${uuid}`);
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

async function uuidFor_id(_id, session) {
  let cursor = await TemplateField.find(
    {"_id": _id}, 
    {session}
  );
  if (!(await cursor.hasNext())) {
    return null;
  }
  let document = await cursor.next();
  return document.uuid;
}

async function publishDateFor_id(_id, session) {
  let cursor = await TemplateField.find(
    {"_id": _id}, 
    {session}
  );
  if (!(await cursor.hasNext())) {
    return null;
  }
  let document = await cursor.next();
  return document.publish_date;
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
exports.uuidFor_id = uuidFor_id;
exports.draft = draftFetchOrCreate;
exports.lastupdateFor = lastupdateFor;
exports.publishDateFor_id = publishDateFor_id;
exports.latestPublished = latestPublished;

// Wraps the request to create with a transaction
exports.create = async function(field) {
  const session = MongoDB.newSession();
  let inserted_uuid;
  try {
    await session.withTransaction(async () => {
      try {
        [_, inserted_uuid] = await validateAndCreateOrUpdate(field, session);
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

// Wraps the request to get with a transaction
exports.draftGet = async function(uuid) {
  const session = MongoDB.newSession();
  try {
    var field;
    await session.withTransaction(async () => {
      try {
        field = await draftFetchOrCreate(uuid, session);
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
exports.update = async function(field) {
  const session = MongoDB.newSession();
  try {
    await session.withTransaction(async () => {
      try {
        await validateAndCreateOrUpdate(field, session);
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
exports.publish = async function(uuid) {
  const session = MongoDB.newSession();
  try {
    var published;
    await session.withTransaction(async () => {
      try {
        [_, published] = await publishField(uuid, session);
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

// Fetches the latest published field with the given uuid. 
exports.publishedBeforeDate = async function(uuid, date) {
  let cursor = await TemplateField.find(
    {"uuid": uuid, 'publish_date': {'$lte': date}}
  ).sort({'publish_date': -1})
  .limit(1);
  if (!(await cursor.hasNext())) {
    return null;
  }
  return await cursor.next();
}

exports.draftDelete = async function(uuid) {
  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  let response = await TemplateField.deleteMany({ uuid, publish_date: {'$exists': false} });
  if (!response.deletedCount) {
    throw new Util.NotFoundError();
  }
  if (response.deletedCount > 1) {
    console.error(`template field draftDelete: Template Field with uuid '${uuid}' had more than one draft to delete.`);
  }
}

exports.lastUpdate = async function(uuid) {
  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  let draft = await draftFetchOrCreate(uuid);
  if(!draft) {
    throw new Util.NotFoundError();
  }

  return draft.updated_at;
}