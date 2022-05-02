const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');
const TemplateModel = require('./template');
const PermissionGroupModel = require('./permission_group');
const SharedFunctions = require('./shared_functions');
const LegacyUuidToNewUuidMapperModel = require('./legacy_uuid_to_new_uuid_mapper');

var Dataset;

// Returns a reference to the dataset Mongo Collection
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

// Creates a draft from the persisted version.
async function createDraftFromPersisted(persisted) {

  // Create a copy of persisted
  let draft = Object.assign({}, persisted);

  delete draft._id;
  draft.updated_at = draft.persist_date;
  delete draft.persist_date;

  // Replace each of the related_dataset _ids with uuids. 
  let related_datasets = [];
  for(_id of persisted.related_datasets) {
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
         draft1.template_id.toString() == draft2.template_id.toString() &&
         Util.datesEqual(draft1.public_date, draft2.public_date) &&
         Util.arrayEqual(draft1.related_datasets, draft2.related_datasets);
}

// Returns true if the draft has any changes from it's previous persisted version
async function draftDifferentFromLastPersisted(draft, template_id) {
  // If there is no persisted version, obviously there are changes
  let latest_persisted = await SharedFunctions.latestPersisted(Dataset, draft.uuid);
  if(!latest_persisted) {
    return true;
  }

  // If the properties have changed since the last persisting
  let latest_persisted_as_draft = await createDraftFromPersisted(latest_persisted);
  if (!draftsEqual(draft, latest_persisted_as_draft)) {
    return true;
  }

  // Finally, if any of the dependencies have been persisted more recently than this record, then there are changes
  for(let related_dataset of draft.related_datasets) {
    let related_dataset_last_persisted = (await SharedFunctions.latestPersisted(Dataset, related_dataset)).persist_date;
    if (Util.compareTimeStamp(related_dataset_last_persisted, latest_persisted.persist_date) > 0) {
      return true;
    }
  }

  return false;
}

async function extractRelatedDatasetsFromCreateOrUpdate(input_related_datasets, template, user, session, group_uuid, updated_at) {
  let return_datasets = [];
  let changes = false;
  // Recurse into related_datasets
  if(!input_related_datasets) {
    input_related_datasets = [];
  }
  if (!Array.isArray(input_related_datasets)){
    throw new Util.InputError('related_datasets property must be of type array');
  }
  // Requirements:
  // - Each related/subscribed template must have a related_dataset pointing to it
  // - Same related_dataset can't be repeated twice
  // - each related_dataset must point to a supported template
  // Plan: Create a dict of supported templates, and sets of unseen templates and seen datasets. 
  // Go through list of related_datasets. It must be in supported templates, and not in seen datasets.
  // At the end, check if unseen datasets still has anything
  let supported_templates = {};
  let unseen_templates = new Set();
  let seen_datasets = new Set();
  for (let related_template of template.related_templates) {
    supported_templates[related_template._id.toString()] = related_template;
    unseen_templates.add(related_template._id.toString());
  }
  for(let subscribed_template of template.subscribed_templates) {
    supported_templates[subscribed_template._id.toString()] = subscribed_template;
    unseen_templates.add(subscribed_template._id.toString());
  }
  for (let related_dataset of input_related_datasets) {
    if(!Util.isObject(related_dataset)) {
      throw new Util.InputError(`Each related_dataset in the dataset must be a json object`);
    }
    if(related_dataset.uuid) {
      if(seen_datasets.has(related_dataset.uuid)) {
        throw new Util.InputError(`related_datasets is a set, and as such, no dataset uuid may be duplicated`);
      } else {
        seen_datasets.add(related_dataset.uuid);
      }
    }
    if(!related_dataset.template_id) {
      // There is a chance the user will link a dataset they don't have view access to.
      // In this case, there will be no template_id. Thus, try to fetch the template _id. 
      let existing_dataset = await SharedFunctions.latestDocument(Dataset, related_dataset.uuid);
      if(!existing_dataset) {
        throw new Util.InputError(`Each related_dataset in the dataset must supply a template_uuid`);
      }
      related_dataset.template_id = existing_dataset.template_id.toString();
    }
    if(!(related_dataset.template_id in supported_templates)) {
      throw new Util.InputError(`related_template _id ${related_dataset.template_id} is not supported by template ${template._id}`);
    }
    let related_template = supported_templates[related_dataset.template_id];
    unseen_templates.delete(related_dataset.template_id);

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
    return_datasets.push(related_dataset);
  } 
  if(unseen_templates.size > 0) {
    throw new Util.InputError(`Dataset must provide at least one related_dataset corresponding to every related_template required by the template.`);
  }
  return [return_datasets, changes];
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

  if(!input_dataset.template_id || typeof(input_dataset.template_id) !== 'string') {
    throw new Util.InputError(`dataset template_id property must be a valid string`);
  }
  // Verify that the template_id provided by the user is the template_id of a persisted template
  if(input_dataset.template_id != template._id.toString()) {
    throw new Util.InputError(`The template _id provided by the dataset (${input_dataset.template_id}) does not correspond to the template _id expected by the template (${template._id})`);
  }
  if(!(await SharedFunctions.userHasAccessToPersistedResource(TemplateModel.collection(), template.uuid, user, PermissionGroupModel, session))) {
    throw new Util.PermissionDeniedError(`Cannot link to template_id ${template._id}, as you do not have view permissions to it`);
  }

  // Build object to create/update
  let new_dataset = {
    uuid,
    template_id: SharedFunctions.convertToMongoId(input_dataset.template_id),
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

  let old_system_uuid = await LegacyUuidToNewUuidMapperModel.get_old_uuid_from_new(uuid);
  if(old_system_uuid) {
    new_dataset.old_system_uuid = old_system_uuid;
  }

  // Need to determine if this draft is any different from the persisted one.
  let changes = false;

  [new_dataset.related_datasets, changes] = await extractRelatedDatasetsFromCreateOrUpdate(input_dataset.related_datasets, template, user, session, group_uuid, updated_at);

  // If this draft is identical to the latest persisted, delete it.
  // The reason to do so is so when an update to a dataset is submitted, we won't create drafts of sub-datasets that haven't changed.
  if (!changes) {
    changes = await draftDifferentFromLastPersisted(new_dataset, template._id);
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
    {uuid, 'persist_date': {'$exists': false}}, 
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
// If the updated dataset is the same as the last persisted, delete the draft instead of updating. 
// In both cases, validate the given dataset as well, making sure it adheres to the latest public template
// Return:
// 1. A boolean indicating true if there were changes from the last persisted.
// 2. The uuid of the dataset created / updated
async function validateAndCreateOrUpdate(session, dataset, user) {

  // Dataset must be an object
  if (!Util.isObject(dataset)) {
    throw new Util.InputError(`dataset provided is not an object: ${dataset}`);
  }

  let template = await TemplateModel.persistedByIdWithoutPermissions(SharedFunctions.convertToMongoId(dataset.template_id));
  if(!template) {
    throw new Util.InputError(`a valid template_id was not provided for the head dataset`);
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
// If it does not exist, it creates a draft from the latest persisted.
// Does not lookup related_datasets
async function fetchDraftOrCreateFromPersisted(uuid, session) {
  let dataset_draft = await SharedFunctions.draft(Dataset, uuid, session);
  if(dataset_draft) {
    return dataset_draft;
  }

  let persisted_dataset = await SharedFunctions.latestPersisted(Dataset, uuid, session);
  if(!persisted_dataset) {
    return null;
  }
  dataset_draft = await createDraftFromPersisted(persisted_dataset);

  return dataset_draft;
}

// Fetches the dataset draft with the given uuid, recursively looking up related_datasets.
// If a draft of a given dataset doesn't exist, a new one will be generated using the last persisted dataset.
async function draftFetchOrCreate(session, uuid, user) {

  // See if a draft of this dataset exists. 
  let dataset_draft = await fetchDraftOrCreateFromPersisted(uuid, session);
  if (!dataset_draft) {
    return null;
  }
  
  // Make sure this user has a permission to be working with drafts
  if (!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_ADMIN, session))) {
    throw new Util.PermissionDeniedError(`You do not have the edit permissions required to view draft ${uuid}`);
  }

  // Now recurse into each related_dataset, replacing each uuid with an imbedded object
  let related_datasets = [];
  let related_dataset_uuids = [];
  for(let i = 0; i < dataset_draft.related_datasets.length; i++) {
    let related_dataset_uuid = dataset_draft.related_datasets[i];
    let related_dataset;
    try {
      related_dataset = await draftFetchOrCreate(session, related_dataset_uuid, user);
    } catch (err) {
      if (err instanceof Util.PermissionDeniedError) {
        // If we don't have permission for the draft, get the latest persisted instead
        try {
          related_dataset = await latestPersistedWithJoinsAndPermissions(related_dataset_uuid, user)
        } catch (err) {
          if (err instanceof Util.PermissionDeniedError || err instanceof Util.NotFoundError) {
            // If we don't have permission for the persisted version, or a persisted version doesn't exist, just attach a uuid and a flag marking no_permissions
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
async function lastUpdateFor(session, uuid, user) {

  let draft = await fetchDraftOrCreateFromPersisted(uuid, session);
  if(!draft) {
    throw new Util.NotFoundError();
  }

  let persisted = await SharedFunctions.latestPersisted(Dataset, uuid, session);
  let admin_permission = await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_ADMIN);
  let view_permission = await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_VIEW);

  if(!admin_permission) {
    if(!persisted) {
      throw new Util.PermissionDeniedError(`dataset ${uuid}: do not have admin permissions for draft, and no persisted version exists`);
    }
    if(!view_permission) {
      throw new Util.PermissionDeniedError(`dataset ${uuid}: do not have view or admin permissions`);
    }
    return persisted.updated_at;
  }

  let last_update = draft.updated_at;
  for(uuid of draft.related_datasets) {
    try {
      let update = await lastUpdateFor(session, uuid, user);
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

async function persistRelatedDatasets(input_related_dataset_uuids, template, user, session) {
  let result_dataset_ids = [];
  // For each dataset's related_datasets, persist that related_dataset, then replace the uuid with the internal_id.
  // It is possible there weren't any changes to persist, so keep track of whether we actually persisted anything.
  // Requirements:
  // - related_dataset can't point to a related_template not supported
  // - Each related_template must have a related_dataset pointing to it
  // - related_datasets is a set, so there can't be any duplicates
  // Plan: Create a map of template_id to template, and a set of all template_ids.
  // Remove template_uuids from set as we see them. If there are any left at the end, that's an error
  let related_template_map = {};
  let templates_unseen = new Set();
  for (let related_template of template.related_templates) {
    related_template_map[related_template._id.toString()] = related_template;
    templates_unseen.add(related_template._id.toString());
  }
  for (let subscribed_template of template.subscribed_templates) {
    related_template_map[subscribed_template._id.toString()] = subscribed_template;
    templates_unseen.add(subscribed_template._id.toString());
  }
  for(let related_dataset_uuid of input_related_dataset_uuids) {
    let related_dataset_document = await SharedFunctions.latestDocument(Dataset, related_dataset_uuid, session);
    if(!related_dataset_document) {
      throw new Util.InputError(`Cannot persist dataset. One of it's related_references does not exist and was probably deleted after creation.`);
    }
    let related_template_id = related_dataset_document.template_id.toString();
    if(!(related_template_id in related_template_map)) {
      throw new Util.InputError(`One of the dataset's related_datsets points to a related_template not supported by it's template.`);
    } 
    let related_template = related_template_map[related_template_id];
    templates_unseen.delete(related_template_id);
    try {
      let related_dataset_id = await persistRecurser(related_dataset_uuid, user, session, related_template);
      result_dataset_ids.push(related_dataset_id);
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError(`Internal reference within this draft is invalid. Fetch/update draft to cleanse it.`);
      } else if (err instanceof Util.PermissionDeniedError) {
        // If the user doesn't have permissions, assume they want to link the persisted version of the dataset
        // But before we can link the persisted version of the dataset, we must make sure it exists
        let related_dataset_persisted = await SharedFunctions.latestPersisted(Dataset, related_dataset_uuid);
        if(!related_dataset_persisted) {
          throw new Util.InputError(`Invalid link to dataset ${related_dataset_uuid}, which has no persisted version to link.`);
        }
        result_dataset_ids.push(related_dataset_persisted._id);
      } else {
        throw err;
      }
    }
  }  
  if(templates_unseen.size > 0) {
    throw new Util.InputError(`Dataset does not support all related_templates required by the template`);
  }
  return result_dataset_ids;
}

// A recursive helper for persist. 
// Persistes the dataset with the provided uuid
//   If a draft exists of the dataset, then:
//     if a template has been persisted more recently than the dataset, reject
//     if the template has been been persisted since the last_update that is a problem. Fail
//     if this dataset doesn't conform to the template, fail
//     if that draft has changes from the latest persisted (including changes to it's sub-properties):
//       persist it, and return the new internal_id
//     else: 
//       return the internal_id of the latest persisted
//   else:
//     return the internal_id of the latest_persisted
// Input: 
//   uuid: the uuid of a dataset to be persisted
//   user: the user persisting this template
//   session: the mongo session that must be used to make transactions atomic
//   template: the template this dataset must conform to
// Returns:
//   internal_id: the internal id of the persisted dataset
async function persistRecurser(uuid, user, session, template) {

  let persisted_dataset = await SharedFunctions.latestPersisted(Dataset, uuid, session);

  // Check if a draft with this uuid exists
  let dataset_draft = await SharedFunctions.draft(Dataset, uuid, session);
  if(!dataset_draft) {
    // There is no draft of this uuid. Return the latest persisted dataset instead.
    if (!persisted_dataset) {
      throw new Util.NotFoundError(`Dataset with uuid ${uuid} does not exist`);
    }
    return persisted_dataset._id;
  }

  // verify that this user is in the 'admin' permission group
  if (!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_ADMIN, session))) {
    throw new Util.PermissionDeniedError(`Do not have admin permissions for dataset uuid: ${uuid}`);
  }

  // verify that the template uuid on the dataset draft and the expected template uuid match
  if (dataset_draft.template_id.toString() != template._id.toString()) {
    throw new Error(`The draft provided ${dataset_draft} does not reference the template required ${template._id}.`);
  }

  let related_datasets = await persistRelatedDatasets(dataset_draft.related_datasets, template, user, session);

  let persist_time = new Date();
  let response = await Dataset.updateOne(
    {"_id": dataset_draft._id},
    {'$set': {'updated_at': persist_time, 'persist_date': persist_time, related_datasets}},
    {session}
  )
  if (response.modifiedCount != 1) {
    throw `Dataset.persist: should be 1 modified document. Instead: ${response.modifiedCount}`;
  }
  return dataset_draft._id;
}

// Persistes the dataset with the provided uuid
// Input: 
//   uuid: the uuid of a dataset to be persisted
//   user: the user persisting this uuid
//   session: the mongo session that must be used to make transactions atomic
//   last_update: the timestamp of the last known update by the user. Cannot persist if the actual last update and that expected by the user differ.
async function persist(session, dataset_uuid, user, last_update) {

  let dataset = await SharedFunctions.draft(Dataset, dataset_uuid);
  if (!dataset) {
    dataset = await SharedFunctions.latestPersisted(Dataset, dataset_uuid);
    if (!dataset) {
      throw new Util.NotFoundError(`Dataset with uuid ${dataset_uuid} does not exist`);
    } 
    throw new Util.InputError('No changes to persist');
  }

  // If the last update provided doesn't match to the last update found in the db, fail.
  let db_last_update = new Date(await lastUpdateFor(session, dataset_uuid, user));
  if(last_update.getTime() != db_last_update.getTime()) {
    throw new Util.InputError(`The last update submitted ${last_update.toISOString()} does not match that found in the db ${db_last_update.toISOString()}. 
    Fetch the draft again to get the latest update before attempting to persist again.`);
  }

  let template = await TemplateModel.persistedByIdWithoutPermissions(SharedFunctions.convertToMongoId(dataset.template_id));

  await persistRecurser(dataset_uuid, user, session, template);
}

// Fetches the last dataset with the given uuid persisted before the given date. 
// Also recursively looks up fields and related_templates.
async function latestPersistedBeforeDateWithJoins(uuid, date, session) {
  // Construct a mongodb aggregation pipeline that will recurse into related templates up to 5 levels deep.
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
    throw new Util.NotFoundError(`No dataset exists with uuid ${uuid} which was persisted before the provided date.`);
  }
}

async function filterPersistedForPermissionsRecursor(dataset, user, session) {
  for(let i = 0; i < dataset.related_datasets.length; i++) {
    if(!(await SharedFunctions.userHasAccessToPersistedResource(Dataset, dataset.related_datasets[i].uuid, user, PermissionGroupModel, session))) {
      dataset.related_datasets[i] = {uuid: dataset.related_datasets[i].uuid};
    } else {
      await filterPersistedForPermissionsRecursor(dataset.related_datasets[i], user, session);
    }
  }
}

async function filterPersistedForPermissions(dataset, user, session) {
  if(!(await SharedFunctions.userHasAccessToPersistedResource(Dataset, dataset.uuid, user, PermissionGroupModel, session))) {
    throw new Util.PermissionDeniedError(`Do not have view access to dataset ${dataset.uuid}`);
  }
  await filterPersistedForPermissionsRecursor(dataset, user, session);
}

async function latestPersistedBeforeDateWithJoinsAndPermissions(uuid, date, user, session) {
  let dataset = await latestPersistedBeforeDateWithJoins(uuid, date, session);
  await filterPersistedForPermissions(dataset, user, session);
  return dataset;
} 

// Fetches the last persisted dataset with the given uuid. 
// Also recursively looks up related_datasets.
async function latestPersistedWithJoinsAndPermissions(uuid, user, session) {
  return await latestPersistedBeforeDateWithJoinsAndPermissions(uuid, new Date(), user, session);
}

async function duplicateRecursor(original_dataset, original_group_uuid, new_group_uuid, uuid_dictionary, user, session) {
  // verify that this user is in the 'view' permission group
  if (!(await SharedFunctions.userHasAccessToPersistedResource(Dataset, original_dataset.uuid, user, PermissionGroupModel))) {
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
    template_id: original_dataset.template_id,
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
  if (!response.acknowledged) {
    throw new Error(`Dataset.duplicateRecursor: Inserting failed`);
  } 
  await PermissionGroupModel.initialize_permissions_for(user, new_dataset.uuid, session);

  return new_dataset.uuid;
}

async function duplicate(session, uuid, user) {
  let original_dataset = await latestPersistedWithJoinsAndPermissions(uuid, user);
  let original_group_uuid = original_dataset.group_uuid;
  let uuid_dictionary = {};
  let new_uuid = await duplicateRecursor(original_dataset, original_group_uuid, uuidv4(), uuid_dictionary, user, session);
  return await draftFetchOrCreate(session, new_uuid, user);
}

async function createMissingDatasetForImport(template, user, updated_at, session) {
  let uuid = uuidv4();
  await PermissionGroupModel.initialize_permissions_for(user, uuid, session);
  let dataset = {
    uuid,
    template_uuid: template.uuid,
    updated_at,
    related_datasets: []
  }
  for (let related_template of template.related_templates) {
    dataset.related_datasets.push(await createMissingDatasetForImport(related_template, user, updated_at, session));
  }

  let response = await Dataset.insertOne(dataset, {session});
  if (!response.acknowledged) {
    throw new Error(`Dataset.importDatasetFromCombinedRecursor: Inserting failed`);
  } 

  return uuid;
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

  // template must be persisted and user must have read access
  let latest_persisted_template = await TemplateModel.latestPersisted(new_template_uuid, user);
  if(!latest_persisted_template) {
    throw new Util.InputError(`Cannot import record with template_uuid ${record.template_uuid} because the template 
    (converted to uuid ${new_template_uuid}) has not yet been persisted.`);
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
    imported_dataset_uuid: old_uuid,
    template_uuid: new_template_uuid,
    updated_at,
    related_datasets: []
  };

  if (record._record_metadata && Util.isObject(record._record_metadata) && 
      record._record_metadata._public_date && Date.parse(record._record_metadata._public_date)) {
    new_dataset.public_date = new Date(record._record_metadata._public_date);
  }

  // Need to determine if this draft is any different from the persisted one.
  let changes = false;

  // Recurse into related_datasets
  if(!record.records) {
    record.records = [];
  }
  if (!Array.isArray(record.records)){
    throw new Util.InputError('records property must be of type array');
  }

  // Requirements:
  // - Each related template must have a related_dataset pointing to it. For import, if create blank datasets if necessary
  // - Same related_dataset can't be repeated twice
  // - each related_dataset must point to a supported template
  // Plan: Create a dict of supported templates, and sets of unseen templates and seen datasets. 
  // Go through list of related_datasets. If it's It must be in supported templates, and not in seen datasets.
  // At the end, check if unseen datasets still has anything
  let supported_templates = {};
  let unseen_templates = new Set();
  let seen_datasets = new Set();
  for (let related_template of template.related_templates) {
    supported_templates[related_template.uuid] = related_template;
    unseen_templates.add(related_template.uuid);
  }
  for (let related_dataset of record.records) {
    if(!Util.isObject(related_dataset)) {
      throw new Util.InputError(`Each related_dataset in the dataset must be a json object`);
    }
    if(!related_dataset.database_uuid) {
      if(seen_datasets.has(related_dataset.database_uuid)) {
        throw new Util.InputError(`related_datasets is a set, and as such, no dataset uuid may be duplicated`);
      } else {
        seen_datasets.add(related_dataset.database_uuid);
      }
    }
    if(!related_dataset.template_uuid ||  related_dataset.template_uuid == "") {
      continue;
    } 
    let new_related_template_uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(related_dataset.template_uuid, session);
    if(!(new_related_template_uuid in supported_templates)) {
      throw new Util.InputError(`related_template uuid ${new_related_template_uuid} is not supported by template ${template.uuid}`);
    }
    let related_template = supported_templates[new_related_template_uuid];
    unseen_templates.delete(new_related_template_uuid);

    try {
      let new_changes;
      [new_changes, related_dataset] = await importDatasetFromCombinedRecursor(related_dataset, related_template, user, updated_at, session);
      changes = changes || new_changes;
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError(err.message);
      } else if (err instanceof Util.PermissionDeniedError) {
        // If we don't have admin permissions to the related_dataset, don't try to update/create it. Just link it
        related_dataset = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(related_dataset.database_uuid, session);
      } else {
        throw err;
      }
    }
    // After validating and updating the related_dataset, replace the related_dataset with a uuid reference
    new_dataset.related_datasets.push(related_dataset);
  } 
  // In the case of import, if there isn't a dataset provided for a required template, just create one for it
  for(let unseen_template of unseen_templates) {
    let related_template = supported_templates[unseen_template];
    changes = true;
    related_dataset = await createMissingDatasetForImport(related_template, user, updated_at, session);
    new_dataset.related_datasets.push(related_dataset);
  }


  
  
  // If this draft is identical to the latest persisted, delete it.
  // The reason to do so is so when an update to a dataset is submitted, we won't create drafts of sub-datasets that haven't changed.
  if (!changes) {
    changes = await draftDifferentFromLastPersisted(new_dataset, template._id);
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
    {"uuid": dataset_uuid, 'persist_date': {'$exists': false}}, 
    {$set: new_dataset}, 
    {'upsert': true, session}
  );
  if (response.upsertedCount != 1 && response.matchedCount != 1) {
    throw new Error(`Dataset.importDatasetFromCombinedRecursor: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
  } 

  // If successfull, return the uuid of the created / updated dataset
  return [true, dataset_uuid];
  
}

function newDatasetForTemplate(template) {
  let dataset = {
    template_id: template._id,
    related_datasets: []
  };
  for(let related_template of template.related_templates) {
    dataset.related_datasets.push(newDatasetForTemplate(related_template));
  }
  for(let subscribed_template of template.subscribed_templates) {
    dataset.related_datasets.push(newDatasetForTemplate(subscribed_template));
  }
  return dataset;
}

async function importDatasetForTemplate(template, user, session, updated_at) {
  let old_template_uuid = template.template_uuid;
  let new_template_uuid = await LegacyUuidToNewUuidMapperModel.get_new_uuid_from_old(old_template_uuid, session);
  let new_template = await SharedFunctions.latestPersisted(TemplateModel.collection(), new_template_uuid, session);
  

  let dataset_uuid = await LegacyUuidToNewUuidMapperModel.get_secondary_uuid_from_old(old_template_uuid, session);
  // If the uuid is found, then this has already been imported. Import again if we have edit permissions
  if(dataset_uuid) {
    if(!(await PermissionGroupModel.has_permission(user, dataset_uuid, PermissionGroupModel.PERMISSION_EDIT, session))) {
      throw new Util.PermissionDeniedError(`You do not have edit permissions required to import dataset ${old_template_uuid}. It has already been imported.`);
    }
  } else {
    dataset_uuid = await LegacyUuidToNewUuidMapperModel.create_secondary_uuid_for_old(old_template_uuid, session);
    await PermissionGroupModel.initialize_permissions_for(user, dataset_uuid, session);
  }

  let dataset = {
    uuid: dataset_uuid,
    old_system_uuid: old_template_uuid,
    template_id: new_template._id,
    updated_at, 
    public_date: new_template.public_date,
    related_datasets: []
  };

  if (template.related_databases !== undefined) {
    for(let related_template of template.related_databases) {
      let related_dataset_uuid;
      try {
        related_dataset_uuid = await importDatasetForTemplate(related_template, user, session, updated_at);
      } catch(err) {
        if (err instanceof Util.PermissionDeniedError) {
          // If the user doesn't have edit permissions, assume they want to link the persisted version of the dataset, or keep something another editor added
          related_dataset_uuid = await LegacyUuidToNewUuidMapperModel.get_secondary_uuid_from_old(related_template.template_uuid, session);
          // make sure the above dataset has been published
          if(!(await SharedFunctions.latestPersisted(Dataset, related_dataset_uuid, session))) {
            throw new Util.PermissionDeniedError();
          }
        } else {
          throw err;
        }
      }
      dataset.related_datasets.push(related_dataset_uuid)
    }
  } 

  let response = await Dataset.updateOne(
    {"uuid": dataset.uuid, 'persist_date': {'$exists': false}}, 
    {$set: dataset}, 
    {'upsert': true, session}
  );
  if (response.upsertedCount != 1 && response.matchedCount != 1) {
    throw new Error(`Template.importTemplate: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
  } 
  return dataset.uuid;
}

// Wraps the actual request to create with a transaction
exports.create = async function(dataset, user, session) {
  let inserted_uuid;
  if(session) {
    [_, inserted_uuid] = await validateAndCreateOrUpdate(session, dataset, user);
  } else {
    [_, inserted_uuid] = await SharedFunctions.executeWithTransaction(validateAndCreateOrUpdate, dataset, user);
  }
  return inserted_uuid;
}

// Wraps the actual request to get with a transaction
exports.draftGet = async function(uuid, user, session) {
  if(!session) {
    let dataset = await SharedFunctions.executeWithTransaction(draftFetchOrCreate, uuid, user);
    return dataset;
  } else {
    return await draftFetchOrCreate(session, uuid, user);
  }
}

// Wraps the actual request to update with a transaction
exports.update = async function(dataset, user) {
  await SharedFunctions.executeWithTransaction(validateAndCreateOrUpdate, dataset, user);
}

// Wraps the actual request to persist with a transaction
exports.persist = async function(uuid, user, last_update) {
  await SharedFunctions.executeWithTransaction(persist, uuid, user, last_update);
}

// Wraps the actual request to getUpdate with a transaction
exports.lastUpdate = async function(uuid, user) {
  let update = await SharedFunctions.executeWithTransaction(lastUpdateFor, uuid, user);
  return update;
}

exports.latestPersisted = latestPersistedWithJoinsAndPermissions;
exports.persistedBeforeDate = latestPersistedBeforeDateWithJoinsAndPermissions;

exports.draftDelete = async function(uuid, user) {
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

exports.latestPersistedWithoutPermissions = async function(uuid) {
  return await latestPersistedBeforeDateWithJoins(uuid, new Date());
}

exports.collection = function() {
  return Dataset;
}

exports.template_uuid = async function(uuid) {
  let dataset = await SharedFunctions.latestDocument(Dataset, uuid);
  if(!dataset) {
    return null;
  }
  return await SharedFunctions.uuidFor_id(TemplateModel.collection(), dataset.template_id);
}

// Wraps the actual request to duplicate with a transaction
exports.duplicate = async function(uuid, user) {
  let new_dataset = await SharedFunctions.executeWithTransaction(duplicate, uuid, user);
  return new_dataset;
}

exports.newDatasetForTemplate = async function(template_uuid, user, session) {
  let template = await TemplateModel.latestPersisted(template_uuid, user, session);
  if(!template) {
    throw new Util.NotFoundError(`No persisted template exists with uuid ${template_uuid}`);
  }
  return newDatasetForTemplate(template);
}

exports.importDatasetFromCombinedRecursor = importDatasetFromCombinedRecursor;
exports.persistWithoutChecks = persistRecurser;

exports.importDatasetForTemplate = async (template, user, session) => {
  return await importDatasetForTemplate(template, user, session, new Date());
};