const TemplateModel = require('../models/template');
const Util = require('../lib/util');

// TODO: write a middleware which tests that the user is authenticated. It should be used on all write endpoints
// TODO: even on the read endpoints, if req.user is null, we should send along null. req.user._id will throw an error

exports.draft_get = async function(req, res, next) {
  try {
    let template = await TemplateModel.draftGet(req.params.uuid, req.user._id);
    if(template) {
      res.json(template);
    } else {
      throw new Util.NotFoundError();
    }
  } catch(err) {
    next(err);
  }
}

exports.get_latest_persisted = async function(req, res, next) {
  try {
    let template = await TemplateModel.latestPersisted(req.params.uuid, req.user._id);
    if(template) {
      res.json(template);
    } else {
      throw new Util.NotFoundError();
    }
  } catch(err) {
    next(err);
  }
}

exports.get_persisted_before_timestamp = async function(req, res, next) {
  try {
    let template = await TemplateModel.persistedBeforeDate(req.params.uuid, new Date(req.params.timestamp), req.user._id);
    if(template) {
      res.json(template);
    } else {
      throw new Util.NotFoundError();
    }
  } catch(err) {
    next(err);
  }
}

exports.create = async function(req, res, next) {
  try {
    // TODO: when users are implemented, replace the cookie user with the session user
    // Also for all modification endpoints, verify that there is a logged-in user before continuing
    let inserted_uuid = await TemplateModel.create(req.body, req.user._id);
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
    await TemplateModel.update(req.body, req.user._id);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.persist = async function(req, res, next) {
  try {
    if(Date.parse(req.body.last_update)) {
      await TemplateModel.persist(req.params.uuid, req.user._id, new Date(req.body.last_update));
    } else {
      throw new Util.InputError(`last_update provided as parameter is not in valid date format: ${req.body.last_update}`);
    }
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.draft_delete = async function(req, res, next) {
  try {
    await TemplateModel.draftDelete(req.params.uuid, req.user._id);
  } catch(err) {
    return next(err);
  }
  res.sendStatus(200);
}

exports.get_last_update = async function(req, res, next) {
  var last_update;
  try {
    last_update = await TemplateModel.lastUpdate(req.params.uuid, req.user._id);
  } catch(err) {
    return next(err);
  }
  res.send(last_update);
}

exports.draft_existing = async function(req, res, next) {
  var exists;
  try {
    exists = await TemplateModel.draftExisting(req.params.uuid);
  } catch(err) {
    return next(err);
  }
  res.send(exists);
}

exports.duplicate = async function(req, res, next) {
  try {
    let new_uuid = await TemplateModel.duplicate(req.params.uuid, req.user._id);
    res.json({new_uuid});;
  } catch(err) {
    next(err);
  }
}