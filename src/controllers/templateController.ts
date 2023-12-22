import { DocumentControllerInterface } from "./docmentControllerInterface";

const TemplateModel = require('../models/template');
var Util = require('../lib/util');
const PermissionModel = require('../models/permission');

class TemplateController implements DocumentControllerInterface {

  async create(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateModel.model(state);
      let inserted_uuid = await model_instance.create(req.body);
      res.redirect(303, `/template/${inserted_uuid}/draft`);
    } catch(err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      if(!Util.objectContainsUUID(req.body, req.params.uuid)) {
        throw new Util.InputError(`UUID provided and the body uuid do not match.`)
      }
      let state = Util.initializeState(req);
      let model_instance = new TemplateModel.model(state);
      await model_instance.update(req.body);
      res.status(200).send({});
    } catch(err) {
      next(err);
    }
  }

  async draft(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateModel.model(state);
      let template = await model_instance.draftGet(req.params.uuid);
      if(!template) {
        throw new Util.NotFoundError();
      }
      res.json(template);
    } catch(err) {
      next(err);
    }
  }

  async deleteDraft(req, res, next) {
    try {
      let uuid = req.params.uuid;
      let state = Util.initializeState(req);
      let template_model_instance = new TemplateModel.model(state);
      await template_model_instance.draftDelete(uuid);
      res.status(200).send({});
    } catch(err) {
      return next(err);
    }
  }
  
  async lastUpdate(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateModel.model(state);
      let last_update = await model_instance.lastUpdate(req.params.uuid);
      res.send(last_update);
    } catch(err) {
      return next(err);
    }
  }

  async persist(req, res, next) {
    try {
      if(Util.isDateValid(req.body.last_update)) {
        let state = Util.initializeState(req);
        let model_instance = new TemplateModel.model(state);
        await model_instance.persist(req.params.uuid, new Date(req.body.last_update));
      } else {
        throw new Util.InputError(`last_update provided as parameter is not in valid date format: ${req.body.last_update}`);
      }
      res.status(200).send({});
    } catch(err) {
      next(err);
    }
  }

  async latestPersisted(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateModel.model(state);
      let template = await model_instance.latestPersisted(req.params.uuid);
      if(!template) {
        throw new Util.NotFoundError();
      }
      res.json(template);
    } catch(err) {
      next(err);
    }
  }

  async persistedBeforeTimestamp(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateModel.model(state);
      let template = await model_instance.latestPersistedBeforeTimestamp(req.params.uuid, new Date(req.params.timestamp));
      if(!template) {
        throw new Util.NotFoundError();
      }
      res.json(template);
    } catch(err) {
      next(err);
    }
  }

  async draftExisting(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateModel.model(state);
      let exists = await model_instance.draftExisting(req.params.uuid);
      res.send(exists);
    } catch(err) {
      return next(err);
    }
  }

  

  async version(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateModel.model(state);
      let template = await model_instance.getVersion(Util.convertToMongoId(req.params.id));
      if(!template) {
        throw new Util.NotFoundError();
      }
      res.json(template);
    } catch(err) {
      next(err);
    }
  }

  async persistedVersion(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateModel.model(state);
      let template = await model_instance.persistedVersion(Util.convertToMongoId(req.params.id));
      if(!template) {
        throw new Util.NotFoundError();
      }
      res.json(template);
    } catch(err) {
      next(err);
    }
  }

  async duplicate(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateModel.model(state);
      let new_uuid = await model_instance.duplicate(req.params.uuid);
      res.json({new_uuid});;
    } catch(err) {
      next(err);
    }
  }

}

const templateController = new TemplateController();

export {templateController};