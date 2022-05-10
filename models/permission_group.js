const MongoDB = require('../lib/mongoDB');
const Util = require('../lib/util');

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

// TODO: once users are created, consider each user/recource combination as it's own document. Then I don't have to 
// maintain crossover lists

// If a user has permission to this category or a superior one, return true
async function has_permission(user, uuid, category, session) {
  let categories = [category];
  if(category == PERMISSION_EDIT) {
    categories.push(PERMISSION_ADMIN);
  }
  if(category == PERMISSION_VIEW) {
    categories.push(PERMISSION_EDIT);
    categories.push(PERMISSION_ADMIN);
  }
  let cursor = await PermissionGroup.find(
    {uuid, category: { "$in" : categories }, users: user},
    {session}
  );
  return (await cursor.hasNext());
}

async function create_permission(uuid, category, users, session) {
  let response = await PermissionGroup.insertOne(
    {
      uuid,
      category,
      users: users 
    },
    { session }
  );
  if (!response.acknowledged) {
    throw `PermissionGroup.create_permission: Failed to insert uuid ${uuid}`;
  } 
}

async function read_permissions(uuid, category, session) {
  let cursor = await PermissionGroup.find(
    {uuid, category},
    {session}
  );
  if (!(await cursor.hasNext())) {
    throw new Util.NotFoundError();
  } 
  let first_result = await cursor.next();
  return first_result.users;
}

async function replace_permissions(current_user_id, uuid, category, user_ids, session) {
  // TODO: when users are implemented, validate that each user in the list is a real user

  // The current user must be in the admin permissions group for this uuid to change it's permissions
  if (!(await has_permission(current_user_id, uuid, PERMISSION_ADMIN, session))) {
    throw new Util.PermissionDeniedError(`You do not have the permission level (admin) required to modify these permissions`);
  }

  // TODO: after the user model is implemented, verify that each user_name exists
  // Also verify that current_user is one of the user_names included

  // If this is the admin category, cannot remove the current user
  if(category == PERMISSION_ADMIN) {
    let current_user_found = false;
    for(let user_id of user_ids) {
      if(user_id.equals(current_user_id)) {
        current_user_found = true;
      }
    }
    if(!current_user_found) {
      throw new Util.InputError(`Can not alter permissions without including the current user in the permissions list`);
    }
  }

  let response = await PermissionGroup.updateOne(
    {uuid, category},
    {$set: {users: user_ids}}, 
    {session}
  );
  if (!response.acknowledged) {
    throw new Error(`PermissionGroup.replace_permission: Failed to update ${uuid}.`);
  } 
}

exports.initialize_permissions_for = async function(current_user, uuid, session) {
  // TODO: after the user model is implemented, verify that current_user is a real user in the database
  await create_permission(uuid, PERMISSION_ADMIN, [current_user], session);
  await create_permission(uuid, PERMISSION_EDIT, [], session);
  await create_permission(uuid, PERMISSION_VIEW, [], session);
}

exports.replace_permissions = replace_permissions;

exports.read_permissions = read_permissions;

exports.add_permissions = async function(curr_user_id, uuid, category, user_ids, session) {
  // Combine current users at this permission level with the new users at this permission level
  let current_user_ids = await read_permissions(uuid, category, session);
  let combined_user_ids = Util.objectIdsSetUnion(current_user_ids, user_ids);
  await replace_permissions(curr_user_id, uuid, category, combined_user_ids, session);
}

exports.has_permission = has_permission;

exports.PERMISSION_ADMIN = PERMISSION_ADMIN;
exports.PERMISSION_EDIT = PERMISSION_EDIT;
exports.PERMISSION_VIEW = PERMISSION_VIEW;
exports.collection = collection;