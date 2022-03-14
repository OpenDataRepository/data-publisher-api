const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');
const TemplateFieldModel = require('./template_field');
const PermissionGroupModel = require('./permission_group');
const SharedFunctions = require('./shared_functions');
const LegacyUuidToNewUuidMapperModel = require('./legacy_uuid_to_new_uuid_mapper');

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
    let uuid = await SharedFunctions.uuidFor_id(TemplateField, _id);
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
    let uuid = await SharedFunctions.uuidFor_id(Template, _id);
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
  let published_template = await SharedFunctions.latestPublished(Template, uuid, session);
  if(!published_template) {
    return null;
  }

  return (await createDraftFromPublished(published_template));
}

// Fetches a template draft 
// If it does not exist, it creates a draft from the latest published.
// Does not lookup fields or related_templates
async function fetchDraftOrCreateFromPublished(uuid, session) {
  let template_draft = await SharedFunctions.draft(Template, uuid, session);
  if(template_draft) {
    return template_draft;
  }

  let published_template = await SharedFunctions.latestPublished(Template, uuid, session);
  if(!published_template) {
    return null;
  }
  template_draft = await createDraftFromPublished(published_template);

  return template_draft;
}

function convertObjectIdArrayToStringArray(object_ids) {
  let string_array = [];
  for(let object_id of object_ids) {
    string_array.push(object_id.toString())
  }
  return string_array;
}

// Returns true if the provided templates are equal
function equals(template_1, template_2) {
  return template_1.uuid == template_2.uuid && 
         template_1.name == template_2.name &&
         template_1.description == template_2.description &&
         Util.datesEqual(template_1.public_date, template_2.public_date) &&
         Util.arrayEqual(template_1.fields, template_2.fields) &&
         Util.arrayEqual(template_1.related_templates, template_2.related_templates) &&
         Util.arrayEqual(
           convertObjectIdArrayToStringArray(template_1.subscribed_templates), 
           convertObjectIdArrayToStringArray(template_2.subscribed_templates));
}

