const MongoDB = require('../lib/mongoDB');
const TemplateFieldModel = require('./template_field');
const PermissionGroupModel = require('./permission_group');
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
async function latestPublished(uuid, session) {
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
async function draft(uuid, session) {
  let cursor = await Template.find(
    {"uuid": uuid, 'publish_date': {'$exists': false}}, 
    {session}
  );

  if(!(await cursor.hasNext())) {
    return null;
  } 
  let draft = await cursor.next();
  if (await cursor.hasNext()) {
    throw `Template.draft: Multiple drafts found for template with uuid ${uuid}`;
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
  let published_template = await latestPublished(uuid, session);
  if(!published_template) {
    return null;
  }

  return (await createDraftFromPublished(published_template));
}

// Fetches a template draft 
// If it does not exist, it creates a draft from the latest published.
// Does not lookup fields or related_templates
async function fetchDraftOrCreateFromPublished(uuid, session) {
  let template_draft = await draft(uuid, session);
  if(template_draft) {
    return template_draft;
  }

  let published_template = await latestPublished(uuid, session);
  if(!published_template) {
    return null;
  }
  template_draft = await createDraftFromPublished(published_template);

  return template_draft;
}

// Returns true if the template exists
async function exists(uuid, session) {
  let cursor = await Template.find(
    {"uuid": uuid},
    {session}
    );
  return (await cursor.hasNext());
}

// Returns true if the provided templates are equal
function equals(template_1, template_2) {
  return template_1.uuid == template_2.uuid && 
         template_1.name == template_2.name &&
         template_1.description == template_2.description &&
         template_1.public_date == template_2.public_date &&
         Util.arrayEqual(template_1.fields, template_2.fields) &&
         Util.arrayEqual(template_1.related_templates, template_2.related_templates);
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

  // Finally, if any of the dependencies have been published more recently than this template, then there are changes
  let last_publish_date = latest_published.publish_date;
  for(let field of draft.fields) {
    let field_last_published = (await TemplateFieldModel.latestPublishedWithoutPermissions(field)).publish_date;
    if (Util.compareTimeStamp(field_last_published, last_publish_date) > 0) {
      return true;
    }
  }

  for(let related_template of draft.related_templates) {
    let related_template_last_published = (await latestPublished(related_template)).publish_date;
    if (Util.compareTimeStamp(related_template_last_published, last_publish_date) > 0) {
      return true;
    }
  }

  return false;
}

async function templateUUIDsThatReference(uuid, templateOrField) {
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
  let response;
  if (templateOrField == 'template') {
    response = (await Template.aggregate(pipeline).toArray());
  } else if (templateOrField == 'template_field') {
    response = (await TemplateField.aggregate(pipeline).toArray());
  } else {
    throw new Error(`templateUUIDsThatReference: templateOrField value is invalid: ${templateOrField}`);
  }
  let ids;
  try {
    ids = response[0].ids;
  } catch(error) {
    return [];
  }

  // Look for the uuids of the templates that reference those _ids
  let property;
  if (templateOrField == 'template') {
    property = 'related_templates';
  } else if (templateOrField == 'template_field') {
    property = 'fields';
  } else {
    throw new Error(`templateUUIDsThatReference: templateOrField value is invalid: ${templateOrField}`);
  }
  pipeline = [
    {
      '$match': { 
        [property]: {"$in": ids}
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
  let draft = await draftFetchOrCreate(uuid, session);
  await validateAndCreateOrUpdate(draft, session);
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

async function userHasAccessToPublishedTemplate(template, user) {
  // If public, then automatic yes
  if (template.public_date && Util.compareTimeStamp((new Date).getTime(), template.public_date)){
    return true;
  }

  // Otherwise, check, if we have view permissions
  return await PermissionGroupModel.has_permission(user, template.uuid, PermissionGroupModel.PERMISSION_VIEW);
}

// If a uuid is provided, update the template with the provided uuid.
// Otherwise, create a new template.
// If the updated template is the same as the last published, delete the draft instead of updating. 
// In both cases, validate the given template as well.
// Return:
// 1. A boolean indicating true if there were changes from the last published.
// 2. The uuid of the template created / updated
async function validateAndCreateOrUpdate(template, user, session) {

  // Template must be an object
  if (!Util.isObject(template)) {
    // if (uuidValidate(template.uuid)) {
    //   return [false, template]
    // }
    throw new Util.InputError(`template provided is not an object: ${template}`);
  }

  // If a template uuid is provided, this is an update
  if (template.uuid) {
    // Template must have a valid uuid. 
    if (!uuidValidate(template.uuid)) {
      throw new Util.InputError("each template must have a valid uuid property");
    }
    
    // Template uuid must exist
    if (!(await exists(template.uuid, session))) {
      throw new Util.NotFoundError(`No template exists with uuid ${template.uuid}`);
    }
    
    // verify that this user is in the 'edit' permission group
    if (!(await PermissionGroupModel.has_permission(user, template.uuid, PermissionGroupModel.PERMISSION_EDIT))) {
      // TODO: probably at some point there should be 2 error codes here. 
      // 1: the user linked a public template. In this case assume they just want to link it without making changes
      // 2. the user linked a draft. In this case they're trying to make a change without permission.
      throw new Util.PermissionDeniedError(`Do not have edit permissions for template uuid: ${template.uuid}`);
    }
  }
  // Otherwise, this is a create
  else {
    // Generate a uuid for the new template
    template.uuid = uuidv4();
    // create a permissions group for the new template
    // TODO: can I think of a way to test that this was done with the session?
    await PermissionGroupModel.initialize_permissions_for(user, template.uuid, session);
  }

  // Need to determine if this draft is any different from the published one.
  let changes = false;

  // Populate template properties
  let name = "";
  let description = "";
  let public_date;
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
  if (template.public_date) {
    if (!Date.parse(template.public_date)){
      throw new Util.InputError('template public_date property must be in valid date format');
    }
    public_date = new Date(template.public_date);
  }
  // Reursively handle each of the fields
  if (template.fields !== undefined) {
    if (!Array.isArray(template.fields)){
      throw new Util.InputError('fields property must be of type array');
    }
    for (let i = 0; i < template.fields.length; i++) {
      try {
        changes |= (await TemplateFieldModel.validateAndCreateOrUpdate(template.fields[i], user, session))[0];
      } catch(err) {
        if (err instanceof Util.NotFoundError) {
          throw new Util.InputError(err.message);
        } else if (err instanceof Util.PermissionDeniedError) {

        } else {
          throw err;
        }
      }
      // After validating and updating the field, replace the imbedded field with a uuid reference
      template.fields[i] = template.fields[i].uuid
    }
    fields = template.fields
    // It is a requirement that no field be repeated. Verify this
    let field_uuids = new Set();
    for(let field of fields) {
      if(field_uuids.has(field)) {
        throw new Util.InputError(`Each template may only have one instance of any template field. Field ${field} duplicated`);
      }
      field_uuids.add(field);
    }
  }
  // Reursively handle each of the related_templates
  if (template.related_templates !== undefined) {
    if (!Array.isArray(template.related_templates)){
      throw new Util.InputError('related_templates property must be of type array');
    }
    for (let i = 0; i < template.related_templates.length; i++) {
      try {
        changes |= (await validateAndCreateOrUpdate(template.related_templates[i], user, session))[0];
      } catch(err) {
        if (err instanceof Util.NotFoundError) {
          throw new Util.InputError(err.message);
        } else if (err instanceof Util.PermissionDeniedError) {
          // If the user doesn't have edit permissions, assume they want to link the published version of the template, or keep something another editor added
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
    throw new Exception(`Template.validateAndCreateOrUpdate: Multiple drafts found of template with uuid ${template.uuid}`);
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
  if (public_date) {
    new_template.public_date = public_date;
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
        await draftDelete(template.uuid);
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
    throw `Template.validateAndCreateOrUpdate: Modified: ${response.modifiedCount}. Upserted: ${response.upsertedCount}`;
  } 

  // If successfull, return the uuid of the created / updated template
  return [true, template.uuid];

}

// Publishes the template with the provided uuid
//   If a draft exists of the template, the user has edit permissions, and the draft has some changes, publish it
//   If a draft doesn't exist, doesn't have changes, or the user doesn't have edit permissions, return the latest published instead
//   If a draft doesn't exist or the user doesn't have edit permissions, then ensure they have view permissions for the published template
// Input: 
//   uuid: the uuid of a template to be published
//   session: the mongo session that must be used to make transactions atomic
// Returns:
//   internal_id: the internal id of the published template
async function publishRecursor(uuid, user, session) {

  var return_id;

  var last_published_time = 0;

  let published_template = await latestPublished(uuid, session);

  let template_draft = await draft(uuid, session);

  // If a draft of this template doesn't exist, we'll use the published template instead
  if(!template_draft) {
    // There is no draft of this uuid. Return the latest published template instead.
    if (!published_template) {
      throw new Util.NotFoundError(`Template with uuid ${uuid} does not exist`);
    }
    if(!(await userHasAccessToPublishedTemplate(published_template, user))) {
      throw new Util.PermissionDeniedError(`cannot link template with uuid ${uuid}. Requires at least view permissions.`);
    }
    return published_template._id;
  }

  // If a user doesn't have edit access to this template, we'll use the published template instead
  if(!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT))) {
    // There is no draft of this uuid. Return the latest published template instead.
    if (!published_template) {
      throw new Util.InputError(`Do not have access to template draft with uuid ${uuid}, and no published version exists`);
    }
    if(!(await userHasAccessToPublishedTemplate(published_template, user))) {
      throw new Util.PermissionDeniedError(`cannot link template with uuid ${uuid}. Requires at least view permissions.`);
    }
    return published_template._id;
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
      [field, _] = await TemplateFieldModel.publishField(field, session, null, user);
      fields.push(field);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError("Internal reference within this draft is invalid. Fetch/update draft to cleanse it.");
      } else if (err instanceof Util.PermissionDeniedError) {
        // If the user doesn't have permissions, assume they want to link the published version of the field
        // But before we can link the published version of the field, we must make sure it exists and we have view access
        let published_field = await TemplateFieldModel.latestPublishedWithoutPermissions(field, session);
        if(!published_field) {
          throw new Util.InputError(`you do not have edit permissions to the draft of template_field ${uuid}, and a published version does not exist.`);
        }
        fields.push(published_field._id);
      } else {
        throw err;
      }
    }
    // TODO: this should be an async call. Add a test case for it and make it await
    if (TemplateFieldModel.publishDateFor_id(field) > last_published_time) {
      changes = true;
    }
  } 

  // For each template's related_templates, publish that related_template, then replace the uuid with the internal_id.
  // It is possible there weren't any changes to publish, so keep track of whether we actually published anything.
  for(let related_template of template_draft.related_templates) {
    try {
      related_template = await publishRecursor(related_template, user, session);
      related_templates.push(related_template);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError("Internal reference within this draft is invalid. Fetch/update draft to cleanse it.");
      } else if (err instanceof Util.PermissionDeniedError) {

        // If the user doesn't have permissions, assume they want to link the published version of the template
        // But before we can link the published version of the template, we must make sure it exists
        let related_template_published = await latestPublished(related_template);
        if(!related_template_published) {
          throw new Util.InputError(`published template does not exist with uuid ${related_template}`);
        }
        related_templates.push(related_template_published._id);
      } else {
        throw err;
      }
    }
    // TODO: this should be an async call. Add a test case for it and make it await
    if (publishDateFor_id(related_template) > last_published_time) {
      changes = true;
    }
  }

  // We're trying to figure out if there is anything worth publishing. If none of the sub-properties were published, 
  // see if there are any changes to the top-level template from the previous published version
  if(!changes) {
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
      throw `Template.publish: should be 1 modified document. Instead: ${response.modifiedCount}`;
    }
    return_id = template_draft._id;
  }

  return return_id;

}

// Publishes the template with the provided uuid
// Input: 
//   uuid: the uuid of a template to be published
//   session: the mongo session that must be used to make transactions atomic
//   last_update: the timestamp of the last known update by the user. Cannot publish if the actual last update and that expected by the user differ.
async function publish(uuid, user, session, last_update) {

  // Check if a draft with this uuid exists
  let template_draft = await draft(uuid, session);
  let last_published = await latestPublished(uuid, session);
  if(!template_draft) {
    if(last_published) {
      throw new Util.InputError('No changes to publish');
    } else {
      throw new Util.NotFoundError(`Template with uuid ${uuid} does not exist`);
    }
  }

  if(!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT))) {
    throw new Util.PermissionDeniedError(`You do not have the edit permissions required to publish ${uuid}`);
  }

  // If the last update provided doesn't match to the last update found in the db, fail.
  let db_last_update = new Date(await lastUpdateFor(uuid, user, session));
  if(last_update.getTime() != db_last_update.getTime()) {
    throw new Util.InputError(`The last update submitted ${last_update.toISOString()} does not match that found in the db ${db_last_update.toISOString()}. 
    Fetch the draft again to get the latest update before attempting to publish again.`);
  }

  // Recursively publish template, it's fields and related templates
  let published_id = await publishRecursor(uuid, user, session);

  let new_published_time = new Date(await publishDateFor_id(published_id, session));
  let last_published_time = last_published ? last_published.publish_date : null;
  let previous_published_time = new Date(last_published_time);
  if (new_published_time <= previous_published_time) {
    throw new Util.InputError('No changes to publish');
  }
}

// Fetches the template with the specified match conditions, including fetching fields and related_records
async function publishedWithJoins(pipelineMatchConditions) {
  // Construct a mongodb aggregation pipeline that will recurse into related templates up to 5 levels deep.
  // Thus, the tree will have a depth of 6 nodes
  let pipeline = [
    {
      '$match': pipelineMatchConditions
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
    // TODO: in this case template field returns null instead of throwing an error. The same should be done here. 
    throw new Util.NotFoundError(`No template with desired conditions exists`);
  }
}

// Fetches the last template with the given _id
async function publishedByIdWithJoins(_id) {

  let pipelineMatchConditions = { 
    _id
  };

  return await publishedWithJoins(pipelineMatchConditions);
}

// Fetches the last template with the given uuid published before the given date. 
// Also recursively looks up fields and related_templates.
async function latestPublishedBeforeDateWithJoins(uuid, date) {
  // Validate uuid and date are valid
  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }
  if (!Util.isValidDate(date)) {
    throw new Util.InputError('The date provided is not a valid date.');
  }

  let pipelineMatchConditions = { 
    'uuid': uuid,
    'publish_date': {'$lte': date}
  };

  return await publishedWithJoins(pipelineMatchConditions);
}

async function filterPublishedTemplateForPermissionsRecursor(template, user) {
  for(let i = 0; i < template.fields.length; i++) {
    if(!(await TemplateFieldModel.userHasAccessToPublishedField(template.fields[i], user))) {
      template.fields[i] = {uuid: template.fields[i].uuid};
    }
  }
  for(let i = 0; i < template.related_templates.length; i++) {
    if(!(await userHasAccessToPublishedTemplate(template.related_templates[i], user))) {
      template.related_templates[i] = {uuid: template.related_templates[i].uuid};
    } else {
      await filterPublishedTemplateForPermissionsRecursor(template.related_templates[i], user);
    }
  }
}

async function filterPublishedTemplateForPermissions(template, user) {
  if(!(await userHasAccessToPublishedTemplate(template, user))) {
    throw new Util.PermissionDeniedError(`Do not have view access to template ${template.uuid}`);
  }
  await filterPublishedTemplateForPermissionsRecursor(template, user);
}

async function latestPublishedBeforeDateWithJoinsAndPermissions(uuid, date, user) {
  let template = await latestPublishedBeforeDateWithJoins(uuid, date);
  await filterPublishedTemplateForPermissions(template, user);
  return template;
} 

// Fetches the last published template with the given uuid. 
// Also recursively looks up fields and related_templates.
async function latestPublishedWithJoinsAndPermissions(uuid, user) {
  return await latestPublishedBeforeDateWithJoinsAndPermissions(uuid, new Date(), user);
}

// Fetches the template draft with the given uuid, recursively looking up fields and related_templates.
// If a draft of a given template doesn't exist, a new one will be generated using the last published template.
async function draftFetchOrCreate(uuid, user, session) {

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

  // Make sure this user has a permission to be working with drafts
  if (!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT))) {
    throw new Util.PermissionDeniedError();
  }

  // Now recurse into each field, replacing each uuid with an imbedded object
  let fields = [];
  let field_uuids = [];
  for(let i = 0; i < template_draft.fields.length; i++) {
    let field_uuid = template_draft.fields[i];
    let field;
    try {
      // First try to get the draft of the field
      field = await TemplateFieldModel.draft(field_uuid, user, session);
    } catch (err) {
      if (err instanceof Util.PermissionDeniedError) {
        // If we don't have permission for the draft, get the latest published instead
        try {
          field = await TemplateFieldModel.latestPublished(field_uuid, user)
          if(!field) {
            field = {uuid: field_uuid}
          }
        } catch(err) {
          if (err instanceof Util.PermissionDeniedError) {
            field = {uuid: field_uuid, no_permissions: true}
          } else {
            throw err;
          }
        }
      } else {
        throw err;
      }
    }
    if (field) {
      fields.push(field);
      field_uuids.push(field.uuid);
    } else {
      console.log(`Failed to find a template field with uuid ${field_uuid}. Therefore, removing the reference to it from template with uuid ${template_draft.uuid}`);
    }
  }

  // Now recurse into each related_template, replacing each uuid with an imbedded object
  let related_templates = [];
  let related_template_uuids = [];
  for(let i = 0; i < template_draft.related_templates.length; i++) {
    let related_template_uuid = template_draft.related_templates[i];
    let related_template;
    try {
      // First try to get the draft of the related_template
      related_template = await draftFetchOrCreate(related_template_uuid, user, session);
    } catch (err) {
      if (err instanceof Util.PermissionDeniedError) {
        // If we don't have permission for the draft, get the latest published instead
        try {
          related_template = await latestPublishedWithJoinsAndPermissions(related_template_uuid, user)
        } catch (err) {
          if (err instanceof Util.PermissionDeniedError || err instanceof Util.NotFoundError) {
            // If we don't have permission for the published version, or a published version doesn't exist, just attach a uuid
            related_template = {uuid: related_template_uuid, no_permissions: true};
          } else {
            throw err;
          }
        }
      } else {
        throw err;
      }
    }
    if (related_template) {
      related_templates.push(related_template);
      related_template_uuids.push(related_template.uuid);
    } else {
      console.log(`Failed to find a template with uuid ${related_template_uuid}. Therefore, removing the reference to it from template with uuid ${template_draft.uuid}`);
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
      throw `Template.draftFetchOrCreate: should be 1 modified document. Instead: ${response.modifiedCount}`;
    }
  }

  template_draft.fields = fields;
  template_draft.related_templates = related_templates;
  delete template_draft._id;

  return template_draft;

}

