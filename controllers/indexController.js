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