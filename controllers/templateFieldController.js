const TemplateFieldModel = require('../models/template_field');
const TemplateModel = require('../models/template');
const Util = require('../lib/util');

exports.draft_get = async function(req, res, next) {
  try {
    let template_field = await TemplateFieldModel.draftGet(req.params.uuid);
    if(template_field) {
      res.json(template_field);
    } else {
      throw new Util.NotFoundError();
    }
  } catch(err) {
    next(err);
  }
}

exports.get_latest_published = async function(req, res, next) {
  try {
    let template_field = await TemplateFieldModel.latestPublished(req.params.uuid);
    res.json(template_field);
  } catch(err) {
    next(err);
  }
}

exports.get_published_before_timestamp = async function(req, res, next) {
  try {
    let template_field = await TemplateFieldModel.publishedBeforeDate(req.params.uuid, new Date(req.params.timestamp));
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
    let inserted_uuid = await TemplateFieldModel.create(req.body);
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
    await TemplateFieldModel.update(req.body);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.publish = async function(req, res, next) {
  try {
    if(Date.parse(req.body.last_update)) {
      await TemplateFieldModel.publish(req.params.uuid, new Date(req.body.last_update));
    } else {
      throw new Util.InputError(`last_update provided as parameter is not in valid date format: ${req.body.last_update}`);
    }
    await TemplateModel.updateTemplatesThatReference(req.params.uuid, "template_field");
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.draft_delete = async function(req, res, next) {
  try {
    await TemplateFieldModel.draftDelete(req.params.uuid);
  } catch(err) {
    return next(err);
  }
  res.sendStatus(200);
}

exports.get_last_update = async function(req, res, next) {
  var last_update;
  try {
    last_update = await TemplateFieldModel.lastUpdate(req.params.uuid);
  } catch(err) {
    return next(err);
  }
  res.send(last_update);
}