// This function will provide the timestamp of the last update made to this template and all of it's sub-properties
async function lastUpdateFor(uuid, user, session) {

  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  let template_draft = await fetchDraftOrCreateFromPublished(uuid, session);
  let template_published = await latestPublished(uuid, session);
  let edit_permission = await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT);
  let view_permission = await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_VIEW);

  if(!template_draft) {
    throw new Util.NotFoundError(`No template  exists with uuid ${uuid}`);
  }

  if(!edit_permission) {
    if(!template_published) {
      throw new Util.PermissionDeniedError(`template ${uuid}: do not permissions for draft, and no published version exists`);
    }
    if(!view_permission) {
      throw new Util.PermissionDeniedError(`template ${uuid}: do not have view or edit permissions`);
    }
    return template_published.updated_at;
  }

  let last_update = template_draft.updated_at;
  for(uuid of template_draft.fields) {
    try {
      let update = await TemplateFieldModel.lastUpdate(uuid, user);
      if (update > last_update){
        last_update = update;
      }
    } catch (err) {
      if (!(err instanceof Util.NotFoundError || err instanceof Util.PermissionDeniedError)) {
        throw err;
      }
    }
  }
  for(uuid of template_draft.related_templates) {
    try {
      let update = await lastUpdateFor(uuid, user, session);
      if (update > last_update){
        last_update = update;
      }
    } catch (err) {
      if (!(err instanceof Util.NotFoundError || err instanceof Util.PermissionDeniedError)) {
        throw err;
      }
    }
  }

  return last_update;

}

