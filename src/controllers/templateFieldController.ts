import { DocumentControllerInterface } from "./docmentControllerInterface";

const TemplateFieldModel = require('../models/template_field');
var Util = require('../lib/util');
const PermissionModel = require('../models/permission');

class TemplateFieldController implements DocumentControllerInterface {

  async create(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateFieldModel.model(state);
      let inserted_uuid = await model_instance.create(req.body);
      res.redirect(303, `/template_field/${inserted_uuid}/draft`)
    } catch(err) {
      next(err);
    }
  };

  async update(req, res, next) {
    try {
      if(!Util.objectContainsUUID(req.body, req.params.uuid)) {
        throw new Util.InputError(`UUID provided and the body uuid do not match.`)
      }
      let state = Util.initializeState(req);
      let model_instance = new TemplateFieldModel.model(state);
      await model_instance.update(req.body);
      res.sendStatus(200);
    } catch(err) {
      next(err);
    }
  }

  async draft(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateFieldModel.model(state);
      let template_field = await model_instance.draftGet(req.params.uuid);
      if(template_field) {
        res.json(template_field);
      } else {
        throw new Util.NotFoundError();
      }
    } catch(err) {
      next(err);
    }
  }

  async deleteDraft(req, res, next) {
    try {
      let uuid = req.params.uuid;
      let state = Util.initializeState(req);
      let model_instance = new TemplateFieldModel.model(state);
      const callback = async () => {
        await model_instance.draftDelete(uuid);
        if( !(await model_instance.shallowLatestPersisted(uuid)) ) {
          await (new PermissionModel.model(state)).documentDeletePermissions(uuid);
        }
      }
      await Util.executeWithTransaction(model_instance.state, callback);
  
    } catch(err) {
      return next(err);
    }
    res.sendStatus(200);
  }

  async lastUpdate(req, res, next) {
    var last_update;
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateFieldModel.model(state);
      last_update = await model_instance.lastUpdate(req.params.uuid);
    } catch(err) {
      return next(err);
    }
    res.send(last_update);
  }

  async persist(req, res, next) {
    try {
      if(!Util.isDateValid(req.body.last_update)) {
        throw new Util.InputError(`last_update provided as parameter is not in valid date format: ${req.body.last_update}`);
      } 
      let state = Util.initializeState(req);
      let model_instance = new TemplateFieldModel.model(state);
      await model_instance.persist(req.params.uuid, new Date(req.body.last_update));
      res.sendStatus(200);
    } catch(err) {
      next(err);
    }  
  }

  async latestPersisted(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateFieldModel.model(state);
      let template_field = await model_instance.latestPersisted(req.params.uuid);
      if(!template_field) {
        throw new Util.NotFoundError();
      }
      res.json(template_field);
    } catch(err) {
      next(err);
    }
  }
  
  async persistedBeforeTimestamp(req, res, next) {
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateFieldModel.model(state);
      let template_field = await model_instance.latestPersistedBeforeDate(req.params.uuid, new Date(req.params.timestamp));
      if(!template_field) {
        throw new Util.NotFoundError();
      }
      res.json(template_field);
    } catch(err) {
      next(err);
    }
  }

  async draftExisting(req, res, next) {
    var exists;
    try {
      let state = Util.initializeState(req);
      let model_instance = new TemplateFieldModel.model(state);
      exists = await model_instance.draftExisting(req.params.uuid);
    } catch(err) {
      return next(err);
    }
    res.send(exists);
  }
  
  async allPublicFields(req, res, next) {
    try {
      let datasets = await new TemplateFieldModel.model({}).latestPublicDocuments();
      res.send(datasets);
    } catch(err) {
      next(err);
    }
  }

}

const templateFieldController = new TemplateFieldController();

export {templateFieldController};