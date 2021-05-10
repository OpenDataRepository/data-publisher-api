var debug        = require('debug')('setup');
const env = process.env.NODE_ENV || 'production';
const config = require(__dirname + '/../config/config.json')[env];
const User = require('../models/user_model');
const moment = require('moment');
const jwt = require('jsonwebtoken');
const passport = require('passport');
require('../config/config.passport');
const request = require('superagent');


/**
 *
 * @param req
 * @param res
 * @returns {*|Request|void}
 */
exports.me = function (req, res) {
  debug('ME function');
  return res.status(200).send({'me': 'nate'})
};

/**
 *
 * @param req
 * @param res
 * @returns {*|Request|void}
 */
exports.loginUser = function (req, res) {
  debug('currentUser function');
  return res.status(200).send({'logged in': 'true'})
};

/**
 *
 * @param req
 * @param res
 * @returns {Promise<*|Request|void>}
 */
exports.apiTest = async function (req, res) {

  try {
    // console.log(req.get('Authorization'));
    console.log('API TEST USER:: ');
    console.log(req.user);

    return res.status(200).send({'logged_in': 'true'})
  } catch (err) {
    return res.status(500).send(err)
  }

};

/**
 *
 * @param req
 * @param res
 * @returns {Promise<*|Request|void>}
 */
exports.processAuthCode = async function (req, res) {

  try {
    debug('Processing Auth Code')
    const clientID = config.passport.clientID;
    const clientSecret = config.passport.clientSecret;
    const credential = Buffer.from(clientID + ':' + clientSecret).toString('base64');

    debug('currentUser function');
    let user_token_response = await request.post(config.passport.tokenURL)
      .set('Authorization', 'Basic ' + credential)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json')
      .send({
        'grant_type': 'authorization_code',
        'code': req.query.code,
        'redirect_uri': config.passport.callbackURL
      });

    let token_data = JSON.parse(user_token_response.text);

    let user_response = await request.get(config.passport.oauthBaseURL + '/oauth/me')
      .query('access_token=' + token_data.access_token);

    // Set token for user from app
    let user_info = JSON.parse(user_response.text);
    user_info.token = token_data;

    debug('User Info Created');
    // debug(user_info);

    // Create JWT using wordpress id and name
    const body = { _id :user_info.id, email : user_info.user_email };
    debug(body);

    let options = {
      'expiresIn': '24hr',
      'audience': config.jwt_opts.audience,
      'issuer': config.jwt_opts.issuer,
    };
    const adet_token = jwt.sign({ user : body }, config.jwt_opts.secretOrKey, options);
    debug(env + ' == ' + adet_token);

    // Create user
    let user = new User();
    user.last_login = moment().utc().toISOString();
    user.wordpress.id = user_info.id;
    user.wordpress.token = user_info.token;
    user.wordpress.user_login = user_info.user_login;
    user.wordpress.full_name = user_info.user_nicename;
    user.wordpress.display_name = user_info.display_name;
    user.wordpress.user_status = user_info.user_status;
    user.wordpress.user_email = user_info.user_email;
    user.wordpress.user_registered = user_info.user_registered;
    user.wordpress.adet_token = adet_token;

    await user.save();

    const apiUserInfo = Buffer.from(JSON.stringify(user)).toString('base64');
    // Redirect to Ionic for Token Storage

    // defaults to 302 Found
    res.redirect(config.passport.platformURL + '?apiUserInfo=' + apiUserInfo);
    // Use for development
    // res.redirect('http://localhost:8101?apiUserInfo=' + apiUserInfo);

    //return res.status(200).send(user);

  } catch (err) {
    debug('We got an error...' + err);
    return res.status(500).send(err)
  }

};
