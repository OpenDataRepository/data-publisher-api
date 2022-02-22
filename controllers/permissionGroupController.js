const PermissionGroupModel = require('../models/permission_group');
const Util = require('../lib/util');
const ModelsSharedFunctions = require('../models/shared_functions');
const TemplateModel = require('../models/template');
const DatasetModel = require('../models/dataset');

// This endpoint exists only for the purpose of integration testing
exports.testing_initialize = async function(req, res, next) {
  try {
    await PermissionGroupModel.initialize_permissions_for(req.cookies.user, req.params.uuid);
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
    let users = req.body.users;
    let category = req.params.category;
    let user = req.cookies.user;
    if(await ModelsSharedFunctions.exists(DatasetModel.collection(), uuid)) {
      // Editing dataset permissions. Ensure every one of the users in this list has_permission on the corresponding template uuid
      let template_uuid = await DatasetModel.template_uuid(uuid);
      for(let a_user of users) {
        if(!(await ModelsSharedFunctions.userHasAccessToPublishedResource(TemplateModel.collection(), template_uuid, a_user, PermissionGroupModel))) {
          throw new Util.InputError(`Cannot add user ${a_user} to dataset permission. User required to have view permissions to template first`)
        }
      }
    }
    if(await ModelsSharedFunctions.exists(TemplateModel.collection(), uuid)) {
      // Editing template permissions. If this is admin or edit, determine which users are being removed from admin/edit, and then add them to view
      // create a set of existing users, and a set of the new users.
      let existing_users = await PermissionGroupModel.read_permissions(uuid, category);
      // find the set difference of existing users minus new users
      let deleted_users = existing_users.filter(function(user) { return users.indexOf(user) < 0 })
      if(category == PermissionGroupModel.PERMISSION_VIEW) {
        // If this is view, make sure no users are being removed 
        if(deleted_users.length > 0) {
          throw new Util.InputError(`Cannot delete any users from template view permissions.`);
        }
        await PermissionGroupModel.replace_permissions(user, uuid, category, users);
      } else {
        let callback = async (session) => {
          // If this is admin or edit, determine which users are being removed, and then add them to view
          await PermissionGroupModel.replace_permissions(user, uuid, category, users, session);
          await PermissionGroupModel.add_permissions(user, uuid, PermissionGroupModel.PERMISSION_VIEW, deleted_users, session);
        };
        await ModelsSharedFunctions.executeWithTransaction(callback);
      }
    } else {
      // TODO: Implement users and sessions, and then get the current_user from the session instead of a cookie
      await PermissionGroupModel.replace_permissions(user, uuid, category, users);
    }
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.get = async function(req, res, next) {
  try {
    let permissions = await PermissionGroupModel.read_permissions(req.params.uuid, req.params.category);
    res.send(permissions);
  } catch(err) {
    next(err);
  }
}

// This endpoint exists only for the purpose of integration testing
exports.testing_has_permission = async function(req, res, next) {
  try {
    let result = await PermissionGroupModel.has_permission(req.cookies.user, req.params.uuid, req.params.category);
    res.send(result);
  } catch(err) {
    next(err);
  }
}