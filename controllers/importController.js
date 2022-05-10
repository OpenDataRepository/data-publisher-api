const { InputError } = require('../lib/util');
const TemplateModel = require('../models/template');
const DatasetModel = require('../models/dataset');
const RecordModel = require('../models/record');
const SharedFunctions = require('../models/shared_functions');


exports.template = async function(req, res, next) {
  try {
    let new_uuid = await TemplateModel.importTemplate(req.body, req.user._id);
    res.send({new_uuid});
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
    let record_uuids = await RecordModel.importDatasetsAndRecords(data.records, req.user._id);
    res.send({record_uuids});
  } catch(err) {
    next(err);
  }
}


exports.template_with_dataset = async function(req, res, next) {
  try {
    let template_uuid, dataset_uuid;
    let import_template = req.body;
    let user = req.user._id;
    let callback = async (session) => {
      template_uuid = await TemplateModel.importTemplate(import_template, user, session);
      let last_update = await TemplateModel.lastUpdate(template_uuid, user, session);
      await TemplateModel.persist(template_uuid, user, last_update, session);
      dataset_uuid = await DatasetModel.importDatasetForTemplate(import_template, user, session);
    };
    await SharedFunctions.executeWithTransaction(callback);

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
    let record_uuids = await RecordModel.importRecords(data.records, req.user._id);
    res.send({record_uuids});
  } catch(err) {
    next(err);
  }
}
