const DatasetModel = require('../models/dataset');
const DatasetPublishModel = require('../models/datasetPublish');
const RecordModel = require('../models/record');
import * as Util from '../lib/util';
import { DocumentControllerInterface } from './docmentControllerInterface';
const ElasticsearchModel = require ('../models/elasticsearch');

class DatasetController implements DocumentControllerInterface {

  async create(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new DatasetModel.model(state);
      let inserted_uuid = await model_instance.create(req.body);
      res.redirect(303, `/dataset/${inserted_uuid}/draft`);
    } catch(err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const uuid = req.params.uuid;
      if(!Util.objectContainsUUID(req.body, uuid)) {
        throw new Util.InputError(`UUID provided and the body uuid do not match.`)
      }
      let state = Util.initializeState(req);
      let model_instance = new DatasetModel.model(state);
      await model_instance.update(req.body);
      if(await model_instance.draftExisting(uuid)) {
        res.redirect(303, `/dataset/${uuid}/draft`)
      } else {
        res.redirect(303, `/dataset/${uuid}/latest_persisted`)
      }
    } catch(err) {
      next(err);
    }
  }

  async draft(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new DatasetModel.model(state);
      let dataset = await model_instance.draftGet(req.params.uuid, false);
      if(!dataset) {
        throw new Util.NotFoundError();
      }
      res.json(dataset);
    } catch(err) {
      next(err);
    }
  }

  async deleteDraft(req, res, next) {
    try {
      let uuid = req.params.uuid;
      let state = Util.initializeState(req);
      let model_instance = new DatasetModel.model(state);
      await model_instance.draftDelete(uuid);
  
    } catch(err) {
      return next(err);
    }
    res.status(200).send({});
  }

  async lastUpdate(req, res, next) {
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    try {
      let last_update = await model_instance.lastUpdate(req.params.uuid);
      res.send(last_update);
    } catch(err) {
      return next(err);
    }
  }

  async persist(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new DatasetModel.model(state);
      if(Util.isDateValid(req.body.last_update)) {
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
      let model_instance = new DatasetModel.model(state);
      let dataset = await model_instance.latestPersisted(req.params.uuid, false);
      if(!dataset) {
        throw new Util.NotFoundError();
      }
      res.json(dataset);
    } catch(err) {
      next(err);
    }
  }

  async persistedBeforeTimestamp(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new DatasetModel.model(state);
      let dataset = await model_instance.latestPersistedBeforeTimestamp(req.params.uuid, new Date(req.params.timestamp));
      if(!dataset) {
        throw new Util.NotFoundError();
      }
      res.json(dataset);
    } catch(err) {
      next(err);
    }
  }

  async draftExisting(req, res, next) {
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    try {
      let exists = await model_instance.draftExisting(req.params.uuid);
      res.send(exists);
    } catch(err) {
      return next(err);
    }
  }
  
  

  async persistedVersion(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new DatasetModel.model(state);
      let dataset = await model_instance.persistedVersion(Util.convertToMongoId(req.params.id));
      if(!dataset) {
        throw new Util.NotFoundError();
      }
      res.json(dataset);
    } catch(err) {
      next(err);
    }
  }
  
  async duplicate(req, res, next) {
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    try {
      let new_dataset = await model_instance.duplicate(req.params.uuid);
      res.json(new_dataset);
    } catch(err) {
      next(err);
    }
  }

  // TODO: change this to work for a specific version of the template
  async newDatasetForTemplate(req, res, next) {
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    try {
      let new_dataset = await model_instance.newDatasetForTemplate(req.params.uuid);
      res.json(new_dataset);
    } catch(err) {
      next(err);
    }
  }

  async records(req, res, next) {
    try {
      let dataset_uuid = req.params.uuid;
  
      let state = Util.initializeState(req);
  
      if(!(await (new DatasetModel.model(state)).hasViewPermissionToPersisted(dataset_uuid))) {
        throw new Util.PermissionDeniedError();
      }
  
      let record_model_instance = new RecordModel.model(state);
      let shallow_records_in_dataset = await record_model_instance.latestShallowRecordsForDataset(dataset_uuid);
      res.send(shallow_records_in_dataset);
    } catch(err) {
      next(err);
    }
  }

  async publish(req, res, next) {
    try {
      let name = req.body.name;
      if(!name || typeof(name) !== 'string') {
        throw new Util.InputError('Must provide a valid name for your published dataset version');
      }
      let uuid = req.params.uuid;
      await DatasetPublishModel.publish(uuid, name, req.user._id);
  
      let final_record_list: any = await published_records(uuid, name, req);
  
      await ElasticsearchModel.createPublishedDatasetIndex(uuid, name, final_record_list);
  
      res.sendStatus(200);
    } catch(err) {
      next(err);
    }
  }

  async published(req, res, next) {
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
      let dataset = await dataset_model_instance.latestPersistedBeforeTimestamp(req.params.uuid, time);
      res.json(dataset);
    } catch(err) {
      next(err);
    }
  }

  async publishedRecords(req, res, next) {
    try {
      let dataset_uuid = req.params.uuid;
      let name = req.params.name;
  
      let final_record_list = await published_records(dataset_uuid, name, req);
      res.send(final_record_list);
    } catch(err) {
      next(err);
    }
  }
  
  // TODO: there are a couple problems here that need to be fixed
  // 1. Elastic search is smart enough to parse types, so if the user enters in invalid types, problem
  // 2. Elastic search doesn't handle permissions at all. I have to do that myself
  // 3. Test this endpoint. Won't be as simple
  // 4. Set up different elasticsearch endpoing for testing
  async searchPublishedRecords(req, res, next) {
    try {
      let records = await ElasticsearchModel.searchPublishedDatasetIndex(req.params.uuid, req.params.name, req.query);
      res.send(records);
    } catch(err) {
      next(err);
    }
  }

  async allPublicUuids(req, res, next) {
    try {
      let public_uuids = await new DatasetModel.model({}).allPublicPersistedUuids();
      res.send(public_uuids);
    } catch(err) {
      next(err);
    }
  }

  async allViewableUuids(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new DatasetModel.model(state);
      let viewable_uuids = await model_instance.allViewableUuids();
      res.send(viewable_uuids);
    } catch(err) {
      next(err);
    }
  }

  async allPublicDatasets(req, res, next) {
    try {
      let datasets = await new DatasetModel.model({}).latestPublicDocuments();
      res.send(datasets);
    } catch(err) {
      next(err);
    }
  }

}

const published_records = async function(dataset_uuid, name, req) {
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
  let final_record_list: any[] = [];
  for(let record_uuid of record_uuids_in_dataset) {
    let record = await record_model_instance.latestPersistedBeforeTimestamp(record_uuid, time);
    if(record) {
      final_record_list.push(record);
    }
  }
  return final_record_list;
}

const datasetController = new DatasetController();

export {datasetController};