// Returns true if the draft has any changes from it's previous published version
async function draftDifferentFromLastPublished(draft) {
  // If there is no published version, obviously there are changes
  let latest_published = await SharedFunctions.latestPublished(Template, draft.uuid);
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
    let related_template_last_published = (await SharedFunctions.latestPublished(Template, related_template)).publish_date;
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

async function createDraftFromLastPublished(uuid, user, session) {
  let draft = await draftFetchOrCreate(session, uuid, user);
  await validateAndCreateOrUpdate(session, draft, user, new Date());
}

async function createDraftFromLastPublishedWithSession(uuid, user) {
  const session = MongoDB.newSession();
  try {
    await session.withTransaction(async () => {
      try {
        await createDraftFromLastPublished(uuid, user, session);
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

function initializeNewDraftWithPropertiesSharedWithImport(input_template, uuid, updated_at) {
  let output_template = {
    uuid, 
    name: "",
    description: "",
    updated_at,
    fields: [],
    related_templates: [],
    subscribed_templates: []
  };
  if (input_template.name) {
    if (typeof(input_template.name) !== 'string'){
      throw new Util.InputError('name property must be of type string');
    }
    output_template.name = input_template.name
  }
  if (input_template.description) {
    if (typeof(input_template.description) !== 'string'){
      throw new Util.InputError(`template description property (${input_template.description}) must be of type string.`);
    }
    output_template.description = input_template.description
  }
  return output_template;
}

function initializeNewDraftWithProperties(input_template, uuid, updated_at) {
  let output_template = initializeNewDraftWithPropertiesSharedWithImport(input_template, uuid, updated_at);
  if (input_template.public_date) {
    if (!Date.parse(input_template.public_date)){
      throw new Util.InputError('template public_date property must be in valid date format');
    }
    output_template.public_date = new Date(input_template.public_date);
  }
  return output_template;
}

function initializeNewImportedDraftWithProperties(input_template, uuid, updated_at) {
  let output_template = initializeNewDraftWithPropertiesSharedWithImport(input_template, uuid, updated_at);
  if (input_template._database_metadata && Util.isObject(input_template._database_metadata) && 
      input_template._database_metadata._public_date && Date.parse(input_template._database_metadata._public_date)) {
    output_template.public_date = new Date(input_template.public_date);
  }
  return output_template;
}

async function getUuidFromCreateOrUpdate(input_template, user, session) {
  let uuid;
  // If a template uuid is provided, this is an update
  if (input_template.uuid) {
    // Template must have a valid uuid. 
    if (!uuidValidate(input_template.uuid)) {
      throw new Util.InputError("each template must have a valid uuid property");
    }
    
    // Template uuid must exist
    if (!(await SharedFunctions.exists(Template, input_template.uuid, session))) {
      throw new Util.NotFoundError(`No template exists with uuid ${input_template.uuid}`);
    }
    
    // verify that this user is in the 'edit' permission group
    if (!(await PermissionGroupModel.has_permission(user, input_template.uuid, PermissionGroupModel.PERMISSION_EDIT))) {
      throw new Util.PermissionDeniedError(`Do not have edit permissions for template uuid: ${input_template.uuid}`);
    }

    uuid = input_template.uuid;
  }
  // Otherwise, this is a create
  else {
    // Generate a uuid for the new template
    uuid = uuidv4();
    // create a permissions group for the new template
    await PermissionGroupModel.initialize_permissions_for(user, uuid, session);
  }
  return uuid;
}

async function extractFieldsFromCreateOrUpdate(input_fields, user, session, updated_at) {
  let return_fields = [];
  let changes = false;
  if (input_fields === undefined) {
    return [return_fields, changes];
  }
  if (!Array.isArray(input_fields)){
    throw new Util.InputError('fields property must be of type array');
  }
  for (let field of input_fields) {
    let field_uuid;
    try {
      [changes, field_uuid] = await TemplateFieldModel.validateAndCreateOrUpdate(session, field, user, updated_at);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError(err.message);
      } else if (err instanceof Util.PermissionDeniedError) {
        field_uuid = field.uuid;
      } else {
        throw err;
      }
    }
    // After validating and updating the field, replace the imbedded field with a uuid reference
    return_fields.push(field_uuid);
  }
  // It is a requirement that no field be repeated. Verify this
  if(Util.anyDuplicateInArray(return_fields)) {
    throw new Util.InputError(`Each template may only have one instance of any template field.`);
  }
  return [return_fields, changes];
}

async function extractRelatedTemplatesFromCreateOrUpdate(input_related_templates, user, session, updated_at) {
  let return_related_templates = [];
  let changes = false;
  if (input_related_templates === undefined) {
    return [return_related_templates, changes];
  }
  if (!Array.isArray(input_related_templates)){
    throw new Util.InputError('related_templates property must be of type array');
  }
  for (let related_template of input_related_templates) {
    let related_template_uuid;
    try {
      [changes, related_template_uuid] = await validateAndCreateOrUpdate(session, related_template, user, updated_at);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError(err.message);
      } else if (err instanceof Util.PermissionDeniedError) {
        // If the user doesn't have edit permissions, assume they want to link the published version of the template, or keep something another editor added
        related_template_uuid = related_template.uuid;
      } else {
        throw err;
      }
    }
    // After validating and updating the related_template, replace the imbedded related_template with a uuid reference
    return_related_templates.push(related_template_uuid);
  }
  // Related_templates is really a set, not a list. But Mongo doesn't store sets well, so have to manage it ourselves.
  if(Util.anyDuplicateInArray(return_related_templates)) {
    throw new Util.InputError(`Each template may only have one instance of every related_template.`);
  }
  return [return_related_templates, changes];
}

async function extractSubscribedTemplateFromCreateOrUpdate(input_subscribed_template, previous_subscribed_template_ids, seen_uuids) {
  if(!Util.isObject(input_subscribed_template)) {
    throw new Util.InputError("Each entry in subscribed_templates must be an object");
  }
  let subscribed_id;
  try {
    subscribed_id = SharedFunctions.convertToMongoId(input_subscribed_template._id);
  } catch (err) {
    throw new Util.InputError(`Each entry in subscribed_templates must have a valid _id property.`)
  }

  let subscribed_uuid = await SharedFunctions.uuidFor_id(Template, subscribed_id);
  if(!subscribed_uuid) {
    throw new Util.InputError(`subscribed template provided with _id ${subscribed_id} does not exist`);
  }

  // Either subscribed_id had to have been on the list before before, or it has to be the latest published version of subscribed_uuid
  if(!previous_subscribed_template_ids.has(input_subscribed_template._id)) {
    let latest_published_id = await SharedFunctions.latest_published_id_for_uuid(Template, subscribed_uuid);
    if(!subscribed_id.equals(latest_published_id)) {
      throw new Util.InputError(`subscribed_template ${subscribed_id} is required to be the same _id as previously or the latest published version`);
    }
  }

  // Check that there is only one of each uuid subscribed
  if(seen_uuids.has(subscribed_uuid)) {
    throw new Util.InputError(`each template can only be subscribed to once by any template. 
    template with uuid ${subscribed_uuid} is subscribed twice`);
  }
  seen_uuids.add(subscribed_uuid);
  return subscribed_id;

}

// Rules: can only subscribe to the latest version or maintain the version we were subscribing to. 
// The output will of course just be that version of the published template fetched.
// How will the input indicate if it wants to update? It will submit the latest published version of that template
async function extractSubscribedTemplatesFromCreateOrUpdate(input_subscribed_templates, parent_uuid) {
  let return_subscribed_templates = [];
  if (input_subscribed_templates === undefined) {
    return return_subscribed_templates;
  }
  if (!Array.isArray(input_subscribed_templates)){
    throw new Util.InputError('subscribed_templates property must be of type array');
  }

  // build previous_subscribed_ids from last published / last draft
  let previous_subscribed_ids = new Set();
  let previous_parent_published = await SharedFunctions.latestPublished(Template, parent_uuid);
  if(previous_parent_published) {
    for(let _id of previous_parent_published.subscribed_templates) {
      previous_subscribed_ids.add(_id.toString());
    }
  }
  let previous_parent_draft = await SharedFunctions.draft(Template, parent_uuid);
  if(previous_parent_draft) {
    for(let _id of previous_parent_draft.subscribed_templates) {
      previous_subscribed_ids.add(_id.toString());
    }
  }

  let seen_subscribed_uuids = new Set();

  for (let subscribed_template of input_subscribed_templates) {
    let subscribed_template_id =  await extractSubscribedTemplateFromCreateOrUpdate(subscribed_template, previous_subscribed_ids, seen_subscribed_uuids);
    // After validating and updating the related_template, replace the imbedded related_template with a uuid reference
    return_subscribed_templates.push(subscribed_template_id);
  }
  return return_subscribed_templates;
}

// If a uuid is provided, update the template with the provided uuid.
// Otherwise, create a new template.
// If the updated template is the same as the last published, delete the draft instead of updating. 
// In both cases, validate the given template as well.
// Return:
// 1. A boolean indicating true if there were changes from the last published.
// 2. The uuid of the template created / updated
async function validateAndCreateOrUpdate(session, input_template, user, updated_at) {

  // Template must be an object
  if (!Util.isObject(input_template)) {
    throw new Util.InputError(`template provided is not an object: ${input_template}`);
  }

  let uuid = await getUuidFromCreateOrUpdate(input_template, user, session);

  // Populate template properties
  let new_template = initializeNewDraftWithProperties(input_template, uuid, updated_at);

  // Need to determine if this draft is any different from the published one.
  let changes;

  [new_template.fields, changes] = await extractFieldsFromCreateOrUpdate(input_template.fields, user, session, updated_at);

  let more_changes = false;
  [new_template.related_templates, more_changes] = await extractRelatedTemplatesFromCreateOrUpdate(input_template.related_templates, user, session, updated_at);
  changes = changes || more_changes;

  new_template.subscribed_templates = await extractSubscribedTemplatesFromCreateOrUpdate(input_template.subscribed_templates, uuid);
  changes = changes || more_changes;
  

  // If this draft is identical to the latest published, delete it.
  // The reason to do so is so when a change is submitted, we won't create drafts of sub-templates.
  // Only create drafts for the templates that actually have changes
  if (!changes) {
    changes = await draftDifferentFromLastPublished(new_template);
    if (!changes) {
      // Delete the current draft
      try {
        await SharedFunctions.draftDelete(Template, uuid);
      } catch (err) {
        if (!(err instanceof Util.NotFoundError)) {
          throw err;
        }
      }
      return [false, uuid];
    }
  }

  // If a draft of this template already exists: overwrite it, using it's same uuid
  // If a draft of this template doesn't exist: create a new draft
  // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
  let response = await Template.updateOne(
    {uuid, 'publish_date': {'$exists': false}}, 
    {$set: new_template}, 
    {'upsert': true, session}
  );
  if (response.upsertedCount != 1 && response.matchedCount != 1) {
    throw new Error(`Template.validateAndCreateOrUpdate: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
  } 

  // If successfull, return the uuid of the created / updated template
  return [true, uuid];

}

async function publishFields(input_field_uuids, user, session) {
  let return_field_ids = [];
  // For each template field, publish that field, then replace the uuid with the internal_id.
  // It is possible there weren't any changes to publish, so keep track of whether we actually published anything.
  for (let field_uuid of input_field_uuids) {
    if(!await SharedFunctions.draft(TemplateField, field_uuid, session)) {
      let latest_published_field = await SharedFunctions.latestPublished(TemplateField, field_uuid, session);
      if(!latest_published_field) {
        throw new Util.InputError(`Field with uuid ${field_uuid} does not exist`);
      } 
      return_field_ids.push(latest_published_field._id);
      continue;
    }
    try {
      let field_id = await TemplateFieldModel.publishField(session, field_uuid, null, user);
      return_field_ids.push(field_id);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError("Internal reference within this draft is invalid. Fetch/update draft to cleanse it.");
      } else if (err instanceof Util.PermissionDeniedError) {
        // If the user doesn't have permissions, assume they want to link the published version of the field
        // But before we can link the published version of the field, we must make sure it exists and we have view access
        let published_field = await TemplateFieldModel.latestPublishedWithoutPermissions(field_uuid, session);
        if(!published_field) {
          throw new Util.InputError(`you do not have edit permissions to the draft of template_field ${field_uuid}, and a published version does not exist.`);
        }
        return_field_ids.push(published_field._id);
      } else {
        throw err;
      }
    }
  } 
  return return_field_ids;
}

async function publishRelatedTemplates(input_related_templates_uuids, user, session) {
  let result_related_templates_ids = [];
  // For each template's related_templates, publish that related_template, then replace the uuid with the internal_id.
  // It is possible there weren't any changes to publish, so keep track of whether we actually published anything.
  for(let related_template_uuid of input_related_templates_uuids) {
    try {
      let related_template_id = await publishRecursor(related_template_uuid, user, session);
      result_related_templates_ids.push(related_template_id);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError("Internal reference within this draft is invalid. Fetch/update draft to cleanse it.");
      } else if (err instanceof Util.PermissionDeniedError) {
        // If the user doesn't have permissions, assume they want to link the published version of the template
        // But before we can link the published version of the template, we must make sure it exists
        let related_template_published = await SharedFunctions.latestPublished(Template, related_template_uuid, session);
        if(!related_template_published) {
          throw new Util.InputError(`published template does not exist with uuid ${related_template_uuid}`);
        }
        result_related_templates_ids.push(related_template_published._id);
      } else {
        throw err;
      }
    }
  }
  return result_related_templates_ids;
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

  let published_template = await SharedFunctions.latestPublished(Template, uuid, session);

  let template_draft = await SharedFunctions.draft(Template, uuid, session);

  // If a draft of this template doesn't exist, we'll use the published template instead
  if(!template_draft) {
    // There is no draft of this uuid. Return the latest published template instead.
    if (!published_template) {
      throw new Util.NotFoundError(`Template with uuid ${uuid} does not exist`);
    }
    if(!(await SharedFunctions.userHasAccessToPublishedResource(Template, uuid, user, PermissionGroupModel, session))) {
      throw new Util.PermissionDeniedError(`cannot link template with uuid ${uuid}. Requires at least view permissions.`);
    }
    return published_template._id;
  }

  // If a user doesn't have edit access to this template, we'll use the published template instead
  if(!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT, session))) {
    // There is no draft of this uuid. Return the latest published template instead.
    if (!published_template) {
      throw new Util.InputError(`Do not have access to template draft with uuid ${uuid}, and no published version exists`);
    }
    if(!(await SharedFunctions.userHasAccessToPublishedResource(Template, uuid, user, PermissionGroupModel, session))) {
      throw new Util.PermissionDeniedError(`cannot link template with uuid ${uuid}. Requires at least view permissions.`);
    }
    return published_template._id;
  }

  let fields = [];
  let related_templates = [];

  fields = await publishFields(template_draft.fields, user, session);

  related_templates = await publishRelatedTemplates(template_draft.related_templates, user, session);

  // If there are changes, publish the current draft
  let publish_time = new Date();
  let response = await Template.updateOne(
    {"_id": template_draft._id},
    {'$set': {'updated_at': publish_time, 'publish_date': publish_time, 
      fields, related_templates, subscribed_templates: template_draft.subscribed_templates}},
    {session}
  )
  if (response.modifiedCount != 1) {
    throw `Template.publish: should be 1 modified document. Instead: ${response.modifiedCount}`;
  }
  return_id = template_draft._id;

  return return_id;

}

// Publishes the template with the provided uuid
// Input: 
//   uuid: the uuid of a template to be published
//   session: the mongo session that must be used to make transactions atomic
//   last_update: the timestamp of the last known update by the user. Cannot publish if the actual last update and that expected by the user differ.
async function publish(session, uuid, user, last_update) {

  // Check if a draft with this uuid exists
  let template_draft = await SharedFunctions.draft(Template, uuid, session);
  let last_published = await SharedFunctions.latestPublished(Template, uuid, session);
  if(!template_draft) {
    if(last_published) {
      throw new Util.InputError('No changes to publish');
    } else {
      throw new Util.NotFoundError(`Template with uuid ${uuid} does not exist`);
    }
  }

  if(!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT, session))) {
    throw new Util.PermissionDeniedError(`You do not have the edit permissions required to publish ${uuid}`);
  }

  // If the last update provided doesn't match to the last update found in the db, fail.
  let db_last_update = new Date(await lastUpdateFor(session, uuid, user));
  if(last_update.getTime() != db_last_update.getTime()) {
    throw new Util.InputError(`The last update submitted ${last_update.toISOString()} does not match that found in the db ${db_last_update.toISOString()}. 
    Fetch the draft again to get the latest update before attempting to publish again.`);
  }

  // Recursively publish template, it's fields and related templates
  await publishRecursor(uuid, user, session);
}

function recursiveBuildPublishedQuery(current_pipeline, count) {
  if(count >= 5) {
    return;
  }
  count += 1;

  let pipeline_related_templates_addon = {
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
  };

  let pipeline_subscribed_templates_addon = {
    '$lookup': {
      'from': "templates",
      'let': { 'ids': "$subscribed_templates"},
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
      'as': "subscribed_templates"
    }
  };

  current_pipeline.push(pipeline_related_templates_addon);
  recursiveBuildPublishedQuery(pipeline_related_templates_addon['$lookup']['pipeline'], count);

  current_pipeline.push(pipeline_subscribed_templates_addon);
  recursiveBuildPublishedQuery(pipeline_subscribed_templates_addon['$lookup']['pipeline'], count);

}

// Fetches the template with the specified match conditions, including fetching fields and related_records
async function publishedWithJoins(pipelineMatchConditions, session) {
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

  recursiveBuildPublishedQuery(pipeline, 0);

  let response = await Template.aggregate(pipeline, {session});
  if (await response.hasNext()){
    return await response.next();
  } else {
    return null;
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
async function latestPublishedBeforeDateWithJoins(uuid, date, session) {
  let pipelineMatchConditions = { 
    uuid,
    'publish_date': {'$lte': date}
  };

  return await publishedWithJoins(pipelineMatchConditions, session);
}

async function filterPublishedTemplateForPermissionsRecursor(template, user, session) {
  for(let i = 0; i < template.fields.length; i++) {
    if(!(await SharedFunctions.userHasAccessToPublishedResource(TemplateField, template.fields[i].uuid, user, PermissionGroupModel, session))) {
      template.fields[i] = {uuid: template.fields[i].uuid};
    }
  }
  for(let i = 0; i < template.related_templates.length; i++) {
    if(!(await SharedFunctions.userHasAccessToPublishedResource(Template, template.related_templates[i].uuid, user, PermissionGroupModel, session))) {
      template.related_templates[i] = {uuid: template.related_templates[i].uuid};
    } else {
      await filterPublishedTemplateForPermissionsRecursor(template.related_templates[i], user, session);
    }
  }
}

async function filterPublishedTemplateForPermissions(template, user, session) {
  if(!(await SharedFunctions.userHasAccessToPublishedResource(Template, template.uuid, user, PermissionGroupModel, session))) {
    throw new Util.PermissionDeniedError(`Do not have view access to template ${template.uuid}`);
  }
  await filterPublishedTemplateForPermissionsRecursor(template, user, session);
}

async function publishedByIdWithJoinsAndPermissions(_id, user) {
  let template = await publishedByIdWithJoins(_id);
  if(!template) {
    return null;
  }
  await filterPublishedTemplateForPermissions(template, user);
  return template;
} 

async function latestPublishedBeforeDateWithJoinsAndPermissions(uuid, date, user, session) {
  let template = await latestPublishedBeforeDateWithJoins(uuid, date, session);
  if(!template) {
    return null;
  }
  await filterPublishedTemplateForPermissions(template, user, session);
  return template;
} 

// Fetches the last published template with the given uuid. 
// Also recursively looks up fields and related_templates.
async function latestPublishedWithJoinsAndPermissions(uuid, user, session) {
  return await latestPublishedBeforeDateWithJoinsAndPermissions(uuid, new Date(), user, session);
}

async function draftFetchFields(input_field_uuids, user, session) {
  let fields = [];
  let field_uuids = [];
  for(let field_uuid of input_field_uuids) {
    let field;
    try {
      // First try to get the draft of the field
      field = await TemplateFieldModel.draft(session, field_uuid, user);
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
  return [fields, field_uuids];
}

async function draftFetchRelatedTemplates(input_related_template_uuids, user, session) {
  let related_templates = [];
  let related_template_uuids = [];
  for(let related_template_uuid of input_related_template_uuids) {
    let related_template;
    try {
      // First try to get the draft of the related_template
      related_template = await draftFetchOrCreate(session, related_template_uuid, user);
    } catch (err) {
      if (err instanceof Util.PermissionDeniedError) {
        // If we don't have permission for the draft, get the latest published instead
        try {
          related_template = await latestPublishedWithJoinsAndPermissions(related_template_uuid, user);
          if(!related_template) {
            // If a published version doesn't exist, just attach a uuid
            related_template = {uuid: related_template_uuid};
          }
        } catch (err) {
          if (err instanceof Util.PermissionDeniedError || err instanceof Util.NotFoundError) {
            // If we don't have permission for the published version
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
      console.log(`Failed to find a template with uuid ${related_template_uuid}. Therefore, removing the reference to it`);
    }
  }
  return [related_templates, related_template_uuids];
}

// Fetches the template draft with the given uuid, recursively looking up fields and related_templates.
// If a draft of a given template doesn't exist, a new one will be generated using the last published template.
async function draftFetchOrCreate(session, uuid, user) {

  // See if a draft of this template exists. 
  let template_draft = await fetchDraftOrCreateFromPublished(uuid, session);
  if (!template_draft) {
    return null;
  }

  // Make sure this user has a permission to be working with drafts
  if (!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT))) {
    throw new Util.PermissionDeniedError(`You don't have edit permissions required to view template ${uuid}`);
  }

  let fields, field_uuids;
  [fields, field_uuids] = await draftFetchFields(template_draft.fields, user, session);

  // Now recurse into each related_template, replacing each uuid with an imbedded object
  let related_templates, related_template_uuids;
  [related_templates, related_template_uuids] = await draftFetchRelatedTemplates(template_draft.related_templates, user, session);

  let subscribed_templates = [];
  for(let subscribed_id of template_draft.subscribed_templates) {
    let subscribed_template = await publishedByIdWithJoinsAndPermissions(subscribed_id, user);
    subscribed_templates.push(subscribed_template);
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
  template_draft.subscribed_templates = subscribed_templates;
  delete template_draft._id;

  return template_draft;

}

// This function will provide the timestamp of the last update made to this template and all of it's sub-properties
async function lastUpdateFor(session, uuid, user) {

  let template_draft = await fetchDraftOrCreateFromPublished(uuid, session);
  let template_published = await SharedFunctions.latestPublished(Template, uuid, session);
  let edit_permission = await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT, session);
  let view_permission = await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_VIEW, session);

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
      let update = await TemplateFieldModel.lastUpdate(uuid, user, session);
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
      let update = await lastUpdateFor(session, uuid, user);
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

async function duplicateRecursor(template, user, session) {
  // 1. Error checking
  if(!template) {
    throw new Util.NotFoundError();
  }
  if(!(await SharedFunctions.userHasAccessToPublishedResource(Template, template.uuid, user, PermissionGroupModel))) {
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

async function duplicate(session, uuid, user) {
  let template = await latestPublishedBeforeDateWithJoins(uuid, new Date());
  if(!template) {
    throw new Util.NotFoundError(`Published template ${uuid} does not exist`);
  }
  if(!(await SharedFunctions.userHasAccessToPublishedResource(Template, template.uuid, user, PermissionGroupModel))) {
    throw new Util.PermissionDeniedError(`You do not have view permissions required to duplicate template ${uuid}.`);
  }
  return await duplicateRecursor(template, user, session)
}

// TODO: as of now, import doesn't include group_uuids at all
async function importTemplate(session, template, user, updated_at) {
  if(!Util.isObject(template)) {
    throw new Util.InputError('Template to import must be a json object.');
  }
  if(!template.template_uuid || typeof(template.template_uuid) !== 'string') {
    throw new Util.InputError('Template provided to import must have a template_uuid, which is a string.');
  }
  // Now get the matching uuid for the imported uuid
  let old_uuid = template.template_uuid;
  let uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(old_uuid, session);
  // If the uuid is found, then this has already been imported. Import again if we have edit permissions
  if(uuid) {
    if(!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT, session))) {
      throw new Util.PermissionDeniedError(`You do not have edit permissions required to import template ${old_uuid}. It has already been imported.`);
    }
  } else {
    uuid = await LegacyUuidToNewUuidMapperModel.create_new_uuid_for_old(old_uuid, session);
    await PermissionGroupModel.initialize_permissions_for(user, uuid, session);
  }

  // Populate template properties
  let new_template = initializeNewImportedDraftWithProperties(template, uuid, updated_at);

  // Need to determine if this draft is any different from the published one.
  let changes = false;

  // Recursively handle each of the fields
  if (template.fields !== undefined) {
    if (!Array.isArray(template.fields)){
      throw new Util.InputError('fields property must be of type array');
    }
    for (let field of template.fields) {
      let field_uuid;
      try {
        let more_changes;
        [more_changes, field_uuid] = await TemplateFieldModel.importField(field, user, updated_at, session);
        changes |= more_changes;
      } catch(err) {
        if (err instanceof Util.PermissionDeniedError) {
          field_uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(field.template_field_uuid, session);
        } else {
          throw err;
        }
      }
      // After validating and updating the field, replace the imbedded field with a uuid reference
      new_template.fields.push(field_uuid);
    }
    // It is a requirement that no field be repeated. Verify this
    if(Util.anyDuplicateInArray(new_template.fields)) {
      throw new Util.InputError(`Each template may only have one instance of any template field.`);
    }
  }
  // Reursively handle each of the related_templates
  if (template.related_databases !== undefined) {
    if (!Array.isArray(template.related_databases)){
      throw new Util.InputError('related_templates property must be of type array');
    }
    for (let related_template of template.related_databases) {
      let related_template_uuid;
      try {
        let more_changes;
        [more_changes, related_template_uuid] = await importTemplate(session, related_template, user, updated_at);
        changes |= more_changes;
      } catch(err) {
        if (err instanceof Util.PermissionDeniedError) {
          // If the user doesn't have edit permissions, assume they want to link the published version of the template, or keep something another editor added
          related_template_uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(related_template.template_uuid, session);;
        } else {
          throw err;
        }
      }
      // After validating and updating the related_template, replace the imbedded related_template with a uuid reference
      // if(related_template.subscribed) {
      //   // TODO: push the _id and not the uuid
      //   new_template.subscribed_templates.push(related_template_uuid);
      // }
      new_template.related_templates.push(related_template_uuid);
    }
  }

  // If this draft is identical to the latest published, delete it.
  // The reason to do so is so when a change is submitted, we won't create drafts of sub-templates.
  // Only create drafts for the templates that actually have changes
  if (!changes) {
    changes = await draftDifferentFromLastPublished(new_template);
    if (!changes) {
      // Delete the current draft
      try {
        await SharedFunctions.draftDelete(Template, uuid);
      } catch (err) {
        if (!(err instanceof Util.NotFoundError)) {
          throw err;
        }
      }
      return [false, uuid];
    }
  }

  let response = await Template.updateOne(
    {"uuid": new_template.uuid, 'publish_date': {'$exists': false}}, 
    {$set: new_template}, 
    {'upsert': true, session}
  );
  if (response.upsertedCount != 1 && response.matchedCount != 1) {
    throw new Error(`Template.importTemplate: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
  } 

  return [changes, uuid];
}

// Wraps the actual request to create with a transaction
exports.create = async function(template, user) {
  let inserted_uuid;
  [_, inserted_uuid] = await SharedFunctions.executeWithTransaction(validateAndCreateOrUpdate, template, user, new Date());
  return inserted_uuid;
}

// Wraps the actual request to update with a transaction
exports.update = async function(template, user) {
  await SharedFunctions.executeWithTransaction(validateAndCreateOrUpdate, template, user, new Date());
}

// Wraps the actual request to get with a transaction
exports.draftGet = async function(uuid, user) {
  let template = await SharedFunctions.executeWithTransaction(draftFetchOrCreate, uuid, user);
  return template;
}

// Wraps the actual request to publish with a transaction
exports.publish = async function(uuid, user, last_update, session) {
  if(session) {
    await publish(session, uuid, user, last_update);
  } else {
    await SharedFunctions.executeWithTransaction(publish, uuid, user, last_update);
  }
}

// Wraps the actual request to getUpdate with a transaction
exports.lastUpdate = async function(uuid, user, session) {
  let update;
  if(session) {
    update = await lastUpdateFor(session, uuid, user);
  } else {
    update = await SharedFunctions.executeWithTransaction(lastUpdateFor, uuid, user);
  }
  return update;
}

// Parents 2+ levels up are not updated
exports.updateTemplatesThatReference = async function(uuid, user, templateOrField) {
  // Get a list of templates that reference them.
  let uuids = await templateUUIDsThatReference(uuid, templateOrField);
  // For each template, create a draft if it doesn't exist
  for(uuid of uuids) {
    // when time starts being a problem, move this into a queue OR just remove the await statement.
    try {
      await createDraftFromLastPublishedWithSession(uuid, user);
    } catch(err) {
      console.error(err);
    }
  }

}

exports.draftExisting = async function(uuid) {
  return (await SharedFunctions.draft(Template, uuid)) ? true : false;
}

exports.latestPublished = latestPublishedWithJoinsAndPermissions;
exports.publishedBeforeDate = latestPublishedBeforeDateWithJoinsAndPermissions;

exports.latestPublishedWithoutPermissions = async function(uuid) {
  return await latestPublishedBeforeDateWithJoins(uuid, new Date());
}

exports.publishedByIdWithoutPermissions = publishedByIdWithJoins;

exports.draftDelete = async function(uuid, user) {

  if(!(await SharedFunctions.draft(Template, uuid))) {
    throw new Util.NotFoundError(`No draft exists with uuid ${uuid}`);
  }

  if(!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_EDIT))) {
    throw new Util.PermissionDeniedError(`You do not have edit permissions for template ${uuid}.`);
  }

  await SharedFunctions.draftDelete(Template, uuid);
};

exports.latest_published_id_for_uuid = async function(uuid) {
  let template = await SharedFunctions.latestPublished(Template, uuid);
  return template ? template._id : null;
}
exports.latest_published_time_for_uuid = async function(uuid) {
  let template = await SharedFunctions.latestPublished(Template, uuid);
  return template ? template.publish_date : null;
}

// Wraps the actual request to duplicate with a transaction
exports.duplicate = async function(uuid, user) {
  let new_uuid = await SharedFunctions.executeWithTransaction(duplicate, uuid, user);
  return new_uuid;
}

// Wraps the actual request to import with a transaction
exports.importTemplate = async function(template, user, session) {
  let new_template_uuid;
  if(session) {
    new_template_uuid = (await importTemplate(session, template, user, new Date()))[1];
  } else {
    new_template_uuid = (await SharedFunctions.executeWithTransaction(importTemplate, template, user, new Date()))[1];
  }
  return new_template_uuid;
}

exports.collection = function() {
  return Template;
}