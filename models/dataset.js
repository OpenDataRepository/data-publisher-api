const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');
const TemplateModel = require('./template');
const PermissionGroupModel = require('./permission_group');
const SharedFunctions = require('./shared_functions');

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
         draft1.name == draft2.name &&
         draft1.description == draft2.description &&
         draft1.public_date == draft2.public_date &&
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
async function validateAndCreateOrUpdateRecurser(dataset, template, user, session, group_uuid) {

  // dataset must be an object
  if (!Util.isObject(dataset)) {
    throw new Util.InputError(`dataset provided is not an object or a valid uuid: ${dataset}`);
  }

  // If a dataset uuid is provided, this is an update
  if (dataset.uuid) {
    // Dataset must have a valid uuid. 
    if (!uuidValidate(dataset.uuid)) {
      throw new Util.InputError("each dataset must have a valid uuid property");
    }
    
    // Dataset uuid must exist
    if (!(await SharedFunctions.exists(Dataset, dataset.uuid, session))) {
      throw new Util.NotFoundError(`No dataset exists with uuid ${dataset.uuid}`);
    }

    // verify that this user is in the 'admin' permission group
    if (!(await PermissionGroupModel.has_permission(user, dataset.uuid, PermissionGroupModel.PERMISSION_ADMIN))) {
      throw new Util.PermissionDeniedError(`Do not have admin permissions for dataset uuid: ${dataset.uuid}`);
    }

    group_uuid = (await SharedFunctions.latestDocument(Dataset, dataset.uuid)).group_uuid;
  }
  // Otherwise, this is a create, so generate a new uuid
  else {
    dataset.uuid = uuidv4();
    await PermissionGroupModel.initialize_permissions_for(user, dataset.uuid, session);
  }

  // Verify that the template uuid provided by the user is the correct template uuid expected by the latest published template
  if(dataset.template_uuid != template.uuid) {
    throw new Util.InputError(`The template uuid provided by the dataset (${dataset.template_uuid}) does not correspond to the template uuid expected by the template (${template.uuid})`);
  }

  // Build object to create/update
  let name = "";
  let description = "";
  let public_date;
  let related_datasets = [];
  if (dataset.name !== undefined) {
    if (typeof(dataset.name) !== 'string'){
      throw new Util.InputError('name property must be of type string');
    }
    name = dataset.name
  }
  if (dataset.description !== undefined) {
    if (typeof(dataset.description) !== 'string'){
      throw new Util.InputError('description property must be of type string');
    }
    description = dataset.description
  }
  if (dataset.public_date) {
    if (!Date.parse(dataset.public_date)){
      throw new Util.InputError('dataset public_date property must be in valid date format');
    }
    public_date = new Date(dataset.public_date);
    if(!template.public_date || public_date < (new Date(template.public_date))) {
      throw new Util.InputError(`public_date for dataset must be later than the public_date for it's template. date provided: ${public_date.toISOString()}, template uuid: ${template.uuid}, template public_date: ${template.public_date}`);
    }
  }

  // Need to determine if this draft is any different from the published one.
  let changes = false;

  // Recurse into related_datasets
  if(!dataset.related_datasets) {
    dataset.related_datasets = [];
  }
  // Recurse into related_datasets
  if (!Array.isArray(dataset.related_datasets)){
    throw new Util.InputError('related_datasets property must be of type array');
  }
  if(dataset.related_datasets.length != template.related_templates.length) {
    throw new Util.InputError(`related_datasets of dataset must correspond to related_templates of its template`);
  }
  for (let i = 0; i < dataset.related_datasets.length; i++) {
    let related_dataset;
    try {
      let new_changes;
      [new_changes, related_dataset] = await validateAndCreateOrUpdateRecurser(dataset.related_datasets[i], template.related_templates[i], user, session, group_uuid);
      changes = changes || new_changes;
    } catch(err) {
      if (err instanceof Util.NotFoundError) {
        throw new Util.InputError(err.message);
      } else if (err instanceof Util.PermissionDeniedError) {
        // If we don't have admin permissions to the related_dataset, don't try to update/create it. Just link it
        related_dataset = dataset.related_datasets[i].uuid;
      } else {
        throw err;
      }
    }
    // After validating and updating the related_dataset, replace the object with a uuid reference
    related_datasets.push(related_dataset);
  }

  // Create the dataset to save
  let dataset_to_save = {
    uuid: dataset.uuid,
    template_uuid: dataset.template_uuid,
    name: name,
    description: description,
    group_uuid,
    related_datasets: related_datasets
  };
  if(public_date) {
    dataset_to_save.public_date = public_date;
  }

  // If this draft is identical to the latest published, delete it.
  // The reason to do so is so when a change is submitted, we won't create drafts of sub-datasets.
  if (!changes) {
    changes = await draftDifferentFromLastPublished(dataset_to_save);
    if (!changes) {
      // Delete the current draft
      try {
        await SharedFunctions.draftDelete(Dataset, dataset.uuid);
      } catch (err) {
        if (!(err instanceof Util.NotFoundError)) {
          throw err;
        }
      }
      return [false, dataset.uuid];
    }
  }

  dataset_to_save.updated_at = new Date();

  // If a draft of this record already exists: overwrite it, using it's same uuid
  // If a draft of this record doesn't exist: create a new draft
  // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
  let response = await Dataset.updateOne(
    {"uuid": dataset.uuid, 'publish_date': {'$exists': false}}, 
    {$set: dataset_to_save}, 
    {'upsert': true, session}
  );
  if (response.modifiedCount != 1 && response.upsertedCount != 1) {
    throw `Dataset.validateAndCreateOrUpdate: Modified: ${response.modifiedCount}. Upserted: ${response.upsertedCount}`;
  } 

  // If successfull, return the uuid of the created / updated dataset
  return [true, dataset.uuid];

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
  } catch(error) {
    if(error instanceof Util.NotFoundError || error instanceof Util.InputError) {
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

  return await validateAndCreateOrUpdateRecurser(dataset, template, user, session, group_uuid);

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
  if (!(await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_ADMIN))) {
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

  // Also require the related_datasets fields to be the same length as the related_templates required by the template
  if (dataset_draft.related_datasets.length != template.related_templates.length) {
    throw new Error(
      `The draft to be published ${dataset_draft.uuid} does not match the template specification ${template.uuid}.
      The draft expects ${dataset_draft.related_datasets.length} related_datasets, but the template expects ${template.related_templates.length} related_datasets.
      Error in dataset update implementation.`
    );
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
  for(let i = 0; i < dataset_draft.related_datasets.length; i++) {
    let related_dataset = dataset_draft.related_datasets[i];
    let related_template = template.related_templates[i];
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
async function latestPublishedBeforeDateWithJoins(uuid, date) {
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

  let pipeline_addon = {
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
      'as': "related_datasets"
    }
  }

  for(let i = 0; i < 5; i++) {
    // go one level deeper into related_templates
    current_pipeline.push(pipeline_addon);
    current_pipeline = pipeline_addon['$lookup']['pipeline'];
    // create a copy
    pipeline_addon = JSON.parse(JSON.stringify(pipeline_addon));
  }
  let response = await Dataset.aggregate(pipeline);
  if (await response.hasNext()){
    return await response.next();
  } else {
    throw new Util.NotFoundError(`No dataset exists with uuid ${uuid} which was published before the provided date.`);
  }
}

async function filterPublishedForPermissionsRecursor(dataset, user) {
  for(let i = 0; i < dataset.related_datasets.length; i++) {
    if(!(await SharedFunctions.userHasAccessToPublishedResource(dataset.related_datasets[i], user, PermissionGroupModel))) {
      dataset.related_datasets[i] = {uuid: dataset.related_datasets[i].uuid};
    } else {
      await filterPublishedForPermissionsRecursor(dataset.related_datasets[i], user);
    }
  }
}

async function filterPublishedForPermissions(dataset, user) {
  if(!(await SharedFunctions.userHasAccessToPublishedResource(dataset, user, PermissionGroupModel))) {
    throw new Util.PermissionDeniedError(`Do not have view access to dataset ${dataset.uuid}`);
  }
  await filterPublishedForPermissionsRecursor(dataset, user);
}

async function latestPublishedBeforeDateWithJoinsAndPermissions(uuid, date, user) {
  let dataset = await latestPublishedBeforeDateWithJoins(uuid, date);
  await filterPublishedForPermissions(dataset, user);
  return dataset;
} 

// Fetches the last published dataset with the given uuid. 
// Also recursively looks up related_datasets.
async function latestPublishedWithJoinsAndPermissions(uuid, user) {
  return await latestPublishedBeforeDateWithJoinsAndPermissions(uuid, new Date(), user);
}

async function duplicateRecursor(original_dataset, original_group_uuid, new_group_uuid, user, session) {
  // verify that this user is in the 'view' permission group
  if (!(await SharedFunctions.userHasAccessToPublishedResource(original_dataset, user, PermissionGroupModel))) {
    throw new Util.PermissionDeniedError(`Do not have view permissions required to duplicate dataset: ${original_dataset.uuid}`);
  }

  if(original_dataset.group_uuid != original_group_uuid) {
    return original_dataset.uuid;
  }

  let new_dataset = {
    uuid: uuidv4(),
    updated_at: new Date(),
    template_uuid: original_dataset.template_uuid,
    group_uuid: new_group_uuid,
    related_datasets: []
  }
  for(dataset of original_dataset.related_datasets) {
    try {
      new_dataset.related_datasets.push(await duplicateRecursor(dataset, original_group_uuid, new_group_uuid, user, session));
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
  let new_uuid = await duplicateRecursor(original_dataset, original_group_uuid, uuidv4(), user, session);
  return await draftFetchOrCreate(new_uuid, user, session);
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
exports.draftGet = async function(uuid, user) {
  const session = MongoDB.newSession();
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