const { InputError } = require('../lib/util');
const TemplateModel = require('../models/template');
const DatasetModel = require('../models/dataset');
const RecordModel = require('../models/record');

exports.template = async function(req, res, next) {
  try {
    let new_uuid = await TemplateModel.importTemplate(req.body, req.cookies.user);
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
    let record_uuids = await RecordModel.importDatasetsAndRecords(data.records, req.cookies.user);
    res.send({record_uuids});
  } catch(err) {
    next(err);
  }
}


// exports.template_with_dataset = async function(req, res, next) {
//   try {
//     let template_uuid = await TemplateModel.importTemplate(req.body, req.cookies.user);
//     let dataset_uuid = await DatasetModel.createDatasetForTemplate(template.uuid, req.cookies.user);
//     res.send({template_uuid, dataset_uuid});
//   } catch(err) {
//     next(err);
//   }
// }

exports.records = async function(req, res, next) {
  try {
    let data = req.body;
    if(!data || !data.records) {
      throw new InputError(`Must submit an object with property records`)
    }
    let record_uuids = await RecordModel.importRecords(data.records, req.cookies.user);
    res.send({record_uuids});
  } catch(err) {
    next(err);
  }
}
