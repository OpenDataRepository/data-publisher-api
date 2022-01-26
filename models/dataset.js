const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');
const TemplateModel = require('./template');
const PermissionGroupModel = require('./permission_group');
const SharedFunctions = require('./shared_functions');
const LegacyUuidToNewUuidMapperModel = require('./legacy_uuid_to_new_uuid_mapper');

var Dataset;

// Returns a reference to the record Mongo Collection
async function collection() {
  if (Dataset === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('datasets');
    } catch(e) {}
    Dataset = db.collection('datasets');
  }
  return Dataset;
}

exports.init = async function() {
  Dataset = await collection();
}

// Creates a draft from the published version.
async function createDraftFromPublished(published) {

  // Create a copy of published
  let draft = Object.assign({}, published);

  delete draft._id;
  draft.updated_at = draft.publish_date;
  delete draft.publish_date;
  draft.template_uuid = await SharedFunctions.uuidFor_id(TemplateModel.collection(), draft.template_id);
  delete draft.template_id;

  // Replace each of the related_dataset _ids with uuids. 
  let related_datasets = [];
  for(_id of published.related_datasets) {
    let uuid = await SharedFunctions.uuidFor_id(Dataset, _id);
    if(uuid) {
      related_datasets.push(uuid);
    } else {
      console.log(`Failed to find a dataset with internal id ${_id}. Therefore, removing the reference to it from dataset with uuid ${draft.uuid}`);
    }
  }
  draft.related_datasets = related_datasets;

  return draft;

}

function draftsEqual(draft1, draft2) {
  return draft1.uuid == draft2.uuid &&
         draft1.template_uuid == draft2.template_uuid &&
         Util.datesEqual(draft1.public_date, draft2.public_date) &&
         Util.arrayEqual(draft1.related_datasets, draft2.related_datasets);
}

// Returns true if the draft has any changes from it's previous published version
async function draftDifferentFromLastPublished(draft) {
  // If there is no published version, obviously there are changes
  let latest_published = await SharedFunctions.latestPublished(Dataset, draft.uuid);
  if(!latest_published) {
    return true;
  }

  // If the properties have changed since the last publishing
  let latest_published_as_draft = await createDraftFromPublished(latest_published);
  if (!draftsEqual(draft, latest_published_as_draft)) {
    return true;
  }

  // if the template version has changed since this record was last published
  let latest_template_id = await TemplateModel.latest_published_id_for_uuid(latest_published_as_draft.template_uuid);
  if(!latest_published.template_id.equals(latest_template_id)) {
    return true;
  }

  // Finally, if any of the dependencies have been published more recently than this record, then there are changes
  for(let related_dataset of draft.related_datasets) {
    let related_dataset_last_published = (await SharedFunctions.latestPublished(Dataset, related_dataset)).publish_date;
    if (Util.compareTimeStamp(related_dataset_last_published, latest_published.publish_date) > 0) {
      return true;
    }
  }

  return false;
}

