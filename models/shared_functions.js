const { validate: uuidValidate } = require('uuid');
const Util = require('../lib/util');

// Fetches the draft with the given uuid. 
// Does not look up fields or related_templates
exports.draft = async (collection, uuid, session) => {
  let cursor = await collection.find(
    {"uuid": uuid, 'publish_date': {'$exists': false}}, 
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

// Fetches the latest published document with the given uuid. 
// Does not look up related documents
exports.latestPublished = async (collection, uuid, session) => {
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
  let cursor = await collection.find(
    {"_id": _id}, 
    {session}
  );
  if (!(await cursor.hasNext())) {
    return null;
  }
  let document = await cursor.next();
  return document.uuid;
}

exports.draftDelete = async (collection, uuid) => {
  let response = await collection.deleteMany({ uuid, publish_date: {'$exists': false} });
  if (response.deletedCount > 1) {
    console.error(`draftDelete: Document with uuid '${uuid}' had more than one draft to delete.`);
  }
}

exports.userHasAccessToPublishedResource = async (resource, user, PermissionGroupModel) => {
  // If public, then automatic yes
  if (resource.public_date && Util.compareTimeStamp((new Date).getTime(), resource.public_date)){
    return true;
  }

  // Otherwise, check, if we have view permissions
  return await PermissionGroupModel.has_permission(user, resource.uuid, PermissionGroupModel.PERMISSION_VIEW);
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