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
  // TODO: Implement
}

exports.publish = async function(req, res, next) {
  // TODO: Implement
}

exports.get_latest_published = async function(req, res, next) {
  // TODO: Implement
}

exports.get_published_before_timestamp = async function(req, res, next) {
  // TODO: Implement
}