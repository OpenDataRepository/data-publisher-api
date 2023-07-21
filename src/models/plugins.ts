import { ObjectId } from 'mongodb';
const MongoDB = require('../lib/mongoDB');
import * as Util from '../lib/util';
import { AbstractDocument } from './abstract_document';
import { PermissionTypes, model as PermissionsModel } from "./permission";
const TemplateModel = require('./template');
const DatasetModel = require('./dataset');

const Schema = Object.freeze({
  bsonType: "object",
  required: [ "_id", "reference_id", "field_plugins", "object_plugins" ],
  properties: {
    _id: {
      bsonType: "objectId",
      description: "auto generated unique id by mongo for this document"
    },
    reference_id: {
      bsonType: "objectId",
      description: "the _id of the template / dataset for which this document specifies plugins"
    },
    field_plugins: {
      bsonType: "object",
      description: "the plugins specified for each field of this template/dataset",
      // Object has following form: 
      // {
      //   "field_uuid": {
      //     "plugin_name": plugin_version (number),
      //     ...
      //   },
      //   ...
      // }
      uniqueItems: true,
      items: {
        bsonType: "object"
      }
    },
    object_plugins: {
      bsonType: "object",
      description: "the plugins specified for this template/dataset",
      // Object has following form: 
      // {
      //   "plugin_name": plugin_version (number),
      //   ...
      // }
      uniqueItems: true,
      items: {
        bsonType: "object"
      }
    },
    related_documents: {
      bsonType: "array",
      description: "link to related documents so all plugins can be fetched at once",
      uniqueItems: true,
      items: {
        bsonType: "objectId"
      }
    },
    subscribed_documents: {
      bsonType: "array",
      description: "link to subscribed documents so all plugins can be fetched at once",
      uniqueItems: true,
      items: {
        bsonType: "objectId"
      }
    }
  },
  additionalProperties: false
});

var Plugins;

// Returns a reference to the template Mongo Collection
async function collection() {
  if (Plugins === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('plugins', {validator: { $jsonSchema: Schema} });
      await db.collection('plugins').createIndex({ uuid: 1 });
    } catch(e) {
      db.command({collMod:'plugins', validator: { $jsonSchema: Schema }});
    }
    Plugins = db.collection('plugins');
  }
  return Plugins;
}

async function init() {
  Plugins = await collection();
}

function collectionExport() {
  return Plugins;
}

class Model extends AbstractDocument{
  permission_model: any;
  template_model: any;
  dataset_model: any;
  reference_info: Record<string, any>;

  constructor(public state){
    super();
    this.state = state;
    this.collection = Plugins;
    this.permission_model = new PermissionsModel(state);
    this.template_model = new TemplateModel.model(state);
    this.dataset_model = new DatasetModel.model(state);
    this.reference_info = {};
  }

  async #shallowDraftByReferenceId(reference_id: ObjectId): Promise<Record<string, any> | null> {
    let cursor = await this.collection.find(
      {reference_id}, 
      {session: this.state?.session}
    );
  
