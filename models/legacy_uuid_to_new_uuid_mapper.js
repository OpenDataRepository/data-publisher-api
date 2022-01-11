const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');

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

exports.get_new_uuid_from_old = async (uuid, session) => {
  let cursor = await LegacyUuidToNewUuidMapper.find(
    {old_uuid: uuid}, 
    {session}
  );
  if (!(await cursor.hasNext())) {
    return null;
  }
  let document = await cursor.next();
  return document.new_uuid;
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

// exports.get_corresponding_uuid = async (old_uuid, user, session) => {
//   let new_uuid = await getNewUuidFromOld(old_uuid, session);
//   if(!new_uuid) {
//     new_uuid = await createNewUuidForOld(old_uuid, session);
//     await PermissionGroupModel.initialize_permissions_for(user, new_uuid, session);
//   }
//   return new_uuid;
// }