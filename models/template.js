const MongoDB = require('../lib/mongoDB');
const TemplateFieldModel = require('./template_field');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');

var Template;

// Returns a reference to the template Mongo Collection
async function collection() {
  if (Template === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('templates');
    } catch(e) {}
    Template = db.collection('templates');
  }
  return Template;
}

exports.init = async function() {
  Template = await collection();
  TemplateField = await TemplateFieldModel.collection();
}

async function uuidFor_id(_id, session) {
  let cursor = await Template.find(
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
  let cursor = await Template.find(
    {"_id": _id}, 
    {session}
  );
  if (!(await cursor.hasNext())) {
    return null;
  }
  let document = await cursor.next();
  return document.publish_date;
}

// Fetches the latest published template with the given uuid. 
// Does not look up fields or related_templates
async function latestPublishedTemplate(uuid, session) {
  let cursor = await Template.find(
    {"uuid": uuid, 'publish_date': {'$exists': true}}, 
    {session}
  ).sort({'publish_date': -1})
  .limit(1);
  if (!(await cursor.hasNext())) {
    return null;
  }
  return await cursor.next();
}

// Fetches the template draft with the given uuid. 
// Does not look up fields or related_templates
async function templateDraft(uuid, session) {
  let cursor = await Template.find(
    {"uuid": uuid, 'publish_date': {'$exists': false}}, 
    {session}
  );

  if(!(await cursor.hasNext())) {
    return null;
  } 
  let draft = await cursor.next();
  if (await cursor.hasNext()) {
    throw `Template.templateDraft: Multiple drafts found for template with uuid ${uuid}`;
  }
  return draft;
}

// Creates a draft from the published version.
async function createDraftFromPublished(published) {

  // Create a copy of published
  let draft = Object.assign({}, published);

  delete draft._id;
  draft.updated_at = draft.publish_date;
  delete draft.publish_date;

  // Replace each of the field _ids with uuids.
  let fields = [];
  for(_id of published.fields) {
    let uuid = await TemplateFieldModel.uuidFor_id(_id);
    if(uuid) {
      fields.push(uuid);
    } else {
      console.log(`Failed to find a template field with internal id ${_id}. Therefore, removing the reference to it from template with uuid ${draft.uuid}`);
    }
  }
  draft.fields = fields;

  // Replace each of the related_template _ids with uuids. 
  let related_templates = [];
  for(_id of published.related_templates) {
    let uuid = await uuidFor_id(_id);
    if(uuid) {
      related_templates.push(uuid);
    } else {
      console.log(`Failed to find a template with internal id ${_id}. Therefore, removing the reference to it from template with uuid ${draft.uuid}`);
    }
  }
  draft.related_templates = related_templates;

  return draft;

}

async function fetchPublishAndConvertToDraft(uuid, session) {
  let published_template = await latestPublishedTemplate(uuid, session);
  if(!published_template) {
    return null;
  }

  return (await createDraftFromPublished(published_template));
}

// Fetches a template draft 
// If it does not exist, it creates a draft from the latest published.
// Does not lookup fields or related_templates
async function fetchDraftOrCreateFromPublished(uuid, session) {
  let template_draft = await templateDraft(uuid, session);
  if(template_draft) {
    return template_draft;
  }

  let published_template = await latestPublishedTemplate(uuid, session);
  if(!published_template) {
    return null;
  }
  template_draft = await createDraftFromPublished(published_template);

  return template_draft;
}

// Returns true if the template exists
async function templateExists(uuid, session) {
    let cursor = await Template.find(
      {"uuid": uuid},
      {session}
      );
    return (await cursor.hasNext());
}

// Returns true if the provided templates are equal
function templateEquals(template_1, template_2) {
  return template_1.uuid == template_2.uuid && 
         template_1.name == template_2.name &&
         template_1.description == template_2.description &&
         Util.arrayEqual(template_1.fields, template_2.fields) &&
         Util.arrayEqual(template_1.related_templates, template_2.related_templates);
}

// Returns true if the draft has any changes from it's previous published version
async function draftDifferentFromLastPublished(draft) {
  // If there is no published version, obviously there are changes
  let latest_published = await latestPublishedTemplate(draft.uuid);
  if(!latest_published) {
    return true;
  }

  // If the properties have changed since the last publishing
  let latest_publish_as_draft = await createDraftFromPublished(latest_published);
  if (!templateEquals(draft, latest_publish_as_draft)) {
    return true;
  }

  // Finally, if any of the dependencies have been published more recently than this template, then there are changes
  let last_publish_date = latest_published.publish_date;
  for(let field of draft.fields) {
    let field_last_published = (await TemplateFieldModel.latestPublishedTemplateField(field)).publish_date;
    if (Util.compareTimeStamp(field_last_published, last_publish_date) > 0) {
      return true;
    }
  }

  for(let related_template of draft.related_templates) {
    let related_template_last_published = (await latestPublishedTemplate(related_template)).publish_date;
    if (Util.compareTimeStamp(related_template_last_published, last_publish_date) > 0) {
      return true;
    }
  }

  return false;
}

async function templateUUIDsThatReference(uuid) {
  // Get the last 3 _ids associated with this uuid. Then use those _ids to find the uuids of the templates referencing this template.

  // First, get the three _ids last published by this uuid
  let pipeline = [
    {
      '$match': { 
        uuid,
        "publish_date": {"$exists": true}
      }
    },
    {
      '$sort' : { 'publish_date' : -1}
    },
    {
      '$limit' : 3
    },
    {
      '$group' : { '_id': null, 'ids' : { "$push": "$_id"}}
    }
  ]
  let response = (await Template.aggregate(pipeline).toArray());
  let ids;
  try {
    ids = response[0].ids;
  } catch(error) {
    return [];
  }

  // Look for the uuids of the templates that reference those _ids
  pipeline = [
    {
      '$match': { 
        'related_templates': {"$in": ids}
      }
    },
    {
      '$project' : { 'uuid' : true, "_id": false }
    },
    {
      '$group' : { '_id' : "$uuid"}
    },
    {
      '$group' : { '_id': null, 'uuids' : { "$push": "$_id"}}
    }
  ]
  response = (await Template.aggregate(pipeline).toArray());
  let uuids;
  try {
    uuids = response[0].uuids;
  } catch(error) {
    return [];
  }
  return uuids;
}

async function createDraftFromLastPublished(uuid, session) {
  let draft = await templateDraftFetchOrCreate(uuid, session);
  await validateAndCreateOrUpdateTemplate(draft, session);
}

async function createDraftFromLastPublishedWithSession(uuid) {
  const session = MongoDB.newSession();
  try {
    await session.withTransaction(async () => {
      try {
        await createDraftFromLastPublished(uuid, session);
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

// If a uuid is provided, update the template with the provided uuid.
// Otherwise, create a new template.
// If the updated template is the same as the last published, delete the draft instead of updating. 
// In both cases, validate the given template as well.
// Return:
// 1. A boolean indicating true if there were changes from the last published.
// 2. The uuid of the template created / updated
async function validateAndCreateOrUpdateTemplate(template, session) {

  // Template must be an object
  if (!Util.isObject(template)) {
    // if (uuidValidate(template.uuid)) {
    //   return [false, template]
    // }
    throw new Util.InputError(`template provided is not an object or a valid uuid: ${template}`);
  }

  // If a template uuid is provided, this is an update
  if (template.uuid) {
    // Template must have a valid uuid. 
    if (!uuidValidate(template.uuid)) {
      throw new Util.InputError("each template must have a valid uuid property");
    }
    
    // Template uuid must exist
    if (!(await templateExists(template.uuid, session))) {
      throw new Util.NotFoundError(`No template exists with uuid ${template.uuid}`);
    }
  }
  // Otherwise, this is a create, so generate a new uuid
  else {
    template.uuid = uuidv4();
  }

  // Need to determine if this draft is any different from the published one.
  let changes = false;

  // Populate template properties
  let name = "";
  let description = "";
  let fields = [];
  let related_templates = [];
  if (template.name !== undefined) {
    if (typeof(template.name) !== 'string'){
      throw new Util.InputError('name property must be of type string');
    }
    name = template.name
  }
  if (template.description !== undefined) {
    if (typeof(template.description) !== 'string'){
      throw new Util.InputError('description property must be of type string');
    }
    description = template.description
  }
  // Reursively handle each of the fields
  if (template.fields !== undefined) {
    if (!Array.isArray(template.fields)){
      throw new Util.InputError('fields property must be of type array');
    }
    for (let i = 0; i < template.fields.length; i++) {
      try {
        changes |= (await TemplateFieldModel.validateAndCreateOrUpdateField(template.fields[i], session))[0];
      } catch(err) {
        if (err instanceof Util.NotFoundError) {
          throw new Util.InputError(err.message);
        } else {
          throw err;
        }
      }
      // After validating and updating the field, replace the imbedded field with a uuid reference
      template.fields[i] = template.fields[i].uuid
    }
    fields = template.fields
  }
  // Reursively handle each of the related_templates
  if (template.related_templates !== undefined) {
    if (!Array.isArray(template.related_templates)){
      throw new Util.InputError('related_templates property must be of type array');
    }
    for (let i = 0; i < template.related_templates.length; i++) {
      try {
        changes |= (await validateAndCreateOrUpdateTemplate(template.related_templates[i], session))[0];
      } catch(err) {
        if (err instanceof Util.NotFoundError) {
          throw new Util.InputError(err.message);
        } else {
          throw err;
        }
      }
      // After validating and updating the related_template, replace the imbedded related_template with a uuid reference
      template.related_templates[i] = template.related_templates[i].uuid
    }
    related_templates = template.related_templates
  }

  // Ensure there is only one draft of this template. If there are multiple drafts, that is a critical error.
  cursor = await Template.find({"uuid": template.uuid, 'publish_date': {'$exists': false}});
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

  // If this draft is identical to the latest published, delete it.
  // The reason to do so is so when a change is submitted, we won't create drafts of sub-templates.
  // We notify the user when a draft is created so they can publish it. So we don't want to create sub-template drafts
  // every time a parent draft is updated.
  if (!changes) {
    changes = await draftDifferentFromLastPublished(new_template);
    if (!changes) {
      // Delete the current draft
      try {
        await templateDraftDelete(template.uuid);
      } catch (err) {
        if (!(err instanceof Util.NotFoundError)) {
          throw err;
        }
      }
      return [false, null];
    }
  }

  // If a draft of this template already exists: overwrite it, using it's same uuid
  // If a draft of this template doesn't exist: create a new draft
  // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
  let response = await Template.updateOne(
    {"uuid": template.uuid, 'publish_date': {'$exists': false}}, 
    {$set: new_template}, 
    {'upsert': true, session}
  );
  if (response.modifiedCount != 1 && response.upsertedCount != 1) {
    throw `Template.validateAndCreateOrUpdateTemplate: Modified: ${response.modifiedCount}. Upserted: ${response.upsertedCount}`;
  } 

  // If successfull, return the uuid of the created / updated template
  return [true, template.uuid];

}

// Publishes the template with the provided uuid
//   If a draft exists of the template, then:
//     if that draft has changes from the latest published (including changes to it's sub-properties):
//       publish it, and return the new internal_id
//     else: 
//       return the internal_id of the latest published
//   else:
//     return the internal_id of the latest_published
// Input: 
//   uuid: the uuid of a template to be published
//   session: the mongo session that must be used to make transactions atomic
// Returns:
//   internal_id: the internal id of the published template
//   published: true if a new published version is created. false otherwise
async function publishTemplate(uuid, session) {

  var return_id;

  var last_published_time = 0;

  let published_template = await latestPublishedTemplate(uuid, session);

  // Check if a draft with this uuid exists
  let template_draft = await templateDraft(uuid, session);
  if(!template_draft) {
    // There is no draft of this uuid. Return the latest published template instead.
    if (!published_template) {
      throw new Util.NotFoundError(`Template with uuid ${uuid} does not exist`);
    }
    return [published_template._id, false];
  }
  if(published_template) {
    last_published_time = published_template.publish_date;
  }

  let changes = false;
  let fields = [];
  let related_templates = [];

  // For each template field, publish that field, then replace the uuid with the internal_id.
  // It is possible there weren't any changes to publish, so keep track of whether we actually published anything.
  for (let field of template_draft.fields) {
    try {
      field = await TemplateFieldModel.publishField(field, session);
      fields.push(field);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError("Internal reference within this draft is invalid. Fetch/update draft to cleanse it.");
      } else {
        throw err;
      }
    }

    if (TemplateFieldModel.publishDateFor_id(field) > last_published_time) {
      changes = true;
    }
  } 

  // For each template's related_templates, publish that related_template, then replace the uuid with the internal_id.
  // It is possible there weren't any changes to publish, so keep track of whether we actually published anything.
  for(let related_template of template_draft.related_templates) {
    try {
      [related_template, _] = await publishTemplate(related_template, session);
      related_templates.push(related_template);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError("Internal reference within this draft is invalid. Fetch/update draft to cleanse it.");
      } else {
        throw err;
      }
    }
    if (publishDateFor_id(related_template) > last_published_time) {
      changes = true;
    }
  }

  // We're trying to figure out if there is anything worth publishing. If none of the sub-properties were published, 
  // see if there are any changes to the top-level template from the previous published version
  if(!changes) {
    let published_template = await latestPublishedTemplate(uuid, session);
    if (published_template) {
      return_id = published_template._id;
      if (template_draft.name != published_template.name || 
        template_draft.description != published_template.description ||
          !Util.arrayEqual(fields, published_template.fields) || 
          !Util.arrayEqual(related_templates, published_template.related_templates)) {
        changes = true;
      }
    } else {
      changes = true;
    }
  }

  // If there are changes, publish the current draft
  if(changes) {
    let publish_time = new Date();
    let response = await Template.updateOne(
      {"_id": template_draft._id},
      {'$set': {'updated_at': publish_time, 'publish_date': publish_time, fields, related_templates}},
      {session}
    )
    if (response.modifiedCount != 1) {
      throw `Template.publishTemplate: should be 1 modified document. Instead: ${response.modifiedCount}`;
    }
    return_id = template_draft._id;
  }

  return [return_id, changes];

}

// Fetches the last template with the given uuid published before the given date. 
// Also recursively looks up fields and related_templates.
async function latestPublishedTemplateBeforeDateWithJoins(uuid, date) {
  // Validate uuid and date are valid
  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }
  if (!Util.isValidDate(date)) {
    throw new Util.InputError('The date provided is not a valid date.');
  }

  // Construct a mongodb aggregation pipeline that will recurse into related templates up to 5 levels deep.
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
    },
    {
      '$lookup': {
        'from': "template_fields",
        'foreignField': "_id",
        'localField': "fields",
        'as': "fields"
      }
    }
  ]

  let current_pipeline = pipeline;

  let pipeline_addon = {
    '$lookup': {
      'from': "templates",
      'let': { 'ids': "$related_templates"},
      'pipeline': [
        { 
          '$match': { 
            '$expr': { 
              '$and': [
                { '$in': [ "$_id",  "$$ids" ] },
              ]
            }
          }
        },
        {
          '$lookup': {
            'from': "template_fields",
            'foreignField': "_id",
            'localField': "fields",
            'as': "fields"
          },
        }
      ],
      'as': "related_templates"
    }
  }

  for(let i = 0; i < 5; i++) {
    // go one level deeper into related_templates
    current_pipeline.push(pipeline_addon);
    current_pipeline = pipeline_addon['$lookup']['pipeline'];
    // create a copy
    pipeline_addon = JSON.parse(JSON.stringify(pipeline_addon));
  }
  let response = await Template.aggregate(pipeline);
  if (await response.hasNext()){
    return await response.next();
  } else {
    throw new Util.NotFoundError('No template exists with the uuid provided which was published before the provided date.');
  }
}

// Fetches the last published template with the given uuid. 
// Also recursively looks up fields and related_templates.
async function latestPublishedTemplateWithJoins(uuid) {
  return await latestPublishedTemplateBeforeDateWithJoins(uuid, new Date());
}

// TODO: When permissions come into play, aggregate drafts for sub-templates/fields that the user has permission for,
// and published templates for the ones they don't

// Fetches the template draft with the given uuid, recursively looking up fields and related_templates.
// If a draft of a given template doesn't exist, a new one will be generated using the last published template.
async function templateDraftFetchOrCreate(uuid, session) {

  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  // For each template in the tree:
  //   a. If a draft of this template exists:
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
  let template_draft = await fetchDraftOrCreateFromPublished(uuid, session);
  if (!template_draft) {
    return null;
  }

  // Now recurse into each field, replacing each uuid with an imbedded object
  let fields = [];
  let field_uuids = [];
  for(let i = 0; i < template_draft.fields.length; i++) {
    let field = await TemplateFieldModel.templateFieldDraft(template_draft.fields[i], session);
    if (field) {
      fields.push(field);
      field_uuids.push(field.uuid);
    } else {
      console.log(`Failed to find a template field with uuid ${field}. Therefore, removing the reference to it from template with uuid ${template_draft.uuid}`);
    }
  }

  // Now recurse into each related_template, replacing each uuid with an imbedded object
  let related_templates = [];
  let related_template_uuids = [];
  for(let i = 0; i < template_draft.related_templates.length; i++) {
    let related_template = await templateDraftFetchOrCreate(template_draft.related_templates[i], session);
    if (related_template) {
      related_templates.push(related_template);
      related_template_uuids.push(related_template.uuid);
    } else {
      console.log(`Failed to find a template with uuid ${uuid}. Therefore, removing the reference to it from template with uuid ${template_draft.uuid}`);
    }
  }

  // Any existing references that are bad pointers need to be removed
  let update = {};
  if(template_draft.fields.length != field_uuids.length) {
    update.fields = field_uuids;
  } 
  if (template_draft.related_templates.length != related_template_uuids.length) {
    update.related_templates = related_template_uuids;
  }
  if(update.fields || update.related_templates) {
    template_draft.updated_at = new Date()
    update.updated_at = template_draft.updated_at;
    let response = await Template.updateOne(
      {'_id': template_draft._id},
      {
        '$set': update
      },
      {session}
    );
    if (response.modifiedCount != 1) {
      throw `Template.templateDraftFetchOrCreate: should be 1 modified document. Instead: ${response.modifiedCount}`;
    }
  }

  template_draft.fields = fields;
  template_draft.related_templates = related_templates;
  delete template_draft._id;

  return template_draft;

}

// This function will provide the timestamp of the last update made to this template and all of it's sub-properties
async function templateLastUpdate(uuid, session) {

  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  let draft = await fetchDraftOrCreateFromPublished(uuid, session);
  if(!draft) {
    throw new Util.NotFoundError();
  }

  let last_update = draft.updated_at;
  for(uuid of draft.fields) {
    try {
      let update = await templateFieldLastUpdate(uuid);
      if (update > last_update){
        last_update = update;
      }
    } catch (err) {
      if (!(err instanceof Util.NotFoundError)) {
        throw err;
      }
    }
  }
  for(uuid of draft.related_templates) {
    try {
      let update = await templateLastUpdate(uuid, session);
      if (update > last_update){
        last_update = update;
      }
    } catch (err) {
      if (!(err instanceof Util.NotFoundError)) {
        throw err;
      }
    }
  }

  return last_update;

}

async function templateDraftDelete(uuid) {

  let response = await Template.deleteMany({ uuid, publish_date: {'$exists': false} });
  if (!response.deletedCount) {
    throw new Util.NotFoundError();
  }
  if (response.deletedCount > 1) {
    console.error(`templateDraftDelete: Template with uuid '${uuid}' had more than one draft to delete.`);
  }
}

// Wraps the actual request to create with a transaction
exports.templateCreateWithTransaction = async function(template) {
  const session = MongoDB.newSession();
  let inserted_uuid;
  try {
    await session.withTransaction(async () => {
      try {
        [_, inserted_uuid] = await validateAndCreateOrUpdateTemplate(template, session);
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

// Wraps the actual request to update with a transaction
exports.templateUpdateWithTransaction = async function(template) {
  const session = MongoDB.newSession();
  try {
    await session.withTransaction(async () => {
      try {
        await validateAndCreateOrUpdateTemplate(template, session);
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

// Wraps the actual request to get with a transaction
exports.templateDraftGetWithTransaction = async function(uuid) {
  const session = MongoDB.newSession();
  try {
    var template
    await session.withTransaction(async () => {
      try {
        template = await templateDraftFetchOrCreate(uuid, session);
      } catch(err) {
        await session.abortTransaction();
        throw err;
      }
    });
    session.endSession();
    return template;
  } catch(err) {
    session.endSession();
    throw err;
  }
}

// Wraps the actual request to publish with a transaction
exports.templatePublishWithTransaction = async function(uuid) {
  const session = MongoDB.newSession();
  try {
    var published;
    await session.withTransaction(async () => {
      try {
        [_, published] = await publishTemplate(uuid, session);
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

// Wraps the actual request to getUpdate with a transaction
exports.templateLastUpdateWithTransaction = async function(uuid) {
  const session = MongoDB.newSession();
  try {
    var update;
    await session.withTransaction(async () => {
      try {
        update = await templateLastUpdate(uuid, session);
      } catch(err) {
        await session.abortTransaction();
        throw err;
      }
    });
    session.endSession();
    return update;
  } catch(err) {
    session.endSession();
    throw err;
  }
}

exports.templateUpdateTemplatesThatReferenceThis = async function(uuid) {
  // Get a list of templates that reference them.
  let uuids = await templateUUIDsThatReference(uuid);
  // For each template, create a draft if it doesn't exist
  for(uuid of uuids) {
    // TODO: when time starts being a problem, move this into a queue OR just remove the await statement.
    try {
      await createDraftFromLastPublishedWithSession(uuid);
    } catch(err) {
      console.error(err);
    }
  }

}

exports.templateDraftExisting = async function(uuid) {
  return (await templateDraft(uuid)) ? true : false;
}

exports.latestPublishedTemplate = latestPublishedTemplateWithJoins;
exports.publishedTemplateBeforeDate = latestPublishedTemplateBeforeDateWithJoins;
exports.templateDraftDelete = templateDraftDelete;