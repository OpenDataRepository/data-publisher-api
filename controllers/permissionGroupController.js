const PermissionGroupModel = require('../models/permission_group');
const UserPermissionsModel = require('../models/user_permissions');
const Util = require('../lib/util');
const ModelsSharedFunctions = require('../models/shared_functions');
const TemplateModel = require('../models/template');
const TemplateFieldModel = require('../models/template_field');
const DatasetModel = require('../models/dataset');
const UserModel = require('../models/user');

async function findCollectionForUuid(uuid) {
  if(await ModelsSharedFunctions.exists(DatasetModel.collection(), uuid)) {
    return ModelsSharedFunctions.DocumentTypes.Dataset;
  }
  if(await ModelsSharedFunctions.exists(TemplateModel.collection(), uuid)) {
    return ModelsSharedFunctions.DocumentTypes.Template;
  }
  if(await ModelsSharedFunctions.exists(TemplateFieldModel.collection(), uuid)) {
    return ModelsSharedFunctions.DocumentTypes.TemplateField;
  }
  return null;
}
 
exports.update = async function(req, res, next) {
  try {
    let uuid = req.params.uuid;
    let user_emails = req.body.users;
    let category = req.params.category;
    let user_id = req.user._id;

    if(![PermissionGroupModel.PermissionTypes.admin, PermissionGroupModel.PermissionTypes.edit, PermissionGroupModel.PermissionTypes.view].includes(category)) {
      throw new Util.NotFoundError();
    }

    let document_type = await findCollectionForUuid(uuid);
    if(!document_type) {
      throw new Util.NotFoundError();
    }

    let user_ids = []; 
    for(let email of user_emails) {
      let a_user = await UserModel.getByEmail(email);
      if(!a_user) {
        throw new Util.InputError(`No user exists with email ${email}`);
      } 
      user_ids.push(a_user._id);
    }

    if(document_type == ModelsSharedFunctions.DocumentTypes.Dataset) {
      // Editing dataset permissions. Ensure every one of the users in this list has_permission on the corresponding template uuid
      let template_uuid = await DatasetModel.template_uuid(uuid);
      for(let i = 0; i < user_ids.length; i++) {
        if(!(await UserPermissionsModel.hasAccessToPersistedResource(TemplateModel.collection(), template_uuid, user_ids[i]))) {
          throw new Util.InputError(`Cannot add user ${user_emails[i]} to dataset permission. User required to have view permissions to template first`);
        }
      }
    }

    let existing_user_ids = await PermissionGroupModel.read_permissions(uuid, category);
    let deleted_user_ids = Util.objectIdsSetDifference(existing_user_ids, user_ids); 
    let added_user_ids = Util.objectIdsSetDifference(user_ids, existing_user_ids); 

    let callback = async (session) => {
      if(document_type == ModelsSharedFunctions.DocumentTypes.Template || document_type == ModelsSharedFunctions.DocumentTypes.TemplateField) {
        if(category == PermissionGroupModel.PermissionTypes.view) {
          // No users can be deleted from view
          if(deleted_user_ids.length > 0) {
            throw new Util.InputError(`Cannot delete any users from template view permissions.`);
          }
        } else {
          // If this is admin or edit, add deleted users to view
          await PermissionGroupModel.add_permissions(user_id, uuid, PermissionGroupModel.PermissionTypes.view, deleted_user_ids, session);
          await UserPermissionsModel.addUserIdsToUuidAndCategory(uuid, document_type, PermissionGroupModel.PermissionTypes.view, deleted_user_ids, session);
        }
      }
      await PermissionGroupModel.replace_permissions(user_id, uuid, category, user_ids, session);
      await UserPermissionsModel.addUserIdsToUuidAndCategory(uuid, document_type, category, added_user_ids, session);
      await UserPermissionsModel.removeUserIdsFromUuidAndCategory(uuid, document_type, category, deleted_user_ids, session);
    };
    await ModelsSharedFunctions.executeWithTransaction(callback);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.get = async function(req, res, next) {
  try {
    let _ids = await PermissionGroupModel.read_permissions(req.params.uuid, req.params.category);
    let emails = []; 
    for(let _id of _ids) {
      let user = await UserModel.getBy_id(_id);
      if(user) {
        emails.push(user.email);
      }
    }
    res.send(emails);
  } catch(err) {
    next(err);
  }
}

exports.delete = async function(uuid, document_type, session) {
  // Get the permissions group for this uuid
  for(let permission_type in PermissionGroupModel.PermissionTypes) {
    let user_ids = await PermissionGroupModel.read_permissions(uuid, permission_type, session);
    await UserPermissionsModel.removeUserIdsFromUuidAndCategory(uuid, document_type, permission_type, user_ids, session);
  }
  // delete permission group and the permissions for all users who have permissions to it
  await PermissionGroupModel.delete_permissions(uuid, session);
}

// This endpoint exists only for the purpose of integration testing
exports.testing_has_permission = async function(req, res, next) {
  try {
    let result = await PermissionGroupModel.has_permission(req.user._id, req.params.uuid, req.params.category);
    res.send(result);
  } catch(err) {
    next(err);
  }
}