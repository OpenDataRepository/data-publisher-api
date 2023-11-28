const MongoDB = require('../lib/mongoDB');
import * as Util from '../lib/util';
import {ObjectId} from 'mongodb';

export enum DocumentTypes {
  dataset = "dataset",
  template = "template",
  template_field = "template_field"
};

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

export const executeWithTransaction = async (state, callback) => {
  if(state.session) {
    return callback();
  }
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
    delete state.session;
    return result;
  } catch(err) {
    session.endSession();
    delete state.session;
    throw err;
  }
}

export const uuidsInThisCollection = async (collection, uuids: string[]): Promise<string[]>  => {
  return await collection.distinct(
    "uuid",
    {"uuid": {$in: uuids}}
  );
}

export const latestShallowDocumentsForUuids = async(collection, uuids: string[]) => {
  let unfiltered_docs = await collection.find({"uuid": {"$in": uuids}})
    .sort({'updated_at': -1})
    .toArray();
  let docs: Record<string, any>[] = [];
  // after getting results, use a set to only keep the latest version of each uuid
  let seen_uuids = new Set();
  for(let doc of unfiltered_docs) {
    if(!seen_uuids.has(doc.uuid)) {
      seen_uuids.add(doc.uuid);
      docs.push(doc);
    }
  }
  return docs;
}

export const latestPublicDocuments = async(collection) => {
  let all_public_uuids = await allPublicPersistedUuids(collection);
  let unfiltered_docs = await collection.find({"uuid": {"$in": all_public_uuids}})
    .sort({'persist_date': -1})
    .toArray();
  let docs: Record<string, any>[] = [];
  // after getting results, use a set to only keep the latest version of each uuid
  // also only keep it if the latest version is public
  let seen_uuids = new Set();
  for(let doc of unfiltered_docs) {
    if(!seen_uuids.has(doc.uuid)) {
      if(doc.public_date && Util.isTimeAAfterB(new Date(), doc.public_date)) {
        docs.push(doc);
      }
      seen_uuids.add(doc.uuid);
    }
  }
  return docs;
}

export const allPublicPersistedUuids = async (collection): Promise<string[]> => {
  return await collection.distinct(
    "uuid",
    {public_date: {$exists: true, $lte: new Date()}, persist_date: {$exists: true}}
  );
}