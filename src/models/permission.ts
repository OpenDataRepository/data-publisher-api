const assert = require('assert');
const MongoDB = require('../lib/mongoDB');
import { ObjectId } from 'mongodb';
import { isAssertClause } from 'typescript';
import * as Util from '../lib/util';
import {model as UserModel} from './user';
const SharedFunctions = require('./shared_functions');

enum PermissionTypes {
  admin = 'admin',
  edit = 'edit',
  view = 'view'
};

// Mongodb schema for permission
const Schema = Object.freeze({
  bsonType: "object",
  required: [ "_id", "document_uuid", "permission_level", "user_id" ],
  properties: {
    _id: {
      bsonType: "objectId"
    },
    document_uuid: {
      bsonType: "string",
      description: "the uuid of the document whose permissions this mongodocument is specifying"
      // uuid should be in a valid uuid format as well
    },
    permission_level: {
      enum: Object.values(PermissionTypes),
      description: "the permission level this mongodocument is specifying"
    },
    user_id: {
      bsonType: "objectId",
      description: "the user with permission to this document"
    }
  },
  additionalProperties: false
});

var Permission;

// Returns a reference to the permissions Mongo Collection
async function collection() {
  if (Permission === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('permissions', {validator: { $jsonSchema: Schema} });
      await db.collection('permissions').createIndex({ user_id: 1, document_uuid: 1 });
    } catch(e) {
      db.command({collMod:'permissions', validator: { $jsonSchema: Schema }});
    }
    Permission = db.collection('permissions');
  }
  return Permission;
}

async function init() {
  Permission = await collection();
}

class Model {

  collection = Permission;

  constructor(public state){
    this.state = state;
  }

