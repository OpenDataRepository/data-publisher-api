const TemplateFieldModel = require('../models/template_field');
const Util = require('../lib/util');
const PermissionModel = require('../models/permission');
const SharedFunctions = require('../models/shared_functions');

exports.draft_get = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new TemplateFieldModel.model(state);
    let template_field = await model_instance.draftGet(req.params.uuid);
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
    let state = Util.initializeState(req);
    let model_instance = new TemplateFieldModel.model(state);
    let template_field = await model_instance.latestPersisted(req.params.uuid);
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
    let state = Util.initializeState(req);
    let model_instance = new TemplateFieldModel.model(state);
    let template_field = await model_instance.latestPersistedBeforeDate(req.params.uuid, new Date(req.params.timestamp));
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
    let state = Util.initializeState(req);
    let model_instance = new TemplateFieldModel.model(state);
    let inserted_uuid = await model_instance.create(req.body);
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
    let state = Util.initializeState(req);
    let model_instance = new TemplateFieldModel.model(state);
    await model_instance.update(req.body);
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
    let state = Util.initializeState(req);
    let model_instance = new TemplateFieldModel.model(state);
    await model_instance.persist(req.params.uuid, new Date(req.body.last_update));
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }  
}

exports.draft_delete = async function(req, res, next) {
  try {
    let uuid = req.params.uuid;
    let state = Util.initializeState(req);
    let model_instance = new TemplateFieldModel.model(state);
    const callback = async () => {
      await model_instance.draftDelete(uuid);
      if( !(await SharedFunctions.latestPersisted(TemplateFieldModel.collection(), uuid, state.session)) ) {
        await (new PermissionModel.model(state)).documentDeletePermissions(uuid);
      }
    }
    await SharedFunctions.executeWithTransaction(model_instance.state, callback);

  } catch(err) {
    return next(err);
  }
  res.sendStatus(200);
}

exports.get_last_update = async function(req, res, next) {
  var last_update;
  try {
    let state = Util.initializeState(req);
    let model_instance = new TemplateFieldModel.model(state);
    last_update = await model_instance.lastUpdate(req.params.uuid);
  } catch(err) {
    return next(err);
  }
  res.send(last_update);
}

exports.draft_existing = async function(req, res, next) {
  var exists;
  try {
    let state = Util.initializeState(req);
    let model_instance = new TemplateFieldModel.model(state);
    exists = await model_instance.draftExisting(req.params.uuid);
  } catch(err) {
    return next(err);
  }
  res.send(exists);
}