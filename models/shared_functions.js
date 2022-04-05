const MongoDB = require('../lib/mongoDB');
const Util = require('../lib/util');
const ObjectId = require('mongodb').ObjectId;

// Fetches the draft with the given uuid. 
// Does not look up fields or related documents
const draft = async (collection, uuid, session) => {
  let cursor = await collection.find(
    {uuid, 'persist_date': {'$exists': false}}, 
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
    if(!ObjectId.isValid(_id)) {
      throw new Util.InputError(`Invalid _id provided: ${_id}`);
    }
    return new ObjectId(_id);
  } else {
    return _id
  }
}
exports.convertToMongoId = convertToMongoId;

// Fetches the latest persisted document with the given uuid. 
// Does not look up related documents
const latestPersisted = async (collection, uuid, session) => {
  let cursor = await collection.find(
    {"uuid": uuid, 'persist_date': {'$exists': true}}, 
    {session}
  ).sort({'persist_date': -1})
  .limit(1);
  if (!(await cursor.hasNext())) {
    return null;
  }
  return await cursor.next();
}
exports.latestPersisted = latestPersisted;

exports.latestDocument = async (collection, uuid, session) => {
  let result = await draft(collection, uuid, session);
  if(result) {
    return result;
  }
  result = await latestPersisted(collection, uuid, session);
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

exports.latest_persisted_id_for_uuid = async (collection, uuid) => {
  let document = await latestPersisted(collection, uuid);
  return document ? document._id : null;
}

exports.draftDelete = async (collection, uuid) => {
  let response = await collection.deleteMany({ uuid, persist_date: {'$exists': false} });
  if (response.deletedCount > 1) {
    console.error(`draftDelete: Document with uuid '${uuid}' had more than one draft to delete.`);
  }
}

exports.userHasAccessToPersistedResource = async (collection, uuid, user, PermissionGroupModel, session) => {
  let latest_persisted = await latestPersisted(collection, uuid, session);
  if(!latest_persisted) {
    return false;
  }

  // If public, then automatic yes
  if (latest_persisted.public_date && Util.compareTimeStamp((new Date).getTime(), latest_persisted.public_date)){
    return true;
  }

  // Otherwise, check, if we have view permissions
  return await PermissionGroupModel.has_permission(user, uuid, PermissionGroupModel.PERMISSION_VIEW, session);
}

exports.persistDateFor_id = async (collection, _id, session) => {
  let cursor = await collection.find(
    {"_id": _id}, 
    {session}
  );
  if (!(await cursor.hasNext())) {
    return null;
  }
  let document = await cursor.next();
  return document.persist_date;
}

exports.latest_persisted_time_for_uuid = async (collection, uuid) => {
  let document = await latestPersisted(collection, uuid);
  return document ? document.persist_date : null;
}

exports.executeWithTransaction = async (callback, ...args) => {
  const session = MongoDB.newSession();
  let result;
  try {
    await session.withTransaction(async () => {
      try {
        result = await callback(session, ...args);
      } catch(err) {
        await session.abortTransaction();
        throw err;
      }
    });
    session.endSession();
    return result;
  } catch(err) {
    session.endSession();
    throw err;
  }
}