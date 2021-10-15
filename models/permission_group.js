const MongoDB = require('../lib/mongoDB');
const Util = require('../lib/util');
const { validate: uuidValidate } = require('uuid');

const PERMISSION_ADMIN = 'admin';
const PERMISSION_EDIT = 'edit';
const PERMISSION_VIEW = 'view';

var PermissionGroup;

// Returns a reference to the permission_groups Mongo Collection
async function collection() {
  if (PermissionGroup === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('permission_groups');
    } catch(e) {}
    PermissionGroup = db.collection('permission_groups');
  }
  return PermissionGroup;
}

exports.init = async function() {
  PermissionGroup = await collection();
}

async function has_permission(user, uuid, category) {
  let cursor = await PermissionGroup.find(
    {uuid, category, users: user}
  );
  return (await cursor.hasNext());
}

async function create_permission(uuid, category, user_name, session) {
  // uuid must be valid
  if (!uuidValidate(uuid)) {
    throw new Util.NotFoundError();
  }

  let response = await PermissionGroup.insertOne(
    {
      uuid,
      category,
      users: [user_name]
    },
    { session }
  );
  if (response.insertedCount != 1) {
    throw `PermissionGroup.create_permission: Failed to insert uuid ${uuid}`;
  } 
}

exports.initialize_permissions_for = async function(current_user, uuid, session) {
  // TODO: after the user model is implemented, verify that current_user is a real user in the database
  await create_permission(uuid, PERMISSION_ADMIN, current_user, session);
  await create_permission(uuid, PERMISSION_EDIT, current_user, session);
  await create_permission(uuid, PERMISSION_VIEW, current_user, session);
}

exports.replace_permissions = async function(current_user, uuid, category, users) {
  // uuid must be valid
  if (!uuidValidate(uuid)) {
    throw new Util.NotFoundError();
  }

  // TODO: when users are implemented, validate that each user in the list is a real user

  // The current user must be in the admin permissions group for this uuid to change it's permissions
  if (!(await has_permission(current_user, uuid, PERMISSION_ADMIN))) {
    throw new Util.PermissionDeniedError(`You do not have the permission level (admin) required to modify these permissions`);
  }

  let current_user_found = false;
    // TODO: after the user model is implemented, verify that each user_name exists
    // Also verify that current_user is one of the user_names included
  for(user_name of users) {
    if(user_name == current_user) {
      current_user_found = true;
    }
  }
  if(!current_user_found) {
    throw new Util.InputError(`Can not alter permissions without including the current user in the permissions list`);
  }

  let response = await PermissionGroup.updateOne(
    {uuid, category},
    {$set: {users}}
  );
  if (response.modifiedCount != 1) {
    throw new Error(`PermissionGroup.create_permission: Failed to insert ${uuid}. Number of insertions = ${response.modifiedCount}`);
  } 
}

exports.read_permissions = async function(uuid, category) {
  // uuid must be valid
  if (!uuidValidate(uuid)) {
    throw new Util.NotFoundError();
  }

  let cursor = await PermissionGroup.find({
    uuid,
    category
  });
  if (!(await cursor.hasNext())) {
    throw new Util.NotFoundError();
  } 
  let first_result = await cursor.next();
  return first_result.users;
}

exports.has_permission = has_permission;
exports.PERMISSION_ADMIN = PERMISSION_ADMIN;
exports.PERMISSION_EDIT = PERMISSION_EDIT;
exports.PERMISSION_VIEW = PERMISSION_VIEW;