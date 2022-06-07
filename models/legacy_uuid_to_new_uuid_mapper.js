const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4} = require('uuid');

var LegacyUuidToNewUuidMapper;

const Schema = Object.freeze({
  bsonType: "object",
  required: [ "_id", "old_uuid", "new_uuid" ],
  properties: {
    _id: {
      bsonType: "objectId"
    },
    old_uuid: {
      bsonType: "string",
      description: "the uuid of the old system"
    },
    new_uuid: {
      bsonType: "string",
      description: "the uuid in the new system"
      // uuid should be in a valid uuid format as well
    },
    secondary_uuid: {
      bsonType: "string",
      description: "if a uuid in the old system correlates to multiple uuids in the new system, then the second new uuid is here"
      // uuid should be in a valid uuid format as well
    }
  },
  additionalProperties: false
});

async function collection() {
  if (LegacyUuidToNewUuidMapper === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('legacy_uuid_to_new_uuid_mapper', {validator: { $jsonSchema: Schema} });
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

exports.get_old_uuid_from_new = async (uuid, session) => {
  let cursor = await LegacyUuidToNewUuidMapper.find(
    {new_uuid: uuid}, 
    {session}
  );
  if (await cursor.hasNext()) {
    return (await cursor.next()).old_uuid;
  }
  
  cursor = await LegacyUuidToNewUuidMapper.find(
    {secondary_uuid: uuid}, 
    {session}
  );
  if (await cursor.hasNext()) {
    return (await cursor.next()).old_uuid;
  }
  return null;
}

const create_document_with_old_and_new = async (old_uuid, new_uuid, session) => {
  let response = await LegacyUuidToNewUuidMapper.insertOne(
    {old_uuid, new_uuid},
    {session}
  )
  if (!response.acknowledged) {
    throw new Error(`LegacyUuidToNewUuidMapper.createNewUuidForOld: Insert failed`);
  }
};
exports.create_document_with_old_and_new = create_document_with_old_and_new;

exports.create_new_uuid_for_old = async (old_uuid, session) => {
  let new_uuid = uuidv4();
  await create_document_with_old_and_new(old_uuid, new_uuid, session);
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