// A recursive helper for validateAndCreateOrUpdate.
async function validateAndCreateOrUpdateRecurser(input_dataset, template, user, session, group_uuid, updated_at) {

  // dataset must be an object
  if (!Util.isObject(input_dataset)) {
    throw new Util.InputError(`dataset provided is not an object or a valid uuid: ${input_dataset}`);
  }

  let uuid;
  // If a dataset uuid is provided, this is an update
  if (input_dataset.uuid) {
    // Dataset must have a valid uuid. 
    if (!uuidValidate(input_dataset.uuid)) {
      throw new Util.InputError("each dataset must have a valid uuid property");
    }
    
    // Dataset uuid must exist
    if (!(await SharedFunctions.exists(Dataset, input_dataset.uuid, session))) {
      throw new Util.NotFoundError(`No dataset exists with uuid ${input_dataset.uuid}`);
    }

    // verify that this user is in the 'admin' permission group
    if (!(await PermissionGroupModel.has_permission(user, input_dataset.uuid, PermissionGroupModel.PERMISSION_ADMIN))) {
      throw new Util.PermissionDeniedError(`Do not have admin permissions for dataset uuid: ${input_dataset.uuid}`);
    }

    uuid = input_dataset.uuid;
    group_uuid = (await SharedFunctions.latestDocument(Dataset, uuid)).group_uuid;
  }
  // Otherwise, this is a create, so generate a new uuid
  else {
    uuid = uuidv4();
    await PermissionGroupModel.initialize_permissions_for(user, uuid, session);
  }

  // Verify that the template uuid provided by the user is the correct template uuid expected by the latest published template
  if(input_dataset.template_uuid != template.uuid) {
    throw new Util.InputError(`The template uuid provided by the dataset (${input_dataset.template_uuid}) does not correspond to the template uuid expected by the template (${template.uuid})`);
  }

  // Build object to create/update
  let new_dataset = {
    uuid,
    template_uuid: input_dataset.template_uuid,
    group_uuid,
    updated_at,
    related_datasets: []
  };

  if (input_dataset.public_date) {
    if (!Date.parse(input_dataset.public_date)){
      throw new Util.InputError('dataset public_date property must be in valid date format');
    }
    new_dataset.public_date = new Date(input_dataset.public_date);
    if(!template.public_date || new_dataset.public_date < (new Date(template.public_date))) {
      throw new Util.InputError(`public_date for dataset must be later than the public_date for it's template. date provided: ${new_dataset.public_date.toISOString()}, template uuid: ${template.uuid}, template public_date: ${template.public_date}`);
    }
  }

  // Need to determine if this draft is any different from the published one.
  let changes = false;

  // Recurse into related_datasets
  if(!input_dataset.related_datasets) {
    input_dataset.related_datasets = [];
  }
  if (!Array.isArray(input_dataset.related_datasets)){
    throw new Util.InputError('related_datasets property must be of type array');
  }
  // Requirements:
  // - Each related template must have a related_dataset pointing to it
  // - Same related_dataset can't be repeated twice
  // Plan: go through by template, handle every dataset for that template, then check if the related_dataset list has duplicates
  let related_dataset_map = {};
  for (let related_dataset of input_dataset.related_datasets) {
    if(!Util.isObject(related_dataset)) {
      throw new Util.InputError(`Each related_dataset in the dataset must be a json object`);
    }
    if(!related_dataset.template_uuid) {
      // There is a chance the user will link a dataset they don't have view access to.
      // In this case, there will be no template_uuid. Thus, try to fetch the template uuid. 
      let existing_dataset = await SharedFunctions.latestDocument(Dataset, related_dataset.uuid);
      if(!existing_dataset) {
        throw new Util.InputError(`Each related_dataset in the dataset must supply a template_uuid`);
      }
      related_dataset.template_uuid = existing_dataset.template_uuid;
    }
    if(!(related_dataset.template_uuid in related_dataset_map)) {
      related_dataset_map[related_dataset.template_uuid] = [related_dataset];
    } else {
      related_dataset_map[related_dataset.template_uuid].push(related_dataset);
    }
  }
  for (let related_template of template.related_templates) {
    let related_template_uuid = related_template.uuid;
    if(!(related_template_uuid in related_dataset_map)) {
      throw new Util.InputError(`The dataset must contain a related_dataset for every related_template specified by the template`);
    }
    let related_datasets = related_dataset_map[related_template_uuid];
    for(let related_dataset of related_datasets) {
      try {
        let new_changes;
        [new_changes, related_dataset] = await validateAndCreateOrUpdateRecurser(related_dataset, related_template, user, session, group_uuid, updated_at);
        changes = changes || new_changes;
      } catch(err) {
        if (err instanceof Util.NotFoundError) {
          throw new Util.InputError(err.message);
        } else if (err instanceof Util.PermissionDeniedError) {
          // If we don't have admin permissions to the related_dataset, don't try to update/create it. Just link it
          related_dataset = related_dataset.uuid;
        } else {
          throw err;
        }
      }
      // After validating and updating the related_dataset, replace the related_dataset with a uuid reference
      new_dataset.related_datasets.push(related_dataset);
    }
  } 
  // Related_datasets is really a set, not a list. But Mongo doesn't store sets well, so have to manage it ourselves.
  if(Util.anyDuplicateInArray(new_dataset.related_datasets)) {
    throw new Util.InputError(`Each dataset may only have one instance of every related_dataset.`);
  }

  // If this draft is identical to the latest published, delete it.
  // The reason to do so is so when an update to a dataset is submitted, we won't create drafts of sub-datasets that haven't changed.
  if (!changes) {
    changes = await draftDifferentFromLastPublished(new_dataset);
    if (!changes) {
      // Delete the current draft
      try {
        await SharedFunctions.draftDelete(Dataset, uuid);
      } catch (err) {
        if (!(err instanceof Util.NotFoundError)) {
          throw err;
        }
      }
      return [false, uuid];
    }
  }

  // If a draft of this dataset already exists: overwrite it, using it's same uuid
  // If a draft of this dataset doesn't exist: create a new draft
  // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
  let response = await Dataset.updateOne(
    {uuid, 'publish_date': {'$exists': false}}, 
    {$set: new_dataset}, 
    {'upsert': true, session}
  );
  if (response.upsertedCount != 1 && response.matchedCount != 1) {
    throw new Error(`Dataset.validateAndCreateOrUpdate: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
  } 

  // If successfull, return the uuid of the created / updated dataset
  return [true, uuid];

}

// If a uuid is provided, update the dataset with the provided uuid.
// Otherwise, create a new dataset.
// If the updated dataset is the same as the last published, delete the draft instead of updating. 
// In both cases, validate the given dataset as well, making sure it adheres to the latest public template
// Return:
// 1. A boolean indicating true if there were changes from the last published.
// 2. The uuid of the dataset created / updated
async function validateAndCreateOrUpdate(dataset, user, session) {

  // Dataset must be an object
  if (!Util.isObject(dataset)) {
    throw new Util.InputError(`dataset provided is not an object: ${dataset}`);
  }

  let template;
  try {
    template = await TemplateModel.latestPublished(dataset.template_uuid, user);
    if(!template) {
      throw new Util.InputError(`a valid template_uuid was not provided for dataset with uuid ${dataset.uuid}`);
    }
  } catch(error) {
    if(error instanceof Util.InputError) {
      throw new Util.InputError(`a valid template_uuid was not provided for dataset with uuid ${dataset.uuid}`);
    }
    // if(error instanceof Util.PermissionDeniedError) {
    //   throw new Util.PermissionDeniedError(`You do not have the view permissions to template ${dataset.template_uuid} required to create/update a dataset referencing it.`);
    // }
    throw error;
  }

  // If this dataset does not already have a group uuid, create one for it
  let group_uuid;
  if (dataset.uuid) {
    let previous_dataset = await SharedFunctions.latestDocument(Dataset, dataset.uuid);
    if (previous_dataset) {
      group_uuid = previous_dataset.group_uuid;
    }
  }
  if(!group_uuid) {
    group_uuid = uuidv4();
  }

  let updated_at = new Date();

  return await validateAndCreateOrUpdateRecurser(dataset, template, user, session, group_uuid, updated_at);

}

// Fetches a dataset draft 
// If it does not exist, it creates a draft from the latest published.
// Does not lookup related_datasets
async function fetchDraftOrCreateFromPublished(uuid, session) {
  let dataset_draft = await SharedFunctions.draft(Dataset, uuid, session);
  if(dataset_draft) {
    return dataset_draft;
  }

  let published_dataset = await SharedFunctions.latestPublished(Dataset, uuid, session);
  if(!published_dataset) {
    return null;
  }
  dataset_draft = await createDraftFromPublished(published_dataset);

  return dataset_draft;
}

// Fetches the dataset draft with the given uuid, recursively looking up related_datasets.
// If a draft of a given dataset doesn't exist, a new one will be generated using the last published dataset.
async function draftFetchOrCreate(uuid, user, session) {

  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  // See if a draft of this dataset exists. 
  let dataset_draft = await fetchDraftOrCreateFromPublished(uuid, session);
  if (!dataset_draft) {
    return null;
  }
  
  // Make sure this user has a permission to be working with drafts
  if (!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_ADMIN, session))) {
    throw new Util.PermissionDeniedError(`You do not have the edit permissions required to view draft ${uuid}`);
  }

  // TODO: fetch fields from template if we have view permissions to that template

  // Now recurse into each related_dataset, replacing each uuid with an imbedded object
  let related_datasets = [];
  let related_dataset_uuids = [];
  for(let i = 0; i < dataset_draft.related_datasets.length; i++) {
    let related_dataset_uuid = dataset_draft.related_datasets[i];
    let related_dataset;
    try {
      related_dataset = await draftFetchOrCreate(related_dataset_uuid, user, session);
    } catch (err) {
      if (err instanceof Util.PermissionDeniedError) {
        // If we don't have permission for the draft, get the latest published instead
        try {
          related_dataset = await latestPublishedWithJoinsAndPermissions(related_dataset_uuid, user)
        } catch (err) {
          if (err instanceof Util.PermissionDeniedError || err instanceof Util.NotFoundError) {
            // If we don't have permission for the published version, or a published version doesn't exist, just attach a uuid and a flag marking no_permissions
            related_dataset = {uuid: related_dataset_uuid, no_permissions: true};
          } 
          else {
            throw err;
          }
        }
      } else {
        throw err;
      }
    }
    if(!related_dataset) {
      related_dataset = {uuid: related_dataset_uuid, deleted: true};
    }
    related_datasets.push(related_dataset);
    related_dataset_uuids.push(related_dataset.uuid);
    
  }

  dataset_draft.related_datasets = related_datasets;
  delete dataset_draft._id;

  return dataset_draft;

}

// This function will provide the timestamp of the last update made to this dataset and all of it's related_datasets
async function lastUpdateFor(uuid, user, session) {

  // TODO: this validation needs to be moved to the controller.
  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }

  let draft = await fetchDraftOrCreateFromPublished(uuid, session);
  if(!draft) {
    throw new Util.NotFoundError();
  }

  let published = await SharedFunctions.latestPublished(Dataset, uuid, session);
  let admin_permission = await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_ADMIN);
  let view_permission = await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_VIEW);

  if(!admin_permission) {
    if(!published) {
      throw new Util.PermissionDeniedError(`dataset ${uuid}: do not have admin permissions for draft, and no published version exists`);
    }
    if(!view_permission) {
      throw new Util.PermissionDeniedError(`dataset ${uuid}: do not have view or admin permissions`);
    }
    return published.updated_at;
  }

  let last_update = draft.updated_at;
  for(uuid of draft.related_datasets) {
    try {
      let update = await lastUpdateFor(uuid, user, session);
      if (update > last_update){
        last_update = update;
      }
    } catch (err) {
      if (err instanceof Util.NotFoundError || err instanceof Util.PermissionDeniedError) {
        // Don't bother trying to get last update from things that don't exist or we don't have permission to
      } else {
        throw err;
      }
    }
  }

  return last_update;

}

// A recursive helper for publish. 
// Publishes the dataset with the provided uuid
//   If a draft exists of the dataset, then:
//     if a template has been published more recently than the dataset, reject
//     if the template has been been published since the last_update that is a problem. Fail
//     if this dataset doesn't conform to the template, fail
//     if that draft has changes from the latest published (including changes to it's sub-properties):
//       publish it, and return the new internal_id
//     else: 
//       return the internal_id of the latest published
//   else:
//     return the internal_id of the latest_published
// Input: 
//   uuid: the uuid of a dataset to be published
//   user: the user publishing this template
//   session: the mongo session that must be used to make transactions atomic
//   template: the template this dataset must conform to
// Returns:
//   internal_id: the internal id of the published dataset
//   published: true if a new published version is created. false otherwise
async function publishRecurser(uuid, user, session, template) {

  var return_id;

  let published_dataset = await SharedFunctions.latestPublished(Dataset, uuid, session);

  // Check if a draft with this uuid exists
  let dataset_draft = await SharedFunctions.draft(Dataset, uuid, session);
  if(!dataset_draft) {
    // There is no draft of this uuid. Return the latest published dataset instead.
    if (!published_dataset) {
      throw new Util.NotFoundError(`Dataset with uuid ${uuid} does not exist`);
    }
    return [published_dataset._id, false];
  }

  // verify that this user is in the 'admin' permission group
  if (!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_ADMIN, session))) {
    throw new Util.PermissionDeniedError(`Do not have admin permissions for dataset uuid: ${uuid}`);
  }

  // verify that the template uuid on the dataset draft and the expected template uuid match
  if (dataset_draft.template_uuid != template.uuid) {
    throw new Error(`The draft provided ${dataset_draft} does not reference the template required ${template.uuid}. 
    Error in dataset update implementation.`);
  }

  // check that the draft update is more recent than the last template publish
  if ((await TemplateModel.latest_published_time_for_uuid(dataset_draft.template_uuid)) > dataset_draft.updated_at) {
    throw new Util.InputError(`Dataset ${dataset_draft.uuid}'s template has been published more recently than when the dataset was updated. 
    Update the dataset again before publishing.`);
  }

  // One way to determine if there were changes is to check if any sub-datasets have been published more recently than this one
  var last_published_time = 0;
  if(published_dataset) {
    last_published_time = published_dataset.publish_date;
  }

  let changes = false;
  let related_datasets = [];

  // For each dataset's related_datasets, publish that related_dataset, then replace the uuid with the internal_id.
  // It is possible there weren't any changes to publish, so keep track of whether we actually published anything.
  // Requirements:
  // - related_dataset can't point to a related_template not supported
  // - Each related_template must have a related_dataset pointing to it
  // - related_datasets is a set, so there can't be any duplicates
  // Plan: Create a map of template_uuid to template, and a set of all template_uuids.
  // Remove template_uuids from set as we see them. If there are any left at the end, that's an error
  let related_template_map = {};
  let templates_unseen = new Set();
  for (let related_template of template.related_templates) {
    let related_template_uuid = related_template.uuid;
    related_template_map[related_template_uuid] = related_template;
    templates_unseen.add(related_template_uuid);
  }
  for(let related_dataset of dataset_draft.related_datasets) {
    let related_dataset_document = await SharedFunctions.latestDocument(Dataset, related_dataset, session);
    if(!related_dataset_document) {
      throw new Util.InputError(`Cannot publish dataset. One of it's related_references does not exist and was probably deleted after creation.`);
    }
    let related_template_uuid = related_dataset_document.template_uuid;
    if(!(related_template_uuid in related_template_map)) {
      throw new Util.InputError(`One of the dataset's related_datsets points to a related_template not supported by it's template.`);
    } 
    let related_template = related_template_map[related_template_uuid];
    templates_unseen.delete(related_template_uuid);
    try {
      [related_dataset, _] = await publishRecurser(related_dataset, user, session, related_template);
      related_datasets.push(related_dataset);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError(`Internal reference within this draft is invalid. Fetch/update draft to cleanse it.`);
      } else if (err instanceof Util.PermissionDeniedError) {
        // TODO: add a test case for this case
        // If the user doesn't have permissions, assume they want to link the published version of the dataset
        // But before we can link the published version of the dataset, we must make sure it exists
        let related_dataset_published = await SharedFunctions.latestPublished(Dataset, related_dataset);
        if(!related_dataset_published) {
          throw new Util.InputError(`invalid link to dataset ${related_dataset}, which has no published version to link`);
        }
        related_datasets.push(related_dataset_published._id);
      } else {
        throw err;
      }
    }
    if (await SharedFunctions.publishDateFor_id(Dataset, related_dataset) > last_published_time) {
      changes = true;
    }
  }  
  if(templates_unseen.size > 0) {
    throw new Util.InputError(`Dataset does not support all related_templates required by the template`);
  }

  // We're trying to figure out if there is anything worth publishing. If none of the sub-properties were published, 
  // see if there are any changes to the top-level dataset from the previous published version
  if(!changes) {
    if (published_dataset) {
      return_id = published_dataset._id;
      // Add the check if the current template being used is different from the template being used by the last published
      if (template._id != published_dataset.template_id) {
        changes = true;
      } else if (!fieldsEqual(fields, published_dataset.fields) || 
                !Util.arrayEqual(related_datasets, published_dataset.related_datasets)) {
        changes = true;
      }
    } else {
      changes = true;
    }
  }

  // If there are changes, publish the current draft
  if(changes) {
    let publish_time = new Date();
    let response = await Dataset.updateOne(
      {"_id": dataset_draft._id},
      {'$set': {'updated_at': publish_time, 'publish_date': publish_time, related_datasets, 'template_id': template._id}},
      {session}
    )
    if (response.modifiedCount != 1) {
      throw `Dataset.publish: should be 1 modified document. Instead: ${response.modifiedCount}`;
    }
    return_id = dataset_draft._id;
  }

  return [return_id, changes];

}

