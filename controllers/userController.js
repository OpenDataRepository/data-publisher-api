const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const Util = require('../lib/util');
const email_validator = require("email-validator");
const SharedFunctions = require('../models/shared_functions');
const User = require('../models/user');
const UserPermissions = require('../models/user_permissions');
const PassportImplementation = require('../lib/passport_implementation');

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
    
    const callback = async (session) => {
      let user_id = await User.create(email, hashed_password, false, session);
      await UserPermissions.create(user_id, session);

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
        {expiresIn: '1d'}
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
    await SharedFunctions.executeWithTransaction(callback);
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
    await User.confirmEmail(user_id, email);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
};

exports.login = async function(req, res, next) {
  try {
    let account = await User.getByEmail(req.body.email);
    if(!account) {
      throw new Util.InputError("email does not exist");
    }
                
    if(!(await bcrypt.compare(req.body.password, account.password))) {
      throw new Util.InputError("password incorrect");
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

// TODO: at some point implement logout by creating a token blacklist
// exports.logout = function(req, res, next) {
//   req.logout();
//   res.sendStatus(200);
// };

exports.get = async function(req, res, next) {
  try{
    let user;
    if(req.params.email) {
      user = await User.getByEmail(req.params.email);
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

exports.delete = async function(req, res, next) {
  try{
    if(!req.body.password) {
      throw new Util.InputError(`Must provide password to delete account.`);
    }
    if(!(await bcrypt.compare(req.body.password, req.user.password))) {
      throw new Util.InputError(`Password incorrect.`);
    }
    await User.delete(req.user._id);
    // TODO: There is a problem if a user get's deleted. What happens to their resources?
    // req.logout();
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};

exports.update = async function(req, res, next) {
  try{
    if(!req.body.verification_password) {
      throw new Util.InputError(`Must provide verification password to update account.`);
    }
    if(!(await bcrypt.compare(req.body.verification_password, req.user.password))) {
      throw new Util.InputError(`Password incorrect.`);
    }

    let input_update_properties = req.body;
    let filtered_update_properties = {};
    if(input_update_properties.new_password) {
      if(input_update_properties.new_password != input_update_properties.new_password_confirmation) {
        throw new Util.InputError(`new_password and new_password_confirmation must be identical`);
      }
      filtered_update_properties.password = await bcrypt.hash(input_update_properties.new_password, 10);
    }
    filtered_update_properties.first_name = input_update_properties.first_name;
    filtered_update_properties.last_name = input_update_properties.last_name;

    await User.update(req.user._id, filtered_update_properties);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};

exports.change_email = async function(req, res, next) {
  try{
    if(!req.body.verification_password) {
      throw new Util.InputError(`Must provide verification password to change email.`);
    }
    if(!(await bcrypt.compare(req.body.verification_password, req.user.password))) {
      throw new Util.InputError(`Password incorrect.`);
    }

    let replacement_email = req.body.new_email;
    if(!replacement_email) {
      throw new Util.InputError(`New email blank.`);
    }
    let filtered_update_properties = {
      replacement_email
    };

    let user_id = req.user._id;

    let email_token;

    const callback = async (session) => {
      await User.update(user_id, filtered_update_properties, session);

      email_token = jwt.sign(
        {user_id, email: replacement_email},
        process.env.EMAIL_SECRET,
        {expiresIn: '1d'}
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
    await SharedFunctions.executeWithTransaction(callback);

    if(process.env.is_test) {
      res.status(200).send({token: email_token});
    } else {
      res.sendStatus(200);
    }
  } catch(err) {
    next(err);
  }
};

exports.getPermissions = async function(req, res, next) {
  try{
    let user = req.user;
    let user_permissions = await UserPermissions.get(user._id)
    res.send(user_permissions);
  } catch(err) {
    next(err);
  }
};

exports.testing_set_admin = async function(req, res, next) {
  try{
    await UserPermissions.setAdmin(req.user._id)
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};

exports.testing_set_super = async function(req, res, next) {
  try{
    await UserPermissions.setSuper(req.user._id)
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};