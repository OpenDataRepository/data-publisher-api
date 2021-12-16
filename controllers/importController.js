const TemplateModel = require('../models/template');

exports.template = async function(req, res, next) {
  try {
    let new_uuid = await TemplateModel.importTemplate(req.body, req.cookies.user);
    res.send({new_uuid});
  } catch(err) {
    next(err);
  }
}

