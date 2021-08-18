const RecordModel = require('../models/record');
const Util = require('../lib/util');

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

exports.get_latest_published = async function(req, res, next) {
  // TODO: Implement
}

exports.get_published_before_timestamp = async function(req, res, next) {
  // TODO: Implement
}

exports.create = async function(req, res, next) {
  try {
    let inserted_uuid = await RecordModel.create(req.body);
    res.json({inserted_uuid});
  } catch(err) {
    next(err);
  }
}

exports.update = async function(req, res, next) {
  // TODO: Implement
}

exports.publish = async function(req, res, next) {
  // TODO: Implement
}

exports.draft_delete = async function(req, res, next) {
  // TODO: Implement
}