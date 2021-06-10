const TemplateModel = require('../models/template');
const ObjectId = require('mongodb').ObjectId;

var Template;

exports.init = function() {
  Template = TemplateModel.templateCollection();
}

exports.template_get = async function(req, res, next) {
  try {
    let pipeline = [
      {
        '$match': { 'uuid': req.params.id }
      },
      {
        '$lookup':
          {
            'from': "template_fields",
            'foreignField': "uuid",
            'localField': "fields",
            'as': "fields"
          }
      },
      {
        '$lookup':
          {
            'from': "templates",
            'let': { 'search_uuids': "$related_templates"},
            'pipeline': [
              { '$match':
                  { '$expr':
                      { '$and':
                          [
                            { '$in': [ "$uuid",  "$$search_uuids" ] },
                          ]
                      }
                  }
              },
              {
                '$lookup':
                  {
                    'from': "template_fields",
                    'foreignField': "uuid",
                    'localField': "fields",
                    'as': "fields"
                  },
              },
              {
                '$lookup':
                  {
                    'from': "templates",
                    'let': { 'search_uuids': "$related_templates"},
                    'pipeline': [
                      { '$match':
                          { '$expr':
                              { '$and':
                                  [
                                    { '$in': [ "$uuid",  "$$search_uuids" ] },
                                  ]
                              }
                          }
                      },
                      {
                        '$lookup':
                          {
                            'from': "template_fields",
                            'foreignField': "uuid",
                            'localField': "fields",
                            'as': "fields"
                          },
                      },
                      {
                        '$lookup':
                          {
                            'from': "templates",
                            'let': { 'search_uuids': "$related_templates"},
                            'pipeline': [
                              { '$match':
                                  { '$expr':
                                      { '$and':
                                          [
                                            { '$in': [ "$uuid",  "$$search_uuids" ] },
                                          ]
                                      }
                                  }
                              },
                              {
                                '$lookup':
                                  {
                                    'from': "template_fields",
                                    'foreignField': "uuid",
                                    'localField': "fields",
                                    'as': "fields"
                                  },
                              },
                              {
                                '$lookup':
                                  {
                                    'from': "templates",
                                    'let': { 'search_uuids': "$related_templates"},
                                    'pipeline': [
                                      { '$match':
                                          { '$expr':
                                              { '$and':
                                                  [
                                                    { '$in': [ "$uuid",  "$$search_uuids" ] },
                                                  ]
                                              }
                                          }
                                      },
                                      {
                                        '$lookup':
                                          {
                                            'from': "template_fields",
                                            'foreignField': "uuid",
                                            'localField': "fields",
                                            'as': "fields"
                                          },
                                      },
                                      {
                                        '$lookup':
                                          {
                                            'from': "templates",
                                            'let': { 'search_uuids': "$related_templates"},
                                            'pipeline': [
                                              { '$match':
                                                  { '$expr':
                                                      { '$and':
                                                          [
                                                            { '$in': [ "$uuid",  "$$search_uuids" ] },
                                                          ]
                                                      }
                                                  }
                                              },
                                              {
                                                '$lookup':
                                                  {
                                                    'from': "template_fields",
                                                    'foreignField': "uuid",
                                                    'localField': "fields",
                                                    'as': "fields"
                                                  },
                                              },

                                            ],
                                            'as': "related_templates"
                                          }
                                      }
                                    ],
                                    'as': "related_templates"
                                  }
                              }
                            ],
                            'as': "related_templates"
                          }
                      }
                    ],
                    'as': "related_templates"
                  }
              }
            ],
            'as': "related_templates"
          }
      }
    ]
    let response = await Template.aggregate(pipeline);
    if (await response.hasNext()){
      let template = await response.next();
      res.json({template});
    } else {
      res.sendStatus(404);
    }
  } catch(err) {
    return next(err);
  }
}

exports.template_create = async function(req, res, next) {
  console.log('template create called')
  let insert_template;
  try {
    insert_template = await TemplateModel.newTemplate(req.body);
  } catch (err) {
    if (err instanceof TypeError) {
      res.status(400).send({error: err.message})
    } else {
      return next(err);
    }
  }

  try {
    let result = await Template.insertOne(insert_template);
    let uuid = result.ops[0].uuid;
    res.json({uuid});
  } catch(err) {
    return next(err);
  }
}