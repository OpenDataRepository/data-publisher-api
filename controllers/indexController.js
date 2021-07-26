const TemplateModel = require('../models/template');
const MongoDB = require('../lib/mongoDB');
const Util = require('../lib/util');

exports.template_draft_get = async function(req, res, next) {
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

exports.template_get_latest_published = async function(req, res, next) {
  try {
    let template = await TemplateModel.latestPublishedTemplate(req.params.uuid);
    res.json(template);
  } catch(err) {
    next(err);
  }
}

exports.template_get_published_before_timestamp = async function(req, res, next) {
  try {
    let template = await TemplateModel.publishedTemplateBeforeDate(req.params.uuid, new Date(req.params.timestamp));
    res.json(template);
  } catch(err) {
    next(err);
  }
}

exports.template_create = async function(req, res, next) {
  try {
    let inserted_uuid = await TemplateModel.templateCreateWithTransaction(req.body);
    res.json({inserted_uuid});
  } catch(err) {
    next(err);
  }
}

exports.template_update = async function(req, res, next) {
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

// TODO: Publish should also take a timestamp of when the latest save to any portion of the template was,
// and this pubish function should recursively find the latest update and compare the sumbitted timestamp for equality

// TODO: write an endpoint which will get the latest updated timestamp from a template and it's sub-properties

// TODO: After publishing, create new drafts of every template that embeds this one. Eventually this will need to be kicked off into a queue.
exports.template_publish = async function(req, res, next) {
  try {
    await TemplateModel.templatePublishWithTransaction(req.params.uuid);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.template_draft_delete = async function(req, res, next) {
  try {
    await TemplateModel.templateDraftDelete(req.params.uuid);
  } catch(err) {
    next(err);
  }
  res.sendStatus(200);
}

exports.template_get_last_update = async function(req, res, next) {
  var last_update;
  try {
    last_update = await TemplateModel.templateLastUpdateWithTransaction(req.params.uuid);
  } catch(err) {
    next(err);
  }
  res.send(last_update);
}