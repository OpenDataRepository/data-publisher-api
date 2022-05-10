const PermissionGroupModel = require('../models/permission_group');
const Util = require('../lib/util');
const ModelsSharedFunctions = require('../models/shared_functions');
const TemplateModel = require('../models/template');
const DatasetModel = require('../models/dataset');
const UserModel = require('../models/user');

// This endpoint exists only for the purpose of integration testing
exports.testing_initialize = async function(req, res, next) {
  try {
    await PermissionGroupModel.initialize_permissions_for(req.user._id, req.params.uuid);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}
 
exports.update = async function(req, res, next) {
  try {
    if(![PermissionGroupModel.PERMISSION_ADMIN, PermissionGroupModel.PERMISSION_EDIT, PermissionGroupModel.PERMISSION_VIEW].includes(req.params.category)) {
      throw new Util.NotFoundError();
    }
    let uuid = req.params.uuid;
    let user_emails = req.body.users;
    let category = req.params.category;
    let user_id = req.user._id;

    let user_ids = []; 
    for(let email of user_emails) {
      let a_user = await UserModel.getByEmail(email);
      if(!a_user) {
        throw new Util.InputError(`No user exists with email ${email}`);
      } 
      user_ids.push(a_user._id);
    }

    if(await ModelsSharedFunctions.exists(DatasetModel.collection(), uuid)) {
      // Editing dataset permissions. Ensure every one of the users in this list has_permission on the corresponding template uuid
      let template_uuid = await DatasetModel.template_uuid(uuid);
      for(let i = 0; i < user_ids.length; i++) {
        if(!(await ModelsSharedFunctions.userHasAccessToPersistedResource(TemplateModel.collection(), template_uuid, user_ids[i], PermissionGroupModel))) {
          throw new Util.InputError(`Cannot add user ${user_emails[i]} to dataset permission. User required to have view permissions to template first`);
        }
      }
    }
    if(await ModelsSharedFunctions.exists(TemplateModel.collection(), uuid)) {
      // Editing template permissions. If this is admin or edit, determine which users are being removed from admin/edit, and then add them to view
      // create a set of existing users, and a set of the new users.
      let existing_user_ids = await PermissionGroupModel.read_permissions(uuid, category);
      // find the set difference of existing users minus new users
      let deleted_user_ids = Util.objectIdsSetDifference(existing_user_ids, user_ids); 
      if(category == PermissionGroupModel.PERMISSION_VIEW) {
        // If this is view, make sure no users are being removed 
        if(deleted_user_ids.length > 0) {
          throw new Util.InputError(`Cannot delete any users from template view permissions.`);
        }
        await PermissionGroupModel.replace_permissions(user_id, uuid, category, user_ids);
      } else {
        let callback = async (session) => {
          // If this is admin or edit, determine which users are being removed, and then add them to view
          await PermissionGroupModel.replace_permissions(user_id, uuid, category, user_ids, session);
          await PermissionGroupModel.add_permissions(user_id, uuid, PermissionGroupModel.PERMISSION_VIEW, deleted_user_ids, session);
        };
        await ModelsSharedFunctions.executeWithTransaction(callback);
      }
    } else {
      await PermissionGroupModel.replace_permissions(user_id, uuid, category, user_ids);
    }
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

// This endpoint exists only for the purpose of integration testing
exports.testing_has_permission = async function(req, res, next) {
  try {
    let result = await PermissionGroupModel.has_permission(req.user._id, req.params.uuid, req.params.category);
    res.send(result);
  } catch(err) {
    next(err);
  }
}