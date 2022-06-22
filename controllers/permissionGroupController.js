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

    if(![PermissionGroupModel.PermissionTypes.admin, PermissionGroupModel.PermissionTypes.edit, PermissionGroupModel.PermissionTypes.view].includes(category)) {
      throw new Util.NotFoundError();
    }

    let document_type = await findCollectionForUuid(uuid);
    if(!document_type) {
      throw new Util.NotFoundError();
    }

    let user_ids = []; 
    for(let email of user_emails) {
      let a_user = await UserModel.model.getByEmail(email);
      if(!a_user) {
        throw new Util.InputError(`No user exists with email ${email}`);
      } 
      user_ids.push(a_user._id);
    }

    let state = Util.initializeState(req);
    let permission_group_model_instance = new PermissionGroupModel.model(state);
    let user_permissions_model_instance = new UserPermissionsModel.model(state);
    let dataset_model_instance = new DatasetModel.model(state);


    if(document_type == ModelsSharedFunctions.DocumentTypes.Dataset) {
      // Editing dataset permissions. Ensure every one of the users in this list has_permission on the corresponding template uuid
      let template_uuid = await dataset_model_instance.template_uuid(uuid);
      for(let i = 0; i < user_ids.length; i++) {
        if(!(await user_permissions_model_instance.hasAccessToPersistedResource(TemplateModel.collection(), template_uuid, user_ids[i]))) {
          throw new Util.InputError(`Cannot add user ${user_emails[i]} to dataset permission. User required to have view permissions to template first`);
        }
      }
    }

    let existing_user_ids = await permission_group_model_instance.read_permissions(uuid, category);
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
          await permission_group_model_instance.add_permissions(uuid, PermissionGroupModel.PermissionTypes.view, deleted_user_ids, session);
          await user_permissions_model_instance.addUserIdsToUuidAndCategory(uuid, document_type, PermissionGroupModel.PermissionTypes.view, deleted_user_ids, session);
        }
      }
      await permission_group_model_instance.replace_permissions(uuid, category, user_ids, session);
      await user_permissions_model_instance.addUserIdsToUuidAndCategory(uuid, document_type, category, added_user_ids, session);
      await user_permissions_model_instance.removeUserIdsFromUuidAndCategory(uuid, document_type, category, deleted_user_ids, session);
    };
    await ModelsSharedFunctions.executeWithTransaction(state, callback);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.get = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let permission_group_model_instance = new PermissionGroupModel.model(state);

    let _ids = await permission_group_model_instance.read_permissions(req.params.uuid, req.params.category);
    let emails = []; 
    for(let _id of _ids) {
      let user = await UserModel.model.getBy_id(_id);
      if(user) {
        emails.push(user.email);
      }
    }
    res.send(emails);
  } catch(err) {
    next(err);
  }
}

// This is technically misplaced in the controller, but I'm not sure where else to put it
exports.delete = async function(uuid, document_type, state) {
  let permission_group_model_instance = new PermissionGroupModel.model(state);
  let user_permissions_model_instance = new UserPermissionsModel.model(state);
  // Get the permissions group for this uuid
  for(let permission_type in PermissionGroupModel.PermissionTypes) {
    let user_ids = await permission_group_model_instance.read_permissions(uuid, permission_type);
    await user_permissions_model_instance.removeUserIdsFromUuidAndCategory(uuid, document_type, permission_type, user_ids);
  }
  // delete permission group and the permissions for all users who have permissions to it
  await permission_group_model_instance.delete_permissions(uuid);
}

// This endpoint exists only for the purpose of integration testing
exports.testing_has_permission = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let permission_group_model_instance = new PermissionGroupModel.model(state);
    let result = await permission_group_model_instance.has_permission(req.user._id, req.params.uuid, req.params.category);
    res.send(result);
  } catch(err) {
    next(err);
  }
}