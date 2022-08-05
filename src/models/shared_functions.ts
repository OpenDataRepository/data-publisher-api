const MongoDB = require('../lib/mongoDB');
import * as Util from '../lib/util';
import {ObjectId} from 'mongodb';

export enum DocumentTypes {
  dataset = "dataset",
  template = "template",
  template_field = "template_field"
};

// Fetches the draft with the given uuid. 
// Does not look up fields or related documents
export const draft = async (collection, uuid: string, session?): Promise<Record<string, any> | null> => {
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

export function convertToMongoId(_id: string | ObjectId): ObjectId {
  if(typeof(_id) === 'string') {
    if(!ObjectId.isValid(_id)) {
      throw new Util.InputError(`Invalid _id provided: ${_id}`);
    }
    return new ObjectId(_id);
  } else {
    return _id
  }
}

// Fetches the latest persisted document with the given uuid. 
// Does not look up related documents

export const latestPersisted = async (collection, uuid: string, session?): Promise<Record<string, any> | null> => {
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

export const latestDocument = async (collection, uuid: string, session?): Promise<Record<string, any> | null> => {
  let result = await draft(collection, uuid, session);
  if(result) {
    return result;
  }
  result = await latestPersisted(collection, uuid, session);
  return result;
}

// Returns true if the document exists
export const exists = async (collection, uuid: string, session?): Promise<boolean>  => {
  let cursor = await collection.find(
    {"uuid": uuid},
    {session}
  );
  return (await cursor.hasNext());
}

// Finds the uuid of the document with the given _id
export const uuidFor_id = async (collection, _id: ObjectId, session?): Promise<string | null> => {
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

export const latest_persisted_id_for_uuid = async (collection, uuid: string, session?): Promise<ObjectId | null> => {
  let document = await latestPersisted(collection, uuid, session);
  return document ? document._id : null;
}

export const draftDelete = async (collection, uuid: string, session?): Promise<void> => {
  let response = await collection.deleteMany(
    { uuid, persist_date: {'$exists': false} },
    { session }
  );
  if (response.deletedCount > 1) {
    console.error(`draftDelete: Document with uuid '${uuid}' had more than one draft to delete.`);
  }
}

export const persistDateFor_id = async (collection, _id: ObjectId, session?): Promise<Date | null> => {
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

export const latest_persisted_time_for_uuid = async (collection, uuid: string): Promise<Date | null> => {
  let document = await latestPersisted(collection, uuid);
  return document ? document.persist_date : null;
}

export const executeWithTransaction = async (state, callback) => {
  const session = MongoDB.newSession();
  state.session = session;
  let result;
  try {
    await session.withTransaction(async () => {
      try {
        result = await callback();
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

export const isPublic = async (collection, uuid: string, session?): Promise<boolean> => {
  let latest_persisted = await latestPersisted(collection, uuid, session);
  if(!latest_persisted) {
    return false;
  }
  return Util.isPublic(latest_persisted.public_date);
}

export const uuidsInThisCollection = async (collection, uuids: string[]): Promise<string[]>  => {
  return await collection.distinct(
    "uuid",
    {"uuid": {$in: uuids}}
  );
}
