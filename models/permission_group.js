const MongoDB = require('../lib/mongoDB');
const Util = require('../lib/util');

const PermissionTypes = {
  admin: 'admin',
  edit: 'edit',
  view: 'view'
};
exports.PermissionTypes = PermissionTypes;


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
async function has_permission(user, uuid, category, session) {
  let categories = [category];
  if(category == PermissionTypes.edit) {
    categories.push(PermissionTypes.admin);
  }
  if(category == PermissionTypes.view) {
    categories.push(PermissionTypes.edit);
    categories.push(PermissionTypes.admin);
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
  // The current user must be in the admin permissions group for this uuid to change it's permissions
  if (!(await has_permission(current_user_id, uuid, PermissionTypes.admin, session))) {
    throw new Util.PermissionDeniedError(`You do not have the permission level (admin) required to modify these permissions`);
  }

  // If this is the admin category, cannot remove the current user
  if(category == PermissionTypes.admin) {
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

// TODO: consider modifying the design such that there is a single model with all of the permissions
exports.initialize_permissions_for = async function(current_user, uuid, session) {
  await create_permission(uuid, PermissionTypes.admin, [current_user], session);
  await create_permission(uuid, PermissionTypes.edit, [], session);
  await create_permission(uuid, PermissionTypes.view, [], session);
}

exports.replace_permissions = replace_permissions;

exports.read_permissions = read_permissions;

exports.add_permissions = async function(curr_user_id, uuid, category, user_ids, session) {
  // Combine current users at this permission level with the new users at this permission level
  let current_user_ids = await read_permissions(uuid, category, session);
  let combined_user_ids = Util.objectIdsSetUnion(current_user_ids, user_ids);
  await replace_permissions(curr_user_id, uuid, category, combined_user_ids, session);
}

exports.delete_permissions = async function(uuid, session) {
  let response = await PermissionGroup.deleteMany(
    { uuid },
    { session }
  );
  if (response.deletedCount != 3) {
    console.error(`permission_group.delete_permissions: Expected three permission groups to be deleted upon deleting uuid.`);
  }
}

exports.has_permission = has_permission;

exports.collection = collection;