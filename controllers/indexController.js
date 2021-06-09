const TemplateModel = require('../models/template');
const { v4: uuidv4 } = require('uuid');
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
  // TODO: sanitize input. Name and description should be of type string. Fields should be an array of ids, and each id
  // should be a reference to a real template_field. Same with related_fields
  let insert_template = {
    name: req.body.name,
    description: req.body.description,
    fields: req.body.fields,
    related_templates: req.body.related_templates,
    updated_at: new Date(),
    uuid: uuidv4()
  }


  try {
    let result = await Template.insertOne(insert_template);
    let uuid = result.ops[0].uuid;
    res.json({uuid});
  } catch(err) {
    return next(err);
  }
}

// function filter_template_input(input_template) {
//   let insert_template = {
//     name: req.body.name,
//     description: req.body.description,
//     fields: req.body.fields,
//     related_templates: req.body.related_templates,
//     updated_at: new Date(),
//     uuid: uuidv4()
//   }

//   if (input_template.name) {
//     insert_template.name = input_template.name
//   }
//   if (input_template.description) {
//     insert_template.name = input_template.name
//   }

// }