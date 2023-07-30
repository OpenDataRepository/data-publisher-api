const DatasetModel = require('../models/dataset');
const DatasetPublishModel = require('../models/datasetPublish');
const RecordModel = require('../models/record');
import { model as PermissionModel } from '../models/permission';
const SharedFunctions = require('../models/shared_functions');
import * as Util from '../lib/util';
const ElasticsearchModel = require ('../models/elasticsearch');
const PluginsModel = require('../models/plugins');

exports.draft_get = async function(req, res, next) {
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

exports.get_latest_persisted = async function(req, res, next) {
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

exports.get_persisted_before_timestamp = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    let dataset = await model_instance.persistedBeforeDate(req.params.uuid, new Date(req.params.timestamp));
    if(!dataset) {
      throw new Util.NotFoundError();
    }
    res.json(dataset);
  } catch(err) {
    next(err);
  }
}

exports.create = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    let inserted_uuid;
    const callback = async () => {
      inserted_uuid = await model_instance.create(req.body);
    }
    await SharedFunctions.executeWithTransaction(state, callback);
    res.redirect(303, `/dataset/${inserted_uuid}/draft`);
  } catch(err) {
    next(err);
  }
}

exports.update = async function(req, res, next) {
  try {
    const uuid = req.params.uuid;
    if(!Util.objectContainsUUID(req.body, uuid)) {
      throw new Util.InputError(`UUID provided and the body uuid do not match.`)
    }
    let state = Util.initializeState(req);
    let model_instance = new DatasetModel.model(state);
    const callback = async () => {
      await model_instance.update(req.body);
    }
    await SharedFunctions.executeWithTransaction(state, callback);
    if(await model_instance.draftExisting(uuid)) {
      res.redirect(303, `/dataset/${uuid}/draft`)
    } else {
      res.redirect(303, `/dataset/${uuid}/latest_persisted`)
    }
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
    res.status(200).send({});
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
  res.status(200).send({});
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

// TODO: change this to work for a specific version of the template
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

exports.records = async function(req, res, next) {
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

exports.publish = async function(req, res, next) {
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
    let record = await record_model_instance.persistedBeforeDate(record_uuid, time);
    if(record) {
      final_record_list.push(record);
    }
  }
  return final_record_list;
}

exports.published_records = async function(req, res, next) {
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
exports.search_published_records = async function(req, res, next) {
  try {
    let records = await ElasticsearchModel.searchPublishedDatasetIndex(req.params.uuid, req.params.name, req.query);
    res.send(records);
  } catch(err) {
    next(err);
  }
}

exports.all_public_uuids = async function(req, res, next) {
  try {
    let public_uuids = await SharedFunctions.allPublicPersistedUuids(DatasetModel.collection());
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

exports.all_public_datasets = async function(req, res, next) {
  try {
    let datasets = await SharedFunctions.latestPublicDocuments(DatasetModel.collection());
    res.send(datasets);
  } catch(err) {
    next(err);
  }
}