// Publishes the dataset with the provided uuid
// Input: 
//   uuid: the uuid of a dataset to be published
//   user: the user publishing this uuid
//   session: the mongo session that must be used to make transactions atomic
//   last_update: the timestamp of the last known update by the user. Cannot publish if the actual last update and that expected by the user differ.
// Returns:
//   published: true if a new published version is created. false otherwise
async function publish(dataset_uuid, user, session, last_update) {

  let dataset = await SharedFunctions.draft(Dataset, dataset_uuid);
  if (!dataset) {
    dataset = await SharedFunctions.latestPublished(Dataset, dataset_uuid);
    if (!dataset) {
      throw new Util.NotFoundError(`Dataset with uuid ${dataset_uuid} does not exist`);
    } 
    return false;
  }

  // If the last update provided doesn't match to the last update found in the db, fail.
  let db_last_update = new Date(await lastUpdateFor(dataset_uuid, user, session));
  if(last_update.getTime() != db_last_update.getTime()) {
    throw new Util.InputError(`The last update submitted ${last_update.toISOString()} does not match that found in the db ${db_last_update.toISOString()}. 
    Fetch the draft again to get the latest update before attempting to publish again.`);
  }

  let template = await TemplateModel.latestPublishedWithoutPermissions(dataset.template_uuid);

  return (await publishRecurser(dataset_uuid, user, session, template))[1];

}

