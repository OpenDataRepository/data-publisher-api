const MongoDB = require('../lib/mongoDB');
const SharedFunctions = require('./shared_functions');
const Util = require('../lib/util');

const Schema = Object.freeze({
  bsonType: "object",
  required: [ "_id", "email", "password", "confirmed" ],
  properties: {
    _id: {
      bsonType: "objectId"
    },
    email: {
      bsonType: "string",
      description: "user email. Also functions as the user login credential"
      // uuid should be in a valid uuid format as well
    },
    first_name: {
      bsonType: "string"
    },
    last_name: {
      bsonType: "string"
    },
    password: {
      bsonType: "string",
      description: "encrypted with hash"
    },
    confirmed: {
      bsonType: "bool",
      description: "indicated whether or not this email has been confirmed. If not, credentials are invalid"
    },
    replacement_email: {
      bsonType: "string",
      description: "requested replacement email which has yet to be confirmed"
      // string should be in valid email format
    },
    suspended: {
      bsonType: "bool"
    }
  },
  additionalProperties: false
});

var User;

async function collection() {
  if (User === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('users', {validator: { $jsonSchema: Schema} });
    } catch(e) {}
    User = db.collection('users');
  }
  return User;
}
exports.collection = function() {
  return User;
}

exports.init = async function() {
  User = await collection();
}

class Model {
  collection = User;

  constructor(state){
    this.state = state;
  }

  async create(email, password, confirmed) {
    let existing = await User.findOne({email});
    if(existing) {
      throw new Util.InputError('email already exists');
    }
    existing = await User.findOne({unconfirmed_email: email});
    if(existing) {
      throw new Util.InputError('email already exists');
    }
    let session = this.state.session
    let response = await User.insertOne(
      {email, password, confirmed},
      {session}
    );
    if (!response.acknowledged) {
      throw new Error(`User.create: Failed to insert user with email: ${email} and password: ${password}`);
    }
    return response.insertedId;
  }
  
  static async confirmEmail(user_id, email) {
    user_id = SharedFunctions.convertToMongoId(user_id);
  
    let current_user = await User.findOne({_id: user_id});
  
    let set_properties = {};
    let unset_properties = {};
    if(!current_user.confirmed) {
      if(email != current_user.email) {
        throw new Util.InputError(`Email being confirmed is not the latest email requested`);
      } 
      set_properties.confirmed = true;
    } else if(current_user.replacement_email) {
      if(email != current_user.replacement_email) {
        throw new Util.InputError(`Email being confirmed is not the latest email requested`);
      } 
      set_properties.email = email;
      unset_properties.replacement_email = "";
    } else {
      throw new Util.InputError(`Email does not need to be confirmed`);
    }
  
    let response = await User.updateOne(
      {_id: user_id},
      {
        $set: set_properties,
        $unset: unset_properties
      }
    );
    if(response.matchedCount != 1) {
      throw new Error(`User.confirmEmail: matched ${response.matchedCount} accounts with _id: ${user_id}`);
    }
  }
  static async getByEmail(email) {
    return await User.findOne(
      {email}
    );
  }
  
  static async getBy_id(_id) {
    _id = SharedFunctions.convertToMongoId(_id);
    return await User.findOne({_id});
  }
  
  static async suspend(_id) {
    _id = SharedFunctions.convertToMongoId(_id);
    let response = await User.updateOne(
      {_id},
      {
        $set: {suspended: true}
      }
    );
    if(response.matchedCount != 1) {
      throw new Error(`Updated: matched ${response.matchedCount} accounts with _id: ${_id}`);
    }
  }
  
  async update(_id, input_update_properties) {
    _id = SharedFunctions.convertToMongoId(_id);
    let filtered_update_properties = {};
    if(input_update_properties.first_name) {
      filtered_update_properties.first_name = input_update_properties.first_name;
    }
    if(input_update_properties.last_name) {
      filtered_update_properties.last_name = input_update_properties.last_name;
    }
    if(input_update_properties.password) {
      filtered_update_properties.password = input_update_properties.password;
    }
    if(input_update_properties.replacement_email) {
      filtered_update_properties.replacement_email = input_update_properties.replacement_email;
    }
    let session = this.state.session;
    let response = await User.updateOne(
      {_id},
      {
        $set: filtered_update_properties
      },
      {session}
    );
    if(response.matchedCount != 1) {
      throw new Error(`Updated: matched ${response.matchedCount} accounts with _id: ${_id}`);
    }
  }

};
exports.model = Model;