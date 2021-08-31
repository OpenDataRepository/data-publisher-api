const RecordModel = require('../models/record');
const Util = require('../lib/util');

exports.create = async function(req, res, next) {
  try {
    let inserted_uuid = await RecordModel.create(req.body);
    res.json({inserted_uuid});
  } catch(err) {
    next(err);
  }
}

exports.draft_get = async function(req, res, next) {
  try {
    let record = await RecordModel.draftGet(req.params.uuid);
    if(record) {
      res.json(record);
    } else {
      throw new Util.NotFoundError();
    }
  } catch(err) {
    next(err);
  }
}

exports.update = async function(req, res, next) {
  try {
    if(!Util.objectContainsUUID(req.body, req.params.uuid)) {
      throw new Util.InputError(`UUID provided and the body uuid do not match.`)
    }
    await RecordModel.update(req.body);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.draft_delete = async function(req, res, next) {
  try {
    await RecordModel.draftDelete(req.params.uuid);
  } catch(err) {
    return next(err);
  }
  res.sendStatus(200);
}

exports.publish = async function(req, res, next) {
  try {
    if(Date.parse(req.body.last_update)) {
      await RecordModel.publish(req.params.uuid, new Date(req.body.last_update));
    } else {
      throw new Util.InputError(`last_update provided as parameter is not in valid date format: ${req.body.last_update}`);
    }
    // TODO: after a record is published, if any records link to it, create drafts for them.
    // TODO: ask Nate about it
    // TODO: also ask if publishing a template should create new drafts of all records that use that template
    //await RecordModel.updateRecordsThatReference(req.params.uuid, 'template');
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.get_latest_published = async function(req, res, next) {
  try {
    let record = await RecordModel.latestPublished(req.params.uuid);
    res.json(record);
  } catch(err) {
    next(err);
  }
}

exports.get_published_before_timestamp = async function(req, res, next) {
  try {
    let record = await RecordModel.publishedBeforeDate(req.params.uuid, new Date(req.params.timestamp));
    res.json(record);
  } catch(err) {
    next(err);
  }
}

exports.get_last_update = async function(req, res, next) {
  var last_update;
  try {
    last_update = await RecordModel.lastUpdate(req.params.uuid);
  } catch(err) {
    return next(err);
  }
  res.send(last_update);
}

exports.draft_existing = async function(req, res, next) {
  var exists;
  try {
    exists = await RecordModel.draftExisting(req.params.uuid);
  } catch(err) {
    return next(err);
  }
  res.send(exists);
}