// Fetches the last dataset with the given uuid published before the given date. 
// Also recursively looks up fields and related_templates.
async function latestPublishedBeforeDateWithJoins(uuid, date, session) {
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
    }
  ]

  let current_pipeline = pipeline;

  let pipeline_addons = [
    {
      '$lookup': {
        'from': "datasets",
        'let': { 'ids': "$related_datasets"},
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
        'as': "related_datasets_objects"
      }
    },
    {
      "$addFields": {
        "related_datasets_objects_ids": { 
          "$map": {
            "input": "$related_datasets_objects",
            "in": "$$this._id"
          }
        }
      }
    },
    {
      "$addFields": {
        "related_datasets": { 
          "$map": {
            "input": "$related_datasets",
            "in": {"$arrayElemAt":[
              "$related_datasets_objects",
              {"$indexOfArray":["$related_datasets_objects_ids","$$this"]}
            ]}
          }
        }
      }
    },
    {"$project":{"related_datasets_objects":0,"related_datasets_objects_ids":0}}
  ];

  for(let i = 0; i < 5; i++) {
    // go one level deeper into related_datasets
    current_pipeline.push(...pipeline_addons);
    current_pipeline = pipeline_addons[0]['$lookup']['pipeline'];
    // create a copy
    pipeline_addons = JSON.parse(JSON.stringify(pipeline_addons));
  }
  let response = await Dataset.aggregate(pipeline, {session});
  if (await response.hasNext()){
    return await response.next();
  } else {
    throw new Util.NotFoundError(`No dataset exists with uuid ${uuid} which was published before the provided date.`);
  }
}

