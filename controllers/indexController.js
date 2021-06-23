const TemplateModel = require('../models/template');
const ObjectId = require('mongodb').ObjectId;
const MongoDB = require('../lib/mongoDB');

var Template;

exports.init = function() {
  Template = TemplateModel.templateCollection();
}

exports.template_draft_get = async function(req, res, next) {
  try {
    // TODO: When permissions come into play, aggregate drafts for sub-templates/fields that the user has permission for,
    // and published templates for the ones they don't

    // TODO: After implementing publish, and after implementing latest publish get, implement this query such that it will fetch 
    // the last published template if no draft is to be found. 
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
    next(err);
  }
}

exports.template_get_latest_published = async function(req, res, next) {
  // TODO: 
  // 1. Handle custom errors InputError and NotFoundError in the error handler in app.js
  // 2. Convert the type errors everywhere in this code to using InputError and NotFoundError
  try {
    let template = await TemplateModel.latestPublishedTemplate(req.params.id);
    res.json(template);
  } catch(err) {
    next(err);
  }
}

exports.template_get_published_before_timestamp = async function(req, res, next) {
  try {
    let template = await TemplateModel.publishedTemplateBeforeDate(req.params.id, new Date(req.params.timestamp));
    res.json(template);
  } catch(err) {
    next(err);
  }
}

// TODO: move the transactions from create, update, publish to a Template Model call. They don't belong in the controller
// TODO: Also desperately need unit tests.
exports.template_create = async function(req, res, next) {
  const session = MongoDB.newSession();
  try {
    await session.withTransaction(async () => {
      try {
        await TemplateModel.validateAndCreateOrUpdateTemplate(req.body, session);
      } catch(err) {
        console.log('aborting transaction...');
        await session.abortTransaction();
        throw err;
      }
    });
    session.endSession();
    res.sendStatus(200);
  } catch(err) {
    session.endSession();
    if (err instanceof TypeError) {
      res.status(400).send({error: err.message})
    } else {
      next(err);
    }
  }
}

exports.template_update = async function(req, res, next) {
  const session = MongoDB.newSession();
  try {
    await session.withTransaction(async () => {
      try {
        await TemplateModel.validateAndCreateOrUpdateTemplate(req.body, session, req.params.id);
      } catch(err) {
        console.log('aborting transaction...');
        await session.abortTransaction();
        throw err;
      }
    });
    session.endSession();
    res.sendStatus(200);
  } catch(err) {
    session.endSession();
    if (err instanceof TypeError) {
      res.status(400).send({error: err.message})
    } else {
      next(err);
    }
  }
}

exports.template_publish = async function(req, res, next) {
  const session = MongoDB.newSession();
  try {
    var published;
    await session.withTransaction(async () => {
      try {
        [_, published] = await TemplateModel.publishTemplate(req.params.id, session);
      } catch(err) {
        console.log('aborting transaction...');
        await session.abortTransaction();
        throw err;
      }
    });
    session.endSession();
    if (published) {
      res.sendStatus(200);
    } else {
      res.status(400).send({error: 'No changes to publish'});
    }
  } catch(err) {
    session.endSession();
    if (err instanceof TypeError) {
      res.status(400).send({error: err.message})
    } else {
      next(err);
    }
  }
}