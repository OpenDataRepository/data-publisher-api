const MongoDB = require('../lib/mongoDB');
const Util = require('../lib/util');

const PermissionTypes = {
  admin: 'admin',
  edit: 'edit',
  view: 'view'
};
exports.PermissionTypes = PermissionTypes;

const Schema = Object.freeze({
  bsonType: "object",
  required: [ "_id", "uuid", "category", "users" ],
  properties: {
    _id: {
      bsonType: "objectId"
    },
    uuid: {
      bsonType: "string",
      description: "the uuid of the document whose permissions this mongodocument is specifying"
      // uuid should be in a valid uuid format as well
    },
    category: {
      enum: Object.values(PermissionTypes),
      description: "the permission level this mongodocument is specifying"
    },
    users: {
      bsonType: "array",
      description: "specifies the the users with this permission level to this document"
    }
  },
  additionalProperties: false
});

var PermissionGroup;

// Returns a reference to the permission_groups Mongo Collection
async function collection() {
  if (PermissionGroup === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('permission_groups', {validator: { $jsonSchema: Schema} });
    } catch(e) {}
    PermissionGroup = db.collection('permission_groups');
  }
  return PermissionGroup;
}
exports.collection = collection;

exports.init = async function() {
  PermissionGroup = await collection();
}

class Model {

  collection = PermissionGroup;

  constructor(state){
    this.state = state;
  }

  // If a user has permission to this category or a superior one, return true
  async has_permission(user, uuid, category) {
    let categories = [category];
    if(category == PermissionTypes.edit) {
      categories.push(PermissionTypes.admin);
    }
    if(category == PermissionTypes.view) {
      categories.push(PermissionTypes.edit);
      categories.push(PermissionTypes.admin);
    }
    let session = this.state.session;
    let cursor = await PermissionGroup.find(
      {uuid, category: { "$in" : categories }, users: user},
      {session}
    );
    return (await cursor.hasNext());
  }

  async #create_permission(uuid, category, users) {
    let session = this.state.session;
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

  async read_permissions(uuid, category) {
    let session = this.state.session;
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

  async replace_permissions(uuid, category, user_ids) {
    // The current user must be in the admin permissions group for this uuid to change it's permissions
    if (!(await this.has_permission(this.state.user_id, uuid, PermissionTypes.admin))) {
      throw new Util.PermissionDeniedError(`You do not have the permission level (admin) required to modify these permissions`);
    }

    // If this is the admin category, cannot remove the current user
    if(category == PermissionTypes.admin) {
      let current_user_found = false;
      for(let user_id of user_ids) {
        if(user_id.equals(this.state.user_id)) {
          current_user_found = true;
        }
      }
      if(!current_user_found) {
        throw new Util.InputError(`Can not alter permissions without including the current user in the permissions list`);
      }
    }

    let session = this.state.session;
    let response = await PermissionGroup.updateOne(
      {uuid, category},
      {$set: {users: user_ids}}, 
      {session}
    );
    if (!response.acknowledged) {
      throw new Error(`PermissionGroup.replace_permission: Failed to update ${uuid}.`);
    } 
  }

  async initialize_permissions_for(user_id, uuid) {
    await this.#create_permission(uuid, PermissionTypes.admin, [user_id]);
    await this.#create_permission(uuid, PermissionTypes.edit, []);
    await this.#create_permission(uuid, PermissionTypes.view, []);
  }

  async add_permissions(uuid, category, user_ids) {
    // Combine current users at this permission level with the new users at this permission level
    let current_user_ids = await this.read_permissions(uuid, category);
    let combined_user_ids = Util.objectIdsSetUnion(current_user_ids, user_ids);
    await this.replace_permissions(uuid, category, combined_user_ids);
  }

  async delete_permissions(uuid) {
    let session = this.state.session;
    let response = await PermissionGroup.deleteMany(
      { uuid },
      { session }
    );
    if (response.deletedCount != 3) {
      console.error(`permission_group.delete_permissions: Expected three permission groups to be deleted upon deleting uuid.`);
    }
  }
};
exports.model = Model;