async function filterPublishedForPermissionsRecursor(dataset, user, session) {
  for(let i = 0; i < dataset.related_datasets.length; i++) {
    if(!(await SharedFunctions.userHasAccessToPublishedResource(dataset.related_datasets[i], user, PermissionGroupModel, session))) {
      dataset.related_datasets[i] = {uuid: dataset.related_datasets[i].uuid};
    } else {
      await filterPublishedForPermissionsRecursor(dataset.related_datasets[i], user, session);
    }
  }
}

async function filterPublishedForPermissions(dataset, user, session) {
  if(!(await SharedFunctions.userHasAccessToPublishedResource(dataset, user, PermissionGroupModel, session))) {
    throw new Util.PermissionDeniedError(`Do not have view access to dataset ${dataset.uuid}`);
  }
  await filterPublishedForPermissionsRecursor(dataset, user, session);
}

async function latestPublishedBeforeDateWithJoinsAndPermissions(uuid, date, user, session) {
  let dataset = await latestPublishedBeforeDateWithJoins(uuid, date, session);
  await filterPublishedForPermissions(dataset, user, session);
  return dataset;
} 

// Fetches the last published dataset with the given uuid. 
// Also recursively looks up related_datasets.
async function latestPublishedWithJoinsAndPermissions(uuid, user, session) {
  return await latestPublishedBeforeDateWithJoinsAndPermissions(uuid, new Date(), user, session);
}