async function draftDelete(uuid, user) {

  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  if(!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT))) {
    throw new Util.PermissionDeniedError(`You do not have edit permissions for template ${uuid}.`);
  }

  let response = await Template.deleteMany({ uuid, publish_date: {'$exists': false} });
  if (!response.deletedCount) {
    throw new Util.NotFoundError(`A draft does not exist with uuid ${uuid}`);
  }
  if (response.deletedCount > 1) {
    console.error(`draftDelete: Template with uuid '${uuid}' had more than one draft to delete.`);
  }
}

async function duplicateRecursor(template, user, session) {
  // 1. Error checking
  if(!template) {
    throw new Util.NotFoundError();
  }
  if(!(await userHasAccessToPublishedTemplate(template, user))) {
    throw new Util.PermissionDeniedError();
  }

  // 2. Create new everything copying the original template, but make it a draft and create a new uuid
  template.duplicated_from = template.uuid;
  template.uuid = uuidv4();
  delete template._id;
  delete template.updated_at;
  delete template.publish_date;
  delete template.public_date;
  await PermissionGroupModel.initialize_permissions_for(user, template.uuid, session);

  // 3. For templates and fields, recurse. If they throw an error, just remove them from the copy.
  let fields = [];
  let related_templates = [];
  for(field of template.fields) {
    try {
      field = await TemplateFieldModel.duplicate(field, user, session);
      fields.push(field);
    } catch(err) {
      if(!(err instanceof Util.NotFoundError || err instanceof Util.PermissionDeniedError)) {
        throw err;
      }
    }
  }
  for(related_template of template.related_templates) {
    try {
      related_template = await duplicateRecursor(related_template, user, session);
      related_templates.push(related_template);
    } catch(err) {
      if(!(err instanceof Util.NotFoundError || err instanceof Util.PermissionDeniedError)) {
        throw err;
      }
    }
  }
  template.fields = fields;
  template.related_templates = related_templates;

  template.updated_at = (new Date()).toISOString();
  let response = await Template.insertOne(
    template, 
    {session}
  );
  if (response.insertedCount != 1) {
    throw new Error(`Template.duplicate: Failed to insert duplicate of ${template.uuid}`);
  }
  
  return template.uuid
}