    if(!(await cursor.hasNext())) {
      return null;
    } 
    let draft = await cursor.next();
    return draft;
  }

  // Attempt 1

  #recursiveBuildPersistedQuery(current_pipeline: Record<string, any>[], count: number): void {
    if(count >= 5) {
      return;
    }
    count += 1;

    let pipeline_related_templates_addon = {
      '$lookup': {
        'from': "plugins",
        'let': { 'ids': "$related_documents"},
        'pipeline': [
          { 
            '$match': { 
              '$expr': { 
                '$and': [
                  { '$in': [ "$reference_id",  "$$ids" ] },
                ]
              }
            }
          }
        ],
        'as': "related_documents"
      }
    };

    current_pipeline.push(pipeline_related_templates_addon);
    this.#recursiveBuildPersistedQuery(pipeline_related_templates_addon['$lookup']['pipeline'], count);

  }

  // Recursively fetches the plugins with the specified match conditions
  async #persistedWithJoins(pipelineMatchConditions: Record<string, any>): Promise<Record<string, any> | null> {
    // Construct a mongodb aggregation pipeline that will recurse into related templates up to 5 levels deep.
    // Thus, the tree will have a depth of 6 nodes
    let pipeline = [
      {
        '$match': pipelineMatchConditions
      },
      {
        '$limit' : 1
      }
    ]

    this.#recursiveBuildPersistedQuery(pipeline, 0);

    let session = this.state.session;
    let response = await Plugins.aggregate(pipeline, {session});
    if (await response.hasNext()){
      return await response.next();
    } else {
      return null;
    }
  }


  async #filterPersistedTemplateForPermissions(template: Record<string, any>): Promise<void> {
    // if(!(await this.hasViewPermissionToPersisted(template.uuid))) {
    //   throw new Util.PermissionDeniedError(`Do not have view access to template ${template.uuid}`);
    // }
    // await this.#filterPersistedTemplateForPermissionsRecursor(template);
  }

  // TODO: I'm assuming that the front-end is drafts, but I'm treating it as persisted
  async persistedVersion(_id: ObjectId): Promise<Record<string, any> | null> {
    let pipelineMatchConditions = { 
      _id,
      'persist_date': {'$lte': new Date()}
    };

    let template =  await this.#persistedWithJoins(pipelineMatchConditions);
    if(!template) {
      return null;
    }
    await this.#filterPersistedTemplateForPermissions(template);
    return template;
  } 

  // Attempt 2

  // TODO: I don't like this design, of fetching the plugins separately and then merging them. It only saves time if there is a single monbodb call, and there isn't
  // Wouldn't it make more sense to do this from the template / dataset controller?
  // The api can have an options object with {plugins: true/false} (default false)
  // Then, this plugins model can append the settings to a template/dataset object that has already been fetched. No fetching plugins directly! Just have the setting
  // Also, that allows for the option to fetch in a single call if it is persisted AND permissions are already handled.
  async #draftFetch(reference_id: ObjectId): Promise<Record<string, any> | null> {

    // Return null if plugin doesn't exist
    let plugin_object = await this.#shallowDraftByReferenceId(reference_id);
    if (!plugin_object) {
      return null;
    }

    let reference_uuid = await this.reference_info.model.uuidFor_id(reference_id);

    // Make sure this user has permission to be working with drafts
    if (!(await this.permission_model.hasExplicitPermission(reference_uuid, PermissionTypes.view))) {
      throw new Util.PermissionDeniedError(`You don't have view permissions required to view plugins for _id ${reference_id}`);
    }

    // Now recurse into each related_document, replacing each _id with an imbedded object
    let related_documents: Record<string, any>[] = [];
    for(let related_id of plugin_object.related_documents) {
      let related_document;
      try {
        // First try to get the draft of the related_document
        related_document = await this.#draftFetch(related_id);
      } catch (err) {
        if (err instanceof Util.PermissionDeniedError) {
          // If we don't have permission, show no_permissions
          related_document = {reference_id: related_id, no_permissions: true};
        } else {
          throw err;
        }
      }
      
      related_documents.push(related_document);
    }

    // Now recurse into each subscribed_document, replacing each _id with an imbedded object
    let subscribed_documents: Record<string, any>[] = [];
    for(let subscribed_id of plugin_object.subscribed_documents) {
      let subscribed_document;
      try {
        // First try to get the draft of the related_document
        subscribed_document = await this.#draftFetch(subscribed_id);
      } catch (err) {
        if (err instanceof Util.PermissionDeniedError) {
          // If we don't have permission, show no_permissions
          subscribed_document = {reference_id: subscribed_id, no_permissions: true};
        } else {
          throw err;
        }
      }
      subscribed_documents.push(subscribed_document);
    }

    
    plugin_object.related_documents = related_documents;
    plugin_object.subscribed_documents = subscribed_documents;
    
    return plugin_object;

  }

  async get(reference_id: ObjectId): Promise<Record<string, any> | null> {
    this.setDocType(reference_id);
    return this.#draftFetch(reference_id);
  } 

  async setDocType(reference_id: ObjectId) {
    if(!!this.template_model.fetchBy_id(reference_id)) {
      this.reference_info.doc_type = "template";
      this.reference_info.model = this.template_model;
    } else if (!!this.dataset_model.fetchBy_id(reference_id)) {
      this.reference_info.doc_type = "dataset";
      this.reference_info.model = this.dataset_model;
    } else {
      throw new Util.InputError("No template nor dataset exists with _id " + reference_id);
    }
  }

  // Attempt 3

  // Dataset and template

  async appendPlugins(object: Record<string, any>) {
    if(object.no_permissions) {
      return;
    }
    let plugin_object = await this.#shallowDraftByReferenceId(object._id);
    if (plugin_object) {
      object.plugins = {field_plugins: plugin_object.field_plugins, object_plugins: plugin_object.object_plugins}
    }
    if(object.related_templates) {
      for(let related_template of object.related_templates) {
        await this.appendPlugins(related_template);
      }
    }
    if(object.subscribed_templates) {
      for(let subscribed_template of object.subscribed_templates) {
        await this.appendPlugins(subscribed_template);
      }
    }
    if(object.related_datasets) {
      for(let related_dataset of object.related_datasets) {
        await this.appendPlugins(related_dataset);
      }
    }
  }

  async #recursiveModifyPlugins(object: Record<string, any>) {
    const edit_permission = !object.uuid || await this.permission_model.hasExplicitPermission(object.uuid, PermissionTypes.edit);
    if(edit_permission) {
      if(object.related_templates) {
        for(let related_template of object.related_templates) {
          await this.#recursiveModifyPlugins(related_template);
        }
      }
      if(object.related_datasets) {
        for(let related_dataset of object.related_datasets) {
          await this.#recursiveModifyPlugins(related_dataset);
        }
      }
    }
    if(!object.plugins) {
      return;
    }
    if(!object.uuid) {
      throw new Util.InputError('Plugins are only supported on object updates, not on the initial object creation.');
    }
    if(!edit_permission){
      return;
    }
    if(!object._id) {
      object._id = await this.#get_idForUuid(object.uuid);
      if(!object._id) {console.log(object);
        throw new Error('Impossible. Update plugin called for template/dataset without an _id and without a draft');
      }
    }
    let reference_id = Util.convertToMongoId(object._id);
    let session = this.state.session;
    let response = await Plugins.updateOne(
      {reference_id }, 
      {$set: {
        reference_id, 
        field_plugins: object.plugins.field_plugins, 
        object_plugins: object.plugins.object_plugins
      }}, 
      {'upsert': true, session}
    );
    if (response.upsertedCount != 1 && response.matchedCount != 1) {
      throw new Error(`Plugins.#recursiveModifyPlugins: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
    } 
  }

  async modifyPlugins(object: Record<string, any>) {
    let callback = async () => {
      return await this.#recursiveModifyPlugins(object);
    };
    return await this.executeWithTransaction(callback);
  }

  async #get_idForUuid(uuid: string) {
    let template = await this.template_model.shallowLatestDocument(uuid);
    if(template) {
      return template._id;
    }
    let dataset = await this.dataset_model.shallowLatestDocument(uuid);
    if(dataset) {
      return dataset._id;
    }
    return null;
  }

  // Record

  async appendPluginsToRecord(record: Record<string, any>) {
    if(record.no_permissions) {
      return;
    }
    let corresponding_dataset: Record<string, any> = {};
    let dataset_id;
    if(record.dataset_id) {
      dataset_id = record.dataset_id;
      corresponding_dataset = await this.dataset_model.fetchBy_id(dataset_id);
    } else {
      corresponding_dataset = await this.dataset_model.shallowLatestPersisted(record.dataset_uuid);
      dataset_id = corresponding_dataset._id;
    }
    let template_id = corresponding_dataset.template_id;
    let dataset_plugins = await this.#shallowDraftByReferenceId(dataset_id);
    let template_plugins = await this.#shallowDraftByReferenceId(template_id);

    if(dataset_plugins == null) {
      dataset_plugins = {object_plugins: {}, field_plugins: {}};
    }
    if(template_plugins == null) {
      template_plugins = {object_plugins: {}, field_plugins: {}};
    }

    record.plugins = this.#joinPlugins(template_plugins.object_plugins, dataset_plugins.object_plugins);

    for(let field of record.fields) {
      field.plugins = this.#joinFieldPlugins(template_plugins.field_plugins[field.uuid], dataset_plugins.field_plugins[field.uuid]);
    }

    for(let related_record of record.related_records) {
      await this.appendPluginsToRecord(related_record);
    }
  }

  #joinPlugins(template_plugins, dataset_plugins) {
    let plugins: any = {};
    let keys = Object.keys({...template_plugins, ...dataset_plugins})

    for(let key of keys) {
      if(key in dataset_plugins) {
        let value = dataset_plugins[key];
        if(value == 'deleted') {
          delete plugins[key];
        } else {
          plugins[key] = value;
        }
      } else if(key in template_plugins) {
        plugins[key] = template_plugins[key];
      }
    }
    return plugins;
  }

  #joinFieldPlugins(template_plugins, dataset_plugins) {
    if(!template_plugins && !dataset_plugins) {
      return {};
    }
    if(!template_plugins) {
      return dataset_plugins;
    }
    if(!dataset_plugins) {
      return template_plugins;
    }
    return this.#joinPlugins(template_plugins, dataset_plugins);
  }

}

export {
  init,
  collectionExport as collection,
  Model as model
};