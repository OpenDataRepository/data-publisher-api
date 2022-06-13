const RecordModel = require('../models/record');
const Util = require('../lib/util');

exports.create = async function(req, res, next) {
  try {
    let inserted_uuid = await RecordModel.create(req.body, req.user._id);
    res.json({inserted_uuid});
  } catch(err) {
    next(err);
  }
}

exports.draft_get = async function(req, res, next) {
  try {
    let record = await RecordModel.draftGet(req.params.uuid, req.user._id);
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
    await RecordModel.update(req.body, req.user._id);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.draft_delete = async function(req, res, next) {
  try {
    await RecordModel.draftDelete(req.params.uuid, req.user._id);
  } catch(err) {
    return next(err);
  }
  res.sendStatus(200);
}

exports.persist = async function(req, res, next) {
  try {
    if(Date.parse(req.body.last_update)) {
      await RecordModel.persist(req.params.uuid, new Date(req.body.last_update), req.user._id);
    } else {
      throw new Util.InputError(`last_update provided as parameter is not in valid date format: ${req.body.last_update}`);
    }
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.get_latest_persisted = async function(req, res, next) {
  try {
    let user_id = req.user ? req.user._id  : null;
    let record = await RecordModel.latestPersisted(req.params.uuid, user_id);
    res.json(record);
  } catch(err) {
    next(err);
  }
}

exports.get_persisted_before_timestamp = async function(req, res, next) {
  try {
    let user_id = req.user ? req.user._id  : null;
    let record = await RecordModel.persistedBeforeDate(req.params.uuid, new Date(req.params.timestamp), user_id);
    if(record) {
      res.json(record);
    } else {
      throw new Util.NotFoundError();
    }
  } catch(err) {
    next(err);
  }
}

exports.get_last_update = async function(req, res, next) {
  var last_update;
  try {
    last_update = await RecordModel.lastUpdate(req.params.uuid, req.user._id);
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