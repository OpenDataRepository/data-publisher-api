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

// If a user has permission to this category or a superior one, return true
async function has_permission(user, uuid, category) {
  let categories = [category];
  if(category == PERMISSION_EDIT) {
    categories.push(PERMISSION_ADMIN);
  }
  if(category == PERMISSION_VIEW) {
    categories.push(PERMISSION_EDIT);
    categories.push(PERMISSION_ADMIN);
  }
  let cursor = await PermissionGroup.find(
    {uuid, category: { "$in" : categories }, users: user}
  );
  return (await cursor.hasNext());
}

async function create_permission(uuid, category, users, session) {
  // uuid must be valid
  if (!uuidValidate(uuid)) {
    throw new Util.NotFoundError();
  }

  let response = await PermissionGroup.insertOne(
    {
      uuid,
      category,
      users: users 
    },
    { session }
  );
  if (response.insertedCount != 1) {
    throw `PermissionGroup.create_permission: Failed to insert uuid ${uuid}`;
  } 
}

exports.initialize_permissions_for = async function(current_user, uuid, session) {
  // TODO: after the user model is implemented, verify that current_user is a real user in the database
  await create_permission(uuid, PERMISSION_ADMIN, [current_user], session);
  await create_permission(uuid, PERMISSION_EDIT, [], session);
  await create_permission(uuid, PERMISSION_VIEW, [], session);
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

  // TODO: after the user model is implemented, verify that each user_name exists
  // Also verify that current_user is one of the user_names included

  // If this is the admin category, cannot remove the current user
  if(category == PERMISSION_ADMIN) {
    let current_user_found = false;
    for(user_name of users) {
      if(user_name == current_user) {
        current_user_found = true;
      }
    }
    if(!current_user_found) {
      throw new Util.InputError(`Can not alter permissions without including the current user in the permissions list`);
    }
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