const { validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');
const ObjectId = require('mongodb').ObjectId;

// Fetches the draft with the given uuid. 
// Does not look up fields or related_templates
const draft = async (collection, uuid, session) => {
  let cursor = await collection.find(
    {uuid, 'publish_date': {'$exists': false}}, 
    {session}
  );

  if(!(await cursor.hasNext())) {
    return null;
  } 
  let draft = await cursor.next();
  if (await cursor.hasNext()) {
    throw `Multiple drafts found for uuid ${uuid}`;
  }
  return draft;
}
exports.draft = draft;

function convertToMongoId(_id) {
  if(typeof(_id) === 'string') {
    return new ObjectId(_id);
  } else {
    return _id
  }
}
exports.convertToMongoId = convertToMongoId;

// Fetches the latest published document with the given uuid. 
// Does not look up related documents
const latestPublished = async (collection, uuid, session) => {
  let cursor = await collection.find(
    {"uuid": uuid, 'publish_date': {'$exists': true}}, 
    {session}
  ).sort({'publish_date': -1})
  .limit(1);
  if (!(await cursor.hasNext())) {
    return null;
  }
  return await cursor.next();
}
exports.latestPublished = latestPublished;

exports.latestDocument = async (collection, uuid, session) => {
  let result = await draft(collection, uuid, session);
  if(result) {
    return result;
  }
  result = await latestPublished(collection, uuid, session);
  return result;
}

// Returns true if the document exists
exports.exists = async (collection, uuid, session) => {
  let cursor = await collection.find(
    {"uuid": uuid},
    {session}
  );
  return (await cursor.hasNext());
}

// Finds the uuid of the document with the given _id
exports.uuidFor_id = async (collection, _id, session) => {
  _id = convertToMongoId(_id);
  let cursor = await collection.find(
    {_id}, 
    {session}
  );
  if (!(await cursor.hasNext())) {
    return null;
  }
  let document = await cursor.next();
  return document.uuid;
}

exports.latest_published_id_for_uuid = async (collection, uuid) => {
  let document = await latestPublished(collection, uuid);
  return document ? document._id : null;
}

exports.draftDelete = async (collection, uuid) => {
  let response = await collection.deleteMany({ uuid, publish_date: {'$exists': false} });
  if (response.deletedCount > 1) {
    console.error(`draftDelete: Document with uuid '${uuid}' had more than one draft to delete.`);
  }
}

exports.userHasAccessToPublishedResource = async (collection, uuid, user, PermissionGroupModel, session) => {
  let latest_published = await latestPublished(collection, uuid, session);

  // If public, then automatic yes
  if (latest_published.public_date && Util.compareTimeStamp((new Date).getTime(), latest_published.public_date)){
    return true;
  }

  // Otherwise, check, if we have view permissions
  return await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_VIEW, session);
}

exports.publishDateFor_id = async (collection, _id, session) => {
  let cursor = await collection.find(
    {"_id": _id}, 
    {session}
  );
  if (!(await cursor.hasNext())) {
    return null;
  }
  let document = await cursor.next();
  return document.publish_date;
}

exports.latest_published_time_for_uuid = async (collection, uuid) => {
  let document = await latestPublished(collection, uuid);
  return document ? document.publish_date : null;
}