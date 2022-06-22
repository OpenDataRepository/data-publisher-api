const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const Util = require('../lib/util');
const email_validator = require("email-validator");
const SharedFunctions = require('../models/shared_functions');
const User = require('../models/user');
const UserPermissions = require('../models/user_permissions');
const PassportImplementation = require('../lib/passport_implementation');
const { init } = require("passport/lib");

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
    let user_permissions_model_instance = new UserPermissions.model(state);
    const callback = async () => {
      let user_id = await user_model_instance.create(email, hashed_password, false);
      await user_permissions_model_instance.create(user_id);

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

      const url = "http://" + req.get('host') + "/user/confirm_email/" + email_token;

      if(!process.env.is_test) {
        await transporter.sendMail({
          to: email,
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
    res.sendStatus(200);
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

    res.status(200).json({ token: tokenObject.token, expiresIn: tokenObject.expires });

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
    throw new Util.InputError(`Must provide password to suspend account.`);
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

exports.getPermissions = async function(req, res, next) {
  try{
    let user;
    if(req.params.email) {
      user = await User.model.getByEmail(req.params.email);
    } else {
      user = req.user;
    }
    let user_permissions = await UserPermissions.model.get(user._id)
    res.send(user_permissions);
  } catch(err) {
    next(err);
  }
};

exports.testing_set_admin = async function(req, res, next) {
  try{
    await UserPermissions.model.setAdmin(req.user._id)
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};

exports.testing_set_super = async function(req, res, next) {
  try{
    await UserPermissions.model.setSuper(req.user._id)
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};