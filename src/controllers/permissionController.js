const PermissionModel = require('../models/permission');
const Util = require('../lib/util');
const ModelsSharedFunctions = require('../models/shared_functions');
const TemplateModel = require('../models/template');
const TemplateFieldModel = require('../models/template_field');
const DatasetModel = require('../models/dataset');
const UserModel = require('../models/user');

// The current implementation is tight coupling
async function findCollectionForUuid(uuid) {
  if(await ModelsSharedFunctions.exists(DatasetModel.collection(), uuid)) {
    return ModelsSharedFunctions.DocumentTypes.dataset;
  }
  if(await ModelsSharedFunctions.exists(TemplateModel.collection(), uuid)) {
    return ModelsSharedFunctions.DocumentTypes.template;
  }
  if(await ModelsSharedFunctions.exists(TemplateFieldModel.collection(), uuid)) {
    return ModelsSharedFunctions.DocumentTypes.template_field;
  }
  return null;
}
 
exports.update_document_permissions = async function(req, res, next) {
  try {
    let document_uuid = req.params.uuid;
    let user_emails = req.body.users;
    let permission_level = req.params.permission_level;

    if(!PermissionModel.model.validPermissionLevel(permission_level)) {
      throw new Util.NotFoundError();
    }

    let document_type = await findCollectionForUuid(document_uuid);
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
    let permission_model_instance = new PermissionModel.model(state);
    let dataset_model_instance = new DatasetModel.model(state);

    if(document_type == ModelsSharedFunctions.DocumentTypes.dataset) {
      // Editing dataset permissions. Ensure every one of the users in this list has view permissions to the corresponding template uuid
      let template_uuid = await dataset_model_instance.template_uuid(document_uuid);
      for(let i = 0; i < user_ids.length; i++) {
        if(!(await permission_model_instance.hasPermission(template_uuid, PermissionModel.PermissionTypes.view, TemplateModel.collection(), user_ids[i]))) {
          throw new Util.InputError(`Cannot add user ${user_emails[i]} to dataset permission. User required to have view permissions to template first`);
        }
      }
    }

    let callback = async () => {
      await permission_model_instance.replaceDocumentPermissions(document_uuid, permission_level, user_ids);
    };
    await ModelsSharedFunctions.executeWithTransaction(state, callback);

    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.get_document_permissions = async function(req, res, next) {
  try {
    let document_uuid = req.params.uuid;
    let permission_level = req.params.permission_level;

    if(!PermissionModel.model.validPermissionLevel(permission_level)) {
      throw new Util.NotFoundError();
    }

    let state = Util.initializeState(req);
    let permission_model_instance = new PermissionModel.model(state);

    let _ids = await permission_model_instance.usersWithDocumentPermission(document_uuid, permission_level);
    let emails = []; 
    for(let _id of _ids) {
      let user = await UserModel.model.getBy_id(_id);
      if(user) {
        emails.push(user.email);
      }
    }
    if(emails.length == 0) {
      if(!(await permission_model_instance.documentUuidExists(req.params.uuid))){
        throw new Util.NotFoundError();
      }
    }
    res.send(emails);
  } catch(err) {
    next(err);
  }
}