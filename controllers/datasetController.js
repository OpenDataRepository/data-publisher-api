const DatasetModel = require('../models/dataset');
const DatasetPublishModel = require('../models/datasetPublish');

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

exports.get_latest_persisted = async function(req, res, next) {
  try {
    let dataset = await DatasetModel.latestPersisted(req.params.uuid, req.cookies.user);
    res.json(dataset);
  } catch(err) {
    next(err);
  }
}

exports.get_persisted_before_timestamp = async function(req, res, next) {
  try {
    let dataset = await DatasetModel.persistedBeforeDate(req.params.uuid, new Date(req.params.timestamp), req.cookies.user);
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

exports.persist = async function(req, res, next) {
  try {
    if(Date.parse(req.body.last_update)) {
      await DatasetModel.persist(req.params.uuid, req.cookies.user, new Date(req.body.last_update));
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

exports.duplicate = async function(req, res, next) {
  try {
    let new_dataset = await DatasetModel.duplicate(req.params.uuid, req.cookies.user);
    res.json(new_dataset);
  } catch(err) {
    next(err);
  }
}

exports.new_dataset_for_template = async function(req, res, next) {
  try {
    let new_dataset = await DatasetModel.newDatasetForTemplate(req.params.uuid, req.cookies.user);
    res.json(new_dataset);
  } catch(err) {
    next(err);
  }
}

exports.publish = async function(req, res, next) {
  try {
    let name = req.body.name;
    if(!name || typeof(name) !== 'string') {
      throw new Util.InputError('Must provide a valid name for your published dataset version');
    }
    await DatasetPublishModel.publish(req.params.uuid, name, req.cookies.user);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.published = async function(req, res, next) {
  try {
    let name = req.params.name;
    if(!name || typeof(name) !== 'string') {
      throw new Util.InputError('Must provide a valid name for your published dataset version');
    }
    // Get timestamp of published
    let time = await DatasetPublishModel.publishedTimeForDatasetUUIDAndName(req.params.uuid, name);
    if(!time) {
      throw new Util.NotFoundError();
    }
    // Use timestamp to get latest persisted dataset
    let dataset = await DatasetModel.persistedBeforeDate(req.params.uuid, time, req.cookies.user);
    res.json(dataset);
  } catch(err) {
    next(err);
  }
}