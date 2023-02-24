const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const Util = require('../lib/util');
const email_validator = require("email-validator");
const SharedFunctions = require('../models/shared_functions');
const User = require('../models/user');
const PermissionsModel = require('../models/permission');
const PassportImplementation = require('../lib/passport_implementation');
const TemplateFieldModel = require('../models/template_field');
const TemplateModel = require('../models/template');
const DatasetModel = require('../models/dataset');
var ip = require("ip");
const { get_document_permissions } = require("./permissionController");

// TODO: this needs to be replaced with a real email eventually. 
// This email is from https://mailtrap.io/
const transporter = nodemailer.createTransport({
  host: 'smtp.mailtrap.io',
  port: 2525,
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
});

exports.register = async function(req, res, next) {
  try{
    // if(req.isAuthenticated()) {
    //   throw new Util.PermissionDeniedError(`Must be logged out to register a new account`);
    // }
    let email = req.body.email;
    if(!email_validator.validate(email)){
      throw new Util.InputError(`email is not in valid email format`);
    }
    let hashed_password = await bcrypt.hash(req.body.password, 10);

    let email_token;
    
    let state = Util.initializeState(req);
    let user_model_instance = new User.model(state);
    const callback = async () => {
      let user_id = await user_model_instance.create(email, hashed_password, false);

      // jwt.sign(
      //   {user_id},
      //   process.env.EMAIL_SECRET,
      //   {
      //     expiresIn: "1d"
      //   },
      //   (err, emailToken) => {
      //     const url = "http://" + req.get('host') + "/user/confirm_email/" + emailToken;
      //     if(err) {
      //       console.log(err);
      //     }
      //     transporter.sendMail({
      //       to: email,
      //       subject: "Confirm Email",
      //       html: `Please click this email to confirm your email: <a href="${url}">${url}</a>`
      //     })
      //   }
      // )

      email_token = jwt.sign(
        {user_id, email},
        process.env.EMAIL_SECRET,
        {expiresIn: '1h'}
      );

      // const url = "http://" + ip.address() + ':' + req.app.settings.port + "/account/confirm_email/" + email_token;

      // if(!process.env.is_test) {
      //   console.log(url);
      //   await transporter.sendMail({
      //     to: email,
      //     subject: 'Confirm Email',
      //     html: `Please click this link to confirm your email: <a href="${url}">${url}</a>`,
      //   });
      // }
      
    };
    await SharedFunctions.executeWithTransaction(state, callback);
    // if(process.env.is_test) {
      res.status(200).send({token: email_token});
    // } else {
    //   res.sendStatus(200);
    // }
  } catch(err) {
    next(err);
  }
};

exports.confirm_email = async function(req, res, next) {
  try {
    let payload = jwt.verify(req.params.token, process.env.EMAIL_SECRET);
    let user_id = payload.user_id;
    let email = payload.email;
    await User.model.confirmEmail(user_id, email);
    res.status(200).send({});
  } catch (err) {
    next(err);
  }
};

exports.login = async function(req, res, next) {
  try {
    let account = await User.model.getByEmail(req.body.email);
    if(!account) {
      throw new Util.InputError("email does not exist");
    }
                
    if(!(await bcrypt.compare(req.body.password, account.password))) {
      throw new Util.InputError("password incorrect");
    }

    if(account.suspended) {
      throw new Util.PermissionDeniedError(`Account is suspended`);
    }

    if(!account.confirmed) {
      throw new Util.PermissionDeniedError("confirm email before logging in");
    }
        
    const tokenObject = PassportImplementation.issueJWT(account._id);

    res.status(200).json({ token: tokenObject.token, expirationTime: tokenObject.expirationTime });

  } catch(err) {
    next(err);
  };
};

exports.get = async function(req, res, next) {
  try{
    let user;
    if(req.params.email) {
      user = await User.model.getByEmail(req.params.email);
    } else {
      user = req.user;
    }
    let filtered_user = {};
    filtered_user.first_name = user.first_name;
    filtered_user.last_name = user.last_name;
    filtered_user.email = user.email;
    res.send(filtered_user);
  } catch(err) {
    next(err);
  }
};

async function verifyPassword(input_password, actual_password) {
  if(!input_password) {
    throw new Util.InputError(`Verification password incorrect.`);
  }
  if(!(await bcrypt.compare(input_password, actual_password))) {
    throw new Util.InputError(`Password incorrect.`);
  }
}

