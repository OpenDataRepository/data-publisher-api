const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4} = require('uuid');

var LegacyUuidToNewUuidMapper;

async function collection() {
  if (LegacyUuidToNewUuidMapper === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('legacy_uuid_to_new_uuid_mapper');
    } catch(e) {}
    LegacyUuidToNewUuidMapper = db.collection('legacy_uuid_to_new_uuid_mapper');
  }
  return LegacyUuidToNewUuidMapper;
}

exports.init = async function() {
  LegacyUuidToNewUuidMapper = await collection();
}

async function getDocumentWithOldUuid(uuid, session) {
  let cursor = await LegacyUuidToNewUuidMapper.find(
    {old_uuid: uuid}, 
    {session}
  );
  if (!(await cursor.hasNext())) {
    return null;
  }
  return await cursor.next();
}

exports.get_new_uuid_from_old = async (uuid, session) => {
  let document = await getDocumentWithOldUuid(uuid, session);
  if(!document) {
    return null;
  }
  return document.new_uuid;
}

exports.get_secondary_uuid_from_old = async (uuid, session) => {
  let document = await getDocumentWithOldUuid(uuid, session);
  if(!document) {
    return null;
  }
  return document.secondary_uuid;
}

exports.create_new_uuid_for_old = async (old_uuid, session) => {
  let new_uuid = uuidv4();
  let response = await LegacyUuidToNewUuidMapper.insertOne(
    {old_uuid, new_uuid},
    {session}
  )
  if (response.insertedCount != 1) {
    throw new Error(`LegacyUuidToNewUuidMapper.createNewUuidForOld: should be 1 inserted document. Instead: ${response.insertedCount}`);
  }
  return new_uuid;
}

exports.create_secondary_uuid_for_old = async (old_uuid, session) => {
  let secondary_uuid = uuidv4();
  let response = await LegacyUuidToNewUuidMapper.updateOne(
    {old_uuid},
    {$set: {secondary_uuid}},
    {session}
  )
  if (response.modifiedCount != 1) {
    throw new Error(`LegacyUuidToNewUuidMapper.createSecondaryUuidForOld: should be 1 modified document. Instead: ${response.modifiedCount}`);
  }
  return secondary_uuid;
}