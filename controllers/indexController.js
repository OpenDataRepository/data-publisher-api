const TemplateModel = require('../models/template');
const { v4: uuidv4 } = require('uuid');
const ObjectId = require('mongodb').ObjectId;

var Template;

exports.init = function() {
  Template = TemplateModel.templateCollection();
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
      },
      {
        '$lookup':
          {
            'from': "templates",
            'let': { 'parents': "$related_templates"},
            'pipeline': [
              { '$match':
                  { '$expr':
                      { '$and':
                          [
                            { '$in': [ "$_id",  "$$parents" ] },
                          ]
                      }
                  }
              },
              {
                '$lookup':
                  {
                    'from': "template_fields",
                    'foreignField': "_id",
                    'localField': "fields",
                    'as': "fields"
                  },
              },
              {
                '$lookup':
                  {
                    'from': "templates",
                    'let': { 'parents': "$related_templates"},
                    'pipeline': [
                      { '$match':
                          { '$expr':
                              { '$and':
                                  [
                                    { '$in': [ "$_id",  "$$parents" ] },
                                  ]
                              }
                          }
                      },
                      {
                        '$lookup':
                          {
                            'from': "template_fields",
                            'foreignField': "_id",
                            'localField': "fields",
                            'as': "fields"
                          },
                      },
                      {
                        '$lookup':
                          {
                            'from': "templates",
                            'let': { 'parents': "$related_templates"},
                            'pipeline': [
                              { '$match':
                                  { '$expr':
                                      { '$and':
                                          [
                                            { '$in': [ "$_id",  "$$parents" ] },
                                          ]
                                      }
                                  }
                              },
                              {
                                '$lookup':
                                  {
                                    'from': "template_fields",
                                    'foreignField': "_id",
                                    'localField': "fields",
                                    'as': "fields"
                                  },
                              },
                              {
                                '$lookup':
                                  {
                                    'from': "templates",
                                    'let': { 'parents': "$related_templates"},
                                    'pipeline': [
                                      { '$match':
                                          { '$expr':
                                              { '$and':
                                                  [
                                                    { '$in': [ "$_id",  "$$parents" ] },
                                                  ]
                                              }
                                          }
                                      },
                                      {
                                        '$lookup':
                                          {
                                            'from': "template_fields",
                                            'foreignField': "_id",
                                            'localField': "fields",
                                            'as': "fields"
                                          },
                                      },
                                      {
                                        '$lookup':
                                          {
                                            'from': "templates",
                                            'let': { 'parents': "$related_templates"},
                                            'pipeline': [
                                              { '$match':
                                                  { '$expr':
                                                      { '$and':
                                                          [
                                                            { '$in': [ "$_id",  "$$parents" ] },
                                                          ]
                                                      }
                                                  }
                                              },
                                              {
                                                '$lookup':
                                                  {
                                                    'from': "template_fields",
                                                    'foreignField': "_id",
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
    insert_template = TemplateModel.createTemplate(req.body);
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