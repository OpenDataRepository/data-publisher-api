const PermissionModel = require('../models/permission');
const Util = require('../lib/util');
const TemplateModel = require('../models/template');
const TemplateFieldModel = require('../models/template_field');
const DatasetModel = require('../models/dataset');
const UserModel = require('../models/user');

// The current implementation is tight coupling
async function findCollectionForUuid(uuid) {
  if(await (new DatasetModel.model({})).exists(uuid)) {
    return DatasetModel.model.DOCUMENT_TYPE;
  }
  if(await (new TemplateModel.model({})).exists(uuid)) {
    return TemplateModel.model.DOCUMENT_TYPE;
  }
  if(await (new TemplateFieldModel.model({})).exists(uuid)) {
    return TemplateFieldModel.model.DOCUMENT_TYPE;
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
    let template_model_instance = new TemplateModel.model(state);
    let dataset_model_instance = new DatasetModel.model(state);

    if(document_type == DatasetModel.model.DOCUMENT_TYPE) {
      // Editing dataset permissions. Ensure every one of the users in this list has view permissions to the corresponding template uuid
      let template_uuid = await dataset_model_instance.template_uuid(document_uuid);
      for(let i = 0; i < user_ids.length; i++) {
        if(!(await template_model_instance.hasViewPermissionToPersisted(template_uuid, user_ids[i]))) {
          throw new Util.InputError(`Cannot add user ${user_emails[i]} to dataset permission. User required to have view permissions to template first`);
        }
      }
    }

    let callback = async () => {
      await permission_model_instance.replaceDocumentPermissions(document_uuid, permission_level, user_ids);
    };
    await Util.executeWithTransaction(state, callback);

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

exports.current_user_has_permission = async function(req, res, next) {
  try {
    const document_uuid = req.params.uuid;
    const permission_level = req.params.permission_level;

    if(!PermissionModel.model.validPermissionLevel(permission_level)) {
      throw new Util.NotFoundError();
    }

    let state = Util.initializeState(req);
    let model_instance = new PermissionModel.model(state);

    const has_permission = await model_instance.hasExplicitPermission(document_uuid, permission_level);
    res.send(has_permission);
  } catch(err) {
    next(err);
  }
}