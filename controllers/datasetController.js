const DatasetModel = require('../models/dataset');
const DatasetPublishModel = require('../models/datasetPublish');
const RecordModel = require('../models/record');
const UserPermissionsModel = require('../models/user_permissions');
var { PermissionTypes } = require('../models/permission_group');
const PermissionGroupController = require('./permissionGroupController');
const SharedFunctions = require('../models/shared_functions');

const Util = require('../lib/util');

exports.draft_get = async function(req, res, next) {
  try {
    let dataset = await DatasetModel.draftGet(req.params.uuid, req.user._id);
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
    let user_id = req.user ? req.user._id  : null;
    let dataset = await DatasetModel.latestPersisted(req.params.uuid, user_id);
    if(dataset) {
      res.json(dataset);
    } else {
      throw new Util.NotFoundError();
    }
  } catch(err) {
    next(err);
  }
}

exports.get_persisted_before_timestamp = async function(req, res, next) {
  try {
    let user_id = req.user ? req.user._id  : null;
    let dataset = await DatasetModel.persistedBeforeDate(req.params.uuid, new Date(req.params.timestamp), user_id);
    if(dataset) {
      res.json(dataset);
    } else {
      throw new Util.NotFoundError();
    }
  } catch(err) {
    next(err);
  }
}

exports.create = async function(req, res, next) {
  try {
    let inserted_uuid = await DatasetModel.create(req.body, req.user._id);
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
    await DatasetModel.update(req.body, req.user._id);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.persist = async function(req, res, next) {
  try {
    if(Date.parse(req.body.last_update)) {
      await DatasetModel.persist(req.params.uuid, req.user._id, new Date(req.body.last_update));
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
    let uuid = req.params.uuid;
    const callback = async (session) => {
      await DatasetModel.draftDelete(uuid, req.user._id, session);
      if( !(await SharedFunctions.latestPersisted(DatasetModel.collection(), uuid, session)) ) {
        await PermissionGroupController.delete(uuid, SharedFunctions.DocumentTypes.Dataset, session);
      }
    }
    await SharedFunctions.executeWithTransaction(callback);

  } catch(err) {
    return next(err);
  }
  res.sendStatus(200);
}

exports.get_last_update = async function(req, res, next) {
  var last_update;
  try {
    last_update = await DatasetModel.lastUpdate(req.params.uuid, req.user._id);
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
    let new_dataset = await DatasetModel.duplicate(req.params.uuid, req.user._id);
    res.json(new_dataset);
  } catch(err) {
    next(err);
  }
}

exports.new_dataset_for_template = async function(req, res, next) {
  try {
    let new_dataset = await DatasetModel.newDatasetForTemplate(req.params.uuid, req.user._id);
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
    await DatasetPublishModel.publish(req.params.uuid, name, req.user._id);
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
    let user_id = req.user ? req.user._id  : null;
    let dataset = await DatasetModel.persistedBeforeDate(req.params.uuid, time, user_id);
    res.json(dataset);
  } catch(err) {
    next(err);
  }
}

exports.published_records = async function(req, res, next) {
  try {
    let dataset_uuid = req.params.uuid;
    let name = req.params.name;
    let user_id = req.user ? req.user._id  : null;

    if(!(await UserPermissionsModel.has_permission(user_id, dataset_uuid, PermissionTypes.view))) {
      throw new Util.PermissionDeniedError();
    }

    if(!name || typeof(name) !== 'string') {
      throw new Util.InputError('Must provide a valid name for your published dataset version');
    }

    // Get timestamp of published
    let time = await DatasetPublishModel.publishedTimeForDatasetUUIDAndName(dataset_uuid, name);
    if(!time) {
      throw new Util.NotFoundError();
    }

    // Strategy: First get the list of all unique record uuids in the dataset, then, for each one, the the latest published by timestamp
    // At some point, when we need to scale, change the above to be in a singe db call. This will definitely be much harder to write, but also much faster

    let record_uuids_in_dataset = await RecordModel.uniqueUuidsInDataset(dataset_uuid)
    let final_record_list = [];
    for(let record_uuid of record_uuids_in_dataset) {
      let record = await RecordModel.persistedBeforeDate(record_uuid, time, user_id);
      if(record) {
        final_record_list.push(record);
      }
    }
    res.send(final_record_list);
  } catch(err) {
    next(err);
  }
}