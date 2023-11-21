const MongoDB = require('../lib/mongoDB');
const Util = require('../lib/util');
const PermissionModel = require('./permission');
const DatasetModel = require('./dataset');
const SharedFunctions = require('./shared_functions');

// Mongodb schema for datasetPublish
const Schema = Object.freeze({
  bsonType: "object",
  required: [ "_id", "dataset_uuid", "name", "time" ],
  properties: {
    _id: {
      bsonType: "objectId"
    },
    dataset_uuid: {
      bsonType: "string",
      description: "the dataset which is published"
      // uuid should be in a valid uuid format as well
    },
    name: {
      bsonType: "string",
      description: "the name of this published version of the dataset"
    },
    time: {
      bsonType: "date",
      description: "the timestamp marking when the dataset is published"
    }
  },
  additionalProperties: false
});

var DatasetPublishedVersions;

// Returns a reference to the datasetPublished Mongo Collection
async function collection() {
  if (DatasetPublishedVersions === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('dataset_published_versions', {validator: { $jsonSchema: Schema} });
    } catch(e) {
      db.command({collMod:'dataset_published_versions', validator: { $jsonSchema: Schema }});
    }
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

exports.publish = async function(dataset_uuid, name, user_id) {

  // make sure a persisted version of this dataset exists
  if(!(await SharedFunctions.latestPersisted(DatasetModel.collection(), dataset_uuid))) {
    throw new Util.NotFoundError(`No persisted dataset with uuid ${dataset_uuid} exists to be published.`);
  }

  // make sure user has admin permissions on this dataset
  if (!(await new PermissionModel.model({user_id}).hasExplicitPermission(dataset_uuid, PermissionModel.PermissionTypes.admin))) {
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