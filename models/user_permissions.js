const MongoDB = require('../lib/mongoDB');
const PermissionGroupModel = require('./permission_group');
const SharedFunctions = require('./shared_functions');
const Util = require('../lib/util');

const uuids_schema = Object.freeze({
  bsonType: "array",
  uniqueItems: true,
  items: {
    bsonType: "string" // uuid
  }
});

const document_schema = Object.freeze({
  bsonType: "object",
  required: [ "admin", "edit", "view" ],
  properties: {
    admin: uuids_schema,
    edit: uuids_schema,
    view: uuids_schema
  },
  additionalProperties: false
});

const Schema = Object.freeze({
  bsonType: "object",
  required: [ "_id", "user_id", "dataset", "template", "template_field" ],
  properties: {
    _id: {
      bsonType: "objectId"
    },
    user_id: {
      bsonType: "objectId",
      description: "the user id whose permissions we are specifying"
    },
    dataset: document_schema,
    template: document_schema,
    template_field: document_schema,
    admin: {
      bsonType: "bool",
      description: "if true, this is an admin user"
    },
    super: {
      bsonType: "bool",
      description: "if true, this is a super user"
    }
  },
  additionalProperties: false
});

var UserPermissions;

async function collection() {
  if (UserPermissions === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('user_permissions', {validator: { $jsonSchema: Schema} });
    } catch(e) {}
    UserPermissions = db.collection('user_permissions');
  }
  return UserPermissions;
}

exports.init = async function() {
  UserPermissions = await collection();
}

class Model {
  collection = UserPermissions;

  constructor(state){
    this.state = state;
  }

  async create(user_id) {
    let session = this.state.session;
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
  
  static async get(user_id) {
    return await UserPermissions.findOne({user_id});
  }
  
  async has_permission(user_id, uuid, category) {
    let user_permission = await Model.get(user_id);
    if(user_permission.admin || user_permission.super) {
      return true;
    }
    let permission_group_model_instance = new PermissionGroupModel.model(this.state);
    return await permission_group_model_instance.has_permission(user_id, uuid, category);
  }
  
  async hasAccessToPersistedResource(collection, uuid, user_id){
    let latest_persisted = await SharedFunctions.latestPersisted(collection, uuid, this.state.session);
    if(!latest_persisted) {
      return false;
    }
  
    // If public, then automatic yes
    if(Util.isPublic(latest_persisted.public_date)) {
      return true;
    }
  
    return await this.has_permission(user_id, uuid, PermissionGroupModel.PermissionTypes.view);
  }
  
  async #getCurrentUuids(user_id, document_type, permission_type) {
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
  
  async #addPermission(user_id, document_type, permission_type, document_uuid) {
    let uuids = await this.#getCurrentUuids(user_id, document_type, permission_type);
    if(uuids.includes(document_uuid)) {
      return;
    }
    let property_path = `${document_type}.${permission_type}`;
    let session = this.state.session;
    let response = await UserPermissions.updateOne(
      {user_id},
      {$addToSet: {[property_path]: document_uuid}},
      {session}
    );
    if (response.modifiedCount != 1) {
      throw `UserPermissions.addPermission: should be 1 modified document. Instead: ${response.modifiedCount}`;
    }
  }
  
  async #removePermission(user_id, document_type, permission_type, document_uuid) {
    let uuids = await this.#getCurrentUuids(user_id, document_type, permission_type);
    if(!uuids.includes(document_uuid)) {
      return;
    }
    let property_path = `${document_type}.${permission_type}`;
    let session = this.state.session;
    let response = await UserPermissions.updateOne(
      {user_id},
      {$pull: {[property_path]: document_uuid}},
      {session}
    );
    if (response.modifiedCount != 1) {
      throw `UserPermissions.removePermission: should be 1 modified document. Instead: ${response.modifiedCount}`;
    }
  }
  
  async addUserIdsToUuidAndCategory (document_uuid, document_type, permission_type, user_ids) {
    for(let user_id of user_ids) {
      await this.#addPermission(user_id, document_type, permission_type, document_uuid);
    }
  }
  
  async removeUserIdsFromUuidAndCategory(document_uuid, document_type, permission_type, user_ids) {
    for(let user_id of user_ids) {
      await this.#removePermission(user_id, document_type, permission_type, document_uuid);
    }
  }
  
  async initialize_permissions_for(user_id, document_uuid, document_type) {
    await this.#addPermission(user_id, document_type, PermissionGroupModel.PermissionTypes.admin, document_uuid);
    let permission_group_model_instance = new PermissionGroupModel.model(this.state);
    await permission_group_model_instance.initialize_permissions_for(user_id, document_uuid);
  }
  
  static async setAdmin(user_id) {
    let response = await UserPermissions.updateOne(
      {user_id},
      {$set: {admin: true}}
    );
    if (response.modifiedCount != 1) {
      throw `UserPermissions.setAdmin: should be 1 modified document. Instead: ${response.modifiedCount}`;
    }
  }
  
  static async setSuper(user_id) {
    let response = await UserPermissions.updateOne(
      {user_id},
      {$set: {super: true}}
    );
    if (response.modifiedCount != 1) {
      throw `UserPermissions.setSuper: should be 1 modified document. Instead: ${response.modifiedCount}`;
    }
  }
  
  static async isSuper(user_id) {
    let permissions = await Model.get(user_id);
    if(!permissions) {
      return false;
    }
    return permissions.super;
  }
  
  static async isAdmin(user_id) {
    let permissions = await Model.get(user_id);
    if(!permissions) {
      return false;
    }
    return permissions.admin;
  }

};
exports.model = Model;