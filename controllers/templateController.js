const TemplateModel = require('../models/template');
const Util = require('../lib/util');

// TODOL: when users are implemented, remove all references to this with the current_user according to the session
// TODO: for now remove this and make it a request parameter everywhere instead
const CURR_USER = 'caleb';

exports.draft_get = async function(req, res, next) {
  try {
    let template = await TemplateModel.draftGet(req.params.uuid);
    if(template) {
      res.json(template);
    } else {
      throw new Util.NotFoundError();
    }
  } catch(err) {
    next(err);
  }
}

exports.get_latest_published = async function(req, res, next) {
  try {
    let template = await TemplateModel.latestPublished(req.params.uuid);
    res.json(template);
  } catch(err) {
    next(err);
  }
}

exports.get_published_before_timestamp = async function(req, res, next) {
  try {
    let template = await TemplateModel.publishedBeforeDate(req.params.uuid, new Date(req.params.timestamp));
    res.json(template);
  } catch(err) {
    next(err);
  }
}

exports.create = async function(req, res, next) {
  try {
    let inserted_uuid = await TemplateModel.create(req.body, CURR_USER);
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
    await TemplateModel.update(req.body);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.publish = async function(req, res, next) {
  try {
    if(Date.parse(req.body.last_update)) {
      await TemplateModel.publish(req.params.uuid, new Date(req.body.last_update));
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
    await TemplateModel.draftDelete(req.params.uuid);
  } catch(err) {
    return next(err);
  }
  res.sendStatus(200);
}

exports.get_last_update = async function(req, res, next) {
  var last_update;
  try {
    last_update = await TemplateModel.lastUpdate(req.params.uuid);
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