async function duplicate(uuid, user, session) {
  // TODO: all input checks from the user should happen before reaching the model, I think?
  // I don't think the model is the proper place to do input cleansing.
  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }
  let template = await latestPublishedBeforeDateWithJoins(uuid, new Date());
  if(!template) {
    throw new Util.NotFoundError(`Published template ${uuid} does not exist`);
  }
  if(!(await userHasAccessToPublishedTemplate(template, user))) {
    throw new Util.PermissionDeniedError(`You do not have view permissions required to duplicate template ${uuid}.`);
  }
  return await duplicateRecursor(template, user, session)
}

// Wraps the actual request to create with a transaction
exports.create = async function(template, user) {
  const session = MongoDB.newSession();
  let inserted_uuid;
  try {
    await session.withTransaction(async () => {
      try {
        [_, inserted_uuid] = await validateAndCreateOrUpdate(template, user, session);
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
exports.update = async function(template, user) {
  const session = MongoDB.newSession();
  try {
    await session.withTransaction(async () => {
      try {
        await validateAndCreateOrUpdate(template, user, session);
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
exports.draftGet = async function(uuid, user) {
  const session = MongoDB.newSession();
  try {
    var template
    await session.withTransaction(async () => {
      try {
        template = await draftFetchOrCreate(uuid, user, session);
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
exports.publish = async function(uuid, user, last_update) {
  const session = MongoDB.newSession();
  try {
    await session.withTransaction(async () => {
      try {
        await publish(uuid, user, session, last_update);
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

// Wraps the actual request to getUpdate with a transaction
exports.lastUpdate = async function(uuid, user) {
  const session = MongoDB.newSession();
  try {
    var update;
    await session.withTransaction(async () => {
      try {
        update = await lastUpdateFor(uuid, user, session);
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

// Parents 2+ levels up are not updated
exports.updateTemplatesThatReference = async function(uuid, templateOrField) {
  // Get a list of templates that reference them.
  let uuids = await templateUUIDsThatReference(uuid, templateOrField);
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

exports.draftExisting = async function(uuid) {
  return (await draft(uuid)) ? true : false;
}

exports.latestPublished = latestPublishedWithJoinsAndPermissions;
exports.publishedBeforeDate = latestPublishedBeforeDateWithJoinsAndPermissions;

exports.latestPublishedWithoutPermissions = async function(uuid) {
  return await latestPublishedBeforeDateWithJoins(uuid, new Date());
}

exports.publishedByIdWithoutPermissions = publishedByIdWithJoins;

exports.draftDelete = draftDelete;

exports.uuidFor_id = uuidFor_id;
exports.latest_published_id_for_uuid = async function(uuid) {
  let template = await latestPublished(uuid);
  return template ? template._id : null;
}
exports.latest_published_time_for_uuid = async function(uuid) {
  let template = await latestPublished(uuid);
  return template ? template.publish_date : null;
}

// Wraps the actual request to duplicate with a transaction
exports.duplicate = async function(uuid, user) {
  const session = MongoDB.newSession();
  try {
    var new_uuid;
    await session.withTransaction(async () => {
      try {
        new_uuid = await duplicate(uuid, user, session);
      } catch(err) {
        await session.abortTransaction();
        throw err;
      }
    });
    session.endSession();
    return new_uuid;
  } catch(err) {
    session.endSession();
    throw err;
  }
}

exports.userHasAccessToPublishedTemplate = userHasAccessToPublishedTemplate;

exports.collection = function() {
  return Template;
}