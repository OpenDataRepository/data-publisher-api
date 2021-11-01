const DatasetModel = require('../models/dataset');
const Util = require('../lib/util');

exports.draft_get = async function(req, res, next) {
  try {
    let dataset = await DatasetModel.draftGet(req.params.uuid, req.cookies.user);
    if(dataset) {
      res.json(dataset);
    } else {
      throw new Util.NotFoundError();
    }
  } catch(err) {
    next(err);
  }
}

exports.get_latest_published = async function(req, res, next) {
  try {
    let dataset = await DatasetModel.latestPublished(req.params.uuid, req.cookies.user);
    res.json(dataset);
  } catch(err) {
    next(err);
  }
}

exports.get_published_before_timestamp = async function(req, res, next) {
  try {
    let dataset = await DatasetModel.publishedBeforeDate(req.params.uuid, new Date(req.params.timestamp), req.cookies.user);
    res.json(dataset);
  } catch(err) {
    next(err);
  }
}

exports.create = async function(req, res, next) {
  try {
    // TODO: when users are implemented, replace the cookie user with the session user
    // Also for all modification endpoints, verify that there is a logged-in user before continuing
    let inserted_uuid = await DatasetModel.create(req.body, req.cookies.user);
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
    await DatasetModel.update(req.body, req.cookies.user);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.publish = async function(req, res, next) {
  try {
    if(Date.parse(req.body.last_update)) {
      await DatasetModel.publish(req.params.uuid, req.cookies.user, new Date(req.body.last_update));
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
    await DatasetModel.draftDelete(req.params.uuid, req.cookies.user);
  } catch(err) {
    return next(err);
  }
  res.sendStatus(200);
}

exports.get_last_update = async function(req, res, next) {
  var last_update;
  try {
    last_update = await DatasetModel.lastUpdate(req.params.uuid, req.cookies.user);
  } catch(err) {
    return next(err);
  }
  res.send(last_update);
}

exports.draft_existing = async function(req, res, next) {
  var exists;
  try {
    exists = await DatasetModel.draftExisting(req.params.uuid);
  } catch(err) {
    return next(err);
  }
  res.send(exists);
}