  static #equalOrHigherPermissionLevels(permission_level: PermissionTypes): PermissionTypes[] {
    let permission_levels = [permission_level];
    if(permission_level == PermissionTypes.edit) {
      permission_levels.push(PermissionTypes.admin);
    }
    else if(permission_level == PermissionTypes.view) {
      permission_levels.push(PermissionTypes.edit);
      permission_levels.push(PermissionTypes.admin);
    }
    return permission_levels;
  }

  static validPermissionLevel(permission_level: string): boolean {
    return (<any>Object.values(PermissionTypes)).includes(permission_level);
  }

  // If a user has permission to this category or a superior one, return true
  async hasExplicitPermission(document_uuid: string, permission_level: PermissionTypes, user_id = this.state.user_id): Promise<boolean> {
    if(await UserModel.isAdmin(user_id) || await UserModel.isSuper(user_id)) {
      return true;
    }

    let session = this.state.session;

    let permission_document = await Permission.findOne(
      {document_uuid, user_id},
      {session}
    );
    if(!permission_document) {
      return false;
    }
    let permission_levels = Model.#equalOrHigherPermissionLevels(permission_level);
    return permission_levels.includes(permission_document.permission_level);
  }

  async usersWithDocumentPermission(document_uuid: string, permission_level: PermissionTypes): Promise<ObjectId[]> {
    let session = this.state.session;
    return await Permission.distinct(
      "user_id",
      {document_uuid, permission_level},
      {session}
    );
  }

  async #usersWithPermissionGreaterOrEqual(document_uuid: string, permission_level: PermissionTypes): Promise<ObjectId[]> {
    let session = this.state.session;
    let permission_levels = Model.#equalOrHigherPermissionLevels(permission_level);
    return await Permission.distinct(
      "user_id",
      {document_uuid, permission_level: { "$in" : permission_levels }},
      {session}
    );
  }

  // Upsert means create or update
  async #upsertPermission(document_uuid: string, permission_level: PermissionTypes, user_id: ObjectId): Promise<void> {
    let session = this.state.session;
    let response = await Permission.updateOne(
      {
        document_uuid,
        user_id 
      },
      {
        $set: {
          document_uuid,
          user_id,
          permission_level
        }
      },
      {upsert: true, session}
    );
    if (!response.acknowledged) {
      throw `Permission.create_permission: Failed to insert uuid ${document_uuid}`;
    } 
  }

  async replaceDocumentPermissions(document_uuid: string, permission_level: PermissionTypes, user_ids: ObjectId[]): Promise<void> {
    // The current user must be in the admin permissions group for this uuid to change it's permissions
    if (!(await this.hasExplicitPermission(document_uuid, PermissionTypes.admin))) {
      throw new Util.PermissionDeniedError(`You do not have the permission level (admin) required to modify these permissions`);
    }

    // If this is the admin category, cannot remove the current user
    if(permission_level == PermissionTypes.admin) {
      let current_user_found = false;
      for(let user_id of user_ids) {
        if(user_id.equals(this.state.user_id)) {
          current_user_found = true;
        }
      }
      if(!current_user_found) {
        throw new Util.InputError(`Cannot remove current user from admin permissions`);
      }
    }

    // All removed permissions go to view
    let existing_document_permissions = await this.usersWithDocumentPermission(document_uuid, permission_level);
    let _ids_to_relegate = Util.objectIdsSetDifference(existing_document_permissions, user_ids);
    if(permission_level == PermissionTypes.view && _ids_to_relegate.length > 0) {
      throw new Util.InputError(`Once a user is granted view permission, it cannot be removed.`);
    }
    for(let _id of _ids_to_relegate) {
      await this.#upsertPermission(document_uuid, PermissionTypes.view, _id);
    }

    // All new permissions are added
    let greater_or_equal_permissions = await this.#usersWithPermissionGreaterOrEqual(document_uuid, permission_level);
    let _ids_to_add = Util.objectIdsSetDifference(user_ids, greater_or_equal_permissions);
    for(let _id of _ids_to_add) {
      await this.#upsertPermission(document_uuid, permission_level, _id);
    }
  }

  async initializePermissionsFor(document_uuid: string): Promise<void> {
    let user_id = this.state.user_id;
    await this.#upsertPermission(document_uuid, PermissionTypes.admin, user_id);
  }

  async addUser_idsToDocumentAtPermissionLevel(document_uuid: string, permission_level: PermissionTypes, user_ids: ObjectId[]): Promise<void> {
    // Combine current users at this permission level with the new users at this permission level
    let greater_or_equal_user_ids = await this.#usersWithPermissionGreaterOrEqual(document_uuid, permission_level);
    let new_user_ids = Util.objectIdsSetDifference(user_ids, greater_or_equal_user_ids);
    for(let new_user_id of new_user_ids) {
      await this.#upsertPermission(document_uuid, permission_level, new_user_id);
    }
  }

  // async removeUserIdsFromUuidAndCategory(document_uuid: string, permission_type, 
  // user_ids: ObjectId[]): Promise<void> {
  //     for(let user_id of user_ids) {
  //       await this.#removePermission(user_id, permission_type, document_uuid);
  //     }
  // }

  async documentDeletePermissions(document_uuid: string): Promise<void> {
    let session = this.state.session;
    let response = await Permission.deleteMany(
      { document_uuid },
      { session }
    );
    if (!response.acknowledged) {
      throw new Error(`permission.documentDeletePermissions: Mongo deletion failed.`);
    }
  }

  async getUserPermissions(): Promise<Record<string, any>[]> {
    let user_id = this.state.user_id;
    return await Permission.find(
      {user_id}
    ).toArray();
  }

  async documentUuidExists(document_uuid: string): Promise<boolean> {
    let admin_user_ids = await this.usersWithDocumentPermission(document_uuid, PermissionTypes.admin);
    return admin_user_ids.length > 0;
  }

  async allUuidsAbovePermissionLevel(permission_level: PermissionTypes, collection): Promise<string[]> {
    let user_id = this.state.user_id;
    let uuids_all_collections = await Permission.distinct(
      "document_uuid",
      {user_id, permission_level: {$in: Model.#equalOrHigherPermissionLevels(permission_level)}}
    );
    return await SharedFunctions.uuidsInThisCollection(collection, uuids_all_collections);
  }

};
export {collection, init, Model as model, PermissionTypes};