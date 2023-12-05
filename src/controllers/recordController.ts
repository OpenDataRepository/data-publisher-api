const RecordModel = require('../models/record');
import * as Util from '../lib/util';
import { DocumentControllerInterface } from './docmentControllerInterface';

class RecordController implements DocumentControllerInterface {

  async create(req, res, next) {
    try {
      let state = Util.initializeState(req);
      state.upload_file_uuids = {};
      let model_instance = new RecordModel.model(state);
      let inserted_uuid = await model_instance.create(req.body);
      let upload_file_uuids = state.upload_file_uuids;
  
      state = Util.initializeState(req);
      model_instance = new RecordModel.model(state);
      let record = await model_instance.draftGet(inserted_uuid, false);
      res.json({record, upload_file_uuids: upload_file_uuids});
    } catch(err) {
      next(err);
    }
  }

  async update(req, res, next) {
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
      let record = await model_instance.draftGet(req.params.uuid, false);
      if(!record) {
        record = await model_instance.latestPersisted(req.params.uuid);
      }
      res.json({record, upload_file_uuids: upload_file_uuids});
    } catch(err) {
      next(err);
    }
  }

  async draft(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new RecordModel.model(state);
      let record = await model_instance.draftGet(req.params.uuid, false);
      if(!record) {
        throw new Util.NotFoundError();
      }
      res.json(record);
    } catch(err) {
      next(err);
    }
  }
  
  async deleteDraft(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new RecordModel.model(state);
      await model_instance.draftDelete(req.params.uuid);
    } catch(err) {
      return next(err);
    }
    res.status(200).send({});
  }
  
  async lastUpdate(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new RecordModel.model(state);
      let last_update = await model_instance.lastUpdate(req.params.uuid);
      res.send(last_update);
    } catch(err) {
      return next(err);
    }
  }

  async persist(req, res, next) {
    try {
      if(Util.isDateValid(req.body.last_update)) {
        let state = Util.initializeState(req);
        let model_instance = new RecordModel.model(state);
        await model_instance.persist(req.params.uuid, new Date(req.body.last_update));
      } else {
        throw new Util.InputError(`last_update provided as parameter is not in valid date format: ${req.body.last_update}`);
      }
      res.status(200).send({});
    } catch(err) {
      next(err);
    }
  }
  
  async latestPersisted(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new RecordModel.model(state);
      let record = await model_instance.latestPersisted(req.params.uuid);
      if(!record) {
        throw new Util.NotFoundError();
      }
      res.json(record);
    } catch(err) {
      next(err);
    }
  }

  async persistedBeforeTimestamp(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new RecordModel.model(state);
      let record = await model_instance.persistedBeforeDate(req.params.uuid, new Date(req.params.timestamp));
      if(!record) {
        throw new Util.NotFoundError();
      }
      res.json(record);
    } catch(err) {
      next(err);
    }
  }

  async draftExisting(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new RecordModel.model(state);
      let exists = await model_instance.draftExisting(req.params.uuid);
      res.send(exists);
    } catch(err) {
      return next(err);
    }
  }



  async newDraftFromLatestPersisted(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new RecordModel.model(state);
      let record = await model_instance.draftGet(req.params.uuid, true);
      if(record) {
        res.json(record);
      } else {
        throw new Util.NotFoundError();
      }
    } catch(err) {
      next(err);
    }
  }

}

const recordController = new RecordController();

export {recordController};

