const MongoDB = require('../lib/mongoDB');
const Util = require('../lib/util');
const PermissionGroupModel = require('./permission_group');
const UserPermissionsModel = require('./user_permissions');
const DatasetModel = require('./dataset');
const SharedFunctions = require('./shared_functions');


var DatasetPublishedVersions;

// Returns a reference to the datasetPublished Mongo Collection
async function collection() {
  if (DatasetPublishedVersions === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('dataset_published_versions');
    } catch(e) {}
    DatasetPublishedVersions = db.collection('dataset_published_versions');
  }
  return DatasetPublishedVersions;
}

exports.init = async function() {
  DatasetPublishedVersions = await collection();
}

async function publishedTimeForDatasetUUIDAndName(dataset_uuid, name) {
  let cursor = await DatasetPublishedVersions.find(
    {dataset_uuid, name}
  );

  if(!(await cursor.hasNext())) {
    return null;
  } 

  let document = await cursor.next();
  return document.time;
}
exports.publishedTimeForDatasetUUIDAndName = publishedTimeForDatasetUUIDAndName;

exports.publish = async function(dataset_uuid, name, user) {

  // make sure a persisted version of this dataset exists
  if(!(await SharedFunctions.latestPersisted(DatasetModel.collection(), dataset_uuid))) {
    throw new Util.NotFoundError(`No persisted dataset with uuid ${dataset_uuid} exists to be published.`);
  }

  // make sure user has admin permissions on this dataset
  if (!(await UserPermissionsModel.has_permission(user, dataset_uuid, PermissionGroupModel.PermissionTypes.admin))) {
    throw new Util.PermissionDeniedError(`Do not have admin permissions required for dataset uuid: ${dataset_uuid}`);
  }

  // first make sure there isn't already one with this dataset_uuid and name
  if(await publishedTimeForDatasetUUIDAndName(dataset_uuid, name)) {
    throw new Util.InputError(`A published version for dataset ${dataset_uuid} with name ${name} already exists.`);
  }

  let response = await DatasetPublishedVersions.insertOne({dataset_uuid, name, time: new Date()});
  if(!response.acknowledged) {
    throw new Error(`datasetPublish.publish: Inserting failed.`);
  }

}