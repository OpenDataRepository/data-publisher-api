const TemplateModel = require('../models/template');
const Util = require('../lib/util');
const PermissionModel = require('../models/permission');
const SharedFunctions = require('../models/shared_functions');
const PluginsModel = require('../models/plugins');

exports.draft_get = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new TemplateModel.model(state);
    let template = await model_instance.draftGet(req.params.uuid);
    if(!template) {
      throw new Util.NotFoundError();
    }
    let plugins_model_instance = new PluginsModel.model(state);
    await plugins_model_instance.appendPlugins(template);
    res.json(template);
  } catch(err) {
    next(err);
  }
}

exports.get_latest_persisted = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new TemplateModel.model(state);
    let template = await model_instance.latestPersisted(req.params.uuid);
    if(!template) {
      throw new Util.NotFoundError();
    }
    let plugins_model_instance = new PluginsModel.model(state);
    await plugins_model_instance.appendPlugins(template);
    res.json(template);
  } catch(err) {
    next(err);
  }
}

exports.get_version = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new TemplateModel.model(state);
    let template = await model_instance.getVersion(SharedFunctions.convertToMongoId(req.params.id));
    if(!template) {
      throw new Util.NotFoundError();
    }
    let plugins_model_instance = new PluginsModel.model(state);
    await plugins_model_instance.appendPlugins(template);
    res.json(template);
  } catch(err) {
    next(err);
  }
}

exports.get_persisted_version = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new TemplateModel.model(state);
    let template = await model_instance.persistedVersion(SharedFunctions.convertToMongoId(req.params.id));
    if(!template) {
      throw new Util.NotFoundError();
    }
    let plugins_model_instance = new PluginsModel.model(state);
    await plugins_model_instance.appendPlugins(template);
    res.json(template);
  } catch(err) {
    next(err);
  }
}

exports.get_persisted_before_timestamp = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new TemplateModel.model(state);
    let template = await model_instance.persistedBeforeDate(req.params.uuid, new Date(req.params.timestamp));
    if(!template) {
      throw new Util.NotFoundError();
    }
    let plugins_model_instance = new PluginsModel.model(state);
    await plugins_model_instance.appendPlugins(template);
    res.json(template);
  } catch(err) {
    next(err);
  }
}

exports.create = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new TemplateModel.model(state);
    let plugins_model_instance = new PluginsModel.model(state);
    let inserted_uuid;
    const callback = async () => {
      inserted_uuid = await model_instance.create(req.body);
      await plugins_model_instance.modifyPlugins(req.body);
    }
    await SharedFunctions.executeWithTransaction(state, callback);
    res.redirect(303, `/template/${inserted_uuid}/draft`);
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
    let model_instance = new TemplateModel.model(state);
    let plugins_model_instance = new PluginsModel.model(state);
    const callback = async () => {
      await model_instance.update(req.body);
      await plugins_model_instance.modifyPlugins(req.body);
    }
    await SharedFunctions.executeWithTransaction(state, callback);
    res.status(200).send({});
  } catch(err) {
    next(err);
  }
}

exports.persist = async function(req, res, next) {
  try {
    if(Util.isDateValid(req.body.last_update)) {
      let state = Util.initializeState(req);
      let model_instance = new TemplateModel.model(state);
      await model_instance.persist(req.params.uuid, new Date(req.body.last_update));
    } else {
      throw new Util.InputError(`last_update provided as parameter is not in valid date format: ${req.body.last_update}`);
    }
    res.status(200).send({});
  } catch(err) {
    next(err);
  }
}

exports.draft_delete = async function(req, res, next) {
  try {
    let uuid = req.params.uuid;
    let state = Util.initializeState(req);
    let template_model_instance = new TemplateModel.model(state);
    const callback = async () => {
      await template_model_instance.draftDelete(uuid);
      if( !(await SharedFunctions.latestPersisted(TemplateModel.collection(), uuid, state.session)) ) {
        await (new PermissionModel.model(state)).documentDeletePermissions(uuid);
      }
    }
    await SharedFunctions.executeWithTransaction(state, callback);
    res.status(200).send({});
  } catch(err) {
    return next(err);
  }
}

exports.get_last_update = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new TemplateModel.model(state);
    let last_update = await model_instance.lastUpdate(req.params.uuid);
    res.send(last_update);
  } catch(err) {
    return next(err);
  }
}

exports.draft_existing = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new TemplateModel.model(state);
    let exists = await model_instance.draftExisting(req.params.uuid);
    res.send(exists);
  } catch(err) {
    return next(err);
  }
}

exports.duplicate = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new TemplateModel.model(state);
    let new_uuid = await model_instance.duplicate(req.params.uuid);
    res.json({new_uuid});;
  } catch(err) {
    next(err);
  }
}