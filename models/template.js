const MongoDB = require('../lib/mongoDB');
const TemplateFieldModel = require('./template_field');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');

var Template;
var TemplateField;

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

  let draft = published;

  delete draft._id;
  draft.updated_at = draft.publish_date;
  delete draft.publish_date;

  // Replace each of the field _ids with uuids.
  let fields = [];
  for(_id of draft.fields) {
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
  for(_id of draft.related_templates) {
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

// Fetches a template draft 
// If it does not exist, creates a draft from the latest published, saves that in the database and returns it.
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

  let response = await Template.insertOne(
    template_draft,
    {session}
  )
  if (response.insertedCount != 1) {
    throw new Error(`Template.fetchDraftOrCreateFromPublished: should be 1 inserted document. Instead: ${response.insertedCount}`);
  }

  return template_draft;
}

// If a uuid is provided, update the template with the provided uuid.
// Otherwise, create a new template.
// In both cases, validate the given template as well.
// Return the uuid of the template created / updatex
async function validateAndCreateOrUpdateTemplate(template, session) {

  // Template must be an object
  if (!Util.isObject(template)) {
    throw new Util.InputError(`template provided is not an object: ${template}`);
  }

  // If a template uuid is provided, this is an update
  if (template.uuid) {
    // Template must have a valid uuid. 
    if (!uuidValidate(template.uuid)) {
      throw new Util.InputError("each template must have a valid uuid property");
    }
    
    // Template uuid must exist
    let cursor = await Template.find(
      {"uuid": template.uuid},
      {session}
      );
    if (!(await cursor.hasNext())) {
      throw new Util.NotFoundError(`No template exists with uuid ${template.uuid}`);
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
        await TemplateFieldModel.validateAndCreateOrUpdateField(template.fields[i], session);
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
        await validateAndCreateOrUpdateTemplate(template.related_templates[i], session);
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
  return template.uuid;

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
// Note: This does not delete the current draft. It only creates a published version of it. 
async function publishTemplate(uuid, session) {

  var return_id;

  // Check if a draft with this uuid exists
  let template_draft = await templateDraft(uuid, session);
  if(!template_draft) {
    // There is no draft of this uuid. Get the latest published template instead.
    let published_template = await latestPublishedTemplate(uuid, session);
    if (!published_template) {
      throw new Util.NotFoundError(`Template with uuid ${uuid} does not exist`);
    }
    return [published_template.internal_id, false];
  }

  let new_template = template_draft;
  let changes = false;

  // For each template field, publish that field, then replace the uuid with the internal_id.
  // It is possible there weren't any changes to publish, so keep track of whether we actually published anything.
  for (let i = 0; i < new_template.fields.length; i++) {
    let published;
    try {
      [new_template.fields[i], published] = await TemplateFieldModel.publishField(new_template.fields[i], session);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError("Internal reference within this draft is invalid. Fetch/update draft to cleanse it.");
      } else {
        throw err;
      }
    }
    changes = changes || published; 
  } 

  // For each template's related_templates, publish that related_template, then replace the uuid with the internal_id.
  // It is possible there weren't any changes to publish, so keep track of whether we actually published anything.
  for(let i = 0; i < new_template.related_templates.length; i++) {
    let published;
    try {
      [new_template.related_templates[i], published] = await publishTemplate(new_template.related_templates[i], session);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError("Internal reference within this draft is invalid. Fetch/update draft to cleanse it.");
      } else {
        throw err;
      }
    }
    changes = changes || published; 
  }

  // We're trying to figure out if there is anything worth publishing. If none of the sub-properties were published, 
  // see if there are any changes to the top-level template from the previous published version
  if(!changes) {
    let published_template = await latestPublishedTemplate(uuid, session);
    if (published_template) {
      return_id = published_template._id;
      if (new_template.name != published_template.name || 
        new_template.description != published_template.description ||
          !Util.arrayEqual(new_template.fields, published_template.fields) || 
          !Util.arrayEqual(new_template.related_templates, published_template.related_templates)) {
        changes = true;
      }
    } else {
      changes = true;
    }
  }

  // If there are changes, publish the current draft
  if(changes) {
    let publish_time = new Date();
    new_template.updated_at = publish_time;
    new_template.publish_date = publish_time;
    delete new_template._id;
    let response = await Template.insertOne(new_template, {session});
    if (response.insertedCount != 1) {
      throw `Template.publishTemplate: should be 1 inserted document. Instead: ${response.insertedCount}`;
    }
    return_id = response.insertedId;
    response = await Template.updateOne(
      {"uuid": uuid, 'publish_date': {'$exists': false}},
      {'$set': {'updated_at': publish_time}},
      {session}
    )
    if (response.modifiedCount != 1) {
      throw `Template.publishTemplate: should be 1 modified document. Instead: ${response.modifiedCount}`;
    }
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

// TODO: When permissions come into play, aggregate drafts for sub-templates/fields that the user has permission for,
// and published templates for the ones they don't

// Fetches the template draft with the given uuid, recursively looking up fields and related_templates.
// If a draft of a given template doesn't exist, a new one will be created using the last published template.
async function templateDraftFetchOrCreate(uuid, session) {

  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  // TODO: refactor to use fetchDraftOrCreateFromPublished

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
  let template_draft = await templateDraft(uuid, session);
  let draft_existing = template_draft ? true: false;

  // If a draft of this template does not exist, create a new template_draft from the last published
  if(!template_draft) {
    
    template_draft = await latestPublishedTemplate(uuid, session);

    // If not even a published version of this template was found, return null
    if(!template_draft) {
      return null;
    }

    // Remove the internal_id and publish_date from this template, as we plan to insert this as a draft now. 
    delete template_draft._id;
    delete template_draft.publish_date;

    // Replace each of the field _ids with uuids.
    let fields = [];
    for(_id of template_draft.fields) {
      let uuid = TemplateFieldModel.uuidFor_id(_id);
      if(uuid) {
        fields.push(uuid);
      } else {
        console.log(`Failed to find a template field with internal id ${_id}. Therefore, removing the reference to it from template with uuid ${template_draft.uuid}`);
      }
    }
    template_draft.fields = fields;

    // Replace each of the related_template _ids with uuids. 
    let related_templates = [];
    for(_id of template_draft.related_templates) {
      let uuid = uuidFor_id(_id);
      if(uuid) {
        related_templates.push(uuid);
      } else {
        console.log(`Failed to find a template with internal id ${_id}. Therefore, removing the reference to it from template with uuid ${template_draft.uuid}`);
      }
    }
    template_draft.related_templates = related_templates;
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

  // If we are fetching an existing draft, then any existing references that are bad pointers need to be removed
  if(draft_existing) {
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
  }
  // If we are creating a new draft from a published_draft, then we also need to insert this draft. 
  else {
    template_draft.fields = field_uuids;
    template_draft.related_templates = related_template_uuids;
    template_draft.updated_at = new Date();

    let response = await Template.insertOne(
      template_draft,
      {session}
    )
    if (response.insertedCount != 1) {
      throw `Template.templateDraftFetchOrCreate: should be 1 inserted document. Instead: ${response.insertedCount}`;
    }
  }

  template_draft.fields = fields;
  template_draft.related_templates = related_templates;
  delete template_draft._id;

  return template_draft;

}

// TODO: write integration tests for this function
// TODO: refactor fethch to use fetchDraftOrCreateFromPublished
// TODO: refactor publish to chck for the update timestamp and write an integration test.
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

exports.templateDraftDelete = async function(uuid) {

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
        inserted_uuid = await validateAndCreateOrUpdateTemplate(template, session);
      } catch(err) {
        console.log('aborting transaction...');
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
        console.log('aborting transaction...');
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
        console.log('aborting transaction...');
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
        console.log('aborting transaction...');
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
        console.log('aborting transaction...');
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

exports.latestPublishedTemplate = latestPublishedTemplateWithJoins;
exports.publishedTemplateBeforeDate = latestPublishedTemplateBeforeDateWithJoins;