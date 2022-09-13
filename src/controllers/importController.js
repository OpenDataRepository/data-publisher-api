const { InputError } = require('../lib/util');
const TemplateModel = require('../models/template');
const DatasetModel = require('../models/dataset');
const RecordModel = require('../models/record');
const SharedFunctions = require('../models/shared_functions');
const Util = require('../lib/util');


exports.template = async function(req, res, next) {
  try {
    let state = Util.initializeState(req);
    let new_uuid = await (new TemplateModel.model(state)).importTemplate(req.body);
    res.redirect(307, `/template/${new_uuid}/draft`)
  } catch(err) {
    next(err);
  }
}

exports.datasets_and_records = async function(req, res, next) {
  try {
    let data = req.body;
    if(!data || !data.records) {
      throw new InputError(`Must submit an object with property records`)
    }
    let state = Util.initializeState(req);
    let record_uuids = await (new RecordModel.model(state)).importDatasetsAndRecords(data.records);
    res.send({record_uuids});
  } catch(err) {
    next(err);
  }
}


exports.template_with_dataset = async function(req, res, next) {
  try {
    let template_uuid, dataset_uuid;
    let import_template = req.body;
    let state = Util.initializeState(req);
    let template_model_instance = new TemplateModel.model(state);
    let dataset_model_instance = new DatasetModel.model(state);
    let callback = async () => {
      template_uuid = await template_model_instance.importTemplate(import_template);
      let last_update = await template_model_instance.lastUpdate(template_uuid);
      await template_model_instance.persist(template_uuid, last_update);
      dataset_uuid = await dataset_model_instance.importDatasetForTemplate(import_template);
    };
    await SharedFunctions.executeWithTransaction(state, callback);

    res.send({template_uuid, dataset_uuid});
  } catch(err) {
    next(err);
  }
}

exports.records = async function(req, res, next) {
  try {
    let data = req.body;
    if(!data || !data.records) {
      throw new InputError(`Must submit an object with property records`)
    }
    let state = Util.initializeState(req);
    let record_uuids = await (new RecordModel.model(state)).importRecords(data.records);
    res.send({record_uuids});
  } catch(err) {
    next(err);
  }
}
