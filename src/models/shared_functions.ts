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
  ).sort({'updated_at': -1});

  if(!(await cursor.hasNext())) {
    return null;
  } 
  let draft = await cursor.next();
  while (await cursor.hasNext()) {
    console.error(`Duplicate draft found and deleted for uuid ${uuid}.`);
    let second_draft = await cursor.next();
    await draftDeleteBy_id(collection, second_draft._id, session);
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

export const fetchBy_id = async (collection, _id: ObjectId): Promise<Record<string, any> | null> => {
  let cursor = await collection.find(
    {_id}
  );

  if(!(await cursor.hasNext())) {
    return null;
  } 
  let draft = await cursor.next();
  return draft;
}

// creates drafts for all documents for which decendants have drafts or new persisted versions
export const createAncestorDraftsForDecendantDrafts = async (collection, createDraftFromPersisted, uuid: string, id?: ObjectId): Promise<boolean> => {
  let draft_already_existing = false;
  let draft_: any = await draft(collection, uuid);
  let persisted_doc = await latestPersisted(collection, uuid);
  if (draft_) {
    draft_already_existing = true;
  } else {
    if(!persisted_doc) {
      return false;
    }
    draft_ = await createDraftFromPersisted(persisted_doc);
  }
  let child_draft_found = false;

  let related_docs = "";
  if(draft_.related_templates) {
    related_docs = "related_templates";
  } else if (draft_.related_datasets) {
    related_docs = "related_datasets";
  } else if (draft_.related_records) {
    related_docs = "related_records";
  } else {
    throw new Error('createAncestorDraftsForDecendantDrafts: not record, dataset or template');
  }
  if(persisted_doc) {
    for(let related_id of persisted_doc[related_docs]) {
      let related_uuid = await uuidFor_id(collection, related_id);
      child_draft_found ||= await createAncestorDraftsForDecendantDrafts(collection, createDraftFromPersisted, related_uuid as string, related_id);
    }
  } else {
    for(let related_uuid of draft_[related_docs]) {
      child_draft_found ||= await createAncestorDraftsForDecendantDrafts(collection, createDraftFromPersisted, related_uuid);
    }
  }
  let new_persisted_version = false;
  if(persisted_doc && persisted_doc._id.toString() != id?.toString()) {
    new_persisted_version = true;
  }
  if(!draft_already_existing && child_draft_found) {
    draft_.updated_at = new Date();
    // Create draft for this level
    let response = await collection.insertOne(draft_);
    if (!response.acknowledged || !response.insertedId) {
      throw new Error(`createAncestorDraftsForDecendantDrafts: acknowledged: ${response.acknowledged}. insertedId: ${response.insertedId}`);
    } 
  }
  return draft_already_existing || child_draft_found || new_persisted_version;
}

export const fetchLatestDraftOrPersisted = async(draftFetch, latestPersistedWithJoinsAndPermissions, uuid, create_from_persisted_if_no_draft?) => {
  let draft;
  if(create_from_persisted_if_no_draft) {
    draft = await draftFetch(uuid, create_from_persisted_if_no_draft);
  } else {
    draft = await draftFetch(uuid);
  }
  if(draft) {
    return draft;
  }
  return latestPersistedWithJoinsAndPermissions(uuid);
}

const draftDeleteBy_id = async (collection, _id: ObjectId, session?): Promise<void> => {
  await collection.deleteMany(
    { _id, persist_date: {'$exists': false} },
    { session }
  );
}