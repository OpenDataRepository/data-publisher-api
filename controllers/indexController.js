const TemplateModel = require('../models/template');
const ObjectId = require('mongodb').ObjectId;

var Template;

exports.init = function() {
  Template = TemplateModel();
}

exports.template_get = async function(req, res, next) {
  try {
    let query = {_id: new ObjectId(req.params.id)};
    let template = await Template.findOne(query);
    res.json({template});
  } catch(err) {
    return next(err);
  }
}