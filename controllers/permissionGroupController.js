const Model = require('../models/permission_group');
const Util = require('../lib/util');

// This endpoint exists only for the purpose of integration testing
exports.testing_initialize = async function(req, res, next) {
  try {
    await Model.initialize_permissions_for(req.cookies.user, req.params.uuid);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.update = async function(req, res, next) {
  try {
    if(!['admin', 'edit', 'view'].includes(req.params.category)) {
      throw new Util.NotFoundError();
    }
    // TODO: Implement users and sessions, and then get the current_user from the session instead of a cookie
    await Model.replace_permissions(req.cookies.user, req.params.uuid, req.params.category, req.body.users);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.get = async function(req, res, next) {
  try {
    let permissions = await Model.read_permissions(req.params.uuid, req.params.category);
    res.send(permissions);
  } catch(err) {
    next(err);
  }
}

// This endpoint exists only for the purpose of integration testing
exports.testing_has_permission = async function(req, res, next) {
  try {
    let result = await Model.has_permission(req.cookies.user, req.params.uuid, req.params.category);
    res.send(result);
  } catch(err) {
    next(err);
  }
}