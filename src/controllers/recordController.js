const RecordModel = require('../models/record');
const Util = require('../lib/util');

// exports.new_record_for_dataset = async function(req, res, next) {
//   let state = Util.initializeState(req);
//   let model_instance = new RecordModel.model(state);
//   try {
//     let new_record = await model_instance.newRecordForDataset(req.params.uuid);
//     res.json(new_record);
//   } catch(err) {
//     next(err);
//   }
// }

exports.create = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    state.upload_file_uuids = {};
    let model_instance = new RecordModel.model(state);
    let inserted_uuid = await model_instance.create(req.body);
    let upload_file_uuids = state.upload_file_uuids;

    state = Util.initializeState(req);
    model_instance = new RecordModel.model(state);
    let record = await model_instance.draftGet(inserted_uuid);
    res.json({record, upload_file_uuids: upload_file_uuids});
  } catch(err) {
    next(err);
  }
}

exports.draft_get = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new RecordModel.model(state);
    let record = await model_instance.draftGet(req.params.uuid);
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
    let state = Util.initializeState(req);
    state.upload_file_uuids = {};
    let model_instance = new RecordModel.model(state);
    await model_instance.update(req.body);
    let upload_file_uuids = state.upload_file_uuids;

    state = Util.initializeState(req);
    model_instance = new RecordModel.model(state);
    let record = await model_instance.draftGet(req.params.uuid);
    res.json({record, upload_file_uuids: upload_file_uuids});
  } catch(err) {
    next(err);
  }
}

exports.draft_delete = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new RecordModel.model(state);
    await model_instance.draftDelete(req.params.uuid);
  } catch(err) {
    return next(err);
  }
  res.status(200).send({});
}

exports.persist = async function(req, res, next) {
  try {
    if(Util.isDateValid(req.body.last_update)) {
      let state = Util.initializeState(req);
      let model_instance = new RecordModel.model(state);
      await model_instance.persist(req.params.uuid, new Date(req.body.last_update));
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
    let state = Util.initializeState(req);
    let model_instance = new RecordModel.model(state);
    let record = await model_instance.latestPersisted(req.params.uuid);
    if(record) {
      res.json(record);
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
    let model_instance = new RecordModel.model(state);
    let record = await model_instance.persistedBeforeDate(req.params.uuid, new Date(req.params.timestamp));
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
  try {
    let state = Util.initializeState(req);
    let model_instance = new RecordModel.model(state);
    let last_update = await model_instance.lastUpdate(req.params.uuid);
    res.send(last_update);
  } catch(err) {
    return next(err);
  }
}

exports.draft_existing = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new RecordModel.model(state);
    let exists = await model_instance.draftExisting(req.params.uuid);
    res.send(exists);
  } catch(err) {
    return next(err);
  }
}