async function duplicateRecursor(original_dataset, original_group_uuid, new_group_uuid, uuid_dictionary, user, session) {
  // verify that this user is in the 'view' permission group
  if (!(await SharedFunctions.userHasAccessToPublishedResource(original_dataset, user, PermissionGroupModel))) {
    throw new Util.PermissionDeniedError(`Do not have view permissions required to duplicate dataset: ${original_dataset.uuid}`);
  }

  // If this dataset wasn't created with the top-level dataset we're duplicating, reference it instead of creating a duplicate
  if(original_dataset.group_uuid != original_group_uuid) {
    return original_dataset.uuid;
  }

  // If a uuid from the old dataset has already been seen, it is a duplicate reference.
  if(original_dataset.uuid in uuid_dictionary) {
    return uuid_dictionary[original_dataset.uuid];
  } 

  // Otherwise, create a new uuid for the uuid_dictionary
  let uuid = uuidv4();
  uuid_dictionary[original_dataset.uuid] = uuid;

  let new_dataset = {
    uuid,
    updated_at: new Date(),
    template_uuid: original_dataset.template_uuid,
    group_uuid: new_group_uuid,
    related_datasets: []
  }
  for(dataset of original_dataset.related_datasets) {
    try {
      new_dataset.related_datasets.push(await duplicateRecursor(dataset, original_group_uuid, new_group_uuid, uuid_dictionary, user, session));
    } catch(error) {
      if(!(error instanceof Util.PermissionDeniedError)) {
        throw error;
      }
    }
  }

  // If a draft of this record already exists: overwrite it, using it's same uuid
  // If a draft of this record doesn't exist: create a new draft
  // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
  let response = await Dataset.insertOne(
    new_dataset, 
    {session}
  );
  if (response.insertedCount != 1) {
    throw new Error(`Dataset.duplicateRecursor: Inserted: ${response.insertedCount}.`);
  } 
  await PermissionGroupModel.initialize_permissions_for(user, new_dataset.uuid, session);

  return new_dataset.uuid;
}

