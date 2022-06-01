const MongoDB = require('../lib/mongoDB');
const SharedFunctions = require('./shared_functions');
const Util = require('../lib/util');

var User;

async function collection() {
  if (User === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('users');
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

exports.create = async function(email, password, confirmed, session) {
  let existing = await User.findOne({email});
  if(existing) {
    throw new Util.InputError('email already exists');
  }
  existing = await User.findOne({unconfirmed_email: email});
  if(existing) {
    throw new Util.InputError('email already exists');
  }
  let response = await User.insertOne(
    {email, password, confirmed},
    {session}
  );
  if (!response.acknowledged) {
    throw new Error(`User.create: Failed to insert user with email: ${email} and password: ${password}`);
  }
  return response.insertedId;
}

exports.confirmEmail = async function(user_id, email) {
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
exports.getByEmail = async function(email) {
  return await User.findOne(
    {email}
  );
}

exports.getBy_id = async function(_id) {
  _id = SharedFunctions.convertToMongoId(_id);
  return await User.findOne({_id});
}

exports.suspend = async function(_id) {
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

exports.update = async function(_id, input_update_properties, session) {
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
  let response = await User.updateOne(
    {_id},
    {
      $set: input_update_properties
    },
    {session}
  );
  if(response.matchedCount != 1) {
    throw new Error(`Updated: matched ${response.matchedCount} accounts with _id: ${_id}`);
  }
}