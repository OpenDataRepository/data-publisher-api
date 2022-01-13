const { InputError } = require('../lib/util');
const TemplateModel = require('../models/template');

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
    let new_uuid = await RecordModel.importDatasetsAndRecords(data.records, req.cookies.user);
    res.send({new_uuid});
  } catch(err) {
    next(err);
  }
}

