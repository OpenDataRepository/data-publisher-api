const TemplateModel = require('../models/template');
const ObjectId = require('mongodb').ObjectId;

var Template;

exports.init = function() {
  Template = TemplateModel.templateCollection();
}

exports.template_draft_get = async function(req, res, next) {
  try {
    // TODO: When permissions come into play, aggregate drafts for sub-templates/fields that the user has permission for,
    // and published templates for the ones they don't
    let pipeline = [
      {
        '$match': { 
          'uuid': req.params.id,
          'publish_date': {'$exists': false}
        }
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
                { 
                  '$and': 
                  [
                    {
                      '$expr':
                      { 
                        '$in': [ "$uuid",  "$$search_uuids" ] 
                      }
                    },
                    {
                      'publish_date': {'$exists': false}
                    }
                  ]
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
                        { 
                          '$and': 
                          [
                            {
                              '$expr':
                              { 
                                '$in': [ "$uuid",  "$$search_uuids" ] 
                              }
                            },
                            {
                              'publish_date': {'$exists': false}
                            }
                          ]
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
                                { 
                                  '$and': 
                                  [
                                    {
                                      '$expr':
                                      { 
                                        '$in': [ "$uuid",  "$$search_uuids" ] 
                                      }
                                    },
                                    {
                                      'publish_date': {'$exists': false}
                                    }
                                  ]
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
                                        { 
                                          '$and': 
                                          [
                                            {
                                              '$expr':
                                              { 
                                                '$in': [ "$uuid",  "$$search_uuids" ] 
                                              }
                                            },
                                            {
                                              'publish_date': {'$exists': false}
                                            }
                                          ]
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
                                                { 
                                                  '$and': 
                                                  [
                                                    {
                                                      '$expr':
                                                      { 
                                                        '$in': [ "$uuid",  "$$search_uuids" ] 
                                                      }
                                                    },
                                                    {
                                                      'publish_date': {'$exists': false}
                                                    }
                                                  ]
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

exports.template_publish = async function(req, res, next) {
  try {
    let response = await Template.find({"uuid": req.params.uuid, 'publish_date': {'$exists': false}});
    let count = response.count();
    if(!count) {
      res.status(400).send("There is no draft for a template with uuid " + req.params.uuid);
      return;
    } else if (count > 1) {
      console.error('indexController.template_publish: Multiple drafts found for template with uuid ' + req.params.uuid);
      res.sendStatus(500);
      return;
    }
    response = await Template.updateOne(
      {"uuid": req.params.uuid, 'publish_date': {'$exists': false}}, 
      {"$set": {"publish_date": new Date()}}
    );
    if (response.result.nModified === 1) {
      res.sendStatus(200);
    } else {
      console.error('indexController.template_publish: number of documents modified: ' + response.result.nModified);
      res.sendStatus(500);
    }
  } catch(err) {
    return next(err);
  }
  
}