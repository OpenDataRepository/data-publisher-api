const MongoDB = require('../lib/mongoDB');
const PermissionGroupModel = require('./permission_group');
const SharedFunctions = require('./shared_functions');
const Util = require('../lib/util');

var UserPermissions;

async function collection() {
  if (UserPermissions === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('user_permissions');
    } catch(e) {}
    UserPermissions = db.collection('user_permissions');
  }
  return UserPermissions;
}
exports.collection = function() {
  return UserPermissions;
}

exports.init = async function() {
  UserPermissions = await collection();
}

exports.create = async function(user_id, session) {
  let response = await UserPermissions.insertOne(
    {
      user_id, 
      dataset: {
        admin: [],
        edit: [],
        view: []
      },
      template: {
        admin: [],
        edit: [],
        view: []
      },
      template_field: {
        admin: [],
        edit: [],
        view: []
      }
    },
    {session}
  );
  if (!response.acknowledged) {
    throw new Error(`UserPermissions.create: Failed to insert user with user_id: ${user_id}`);
  }
}


async function get(user_id) {
  return await UserPermissions.findOne({user_id});
}
exports.get = get;

async function has_permission(user_id, uuid, category, session) {
  let user_permission = await get(user_id);
  if(user_permission.admin || user_permission.super) {
    return true;
  }
  return await PermissionGroupModel.has_permission(user_id, uuid, category, session);
}
exports.has_permission = has_permission;

exports.hasAccessToPersistedResource = async (collection, uuid, user, session) => {
  let latest_persisted = await SharedFunctions.latestPersisted(collection, uuid, session);
  if(!latest_persisted) {
    return false;
  }

  // If public, then automatic yes
  if (latest_persisted.public_date && Util.compareTimeStamp((new Date).getTime(), latest_persisted.public_date)){
    return true;
  }

  return await has_permission(user, uuid, PermissionGroupModel.PermissionTypes.view, session);
}

async function getCurrentUuids(user_id, document_type, permission_type) {
  let current_permissions = await UserPermissions.findOne({user_id});
  if(!current_permissions) {
    throw new Error(`No permissions exist with user_id ${user_id}`);
  }
  if(!current_permissions[document_type]) {
    throw new Error(`Permissions doesn't have document type ${document_type}`);
  }
  if(!current_permissions[document_type][permission_type]) {
    throw new Error(`Permissions doesn't have permission type ${permission_type}`);
  }
  let uuids = current_permissions[document_type][permission_type];
  return uuids;
}

async function addPermission(user_id, document_type, permission_type, document_uuid, session) {
  let uuids = await getCurrentUuids(user_id, document_type, permission_type);
  if(uuids.includes(document_uuid)) {
    return;
  }
  let property_path = `${document_type}.${permission_type}`;
  let response = await UserPermissions.updateOne(
    {user_id},
    {$addToSet: {[property_path]: document_uuid}},
    {session}
  );
  if (response.modifiedCount != 1) {
    throw `UserPermissions.addPermission: should be 1 modified document. Instead: ${response.modifiedCount}`;
  }
}

async function removePermission(user_id, document_type, permission_type, document_uuid, session) {
  let uuids = await getCurrentUuids(user_id, document_type, permission_type);
  if(!uuids.includes(document_uuid)) {
    return;
  }
  let property_path = `${document_type}.${permission_type}`;
  let response = await UserPermissions.updateOne(
    {user_id},
    {$pull: {[property_path]: document_uuid}},
    {session}
  );
  if (response.modifiedCount != 1) {
    throw `UserPermissions.removePermission: should be 1 modified document. Instead: ${response.modifiedCount}`;
  }
}

exports.addUserIdsToUuidAndCategory = async function(document_uuid, document_type, permission_type, user_ids, session) {
  for(let user_id of user_ids) {
    await addPermission(user_id, document_type, permission_type, document_uuid, session);
  }
}

exports.removeUserIdsFromUuidAndCategory = async function(document_uuid, document_type, permission_type, user_ids, session) {
  for(let user_id of user_ids) {
    await removePermission(user_id, document_type, permission_type, document_uuid, session);
  }
}

exports.initialize_permissions_for = async function(user_id, document_uuid, document_type, session) {
  await addPermission(user_id, document_type, PermissionGroupModel.PermissionTypes.admin, document_uuid, session);
  await PermissionGroupModel.initialize_permissions_for(user_id, document_uuid, session);
}

exports.setAdmin = async function(user_id) {
  let response = await UserPermissions.updateOne(
    {user_id},
    {$set: {admin: true}}
  );
  if (response.modifiedCount != 1) {
    throw `UserPermissions.setAdmin: should be 1 modified document. Instead: ${response.modifiedCount}`;
  }
}

exports.setSuper = async function(user_id) {
  let response = await UserPermissions.updateOne(
    {user_id},
    {$set: {super: true}}
  );
  if (response.modifiedCount != 1) {
    throw `UserPermissions.setSuper: should be 1 modified document. Instead: ${response.modifiedCount}`;
  }
}

exports.isSuper = async function(user_id) {
  let permissions = await get(user_id);
  if(!permissions) {
    return false;
  }
  return permissions.super;
}