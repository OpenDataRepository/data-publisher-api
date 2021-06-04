const TemplateModel = require('../models/template');
const ObjectId = require('mongodb').ObjectId;

var Template;

exports.init = function() {
  Template = TemplateModel();
}

exports.template_get = async function(req, res, next) {
  try {
    let pipeline = [
      {
        '$match': { '_id': new ObjectId(req.params.id) }
      },
      {
        '$lookup':
          {
            'from': "template_fields",
            'foreignField': "_id",
            'localField': "fields",
            'as': "fields"
          }
      }
    ]
    let response = await Template.aggregate(pipeline);
    if (await response.hasNext()){
      let template = await response.next();
      res.json({template});
    } else {
      res.status(404).send('404 Resource Not Found')
    }
  } catch(err) {
    return next(err);
  }
}