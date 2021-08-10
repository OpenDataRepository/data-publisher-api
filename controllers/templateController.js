const TemplateModel = require('../models/template');
const Util = require('../lib/util');

exports.draft_get = async function(req, res, next) {
  try {
    let template = await TemplateModel.templateDraftGetWithTransaction(req.params.uuid);
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
    let template = await TemplateModel.latestPublishedTemplate(req.params.uuid);
    res.json(template);
  } catch(err) {
    next(err);
  }
}

exports.get_published_before_timestamp = async function(req, res, next) {
  try {
    let template = await TemplateModel.publishedTemplateBeforeDate(req.params.uuid, new Date(req.params.timestamp));
    res.json(template);
  } catch(err) {
    next(err);
  }
}

exports.create = async function(req, res, next) {
  try {
    let inserted_uuid = await TemplateModel.templateCreateWithTransaction(req.body);
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
    await TemplateModel.templateUpdateWithTransaction(req.body);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.publish = async function(req, res, next) {
  try {
    await TemplateModel.templatePublishWithTransaction(req.params.uuid);
    await TemplateModel.templateUpdateTemplatesThatReferenceThis(req.params.uuid);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.draft_delete = async function(req, res, next) {
  try {
    await TemplateModel.templateDraftDelete(req.params.uuid);
  } catch(err) {
    next(err);
  }
  res.sendStatus(200);
}

exports.get_last_update = async function(req, res, next) {
  var last_update;
  try {
    last_update = await TemplateModel.templateLastUpdateWithTransaction(req.params.uuid);
  } catch(err) {
    next(err);
  }
  res.send(last_update);
}

exports.draft_existing = async function(req, res, next) {
  var exists;
  try {
    exists = await TemplateModel.templateDraftExisting(req.params.uuid);
  } catch(err) {
    next(err);
  }
  res.send(exists);
}