exports.suspend = async function(req, res, next) {
  try{
    await verifyPassword(req.body.password, req.user.password);
    await User.model.suspend(req.user._id);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};

exports.suspend_other_user = async function(req, res, next) {
  try{
    let user = await User.model.getByEmail(req.params.email);
    if(!user) {
      throw new Util.InputError(`User with email ${req.params.email} does not exist`);
    }
    await User.model.suspend(user._id);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};

async function update(user_model_instance, body, user) {
  let input_update_properties = body;
  let filtered_update_properties = {};
  if(input_update_properties.new_password) {
    if(input_update_properties.new_password != input_update_properties.new_password_confirmation) {
      throw new Util.InputError(`new_password and new_password_confirmation must be identical`);
    }
    filtered_update_properties.password = await bcrypt.hash(input_update_properties.new_password, 10);
  }
  filtered_update_properties.first_name = input_update_properties.first_name;
  filtered_update_properties.last_name = input_update_properties.last_name;

  await user_model_instance.update(user._id, filtered_update_properties);
}

exports.update = async function(req, res, next) {
  try{
    await verifyPassword(req.body.verification_password, req.user.password);
    let user_model_instance = new User.model({});
    await update(user_model_instance, req.body, req.user);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};

exports.update_other_user = async function(req, res, next) {
  try{
    let user_model_instance = new User.model({});
    let user = await User.model.getByEmail(req.params.email);
    if(!user) {
      throw new Util.InputError(`User with email ${req.params.email} does not exist`);
    }
    await update(user_model_instance, req.body, user);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};

async function changeEmail(req, user_id, res) {
  let replacement_email = req.body.new_email;
  if(!replacement_email) {
    throw new Util.InputError(`New email blank.`);
  }
  let filtered_update_properties = {
    replacement_email
  };

  let email_token;

  let state = Util.initializeState(req);
  let user_model_instance = new User.model(state);

  const callback = async () => {
    await user_model_instance.update(user_id, filtered_update_properties);

    email_token = jwt.sign(
      {user_id, email: replacement_email},
      process.env.EMAIL_SECRET,
      {expiresIn: '1h'}
    );

    const url = "http://" + req.get('host') + "/user/confirm_email/" + email_token;

    if(!process.env.is_test) {
      await transporter.sendMail({
        to: replacement_email,
        subject: 'Confirm Email',
        html: `Please click this link to confirm your email: <a href="${url}">${url}</a>`,
      });
    }
  };
  await SharedFunctions.executeWithTransaction(state, callback);
  if(process.env.is_test) {
    res.status(200).send({token: email_token});
  } else {
    res.sendStatus(200);
  }
}

exports.change_email = async function(req, res, next) {
  try{
    await verifyPassword(req.body.verification_password, req.user.password);

    let user_id = req.user._id;

    await changeEmail(req, user_id, res);
  } catch(err) {
    next(err);
  }
};

exports.change_other_user_email = async function(req, res, next) {
  try{
    let user = await User.model.getByEmail(req.params.email);
    if(!user) {
      throw new Util.InputError(`User with email ${req.params.email} does not exist`);
    }

    await changeEmail(req, user._id, res);
  } catch(err) {
    next(err);
  }
};

async function getUserPermissions(user_id) {
  let state = {user_id};

  // Get a list of objects with uuids and permission levels
  let user_permissions = await (new PermissionsModel.model(state)).getUserPermissions();

  // Now we need to figure out which document type belongs to which permission type. 
  // Unfortunately we can only get this from the collections themselves, so this is pretty complicated. 
  // Strategy:
  // - Create a list of uuids from the objects
  // - Search each of the collections for which uuids they hold. Should result in a list of uuids per collection
  // - Create a dictionary of uuid -> object
  // - Using the dictionary, assign document types to each of the objects
  // - Go through the list of objects and construct the final object

  // Create a list of uuids from the objects
  let document_uuids = user_permissions.map(x => x.document_uuid);

  // - Search each of the collections for which uuids they hold. Should result in a list of uuids per collection
  let separated_document_uuids = {};
  separated_document_uuids[SharedFunctions.DocumentTypes.template_field] = await SharedFunctions.uuidsInThisCollection(TemplateFieldModel.collection(), document_uuids);
  separated_document_uuids[SharedFunctions.DocumentTypes.template] = await SharedFunctions.uuidsInThisCollection(TemplateModel.collection(), document_uuids);
  separated_document_uuids[SharedFunctions.DocumentTypes.dataset] = await SharedFunctions.uuidsInThisCollection(DatasetModel.collection(), document_uuids);

  // - Create a dictionary of uuid -> object
  let uuid_object_dict = {};
  for(let obj of user_permissions) {
    uuid_object_dict[obj.document_uuid] = obj;
  }

  // - Using the dictionary, assign document types to each of the objects
  for(let document_type in separated_document_uuids) {
    for(let uuid of separated_document_uuids[document_type]) {
      let obj = uuid_object_dict[uuid];
      obj.document_type = document_type;
    }
  }

  // - Go through the list of objects and construct the final object
  let result = {};
  for(let doc_type in SharedFunctions.DocumentTypes) {
    result[doc_type] = {};
    for(let permission_type in PermissionsModel.PermissionTypes) {
      result[doc_type][permission_type] = [];
    }
  }
  for(let obj of user_permissions) {
    result[obj.document_type][obj.permission_level].push(obj.document_uuid);
  }
  return result;
}

exports.getPermissions = async function(req, res, next) {
  try{
    let user;
    if(req.params.email) {
      user = await User.model.getByEmail(req.params.email);
    } else {
      user = req.user;
    }
    const result = await getUserPermissions(user._id);
    res.send(result);
  } catch(err) {
    next(err);
  }
};

exports.getDatasets = async function(req, res, next) {
  try{
    let user;
    if(req.params.email) {
      user = await User.model.getByEmail(req.params.email);
    } else {
      user = req.user;
    }
    const all_permissions = await getUserPermissions(user._id);
    const dataset_permissions_split = all_permissions[SharedFunctions.DocumentTypes.dataset];
    let dataset_uuid_list = [];
    for(let key in dataset_permissions_split) {
      dataset_uuid_list = dataset_uuid_list.concat(dataset_permissions_split[key]);
    }
    let datasets = await (new DatasetModel.model({})).latestShallowDatasetsForUuids(dataset_uuid_list);
    res.send(datasets);
  } catch(err) {
    next(err);
  }
};

exports.testing_set_admin = async function(req, res, next) {
  try{
    await User.model.setAdmin(req.user._id)
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};

exports.testing_set_super = async function(req, res, next) {
  try{
    await User.model.setSuper(req.user._id)
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};