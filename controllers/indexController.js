const TemplateModel = require('../models/template');
const ObjectId = require('mongodb').ObjectId;
const MongoDB = require('../lib/mongoDB');
const Util = require('../lib/util');

exports.template_draft_get = async function(req, res, next) {
  const session = MongoDB.newSession();
  try {
    var template
    await session.withTransaction(async () => {
      try {
        template = await TemplateModel.templateDraft(req.params.id);
      } catch(err) {
        console.log('aborting transaction...');
        await session.abortTransaction();
        throw err;
      }
    });
    if(template) {
      res.json(template);
    } else {
      throw new Util.NotFoundError();
    }
    session.endSession();
  } catch(err) {
    session.endSession();
    next(err);
  }
}

exports.template_get_latest_published = async function(req, res, next) {
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

// TODO: move the transactions from all of the endpoints to the model. They don't belong in the controller
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
    next(err);
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
    next(err);
  }
}

// TODO: Publish should also take a timestamp of when the latest save to any portion of the template was,
// and this pubish function should recursively find the latest update and compare the sumbitted timestamp for equality
// TODO: After publishing, create new drafts of every template that embeds this one. Eventually this will need to be kicked off into a queue.
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
      throw new Util.InputError('No changes to publish');
    }
  } catch(err) {
    session.endSession();
    next(err);
  }
}

// TODO:
// Implement for save and publish, and draft fetch;
// If a draft has a reference to nothing we will not allow it to be saved or published. 
exports.template_draft_delete = async function(req, res, next) {
  try {
    await TemplateModel.templateDraftDelete(req.params.id);
  } catch(err) {
    next(err);
  }
  res.sendStatus(200);
}