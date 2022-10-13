const DatasetModel = require('../models/dataset');
const DatasetPublishModel = require('../models/datasetPublish');
const RecordModel = require('../models/record');
const { PermissionTypes, model: PermissionModel } = require('../models/permission');
const SharedFunctions = require('../models/shared_functions');
const Util = require('../lib/util');

exports.draft_get = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    let dataset = await model_instance.draftGet(req.params.uuid);
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
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    let dataset = await model_instance.latestPersisted(req.params.uuid);
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
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    let dataset = await model_instance.persistedBeforeDate(req.params.uuid, new Date(req.params.timestamp));
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
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    let inserted_uuid = await model_instance.create(req.body);
    res.redirect(307, `/dataset/${inserted_uuid}/draft`)
  } catch(err) {
    next(err);
  }
}

exports.update = async function(req, res, next) {
  try {
    if(!Util.objectContainsUUID(req.body, req.params.uuid)) {
      throw new Util.InputError(`UUID provided and the body uuid do not match.`)
    }
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    await model_instance.update(req.body);
    res.redirect(307, `/dataset/${req.params.uuid}/draft`)
  } catch(err) {
    next(err);
  }
}

exports.persist = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    if(Util.isDateValid(req.body.last_update)) {
      await model_instance.persist(req.params.uuid, new Date(req.body.last_update));
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
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    const callback = async () => {
      await model_instance.draftDelete(uuid);
      if( !(await SharedFunctions.latestPersisted(DatasetModel.collection(), uuid, state.session)) ) {
        await (new PermissionModel(state)).documentDeletePermissions(uuid);
      }
    }
    await SharedFunctions.executeWithTransaction(state, callback);

  } catch(err) {
    return next(err);
  }
  res.sendStatus(200);
}

exports.get_last_update = async function(req, res, next) {
  let state = Util.initializeState(req);
  let model_instance = new DatasetModel.model(state);
  try {
    let last_update = await model_instance.lastUpdate(req.params.uuid);
    res.send(last_update);
  } catch(err) {
    return next(err);
  }
}

exports.draft_existing = async function(req, res, next) {
  let state = Util.initializeState(req);
  let model_instance = new DatasetModel.model(state);
  try {
    let exists = await model_instance.draftExisting(req.params.uuid);
    res.send(exists);
  } catch(err) {
    return next(err);
  }
}

exports.duplicate = async function(req, res, next) {
  let state = Util.initializeState(req);
  let model_instance = new DatasetModel.model(state);
  try {
    let new_dataset = await model_instance.duplicate(req.params.uuid);
    res.json(new_dataset);
  } catch(err) {
    next(err);
  }
}

exports.new_dataset_for_template = async function(req, res, next) {
  let state = Util.initializeState(req);
  let model_instance = new DatasetModel.model(state);
  try {
    let new_dataset = await model_instance.newDatasetForTemplate(req.params.uuid);
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
  let state = Util.initializeState(req);
  let dataset_model_instance = new DatasetModel.model(state);

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
    let dataset = await dataset_model_instance.persistedBeforeDate(req.params.uuid, time);
    res.json(dataset);
  } catch(err) {
    next(err);
  }
}

exports.published_records = async function(req, res, next) {
  try {
    let dataset_uuid = req.params.uuid;
    let name = req.params.name;
    let state = Util.initializeState(req);

    if(!(await (new DatasetModel.model(state)).hasViewPermissionToPersisted(dataset_uuid))) {
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

    let record_model_instance = new RecordModel.model(state);
    let record_uuids_in_dataset = await record_model_instance.uniqueUuidsInDataset(dataset_uuid)
    let final_record_list = [];
    for(let record_uuid of record_uuids_in_dataset) {
      let record = await record_model_instance.persistedBeforeDate(record_uuid, time);
      if(record) {
        final_record_list.push(record);
      }
    }
    res.send(final_record_list);
  } catch(err) {
    next(err);
  }
}

// TODO: this and the below export should probably return actual datasets and not just uuids
exports.all_public_uuids = async function(req, res, next) {
  try {
    let public_uuids = await DatasetModel.model.allPublicUuids();
    res.send(public_uuids);
  } catch(err) {
    next(err);
  }
}

exports.all_viewable_uuids = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    let viewable_uuids = await model_instance.allViewableUuids();
    res.send(viewable_uuids);
  } catch(err) {
    next(err);
  }
}