const TemplateFieldModel = require('../models/template_field');
const Util = require('../lib/util');
const PermissionGroupController = require('./permissionGroupController');
const SharedFunctions = require('../models/shared_functions');

exports.draft_get = async function(req, res, next) {
  try {
    let template_field = await TemplateFieldModel.draftGet(req.params.uuid, req.user._id);
    if(template_field) {
      res.json(template_field);
    } else {
      throw new Util.NotFoundError();
    }
  } catch(err) {
    next(err);
  }
}

exports.get_latest_persisted = async function(req, res, next) {
  try {
    let user_id = req.user ? req.user._id  : null;
    let template_field = await TemplateFieldModel.latestPersisted(req.params.uuid, user_id);
    if(!template_field) {
      throw new Util.NotFoundError();
    }
    res.json(template_field);
  } catch(err) {
    next(err);
  }
}

exports.get_persisted_before_timestamp = async function(req, res, next) {
  try {
    let user_id = req.user ? req.user._id  : null;
    let template_field = await TemplateFieldModel.latestPersistedBeforeDate(req.params.uuid, new Date(req.params.timestamp), user_id);
    if(!template_field) {
      throw new Util.NotFoundError();
    }
    res.json(template_field);
  } catch(err) {
    next(err);
  }
}

exports.create = async function(req, res, next) {
  try {
    let inserted_uuid = await TemplateFieldModel.create(req.body, req.user._id);
    res.json({inserted_uuid});
  } catch(err) {
    next(err);
  }
}

exports.update = async function(req, res, next) {
  try {
    if(!Util.objectContainsUUID(req.body, req.params.uuid)) {
      throw new Util.InputError(`UUID provided and the body uuid do not match.`)
    }
    await TemplateFieldModel.update(req.body, req.user._id);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.persist = async function(req, res, next) {
  try {
    if(!Date.parse(req.body.last_update)) {
      throw new Util.InputError(`last_update provided as parameter is not in valid date format: ${req.body.last_update}`);
    } 
    await TemplateFieldModel.persist(req.params.uuid, new Date(req.body.last_update), req.user._id);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.draft_delete = async function(req, res, next) {
  try {
    let uuid = req.params.uuid;
    const callback = async (session) => {
      await TemplateFieldModel.draftDelete(uuid, req.user._id, session);
      if( !(await SharedFunctions.latestPersisted(TemplateFieldModel.collection(), uuid, session)) ) {
        await PermissionGroupController.delete(uuid, SharedFunctions.DocumentTypes.TemplateField, session);
      }
    }
    await SharedFunctions.executeWithTransaction(callback);

  } catch(err) {
    return next(err);
  }
  res.sendStatus(200);
}

exports.get_last_update = async function(req, res, next) {
  var last_update;
  try {
    last_update = await TemplateFieldModel.lastUpdate(req.params.uuid, req.user._id);
  } catch(err) {
    return next(err);
  }
  res.send(last_update);
}

exports.draft_existing = async function(req, res, next) {
  var exists;
  try {
    exists = await TemplateFieldModel.draftExisting(req.params.uuid);
  } catch(err) {
    return next(err);
  }
  res.send(exists);
}