async function duplicate(uuid, user, session) {
  let original_dataset = await latestPublishedWithJoinsAndPermissions(uuid, user);
  let original_group_uuid = original_dataset.group_uuid;
  let uuid_dictionary = {};
  let new_uuid = await duplicateRecursor(original_dataset, original_group_uuid, uuidv4(), uuid_dictionary, user, session);
  return await draftFetchOrCreate(new_uuid, user, session);
}

async function importDatasetFromCombinedRecursor(record, template, user, updated_at, session) {
  if(!Util.isObject(record)) {
    throw new Util.InputError('Record to import must be a json object.');
  }
  if(!record.template_uuid || typeof(record.template_uuid) !== 'string') {
    throw new Util.InputError('Record provided to import must have a template_uuid, which is a string.');
  }
  // Template must have already been imported
  let new_template_uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(record.template_uuid, session);
  if(!new_template_uuid) {
    throw new Util.InputError('template_uuid provided does not exist.');
  }

  if(template.uuid != new_template_uuid) {
    throw new Util.InputError(`template expects template_uuid ${template.uuid}. Record ${record.record_uuid} suuplied uuid ${new_template_uuid}`);
  }

  // template must be published and user must have read access
  let latest_published_template = await TemplateModel.latestPublished(new_template_uuid, user);
  if(!latest_published_template) {
    throw new Util.InputError(`Cannot import record with template_uuid ${record.template_uuid} because the template 
    (converted to uuid ${new_template_uuid}) has not yet been published.`);
  }

  if(!record.database_uuid || typeof(record.database_uuid) !== 'string') {
    throw new Util.InputError(`Record provided to import ${record.record_uuid} must have a database_uuid, which is a string.`);
  }

  // Now get the matching database uuid for the imported database uuid
  let old_uuid = record.database_uuid;
  let dataset_uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(old_uuid, session);
  // If the uuid is found, then this has already been imported. Import again if we have edit permissions
  if(dataset_uuid) {
    if(!(await PermissionGroupModel.has_permission(user, dataset_uuid, PermissionGroupModel.PERMISSION_ADMIN, session))) {
      throw new Util.PermissionDeniedError(`You do not have edit permissions required to import database ${old_uuid}. It has already been imported.`);
    }
  } else {
    dataset_uuid = await LegacyUuidToNewUuidMapperModel.create_new_uuid_for_old(old_uuid, session);
    await PermissionGroupModel.initialize_permissions_for(user, dataset_uuid, session);
  }

  // continue here with normal update procedures

  // Build object to create/update
  let new_dataset = {
    uuid: dataset_uuid,
    template_uuid: new_template_uuid,
    updated_at,
    related_datasets: []
  };

  if (record._record_metadata && Util.isObject(record._record_metadata) && 
      record._record_metadata._public_date && Date.parse(record._record_metadata._public_date)) {
    new_dataset.public_date = new Date(record._record_metadata._public_date);
  }

  // Need to determine if this draft is any different from the published one.
  let changes = false;

  // Recurse into related_records
  if(!record.records) {
    record.records = [];
  }
  if (!Array.isArray(record.records)){
    throw new Util.InputError('records property must be of type array');
  }
  if(record.records.length != template.related_templates.length) {
    throw new Util.InputError(`records of each record must correspond to related_templates of its template`);
  }
  let related_record_map = {};
  for (let related_record of record.records) {
    if(!Util.isObject(related_record)) {
      throw new Util.InputError(`Each record in records must be a json object`);
    }
    if(!related_record.template_uuid) {
      throw new Util.InputError(`Each record in records must supply a template_uuid`);
    }
    let new_template_uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(related_record.template_uuid, session);
    if(!(new_template_uuid in related_record_map)) {
      related_record_map[new_template_uuid] = [related_record];
    } else {
      related_record_map[new_template_uuid].push(related_record);
    }
  }
  for (let related_template of template.related_templates) {
    let related_template_uuid = related_template.uuid
    if(!related_record_map[related_template_uuid] || related_record_map[related_template_uuid].length == 0) {
      throw new Util.InputError(`The records in record must match up to the related_templates expected by the template`);
    }
    let related_record = related_record_map[related_template_uuid].shift();
    try {
      let new_changes;
      [new_changes, related_dataset] = await importDatasetFromCombinedRecursor(related_record, related_template, user, updated_at, session);
      changes = changes || new_changes;
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError(err.message);
      } else if (err instanceof Util.PermissionDeniedError) {
        // If we don't have admin permissions to the related_dataset, don't try to update/create it. Just link it
        related_dataset = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(related_record.database_uuid, session);
      } else {
        throw err;
      }
    }
    // After validating and updating the related_dataset, replace the related_dataset with a uuid reference
    new_dataset.related_datasets.push(related_dataset);
  } 
  
  // If this draft is identical to the latest published, delete it.
  // The reason to do so is so when an update to a dataset is submitted, we won't create drafts of sub-datasets that haven't changed.
  if (!changes) {
    changes = await draftDifferentFromLastPublished(new_dataset);
    if (!changes) {
      // Delete the current draft
      try {
        await SharedFunctions.draftDelete(Dataset, dataset_uuid);
      } catch (err) {
        if (!(err instanceof Util.NotFoundError)) {
          throw err;
        }
      }
      return [false, dataset_uuid];
    }
  }

  // If a draft of this dataset already exists: overwrite it, using it's same uuid
  // If a draft of this dataset doesn't exist: create a new draft
  // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
  let response = await Dataset.updateOne(
    {"uuid": dataset_uuid, 'publish_date': {'$exists': false}}, 
    {$set: new_dataset}, 
    {'upsert': true, session}
  );
  if (response.upsertedCount != 1 && response.matchedCount != 1) {
    throw new Error(`Dataset.importDatasetFromCombinedRecursor: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
  } 

  // If successfull, return the uuid of the created / updated dataset
  return [true, dataset_uuid];
  
}

// Wraps the actual request to create with a transaction
exports.create = async function(dataset, user) {
  const session = MongoDB.newSession();
  let inserted_uuid;
  try {
    await session.withTransaction(async () => {
      try {
        [_, inserted_uuid] = await validateAndCreateOrUpdate(dataset, user, session);
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
exports.draftGet = async function(uuid, user, session) {
  if(!session) {
    session = MongoDB.newSession();
    try {
      var draft;
      await session.withTransaction(async () => {
        try {
          draft = await draftFetchOrCreate(uuid, user, session);
        } catch(err) {
          await session.abortTransaction();
          throw err;
        }
      });
      session.endSession();
      return draft;
    } catch(err) {
      session.endSession();
      throw err;
    }
  } else {
    return await draftFetchOrCreate(uuid, user, session);
  }

}

// Wraps the actual request to update with a transaction
exports.update = async function(dataset, user) {
  const session = MongoDB.newSession();
  try {
    await session.withTransaction(async () => {
      try {
        await validateAndCreateOrUpdate(dataset, user, session);
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
exports.publish = async function(uuid, user, last_update) {
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

exports.latestPublished = latestPublishedWithJoinsAndPermissions;
exports.publishedBeforeDate = latestPublishedBeforeDateWithJoinsAndPermissions;

exports.draftDelete = async function(uuid, user) {
  // valid uuid
  if (!uuidValidate(uuid)) {
    throw new Util.InputError('The uuid provided is not in proper uuid format.');
  }
  // if draft doesn't exist, return not found
  if(!(await SharedFunctions.draft(Dataset, uuid))) {
    throw new Util.NotFoundError(`No draft exists with uuid ${uuid}`);
  }
  // if don't have admin permissions, return no permissions
  if(!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_ADMIN))) {
    throw new Util.PermissionDeniedError(`You do not have admin permissions for dataset ${uuid}.`);
  }

  await SharedFunctions.draftDelete(Dataset, uuid);
}

exports.draftExisting = async function(uuid) {
  return (await SharedFunctions.draft(Dataset, uuid)) ? true : false;
}

exports.latestPublishedWithoutPermissions = async function(uuid) {
  return await latestPublishedBeforeDateWithJoins(uuid, new Date());
}

exports.collection = function() {
  return Dataset;
}

exports.template_uuid = async function(uuid) {
  let dataset = await SharedFunctions.latestPublished(Dataset, uuid);
  if(!dataset) {
    dataset = await SharedFunctions.draft(Dataset, uuid);
  }

  if(dataset) {
    return dataset.template_uuid;
  }
}

// Wraps the actual request to duplicate with a transaction
exports.duplicate = async function(uuid, user) {
  const session = MongoDB.newSession();
  let new_dataset;
  try {
    await session.withTransaction(async () => {
      try {
        new_dataset = await duplicate(uuid, user, session);
      } catch(err) {
        await session.abortTransaction();
        throw err;
      }
    });
    session.endSession();
    return new_dataset;
  } catch(err) {
    session.endSession();
    throw err;
  }
}

exports.importDatasetFromCombinedRecursor = importDatasetFromCombinedRecursor;
exports.publishWithoutChecks = publishRecurser;